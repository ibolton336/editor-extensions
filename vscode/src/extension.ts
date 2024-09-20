import * as vscode from 'vscode';
import { VsCodeExtension } from './VsCodeExtension';

export function activate(context: vscode.ExtensionContext) {
	try {
		new VsCodeExtension(context);
		console.log('Konveyor extension activated');
	} catch (e) {
		console.error("Error activating Konveyor extension: ", e);
		vscode.window.showErrorMessage(
			"Error activating the Konveyor extension.",
			"Retry"
		).then((selection) => {
			if (selection === "Retry") {
				vscode.commands.executeCommand("workbench.action.reloadWindow");
			}
		});
	}
}

export function deactivate() {}
