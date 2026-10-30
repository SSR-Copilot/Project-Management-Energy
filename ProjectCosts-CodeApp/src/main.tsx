import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Providers } from "./app/Providers";
import "./styles/global.css";
import "./styles/canvas.css";
import { installGlobalErrorLog } from "./platform/globalErrors";

// Anything nobody handled (a crash outside React, a rejected promise) still reaches the console and the trace buffer.
installGlobalErrorLog();

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
