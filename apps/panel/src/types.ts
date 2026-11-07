export type Session = { authenticated: boolean; csrf_token: string; username?: string };
export type Status = {
  version: string;
  disk_free_bytes: number;
  services: Record<string, string>;
  wordpress: { status: string; site_url: string; admin_url: string };
};
export type Job = { id: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted'; error?: string };
export type Backup = { id: string; created_at: string; size_bytes: number };
export type Initialize = { title: string; username: string; email: string; password: string };
export interface Adapter {
  readonly demo: boolean;
  session(): Promise<Session>;
  login(username: string, password: string, csrf: string): Promise<Session>;
  logout(csrf: string): Promise<void>;
  status(): Promise<Status>;
  initialize(data: Initialize, csrf: string): Promise<Job>;
  createBackup(csrf: string): Promise<Job>;
  backups(): Promise<Backup[]>;
  job(id: string): Promise<Job>;
  download(id: string): Promise<Blob>;
}
