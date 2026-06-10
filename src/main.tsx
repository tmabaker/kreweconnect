import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Global styles
const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #root { height: 100%; width: 100%; }
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
