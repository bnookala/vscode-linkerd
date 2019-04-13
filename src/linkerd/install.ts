import * as vscode from 'vscode';
import * as querystring from 'querystring';
import * as fs from 'fs';
import * as k8s from 'vscode-kubernetes-tools-api';
import { file, FileResult } from 'tmp-promise';
import { linkerdInstallUri } from './provider';
import * as config from './config';
import { exec } from './exec';


enum LinkerdInstallOptions {
    Install = "Install",
    Cancel = "Cancel",
    Configure = "Configure"
}

export interface LinkerdExistence {
    succeeded: boolean;
    result: boolean;
    message?: string;
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

export function gatherCustomConfiguration (): string {
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
     return "";
}

export async function beginInstall (kubectl: k8s.KubectlV1) {
    const selection: string | undefined = await vscode.window.showInformationMessage(
        "Linkerd checks passed. Continue to install?",
        LinkerdInstallOptions.Install,
        LinkerdInstallOptions.Configure,
        LinkerdInstallOptions.Cancel
    );

    if (!selection) {
        return;
    }

    let installArguments: string = "";

    switch (selection) {
        case LinkerdInstallOptions.Cancel:
            return;
        case LinkerdInstallOptions.Configure:
            // not implemented.
            installArguments = gatherCustomConfiguration();
            break;
        case LinkerdInstallOptions.Install:
            installArguments = "";
            break;
        default:
            vscode.window.showErrorMessage("Could not parse install selection");
            break;
    }

    const out = exec(`install ${installArguments}`);

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
