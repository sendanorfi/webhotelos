import type { Adapter, Backup, Initialize, Job, Session, Status } from './types';

const base = '/api/v1/';
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(base + path, { ...options, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') message = body.detail;
    } catch { /* Use the HTTP status if the response is not JSON. */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
function change(method: string, csrf: string, body?: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}
export const adapter: Adapter = {
  demo: false,
  session: () => request<Session>('session'),
  login: (username, password, csrf) => request<Session>('session', change('POST', csrf, { username, password })),
  logout: (csrf) => request<void>('session', change('DELETE', csrf)),
  status: () => request<Status>('status'),
  initialize: (data: Initialize, csrf) => request<Job>('wordpress/initialize', change('POST', csrf, data)),
  createBackup: (csrf) => request<Job>('backups', change('POST', csrf)),
  backups: async () => (await request<{ backups: Backup[] }>('backups')).backups,
  job: (id) => request<Job>(`jobs/${encodeURIComponent(id)}`),
  download: async (id) => {
    const response = await fetch(`${base}backups/${encodeURIComponent(id)}/download`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`Download failed (${response.status}).`);
    return response.blob();
  },
};
