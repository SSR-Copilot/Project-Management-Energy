import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Providers, queryClient } from "./app/Providers";
import { startBootPrefetch } from "./app/bootPrefetch";
import "./styles/global.css";
import "./styles/canvas.css";
import { installGlobalErrorLog } from "./platform/globalErrors";

// Anything nobody handled (a crash outside React, a rejected promise) still reaches the console and the trace buffer.
installGlobalErrorLog();

// D119: the first screen's chunk and reads start now, from the URL, beside the host's own
// start-up instead of after it (`app/bootPrefetch.ts`). Not awaited: the first render is never held back.
void startBootPrefetch(queryClient, { hash: window.location.hash, search: window.location.search });

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
