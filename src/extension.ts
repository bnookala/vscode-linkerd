'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as config from './linkerd/config';
import { InstallController } from './linkerd/install';
import { CheckController } from './linkerd/check';
import { linkerdCheckUri, DocumentController, CheckStage } from './linkerd/provider';
import { DashboardController, DashboardType } from './linkerd/dashboard';
import { MeshedResourceExplorer } from './linkerd/explorer';

let kubectl: k8s.KubectlV1 | undefined = undefined;
let clusterExplorer: k8s.ClusterExplorerV1 | undefined = undefined;

let installController: InstallController | undefined = undefined;
let checkController: CheckController | undefined = undefined;
let documentController: DocumentController | undefined = undefined;
let dashboardController: DashboardController | undefined = undefined;
let meshExplorer: MeshedResourceExplorer | undefined = undefined;

enum Selection {
    OPEN_SETTINGS = "Open Settings",
    CANCEL = "Cancel"
}

export async function activate (context: vscode.ExtensionContext) {
	const clusterExplorerAPI = await k8s.extension.clusterExplorer.v1;
	const kubectlAPI = await k8s.extension.kubectl.v1;

    if (!clusterExplorerAPI.available ||  !kubectlAPI.available) {
        vscode.window.showErrorMessage("Unable to access Kubernetes extension");
        return;
    }

    clusterExplorer = clusterExplorerAPI.api;
    kubectl = kubectlAPI.api;

    await checkSettings();

    checkController = new CheckController();
    documentController = new DocumentController(checkController);
    installController = new InstallController(kubectl, checkController);
    dashboardController = new DashboardController(kubectl, installController);
    meshExplorer = new MeshedResourceExplorer(installController);

    clusterExplorer.registerNodeContributor(meshExplorer);


    const subscriptions = [
		vscode.commands.registerCommand('vslinkerd.install', installLinkerd),
        vscode.commands.registerCommand('vslinkerd.check', checkLinkerd),
        vscode.commands.registerCommand('vslinkerd.openLinkerdDashboard', openLinkerdDashboard),
        vscode.commands.registerCommand('vslinkerd.openLinkerdDashboardToPod', openLinkerdDashboardToPod),
        vscode.commands.registerCommand('vslinkerd.openLinkerdDashboardToNamespace', openLinkerdDashboardToNamespace),
        vscode.commands.registerCommand('vslinkerd.openGrafana', openGrafana),
        vscode.commands.registerCommand('vslinkerd.openGrafanaToPod', openGrafanaToPod),
        vscode.workspace.registerTextDocumentContentProvider('linkerd', documentController),
    ];

    context.subscriptions.push(...subscriptions);
}

async function checkSettings() {
    const binaryPath = config.linkerdPath();

    if (binaryPath) {
        return;
    }

    const selection = await vscode.window.showErrorMessage(
        "Linkerd binary not found on file system. Open the extension settings to set?", Selection.OPEN_SETTINGS,
        Selection.CANCEL
    );

    switch (selection) {
        case Selection.OPEN_SETTINGS:
            vscode.commands.executeCommand("workbench.action.openGlobalSettings", true, { query: "vslinkerd.linkerd-path" });
            break;
        case Selection.CANCEL:
        default:
            break;
    }

    return;
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
        return undefined;
    }

    if (installed.succeeded && installed.result === false) {
        await installController.install();
        return undefined;
    }

    vscode.window.showInformationMessage("Linkerd is already installed.");
    return undefined;
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
        return undefined;
    }

    if (installed.succeeded && installed.result) {
        stage = CheckStage.POST_INSTALL;
    }

    await vscode.commands.executeCommand(
        "markdown.showPreview",
        linkerdCheckUri(stage)
    );

    return undefined;
}

async function openLinkerdDashboard (commandTarget: any) {
    if (!commandTarget) {
        vscode.window.showErrorMessage(
            "Right click a Linkerd Service Mesh from the k8s explorer to use the Linkerd dashboard."
        );
        return;
    }

	if (!installController || !dashboardController) {
		return undefined;
    }

    await dashboardController.openDashboard(DashboardType.LINKERD);
    return undefined;
}

async function openLinkerdDashboardToPod (commandTarget: any) {
    if (!commandTarget) {
        vscode.window.showErrorMessage(
            "Right click a Linkerd Pod Resource from the k8s explorer to use the Linkerd dashboard."
        );
        return;
    }

    if (!dashboardController) {
        return;
    }

    const namespace = commandTarget.impl.meshedNamespace;
    const pod = commandTarget.impl.meshedPodName;

    if (!namespace || !pod) {
        return;
    }

    await dashboardController.openDashboard(DashboardType.LINKERD, namespace, pod);
    return;
}

async function openLinkerdDashboardToNamespace (commandTarget: any) {
    if (!commandTarget) {
        vscode.window.showErrorMessage(
            "Right click a Linkerd Namespace Resource from the k8s explorer to use the Linkerd dashboard."
        );
        return;
    }

    if (!dashboardController) {
        return;
    }

    const namespace = commandTarget.impl.meshedNamespace;

    if (!namespace) {
        return;
    }

    await dashboardController.openDashboard(DashboardType.LINKERD, namespace);
    return;
}

async function openGrafana (commandTarget: any) {
    if (!commandTarget) {
        vscode.window.showErrorMessage(
            "Right click a Linkerd Service Mesh in the k8s explorer to use grafana."
        );
    }

	if (!installController || !dashboardController) {
		return undefined;
    }

    await dashboardController.openDashboard(DashboardType.LINKERD);
    return undefined;
}

async function openGrafanaToPod (commandTarget: any) {
    if (!commandTarget) {
        vscode.window.showErrorMessage(
            "Right click a Linkerd Pod Resource from the k8s explorer to use grafana."
        );
        return;
    }

    if (!dashboardController) {
        return;
    }

    const namespace = commandTarget.impl.meshedNamespace;
    const pod = commandTarget.impl.meshedPodName;

    if (!namespace || !pod) {
        return;
    }

    await dashboardController.openDashboard(DashboardType.GRAFANA, namespace, pod);
    return;
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

export function deactivate () {
    if (!dashboardController) {
        return;
    }

    dashboardController.disposeDashboardSession();
}
