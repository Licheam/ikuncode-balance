export interface IKunCodeAuthCredentials {
  session: string;
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
  };
}

export interface BalanceSnapshot {
  quota: number;
  usedQuota?: number;
  username?: string;
  fetchedAt: Date;
}
