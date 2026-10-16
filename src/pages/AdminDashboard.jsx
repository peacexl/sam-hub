import { useMemo, useState } from "react";
import {
  FiActivity, FiArrowDownRight, FiArrowUpRight, FiBarChart2, FiCheck,
  FiChevronRight, FiClock, FiDollarSign, FiEye, FiHome, FiLogOut,
  FiPlus, FiScissors, FiSettings, FiUsers, FiX,
} from "react-icons/fi";
import brandLogo from "../assets/SAMBARBINGHUB NBG.png";
import RecordsTable from "../Components/RecordsTable.jsx";
import RecordHistory from "../Components/RecordHistory.jsx";
import AccountSettings from "../Components/AccountSettings.jsx";

const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0,
}).format(value || 0);
const sameDay = (left, right) => left.toDateString() === right.toDateString();
const startOfWeek = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
};
const toDate = (record) => new Date(record.createdAt || Date.now());

const periodPoints = (range) => {
  const now = new Date();
  if (range === "day") {
    return Array.from({ length: 12 }, (_, index) => {
      const hour = index + 8;
      return { key: String(hour), label: hour % 12 || 12, shortLabel: `${hour % 12 || 12}${hour < 12 ? "a" : "p"}` };
    });
  }
  if (range === "week") {
    const monday = startOfWeek(now);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return { key: date.toDateString(), label: date.toLocaleDateString("en", { weekday: "short" }), shortLabel: date.toLocaleDateString("en", { weekday: "short" }) };
    });
  }
  if (range === "month") {
    const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), index + 1);
      return { key: date.toDateString(), label: index + 1, shortLabel: index % 5 === 0 ? String(index + 1) : "" };
    });
  }
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), index, 1);
    return { key: String(index), label: date.toLocaleDateString("en", { month: "short" }), shortLabel: date.toLocaleDateString("en", { month: "short" }) };
  });
};

const belongsToPoint = (record, range, point) => {
  const date = toDate(record);
  if (range === "day") return sameDay(date, new Date()) && String(date.getHours()) === point.key;
  if (range === "week" || range === "month") return date.toDateString() === point.key;
  return date.getFullYear() === new Date().getFullYear() && String(date.getMonth()) === point.key;
};

