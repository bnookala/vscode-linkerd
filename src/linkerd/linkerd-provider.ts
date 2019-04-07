import * as vscode from 'vscode';
import * as linkerd from './linkerd';

const ACCESS_SCHEME = 'linkerd';

export function linkerdUri(): vscode.Uri {
    return vscode.Uri.parse(`${ACCESS_SCHEME}://check`);
}

export class LinkerdCheckProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent (uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<string> {
        const checkOutput: linkerd.LinkerdCheckOutput = linkerd.check();

        if (!checkOutput) {
            return "Could not fetch Linkerd check results.";
        }

        const output = linkerd.structuredCheckOutput(checkOutput.stdout);

        // TODO: rewrite output to markdown.
        console.log(output);
        return checkOutput.stdout.toString();
    }
}


