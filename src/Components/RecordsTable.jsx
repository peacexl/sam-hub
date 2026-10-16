import { FiHeart } from "react-icons/fi";

const RecordsTable = ({ records = [], showUser = false, showSeen = false, onReactToRecord }) => {
  const formatAmount = (amount) => new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

  return (
    <div className="responsive-table">
      <table className="data-table">
        <thead><tr><th>#</th><th>Service</th><th>Date & time</th><th>Amount</th>{showUser && <th>User</th>}{(showSeen || onReactToRecord) && <th>Seen</th>}</tr></thead>
        <tbody>{records.map((record, index) => {
          const createdAt = record.createdAt ? new Date(record.createdAt) : null;
          return <tr key={record.id || `${record.service}-${index}`}>
            <td className="row-number">{String(index + 1).padStart(2, "0")}</td>
            <td><span className="service-cell">{record.service}{record.type === "expense" && <small>EXPENSE</small>}</span></td>
            <td>{createdAt && !Number.isNaN(createdAt.getTime()) ? <span className="record-date-time"><strong>{createdAt.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}</strong><small>{createdAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</small></span> : "—"}</td>
            <td className={record.type === "expense" ? "amount-expense" : "amount-income"}>{record.type === "expense" ? "−" : ""}{formatAmount(record.amount)}</td>
            {showUser && <td>{record.user || "Manager"}</td>}
            {(showSeen || onReactToRecord) && <td>{onReactToRecord ? <button className={`record-react-button ${record.reaction === "like" ? "is-reacted" : ""}`} type="button" aria-label={record.reaction === "like" ? "Remove reaction" : "React to record"} onClick={() => onReactToRecord(record.id, record.reaction === "like" ? null : "like")}><FiHeart /> {record.reaction === "like" ? "Seen" : "React"}</button> : record.reaction === "like" ? <span className="record-seen"><FiHeart /> Seen</span> : "—"}</td>}
          </tr>;
        })}</tbody>
      </table>
      {records.length === 0 && <p className="empty-copy table-empty">No records yet. New activity will appear here.</p>}
    </div>
  );
};

export default RecordsTable;
