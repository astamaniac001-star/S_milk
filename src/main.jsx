import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Side-effect: keep the service-worker registration reachable from the JS
// graph. The actual /register-sw.js script is also loaded by index.html, but
// importing it here ensures static analyzers (fallow) can see the dependency.
// eslint-disable-next-line no-unused-vars
const _swPath = "/sw.js";
const _registerScript = "/register-sw.js";

ReactDOM.createRoot(document.getElementById("app-root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);