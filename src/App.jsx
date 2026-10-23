import { useCallback, useEffect, useState } from "react";
import Login from "./pages/Login.jsx";
import EmailAction from "./pages/EmailAction.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import UserDashboard from "./pages/UserDashboard.jsx";
import { patch, post, request } from "./lib/api.js";

const App = () => {
	const [user, setUser] = useState(null);
	const [hasAdmin, setHasAdmin] = useState(false);
	const [workers, setWorkers] = useState([]);
	const [records, setRecords] = useState([]);
	const [loading, setLoading] = useState(true);
	const [serviceError, setServiceError] = useState("");
	const [linkAction, setLinkAction] = useState(() => {
		const parameters = new URLSearchParams(window.location.search);
		if (parameters.has("verify")) return { action: "verify", token: parameters.get("verify") };
		if (parameters.has("reset")) return { action: "reset", token: parameters.get("reset") };
		if (parameters.has("change-email")) return { action: "change-email", token: parameters.get("change-email") };
		return null;
	});

	useEffect(() => {
		let mounted = true;
		try {
			localStorage.removeItem("sam-hub-accounts");
			localStorage.removeItem("sam-hub-records");
		} catch (error) {
			console.warn("Could not clear previous local app data.", error);
		}
		const restoreSession = async () => {
			try {
				const status = await request("/auth/status");
				if (mounted) setHasAdmin(status.adminExists);
				const session = await request("/auth/session");
				if (mounted && session.user) {
					setUser(session.user);
					const [recordsResult, workersResult] = await Promise.all([
						request("/records"),
						session.user.role === "admin" ? request("/admin/workers") : Promise.resolve({ workers: [] }),
					]);
					setRecords(recordsResult.records);
					setWorkers(workersResult.workers);
				}
			} catch {
				if (mounted) setServiceError("The app cannot reach its backend. Start it with npm run dev and refresh this page.");
			} finally {
				if (mounted) setLoading(false);
			}
		};
		restoreSession();
		return () => { mounted = false; };
	}, []);

	useEffect(() => {
		if (!user) return undefined;
		const heartbeat = () => post("/account/session/heartbeat", {}).catch((error) => {
			if (error.status === 401) {
				setServiceError(error.message);
				setUser(null);
			} else {
				console.warn("Could not refresh the active device session.", error);
			}
		});
		const timer = window.setInterval(heartbeat, 60_000);
		return () => window.clearInterval(timer);
	}, [user]);

	const handleAuthenticate = async ({ name, email, password, role, isRegister, rememberMe }) => {
		const result = role === "admin"
			? isRegister
				? await post("/auth/setup-admin", { name, email, password })
				: await post("/auth/login", { email, password, role, rememberMe })
			: isRegister
				? await post("/auth/register", { name, email, password })
				: await post("/auth/login", { email, password, role: "worker", rememberMe });
		if (role === "admin" && isRegister) setHasAdmin(true);

		if (result.user) {
			setUser(result.user);
			setServiceError("");
			if (result.user.role === "admin") setHasAdmin(true);
			const [recordsResult, workersResult] = await Promise.all([
				request("/records"),
				result.user.role === "admin" ? request("/admin/workers") : Promise.resolve({ workers: [] }),
			]);
			setRecords(recordsResult.records);
			setWorkers(workersResult.workers);
		}
		return result;
	};

	const handleLogout = async () => {
		try {
			await post("/auth/logout", {});
		} finally {
			setUser(null);
			setWorkers([]);
			setRecords([]);
		}
	};

	const updateWorker = async (workerId, status) => {
		const result = await patch(`/admin/workers/${workerId}`, { status });
		setWorkers((current) => current.map((worker) => worker.id === workerId ? result.worker : worker));
		return { ok: true };
	};

	const addRecord = async (record) => {
		const result = await post("/records", record);
		setRecords((current) => [result.record, ...current]);
		return { ok: true };
	};

	const addExpenditure = async (expenditure) => {
		const result = await post("/expenditures", expenditure);
		setRecords((current) => [result.record, ...current]);
		return { ok: true };
	};

	const changeAccountPassword = async (currentPassword, nextPassword) => {
		try {
			await patch("/account/password", { currentPassword, nextPassword });
			return { ok: true };
		} catch (error) {
			return { message: error.message };
		}
	};

	const changeAccountEmail = (email, password) => patch("/account/email", { email, password });
	const reactToRecord = async (recordId, reaction) => {
		const result = await patch(`/admin/records/${recordId}/reaction`, { reaction });
		setRecords((current) => current.map((record) => record.id === recordId
			? { ...record, reaction: result.reaction, reactedAt: result.reactedAt }
			: record));
		return result;
	};

	const requestPasswordReset = (email) => post("/auth/forgot-password", { email });
	const resendVerification = (email) => post("/auth/resend-verification", { email });
	const verifyEmail = (code) => post("/auth/verify-email", { code });
	const getAccountSessions = useCallback(() => request("/account/sessions"), []);
	const revokeAccountSession = useCallback(
		(sessionId) => request(`/account/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
		[],
	);
	const finishEmailAction = () => {
		window.history.replaceState({}, "", window.location.pathname);
		setLinkAction(null);
		setUser(null);
	};

	if (loading) return <div className="app-loading">Opening your secure workspace…</div>;

	return (
		<div className="app-shell">
			{linkAction ? <EmailAction action={linkAction.action} token={linkAction.token} onDone={finishEmailAction} /> : <>
				{!user && <Login hasAdmin={hasAdmin} serviceError={serviceError} onAuthenticate={handleAuthenticate} onForgotPassword={requestPasswordReset} onResendVerification={resendVerification} onVerifyEmail={verifyEmail} />}
				{user?.role === "admin" && (
					<AdminDashboard
						admin={user}
						workers={workers}
						records={records}
						onUpdateWorker={updateWorker}
						onAddExpenditure={addExpenditure}
						onChangePassword={changeAccountPassword}
						onChangeEmail={changeAccountEmail}
						onGetSessions={getAccountSessions}
						onRevokeSession={revokeAccountSession}
						onReactToRecord={reactToRecord}
						onLogout={handleLogout}
					/>
				)}
				{user?.role === "worker" && (
					<UserDashboard user={user} records={records} onAddRecord={addRecord} onAddExpenditure={addExpenditure} onChangeEmail={changeAccountEmail} onChangePassword={changeAccountPassword} onGetSessions={getAccountSessions} onRevokeSession={revokeAccountSession} onLogout={handleLogout} />
				)}
			</>}
		</div>
	);
};

export default App;
