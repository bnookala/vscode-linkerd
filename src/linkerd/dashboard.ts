import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { InstallController} from './install';

export class DashboardController {
    private kubectl: k8s.KubectlV1 | undefined;
    private installController: InstallController | undefined;
    private session: vscode.Disposable | undefined;

    constructor (kubectl: k8s.KubectlV1, installController: InstallController) {
        this.kubectl = kubectl;
        this.installController = installController;
    }

    openDashboard = async () => {
        if (!this.kubectl || !this.installController) {
            return;
        }

        const isInstalled = await this.installController.isInstalled();

        // Confirm linkerd is installed.
        if (!isInstalled || !isInstalled.succeeded || !isInstalled.result) {
            return;
        }

        // Does port-forward support port-forwarding to services?
        // this.session = await this.kubectl.portForward('svc/linkerd-web', 'linkerd', 8084, 8084);

        // vscode.openBrowserSomehow();
    }
}
