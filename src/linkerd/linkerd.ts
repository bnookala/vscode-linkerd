import * as vscode from 'vscode';
import * as shelljs from 'shelljs';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as config from './config';
import * as provider from './linkerd-provider';

const exec = (args: string): shelljs.ExecOutputReturnValue | undefined => {
    const binaryPath = config.linkerdPath();

    if (!binaryPath) {
        // TODO: can we programatically open workspace settings?
        vscode.window.showErrorMessage("Linkerd binary not found on file system. Please set in workspace settings.");
        return undefined;
    }

    return shelljs.exec(`${binaryPath} ${args}`);
};

export function check (): shelljs.ExecOutputReturnValue | undefined {
    const out = exec('check --pre');

    if (!out) {
        return;
    }

    return out;
}

export function install (kubectl: k8s.KubectlV1 | undefined) {
    if (!kubectl) {
        return;
    }

    const checkOutput = check();

    if (!checkOutput || checkOutput.code !== 0) {
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
