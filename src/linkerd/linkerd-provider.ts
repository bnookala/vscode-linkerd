import * as vscode from 'vscode';
import * as linkerd from './linkerd';

const ACCESS_SCHEME = 'linkerd';

export function linkerdUri(): vscode.Uri {
    return vscode.Uri.parse(`${ACCESS_SCHEME}://check`);
}

export class LinkerdCheckProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent (uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<string> {
        const checkOutput = linkerd.check();

        if (!checkOutput || checkOutput.code !== 0) {
            return checkOutput.stdout.toString();
        }

        return checkOutput.stdout.toString();
    }
}
