import * as vscode from "vscode";

import { IKunCodeClient, IKunCodeApiError } from "../clients/ikunCodeClient";
import { BalanceSnapshot, StoredBalanceSnapshot } from "../types";
import { AuthStore } from "./authStore";
import { Logger } from "./logger";

const SNAPSHOT_CACHE_KEY = "ikuncodeBalance.lastSuccessfulSnapshot";

type RefreshReason = "startup" | "manual" | "timer" | "configuration";
type BalanceHealth = "healthy" | "warning" | "critical";

export class BalanceRefreshService implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private refreshInFlight: Promise<void> | undefined;
  private currentSnapshot: BalanceSnapshot | undefined;
  private isUsingCachedSnapshot = false;
  private lastError: string | undefined;

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly authStore: AuthStore,
    private readonly logger: Logger
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
    this.statusBarItem.text = "$(sync~spin) IKun: --";
    this.statusBarItem.tooltip = "IKunCode balance is loading.";
  }

  start(): void {
    this.currentSnapshot = this.getCachedSnapshot();
    if (this.currentSnapshot) {
      this.isUsingCachedSnapshot = true;
      this.renderSnapshot({ snapshot: this.currentSnapshot, isRefreshing: false });
    }

    this.statusBarItem.show();
    this.scheduleRefresh();
    void this.refreshBalance("startup");
  }

  async refreshBalance(reason: RefreshReason = "manual"): Promise<void> {
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

  private async runRefresh(reason: RefreshReason): Promise<void> {
    const credentials = await this.authStore.getCredentials();
    if (!credentials) {
      this.currentSnapshot = undefined;
      this.lastError = undefined;
      this.isUsingCachedSnapshot = false;
      this.statusBarItem.text = "$(key) IKun: sign in";
      this.statusBarItem.tooltip = "Run 'IKunCode Balance: Configure Credentials' to set your access token and new-api-user.";
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = undefined;
      this.statusBarItem.command = "ikuncodeBalance.configureCredentials";
      return;
    }

    this.renderSnapshot({
      snapshot: this.currentSnapshot,
      isRefreshing: true
    });

    const configuration = vscode.workspace.getConfiguration("ikuncodeBalance");
    const client = new IKunCodeClient(configuration.get<string>("baseUrl", "https://api.ikuncode.cc"));

    try {
      const snapshot = await client.fetchBalance(credentials);
      this.currentSnapshot = snapshot;
      this.isUsingCachedSnapshot = false;
      this.lastError = undefined;
      await this.globalState.update(SNAPSHOT_CACHE_KEY, toStoredBalanceSnapshot(snapshot));
      this.renderSnapshot({ snapshot, isRefreshing: false });
      this.logger.debug(`Balance refresh succeeded for user ${credentials.newApiUser}.`);
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Balance refresh failed: ${message}`);
      this.lastError = message;

      if (this.currentSnapshot) {
        this.isUsingCachedSnapshot = true;
        this.renderSnapshot({ snapshot: this.currentSnapshot, isRefreshing: false });
      } else {
        this.statusBarItem.text = "$(warning) IKun: error";
        this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
        this.statusBarItem.tooltip = `Balance refresh failed: ${message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        this.statusBarItem.color = undefined;
      }

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

  private getCachedSnapshot(): BalanceSnapshot | undefined {
    const stored = this.globalState.get<StoredBalanceSnapshot>(SNAPSHOT_CACHE_KEY);
    if (!stored) {
      return undefined;
    }

    return {
      quota: stored.quota,
      usedQuota: stored.usedQuota,
      requestCount: stored.requestCount,
      username: stored.username,
      fetchedAt: new Date(stored.fetchedAt)
    };
  }

  private renderSnapshot({
    snapshot,
    isRefreshing
  }: {
    snapshot: BalanceSnapshot | undefined;
    isRefreshing: boolean;
  }): void {
    if (!snapshot) {
      this.statusBarItem.text = isRefreshing ? "$(sync~spin) IKun: --" : "IKun: --";
      this.statusBarItem.tooltip = isRefreshing ? "Refreshing IKunCode balance." : "IKunCode balance is unavailable.";
      this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = undefined;
      return;
    }

    const formattedBalance = formatCurrencyFromQuota(snapshot.quota);
    const totalQuota = snapshot.usedQuota !== undefined ? snapshot.quota + snapshot.usedQuota : undefined;
    const remainingRatio = totalQuota !== undefined ? snapshot.quota / totalQuota : undefined;
    const formattedRemainingRatio = remainingRatio !== undefined ? formatPercent(remainingRatio, 0) : undefined;
    const health = getBalanceHealth(getBalanceAmount(snapshot.quota), vscode.workspace.getConfiguration("ikuncodeBalance"));
    const healthLabel = getHealthLabel(health);

    const icon = isRefreshing ? "$(sync~spin)" : getHealthIcon(health);
    this.statusBarItem.text = formattedRemainingRatio
      ? `${icon} IKun: ${formattedBalance} · ${formattedRemainingRatio}`
      : `${icon} IKun: ${formattedBalance}`;
    this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
    this.statusBarItem.backgroundColor = getHealthBackgroundColor(health);
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = [
      `IKunCode user: ${snapshot.username || "Unknown"}`,
      `Health: ${healthLabel}`,
      `Balance: ${formattedBalance}`,
      snapshot.usedQuota !== undefined ? `Used: ${formatCurrencyFromQuota(snapshot.usedQuota)}` : undefined,
      totalQuota !== undefined ? `Total: ${formatCurrencyFromQuota(totalQuota)}` : undefined,
      remainingRatio !== undefined ? `Remaining: ${formatPercent(remainingRatio, 1)}` : undefined,
      snapshot.requestCount !== undefined ? `Request count: ${snapshot.requestCount}` : undefined,
      this.isUsingCachedSnapshot ? "Status: using last successful value" : "Status: live",
      isRefreshing ? "Query: refreshing..." : undefined,
      this.lastError ? `Last error: ${this.lastError}` : undefined,
      `Last updated: ${snapshot.fetchedAt.toLocaleString()}`
    ]
      .filter(Boolean)
      .join("\n");
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
  return `¥${getBalanceAmount(quota).toFixed(2)}`;
}

function formatPercent(value: number, fractionDigits: number): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

function getBalanceAmount(quota: number): number {
  return quota / 500000;
}

function getBalanceHealth(
  balanceAmount: number,
  configuration: vscode.WorkspaceConfiguration
): BalanceHealth {
  const warningThreshold = Math.max(0, configuration.get<number>("warningBalanceThresholdYuan", 20));
  const healthyThreshold = Math.max(
    warningThreshold,
    configuration.get<number>("healthyBalanceThresholdYuan", 50)
  );

  if (balanceAmount < warningThreshold) {
    return "critical";
  }

  if (balanceAmount < healthyThreshold) {
    return "warning";
  }

  return "healthy";
}

function getHealthIcon(health: BalanceHealth): string {
  switch (health) {
    case "healthy":
      return "$(pass)";
    case "warning":
      return "$(alert)";
    case "critical":
      return "$(error)";
  }
}

function getHealthLabel(health: BalanceHealth): string {
  switch (health) {
    case "healthy":
      return "healthy";
    case "warning":
      return "warning";
    case "critical":
      return "critical";
  }
}

function getHealthBackgroundColor(health: BalanceHealth): vscode.ThemeColor | undefined {
  switch (health) {
    case "healthy":
      return undefined;
    case "warning":
      return new vscode.ThemeColor("statusBarItem.warningBackground");
    case "critical":
      return new vscode.ThemeColor("statusBarItem.errorBackground");
  }
}

function toStoredBalanceSnapshot(snapshot: BalanceSnapshot): StoredBalanceSnapshot {
  return {
    quota: snapshot.quota,
    usedQuota: snapshot.usedQuota,
    requestCount: snapshot.requestCount,
    username: snapshot.username,
    fetchedAt: snapshot.fetchedAt.toISOString()
  };
}
