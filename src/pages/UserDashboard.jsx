import { useEffect, useRef, useState } from "react";
import { FiBell, FiCheck, FiClock, FiHome, FiLogOut, FiMinus, FiPlus, FiScissors, FiSettings, FiX } from "react-icons/fi";
import { patch, request } from "../lib/api.js";
import AccountSettings from "../Components/AccountSettings.jsx";
import RecordHistory from "../Components/RecordHistory.jsx";

const serviceOptions = {
  adultMen: ["Classic haircut", "Fade cut", "Haircut + beard trim", "Beard trim", "Hot towel shave", "Hairline / shape up"],
  adultWomen: ["Haircut", "Wash and styling", "Hair treatment", "Braids", "Hairline / shape up"],
  children: ["Kids haircut", "Kids fade", "Kids haircut + styling"],
  other: ["Other / custom service"],
};
const groups = [["adultMen", "Adult men"], ["adultWomen", "Adult women"], ["children", "Children"], ["other", "Other"]];
const priceOptions = [500, 1000, 1500, 2000, 2500, 3000, 3500, 5000];
const money = (amount) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount) || 0);

const UserDashboard = ({ user, records, onAddRecord, onChangeEmail, onChangePassword, onLogout }) => {
  const [activeTab, setActiveTab] = useState("home");
  const [clientGroup, setClientGroup] = useState("adultMen");
  const [service, setService] = useState(serviceOptions.adultMen[0]);
  const [customService, setCustomService] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const knownIds = useRef(null);

  const userRecords = records.filter((record) => record.userId === user.id);
  const serviceRecords = userRecords.filter((record) => record.type !== "expense");
  const totalIncome = serviceRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const isCustomService = service === "Other / custom service";
  const serviceName = isCustomService ? customService.trim() : service;
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const selectedGroupServices = serviceOptions[clientGroup];

  useEffect(() => {
    let active = true;
    const loadNotifications = async () => {
      try {
        const result = await request("/notifications");
        if (!active) return;
        const currentIds = new Set(result.notifications.map((notification) => notification.id));
        if (knownIds.current) {
          const newNotification = result.notifications.find((notification) => !knownIds.current.has(notification.id));
          if (newNotification) setToast(newNotification);
        }
        knownIds.current = currentIds;
        setNotifications(result.notifications);
      } catch {
        if (active) setNotifications([]);
      }
    };
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user.id]);

  const changeGroup = (nextGroup) => {
    setClientGroup(nextGroup);
    setService(serviceOptions[nextGroup][0]);
    setCustomService("");
  };

  const openConfirmation = (event) => {
    event.preventDefault();
    setFeedback("");
    if (!serviceName || Number(amount) <= 0) {
      setFeedback("Choose a service and enter an amount.");
      return;
    }
    if ((Number(expenseAmount) > 0 && !expenseDescription.trim()) || (expenseDescription.trim() && Number(expenseAmount) <= 0)) {
      setFeedback("Enter both the expenditure details and amount, or leave both empty.");
      return;
    }
    setConfirmOpen(true);
  };

  const submitRecord = async () => {
    setBusy(true);
    try {
      await onAddRecord({
        service: serviceName,
        amount: Number(amount),
        type: "income",
        expenditureAmount: Number(expenseAmount) || 0,
        expenditureDescription: expenseDescription.trim(),
      });
      setConfirmOpen(false);
      setAmount("");
      setExpenseAmount("");
      setExpenseDescription("");
      setSuccessOpen(true);
    } catch (error) {
      setConfirmOpen(false);
      setFeedback(error.message || "Unable to save this record.");
      setActiveTab("home");
    } finally {
      setBusy(false);
    }
  };

  const setPrice = (value) => setAmount(String(value));
  const changePrice = (delta) => setAmount((current) => String(Math.max(0, (Number(current) || 0) + delta)));

  const markNotificationRead = async (notification) => {
    try {
      await patch(`/notifications/${notification.id}/read`, {});
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      if (toast?.id === notification.id) setToast(null);
    } catch {
      setFeedback("Could not update the notification. Please try again.");
    }
  };

  const localDate = new Date().toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <main className="worker-layout">
      <header className="worker-topbar">
        <div className="worker-brand"><span className="worker-mark"><FiScissors /></span><span><strong>SAM BARBING HUB</strong><small>WORKER PORTAL</small></span></div>
        <div className="worker-topbar-actions"><time className="worker-date" dateTime={new Date().toISOString()}>{localDate}</time><button className="secondary-button" onClick={onLogout}><FiLogOut /> Sign out</button></div>
      </header>

      <section className="worker-content">
        {activeTab === "home" && <>
          <div className="worker-welcome"><div><p className="section-kicker">WORKER DASHBOARD</p><h1>Welcome, {user.name.split(" ")[0]}.</h1><p className="muted-copy">Record a completed service and review your shift.</p></div><span className="worker-account-pill"><i /> APPROVED ACCOUNT</span></div>
          {toast && <button className="notification-toast" onClick={() => { setActiveTab("history"); markNotificationRead(toast); }}><FiBell /><span><strong>New reaction</strong><small>{toast.message}</small></span><FiX onClick={(event) => { event.stopPropagation(); setToast(null); }} /></button>}
          <div className="worker-stats"><article className="metric-card"><span className="metric-icon metric-gold"><FiScissors /></span><div className="metric-copy"><span>Services recorded</span><strong>{serviceRecords.length}</strong><small>All time</small></div></article><article className="metric-card"><span className="metric-icon metric-green"><FiPlus /></span><div className="metric-copy"><span>Recorded income</span><strong>{money(totalIncome)}</strong><small>Your service total</small></div></article></div>
          <section className="panel worker-entry-panel">
            <div className="panel-heading"><div><p className="section-kicker">NEW ENTRY</p><h2>Record a service</h2></div><span className="summary-icon"><FiPlus /></span></div>
            <form className="worker-record-form" onSubmit={openConfirmation}>
              <fieldset className="client-group-fieldset"><legend>Client group</legend><div className="client-group-options">{groups.map(([value, label]) => <label className={`client-group-option ${clientGroup === value ? "selected" : ""}`} key={value}><input type="radio" name="client-group" value={value} checked={clientGroup === value} onChange={() => changeGroup(value)} /><span>{label}</span></label>)}</div></fieldset>
              {!isCustomService ? <label>Service<select required value={service} onChange={(event) => setService(event.target.value)}>{selectedGroupServices.map((option) => <option key={option} value={option}>{option}</option>)}<option value="Other / custom service">Other / custom service</option></select></label> : <label>Other service<input autoFocus required maxLength="120" value={customService} onChange={(event) => setCustomService(event.target.value)} placeholder="Describe the service" /></label>}
              <label>AMOUNT<span className="amount-entry"><button className="amount-step" type="button" aria-label="Reduce amount by 500 naira" onClick={() => changePrice(-500)}><FiMinus /></button><span className="amount-input-wrap"><span>₦</span><input required min="500" max="1000000000" step="500" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></span><button className="amount-step" type="button" aria-label="Increase amount by 500 naira" onClick={() => changePrice(500)}><FiPlus /></button></span></label>
              <div className="price-board" aria-label="Common service prices">{priceOptions.map((price) => <button className={Number(amount) === price ? "selected" : ""} type="button" key={price} aria-pressed={Number(amount) === price} onClick={() => setPrice(price)}>{price.toLocaleString("en-NG")}</button>)}</div>
              <fieldset className="worker-expense-fieldset"><legend>EXPENDITURE <small>Optional</small></legend><label>What was it for?<input maxLength="120" value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Write the expense in words" /></label><label>Amount in naira<input min="0" max="1000000000" step="1" type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0" /></label></fieldset>
              {feedback && <p className="form-message" role="alert">{feedback}</p>}
              <button className="primary-button worker-submit" type="submit"><FiCheck /> Review record</button>
            </form>
          </section>
        </>}

        {activeTab === "history" && <>
          {notifications.length > 0 && <section className="panel worker-notification-panel"><div className="panel-heading"><div><p className="section-kicker">UPDATES</p><h2>Notifications</h2></div><span className="record-count">{unreadCount} unread</span></div><div className="worker-notifications">{notifications.map((notification) => <button className={`worker-notification ${notification.readAt ? "" : "unread"}`} key={notification.id} onClick={() => markNotificationRead(notification)}><FiBell /><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</small></button>)}</div></section>}
          <section className="panel worker-records-panel worker-history-view"><div className="panel-heading"><div><p className="section-kicker">YOUR ACTIVITY</p><h2>Record history</h2></div><span className="record-count">{userRecords.length} total</span></div><RecordHistory records={userRecords} /></section>
        </>}

        {activeTab === "settings" && <section className="worker-settings-view"><div className="page-intro"><div><p className="section-kicker">ACCOUNT PREFERENCES</p><h2>Settings</h2><p className="muted-copy">Change the email or password you use to sign in.</p></div></div><AccountSettings email={user.email} onChangeEmail={onChangeEmail} onChangePassword={onChangePassword} /></section>}
      </section>

      <nav className="worker-bottom-nav" aria-label="Worker pages">
        <button className={activeTab === "home" ? "selected" : ""} aria-current={activeTab === "home" ? "page" : undefined} onClick={() => setActiveTab("home")}><FiHome /><span>Home</span></button>
        <button className={activeTab === "history" ? "selected" : ""} aria-current={activeTab === "history" ? "page" : undefined} onClick={() => setActiveTab("history")}><span className="worker-nav-icon"><FiClock />{unreadCount > 0 && <i>{unreadCount}</i>}</span><span>Record history</span></button>
        <button className={activeTab === "settings" ? "selected" : ""} aria-current={activeTab === "settings" ? "page" : undefined} onClick={() => setActiveTab("settings")}><FiSettings /><span>Settings</span></button>
      </nav>

      {confirmOpen && <div className="modal-backdrop"><section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-record-title"><div className="modal-heading"><span className="modal-mark"><FiCheck /></span><button className="icon-button" aria-label="Close confirmation" onClick={() => setConfirmOpen(false)}><FiX /></button></div><p className="section-kicker">CONFIRM ENTRY</p><h2 id="confirm-record-title">Submit this record?</h2><div className="confirmation-details"><div><span>Client group</span><strong>{groups.find(([group]) => group === clientGroup)?.[1]}</strong></div><div><span>Service</span><strong>{serviceName}</strong></div><div><span>Amount</span><strong>{money(amount)}</strong></div>{Number(expenseAmount) > 0 && <div><span>Expenditure</span><strong>{expenseDescription} · {money(expenseAmount)}</strong></div>}</div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setConfirmOpen(false)}>Go back</button><button className="primary-button" type="button" disabled={busy} onClick={submitRecord}>{busy ? "Submitting…" : "Confirm submission"}</button></div></section></div>}
      {successOpen && <div className="modal-backdrop"><section className="confirmation-modal success-modal" role="dialog" aria-modal="true" aria-labelledby="record-success-title"><span className="modal-mark"><FiCheck /></span><p className="section-kicker">RECORD SAVED</p><h2 id="record-success-title">Submission complete</h2><p className="muted-copy">Your service and any expenditure were added to your record history.</p><button className="primary-button" type="button" onClick={() => setSuccessOpen(false)}>Done</button></section></div>}
    </main>
  );
};

export default UserDashboard;
