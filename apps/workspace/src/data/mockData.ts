import type { Project, FileItem, NoteItem, ToolItem, CloudflareBinding } from '../types';

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'palette',
    name: 'Palette',
    tagline: 'A minimal color tool for creators.',
    description: 'Precision color extraction, perceptual palette harmonizer, and CSS/Tailwind token exporter running on Cloudflare Workers.',
    status: 'In Progress',
    updatedAt: '2h ago',
    updatedTimestamp: Date.now() - 2 * 3600 * 1000,
    thumbnailGradient: 'radial-gradient(circle at 60% 40%, #2f343b 0%, #17181c 70%, #0d0e11 100%)',
    thumbnailStyle: 'gradient',
    externalUrl: 'https://palette.rachg.fyi',
    workerUrl: 'palette-worker.rachg.workers.dev',
    stack: ['Astro', 'Canvas API', 'Cloudflare Workers', 'Tailwind CSS'],
    stars: 42,
    category: 'core',
  },
  {
    id: 'quiet',
    name: 'Quiet',
    tagline: 'A focused writing space.',
    description: 'Ultra-low latency distraction-free markdown canvas with ambient soundscapes and Cloudflare D1 encrypted sync.',
    status: 'Planning',
    updatedAt: '1d ago',
    updatedTimestamp: Date.now() - 24 * 3600 * 1000,
    thumbnailGradient: 'radial-gradient(ellipse at bottom, #3b3d44 0%, #1e2025 50%, #111215 100%)',
    thumbnailStyle: 'monochrome',
    externalUrl: 'https://quiet.rachg.fyi',
    workerUrl: 'quiet-sync.rachg.workers.dev',
    stack: ['React', 'Cloudflare D1', 'Tailwind', 'Web Audio'],
    stars: 28,
    category: 'core',
  },
  {
    id: 'lens',
    name: 'Lens',
    tagline: 'Capture ideas, visually.',
    description: 'Visual bookmarking, moodboard curation, and screenshot annotation backed by Cloudflare R2 bucket storage.',
    status: 'In Progress',
    updatedAt: '3d ago',
    updatedTimestamp: Date.now() - 72 * 3600 * 1000,
    thumbnailGradient: 'radial-gradient(circle at 30% 70%, #44474f 0%, #222329 60%, #131417 100%)',
    thumbnailStyle: 'plant',
    externalUrl: 'https://lens.rachg.fyi',
    workerUrl: 'lens-assets.rachg.workers.dev',
    stack: ['Astro', 'Cloudflare R2', 'IndexedDB', 'Sharp'],
    stars: 35,
    category: 'core',
  },
  {
    id: 'infinite-canvas',
    name: 'Infinite Canvas',
    tagline: 'Spatial thinking and boundless node diagrams.',
    description: 'High-performance pan-and-zoom whiteboard with infinite pan, vectorized path rendering, and multi-user pointer sync.',
    status: 'Live',
    updatedAt: '5d ago',
    updatedTimestamp: Date.now() - 120 * 3600 * 1000,
    thumbnailGradient: 'radial-gradient(circle at 50% 50%, #272a33 0%, #14151b 80%, #0a0b0e 100%)',
    thumbnailStyle: 'minimal',
    externalUrl: 'https://canvas.air1.cn',
    workerUrl: 'canvas-worker.air1.workers.dev',
    stack: ['WebGL', 'Cloudflare Workers', 'Durable Objects'],
    stars: 64,
    category: 'core',
  },
];

export const INITIAL_FILES: FileItem[] = [
  {
    id: 'f-1',
    name: 'moodboard.png',
    size: '4.2 MB',
    sizeBytes: 4.2 * 1024 * 1024,
    updatedAt: '2h ago',
    type: 'image',
    status: 'active',
  },
  {
    id: 'f-2',
    name: 'project-notes.pdf',
    size: '1.1 MB',
    sizeBytes: 1.1 * 1024 * 1024,
    updatedAt: '5h ago',
    type: 'pdf',
    status: 'active',
  },
  {
    id: 'f-3',
    name: 'pitch-deck.key',
    size: '12.8 MB',
    sizeBytes: 12.8 * 1024 * 1024,
    updatedAt: '1d ago',
    type: 'keynote',
    status: 'active',
  },
  {
    id: 'f-4',
    name: 'ideas.txt',
    size: '2 KB',
    sizeBytes: 2 * 1024,
    updatedAt: '2d ago',
    type: 'text',
    status: 'active',
  },
  {
    id: 'f-5',
    name: 'reference.mov',
    size: '96.4 MB',
    sizeBytes: 96.4 * 1024 * 1024,
    updatedAt: '3d ago',
    type: 'video',
    status: 'active',
  },
];

