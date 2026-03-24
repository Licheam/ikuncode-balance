export interface IKunCodeAuthCredentials {
  accessToken: string;
  newApiUser: string;
}

export interface IKunCodeUserSelfResponse {
  success: boolean;
  message: string;
  data?: {
    id: number;
    username: string;
    display_name: string;
    quota: number;
    used_quota: number;
    request_count: number;
  };
}

export interface BalanceSnapshot {
  quota: number;
  usedQuota?: number;
  requestCount?: number;
  username?: string;
  fetchedAt: Date;
}

export interface StoredBalanceSnapshot {
  quota: number;
  usedQuota?: number;
  requestCount?: number;
  username?: string;
  fetchedAt: string;
}
