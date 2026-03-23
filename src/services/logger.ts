import * as vscode from "vscode";

export class Logger implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel("IKunCode Balance");

  debug(message: string): void {
    if (!vscode.workspace.getConfiguration("ikuncodeBalance").get<boolean>("debug", false)) {
      return;
    }

    this.channel.appendLine(`[debug] ${message}`);
  }

  info(message: string): void {
    this.channel.appendLine(`[info] ${message}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[warn] ${message}`);
  }

  error(message: string): void {
    this.channel.appendLine(`[error] ${message}`);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
