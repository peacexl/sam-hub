const RecordsTable = ({ records = [] }) => {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>#</th>
          <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Service</th>
          <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Time</th>
          <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Amount (₦)</th>
          <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>User</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: "8px 4px" }}>{i + 1}</td>
            <td style={{ padding: "8px 4px" }}>{r.service}</td>
            <td style={{ padding: "8px 4px" }}>{r.time}</td>
            <td style={{ padding: "8px 4px" }}>{r.amount}</td>
            <td style={{ padding: "8px 4px" }}>{r.user}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default RecordsTable;
