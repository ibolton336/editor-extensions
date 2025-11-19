import * as vscode from "vscode";

export function getHttpProtocolSetting(): "http1" | "http2" {
  const config = vscode.workspace.getConfiguration("konveyor");
  return config.get<"http1" | "http2">("genai.httpProtocol", "http1");
}
