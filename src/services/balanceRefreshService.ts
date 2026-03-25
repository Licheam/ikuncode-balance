import * as vscode from "vscode";

import { IKunCodeClient, IKunCodeApiError } from "../clients/ikunCodeClient";
import { BalanceSnapshot, StoredBalanceSnapshot } from "../types";
import { AuthStore } from "./authStore";
import { Logger } from "./logger";

const SNAPSHOT_CACHE_KEY = "ikuncodeBalance.lastSuccessfulSnapshot";

type RefreshReason = "startup" | "manual" | "timer" | "configuration";
type BalanceHealth = "healthy" | "warning" | "critical";
type BalanceChange = {
  amount: number;
  occurredAt: Date;
};

const CHANGE_INDICATOR_DURATION_MS = 3_000;

export class BalanceRefreshService implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private refreshInFlight: Promise<void> | undefined;
  private changeIndicatorTimer: NodeJS.Timeout | undefined;
  private currentSnapshot: BalanceSnapshot | undefined;
  private isUsingCachedSnapshot = false;
  private lastError: string | undefined;
  private latestBalanceChange: BalanceChange | undefined;

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

    if (this.changeIndicatorTimer) {
      clearTimeout(this.changeIndicatorTimer);
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
      const previousSnapshot = this.currentSnapshot;
      const snapshot = await client.fetchBalance(credentials);
      this.setBalanceChange(previousSnapshot, snapshot);
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
    const activeChange = getActiveBalanceChange(this.latestBalanceChange);
    const formattedChange = activeChange ? formatBalanceChange(activeChange.amount) : undefined;

    const icon = isRefreshing ? "$(sync~spin)" : getHealthIcon(health);
    this.statusBarItem.text = formattedRemainingRatio
      ? `${icon} IKun: ${formattedBalance} · ${formattedRemainingRatio}${formattedChange ? `  ${formattedChange}` : ""}`
      : `${icon} IKun: ${formattedBalance}${formattedChange ? `  ${formattedChange}` : ""}`;
    this.statusBarItem.command = "ikuncodeBalance.refreshBalance";
    this.statusBarItem.backgroundColor = getHealthBackgroundColor(health);
    this.statusBarItem.color = undefined;
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendText(`IKunCode user: ${snapshot.username || "Unknown"}\n`);
    tooltip.appendText(`Health: ${healthLabel}\n`);
    tooltip.appendText(`Balance: ${formattedBalance}\n`);

    if (snapshot.usedQuota !== undefined) {
      tooltip.appendText(`Used: ${formatCurrencyFromQuota(snapshot.usedQuota)}\n`);
    }

    if (totalQuota !== undefined) {
      tooltip.appendText(`Total: ${formatCurrencyFromQuota(totalQuota)}\n`);
    }

    if (remainingRatio !== undefined) {
      tooltip.appendText(`Remaining: ${formatPercent(remainingRatio, 1)}\n`);
    }

    if (snapshot.requestCount !== undefined) {
      tooltip.appendText(`Request count: ${snapshot.requestCount}\n`);
    }

    if (formattedChange) {
      tooltip.appendText(`Last change: ${formattedChange}\n`);
    }

    tooltip.appendText(`${this.isUsingCachedSnapshot ? "Status: using last successful value" : "Status: live"}\n`);

    if (isRefreshing) {
      tooltip.appendText("Query: refreshing...\n");
    }

    if (this.lastError) {
      tooltip.appendText(`Last error: ${this.lastError}\n`);
    }

    tooltip.appendText(`Last updated: ${formatRelativeTime(snapshot.fetchedAt)}\n\n`);
    tooltip.appendMarkdown("[Open IKunCode Console](https://api.ikuncode.cc/console)");
    this.statusBarItem.tooltip = tooltip;
  }

  private setBalanceChange(
    previousSnapshot: BalanceSnapshot | undefined,
    nextSnapshot: BalanceSnapshot
  ): void {
    if (!previousSnapshot) {
      this.clearBalanceChange();
      return;
    }

    const amountDelta = getBalanceAmount(nextSnapshot.quota) - getBalanceAmount(previousSnapshot.quota);
    if (Math.abs(amountDelta) < 0.005) {
      this.clearBalanceChange();
      return;
    }

    this.latestBalanceChange = {
      amount: amountDelta,
      occurredAt: new Date()
    };

    if (this.changeIndicatorTimer) {
      clearTimeout(this.changeIndicatorTimer);
    }

    this.changeIndicatorTimer = setTimeout(() => {
      this.latestBalanceChange = undefined;
      this.changeIndicatorTimer = undefined;
      this.renderSnapshot({
        snapshot: this.currentSnapshot,
        isRefreshing: false
      });
    }, CHANGE_INDICATOR_DURATION_MS);
  }

  private clearBalanceChange(): void {
    this.latestBalanceChange = undefined;

    if (this.changeIndicatorTimer) {
      clearTimeout(this.changeIndicatorTimer);
      this.changeIndicatorTimer = undefined;
    }
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
  const criticalThreshold = Math.max(0, configuration.get<number>("criticalBalanceThresholdYuan", 5));
  const warningThreshold = Math.max(
    criticalThreshold,
    configuration.get<number>("warningBalanceThresholdYuan", 20)
  );

  if (balanceAmount < criticalThreshold) {
    return "critical";
  }

  if (balanceAmount < warningThreshold) {
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

function formatRelativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const absoluteSeconds = Math.abs(diffSeconds);

  if (absoluteSeconds < 10) {
    return "just now";
  }

  const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absoluteSeconds < 60) {
    return relativeTimeFormat.format(diffSeconds, "second");
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormat.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffSeconds / 3600);
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormat.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffSeconds / 86400);
  return relativeTimeFormat.format(diffDays, "day");
}

function getActiveBalanceChange(change: BalanceChange | undefined): BalanceChange | undefined {
  if (!change) {
    return undefined;
  }

  return Date.now() - change.occurredAt.getTime() <= CHANGE_INDICATOR_DURATION_MS ? change : undefined;
}

function formatBalanceChange(amount: number): string {
  const arrow = amount < 0 ? "↓" : "↑";
  return `${arrow}¥${Math.abs(amount).toFixed(2)}`;
}