export const INITIAL_TRANSFERS: FileItem[] = [
  {
    id: 'tr-1',
    name: 'demo.mp4',
    size: '24.1 MB',
    sizeBytes: 24.1 * 1024 * 1024,
    updatedAt: '1h ago',
    expiresIn: '23h 42m',
    expiresTimestamp: Date.now() + (23 * 3600 + 42 * 60) * 1000,
    shareUrl: 'https://rachg.fyi/d/7h3k9a',
    type: 'video',
    downloads: 4,
    status: 'active',
  },
  {
    id: 'tr-2',
    name: 'design-system.zip',
    size: '8.4 MB',
    sizeBytes: 8.4 * 1024 * 1024,
    updatedAt: '4h ago',
    expiresIn: '2d 4h',
    expiresTimestamp: Date.now() + (52 * 3600) * 1000,
    shareUrl: 'https://rachg.fyi/d/m2v8qs',
    type: 'archive',
    downloads: 12,
    status: 'active',
  },
  {
    id: 'tr-3',
    name: 'references.pdf',
    size: '11.2 MB',
    sizeBytes: 11.2 * 1024 * 1024,
    updatedAt: '18h ago',
    expiresIn: '6h 18m',
    expiresTimestamp: Date.now() + (6 * 3600 + 18 * 60) * 1000,
    shareUrl: 'https://rachg.fyi/d/b9z4ne',
    type: 'pdf',
    downloads: 7,
    status: 'active',
  },
];

export const INITIAL_NOTES: NoteItem[] = [
  {
    id: 'n-1',
    title: 'Ideas for v2',
    excerpt: 'A few thoughts on where this could go...',
    content: `# Ideas for v2

A few thoughts on where this workspace could evolve over the next few quarters.

## Core Philosophical Tenets
- **Speed above all**: sub-50ms interaction response times.
- **Calm by default**: no notification badges, no red warning chips, no metrics charts.
- **Edge computing as second nature**: storage, compute, and static caching live together at Cloudflare edge.

## Upcoming Architectural Milestones
1. **D1 Local SQLite Caching**: offline-first mutation queue that synchronizes automatically on reconnection.
2. **Encrypted Temporary Transfer Vault**: zero-knowledge client-side AES-GCM encryption before R2 upload.
3. **Decentralized Worker Registry**: automatically discover and health-check standalone worker micro-services.`,
    updatedAt: '2h ago',
    updatedTimestamp: Date.now() - 2 * 3600 * 1000,
    tags: ['Product', 'Architecture'],
    readTime: '3 min read',
    pinned: true,
  },
  {
    id: 'n-2',
    title: 'Creative workflow',
    excerpt: 'Notes on a calmer, more intentional...',
    content: `# Creative Workflow

Notes on establishing a calmer, more intentional craft environment.

> "Simplicity is not the lack of clutter, that's a consequence of simplicity. Simplicity somehow essentially describes the purpose and place of an object and tool."

### Daily Rituals
- First 90 minutes reserved for creation before opening communication channels.
- Keep the physical and digital desk monochrome.
- When an idea strikes, record the raw seed immediately in rachg notes without organizing or formatting.`,
    updatedAt: '1d ago',
    updatedTimestamp: Date.now() - 24 * 3600 * 1000,
    tags: ['Mindset', 'Design'],
    readTime: '2 min read',
    pinned: true,
  },
  {
    id: 'n-3',
    title: 'Tools I love',
    excerpt: 'A running list of tools that make life...',
    content: `# Tools I Love

A running list of tools that make life lighter and work more joyful:

- **Linear**: The masterclass in speed, keyboard shortcuts, and dark mode restraint.
- **Raycast**: The fastest extension interface ever built for desktop.
- **Arc**: Reimagined the web browser as an easel rather than an appliance.
- **Things 3**: Unmatched typography and tactile satisfaction.
- **Cloudflare Workers**: The closest thing to deploying pure compute directly into the ether.`,
    updatedAt: '2d ago',
    updatedTimestamp: Date.now() - 48 * 3600 * 1000,
    tags: ['Curation', 'Tools'],
    readTime: '2 min read',
  },
  {
    id: 'n-4',
    title: 'Design principles',
    excerpt: 'Simplicity, clarity, and a bit of soul.',
    content: `# Design Principles: Simplicity, Clarity, and a Bit of Soul

### 1. High Information Density, Zero Visual Noise
Density does not mean clutter. It means every pixel has an unambiguous job.

### 2. Quiet Typography
Serif headings bring warmth and editorial pedigree; neo-grotesque sans-serif brings tactical precision.

### 3. Tactile Micro-feedback
Hover transitions should feel like glass slides across polished basalt. Sub 150ms ease-out curves.`,
    updatedAt: '4d ago',
    updatedTimestamp: Date.now() - 96 * 3600 * 1000,
    tags: ['Design', 'Aesthetics'],
    readTime: '4 min read',
  },
  {
    id: 'n-5',
    title: 'Someday',
    excerpt: "A collection of maybe's.",
    content: `# Someday

A collection of uncommitted curiosities and someday-maybe projects:

- [ ] Synthesizer sequencer in pure Web Audio & WebGL
- [ ] Ephemeral voice memo exchange via WebRTC
- [ ] Minimalist e-ink reader companion app
- [ ] Solar-powered home sensor telemetry stream`,
    updatedAt: '6d ago',
    updatedTimestamp: Date.now() - 144 * 3600 * 1000,
    tags: ['Ideas'],
    readTime: '1 min read',
  },
];