const AdminDashboard = ({ admin, workers, records, onUpdateWorker, onAddRecord, onChangeEmail, onChangePassword, onReactToRecord, onLogout }) => {
  const [activePage, setActivePage] = useState("Overview");
  const [range, setRange] = useState("week");
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const todayRecords = records.filter((record) => sameDay(toDate(record), new Date()));
  const todayIncome = todayRecords.filter((record) => record.type !== "expense").reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const todayExpenses = todayRecords.filter((record) => record.type === "expense").reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const serviceCount = todayRecords.filter((record) => record.type !== "expense").length;

  const chart = useMemo(() => {
    const points = periodPoints(range);
    return points.map((point) => {
      const bucket = records.filter((record) => belongsToPoint(record, range, point));
      return {
        ...point,
        income: bucket.filter((record) => record.type !== "expense").reduce((sum, record) => sum + Number(record.amount || 0), 0),
        expense: bucket.filter((record) => record.type === "expense").reduce((sum, record) => sum + Number(record.amount || 0), 0),
        services: bucket.filter((record) => record.type !== "expense").length,
      };
    });
  }, [range, records]);
  const chartMax = Math.max(1, ...chart.flatMap((item) => [item.income, item.expense]));

  const addExpense = async (event) => {
    event.preventDefault();
    if (!expenseTitle.trim() || Number(expenseAmount) <= 0) return;
    try {
      await onAddRecord({ service: expenseTitle.trim(), amount: Number(expenseAmount), type: "expense" });
      setExpenseTitle("");
      setExpenseAmount("");
      setShowExpenseForm(false);
      setActionMessage("");
    } catch (error) {
      setActionMessage(error.message || "Unable to save the expense.");
    }
  };

  const updateWorker = async (workerId, status) => {
    try {
      await onUpdateWorker(workerId, status);
      setActionMessage("");
    } catch (error) {
      setActionMessage(error.message || "Unable to update this account.");
    }
  };

  const reactToRecord = async (recordId, reaction) => {
    try {
      await onReactToRecord(recordId, reaction);
      setActionMessage("");
    } catch (error) {
      setActionMessage(error.message || "Unable to react to this record.");
    }
  };

  const navItems = [
    { label: "Overview", icon: FiHome },
    { label: "Records", icon: FiDollarSign },
    { label: "Analytics", icon: FiBarChart2 },
    { label: "Users", icon: FiUsers },
    { label: "Settings", icon: FiSettings },
  ];

  const workerSummary = workers.map((worker) => {
    const workerRecords = records.filter((record) => record.userId === worker.id && record.type !== "expense" && chart.some((point) => belongsToPoint(record, range, point)));
    return {
      ...worker,
      services: workerRecords.length,
      income: workerRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0),
    };
  });

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <a className="sidebar-brand" href="#overview" onClick={() => setActivePage("Overview")}>
          <img src={brandLogo} alt="" />
          <span><strong>SAM BARBING</strong><small>MANAGER HUB</small></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Manager navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activePage === label ? "is-active" : ""}`} onClick={() => setActivePage(label)}>
              <Icon /><span>{label}</span>{label === "Users" && workers.filter((worker) => worker.status === "pending").length > 0 && <i>{workers.filter((worker) => worker.status === "pending").length}</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-profile">
          <span className="profile-avatar">{admin.name.slice(0, 1).toUpperCase()}</span>
          <span className="profile-copy"><strong>{admin.name}</strong><small>Administrator</small></span>
          <button className="icon-button sidebar-logout" title="Log out" aria-label="Log out" onClick={onLogout}><FiLogOut /></button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div><span className="topbar-kicker">SAM BARBING HUB <span>/</span> {activePage.toUpperCase()}</span><h1>{activePage === "Overview" ? "Shop overview" : activePage}</h1></div>
          <div className="topbar-right"><span className="live-pill"><i /> LIVE TODAY</span><time className="today-label" dateTime={new Date().toISOString()}>{new Date().toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</time><button className="icon-button mobile-logout" title="Log out" aria-label="Log out" onClick={onLogout}><FiLogOut /></button></div>
        </header>

        {activePage === "Overview" && (
          <section className="page-content">
            <div className="welcome-row"><div><p className="section-kicker">YOUR BUSINESS, AT A GLANCE</p><h2>Good day, {admin.name.split(" ")[0]}.</h2><p className="muted-copy">Here is what is happening at the shop today.</p></div><button className="secondary-button" onClick={() => { setActivePage("Records"); setShowExpenseForm(true); }}><FiPlus /> Add expenditure</button></div>
            <div className="metric-grid">
              <Metric icon={FiArrowUpRight} label="Daily income" value={money(todayIncome)} note="Recorded services today" tone="gold" />
              <Metric icon={FiArrowDownRight} label="Daily expenditure" value={money(todayExpenses)} note="Expenses logged today" tone="rose" />
              <Metric icon={FiActivity} label="Available balance" value={money(todayIncome - todayExpenses)} note="Income less today's expenses" tone="green" />
              <Metric icon={FiScissors} label="Services today" value={serviceCount} note="Services recorded by workers" tone="ink" />
            </div>
            <div className="content-grid">
              <section className="panel chart-panel">
                <div className="panel-heading"><div><p className="section-kicker">SHOP PERFORMANCE</p><h3>Income & expenditure</h3></div><RangeSelect value={range} onChange={setRange} /></div>
                <div className="chart-legend"><span><i className="legend-income" /> Income</span><span><i className="legend-expense" /> Expenditure</span></div>
                <div className="bar-chart" role="img" aria-label={`Income and expenditure by ${range}`}>
                  {chart.map((point) => <div className="bar-column" key={point.key} title={`${point.label}: income ${money(point.income)}, expenditure ${money(point.expense)}`}>
                    <div className="bar-pair"><span className="bar-income" style={{ height: `${Math.max(point.income ? 4 : 0, point.income / chartMax * 100)}%` }} /><span className="bar-expense" style={{ height: `${Math.max(point.expense ? 4 : 0, point.expense / chartMax * 100)}%` }} /></div><small>{point.shortLabel}</small>
                  </div>)}
                </div>
                <div className="chart-footnote"><FiActivity /> Totals are based on recorded transactions</div>
              </section>
              <section className="panel today-panel">
                <div className="panel-heading"><div><p className="section-kicker">TODAY</p><h3>Daily summary</h3></div><span className="summary-icon"><FiClock /></span></div>
                <div className="summary-list"><SummaryItem label="Income" value={money(todayIncome)} tone="gold" /><SummaryItem label="Expenditure" value={money(todayExpenses)} tone="rose" /><SummaryItem label="Available balance" value={money(todayIncome - todayExpenses)} tone="green" /><SummaryItem label="Services recorded" value={serviceCount} /></div>
                <button className="panel-link" onClick={() => setActivePage("Records")}>View all records <FiChevronRight /></button>
              </section>
            </div>
            <section className="panel recent-panel"><div className="panel-heading"><div><p className="section-kicker">LATEST ACTIVITY</p><h3>Recent records</h3></div><button className="panel-link" onClick={() => setActivePage("Records")}>All records <FiChevronRight /></button></div><RecordsTable records={records.slice(0, 5)} /></section>
          </section>
        )}

        {activePage === "Records" && (
          <section className="page-content">
            <div className="page-intro"><div><p className="section-kicker">SHOP LEDGER</p><h2>All records</h2><p className="muted-copy">Service and expenditure entries from your team.</p></div><button className="primary-button" onClick={() => setShowExpenseForm(!showExpenseForm)}><FiPlus /> Record expenditure</button></div>
            {showExpenseForm && <form className="inline-form panel" onSubmit={addExpense}><label>Expense description<input required value={expenseTitle} onChange={(event) => setExpenseTitle(event.target.value)} placeholder="e.g. Clippers and supplies" /></label><label>Amount in naira<input required min="1" type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0" /></label><button className="primary-button" type="submit">Save expense</button><button className="icon-button" type="button" aria-label="Cancel" onClick={() => setShowExpenseForm(false)}><FiX /></button></form>}
            {actionMessage && <p className="auth-notice" role="alert">{actionMessage}</p>}
            <section className="panel table-panel">{actionMessage && <p className="auth-notice" role="alert">{actionMessage}</p>}<RecordHistory records={records} workers={workers} showUser onReactToRecord={reactToRecord} /></section>
          </section>
        )}

        {activePage === "Analytics" && (
          <section className="page-content">
            <div className="page-intro"><div><p className="section-kicker">PERFORMANCE REPORT</p><h2>Analytics</h2><p className="muted-copy">Compare income, expenditures, service volume and worker performance.</p></div><RangeSelect value={range} onChange={setRange} /></div>
            <div className="analytics-summary"><Metric icon={FiArrowUpRight} label="Income in period" value={money(chart.reduce((sum, point) => sum + point.income, 0))} tone="gold" /><Metric icon={FiArrowDownRight} label="Expenditure in period" value={money(chart.reduce((sum, point) => sum + point.expense, 0))} tone="rose" /><Metric icon={FiUsers} label="Approved workers" value={workers.filter((worker) => worker.status === "approved").length} tone="ink" /><Metric icon={FiScissors} label="Customers served" value={chart.reduce((sum, point) => sum + point.services, 0)} tone="green" /></div>
            <section className="panel chart-panel analytics-chart"><div className="panel-heading"><div><p className="section-kicker">TRANSACTION FLOW</p><h3>Income & expenditure</h3></div><RangeSelect value={range} onChange={setRange} /></div><div className="chart-legend"><span><i className="legend-income" /> Income</span><span><i className="legend-expense" /> Expenditure</span></div><div className="bar-chart" role="img" aria-label={`Income and expenditure by ${range}`}>{chart.map((point) => <div className="bar-column" key={point.key} title={`${point.label}: ${money(point.income)} income, ${money(point.expense)} expenditure`}><div className="bar-pair"><span className="bar-income" style={{ height: `${Math.max(point.income ? 4 : 0, point.income / chartMax * 100)}%` }} /><span className="bar-expense" style={{ height: `${Math.max(point.expense ? 4 : 0, point.expense / chartMax * 100)}%` }} /></div><small>{point.shortLabel}</small></div>)}</div></section>
            <section className="panel worker-analytics"><div className="panel-heading"><div><p className="section-kicker">CUSTOMER ACTIVITY</p><h3>Customers served by {range}</h3><p className="muted-copy">Each service entry counts as one visit; customer names are not collected.</p></div></div><div className="visits-chart">{chart.map((point) => <div className="visit-column" key={point.key} title={`${point.label}: ${point.services} visits`}><b>{point.services || ""}</b><span style={{ height: `${Math.max(point.services ? 5 : 0, point.services / Math.max(1, ...chart.map((item) => item.services)) * 100)}%` }} /><small>{point.shortLabel}</small></div>)}</div></section>
            <section className="panel worker-analytics"><div className="panel-heading"><div><p className="section-kicker">TEAM PERFORMANCE</p><h3>Individual worker summary</h3><p className="muted-copy">Service totals and income for the selected {range}.</p></div></div><div className="worker-summary-grid">{workerSummary.filter((worker) => worker.status === "approved").map((worker) => <div className="worker-summary" key={worker.id}><span className="profile-avatar">{worker.name.slice(0, 1).toUpperCase()}</span><div className="worker-summary-info"><strong>{worker.name}</strong><small>{worker.services} services recorded</small></div><b>{money(worker.income)}</b></div>)}{workerSummary.filter((worker) => worker.status === "approved").length === 0 && <p className="empty-copy">Approved workers and their activity will appear here.</p>}</div></section>
          </section>
        )}

        {activePage === "Users" && (
          <section className="page-content">
            <div className="page-intro"><div><p className="section-kicker">ACCESS & APPROVALS</p><h2>Worker accounts</h2><p className="muted-copy">Approve new accounts, manage access and review worker records.</p></div><span className="user-count">{workers.length} {workers.length === 1 ? "account" : "accounts"}</span></div>
            <section className="panel table-panel"><div className="panel-heading"><div><p className="section-kicker">TEAM ACCESS</p><h3>All worker accounts</h3></div></div>{actionMessage && <p className="auth-notice" role="alert">{actionMessage}</p>}<div className="responsive-table"><table className="data-table"><thead><tr><th>Worker</th><th>Email</th><th>Status</th><th>Records</th><th>Actions</th></tr></thead><tbody>{workers.map((worker) => <tr key={worker.id}><td><span className="table-person"><span className="profile-avatar small-avatar">{worker.name.slice(0, 1).toUpperCase()}</span><strong>{worker.name}</strong></span></td><td>{worker.email}</td><td><span className={`status-badge status-${worker.status}`}>{worker.status}</span></td><td>{records.filter((record) => record.userId === worker.id).length}</td><td><div className="table-actions"><button className="small-action" onClick={() => setSelectedWorker(selectedWorker?.id === worker.id ? null : worker)}><FiEye /> View</button>{worker.status !== "approved" ? <button className="small-action action-approve" onClick={() => updateWorker(worker.id, "approved")}><FiCheck /> Approve</button> : <button className="small-action action-disable" onClick={() => updateWorker(worker.id, "disabled")}><FiX /> Disable</button>}{worker.status === "disabled" && <button className="small-action action-approve" onClick={() => updateWorker(worker.id, "approved")}><FiCheck /> Enable</button>}</div></td></tr>)}</tbody></table>{workers.length === 0 && <p className="empty-copy table-empty">No worker accounts yet. New sign-ups will appear here for approval.</p>}</div></section>
            {selectedWorker && <section className="panel selected-worker-panel"><div className="panel-heading"><div><p className="section-kicker">WORKER RECORDS</p><h3>{selectedWorker.name}</h3></div><button className="icon-button" aria-label="Close worker records" onClick={() => setSelectedWorker(null)}><FiX /></button></div><RecordsTable records={records.filter((record) => record.userId === selectedWorker.id)} /></section>}
          </section>
        )}

        {activePage === "Settings" && (
          <section className="page-content settings-content"><div className="page-intro"><div><p className="section-kicker">ACCOUNT SECURITY</p><h2>Manager settings</h2><p className="muted-copy">Manage your sign-in address and password.</p></div></div><AccountSettings email={admin.email} onChangeEmail={onChangeEmail} onChangePassword={onChangePassword} /><button className="logout-link" onClick={onLogout}><FiLogOut /> Sign out of manager account</button></section>
        )}
        <footer className="dashboard-footer"><span>© {new Date().getFullYear()} SAM BARBING HUB</span><span>NAIRA LEDGER · PRIVATE WORKSPACE</span></footer>
      </main>
    </div>
  );
};

const Metric = ({ icon: Icon, label, value, note, tone }) => <article className="metric-card"><span className={`metric-icon metric-${tone}`}><Icon /></span><div className="metric-copy"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div></article>;
const SummaryItem = ({ label, value, tone = "" }) => <div className="summary-item"><span><i className={tone ? `summary-dot ${tone}` : "summary-dot"} />{label}</span><strong>{value}</strong></div>;
const RangeSelect = ({ value, onChange }) => <div className="range-control" role="group" aria-label="Analytics time range">{[["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]].map(([key, label]) => <button key={key} className={value === key ? "selected" : ""} onClick={() => onChange(key)}>{label}</button>)}</div>;

export default AdminDashboard;
