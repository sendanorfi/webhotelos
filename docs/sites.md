# Panel and Sites

The panel is a React, TypeScript and Vite application in `apps/panel`. GitHub is the source of truth. Production uses the same-origin `/api/v1/` HTTP adapter; no Sites account, OpenAI login or external service is required. Authentication cookies are managed by the API; no credentials are kept in browser storage or build variables.

```sh
cd apps/panel
npm ci
npm run dev        # synthetic demo on 127.0.0.1
npm run build      # VM mode; output in dist/
npm run build:demo # static demo; output in dist/
```

The build mode selects one adapter at build time. The production bundle excludes the mock adapter, and API errors never trigger a fallback. The demo displays a persistent banner, uses synthetic data in memory, and resets on reload. It never accesses the API. Build the demo and use the generated static `dist/` files for a Sites preview where static assets are supported. No automatic GitHub sync or one-click import is assumed. Changes made in Sites must return to this repository through a reviewed change. A real Sites import has not been tested.

The production adapter requests `GET /api/v1/session` for an anonymous or authenticated session and CSRF token. Login and all other mutations send `X-CSRF-Token`; session cookies are sent only to the same origin. It uses the API for status, WordPress initialization, jobs, backups and authenticated downloads. See the API OpenAPI document for the complete contract. Nginx must serve this build on the configured panel origin and proxy `/api/v1/` to the local API. This frontend is not a replacement for API authorization, CSRF validation, job locking or server-side input validation.
