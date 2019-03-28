'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as linkerd from './linkerd/linkerd';

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
		vscode.commands.registerCommand('vslinkerd.install', installLinkerd),
        vscode.commands.registerCommand('vslinkerd.check', checkLinkerd)
    ];

    context.subscriptions.push(...subscriptions);
}

/**
 * Installing *should*:
 * - checks if linkerd is installed, return if it is
 * - perform a pre-check, which should render in a document provider
 * - perform an install if the pre-check succeeds, and the user consents
 * - performs a post-check after the installation.
 * @param commandTarget
 */
function installLinkerd (commandTarget: any) {
	const clusterName = clusterNode(commandTarget);
	if (!clusterName) {
		return undefined;
    }

    linkerd.install(kubectl);
}

function checkLinkerd (commandTarget: any) {
	const clusterName = clusterNode(commandTarget);
	if (!clusterName) {
		return undefined;
    }

    linkerd.check();
}

function clusterNode(commandTarget: any): string | undefined {
    if (!commandTarget) {
        return undefined;
	}

    if (!clusterExplorer) {
        return undefined;
    }

    const node = clusterExplorer.resolveCommandTarget(commandTarget);
    if (node) {
        // We install Linkerd at the cluster level, which appears in the
        // cluster explorer as a context node.
        if (node.nodeType === 'context') {
            return node.name;
        }
    }

     return undefined;
}

// this method is called when your extension is deactivated
export function deactivate () {}
