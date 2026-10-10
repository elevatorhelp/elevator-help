# elevator.help

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
