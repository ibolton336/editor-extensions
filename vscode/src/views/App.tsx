import React, { useEffect, useState } from "react";

interface AppProps {
  view: string;
  vscodeApi: any;
  publicPath: string;
}

const App: React.FC<AppProps> = ({ view, vscodeApi, publicPath }) => {
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case "update":
          setMessage(message.text);
          break;
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const handleButtonClick = () => {
    vscodeApi.postMessage({ command: "alert", text: "Hello from the webview!" });
  };

  return (
    <div>
      <h1>Konveyor GUI</h1>
      <p>This is a React component in your VSCode extension!</p>
      <p>View: {view}</p>
      <p>Public Path: {publicPath}</p>
      <p>Message from extension: {message}</p>
      <button onClick={handleButtonClick}>Send message to extension</button>
    </div>
  );
};

export default App;
