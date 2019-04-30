import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { InstallController } from './install';
import { exec } from './exec';


export class MeshedResourceExplorer implements k8s.ClusterExplorerV1.NodeContributor {
    private kubectl: k8s.KubectlV1 | undefined;
    private installController: InstallController | undefined;

    constructor (kubectl: k8s.KubectlV1, installController: InstallController ) {
        this.kubectl = kubectl;
        this.installController = installController;
    }

    contributesChildren(parent: k8s.ClusterExplorerV1.ClusterExplorerNode | undefined): boolean {
        return !!parent && parent.nodeType === 'context';
    }

    async getChildren(_parent: k8s.ClusterExplorerV1.ClusterExplorerNode | undefined): Promise<k8s.ClusterExplorerV1.Node[]> {
        if (!this.installController) {
            return [];
        }

        const isInstalled = await this.installController.isInstalled();

        if (isInstalled.result === false) {
            return [];
        }

        return [new MeshedResourceFolderNode()];
    }
}


class MeshedResourceFolderNode implements k8s.ClusterExplorerV1.Node {
    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        const meshedResources = await exec("get pods --all-namespaces");

        if (!meshedResources || meshedResources.code !== 0) {
            return [];
        }

        const meshedResourceStdout = meshedResources.stdout;
        const meshedResourceArray = meshedResourceStdout.split('\n');

        return meshedResourceArray.map((meshedResource) => new MeshedResourceNode(meshedResource));
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem('Linkerd Mesh', vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.contextValue = 'linkerd.folder';
        return treeItem;
    }
}


class MeshedResourceNode implements k8s.ClusterExplorerV1.Node{
    constructor(private readonly meshedResource: string) {}

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            this.meshedResource,
            vscode.TreeItemCollapsibleState.None
        );

        treeItem.contextValue = 'linkerd.meshedResource';
        return treeItem;
    }
}
