// extension/src/popup/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // re-use the same UI component

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
