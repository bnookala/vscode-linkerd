import * as vscode from 'vscode';

const EXTENSION_CONFIG_KEY = 'vscode-linkerd';

export function linkerdPath(): string | undefined {
    return vscode.workspace.getConfiguration(EXTENSION_CONFIG_KEY)[`linkerd-path`];
}
