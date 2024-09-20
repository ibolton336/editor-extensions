import React from "react";

interface AppProps {
  view: string;
  vscodeApi: any;
  publicPath: string;
}

const App: React.FC<AppProps> = ({ view, vscodeApi, publicPath }) => {
  return (
    <div>
      <h1>Konveyor GUI</h1>
      <p>This is a React component in your VSCode extension!</p>
      <p>View: {view}</p>
      <p>Public Path: {publicPath}</p>
    </div>
  );
};

export default App;
