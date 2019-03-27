'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';

let clusterExplorer: k8s.ClusterExplorerV1 | undefined = undefined;
let kubectl: k8s.KubectlV1 | undefined = undefined;

export async function activate(context: vscode.ExtensionContext) {
	const clusterExplorerAPI = await k8s.extension.clusterExplorer.v1;
	const kubectlAPI = await k8s.extension.kubectl.v1;

    if (clusterExplorerAPI.available && kubectlAPI.available) {
		clusterExplorer = clusterExplorerAPI.api;
		kubectl = kubectlAPI.api;
    } else {
        vscode.window.showErrorMessage("Unable to access Kubernetes extension");
	}

    const subscriptions = [
        vscode.commands.registerCommand('vscodelinkerd.install', installLinkerd)
    ];

    context.subscriptions.push(...subscriptions);
}

function installLinkerd() {
    console.log("Installing linkerd");
}

// this method is called when your extension is deactivated
export function deactivate() {}
