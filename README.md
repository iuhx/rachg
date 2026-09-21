# rachg — Personal Digital Studio / Personal Operating System

A long-term personal digital studio running on Cloudflare.

Repository: [https://github.com/iuhx/rachg](https://github.com/iuhx/rachg)

---

## 🏛️ System Architecture

```text
GitHub (https://github.com/iuhx/rachg)
      │
      ├──> Cloudflare Pages
      │       ├──> apps/website   (rachg.com — Personal website & essays, static Astro)
      │       └──> apps/workspace (app.rachg.com — Studio OS control plane, static Astro + React)
      │
      └──> Cloudflare Workers (Autonomous edge APIs)
              ├──> workers/file-service (Temporary file sharing vault, R2 + D1)
              └──> workers/tool-service (Edge utilities & experiments)
```

- **Frontend**: Pure static Astro + React components, zero SSR overhead, hosted on Cloudflare Pages.
- **Backend**: Autonomous Cloudflare Workers microservices communicating over standard HTTPS.
- **Storage**:
  - **Cloudflare D1**: Lightweight structured metadata (files, expiration, counters).
  - **Cloudflare R2**: Isolated object storage (`transfers/` prefix isolation, 4GB cap).

---

## 📁 Repository Structure

```text
rachg/
├── apps/
│   ├── workspace/              # Personal workspace control plane (app.rachg.com)
│   │   ├── src/                # React UI, Studio Duo design, Dashboard, Notes, Tools, Files
│   │   ├── public/             # Static assets
│   │   ├── astro.config.mjs    # Static Astro configuration (output: 'static')
│   │   └── package.json
│   │
│   └── website/                # [Planned] Personal public home & writing (rachg.com)
│
├── workers/
│   ├── file-service/           # Temporary file transfer service
│   │   ├── wrangler.jsonc      # D1 & R2 bindings, 4GB quota limit
│   │   ├── schema.sql          # D1 metadata schema (files table)
│   │   ├── src/index.ts        # Worker API entry point
│   │   └── package.json
│   │
│   └── tool-service/           # [Placeholder] Tool registry & edge services
│
├── packages/
│   └── shared/                 # Shared TypeScript interfaces & API contracts
│       ├── src/types.ts
│       └── package.json
│
├── .gitignore
├── pnpm-workspace.yaml
└── package.json
```

---

## 🛠️ Local Development

### Prerequisites
- Node.js >= 22
- npm / pnpm

### Commands

```bash
# Start workspace frontend (http://localhost:4321)
npm run dev:workspace

# Build workspace static bundle
npm run build:workspace

# Run file-service Worker locally via Wrangler
npm run dev:file-service
```