export const INITIAL_EXPERIMENTS: ToolItem[] = [
  {
    id: 'ascii-studio',
    name: 'ASCII Studio',
    tagline: 'Turn ideas into ASCII art.',
    description: 'Procedural raster-to-ascii converter with custom glyph maps and retro CRT phosphorescence preview.',
    status: 'Exploring',
    updatedAt: '2d ago',
    workerEndpoint: 'ascii.rachg.workers.dev',
    isExternal: false,
    category: 'experiment',
    thumbnailGradient: 'radial-gradient(circle at 50% 50%, #2b313d 0%, #15181f 70%, #0c0d11 100%)',
  },
  {
    id: 'blur',
    name: 'Blur',
    tagline: 'A minimal image processor.',
    description: 'High-speed edge worker for Gaussian blurring, WebP re-encoding, and privacy-first EXIF scrubbing.',
    status: 'Prototype',
    updatedAt: '4d ago',
    workerEndpoint: 'blur-edge.rachg.workers.dev',
    isExternal: false,
    category: 'utility',
    thumbnailGradient: 'radial-gradient(circle at 35% 35%, #4a4d57 0%, #282b33 60%, #121317 100%)',
  },
  {
    id: 'micro-web',
    name: 'Micro Web',
    tagline: 'Tiny web apps, big ideas.',
    description: 'Single-file hypermedia experiments hosted directly in Cloudflare KV with instant sub-10ms TTFB.',
    status: 'Exploring',
    updatedAt: '6d ago',
    workerEndpoint: 'microweb.rachg.workers.dev',
    isExternal: false,
    category: 'experiment',
    thumbnailGradient: 'radial-gradient(circle at 60% 70%, #303742 0%, #171b22 70%, #0d0f14 100%)',
  },
  {
    id: 'playground',
    name: 'Playground',
    tagline: 'A space for random experiments.',
    description: 'Ephemeral JavaScript and WASM sandbox running isolated Workers compute for testing algorithms.',
    status: 'Idea',
    updatedAt: '1w ago',
    workerEndpoint: 'sandbox.rachg.workers.dev',
    isExternal: false,
    category: 'experiment',
    thumbnailGradient: 'radial-gradient(circle at 45% 45%, #3e424c 0%, #202228 65%, #101115 100%)',
  },
  {
    id: 'weknora-bridge',
    name: 'WeKnora Knowledge API',
    tagline: 'Personal vector & document intelligence.',
    description: 'Private LLM document retrieval bridge connecting local notes to self-hosted embedding store.',
    status: 'Live',
    updatedAt: '1w ago',
    workerEndpoint: 'kb.air1.cn:28080',
    isExternal: true,
    category: 'ai',
    thumbnailGradient: 'radial-gradient(circle at 50% 40%, #343c4a 0%, #1b2029 70%, #0f1217 100%)',
  },
];

export const CLOUDFLARE_BINDINGS: CloudflareBinding[] = [
  {
    service: 'Cloudflare D1',
    bindingName: 'DB',
    status: 'connected',
    details: 'rachg-core-d1 (Database ID: 4f98a2-d1-prod)',
  },
  {
    service: 'Cloudflare R2',
    bindingName: 'STORAGE_BUCKET',
    status: 'connected',
    details: 'rachg-files-r2 (Region: auto / WNAM)',
  },
  {
    service: 'Cloudflare KV',
    bindingName: 'CONFIG_KV',
    status: 'connected',
    details: 'rachg-settings-cache (Namespace: 8e1b93-kv-prod)',
  },
  {
    service: 'Cloudflare Workers AI',
    bindingName: 'AI',
    status: 'configured',
    details: '@cf/meta/llama-3.1-8b-instruct',
  },
];
