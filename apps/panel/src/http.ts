import type { Adapter, Session, Status } from "./types";

const base = "/api/v1/";
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(base + path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "detail" in body &&
        typeof body.detail === "string"
      ) {
        message = body.detail;
      }
    } catch {
      /* Use the HTTP status if the response is not JSON. */
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
function change(method: string, csrf: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}
export const adapter: Adapter = {
  demo: false,
  session: () => request<Session>("session"),
  login: (username, password, csrf) =>
    request<Session>("session", change("POST", csrf, { username, password })),
  logout: (csrf) => request<void>("session", change("DELETE", csrf)),
  changePassword: (currentPassword, newPassword, csrf) =>
    request<void>(
      "account/password",
      change("POST", csrf, { current_password: currentPassword, new_password: newPassword }),
    ),
  status: () => request<Status>("status"),
};
