import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

// iOS Safari のピンチズーム抑止 (§5.5)。touch-action: none で防げない gesture イベントを止める
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

const root = document.getElementById("root");
if (root === null) throw new Error("#root が見つからない");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
