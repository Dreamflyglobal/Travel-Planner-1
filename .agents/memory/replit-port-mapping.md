---
name: Replit external port 80 must map to the user-facing web app
description: Diagnosing 502 on the public dev domain when it loads fine via localhost/screenshot preview — check which local port owns externalPort 80
---

On a multi-workflow project (frontend + separate backend API), the public
`$REPLIT_DEV_DOMAIN` root serves whichever local port is mapped to
`externalPort = 80` in the `[[ports]]` table — not necessarily the webview
workflow's port. If a backend/API-only server (no `/` route) ends up mapped
to port 80 instead of the frontend, the bare domain 502s/404s even though
`curl localhost:<frontend-port>` and the internal preview screenshot tool
both work fine (they hit the frontend port directly, bypassing that mapping).

**Why:** `.replit` port mappings can get stale/reassigned by prior agent
sessions. `[[ports]]` cannot be hand-edited (blocked by the sandbox) — the
only supported way to fix a wrong externalPort=80 assignment is to call
`configureWorkflow` again for the workflow whose local port should own it;
Replit's tooling then reconciles the ports table.

**How to apply:** If e2e/testing-tool navigation to the base URL fails with
502 while localhost curl and the app-preview screenshot tool succeed, check
`.replit`'s `[[ports]]` for which localPort has `externalPort = 80`. If it's
the backend/API port instead of the frontend port, re-run `configureWorkflow`
for the frontend workflow (webview, port 5000) and for the backend workflow
(console, its own port) to force reassignment, then restart and recheck. Also
kill orphaned node/vite processes holding old ports before restarting, or the
workflow restart will fail with EADDRINUSE.
