chrome.runtime.onMessage.addListener((msg: any, sender) => {
  if (msg?.type === "OPEN_PANEL" && sender.tab?.id) {
    console.log("[background] OPEN_PANEL for tab", sender.tab.id);

    chrome.scripting.executeScript(
      {
        target: { tabId: sender.tab.id },
        func: () => {
          // Add a one-time close listener in the PAGE context
          if (!(window as any).__vaAuditCloseHook) {
            (window as any).__vaAuditCloseHook = true;
            window.addEventListener("message", (e) => {
              if (e?.data?.type === "VA_AUDIT_CLOSE") {
                document.getElementById("va-audit-panel-root")?.remove();
              }
            });
          }

          // If the panel is already present, do nothing
          if (document.getElementById("va-audit-panel-root")) return;

          // Create the host container on the page
          const host = document.createElement("div");
          host.id = "va-audit-panel-root";
          Object.assign(host.style, {
            position: "fixed",
            top: "0",
            right: "0",
            width: "420px",
            height: "100vh",
            background: "#fff",
            boxShadow: "0 0 24px rgba(0,0,0,0.25)",
            zIndex: "2147483647",
          });
          document.documentElement.appendChild(host);

          // Load the panel (extension origin) in an iframe
          // @ts-ignore
          const url = chrome.runtime.getURL("panel.html");
          host.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:0;"></iframe>`;
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("[background] inject error:", chrome.runtime.lastError);
        } else {
          console.log("[background] panel injected");
        }
      }
    );
  }
});
