import * as vscode from "vscode";

import { IKunCodeClient, IKunCodeApiError } from "../clients/ikunCodeClient";
import { AuthStore } from "./authStore";
import { Logger } from "./logger";

export class BalanceRefreshService implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private refreshInFlight: Promise<void> | undefined;

  constructor(
    private readonly authStore: AuthStore,
    private readonly logger: Logger
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
    this.statusBarItem.text = "$(sync~spin) IKun: --";
    this.statusBarItem.tooltip = "IKunCode balance is loading.";
  }

  start(): void {
    this.statusBarItem.show();
    this.scheduleRefresh();
    void this.refreshBalance("startup");
  }

  async refreshBalance(reason: "startup" | "manual" | "timer" | "configuration" = "manual"): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.runRefresh(reason);

    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = undefined;
    }
  }

  handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
    if (!event.affectsConfiguration("ikuncodeBalance")) {
      return;
    }

    this.logger.debug("Configuration changed, rescheduling balance refresh.");
    this.scheduleRefresh();
    void this.refreshBalance("configuration");
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.statusBarItem.dispose();
  }

  private async runRefresh(reason: "startup" | "manual" | "timer" | "configuration"): Promise<void> {
    this.statusBarItem.text = "$(sync~spin) IKun: ...";
    this.statusBarItem.tooltip = `Refreshing IKunCode balance (${reason}).`;

    const credentials = await this.authStore.getCredentials();
    if (!credentials) {
      this.statusBarItem.text = "$(key) IKun: sign in";
      this.statusBarItem.tooltip = "Run 'IKunCode Balance: Configure Credentials' to set your session and new-api-user.";
      this.statusBarItem.command = "ikuncodeBalance.configureCredentials";
      return;
    }

    const configuration = vscode.workspace.getConfiguration("ikuncodeBalance");
    const client = new IKunCodeClient(configuration.get<string>("baseUrl", "https://api.ikuncode.cc"));

    try {
      const snapshot = await client.fetchBalance(credentials);
      const formattedBalance = formatCurrencyFromQuota(snapshot.quota);
      const totalQuota = snapshot.usedQuota !== undefined ? snapshot.quota + snapshot.usedQuota : undefined;
      const remainingRatio = totalQuota !== undefined ? snapshot.quota / totalQuota : undefined;
      const formattedRemainingRatio = remainingRatio !== undefined ? formatPercent(remainingRatio, 0) : undefined;

      this.statusBarItem.text = formattedRemainingRatio
        ? `IKun: ${formattedBalance} · ${formattedRemainingRatio}`
        : `IKun: ${formattedBalance}`;
      this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
      this.statusBarItem.tooltip = [
        `IKunCode user: ${snapshot.username || credentials.newApiUser}`,
        `Balance: ${formattedBalance}`,
        snapshot.usedQuota !== undefined ? `Used: ${formatCurrencyFromQuota(snapshot.usedQuota)}` : undefined,
        totalQuota !== undefined ? `Total: ${formatCurrencyFromQuota(totalQuota)}` : undefined,
        remainingRatio !== undefined ? `Remaining: ${formatPercent(remainingRatio, 1)}` : undefined,
        `Last updated: ${snapshot.fetchedAt.toLocaleString()}`
      ]
        .filter(Boolean)
        .join("\n");
      this.logger.debug(`Balance refresh succeeded for user ${credentials.newApiUser}.`);
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Balance refresh failed: ${message}`);
      this.statusBarItem.text = "$(warning) IKun: error";
      this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
      this.statusBarItem.tooltip = `Balance refresh failed: ${message}`;

      if (reason === "manual") {
        void vscode.window.showErrorMessage(`IKunCode balance refresh failed: ${message}`);
      }
    }
  }

  private scheduleRefresh(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    const configuration = vscode.workspace.getConfiguration("ikuncodeBalance");
    const refreshIntervalSeconds = Math.max(15, configuration.get<number>("refreshIntervalSeconds", 60));
    this.timer = setInterval(() => {
      void this.refreshBalance("timer");
    }, refreshIntervalSeconds * 1000);
    this.logger.debug(`Scheduled balance refresh every ${refreshIntervalSeconds} seconds.`);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof IKunCodeApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}

function formatCurrencyFromQuota(quota: number): string {
  const amount = quota / 500000;
  return `¥${amount.toFixed(2)}`;
}

function formatPercent(value: number, fractionDigits: number): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}
