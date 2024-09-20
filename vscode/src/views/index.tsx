import React from "react";
import ReactDOM from "react-dom";
import App from "./App";

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);

// Handle messages from the extension
window.addEventListener("message", (event) => {
  const message = event.data;
  // Handle different message types from your extension
});
