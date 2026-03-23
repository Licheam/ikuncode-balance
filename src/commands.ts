import * as vscode from "vscode";

import { AuthStore, normalizeNewApiUser, normalizeSession } from "./services/authStore";
import { BalanceRefreshService } from "./services/balanceRefreshService";

export function registerCommands(
  context: vscode.ExtensionContext,
  authStore: AuthStore,
  balanceRefreshService: BalanceRefreshService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ikuncodeBalance.configureCredentials", async () => {
      const existingCredentials = await authStore.getCredentials();

      const sessionInput = await vscode.window.showInputBox({
        title: "IKunCode Balance",
        prompt: "Paste your IKunCode session cookie value.",
        placeHolder: "session=... or just the raw session value",
        password: true,
        ignoreFocusOut: true
      });

      if (!sessionInput) {
        return;
      }

      const userInput = await vscode.window.showInputBox({
        title: "IKunCode Balance",
        prompt: "Enter your new-api-user value.",
        placeHolder: "your-user-id",
        ignoreFocusOut: true,
        value: existingCredentials?.newApiUser
      });

      if (!userInput) {
        return;
      }

      await authStore.saveCredentials({
        session: normalizeSession(sessionInput),
        newApiUser: normalizeNewApiUser(userInput)
      });

      void vscode.window.showInformationMessage("IKunCode credentials saved securely.");
      await balanceRefreshService.refreshBalance("manual");
    }),
    vscode.commands.registerCommand("ikuncodeBalance.refreshBalance", async () => {
      await balanceRefreshService.refreshBalance("manual");
    }),
    vscode.commands.registerCommand("ikuncodeBalance.clearCredentials", async () => {
      await authStore.clearCredentials();
      void vscode.window.showInformationMessage("IKunCode credentials cleared.");
      await balanceRefreshService.refreshBalance("manual");
    })
  );
}
