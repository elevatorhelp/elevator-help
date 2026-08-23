# elevator.help

Version 0.1 foundation for **elevator.help**.

## Stack

- Next.js App Router
- TypeScript
- Cloudflare Workers
- OpenNext Cloudflare adapter
- Wrangler

## Local development

```bash
npm install
npm run dev
```

## Cloudflare build

```bash
npm run cf:build
```

## Deploy

```bash
npm run deploy
```

## Cloudflare dashboard settings

When deploying from the GitHub repository:

- **Build command:** `npm run cf:build`
- **Deploy command:** `npx wrangler deploy`

The project is intentionally kept dependency-light so it can grow into the future Elevator Agent without replacing the foundation.

## Planned next stages

1. Live site on elevator.help
2. Real chat endpoint
3. AI model connection
4. Manual/document search
5. Web research with source citations
6. Authentication and usage limits
7. Technician history/workspaces
