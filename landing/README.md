# ProxiAI Standalone Landing

This directory is an independent, static-first Next.js application for the
public ProxiAI recruiter landing page. It does not import the authenticated
workspace, call the backend API, or require runtime secrets.

## Local verification

```powershell
npm ci
npm run verify
```

`npm run build` exports the site to `out/`. The verification command runs lint,
strict TypeScript checking, focused tests, the production static export, and a
generated-output scan for private runtime identifiers, secret names, backend API
paths, and unsupported public claims.

To inspect the generated site locally, serve `out/` with any static file server.
No Node.js server is required after export.

## Runtime boundary

- No authentication, chat, admin, MongoDB, Redis/BullMQ, provider, or AWS SDK.
- No backend/database/API dependency during rendering.
- No environment variables or runtime secrets.
- The live-demo CTA is a normal link to `https://app.proxiai.me/demo-admin`.
- Release evidence is a dated internal baseline in
  `src/content/release-evidence.json`; update it only after a verified release.

## Vercel handoff

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root Directory | `landing` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `out` |
| Environment Variables | None |

The repository does not deploy this site or change DNS as part of remediation.
Vercel/domain cutover remains an explicit release operation.
