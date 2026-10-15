import RecordsTable from "../COMPONENTS/RecordsTable.jsx";

const UserDashboard = ({ user, onLogout }) => {
  const userRecords = [
    { service: "Beard Trim", time: "12:00 PM", amount: "25.00", user: user.name },
  ];

  return (
    <div style={{ padding: 16 }}>
      <h2>Welcome, {user.name}</h2>
      <button onClick={onLogout}>Logout</button>
      <h3>Your Records</h3>
      <RecordsTable records={userRecords} />
    </div>
  );
};

export default UserDashboard;
