// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { VsCodeExtension } from './VsCodeExtension';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// TODO(djzager): This was in continue but I couldn't get it to work correctly.
	// const { activateExtension } = await import("./activate");
	try {
		new VsCodeExtension(context);
		console.log('Extension activated');
	} catch (e) {
		console.error("Error activating extension: ", e);
		vscode.window
			.showErrorMessage(
				"Error activating the Konveyor extension.",
				"Retry"
			)
			.then((selection) => {
				if (selection === "Retry") {
					// Reload VS Code window
					vscode.commands.executeCommand("workbench.action.reloadWindow");
				}
			});
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
