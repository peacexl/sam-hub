import { useState } from "react";

const Login = ({ onLogin }) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");

  const submit = (e) => {
    e.preventDefault();
    // Simple mock login — in a real app you'd call an API
    const user = { name: name || (role === "admin" ? "Admin" : "Worker"), role };
    onLogin(user);
  };

  return (
    <section style={{ padding: 20 }}>
      <h2>Login</h2>
      <form onSubmit={submit}>
        <div>
          <label> Name: </label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label> Role: </label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">Worker</option>
            <option value="admin">Admin / Manager</option>
          </select>
        </div>
        <button type="submit">Log in</button>
      </form>
    </section>
  );
};

export default Login;
