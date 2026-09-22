# rachg — Private Personal Workspace

A private personal workspace running on Cloudflare.

Repository: [https://github.com/iuhx/rachg](https://github.com/iuhx/rachg)

---

## 🏛️ System Architecture

```text
GitHub (https://github.com/iuhx/rachg)
      │
      ├──> Cloudflare Pages
      │       └──> apps/workspace (rachg.com — private workspace, static Astro + React)
      │
      └──> Cloudflare Workers (Autonomous edge APIs)
              └──> workers/file-service (Private file vault, R2 + D1)
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
│   ├── workspace/              # Private workspace control plane (rachg.com)
│   │   ├── src/                # React UI, Dashboard, Notes, Projects, Files
│   │   ├── public/             # Static assets
│   │   ├── astro.config.mjs    # Static Astro configuration (output: 'static')
│   │   └── package.json
│
├── workers/
│   ├── file-service/           # Private file transfer service
│   │   ├── wrangler.jsonc      # D1 & R2 bindings, 4GB quota limit
│   │   ├── schema.sql          # D1 metadata schema (files table)
│   │   ├── src/index.ts        # Worker API entry point
│   │   └── package.json
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
