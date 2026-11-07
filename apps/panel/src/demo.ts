import type { Adapter, Backup, Job, Status } from './types';

// This module is selected only by Vite's explicit demo build mode.
let authenticated = false;
let initialized = false;
let jobs: Job[] = [];
let backups: Backup[] = [];
const token = 'demo-only-token';
const state = () => ({ authenticated, csrf_token: token, ...(authenticated ? { username: 'demo' } : {}) });
const status = (): Status => ({
  version: '0.1.0-alpha (demo)', disk_free_bytes: 15461882265,
  services: { nginx: 'active', mariadb: 'active', php_fpm: 'active' },
  wordpress: { status: initialized ? 'installed' : 'not_installed', site_url: 'https://site.example.test/', admin_url: 'https://site.example.test/wp-admin/' },
});
function job(): Job {
  const item: Job = { id: crypto.randomUUID(), status: 'succeeded' };
  jobs = [item, ...jobs];
  return item;
}
export const adapter: Adapter = {
  demo: true,
  session: async () => state(),
  login: async () => { authenticated = true; return state(); },
  logout: async () => { authenticated = false; },
  status: async () => status(),
  initialize: async () => { if (initialized) throw new Error('WordPress is already initialized.'); initialized = true; return job(); },
  createBackup: async () => {
    if (!initialized) throw new Error('Initialize WordPress before creating a backup.');
    const item = job();
    backups = [{ id: item.id, created_at: new Date().toISOString(), size_bytes: 0 }, ...backups];
    return item;
  },
  backups: async () => backups,
  job: async (id) => { const item = jobs.find((value) => value.id === id); if (!item) throw new Error('Job not found.'); return item; },
  download: async () => new Blob(['This is synthetic demo data, not a backup.\n'], { type: 'text/plain' }),
};
