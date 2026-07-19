import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Service worker is correctly registered via <script> in index.html.
// No JavaScript-side registration or dummy variables are needed here.

ReactDOM.createRoot(document.getElementById("app-root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
