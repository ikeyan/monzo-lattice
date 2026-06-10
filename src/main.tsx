import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("#root が見つからない");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
