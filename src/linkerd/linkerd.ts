import * as vscode from 'vscode';
import * as shelljs from 'shelljs';
import * as k8s from 'vscode-kubernetes-tools-api';

const outputChannel = vscode.window.createOutputChannel("Linkerd");

export function check () {
    outputChannel.clear();
    const out = shelljs.exec("linkerd check --pre");

    const checkOutput = out.stdout.toString();
    outputChannel.append(checkOutput);
    outputChannel.show();

    return out.code;
}

export function install (kubectl: k8s.KubectlV1 | undefined) {
    if (!kubectl) {
        return;
    }

    const outCode = check();

    if (outCode !== 0) {
        vscode.window.showErrorMessage("Could not install linkerd - linkerd checks failed.");
        return;
    }

    const out = shelljs.exec("linkerd install");
    const output = out.stdout.toString();

    vscode.window.showInformationMessage("Linkerd checks passed. Continuing to install.");
}
