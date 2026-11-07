# Local Workers and D1 compatibility experiment

This isolated development test runs the synthetic `worker.mjs` in open-source Miniflare with a D1-style SQLite-backed binding. It checks `prepare`, `bind`, `run`, `all` and `batch`; verifies that a failed batch rolls back; checks SQLite file headers; and restarts the runtime to verify persistence. The same Worker source is loaded on both starts. It uses synthetic data only and removes its temporary state after the test.

On x86_64 Linux, with Node.js 22.16 or newer and npm installed:

```sh
cd tests/sites-compat
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`npm ci` requires registry access to download the exact dependencies in `package-lock.json`. It is a development setup step, not a runtime installation. The test itself requires local loopback sockets and starts a temporary `workerd` process on an ephemeral loopback port. It disables Cloudflare request metadata fetching and routes the Worker's outbound fetches to a synthetic 403 response. It does not prove operating-system-level network isolation. Its D1 persistence directory is a fresh directory under the OS temporary directory and is removed on completion. If the test process is forcibly killed, temporary state may need manual cleanup.

Tested with Node.js 24.22.2, npm 11.19.1, Miniflare 4.20260515.0 and workerd 1.20260515.1 on x86_64 Linux. The lock includes the platform-specific prebuilt workerd package; this test does not build workerd from source or demonstrate a Nix package or an offline installation.

Miniflare is a development and test simulator, not a production D1 server or a hardened sandbox. This test does not establish complete Cloudflare Workers or D1 compatibility, hosted D1 durability, replication, sessions, quotas, security isolation, concurrency, crash recovery or backup correctness. It does not run a real Sites project or compare its behavior with hosted D1. It is not wired into the WebhotelOS runtime or image.

Miniflare is MIT licensed; workerd is Apache-2.0 licensed. The npm lock records the full dependency tree, whose packages retain their own licenses. See the respective package license files and upstream projects: [Miniflare](https://github.com/cloudflare/workers-sdk/tree/main/packages/miniflare), [workerd](https://github.com/cloudflare/workerd), and the [D1 API](https://developers.cloudflare.com/d1/worker-api/).
