import type { Adapter, Status } from "./types";

// This module is selected only by Vite's explicit demo build mode.
let authenticated = false;
const token = "demo-only-token";
const state = () => ({
  authenticated,
  csrf_token: token,
  ...(authenticated ? { username: "demo" } : {}),
});
const status = (): Status => ({
  version: "0.1.0-alpha (demo)",
  disk_free_bytes: 15461882265,
  services: { nginx: "active", mariadb: "active", php_fpm: "active" },
  wordpress: {
    status: "unknown",
    site_url: "https://site.example.test/",
    admin_url: "https://site.example.test/wp-admin/",
  },
});
export const adapter: Adapter = {
  demo: true,
  session: async () => state(),
  login: async () => {
    authenticated = true;
    return state();
  },
  logout: async () => {
    authenticated = false;
  },
  changePassword: async () => {
    authenticated = false;
  },
  status: async () => status(),
};
