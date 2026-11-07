import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { adapter } from "@adapter";
import type { Session, Status } from "./types";
import "./style.css";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}
function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await adapter.status());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        const value = await adapter.session();
        if (active) {
          setSession(value);
        }
      } catch (e) {
        if (active) {
          setError(errorText(e));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void loadSession();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }
    void refresh();
  }, [session?.authenticated, refresh]);
  async function login(event: FormEvent) {
    event.preventDefault();
    if (!session) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSession(await adapter.login(loginName, loginPassword, session.csrf_token));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoginPassword("");
      setBusy(false);
    }
  }
  async function logout() {
    if (!session) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adapter.logout(session.csrf_token);
      setStatus(null);
      setNotice("Signed out.");
      setSession(await adapter.session());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!session) {
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adapter.changePassword(currentPassword, newPassword, session.csrf_token);
      setStatus(null);
      setSession(null);
      setNotice("Password changed. Sign in again.");
      setSession(await adapter.session());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setBusy(false);
    }
  }
  const siteLink = status && safeLink(status.wordpress.site_url);
  return (
    <>
      {adapter.demo && (
        <div
          className="demo"
          role="status"
        >
          Demo mode · Synthetic data only. Changes are not saved.
        </div>
      )}
      <header>
        <div className="header-inner">
          <a
            className="brand"
            href="#top"
          >
            <span className="brand-mark">W</span>
            <span>WebhotelOS</span>
          </a>
          {session?.authenticated && (
            <button
              className="link-button"
              onClick={logout}
              disabled={busy}
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <main id="top">
        {loading && <p role="status">Connecting to WebhotelOS…</p>}
        {error && (
          <div
            className="message error"
            role="alert"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            className="message success"
            role="status"
          >
            {notice}
          </div>
        )}
        {!loading && !session && <p>Unable to connect. Reload the page to try again.</p>}
        {!loading && session && !session.authenticated && (
          <section className="login">
            <h1>Sign in</h1>
            <p>Manage your server.</p>
            <form onSubmit={login}>
              <label>
                Username
                <input
                  name="username"
                  autoComplete="username"
                  required
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </section>
        )}
        {session?.authenticated && (
          <>
            <div className="page-heading">
              <div>
                <h1>Overview</h1>
                <p>Your website and server at a glance.</p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setError("");
                  void refresh();
                }}
                disabled={busy}
              >
                Refresh
              </button>
            </div>
            {!status && <p role="status">Loading server status…</p>}
            {status && (
              <>
                <section
                  aria-labelledby="server-title"
                  className="section"
                >
                  <div className="section-heading">
                    <div>
                      <h2 id="server-title">Server</h2>
                      <p>Local system status</p>
                    </div>
                    <span className="version">{status.version}</span>
                  </div>
                  <div className="server-grid">
                    <div>
                      <span className="label">Available disk space</span>
                      <strong>{(status.disk_free_bytes / 1024 ** 3).toFixed(1)} GiB</strong>
                    </div>
                    <div>
                      <span className="label">Services</span>
                      <ul className="services">
                        {Object.entries(status.services).map(([name, state]) => (
                          <li key={name}>
                            <span>{name.replaceAll("_", " ")}</span>
                            <span className={state === "active" ? "healthy" : "service-state"}>
                              {state}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
                <section
                  aria-labelledby="site-title"
                  className="section"
                >
                  <div className="section-heading">
                    <div>
                      <h2 id="site-title">Website</h2>
                      <p>Open the configured PHP website.</p>
                    </div>
                  </div>
                  {siteLink && (
                    <div className="actions">
                      <a
                        className="button"
                        href={siteLink}
                      >
                        Visit website
                      </a>
                    </div>
                  )}
                </section>
              </>
            )}
            <section
              aria-labelledby="password-title"
              className="section"
            >
              <div className="section-heading">
                <div>
                  <h2 id="password-title">Change password</h2>
                  <p>Changing your password signs out all sessions.</p>
                </div>
              </div>
              <form
                className="setup-form"
                onSubmit={changePassword}
              >
                <label>
                  Current password
                  <input
                    name="current_password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label>
                  New password
                  <input
                    name="new_password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={1024}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    name="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={1024}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                <div className="form-footer">
                  <p>Use at least 12 characters.</p>
                  <button disabled={busy}>Change password</button>
                </div>
              </form>
            </section>
          </>
        )}
      </main>
      <footer>WebhotelOS · Local administration</footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
