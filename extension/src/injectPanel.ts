func: () => {
  // Only add the listener once
  if (!(window as any).__vaAuditCloseHook) {
    (window as any).__vaAuditCloseHook = true;
    window.addEventListener("message", (e) => {
      if (e?.data?.type === "VA_AUDIT_CLOSE") {
        document.getElementById("va-audit-panel-root")?.remove();
      }
    });
  }

  if (document.getElementById("va-audit-panel-root")) return;

  const host = document.createElement("div");
  host.id = "va-audit-panel-root";
  Object.assign(host.style, {
    position: "fixed", top: "0", right: "0", width: "420px", height: "100vh",
    background: "#fff", boxShadow: "0 0 24px rgba(0,0,0,0.25)", zIndex: "2147483647"
  });
  document.documentElement.appendChild(host);

  // @ts-ignore
  const url = chrome.runtime.getURL("panel.html");
  host.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:0;"></iframe>`;
}
