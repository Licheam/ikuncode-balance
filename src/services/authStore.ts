import * as vscode from "vscode";

import { IKunCodeAuthCredentials } from "../types";

const ACCESS_TOKEN_KEY = "ikuncodeBalance.accessToken";
const NEW_API_USER_KEY = "ikuncodeBalance.newApiUser";
const LEGACY_SESSION_KEY = "ikuncodeBalance.session";

export class AuthStore {
  constructor(private readonly secretStorage: vscode.SecretStorage) {}

  async getCredentials(): Promise<IKunCodeAuthCredentials | undefined> {
    const [accessToken, newApiUser] = await Promise.all([
      this.secretStorage.get(ACCESS_TOKEN_KEY),
      this.secretStorage.get(NEW_API_USER_KEY)
    ]);

    if (!accessToken || !newApiUser) {
      return undefined;
    }

    return {
      accessToken,
      newApiUser
    };
  }

  async saveCredentials(credentials: IKunCodeAuthCredentials): Promise<void> {
    await Promise.all([
      this.secretStorage.store(ACCESS_TOKEN_KEY, normalizeAccessToken(credentials.accessToken)),
      this.secretStorage.store(NEW_API_USER_KEY, normalizeNewApiUser(credentials.newApiUser)),
      this.secretStorage.delete(LEGACY_SESSION_KEY)
    ]);
  }

  async clearCredentials(): Promise<void> {
    await Promise.all([
      this.secretStorage.delete(ACCESS_TOKEN_KEY),
      this.secretStorage.delete(LEGACY_SESSION_KEY),
      this.secretStorage.delete(NEW_API_USER_KEY)
    ]);
  }
}

export function normalizeAccessToken(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^bearer\s+/i, "");
}

export function normalizeNewApiUser(value: string): string {
  return value.trim();
}
