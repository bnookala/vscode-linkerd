# VSCode Linkerd

## Introduction

This is the Visua Studio Code Linkerd extension, built to work with the [VSCode Kubernetes Extension](https://github.com/Azure/vscode-kubernetes-tools).

This extension has a dependency on the Kubernetes Extension, and will require you to install it through the Visual Studio Code extension marketplace.

## Features

* `Linkerd Check`:  Check Linkerd status, and diagnosing issues with the installation
* `Linkerd Install`:  Install Linkerd, and configure custom parameters to your cluster.
* `Linkerd Dashboard`: Open and interact with the Linkerd dashboard

## Extension Settings

* `vscode-linkerd`: Parent namespace for any configuration settings for linkerd.
     - `vscode-linkerd.linkerd-path`: Path to the linkerd binary installed on your system.
     - `vscode-linkerd.namespace`: Namespace where linkerd may be found in your Kubernetes cluster.
        - Note: If linkerd is not found in this namespace, it will be installed in this namespace.

## Issues

Please report any issues to this repository.

## License

MIT - See [LICENSE](./LICENSE)
