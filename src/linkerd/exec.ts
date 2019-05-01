import * as vscode from 'vscode';
import * as shelljs from 'shelljs';
import * as config from './config';



export type LinkerdCheckCLIOutput = shelljs.ExecOutputReturnValue | undefined;

export function exec (args: string): shelljs.ExecOutputReturnValue | undefined {
    const binaryPath = config.linkerdPath();

    if (!binaryPath) {
        return undefined;
    }

    return shelljs.exec(`${binaryPath} ${args}`);
}
