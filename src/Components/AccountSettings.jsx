import { useState } from "react";
import { FiMail, FiShield } from "react-icons/fi";
import PasswordInput from "./PasswordInput.jsx";

const AccountSettings = ({ email, onChangeEmail, onChangePassword }) => {
  const [nextEmail, setNextEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailLink, setEmailLink] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

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
      <section className="panel account-setting-panel">
        <div className="account-setting-heading"><span className="settings-icon"><FiMail /></span><div><p className="section-kicker">LOGIN ADDRESS</p><h3>Change email</h3><p className="muted-copy">Current: {email}</p></div></div>
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
