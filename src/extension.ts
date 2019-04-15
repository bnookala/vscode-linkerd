'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { InstallController } from './linkerd/install';
import { CheckController } from './linkerd/check';
import { linkerdCheckUri, DocumentController, CheckStage } from './linkerd/provider';
import { DashboardController } from './linkerd/dashboard';

let kubectl: k8s.KubectlV1 | undefined = undefined;
let clusterExplorer: k8s.ClusterExplorerV1 | undefined = undefined;

let installController: InstallController | undefined = undefined;
let checkController: CheckController | undefined = undefined;
let documentController: DocumentController | undefined = undefined;
let dashboardController: DashboardController | undefined = undefined;

export async function activate (context: vscode.ExtensionContext) {
	const clusterExplorerAPI = await k8s.extension.clusterExplorer.v1;
	const kubectlAPI = await k8s.extension.kubectl.v1;

    if (!clusterExplorerAPI.available ||  !kubectlAPI.available) {
        vscode.window.showErrorMessage("Unable to access Kubernetes extension");
        return;
    }

    clusterExplorer = clusterExplorerAPI.api;
    kubectl = kubectlAPI.api;

    checkController = new CheckController();
    documentController = new DocumentController(checkController);
    installController = new InstallController(kubectl, checkController);
    dashboardController = new DashboardController(kubectl, installController);

    const subscriptions = [
		vscode.commands.registerCommand('vslinkerd.install', installLinkerd),
        vscode.commands.registerCommand('vslinkerd.check', checkLinkerd),
        vscode.commands.registerCommand('vslinkerd.dashboard', openDashboard),
        vscode.workspace.registerTextDocumentContentProvider('linkerd', documentController)
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
	if (!clusterName || !installController || !checkController) {
		return undefined;
    }

    const installed = await installController.isInstalled();

    // Missing kubectl, invocation failed.
    if (!installed.succeeded && !installed.result && installed.message) {
        vscode.window.showErrorMessage(installed.message);
        return;
    }

    if (installed.succeeded && installed.result === false) {
        await installController.install();
        return;
    }

    vscode.window.showInformationMessage("Linkerd is already installed.");
}

async function checkLinkerd (commandTarget: any) {
	const clusterName = clusterNode(commandTarget);
	if (!clusterName || !installController) {
		return undefined;
    }

    const installed = await installController.isInstalled();
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

async function openDashboard (commandTarget: any) {
	const clusterName = clusterNode(commandTarget);
	if (!clusterName || !installController || !dashboardController) {
		return undefined;
    }

    await dashboardController.openDashboard();
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
