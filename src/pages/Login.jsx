import { useState } from "react";
import { FiArrowLeft, FiArrowRight, FiScissors, FiUser } from "react-icons/fi";
import brandLogo from "../assets/SAMBARBINGHUB NBG.png";
import PasswordInput from "../Components/PasswordInput.jsx";

const Login = ({ hasAdmin, serviceError, onAuthenticate, onForgotPassword, onResendVerification, onVerifyEmail }) => {
  const [view, setView] = useState("worker");
  const [isRegister, setIsRegister] = useState(false);
  const [forceAdminLogin, setForceAdminLogin] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [devLink, setDevLink] = useState("");
  const [devCode, setDevCode] = useState("");
  const [canResend, setCanResend] = useState(false);
  const [returnView, setReturnView] = useState("worker");
  const isAdmin = view === "admin";
  const isForgot = view === "forgot";
  const isProduction = import.meta.env.PROD;
  const creatingAdmin = isAdmin && isRegister && !forceAdminLogin;
  const registering = isAdmin ? creatingAdmin : !isForgot && isRegister;

  const switchView = (nextView) => {
    setView(nextView);
    setIsRegister(nextView === "admin" && !hasAdmin);
    setForceAdminLogin(false);
    setAwaitingVerification(false);
    setVerificationCode("");
    setNotice("");
    setDevLink("");
    setDevCode("");
    setCanResend(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");
    setDevLink("");
    setDevCode("");
    try {
      if (awaitingVerification) {
        const result = await onVerifyEmail(verificationCode.trim());
        setNotice(result.message);
        setAwaitingVerification(false);
        setVerificationCode("");
        setCanResend(false);
        if (isAdmin) {
          setIsRegister(false);
          setForceAdminLogin(true);
        } else {
          setIsRegister(false);
        }
        return;
      }
      if (isForgot) {
        const result = await onForgotPassword(email.trim().toLowerCase());
        setNotice(result.message);
        setDevLink(result.devLink || "");
        return;
      }
      const result = await onAuthenticate({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: isAdmin ? "admin" : "worker",
        isRegister: registering,
        rememberMe,
      });
      setNotice(result?.message || "");
      setDevLink(result?.devLink || "");
      setDevCode(result?.devCode || "");
      if (registering) {
        setAwaitingVerification(true);
        setCanResend(true);
      }
      if (registering && !isAdmin) setCanResend(true);
    } catch (error) {
      if (error.code === "ADMIN_EXISTS") {
        setView("admin");
        setForceAdminLogin(true);
      }
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setCanResend(true);
        setAwaitingVerification(true);
      }
      setNotice(error.message || "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resendVerification = async () => {
    setSubmitting(true);
    try {
      const result = await onResendVerification(email.trim().toLowerCase());
      setNotice(result.message);
      setDevLink(result.devLink || "");
      setDevCode(result.devCode || "");
    } catch (error) {
      setNotice(error.message || "Unable to resend the verification link.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-brand-panel" aria-label="Sam Barbing Hub">
        <div className="brand-topline"><FiScissors /> <span>EST. 2024 · LAGOS, NIGERIA</span></div>
        <div className="brand-lockup">
          <img src={brandLogo} alt="Sam Barbing Hub" />
          <p>Precision. Presence. Professionalism.</p>
        </div>
        <div className="brand-bottomline">
          <span>THE CRAFT, WELL KEPT.</span>
          <span>01 / 01</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-brand"><img src={brandLogo} alt="Sam Barbing Hub" /></div>
          <div className="auth-eyebrow"><span className="status-dot" /> STAFF PORTAL</div>
          <h1>{awaitingVerification ? "Verify your email" : isForgot ? "Reset your password" : isAdmin ? (creatingAdmin ? "Set up manager access" : "Manager sign in") : (registering ? "Join the team" : "Welcome back")}</h1>
          <p className="auth-subtitle">
            {awaitingVerification ? "Enter the 8-digit code sent to your email. It expires in 15 minutes." : isForgot ? "Enter your account email and we will send a secure reset link." : isAdmin
              ? creatingAdmin ? "Create the single manager account for this workspace." : "Sign in to manage your barbershop." 
              : registering ? "Create your worker account. Access starts after manager approval." : "Sign in to view your records and track your work."}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {serviceError && <p className="auth-notice" role="alert">{serviceError}</p>}
            {registering && !awaitingVerification && (
              <label className="field-label">
                Full name
                <span className="input-wrap"><FiUser /><input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></span>
              </label>
            )}
            <label className="field-label">
              Email address
              <span className="input-wrap"><span className="input-at">@</span><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" readOnly={awaitingVerification} /></span>
            </label>
            {awaitingVerification && <>
              <label className="field-label">Email verification code
                <span className="input-wrap"><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{8}" maxLength="8" required value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8-digit code" /></span>
              </label>
              <p className="muted-copy">Enter the code sent to your email. It expires in 15 minutes.</p>
            </>}
            {!isForgot && !awaitingVerification && <label className="field-label">
              Password
              <PasswordInput autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </label>}
            {!isForgot && !registering && <label className="remember-me">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span>Remember me</span>
            </label>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            {!isProduction && devLink && <a className="dev-action-link" href={devLink}>Open local mail <FiArrowRight /></a>}
            {!isProduction && devCode && <p className="auth-notice" role="status">Local verification code: <strong>{devCode}</strong></p>}
            {canResend && !isForgot && <button className="text-button resend-button" type="button" disabled={submitting} onClick={resendVerification}>Resend verification code</button>}
            <button className="primary-button auth-submit" type="submit" disabled={submitting || Boolean(serviceError)}>
              {submitting ? "Please wait…" : awaitingVerification ? "Verify email" : isForgot ? "Send reset link" : registering ? (isAdmin ? "Create manager account" : "Request access") : "Sign in"}
              <FiArrowRight />
            </button>
          </form>

          {!isAdmin && !isForgot && (
            <p className="auth-switchline">
              {registering ? "Already have an account?" : "New to the team?"}
              <button className="text-button" type="button" onClick={() => { setIsRegister(!isRegister); setNotice(""); }}>
                {registering ? "Sign in" : "Create worker account"}
              </button>
            </p>
          )}

          {creatingAdmin && !awaitingVerification && <p className="auth-switchline">
            Already have a manager account?
            <button className="text-button" type="button" onClick={() => { setForceAdminLogin(true); setIsRegister(false); setNotice(""); setDevLink(""); setDevCode(""); }}>
              Login to admin
            </button>
          </p>}

          {!isForgot && !registering && <button className="text-button forgot-link" type="button" onClick={() => { setReturnView(view); setView("forgot"); setNotice(""); setDevLink(""); }}>Forgot password?</button>}

          <div className="auth-divider"><span>OR</span></div>
          <button className="switch-button" type="button" onClick={() => isForgot ? switchView(returnView) : switchView(isAdmin ? "worker" : "admin")}>
            {isForgot ? <><FiArrowLeft /> Back to sign in</> : isAdmin ? <><FiArrowLeft /> Back to worker sign in</> : <>Switch to admin <FiArrowRight /></>}
          </button>
          <p className="auth-footnote">{hasAdmin ? "Manager access is restricted to the registered admin." : "The first manager account becomes the only admin for this workspace."}</p>
        </div>
        <footer className="auth-footer"><span>© {new Date().getFullYear()} SAM BARBING HUB</span><span>SECURE STAFF ACCESS</span></footer>
      </section>
    </main>
  );
};

export default Login;
