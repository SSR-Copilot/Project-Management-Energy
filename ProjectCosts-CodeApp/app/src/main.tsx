import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Providers } from "./app/Providers";
import "./styles/global.css";
import "./styles/canvas.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
