import { useState } from "react";
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi";

const PasswordInput = ({ value, onChange, autoComplete, placeholder = "Password", required = true, minLength = 8, maxLength = 128 }) => {
  const [visible, setVisible] = useState(false);

  return (
    <span className="input-wrap password-input-wrap">
      <FiLock aria-hidden="true" />
      <input
        autoComplete={autoComplete}
        type={visible ? "text" : "password"}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <button
        className="password-toggle"
        type="button"
        title={visible ? "Hide password" : "Show password"}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
      </button>
    </span>
  );
};

export default PasswordInput;
