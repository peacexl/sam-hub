import RecordsTable from "../COMPONENTS/RecordsTable.jsx";

const sampleRecords = [
  { service: "Classic Haircut + Beard Trim", time: "09:30 AM", amount: "1,240.50", user: "James" },
  { service: "Hot Towel Shave", time: "10:15 AM", amount: "430.20", user: "Carlos" },
  { service: "Fade Cut", time: "11:00 AM", amount: "810.30", user: "Liam" },
];

const AdminDashboard = ({ onLogout }) => {
  return (
    <div style={{ display: "flex", gap: 20, padding: 16 }}>
      <aside style={{ width: 200 }}>
        <nav>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li>Dashboard</li>
            <li>Analytics</li>
            <li>Settings</li>
            <li>
              <button onClick={onLogout}>Logout</button>
            </li>
          </ul>
        </nav>
      </aside>
      <main style={{ flex: 1 }}>
        <h2>Records Overview</h2>
        <RecordsTable records={sampleRecords} />
      </main>
    </div>
  );
};

export default AdminDashboard;
