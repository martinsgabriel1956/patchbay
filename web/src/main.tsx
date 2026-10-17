import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./features/realtime/notify";
import "./index.css";

// biome-ignore lint/style/noNonNullAssertion: #root existe no index.html
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
