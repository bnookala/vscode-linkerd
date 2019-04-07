import * as vscode from 'vscode';
import * as shelljs from 'shelljs';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as config from './config';
import * as provider from './linkerd-provider';
import { type } from 'os';

const SUCCESS_SYMBOL = "√";
const FAIL_SYMBOL = "×";
const FailedCheckHintPrefix = "    "; // Yeah… I know :c - will move this to regex later.

export interface LinkerdCheck {
    sections: LinkerdCheckSections;
    status: LinkerdCondition;
}

export interface LinkerdCheckSections {
    [key: string]: Array<LinkerdCondition>;
}

export interface LinkerdCondition {
    succeeded: boolean;
    message: string;
    hint?: string;
}

export type LinkerdCheckOutput = shelljs.ExecOutputReturnValue | undefined;

const exec = (args: string): shelljs.ExecOutputReturnValue | undefined => {
    const binaryPath = config.linkerdPath();

    if (!binaryPath) {
        // TODO: can we programatically open workspace settings?
        vscode.window.showErrorMessage("Linkerd binary not found on file system. Please set in workspace settings.");
        return undefined;
    }

    return shelljs.exec(`${binaryPath} ${args}`);
};

export function check (): LinkerdCheckOutput {
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

export function structuredCheckOutput (stdout: string): LinkerdCheck {
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
    } as LinkerdCheck;
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
