import { useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import RecordsTable from "./RecordsTable.jsx";

const RecordHistory = ({ records, workers = [], showUser = false, onReactToRecord }) => {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("all");
  const [date, setDate] = useState("");
  const [year, setYear] = useState("all");
  const [type, setType] = useState("all");
  const years = [...new Set(records.map((record) => new Date(record.createdAt).getFullYear()).filter(Number.isFinite))]
    .sort((first, second) => second - first);
  const search = query.trim().toLowerCase();
  const filteredRecords = records.filter((record) => {
    const recordDate = new Date(record.createdAt);
    const matchesSearch = !search || `${record.service} ${record.user || ""}`.toLowerCase().includes(search);
    const matchesUser = userId === "all" || record.userId === userId;
    const matchesDate = !date || (!Number.isNaN(recordDate.getTime()) && recordDate.toISOString().slice(0, 10) === date);
    const matchesYear = year === "all" || recordDate.getFullYear() === Number(year);
    const matchesType = type === "all" || (record.type || "income") === type;
    return matchesSearch && matchesUser && matchesDate && matchesYear && matchesType;
  });
  const hasFilters = search || userId !== "all" || date || year !== "all" || type !== "all";

  const clearFilters = () => {
    setQuery("");
    setUserId("all");
    setDate("");
    setYear("all");
    setType("all");
  };

  return (
    <div className="record-history">
      <div className="record-filters" aria-label="Filter records">
        <label className="filter-search"><span>Search records</span><span className="filter-search-input"><FiSearch /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Service or worker" /></span></label>
        {showUser && <label><span>User</span><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="all">All users</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>}
        <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span>Year</span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{years.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option><option value="income">Services</option><option value="expense">Expenditures</option></select></label>
        {hasFilters && <button className="filter-clear" type="button" onClick={clearFilters} aria-label="Clear filters" title="Clear filters"><FiX /></button>}
      </div>
      <p className="filter-result-count">Showing {filteredRecords.length} of {records.length} records</p>
      <RecordsTable records={filteredRecords} showUser={showUser} showSeen={!showUser} onReactToRecord={onReactToRecord} />
    </div>
  );
};

export default RecordHistory;
