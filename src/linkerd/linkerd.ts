import * as vscode from 'vscode';
import * as fs from 'fs';
import * as querystring from 'querystring';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as shelljs from 'shelljs';
import { file, FileResult } from 'tmp-promise';
import * as config from './config';
import { CheckStage, linkerdCheckUri, linkerdInstallUri } from './linkerd-provider';

const SUCCESS_SYMBOL = "√";
const FAIL_SYMBOL = "×";
const FailedCheckHintPrefix = "    "; // Yeah… I know :c - will move this to regex later.

enum LinkerdInstallOptions {
    Install = "Install",
    Cancel = "Cancel"
}

export interface LinkerdExistence {
    succeeded: boolean;
    result: boolean;
    message?: string;
}

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

export type LinkerdCheckCLIOutput = shelljs.ExecOutputReturnValue | undefined;

const exec = (args: string): shelljs.ExecOutputReturnValue | undefined => {
    const binaryPath = config.linkerdPath();

    if (!binaryPath) {
        // TODO: can we programatically open workspace settings?
        vscode.window.showErrorMessage("Linkerd binary not found on file system. Please set in workspace settings.");
        return undefined;
    }

    return shelljs.exec(`${binaryPath} ${args}`);
};

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
 * Check if Linkerd is installed on the currently selected cluster.
 * @param kubectl
 * @returns LinkerdExistence object
 */
export async function isInstalled (kubectl: k8s.KubectlV1 | undefined): Promise<LinkerdExistence> {
    // No Kubectl is always an error.
    if (!kubectl) {
        return {
            succeeded: false,
            result: false,
            message: "Kubectl not found."
        };
    }

    const ns = config.linkerdNamespace();
    const nsOut = await kubectl.invokeCommand(`get ns ${ns} -o json`);

    // Error invoking Kubectl
    if (!nsOut) {
        return {
            succeeded: false,
            result: false,
            message: "Kubectl invocation failed."
        };
    }

    if (nsOut && nsOut.code !== 0 && nsOut.stderr) {
        // This is actually a success condition in our case
        // since linkerd is _not_ installed, but the operation
        // to determine that was successful.
        if (nsOut.stderr.toString().includes("NotFound")) {
            return {
                succeeded: true,
                result: false
            };
        }

        // Otherwise, we want to report the error.
        return {
            succeeded: false,
            result: false,
            message: nsOut.stderr
        };
    }

    // Namespace does exist -- Linkerd should not be installed.
    return {
        succeeded: true,
        result: true
    };
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

    const selection: string | undefined = await vscode.window.showInformationMessage(
        "Linkerd checks passed. Continue to install?",
        LinkerdInstallOptions.Install,
        LinkerdInstallOptions.Cancel
    );

    if (!selection || (selection === LinkerdInstallOptions.Cancel)) {
        return;
    }

    /*
    TODO: Gather custom inputs. Linkerd can be installed with the following arguments:

    Flags:
      --api-port uint                   Port where the Linkerd controller is running (default 8086)
      --control-port uint               Proxy port to use for control (default 4190)
      --controller-log-level string     Log level for the controller and web components (default "info")
      --controller-replicas uint        Replicas of the controller to deploy (default 1)
      --controller-uid int              Run the control plane components under this user ID (default 2103)
      --disable-external-profiles       Disables service profiles for non-Kubernetes services
      --disable-h2-upgrade              Prevents the controller from instructing proxies to perform transparent HTTP/2 upgrading (default false)
      --ha                              Experimental: Enable HA deployment config for the control plane (default false)
  -h, --help                            help for install
      --image-pull-policy string        Docker image pull policy (default "IfNotPresent")
      --inbound-port uint               Proxy port to use for inbound traffic (default 4143)
      --init-image string               Linkerd init container image name (default "gcr.io/linkerd-io/proxy-init")
  -v, --linkerd-version string          Tag to be used for Linkerd images (default "stable-2.2.1")
      --metrics-port uint               Proxy port to serve metrics on (default 4191)
      --outbound-port uint              Proxy port to use for outbound traffic (default 4140)
      --proxy-auto-inject               Enable proxy sidecar auto-injection via a webhook (default false)
      --proxy-cpu string                Amount of CPU units that the proxy sidecar requests
      --proxy-image string              Linkerd proxy container image name (default "gcr.io/linkerd-io/proxy")
      --proxy-log-level string          Log level for the proxy (default "warn,linkerd2_proxy=info")
      --proxy-memory string             Amount of Memory that the proxy sidecar requests
      --proxy-uid int                   Run the proxy under this user ID (default 2102)
      --registry string                 Docker registry to pull images from (default "gcr.io/linkerd-io")
      --single-namespace                Experimental: Configure the control plane to only operate in the installed namespace (default false)
      --skip-inbound-ports uintSlice    Ports that should skip the proxy and send directly to the application (default [])
      --skip-outbound-ports uintSlice   Outbound ports that should skip the proxy (default [])
      --tls string                      Enable TLS; valid settings: "optional"
      */

    const out = exec("install");

    if (!out) {
        return;
    }

    const tempFile: FileResult = await file();
    // Todo: make this asynchronous - add some kind of notifier
    const bytesWritten = fs.writeSync(tempFile.fd, out.stdout.toString(), undefined);

    if (bytesWritten === 0) {
        vscode.window.showErrorMessage("Something went wrong attempting to write Linkerd yaml to disk.");
        return;
    }

    // Operation could take some time - add some kind of progress bar/notifier.
    const linkerdInstallCommand = `apply -f ${tempFile.path}`;
    const shellResult: k8s.KubectlV1.ShellResult | undefined = await kubectl.invokeCommand(linkerdInstallCommand);

    if (!shellResult) {
        return;
    }

    if (shellResult.code !== 0) {
        vscode.window.showErrorMessage("Could not install Linkerd.");
        return;
    }

    const stringifiedOut = querystring.escape(shellResult.stdout.toString());
    vscode.commands.executeCommand(
        "markdown.showPreview",
        linkerdInstallUri(stringifiedOut)
    );

    // Clean up our tempFile handle.
    tempFile.cleanup();
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

function examplePrecheckOutput(): string {
    return `
kubernetes-api
--------------
√ can initialize the client
√ can query the Kubernetes API

kubernetes-version
------------------
× is running the minimum Kubernetes API version
    Kubernetes is on version [1.9.11], but version [1.10.0] or more recent is required
    see https://linkerd.io/checks/#k8s-version for hints

pre-kubernetes-cluster-setup
----------------------------
√ control plane namespace does not already exist
√ can create Namespaces
√ can create ClusterRoles
√ can create ClusterRoleBindings
√ can create CustomResourceDefinitions

pre-kubernetes-setup
--------------------
√ can create ServiceAccounts
√ can create Services
√ can create Deployments
√ can create ConfigMaps

linkerd-version
---------------
√ can determine the latest version
√ cli is up-to-date

Status check results are ×
`;
}
