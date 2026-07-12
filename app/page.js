"use client";

import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";

const MODEL = "gpt-realtime-2.1";
const VOICE = "marin";

const statusCopy = {
  idle: "Ready",
  connecting: "Connecting",
  connected: "Live",
  speaking: "Speaking",
  error: "Needs attention",
};

function getItemText(item) {
  if (!item || item.type !== "message" || !Array.isArray(item.content)) {
    return "";
  }

  return item.content
    .map((part) => part.text || part.transcript || "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getItemLabel(item) {
  if (item?.role === "assistant") return "Voice Agent";
  if (item?.role === "user") return "You";
  return "System";
}

function createAgents() {
  const sessionSnapshotTool = tool({
    name: "get_session_snapshot",
    description:
      "Return lightweight browser context that helps answer timing or session-state questions.",
    parameters: z.object({
      reason: z
        .string()
        .describe("Why the assistant needs a session snapshot."),
    }),
    async execute({ reason }) {
      return JSON.stringify({
        reason,
        localTime: new Date().toLocaleString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
      });
    },
  });

  const implementationCoach = new RealtimeAgent({
    name: "Implementation Coach",
    handoffDescription:
      "Specialist for architecture, code, implementation plans, and debugging.",
    instructions:
      "You are an implementation-focused voice agent. Help the user turn ideas into concrete steps, code structure, and verification plans. Keep spoken answers concise and practical.",
    tools: [sessionSnapshotTool],
  });

  const productStrategist = new RealtimeAgent({
    name: "Product Strategist",
    handoffDescription:
      "Specialist for product framing, workflows, user journeys, and launch decisions.",
    instructions:
      "You are a product strategy voice agent. Clarify goals, identify users, and suggest focused product decisions. Keep spoken answers crisp and useful.",
    tools: [sessionSnapshotTool],
  });

  const supportGuide = new RealtimeAgent({
    name: "Support Guide",
    handoffDescription:
      "Specialist for troubleshooting, support scripts, and step-by-step resolution.",
    instructions:
      "You are a support voice agent. Ask only the essential diagnostic questions, then guide the user through clear next actions. Avoid long monologues.",
    tools: [sessionSnapshotTool],
  });

  const hostAgent = new RealtimeAgent({
    name: "Realtime Voice Host",
    voice: VOICE,
    instructions:
      "You are a real-time voice AI host for Suhas Bhairav's voice agents project. Start warmly, listen carefully, and answer in short spoken chunks. Route the user to the implementation coach, product strategist, or support guide when their request fits those specialists. If the user interrupts, stop and adapt.",
    handoffs: [implementationCoach, productStrategist, supportGuide],
    tools: [sessionSnapshotTool],
  });

  return {
    hostAgent,
    specialists: [implementationCoach, productStrategist, supportGuide],
  };
}

export default function Home() {
  const [status, setStatus] = useState("idle");
  const [activeAgent, setActiveAgent] = useState("Realtime Voice Host");
  const [history, setHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const sessionRef = useRef(null);

  const transcript = useMemo(
    () =>
      history
        .filter((item) => item.type === "message" && item.role !== "system")
        .map((item) => ({
          id: item.itemId,
          role: item.role,
          label: getItemLabel(item),
          text: getItemText(item),
          status: item.status,
        }))
        .filter((item) => item.text || item.status === "in_progress"),
    [history],
  );

  function addEvent(message) {
    setEvents((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      },
      ...current,
    ].slice(0, 8));
  }

  async function fetchEphemeralToken() {
    const response = await fetch("/api/realtime-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || "Could not create a realtime client token.");
    }

    const data = await response.json();

    if (!data.value) {
      throw new Error("The token endpoint did not return a client secret.");
    }

    return data.value;
  }

  async function startSession() {
    if (status === "connected" || status === "connecting") return;

    setError("");
    setStatus("connecting");
    addEvent("Requesting ephemeral Realtime token");

    try {
      const apiKey = await fetchEphemeralToken();
      const { hostAgent } = createAgents();
      const session = new RealtimeSession(hostAgent, {
        model: MODEL,
        config: {
          outputModalities: ["audio"],
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
              },
              turnDetection: {
                type: "server_vad",
                threshold: 0.55,
                silenceDurationMs: 650,
                interruptResponse: true,
                createResponse: true,
              },
            },
            output: {
              voice: VOICE,
            },
          },
        },
        workflowName: "voice-ai-agents",
        tracingDisabled: false,
      });

      session.on("history_updated", (nextHistory) => {
        setHistory([...nextHistory]);
      });

      session.on("agent_start", (_context, agent) => {
        setActiveAgent(agent.name);
        addEvent(`${agent.name} started responding`);
      });

      session.on("agent_handoff", (_context, fromAgent, toAgent) => {
        setActiveAgent(toAgent.name);
        addEvent(`Handoff: ${fromAgent.name} to ${toAgent.name}`);
      });

      session.on("agent_tool_start", (_context, agent, activeTool) => {
        addEvent(`${agent.name} called ${activeTool.name}`);
      });

      session.on("audio_start", (_context, agent) => {
        setStatus("speaking");
        setActiveAgent(agent.name);
      });

      session.on("audio_stopped", (_context, agent) => {
        setStatus("connected");
        setActiveAgent(agent.name);
      });

      session.on("audio_interrupted", () => {
        setStatus("connected");
        addEvent("Audio interrupted");
      });

      session.on("error", (sessionError) => {
        console.error("Realtime session error:", sessionError);
        setError("Realtime session error. Check the browser console and server logs.");
        setStatus("error");
      });

      sessionRef.current = session;
      setHasSession(true);
      await session.connect({ apiKey });

      setStatus("connected");
      setMuted(false);
      addEvent("Realtime voice session connected");

      session.sendMessage(
        "Greet me briefly and ask what I want to build with realtime voice agents.",
      );
    } catch (sessionError) {
      console.error("Could not start realtime session:", sessionError);
      setError(sessionError.message);
      setStatus("error");
      sessionRef.current?.close();
      sessionRef.current = null;
      setHasSession(false);
    }
  }

  function stopSession() {
    sessionRef.current?.close();
    sessionRef.current = null;
    setHasSession(false);
    setStatus("idle");
    setMuted(false);
    setActiveAgent("Realtime Voice Host");
    addEvent("Session disconnected");
  }

  function toggleMute() {
    const nextMuted = !muted;
    sessionRef.current?.mute(nextMuted);
    setMuted(nextMuted);
    addEvent(nextMuted ? "Microphone muted" : "Microphone unmuted");
  }

  function interrupt() {
    sessionRef.current?.interrupt();
    setStatus("connected");
    addEvent("Stop speaking requested");
  }

  function sendTextMessage(event) {
    event.preventDefault();
    const trimmed = textInput.trim();

    if (!trimmed || !sessionRef.current) return;

    sessionRef.current.sendMessage(trimmed);
    setTextInput("");
    addEvent("Text message sent");
  }

  const isLive = status === "connected" || status === "speaking";

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#101828]">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[22rem_1fr] lg:px-8">
        <aside className="flex flex-col rounded-[28px] border border-[#d6dee9] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#123c69] text-sm font-black text-white">
              VA
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#55708c]">
                OpenAI Agents SDK
              </p>
              <h1 className="text-2xl font-black tracking-[-0.045em]">
                Realtime Voice Agents
              </h1>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#dce5ee] bg-[#f8fafc] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#667085]">
                Status
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  isLive
                    ? "bg-[#d9f6e8] text-[#087443]"
                    : status === "error"
                      ? "bg-[#fee4e2] text-[#b42318]"
                      : "bg-[#e7edf5] text-[#344054]"
                }`}
              >
                {statusCopy[status]}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#667085]">
              Active agent:{" "}
              <span className="font-bold text-[#101828]">{activeAgent}</span>
            </p>
            <p className="mt-1 text-sm leading-6 text-[#667085]">
              Model: <span className="font-bold text-[#101828]">{MODEL}</span>
            </p>
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl border border-[#fecdca] bg-[#fff4f3] p-3 text-sm font-semibold leading-6 text-[#b42318]">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            {!isLive && status !== "speaking" ? (
              <button
                className="rounded-2xl bg-[#123c69] px-4 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#0f3158] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
                onClick={startSession}
                disabled={status === "connecting"}
                type="button"
              >
                {status === "connecting" ? "Connecting..." : "Start voice session"}
              </button>
            ) : (
              <button
                className="rounded-2xl bg-[#b42318] px-4 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#912018]"
                onClick={stopSession}
                type="button"
              >
                Disconnect
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                className="rounded-2xl border border-[#d6dee9] bg-white px-4 py-3 text-sm font-black text-[#344054] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
                onClick={toggleMute}
                disabled={!hasSession}
                type="button"
              >
                {muted ? "Unmute mic" : "Mute mic"}
              </button>
              <button
                className="rounded-2xl border border-[#d6dee9] bg-white px-4 py-3 text-sm font-black text-[#344054] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
                onClick={interrupt}
                disabled={!hasSession}
                type="button"
              >
                Stop talking
              </button>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#667085]">
              Agent network
            </p>
            <div className="mt-3 grid gap-2">
              {[
                "Realtime Voice Host",
                "Implementation Coach",
                "Product Strategist",
                "Support Guide",
              ].map((name) => (
                <div
                  key={name}
                  className={`rounded-2xl border px-3 py-3 text-sm font-bold ${
                    activeAgent === name
                      ? "border-[#123c69] bg-[#eef6ff] text-[#123c69]"
                      : "border-[#dce5ee] bg-[#fbfcfe] text-[#475467]"
                  }`}
                >
                  {name}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#667085]">
              Session events
            </p>
            <div className="mt-3 grid gap-2">
              {events.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[#d6dee9] p-3 text-sm text-[#667085]">
                  Events appear after you connect.
                </p>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-[#dce5ee] bg-[#fbfcfe] p-3 text-xs leading-5 text-[#475467]"
                  >
                    <span className="font-black text-[#101828]">{event.time}</span>{" "}
                    {event.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[28px] border border-[#d6dee9] bg-white shadow-sm">
          <div className="border-b border-[#e4eaf2] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#55708c]">
                  Live transcript
                </p>
                <h2 className="mt-1 text-3xl font-black tracking-[-0.045em]">
                  Speak naturally. Interrupt anytime.
                </h2>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#667085]">
                <span
                  className={`block size-2.5 rounded-full ${
                    status === "speaking"
                      ? "bg-[#12b76a]"
                      : isLive
                        ? "bg-[#2e90fa]"
                        : "bg-[#98a2b3]"
                  }`}
                />
                {status === "speaking"
                  ? "Agent audio playing"
                  : isLive
                    ? "Listening"
                    : "Not connected"}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-4 py-5 sm:px-6">
            {transcript.length === 0 ? (
              <div className="grid h-full min-h-[24rem] place-items-center rounded-3xl border border-dashed border-[#cbd5e1] bg-white p-8 text-center">
                <div>
                  <p className="text-2xl font-black tracking-[-0.035em]">
                    Start the session and allow microphone access.
                  </p>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#667085]">
                    The SDK uses WebRTC in the browser, captures your mic, plays
                    model audio, and updates this transcript as the Realtime
                    session history changes.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {transcript.map((item) => (
                  <article
                    key={item.id}
                    className={`flex ${
                      item.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ${
                        item.role === "user"
                          ? "bg-[#123c69] text-white"
                          : "border border-[#dce5ee] bg-white text-[#101828]"
                      }`}
                    >
                      <p
                        className={`text-[11px] font-black uppercase tracking-[0.14em] ${
                          item.role === "user"
                            ? "text-white/70"
                            : "text-[#667085]"
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {item.text || "Listening..."}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <form
            className="border-t border-[#e4eaf2] bg-white p-4 sm:p-5"
            onSubmit={sendTextMessage}
          >
            <div className="mx-auto flex max-w-3xl gap-3 rounded-3xl border border-[#d6dee9] bg-[#fbfcfe] p-2 shadow-sm focus-within:border-[#123c69]">
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-medium outline-none placeholder:text-[#98a2b3]"
                placeholder="Send a typed message into the live voice session..."
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                disabled={!hasSession}
              />
              <button
                className="rounded-2xl bg-[#123c69] px-5 py-3 text-sm font-black text-white transition hover:bg-[#0f3158] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
                disabled={!textInput.trim() || !hasSession}
                type="submit"
              >
                Send
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
