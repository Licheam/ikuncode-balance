import { BalanceSnapshot, IKunCodeAuthCredentials, IKunCodeUserSelfResponse } from "../types";

export class IKunCodeApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "IKunCodeApiError";
  }
}

export class IKunCodeClient {
  constructor(private readonly baseUrl: string) {}

  async fetchBalance(credentials: IKunCodeAuthCredentials): Promise<BalanceSnapshot> {
    const response = await this.requestUserSelf(credentials);
    const payload = await parseJsonResponse(response);

    if (!response.ok || !payload.success || !payload.data) {
      throw new IKunCodeApiError(
        payload.message || `IKunCode API request failed with status ${response.status}.`,
        response.status
      );
    }

    return {
      quota: payload.data.quota,
      usedQuota: payload.data.used_quota,
      requestCount: payload.data.request_count,
      username: payload.data.display_name || payload.data.username,
      fetchedAt: new Date()
    };
  }

  private async requestUserSelf(credentials: IKunCodeAuthCredentials): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      return await fetch(new URL("/api/user/self", this.baseUrl), {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${credentials.accessToken}`,
          "new-api-user": credentials.newApiUser
        },
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new IKunCodeApiError("IKunCode API request timed out.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseJsonResponse(response: Response): Promise<IKunCodeUserSelfResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new IKunCodeApiError(
      `Expected JSON response but received ${contentType || "unknown content type"}: ${text.slice(0, 120)}`
    );
  }

  return (await response.json()) as IKunCodeUserSelfResponse;
}
