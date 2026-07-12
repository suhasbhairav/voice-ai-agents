export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_VOICE = "marin";

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) {
    return new Response("Missing OPENAI_API_KEY in the environment.", {
      status: 500,
    });
  }

  const body = await request.json().catch(() => ({}));
  const model =
    typeof body?.model === "string" && body.model.trim()
      ? body.model.trim()
      : DEFAULT_MODEL;
  const voice =
    typeof body?.voice === "string" && body.voice.trim()
      ? body.voice.trim()
      : DEFAULT_VOICE;

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        audio: {
          output: {
            voice,
          },
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Realtime client secret error:", details);
    return new Response("Could not create realtime client secret.", {
      status: response.status,
    });
  }

  const data = await response.json();

  return Response.json(
    {
      value: data.value,
      expiresAt: data.expires_at,
      session: data.session,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
