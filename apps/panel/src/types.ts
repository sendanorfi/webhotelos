export type Session = {
  readonly authenticated: boolean;
  readonly csrf_token: string;
  readonly username?: string;
};
export type Status = {
  readonly version: string;
  readonly disk_free_bytes: number;
  readonly services: Record<string, string>;
  readonly wordpress: {
    readonly status: string;
    readonly site_url: string;
    readonly admin_url: string;
  };
};
export interface Adapter {
  readonly demo: boolean;
  session(): Promise<Session>;
  login(username: string, password: string, csrf: string): Promise<Session>;
  logout(csrf: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string, csrf: string): Promise<void>;
  status(): Promise<Status>;
}
