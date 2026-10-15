import { useState } from "react";
import Login from "./pages/Login.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import UserDashboard from "./pages/UserDashboard.jsx";

const App = () => {
	const [user, setUser] = useState(null);

	const handleLogin = (userInfo) => {
		setUser(userInfo);
	};

	const handleLogout = () => setUser(null);

	return (
		<div>
			{!user && <Login onLogin={handleLogin} />}
			{user?.role === "admin" && (
				<AdminDashboard onLogout={handleLogout} />
			)}
			{user?.role === "user" && (
				<UserDashboard user={user} onLogout={handleLogout} />
			)}
		</div>
	);
};

export default App;
