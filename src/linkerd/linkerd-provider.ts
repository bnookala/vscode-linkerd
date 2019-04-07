import * as vscode from 'vscode';
import * as json2md from 'json2md';
import * as linkerd from './linkerd';

const ACCESS_SCHEME = 'linkerd';

export function linkerdUri(): vscode.Uri {
    return vscode.Uri.parse(`${ACCESS_SCHEME}://check`);
}

export class LinkerdCheckProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent (uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<string> {
        const checkOutput: linkerd.LinkerdCheckCLIOutput = linkerd.check();

        if (!checkOutput) {
            return "Could not fetch Linkerd check results.";
        }

        const checkMarkup = buildCheckMarkup(
            linkerd.structuredCheckOutput(checkOutput)
        );

        return json2md(checkMarkup);
    }
}

function buildCheckMarkup (checkOutput: linkerd.LinkerdCheck): Array<any> {
    const markup:Array<any> = [
        {
            h2: "VSCode Linkerd: Check Results"
        },
        {
            h3: checkOutput.status.message
        },

    ];

    for (const sectionName of checkOutput.includedSections) {
        const conditions: Array<linkerd.LinkerdCheckCondition> = checkOutput.sections[sectionName];
        markup.push({
            h3: sectionName
        });

        const conditionList = [];

        for (const sectionCondition of conditions) {
            conditionList.push(sectionCondition.message);

            if (!sectionCondition.succeeded && sectionCondition.hint) {
                conditionList.push({
                    ul: [sectionCondition.hint]
                });
            }
        }

        markup.push({
            ul: conditionList
        });
    }

    return markup;
}
