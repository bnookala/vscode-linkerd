import * as vscode from 'vscode';
import * as json2md from 'json2md';
import * as linkerd from './linkerd';
import { stringify } from 'querystring';


const ACCESS_SCHEME = 'linkerd';
const SUCCESS_SYMBOL = "√";
const FAIL_SYMBOL = "×";

const FailedCheckHintPrefix = "    "; // Yeah… I know :c - will move this to regex later.


interface LinkerdCheck {
    sections: LinkerdCheckSections;
    status: LinkerdCondition;
}

interface LinkerdCheckSections {
    [key: string]: Array<LinkerdCondition>;
}

interface LinkerdCondition {
    succeeded: boolean;
    message: string;
    hint?: string;
}

export function linkerdUri(): vscode.Uri {
    return vscode.Uri.parse(`${ACCESS_SCHEME}://check`);
}

export class LinkerdCheckProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent (uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<string> {
        const checkOutput = linkerd.check();

        if (!checkOutput) {
            return "Could not fetch Linkerd check results.";
        }

        const output = structuredLinkerdCheckOutput(checkOutput.stdout);
        // TODO: rewrite output to markdown.
        console.log(output);
        return checkOutput.stdout.toString();
    }
}

function structuredLinkerdCheckOutput (stdout: string): LinkerdCheck {
    const statusMessagePrefix = "Status check results are";
    const sections = [
        "kubernetes-api",
        "kubernetes-version",
        "pre-kubernetes-cluster-setup",
        "pre-kubernetes-setup",
        "linkerd-version"
    ];

    const linkerdOutputSections: LinkerdCheckSections = {};
    let linkerdStatus: LinkerdCondition | any = {};

    for (const section of sections) {
        linkerdOutputSections[section] = [];
    }

    const lines = stdout.split('\n');
    let currentSection = '';

    for (let index = 0; index < lines.length; index++) {
        const outputLine = lines[index];
        // Remove whitespace.
        const strippedOutputLine = outputLine.trimRight();

        // Begin section.
        if (sections.includes(strippedOutputLine)) {
            currentSection = strippedOutputLine;
            continue;
        }

        // "------…" line.
        if (strippedOutputLine.startsWith("-")) {
            continue;
        }

        // Status check line.
        if (strippedOutputLine.startsWith(SUCCESS_SYMBOL)) {
            linkerdOutputSections[currentSection].push(checkStatusObject(strippedOutputLine));
            continue;
        }

        // Failed checks will have a hint message associated with them.
        // If they exist, we move the main loop forward by iterating over the hint
        // messages in a nested loop.
        if (strippedOutputLine.startsWith(FAIL_SYMBOL)) {
            const failedCheck = checkStatusObject(strippedOutputLine);
            const failedCheckHints = failedStatusHints(index, lines);

            // Collapse the hint message.
            failedCheck.hint = failedCheckHints.hints.join(' ');
            linkerdOutputSections[currentSection].push(failedCheck);

            // Skip ahead some amount of lines that cover the hint message.
            index = index + failedCheckHints.offset;
            continue;
        }

        // Overall status.
        if (strippedOutputLine.startsWith(statusMessagePrefix)) {
            linkerdStatus = {
                succeeded: strippedOutputLine.endsWith(SUCCESS_SYMBOL) ? true : false,
                message: strippedOutputLine
            };
        }
    }

    return {
        status: linkerdStatus,
        sections: linkerdOutputSections
    };
}

function checkStatusObject (line: string): LinkerdCondition {
    return {
        succeeded: line.startsWith(SUCCESS_SYMBOL) ? true : false,
        message: line
    } as LinkerdCondition;
}

function failedStatusHints (index: number, lines: string[]) {
    let hintIndex = index + 1;
    const hints: string[] = [];

    // Capture hint messages for a failed check.
    for (hintIndex; hintIndex < lines.length; hintIndex++) {
        const hintLine = lines[hintIndex];
        if (hintLine.startsWith(FailedCheckHintPrefix)) {
            hints.push(hintLine.trim());
        } else {
            break;
        }
    }

    return {
        offset: hints.length - 1,// - 1, Since the next iteration of the loop will also increment.
        hints: hints
    };
}
