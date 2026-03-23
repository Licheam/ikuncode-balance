import * as vscode from "vscode";

import { IKunCodeAuthCredentials } from "../types";

const SESSION_KEY = "ikuncodeBalance.session";
const NEW_API_USER_KEY = "ikuncodeBalance.newApiUser";

export class AuthStore {
  constructor(private readonly secretStorage: vscode.SecretStorage) {}

  async getCredentials(): Promise<IKunCodeAuthCredentials | undefined> {
    const [session, newApiUser] = await Promise.all([
      this.secretStorage.get(SESSION_KEY),
      this.secretStorage.get(NEW_API_USER_KEY)
    ]);

    if (!session || !newApiUser) {
      return undefined;
    }

    return {
      session,
      newApiUser
    };
  }

  async saveCredentials(credentials: IKunCodeAuthCredentials): Promise<void> {
    await Promise.all([
      this.secretStorage.store(SESSION_KEY, normalizeSession(credentials.session)),
      this.secretStorage.store(NEW_API_USER_KEY, normalizeNewApiUser(credentials.newApiUser))
    ]);
  }

  async clearCredentials(): Promise<void> {
    await Promise.all([
      this.secretStorage.delete(SESSION_KEY),
      this.secretStorage.delete(NEW_API_USER_KEY)
    ]);
  }
}

export function normalizeSession(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("session=") ? trimmed.slice("session=".length) : trimmed;
}

export function normalizeNewApiUser(value: string): string {
  return value.trim();
}
