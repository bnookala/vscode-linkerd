import * as vscode from 'vscode';
import * as querystring from 'querystring';
import * as json2md from 'json2md';
import * as check from './check';
import { LinkerdCheckCLIOutput } from './exec';

const ACCESS_SCHEME = 'linkerd';

export enum CheckStage {
    BEFORE_INSTALL = "pre",
    POST_INSTALL = "post"
}

export enum LinkerdFunction {
    CHECK = 'check',
    INSTALL = 'install'
}

export function linkerdCheckUri (stage: string): vscode.Uri {
    return vscode.Uri.parse(`${ACCESS_SCHEME}://check?stage=${stage}`);
}

export function linkerdInstallUri (output: string): vscode.Uri {
    return vscode.Uri.parse(`${ACCESS_SCHEME}://install?output=${output}`);
}

export class DocumentController implements vscode.TextDocumentContentProvider {
    private checkController: check.CheckController | undefined;

    constructor (checkController: check.CheckController) {
        this.checkController = checkController;
    }

    provideTextDocumentContent = (uri: vscode.Uri, _token: vscode.CancellationToken):vscode.ProviderResult<string> => {
        if(uri.authority === LinkerdFunction.CHECK) {
            return this.linkerdCheckDocument(uri);
        } else if (uri.authority === LinkerdFunction.INSTALL) {
            return this.linkerdInstallDocument(uri);
        }
    }

    linkerdInstallDocument = (uri: vscode.Uri): string => {
        const installMarkup = this.buildInstallMarkup(uri.query);
        return json2md(installMarkup);
    }

    linkerdCheckDocument = (uri: vscode.Uri): string | undefined => {
        if (!this.checkController) {
            return;
        }

        const query = querystring.parse(uri.query);
        const checkOutput: LinkerdCheckCLIOutput = this.checkController.check(query.stage as string);

        if (!checkOutput) {
            return "Could not fetch Linkerd check results.";
        }

        const checkMarkup = this.buildCheckMarkup(
            this.checkController.structuredCheckOutput(checkOutput)
        );

        return json2md(checkMarkup);
    }

    buildCheckMarkup = (checkOutput: check.LinkerdCheck): Array<any> => {
        const markup:Array<any> = [
            {
                h2: "VSCode Linkerd: Check Results"
            },
            {
                h3: checkOutput.status.message
            },
        ];

        if (!checkOutput.status.succeeded) {
            markup.push({
                p: "Failed Checks"
            });

            const failedSections = [];
            for (const section of checkOutput.failedSections) {
                // the link here doesn't work, although it should - perhaps a vscode issue.
                failedSections.push({
                    link: {
                        title: section,
                        source: `#${section}`
                    }
                });
            }

            markup.push({
                ul: failedSections
            });
        }

        for (const sectionName of checkOutput.includedSections) {
            const conditions: Array<check.LinkerdCheckCondition> = checkOutput.sections[sectionName];
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

    buildInstallMarkup = (installOutput: string): Array<any> => {
        const markup:Array<any> = [
            {
                h2: "VSCode Linkerd: Install Results"
            },
            {
                code: {
                    content: installOutput
                }
            },
        ];

        return markup;
    }
}
