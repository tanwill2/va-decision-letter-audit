export default function App() {
  const handleClose = () => window.parent.postMessage({ type: "VA_AUDIT_CLOSE" }, "*");
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", height: "100%" }}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #eee"}}>
        <strong>VA Decision Letter Audit</strong>
        <button onClick={handleClose}>✕</button>
      </header>
      <main style={{ padding: 16 }}>
        <h3>Stage 1 Panel</h3>
        <p>This is the on-page side panel. Next we’ll hook up PDF reading and summaries.</p>
        <ul>
          <li>Detect PDF / VA.gov decision page</li>
          <li>Summarize conditions, ratings, effective dates</li>
          <li>Plain-English “what this means”</li>
        </ul>
      </main>
    </div>
  );
}
