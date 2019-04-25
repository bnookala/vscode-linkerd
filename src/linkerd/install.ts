import * as vscode from 'vscode';
import * as querystring from 'querystring';
import * as fs from 'fs';
import * as k8s from 'vscode-kubernetes-tools-api';
import { updatedDiff } from 'deep-object-diff';
import { file, FileResult } from 'tmp-promise';
import { linkerdInstallUri } from './provider';
import * as config from './config';
import { exec } from './exec';
import { linkerdCheckUri, CheckStage } from './provider';
import { CheckController, } from './check';


enum LinkerdInstallOptions {
    Install = "Install",
    Cancel = "Cancel",
    Configure = "Configure"
}

enum LinkerdConfigureOptions {
    Yes = "Yes",
    No = "No",
    Reset = "Reset"
}

export interface LinkerdExistence {
    succeeded: boolean;
    result: boolean;
    message?: string;
}

// Not comprehensive. Options (and the default values) are pulled directly from `linkerd install -h`
const defaultCustomConfig = `{
    "api-port": 8086,
    "control-port": 4190,
    "controller-log-level": "info",
    "controller-replicas": 1,
    "controller-uid": 2103,
    "image-pull-policy": "IfNotPresent",
    "inbound-port": 4143,
    "init-image": "gcr.io/linkerd-io/proxy-init",
    "linkerd-version": "stable-2.2.1",
    "metrics-port": 4191,
    "outbound-port": 4140,
    "proxy-auto-inject": "false",
    "proxy-image": "gcr.io/linkerd-io/proxy",
    "proxy-log-level": "info",
    "proxy-uid": 2102,
    "registry": "gcr.io/linkerd-io",
    "skip-inbound-ports": [],
    "skip-outbound-ports": []
}`;

const defaultConfigJson = JSON.parse(defaultCustomConfig);

export class InstallController {
    private kubectl: k8s.KubectlV1;
    private customConfigDocument: vscode.TextDocument | undefined;
    private checkController: CheckController | undefined;

    constructor (kubectl: k8s.KubectlV1, checkController: CheckController) {
        this.kubectl = kubectl;
        this.customConfigDocument = undefined;
        this.checkController = checkController;
    }

    /**
     * Initiate the process to install Linkerd. We assume the caller has already made
     * the check to `isInstalled`.
     */
    install = async () => {
        if (!this.checkController) {
            return;
        }

        const checkOutput = this.checkController.check(CheckStage.BEFORE_INSTALL);

        if (!checkOutput || checkOutput.code !== 0) {
            vscode.window.showErrorMessage("Could not install linkerd - linkerd checks failed.");
            vscode.commands.executeCommand(
                "markdown.showPreview",
                linkerdCheckUri(CheckStage.BEFORE_INSTALL)
            );
            return;
        }

        await this.beginInstall();
    }

    /**
     * Check if Linkerd is installed on the currently selected cluster.
     * @param kubectl
     * @returns LinkerdExistence object
     */
    isInstalled = async (): Promise<LinkerdExistence> => {
        // No Kubectl is always an error.
        if (!this.kubectl) {
            return {
                succeeded: false,
                result: false,
                message: "Kubectl not found."
            };
        }

        const ns = config.linkerdNamespace();
        const nsOut = await this.kubectl.invokeCommand(`get ns ${ns} -o json`);

        // Error invoking Kubectl
        if (!nsOut) {
            return {
                succeeded: false,
                result: false,
                message: "Kubectl invocation failed."
            };
        }

        if (nsOut && nsOut.code !== 0 && nsOut.stderr) {
            // This is actually a success condition in our case
            // since linkerd is _not_ installed, but the operation
            // to determine that was successful.
            if (nsOut.stderr.toString().includes("NotFound")) {
                return {
                    succeeded: true,
                    result: false
                };
            }

            // Otherwise, we want to report the error.
            return {
                succeeded: false,
                result: false,
                message: nsOut.stderr
            };
        }

        // Namespace does exist - Linkerd is installed.
        return {
            succeeded: true,
            result: true
        };
    }

