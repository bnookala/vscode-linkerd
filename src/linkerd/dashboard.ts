import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { linkerdNamespace } from './config';
import { InstallController} from './install';

export class DashboardController {
    private kubectl: k8s.KubectlV1 | undefined;
    private installController: InstallController | undefined;
    private session: vscode.Disposable | undefined;

    constructor (kubectl: k8s.KubectlV1, installController: InstallController) {
        this.kubectl = kubectl;
        this.installController = installController;
        this.session = undefined;
    }

    openDashboard = async (namespace?: string, pod?: string) => {
        if (!this.kubectl || !this.installController) {
            return;
        }

        const isInstalled = await this.installController.isInstalled();

        // Confirm linkerd is installed.
        if (!isInstalled || !isInstalled.succeeded || !isInstalled.result) {
            return;
        }

        const dashboardContainer = await this.findWebContainer();

        if (!dashboardContainer) {
            return;
        }

        if (!this.session) {
            this.session = await this.kubectl.portForward(dashboardContainer, 'linkerd', 8084, 8084);
        }

        if (namespace || pod) {
            if (namespace && !pod) {
                vscode.env.openExternal(
                    vscode.Uri.parse(`http://localhost:8084/namespaces/${namespace}`)
                );

                return;
            }

            if (namespace && pod) {
                vscode.env.openExternal(
                    vscode.Uri.parse(`http://localhost:8084/namespaces/${namespace}/pods/${pod}`)
                );

                return;
            }
        }

        vscode.env.openExternal(vscode.Uri.parse("http://localhost:8084"));
        return;
    }

    findWebContainer = async (): Promise<string | void> => {
        if (!this.kubectl || !this.installController) {
            return;
        }

        const shellResult = await this.kubectl.invokeCommand(`get po -l linkerd.io/control-plane-component=web -o json -n ${linkerdNamespace()}`);

        if (!shellResult || shellResult.code !== 0) {
            vscode.window.showErrorMessage("Could not fetch dashboard components.");
            return;
        }

        const shellJson = JSON.parse(shellResult.stdout);

        if (!shellJson.items || shellJson.items.length === 0) {
            return;
        }

        const dashboardContainer = shellJson.items[0];
        const dashboardContainerName = dashboardContainer.metadata.name;

        return dashboardContainerName as string;
    }
}
