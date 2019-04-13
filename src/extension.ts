'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as linkerd from './linkerd/linkerd';
import { isInstalled } from './linkerd/install';
import { linkerdCheckUri, LinkerdDocumentProvider, CheckStage } from './linkerd/provider';

let clusterExplorer: k8s.ClusterExplorerV1 | undefined = undefined;
let kubectl: k8s.KubectlV1 | undefined = undefined;

export async function activate (context: vscode.ExtensionContext) {
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
        vscode.commands.registerCommand('vslinkerd.check', checkLinkerd),
        vscode.workspace.registerTextDocumentContentProvider('linkerd', new LinkerdDocumentProvider())
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
async function installLinkerd (commandTarget: any) {
	const clusterName = clusterNode(commandTarget);
	if (!clusterName) {
		return undefined;
    }

    const installed = await isInstalled(kubectl);

    // Missing kubectl, invocation failed.
    if (!installed.succeeded && !installed.result && installed.message) {
        vscode.window.showErrorMessage(installed.message);
        return;
    }

    if (installed.succeeded && installed.result === false) {
        await linkerd.install(kubectl);
        return;
    }

    vscode.window.showInformationMessage("Linkerd is already installed.");
}

async function checkLinkerd (commandTarget: any) {
	const clusterName = clusterNode(commandTarget);
	if (!clusterName) {
		return undefined;
    }

    const installed = await isInstalled(kubectl);
    let stage:CheckStage = CheckStage.BEFORE_INSTALL;

    // Missing kubectl, invocation failed.
    if (!installed.succeeded && !installed.result && installed.message) {
        vscode.window.showErrorMessage(installed.message);
        return;
    }

    if (installed.succeeded && installed.result) {
        stage = CheckStage.POST_INSTALL;
    }

    await vscode.commands.executeCommand(
        "markdown.showPreview",
        linkerdCheckUri(stage)
    );
}

function clusterNode (commandTarget: any): string | undefined {
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
