# Velo — Fast AI Chat

Fast, opinionated AI chat web app with streaming, many LLM providers, rich link embeds, web search, Python/graph execution, and Manim-style animation rendering.

## Features

- **Fast, opinionated AI chat** — Modern white/black theme with red accent (`#FF3B30`)
- **Two modes**: Chat and Coder (Coder gets a code-focused system prompt)
- **Streaming** — SSE token streaming from any OpenAI-compatible provider
- **Many LLM providers** — Groq (default), OpenRouter, OpenAI, Anthropic-compatible, and more
- **Rich link embeds** — YouTube, Spotify, SoundCloud, Twitch, Vimeo, Figma, Google Maps, direct images, generic OG cards
- **Web search** — DuckDuckGo lite with citations [1], [2]
- **Command palette** — ⌘K
- **Slash commands** — `/search`, `/clear`, `/export`, `/mode`, `/help`
- **Python execution** — In-browser via Pyodide (v0.26.0) with matplotlib graph rendering
- **Manim-style animations** — Custom shim renders animation scenes to animated GIF via matplotlib + Pillow
- **Python runner** — `pip install` not required; runs entirely in-browser
- **Export chat** — Download conversation as JSON
- **Latency/tok-s readout** — Streaming performance metrics
- **TTS per message** — Browser speech synthesis
- **PWA ready** — Installable web app manifest
- **Local-first** — Conversations stored in localStorage (no auth/DB required)
- **Free-tier only** — Default Groq key included

## Quick Start

```bash
# Clone the repo
git clone https://github.com/eldricksidney/velo.git
cd velo

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Open http://localhost:3000
```

### Environment

Create `apps/web/.env.local`:

```
GROQ_API_KEY=your_groq_api_key_here
```

The default Groq key is included for testing. Model must be `openai/gpt-oss-20b`.

## Project Structure

```
velo/
├── apps/
│   └── web/                    # Next.js 14 frontend
│       ├── app/
│       │   ├── api/
│       │   │   ├── chat/       # SSE chat endpoint
│       │   │   ├── search/     # DuckDuckGo scraper
│       │   │   └── link-preview/ # OpenGraph fetcher
│       │   ├── page.tsx        # Main UI (chat, sidebar, composer, Python runner)
│       │   ├── layout.tsx
│       │   ├── globals.css     # Theme + animations
│       │   └── manifest.json   # PWA manifest
│       ├── public/
│       │   ├── icon.svg        # App icon
│       │   ├── icon-192.png    # PWA icon
│       │   ├── icon-512.png
│       │   └── maskable-icon.png
│       ├── .env.local          # Groq API key (gitignored)
│       ├── next.config.js
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── core/                   # Shared providers & types
│       └── src/
│           └── providers.ts    # 18 LLM providers
├── public/
├── .github/
│   └── workflows/
│       └── ci.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Providers

Velo supports 18 OpenAI-compatible providers via `@velo/core`:

| Provider | Model | API Key Required |
|----------|-------|------------------|
| Groq | `openai/gpt-oss-20b` | Yes (default key included) |
| OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` | Yes |
| OpenAI | `gpt-4o-mini` | Yes |
| And 15 more | Various | Yes |
| Mock | Local mock | No |

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build (static export)
pnpm build
```

## Deployment

Velo is a static export (Next.js `output: 'export'`). Deploy to any static host:

- **Vercel**: `vercel --prod`
- **Netlify**: Drag `apps/web/out` or connect Git
- **Cloudflare Pages**: Connect Git repo
- **Docker**: See `Dockerfile` (coming soon)

## PWA Install

Velo is a PWA. On Chrome/Edge/Android: "Add to home screen". On iOS Safari: "Add to Home Screen".

## License

MIT

## Creator

**Velo · by Eldrick Sidney & Jeremy Kinoti**
