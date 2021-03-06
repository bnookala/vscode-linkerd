import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { linkerdNamespace } from './config';
import { InstallController} from './install';

export enum DashboardType {
    LINKERD = "linkerd",
    GRAFANA = "grafana"
}

export class DashboardController {
    private kubectl: k8s.KubectlV1 | undefined;
    private installController: InstallController | undefined;
    private session: vscode.Disposable | undefined;

    constructor (kubectl: k8s.KubectlV1, installController: InstallController) {
        this.kubectl = kubectl;
        this.installController = installController;
        this.session = undefined;
    }

    openDashboard = async (
        dashboardType: DashboardType,
        namespace?: string,
        pod?: string
    ) => {
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
            const session = await this.kubectl.portForward(dashboardContainer, 'linkerd', 8084, 8084, {
                showInUI: {
                    location: "status-bar",
                    description: "Linkerd Dashboard",
                    onCancel: this.disposeDashboardSession
                }
            });

            if (!session) {
                vscode.window.showErrorMessage("Could not open Linkerd Dashboard");
                return;
            }

            this.session = session;
        }

        if (dashboardType === DashboardType.LINKERD) {
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
        } else {
            // TODO: How do we get to the deployment dashboard?
            if (namespace && pod) {
                vscode.env.openExternal(
                    vscode.Uri.parse(`http://localhost:8084/grafana/d/linkerd-pod/linkerd-pod?var-namespace=${namespace}&var-pod=${pod}`)
                );
            } else {
                vscode.env.openExternal(
                    vscode.Uri.parse(`http://localhost:8084/grafana/?refresh=5s&orgId=1`)
                );
            }
        }
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

    disposeDashboardSession () {
        if (!this.session) {
            return;
        }

        this.session.dispose();
    }
}
