import * as vscode from "vscode";

import { registerCommands } from "./commands";
import { AuthStore } from "./services/authStore";
import { BalanceRefreshService } from "./services/balanceRefreshService";
import { Logger } from "./services/logger";

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();
  const authStore = new AuthStore(context.secrets);
  const balanceRefreshService = new BalanceRefreshService(authStore, logger);

  context.subscriptions.push(logger, balanceRefreshService);

  registerCommands(context, authStore, balanceRefreshService);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      balanceRefreshService.handleConfigurationChange(event);
    })
  );

  balanceRefreshService.start();
}

export function deactivate(): void {}
