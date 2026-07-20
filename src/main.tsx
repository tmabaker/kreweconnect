import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initializeMsal } from "./shared/auth/AuthProvider";

// Global styles
const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #root { height: 100%; width: 100%; }
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; }
`;
document.head.appendChild(style);

const root = createRoot(document.getElementById("root")!);

function render() {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// MSAL (v4) must be initialized before the tree renders, otherwise account/
// token calls throw and the app white-screens (notably on a cold incognito
// cache). If init fails, render anyway so the user sees the sign-in screen
// rather than a blank page.
initializeMsal()
  .catch((err) => {
    console.error("MSAL initialization failed:", err);
  })
  .finally(render);
