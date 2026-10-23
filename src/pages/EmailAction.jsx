import { useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiCheck, FiScissors } from "react-icons/fi";
import { post } from "../lib/api.js";
import PasswordInput from "../Components/PasswordInput.jsx";

const EmailAction = ({ action, token, onDone }) => {
  const started = useRef(false);
  const [status, setStatus] = useState(["verify", "reset"].includes(action) ? "loading" : "ready");
  const [tokenVerified, setTokenVerified] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (started.current) return;
    if (action === "reset") {
      started.current = true;
      post("/auth/validate-reset-token", { token })
        .then((result) => {
          setTokenVerified(true);
          setMessage(result.message);
          setStatus("ready");
        })
        .catch((error) => {
          setMessage(error.message);
          setStatus("error");
        });
      return;
    }
    if (!["verify", "change-email"].includes(action)) return;
    started.current = true;
    post(action === "verify" ? "/auth/verify-email" : "/auth/confirm-email-change", { token })
      .then((result) => {
        setMessage(result.message);
        setStatus("success");
      })
      .catch((error) => {
        setMessage(error.message);
        setStatus("error");
      });
  }, [action, token]);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setMessage("");
    try {
      const result = await post("/auth/reset-password", { token, password });
      setMessage(result.message);
      setStatus("success");
    } catch (error) {
      setMessage(error.message);
      setStatus("error");
    }
  };

  return (
    <main className="auth-layout email-action-layout">
      <section className="email-action-brand"><span className="email-action-mark"><FiScissors /></span><p>SAM BARBING HUB</p><small>SECURE ACCOUNT ACCESS</small></section>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-eyebrow"><span className="status-dot" /> ACCOUNT SECURITY</div>
          <h1>{action === "reset" ? "Choose a new password" : action === "change-email" ? "Confirm email change" : "Email verification"}</h1>
          <p className="auth-subtitle">{action === "reset" ? "Choose a strong password you have not used before." : action === "change-email" ? "We are confirming the new address on your account." : "We are confirming your email address."}</p>
          {action === "reset" && !tokenVerified && (
            <p className={`auth-notice ${status === "error" ? "notice-error" : ""}`} role="status">
              {status === "loading" ? "Checking your secure link…" : message}
            </p>
          )}
          {action === "reset" && tokenVerified && status !== "success" && (
            <form className="auth-form" onSubmit={submit}>
              <label className="field-label">New password<PasswordInput autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
              <label className="field-label">Confirm password<PasswordInput autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></label>
              {message && <p className="auth-notice" role="alert">{message}</p>}
              <button className="primary-button auth-submit" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "Saving…" : "Reset password"}<FiCheck /></button>
            </form>
          )}
          {['verify', 'change-email'].includes(action) && <p className={`auth-notice ${status === "error" ? "notice-error" : ""}`} role="status">{status === "loading" ? "Checking your secure link…" : message}</p>}
          {status === "success" && action === "reset" && <p className="auth-notice" role="status">{message}</p>}
          <button className="switch-button email-action-back" type="button" onClick={onDone}><FiArrowLeft /> Return to sign in</button>
        </div>
      </section>
    </main>
  );
};

export default EmailAction;
