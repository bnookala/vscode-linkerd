import * as vscode from 'vscode';

export function linkerdPath (): string | undefined {
    return vscode.workspace.getConfiguration().get("linkerd-path");
}

export function linkerdNamespace (): string | undefined {
    return vscode.workspace.getConfiguration().get("linkerd-namespace");
}