    gatherCustomConfiguration = async () => {
        this.customConfigDocument = await vscode.workspace.openTextDocument({
            language: "json",
            content: defaultCustomConfig
        });

        // Gather custom inputs. Linkerd can be installed with a number of arguments.
        vscode.window.showTextDocument(this.customConfigDocument);
        vscode.workspace.onDidCloseTextDocument(this.configureDocumentClosed);
    }

    configureDocumentClosed = async (e: vscode.TextDocument) => {
        if (!this.customConfigDocument) {
            return;
        }

        if (e.uri !== this.customConfigDocument.uri) {
            return;
        }

        const config = this.customConfigDocument.getText();
        const configJson = JSON.parse(config);
        const updated: {[index:string]: any} = updatedDiff(defaultConfigJson, configJson);
        const configurationOptions:string[] = [];

        Object.keys(updated).forEach(key => {
            const value = updated[key];
            configurationOptions.push(`--${key} ${value}`);
        });

        const configurationOptionsString = configurationOptions.join(" ");

        // Prompt the user, when they close, if they'd like to apply the
        // selected configuration to the install.
        const selection = await vscode.window.showInformationMessage(
            `Install Linkerd with the following configuration: \n ${configurationOptionsString} ?`,
            { modal: true },
            LinkerdConfigureOptions.Reset,
            LinkerdConfigureOptions.No,
            LinkerdConfigureOptions.Yes
        );

        switch (selection) {
            case LinkerdConfigureOptions.No:
                return;
            case LinkerdConfigureOptions.Yes:
                break;
            case LinkerdConfigureOptions.Reset:
                this.customConfigDocument = undefined;
                this.gatherCustomConfiguration();
                return;
            default:
                return;
        }

        this.customConfigDocument = undefined;
        await this.installWithConfiguration(`${configurationOptionsString}`);
    }

    beginInstall = async () => {
        const selection: string | undefined = await vscode.window.showInformationMessage(
            "Linkerd checks passed. Continue to install?",
            LinkerdInstallOptions.Install,
            LinkerdInstallOptions.Configure,
            LinkerdInstallOptions.Cancel
        );

        if (!selection) {
            return;
        }

        switch (selection) {
            case LinkerdInstallOptions.Cancel:
                return;
            case LinkerdInstallOptions.Configure:
                await this.installWithCustomConfiguration();
                return;
            case LinkerdInstallOptions.Install:
                await this.installWithDefaultConfiguration();
                break;
            default:
                vscode.window.showErrorMessage("Could not parse install selection");
                break;
        }
    }

    installWithCustomConfiguration = async () => {
        await this.gatherCustomConfiguration();
    }

    installWithDefaultConfiguration = async () => {
        await this.installWithConfiguration("");
    }

    installWithConfiguration = async (installArguments: string) => {
        const out = exec(`install ${installArguments}`);

        if (!out) {
            return;
        }

        const tempFile: FileResult = await file();
        // TODO: make this file write asynchronous
        const bytesWritten = fs.writeSync(tempFile.fd, out.stdout.toString(), undefined);

        if (bytesWritten === 0) {
            vscode.window.showErrorMessage("Something went wrong attempting to write Linkerd yaml to disk.");
            return;
        }

        // TODO: Operation could take some time - implement withProgress.
        const linkerdInstallCommand = `apply -f ${tempFile.path}`;
        const shellResult: k8s.KubectlV1.ShellResult | undefined = await this.kubectl.invokeCommand(linkerdInstallCommand);

        if (!shellResult || shellResult.code !== 0) {
            vscode.window.showErrorMessage("Could not install Linkerd.");
            return;
        }

        const stringifiedOut = querystring.escape(shellResult.stdout.toString());
        vscode.commands.executeCommand(
            "markdown.showPreview",
            linkerdInstallUri(stringifiedOut)
        );

        // Clean up our tempFile handle.
        tempFile.cleanup();
    }
}
