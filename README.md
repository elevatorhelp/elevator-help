# elevator.help

## Authentication rollout

The account UI is intentionally inactive until Clerk production credentials are
configured. Chat messages remain browser-memory-only and are not written to a
user history database.

1. Create a Clerk production application with email + password enabled.
2. Require email verification at sign-up and disable phone/social sign-in.
3. Configure the Clerk DNS records for `elevator.help` plus DMARC.
4. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to GitHub Actions secrets.
5. Add `CLERK_SECRET_KEY` as a Cloudflare Worker secret.
6. Deploy with `AUTH_REQUIRED=false`, verify sign-up/sign-in/reset, then set
   `AUTH_REQUIRED=true` and deploy again.

The Clerk dashboard is the customer registry for this phase. No password and no
conversation content is stored in Cloudflare D1.

Version 0.2 foundation.

## Cloudflare dashboard
- Build command: `npm run cf:build`
- Deploy command: `npx wrangler deploy`

## Beta architecture
- Gemini is the semantic-understanding, query-planning and answer-synthesis brain.
- Internal documents are searched first; public web research is the fallback when internal evidence is insufficient.
- Retrieval infrastructure is retrieval-only and does not replace Gemini reasoning.
- Exact normative claims must be verified against raw source evidence before they are returned.
- Internal source files and storage mechanics remain backend-only.
- Production assistant runtime uses the current Gemini 3.6 Flash model; standards verification remains deterministic against raw source evidence.

## v0.2
- Updated technical-source list (without Wittur)
- Added NEW Lift, Weber and & more
- Added public-source disclosure
- Added Industry Partners advertising section
- Added `info@elevator.help` contact points
- Prepared UI for the next AI + web-search stage

<!-- CI verification branch for the Gemini runtime repair. -->
