# elevator.help security and account rollout

## Release objective

Ship a safer document-intelligence assistant with verified email/password
accounts, no persistent conversation history, and an edit-and-resend control for
user messages. Account enforcement stays off until the production identity
configuration is verified so an incomplete rollout cannot lock out the site.

## Security baseline

| Control | Implementation | Release evidence |
| --- | --- | --- |
| Dependency risk | Upgrade Next.js and override affected transitive packages | Production dependency audit has no high/critical findings |
| AI cost abuse | Per-request Gemini call budget and per-user/IP Cloudflare rate limit | Cost-control regression test |
| Paid health probe | Health endpoint checks configuration without calling Gemini | Security baseline test |
| Diagnostic exposure | Production diagnostics default to 404 and require an ingestion bearer token when enabled | Route-level guard plus security baseline test |
| Browser hardening | CSP, HSTS, frame denial, MIME sniffing, referrer and permissions policies | Production build and header configuration test |
| Supply-chain permissions | Pin GitHub Actions to immutable commits and restrict workflow token permissions | Workflow security test |

## Account rollout

1. Create a Clerk production application.
2. Enable email address + password only, require email verification, and disable
   phone/social sign-in.
3. Configure Clerk's production domain and mail DNS records.
4. Store the publishable key in GitHub Actions and the secret key in Cloudflare.
5. Deploy with `AUTH_REQUIRED=false` and verify sign-up, verification, sign-in,
   password reset, sign-out, and the authenticated `/api/ask` request.
6. Change `AUTH_REQUIRED=true`, deploy again, and verify anonymous API calls fail.

Clerk is the user registry for this phase. The application does not store
passwords, phone numbers, or account conversation history. Messages remain only
in the current browser page and the last turns are sent with the current request
solely to preserve live conversational context.

## Message correction

A user can edit any of their messages in the current page. Saving the edit
discards that turn's old answer and all later turns, then resends the corrected
question with only the preceding conversation as context.

## Release gates

- All focused language, retrieval, standards, security, auth, editing, and cost
  tests pass.
- Next.js and OpenNext Cloudflare production builds pass.
- Wrangler dry-run reports the expected bindings and variables.
- Live authentication remains disabled until production Clerk keys and email
  verification are confirmed.
- After activation, no chat-history database or browser persistence is added.
