import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { adapter } from '@adapter';
import type { Backup, Job, Session, Status } from './types';
import './style.css';

function errorText(error: unknown): string { return error instanceof Error ? error.message : 'The request failed.'; }
function formatBytes(bytes: number): string { return `${(bytes / 1024 ** 3).toFixed(1)} GiB`; }
function safeLink(value: string): string | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [title, setTitle] = useState('');
  const [wpName, setWpName] = useState('');
  const [email, setEmail] = useState('');
  const [wpPassword, setWpPassword] = useState('');

  const refresh = useCallback(async () => {
    const [nextStatus, nextBackups] = await Promise.allSettled([adapter.status(), adapter.backups()]);
    if (nextStatus.status === 'fulfilled') setStatus(nextStatus.value);
    if (nextBackups.status === 'fulfilled') setBackups(nextBackups.value);
    const failed = [nextStatus, nextBackups].find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }, []);
  useEffect(() => {
    let active = true;
    adapter.session().then((value) => { if (active) setSession(value); }).catch((e: unknown) => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!session?.authenticated) return;
    refresh().catch((e: unknown) => setError(errorText(e)));
  }, [session?.authenticated, refresh]);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    const timer = window.setTimeout(() => {
      adapter.job(job.id).then(setJob).catch((e: unknown) => setError(errorText(e)));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [job]);
  useEffect(() => {
    if (job?.status === 'succeeded') refresh().catch((e: unknown) => setError(errorText(e)));
  }, [job?.status, job?.id, refresh]);

  async function login(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError('');
    try { setSession(await adapter.login(loginName, loginPassword, session.csrf_token)); setLoginPassword(''); }
    catch (e) { setError(errorText(e)); setLoginPassword(''); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!session) return;
    setBusy(true); setError('');
    try { await adapter.logout(session.csrf_token); setStatus(null); setBackups(null); setJob(null); setNotice('Signed out.'); setSession(await adapter.session()); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function initialize(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError(''); setNotice('');
    try { setJob(await adapter.initialize({ title, username: wpName, email, password: wpPassword }, session.csrf_token)); setWpPassword(''); setNotice('Initialization request submitted.'); }
    catch (e) { setError(errorText(e)); setWpPassword(''); }
    finally { setBusy(false); }
  }
  async function createBackup() {
    if (!session) return;
    setBusy(true); setError(''); setNotice('');
    try { setJob(await adapter.createBackup(session.csrf_token)); setNotice('Backup request submitted.'); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function download(backup: Backup) {
    setBusy(true); setError('');
    try {
      const blob = await adapter.download(backup.id); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = adapter.demo ? 'webhotelos-demo.txt' : `webhotelos-backup-${backup.id}.tar.gz`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  const working = !!job && ['queued', 'running'].includes(job.status);
  const installed = status?.wordpress.status === 'installed';
  const notInstalled = status?.wordpress.status === 'not_installed';
  const siteLink = status && safeLink(status.wordpress.site_url);
  const adminLink = status && safeLink(status.wordpress.admin_url);
  return <>
    {adapter.demo && <div className="demo" role="status">Demo mode · Synthetic data only. Changes are not saved.</div>}
    <header><div className="header-inner"><a className="brand" href="#top"><span className="brand-mark">W</span><span>WebhotelOS</span></a>{session?.authenticated && <button className="link-button" onClick={logout} disabled={busy}>Sign out</button>}</div></header>
    <main id="top">
      {loading && <p role="status">Connecting to WebhotelOS…</p>}
      {error && <div className="message error" role="alert">{error}</div>}
      {notice && <div className="message success" role="status">{notice}</div>}
      {!loading && !session && <p>Unable to connect. Reload the page to try again.</p>}
      {!loading && session && !session.authenticated && <section className="login">
        <h1>Sign in</h1><p>Manage your website and backups.</p>
        <form onSubmit={login}>
          <label>Username<input name="username" autoComplete="username" required value={loginName} onChange={e => setLoginName(e.target.value)} /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="hint">Your WebhotelOS account is separate from your WordPress account.</p>
      </section>}
      {session?.authenticated && <>
        <div className="page-heading"><div><h1>Overview</h1><p>Your website and server at a glance.</p></div><button className="secondary" onClick={() => { setError(''); refresh().catch((e: unknown) => setError(errorText(e))); }} disabled={busy}>Refresh</button></div>
        {!status && <p role="status">Loading server status…</p>}
        {status && <>
          <section aria-labelledby="server-title" className="section"><div className="section-heading"><div><h2 id="server-title">Server</h2><p>Local system status</p></div><span className="version">{status.version}</span></div>
            <div className="server-grid"><div><span className="label">Available disk space</span><strong>{formatBytes(status.disk_free_bytes)}</strong></div><div><span className="label">Services</span><ul className="services">{Object.entries(status.services).map(([name, state]) => <li key={name}><span>{name.replaceAll('_', ' ')}</span><span className={state === 'active' ? 'healthy' : 'service-state'}>{state}</span></li>)}</ul></div></div>
          </section>
          <section aria-labelledby="site-title" className="section"><div className="section-heading"><div><h2 id="site-title">WordPress</h2><p>{installed ? 'Your website is initialized.' : notInstalled ? 'Set up your website with a separate administrator account.' : 'WordPress status is unavailable.'}</p></div><span className="status-label">{status.wordpress.status.replaceAll('_', ' ')}</span></div>
            {installed ? <div className="actions">{siteLink && <a className="button" href={siteLink}>Visit website</a>}{adminLink && <a className="button secondary" href={adminLink}>Open WordPress admin</a>}</div> : notInstalled ? <form className="setup-form" onSubmit={initialize}>
              <label>Site title<input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
              <label>WordPress username<input name="wp-username" required autoComplete="off" value={wpName} onChange={e => setWpName(e.target.value)} /></label>
              <label>Email<input name="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
              <label>WordPress password<input name="wp-password" type="password" required autoComplete="new-password" value={wpPassword} onChange={e => setWpPassword(e.target.value)} /></label>
              <div className="form-footer"><p>Site address is set in the server configuration.</p><button disabled={busy || working}>Initialize WordPress</button></div>
            </form> : null}
          </section>
          <section aria-labelledby="backup-title" className="section"><div className="section-heading"><div><h2 id="backup-title">Backups</h2><p>Download a copy and store it outside this VM.</p></div><button onClick={createBackup} disabled={busy || working || !installed}>Create backup</button></div>
            {job && <div className="job" role="status">Job <code>{job.id}</code>: <strong>{job.status}</strong>{job.error && <span> — {job.error}</span>}</div>}
            {backups === null ? <p className="empty">Backup list unavailable.</p> : backups.length === 0 ? <p className="empty">No backups yet.</p> : <ul className="backup-list">{backups.map(backup => <li key={backup.id}><div><strong>{new Date(backup.created_at).toLocaleString()}</strong><span>{formatBytes(backup.size_bytes)}</span></div><button className="secondary" disabled={busy} onClick={() => download(backup)}>Download</button></li>)}</ul>}
            <p className="hint">Backup and restore are not available in this development build.</p>
          </section>
        </>}
      </>}
    </main>
    <footer>WebhotelOS · Local administration</footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
