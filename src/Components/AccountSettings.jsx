import { useCallback, useEffect, useState } from "react";
import { FiLogOut, FiMail, FiMonitor, FiShield, FiUser } from "react-icons/fi";
import PasswordInput from "./PasswordInput.jsx";

const AccountSettings = ({ user, onChangeEmail, onChangePassword, onGetSessions, onRevokeSession }) => {
  const [sessions, setSessions] = useState([]);
  const [sessionsMessage, setSessionsMessage] = useState("");
  const [sessionsBusy, setSessionsBusy] = useState(true);
  const [revokingSession, setRevokingSession] = useState("");
  const [nextEmail, setNextEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailLink, setEmailLink] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    setSessionsBusy(true);
    setSessionsMessage("");
    try {
      const result = await onGetSessions();
      setSessions(result.sessions);
    } catch (error) {
      setSessionsMessage(error.message || "Unable to load active device sessions.");
    } finally {
      setSessionsBusy(false);
    }
  }, [onGetSessions]);

  useEffect(() => {
    const timer = window.setTimeout(loadSessions, 0);
    return () => window.clearTimeout(timer);
  }, [loadSessions]);

  const revokeSession = async (sessionId) => {
    setRevokingSession(sessionId);
    setSessionsMessage("");
    try {
      await onRevokeSession(sessionId);
      await loadSessions();
    } catch (error) {
      setSessionsMessage(error.message || "Unable to sign out this device.");
    } finally {
      setRevokingSession("");
    }
  };

  const submitEmail = async (event) => {
    event.preventDefault();
    setEmailBusy(true);
    setEmailMessage("");
    setEmailLink("");
    try {
      const result = await onChangeEmail(nextEmail.trim().toLowerCase(), emailPassword);
      setEmailMessage(result.message);
      setEmailLink(result.devLink || "");
      setEmailPassword("");
      setNextEmail("");
    } catch (error) {
      setEmailMessage(error.message || "Unable to request an email change.");
    } finally {
      setEmailBusy(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordMessage("");
    try {
      const result = await onChangePassword(currentPassword, newPassword);
      setPasswordMessage(result.ok ? "Password updated. Other active sessions have been signed out." : result.message);
      if (result.ok) {
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch (error) {
      setPasswordMessage(error.message || "Unable to update the password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="account-settings-grid">
      <section className="panel account-setting-panel account-profile-panel">
        <div className="account-setting-heading"><span className="settings-icon"><FiUser /></span><div><p className="section-kicker">PROFILE</p><h3>Your account</h3><p className="muted-copy">Information provided for this account.</p></div></div>
        <dl className="account-profile-details">
          <div><dt>Full name</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Account type</dt><dd>{user.role === "admin" ? "Administrator" : "Worker"}</dd></div>
          <div><dt>Account status</dt><dd>{user.status}</dd></div>
          <div><dt>Email verified</dt><dd>{user.emailVerified ? "Yes" : "No"}</dd></div>
          <div><dt>Created</dt><dd>{user.createdAt ? new Date(user.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd></div>
        </dl>
      </section>

      <section className="panel account-setting-panel account-sessions-panel">
        <div className="account-setting-heading"><span className="settings-icon"><FiMonitor /></span><div><p className="section-kicker">ACCOUNT SECURITY</p><h3>Active devices</h3><p className="muted-copy">Sessions active in the last 5 minutes. This list refreshes when opened.</p></div></div>
        {sessionsMessage && <p className="auth-notice notice-error" role="alert">{sessionsMessage}</p>}
        {sessionsBusy ? <p className="muted-copy">Loading active devices…</p> : sessions.length === 0
          ? <p className="muted-copy">No active device sessions found.</p>
          : <div className="account-session-list">{sessions.map((session) => <article className="account-session-item" key={session.id}>
            <div className="account-session-device"><strong>{session.device}</strong><small>{session.isCurrent ? "This device · " : ""}Last active {new Date(session.lastSeen).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</small></div>
            {!session.isCurrent && <button className="small-action" type="button" disabled={revokingSession === session.id} onClick={() => revokeSession(session.id)}><FiLogOut />{revokingSession === session.id ? "Signing out…" : "Sign out"}</button>}
          </article>)}</div>}
        <button className="text-button account-session-refresh" type="button" disabled={sessionsBusy} onClick={loadSessions}>Refresh device list</button>
      </section>

      <section className="panel account-setting-panel">
        <div className="account-setting-heading"><span className="settings-icon"><FiMail /></span><div><p className="section-kicker">LOGIN ADDRESS</p><h3>Change email</h3><p className="muted-copy">Current: {user.email}</p></div></div>
        <form className="settings-form" onSubmit={submitEmail}>
          <label>New email address<input required type="email" autoComplete="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Confirm with current password<PasswordInput autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} placeholder="Current password" /></label>
          {emailMessage && <p className="form-message" role="status">{emailMessage}</p>}
          {emailLink && <a className="dev-action-link" href={emailLink}>Open local email confirmation <FiMail /></a>}
          <button className="primary-button" type="submit" disabled={emailBusy}>{emailBusy ? "Sending…" : "Send confirmation link"}</button>
        </form>
      </section>

      <section className="panel account-setting-panel">
        <div className="account-setting-heading"><span className="settings-icon"><FiShield /></span><div><p className="section-kicker">ACCOUNT SECURITY</p><h3>Change password</h3><p className="muted-copy">Changing your password signs out other sessions.</p></div></div>
        <form className="settings-form" onSubmit={submitPassword}>
          <label>Current password<PasswordInput autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" /></label>
          <label>New password<PasswordInput autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          {passwordMessage && <p className="form-message" role="status">{passwordMessage}</p>}
          <button className="primary-button" type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Update password"}</button>
        </form>
      </section>
    </div>
  );
};

export default AccountSettings;
