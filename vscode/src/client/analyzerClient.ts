import { ChildProcessWithoutNullStreams, exec, spawn } from "child_process";
import * as vscode from "vscode";
// import * as rpc from "vscode-jsonrpc/node";
import path from "path";
import { RuleSet } from "../webview/types";
import { processIncidents } from "./analyzerResults";

export class AnalyzerClient {
  private config: vscode.WorkspaceConfiguration | null = null;
  private extContext: vscode.ExtensionContext | null = null;
  private analyzerServer: ChildProcessWithoutNullStreams | null = null;
  private outputChannel: vscode.OutputChannel;
  // private rpcConnection: rpc.MessageConnection | null = null;
  private requestId: number = 1;
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor(context: vscode.ExtensionContext) {
    this.extContext = context;
    this.outputChannel = vscode.window.createOutputChannel("Konveyor-Analyzer");
    this.config = vscode.workspace.getConfiguration("konveyor");
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("konveyor");
  }

  public start(): void {
    if (!this.canAnalyze) {
      return;
    }
    exec("java -version", (err) => {
      if (err) {
        vscode.window.showErrorMessage("Java is not installed. Please install it to continue.");
        return;
      }
    });
    exec("mvn -version", (err) => {
      if (err) {
        vscode.window.showErrorMessage("Maven is not installed. Please install it to continue.");
        return;
      }
    });

    this.analyzerServer = spawn(this.getAnalyzerPath(), this.getAnalyzerArgs(), {
      cwd: this.extContext!.extensionPath,
    });

    this.analyzerServer.stderr.on("data", (data) => {
      this.outputChannel.appendLine(`${data.toString()}`);
    });

    this.analyzerServer.on("exit", (code) => {
      this.outputChannel.appendLine(`Analyzer exited with code ${code}`);
    });
  }

  // Stops the analyzer server
  public stop(): void {
    if (this.analyzerServer) {
      this.analyzerServer.kill();
    }
    // this.rpcConnection = null;
    this.analyzerServer = null;
  }

  public async runAnalysis(webview: vscode.Webview): Promise<any> {
    if (!this.analyzerServer) {
      throw new Error("Server not started");
    }

    if (webview) {
      webview.postMessage({ type: "analysisStarted" });
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Running Analysis",
        cancellable: false,
      },
      async (progress) => {
        return new Promise<void>((resolve, reject) => {
          const request =
            JSON.stringify({
              jsonrpc: "2.0",
              id: this.requestId++,
              method: "analysis_engine.Analyze",
              params: [
                {
                  label_selector: this.getLabelSelector(),
                },
              ],
            }) + "\n";

          this.outputChannel.appendLine(`Preparing to analyze with request: ${request}`);
          progress.report({ message: "Running..." });
          this.analyzerServer?.stdin.write(request);

          const analysisTimeout = setTimeout(() => {
            vscode.window.showErrorMessage("Analysis process timed out.");
            this.outputChannel.appendLine("Analysis process timed out.");
            reject(new Error("Analysis process timed out."));
          }, 300000); // Timeout after 5 minutes

          let rulesets: RuleSet[] = [];
          this.analyzerServer!.stdout.once("data", (data) => {
            clearTimeout(analysisTimeout);
            progress.report({ message: "Analysis complete!" });
            rulesets = data.result["Rulesets"] as RuleSet[];

            const diagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();
            processIncidents(rulesets, diagnosticsMap);

            diagnosticsMap.forEach((diagnostics, fileKey) => {
              const fileUri = vscode.Uri.parse(fileKey);
              this.diagnosticCollection.set(fileUri, diagnostics);
            });
            progress.report({ message: "Results processed!" });

            resolve();
            if (webview) {
              webview.postMessage({
                type: "analysisComplete",
                data: rulesets,
              });
            }
          });
        });
      },
    );
  }

  public async canAnalyze(): Promise<boolean> {
    const labelSelector = this.config!.get("labelSelector") as string;

    if (!labelSelector) {
      const selection = await vscode.window.showErrorMessage(
        "LabelSelector is not configured. Please configure it before starting the analyzer.",
        "Select Sources and Targets",
        "Configure LabelSelector",
        "Cancel",
      );

      switch (selection) {
        case "Select Sources and Targets":
          await vscode.commands.executeCommand("konveyor.configureSourcesTargets");
          break;
        case "Configure LabelSelector":
          await vscode.commands.executeCommand("konveyor.configureLabelSelector");
          break;
      }
      return false;
    }

    if (this.getRules().length === 0) {
      const selection = await vscode.window.showWarningMessage(
        "Default rulesets are disabled and no custom rules are defined. Please choose an option to proceed.",
        "Enable Default Rulesets",
        "Configure Custom Rules",
        "Cancel",
      );

      switch (selection) {
        case "Enable Default Rulesets":
          await this.config!.update(
            "useDefaultRulesets",
            true,
            vscode.ConfigurationTarget.Workspace,
          );
          vscode.window.showInformationMessage("Default rulesets have been enabled.");
          break;
        case "Configure Custom Rules":
          await vscode.commands.executeCommand("konveyor.configureCustomRules");
          break;
      }
      return false;
    }

    return true;
  }

  public getAnalyzerPath(): string {
    return path.join(this.extContext!.extensionPath, "assets/bin/kai-analyzer");
  }

  public getAnalyzerArgs(): string[] {
    return [
      "-source-directory",
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      "-rules-directory",
      this.getRules(),
      "-lspServerPath",
      path.join(this.extContext!.extensionPath, "assets/bin/jdtls/bin/jdtls"),
      "-bundles",
      path.join(
        this.extContext!.extensionPath,
        "assets/bin/jdtls/java-analyzer-bundle/java-analyzer-bundle.core/target/java-analyzer-bundle.core-1.0.0-SNAPSHOT.jar",
      ),
    ];
  }

  public getNumWorkers(): number {
    return this.config!.get("workers") as number;
  }

  public getIncidentLimit(): number {
    return this.config!.get("incidentLimit") as number;
  }

  public getContextLines(): number {
    return this.config!.get("contextLines") as number;
  }

  public getCodeSnipLimit(): number {
    return this.config!.get("codeSnipLimit") as number;
  }

  public getRules(): string {
    return path.join(this.extContext!.extensionPath, "assets/rulesets");
    // const useDefaultRulesets = this.config!.get("useDefaultRulesets") as boolean;
    // const customRules = this.config!.get("customRules") as string[];
    // const rules: string[] = [];

    // if (useDefaultRulesets) {
    //   rules.push(path.join(this.extContext!.extensionPath, "assets/rulesets"));
    // }
    // if (customRules.length > 0) {
    //   rules.push(...customRules);
    // }
    // return rules;
  }

  public getLabelSelector(): string {
    return this.config!.get("labelSelector") as string;
  }

  public getJavaConfig(): object {
    return {
      bundles: path.join(
        this.extContext!.extensionPath,
        "assets/bin/jdtls/java-analyzer-bundle/java-analyzer-bundle.core/target/java-analyzer-bundle.core-1.0.0-SNAPSHOT.jar",
      ),
      lspServerPath: path.join(this.extContext!.extensionPath, "assets/bin/jdtls/bin/jdtls"),
    };
  }
}
