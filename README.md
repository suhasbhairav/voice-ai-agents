# Realtime Voice AI Agents

A real-time browser voice agents project built with Next.js and the OpenAI Agents SDK.

## What It Includes

- Realtime voice session with `RealtimeAgent` and `RealtimeSession`
- Browser WebRTC connection with automatic microphone capture and audio playback
- Server route that creates short-lived Realtime client secrets
- Multi-agent handoffs between a host, implementation coach, product strategist, and support guide
- Live transcript from the SDK session history
- Mute, interrupt, disconnect, and typed-message controls
- Local browser tool call example with Zod parameters

## Setup

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env.local
```

Add your OpenAI API key:

```bash
OPENAI_API_KEY=your_openai_api_key
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`, click `Start voice session`, and allow microphone access.

## How It Works

The browser never receives your server API key. It calls:

```txt
POST /api/realtime-token
```

That route calls OpenAI:

```txt
POST /v1/realtime/client_secrets
```

The returned `ek_...` client secret is passed into `session.connect({ apiKey })`.

The voice agent code lives in:

```txt
app/page.js
```

The token route lives in:

```txt
app/api/realtime-token/route.js
```

## References

- https://openai.github.io/openai-agents-js/guides/voice-agents/quickstart/
- https://openai.github.io/openai-agents-js/guides/voice-agents/build/
