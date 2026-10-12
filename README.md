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
  - **Cloudflare D1**: Structured workspace data (files, notes, mail and projects).
  - **Cloudflare R2**: Isolated object storage (`transfers/` prefix isolation, 4GB cap).

## Tools

The **Tools** tab contains a local QR generator, Markdown-to-text converter and
[batch image converter](docs/IMAGE-TOOLS.md) for PNG, JPEG, WebP, BMP and AVIF, with
HEIC/HEIF input support. Image conversion and ZIP downloads stay on your device.
Files has a one-click QR action; uploads from Tools use the same file list, quota,
expiry and deletion workflow. Existing files are reused without uploading again.

Text and Markdown conversion stay in the browser. Long text is uploaded only after
an explicit review and confirmation, then served as an escaped text page by the file
Worker. Share links retain Cloudflare Access protection; they are not public links.

See [Tools usage and release notes](docs/TOOLS.md) for workflows and limits.

## Projects

Create a project with just a name, then add a summary, details and an optional link.
Edit, search, filter by status, archive or delete projects from the Projects tab.
Changes persist in the existing private D1 database, with protection against stale edits
and duplicate create requests. See [Projects usage and release notes](docs/PROJECTS.md).

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
