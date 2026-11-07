# Panel and Sites

The panel is a React, TypeScript and Vite application in `apps/panel`. GitHub is the source of truth. Production uses the same-origin `/api/v1/` HTTP adapter; no Sites account, OpenAI login or external service is required. Authentication cookies are managed by the API; no credentials are kept in browser storage or build variables.

```sh
cd apps/panel
npm ci
npm run dev        # synthetic demo on 127.0.0.1
npm run lint && npm run format:check && npm run test:lint && npm run typecheck
npm run build      # VM mode; output in dist/
npm run build:demo # static demo; output in dist/
```

The build mode selects one adapter at build time. The production bundle excludes the mock adapter, and API errors never trigger a fallback. The demo displays a persistent banner, uses synthetic data in memory, and resets on reload. It never accesses the API. Build the demo and use the generated static `dist/` files for a Sites preview where static assets are supported. No automatic GitHub sync or one-click import is assumed. Changes made in Sites must return to this repository through a reviewed change. A real Sites import has not been tested.

The production adapter requests `GET /api/v1/session` for an anonymous or authenticated session and CSRF token. Login and all other mutations send `X-CSRF-Token`; session cookies are sent only to the same origin. It uses the API for authenticated status and panel password changes. WordPress initialization, backups and restore are not exposed in this milestone. The API serves its OpenAPI document at `/openapi.json` on its guest-loopback listener; the panel proxy exposes only `/api/v1/`. Nginx must serve this build on the configured panel origin and proxy `/api/v1/` to the local API. This frontend is not a replacement for API authorization, CSRF validation, job locking or server-side input validation.

The frontend lint rules include project-owned rules adapted from the user-authorized sibling projects; see `apps/panel/tools/README.md` for scope and attribution. The on-premise API currently uses FastAPI and SQLite. Local Workers and D1-compatible development are under evaluation; the existence of workerd or a D1 simulator alone does not establish self-hosted production compatibility.

Cloudflare's open-source [workerd](https://github.com/cloudflare/workerd) can self-host compatible Workers. Cloudflare describes [D1](https://developers.cloudflare.com/d1/) as a managed database and [Miniflare](https://developers.cloudflare.com/workers/local-development/) as local development tooling. No production D1-compatible implementation is provided by this project yet. In particular, a local SQLite database alone does not demonstrate D1 compatibility, durability, replication or backup semantics. The current Python API and SQLite state are the self-hosted implementation; the portable frontend's demo does not prove a complete Sites import.
