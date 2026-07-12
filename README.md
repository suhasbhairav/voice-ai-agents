# Suhas Bhairav Realtime Voice AI Agents

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![OpenAI Agents SDK](https://img.shields.io/badge/OpenAI%20Agents%20SDK-Realtime-123c69)
![Made by Suhas Bhairav](https://img.shields.io/badge/Made%20by-Suhas%20Bhairav-blue)

A production-ready realtime voice AI agents template built with Next.js, React, the OpenAI Agents SDK, and the OpenAI Realtime API. It gives you a browser-based voice assistant with live audio, multi-agent handoffs, local tools, session history, and a secure ephemeral-token backend.

Created by [Suhas Bhairav](https://github.com/suhasbhairav).

## Features

- Realtime browser voice conversation powered by `gpt-realtime-2.1`
- `RealtimeAgent` and `RealtimeSession` setup from `@openai/agents/realtime`
- Browser WebRTC connection with microphone capture and audio playback
- Secure backend token route that creates short-lived Realtime client secrets
- Multi-agent handoffs between a host, implementation coach, product strategist, and support guide
- Live transcript rendered from SDK session history
- Mute microphone, interrupt audio, disconnect, and typed-message controls
- Local browser tool example with Zod parameters
- Responsive, polished voice-agent interface for template marketplace demos

## Tech Stack

- [Next.js 16](https://nextjs.org/)
- [React 19](https://react.dev/)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Zod](https://zod.dev/)

## Getting Started

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Add your OpenAI API key:

```bash
OPENAI_API_KEY=your_openai_api_key
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`, click `Start voice session`, and allow microphone access.

## OpenAI Realtime Model

This template uses:

```txt
gpt-realtime-2.1
```

The browser connects with an ephemeral `ek_...` client secret, not your server API key. The backend creates that client secret by calling:

```txt
POST /v1/realtime/client_secrets
```

Input transcription is configured with:

```txt
gpt-4o-mini-transcribe
```

Realtime output is configured for audio:

```js
outputModalities: ["audio"]
```

## API Route

The Realtime token route lives in:

```txt
app/api/realtime-token/route.js
```

The browser calls:

```txt
POST /api/realtime-token
```

Optional request body:

```json
{
  "model": "gpt-realtime-2.1",
  "voice": "marin"
}
```

The route returns:

```json
{
  "value": "ek_...",
  "expiresAt": 1234567890,
  "session": {
    "id": "sess_..."
  }
}
```

Core backend pattern:

```js
await fetch("https://api.openai.com/v1/realtime/client_secrets", {
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
});
```

## Voice Agent Setup

The main voice UI and agent configuration live in:

```txt
app/page.js
```

Core browser pattern:

```js
const hostAgent = new RealtimeAgent({
  name: "Realtime Voice Host",
  voice: "marin",
  instructions: "You are a realtime voice AI host...",
  handoffs: [implementationCoach, productStrategist, supportGuide],
});

const session = new RealtimeSession(hostAgent, {
  model: "gpt-realtime-2.1",
  config: {
    outputModalities: ["audio"],
    audio: {
      input: {
        transcription: {
          model: "gpt-4o-mini-transcribe",
        },
      },
    },
  },
});

await session.connect({ apiKey });
```

The project also includes a local browser tool example using `tool` and `zod`, so you can extend the voice agent with app-aware actions.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## References

- [OpenAI Agents SDK voice quickstart](https://openai.github.io/openai-agents-js/guides/voice-agents/quickstart/)
- [Build voice agents with the OpenAI Agents SDK](https://openai.github.io/openai-agents-js/guides/voice-agents/build/)

## Author

Made by [Suhas Bhairav](https://github.com/suhasbhairav).
