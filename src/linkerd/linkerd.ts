import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { CheckStage, linkerdCheckUri } from './provider';
import { gatherCustomConfiguration } from './install';
import { LinkerdCheckCLIOutput, exec } from './exec';

const SUCCESS_SYMBOL = "√";
const FAIL_SYMBOL = "×";
const FailedCheckHintPrefix = "    "; // Yeah… I know :c - will move this to regex later.


export interface LinkerdCheck {
    sections: LinkerdCheckSections;
    status: LinkerdCheckCondition;
    includedSections: Array<string>;
    failedSections: Array<string>;
}

export interface LinkerdCheckSections {
    [key: string]: Array<LinkerdCheckCondition>;
}

export interface LinkerdCheckCondition {
    succeeded: boolean;
    message: string;
    hint?: string;
}

export enum LinkerdCheckType {
    KubernetesApi = "kubernetes-api",
    KubernetesVersion = "kubernetes-version",
    PreKubernetesClusterSetup = "pre-kubernetes-cluster-setup",
    PreKubernetesSetup = "pre-kubernetes-setup",
    LinkerdVersion = "linkerd-version",
    LinkerdExistence = "linkerd-existence"
}

const LinkerdCheckTypes = [
    LinkerdCheckType.KubernetesApi,
    LinkerdCheckType.KubernetesVersion,
    LinkerdCheckType.PreKubernetesClusterSetup,
    LinkerdCheckType.PreKubernetesSetup,
    LinkerdCheckType.LinkerdVersion,
    LinkerdCheckType.LinkerdExistence
] as string[];

export function check (stage: string): LinkerdCheckCLIOutput {
    let checkParam = '';
    if (stage === CheckStage.BEFORE_INSTALL) {
        checkParam = '--pre';
    }

    const out = exec(`check ${checkParam}`);

    if (!out) {
        return;
    }

    return out;
}

/**
 * Initiate the process to install Linkerd. We assume the caller has already made
 * the check to `isInstalled`.
 * @param kubectl
 */
export async function install (kubectl: k8s.KubectlV1 | undefined) {
    if (!kubectl) {
        return;
    }

    const checkOutput = check(CheckStage.BEFORE_INSTALL);

    if (!checkOutput || checkOutput.code !== 0) {
        vscode.window.showErrorMessage("Could not install linkerd - linkerd checks failed.");
        vscode.commands.executeCommand(
            "markdown.showPreview",
            linkerdCheckUri(CheckStage.BEFORE_INSTALL)
        );
        return;
    }


}

/**
 * Hello, dear reader
 * This isn't the best work, but it _does_ work… at least until the Linkerd CLI tool is updated and
 * breaks this. Until the CLI tool has the ability to output in a parseable format, this function
 * takes the output of `linkerd check` and outputs a structured object that can be used in this
 * extension. I apologize for any agony I may have caused.
 *
 * We make the assumption that the output is structured similar to this:
 *
 * ```
 * kubernetes-api
 * --------------
 * √ can initialize the client
 * √ can query the Kubernetes API
 *
 * kubernetes-version
 * ------------------
 * × is running the minimum Kubernetes API version
 *    Kubernetes is on version [1.9.11], but version [1.10.0] or more recent is required
 *    see https://linkerd.io/checks/#k8s-version for hints
 *
 * ...
 * ...
 *
 * Status check results are ×
 * ```
 *
 * Inline comments describe how this "parser" reads this input.
 *
 * @param checkOutput a LinkerdCHeckCLIOutput object captured from running the `check` command above.
 * @returns a LinkerdCheck object
 */
export function structuredCheckOutput (checkOutput: LinkerdCheckCLIOutput): LinkerdCheck {
    const stdout = checkOutput!.stdout;
    const statusMessagePrefix = "Status check results are";

    const linkerdOutputSections: LinkerdCheckSections = {};
    const includedSections: Array<string> = [];
    const failedSections: Array<string> = [];
    let linkerdStatus: LinkerdCheckCondition | any = {};

    const lines = stdout.split('\n');
    let currentSection = '';

    for (let index = 0; index < lines.length; index++) {
        const outputLine = lines[index];

        // Remove only the right whitespace, since the left is used to identify hints.
        const strippedOutputLine = outputLine.trimRight();

        // Begin section.
        if (LinkerdCheckTypes.includes(strippedOutputLine)) {
            currentSection = strippedOutputLine;
            linkerdOutputSections[strippedOutputLine] = [];
            includedSections.push(strippedOutputLine);
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

            if (!failedSections.includes(currentSection)) {
                failedSections.push(currentSection);
            }

            // Collapse the hint message.
            failedCheck.hint = failedCheckHints.hints.join(' ');
            linkerdOutputSections[currentSection].push(failedCheck);

            // Move the main loop forward some amount of lines that cover the hint message.
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
        sections: linkerdOutputSections,
        includedSections: includedSections,
        failedSections: failedSections
    } as LinkerdCheck;
}

function checkStatusObject (line: string): LinkerdCheckCondition {
    return {
        succeeded: line.startsWith(SUCCESS_SYMBOL) ? true : false,
        message: line
    } as LinkerdCheckCondition;
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
        offset: hints.length - 1, // - 1, Since the next iteration of the loop will also increment.
        hints: hints
    };
}
