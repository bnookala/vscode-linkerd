import * as vscode from 'vscode';
import * as shelljs from 'shelljs';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as config from './config';

const outputChannel = vscode.window.createOutputChannel("Linkerd");

const exec = (args: string): shelljs.ExecOutputReturnValue | undefined => {
    const binaryPath = config.linkerdPath();

    if (!binaryPath) {
        vscode.window.showErrorMessage("Linkerd binary not found on file system. Please set in workspace settings.");
        return undefined;
    }

    return shelljs.exec(`${binaryPath} ${args}`);
};

export function check () {
    outputChannel.clear();
    const out = exec('check --pre');

    if (!out) {
        return;
    }

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

    const out = exec("install");

    if (!out) {
        return;
    }

    const output = out.stdout.toString();

    vscode.window.showInformationMessage("Linkerd checks passed. Continuing to install.");
}
