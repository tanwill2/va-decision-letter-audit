// Inject a floating button on any page
if (!(window as any).__vaAuditInjected) {
  (window as any).__vaAuditInjected = true;

  const btn = document.createElement("button");
  btn.textContent = "Audit this decision";
  Object.assign(btn.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    padding: "10px 14px",
    borderRadius: "999px",
    border: "none",
    background: "#0b57d0",
    color: "#fff",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(0,0,0,0.2)"
  });
  btn.onclick = () =>
  chrome.runtime.sendMessage({ type: "OPEN_PANEL" as const });
  document.documentElement.appendChild(btn);
}