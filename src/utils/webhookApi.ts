import axios from "axios";

/**
 * Webhook API utility for reading WhatsApp messages.
 *
 * The webhook service (Railway) stores all incoming WhatsApp messages in Postgres
 * and exposes them via REST endpoints. This utility calls those endpoints so that
 * MCP clients (Cowork, Claude Code) can read messages without direct HTTP access
 * to the webhook — the MCP server acts as a proxy.
 *
 * Required env var:
 *   WEBHOOK_URL — Base URL of the webhook service.
 *     - Railway internal: http://amiable-intuition.railway.internal
 *     - Railway public:   https://amiable-intuition-production-7d79.up.railway.app
 */
class WebhookApi {
  private baseUrl: string;
  private axiosInstance: any;

  constructor() {
    this.baseUrl = process.env.WEBHOOK_URL || "";

    // Remove trailing slash
    if (this.baseUrl.endsWith("/")) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }

    if (!this.baseUrl) {
      throw new Error(
        "WEBHOOK_URL environment variable is not set. " +
          "Set it to the webhook service URL (e.g., http://amiable-intuition.railway.internal or the public Railway URL)."
      );
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000, // 15s — generous for Railway internal calls
      headers: {
        Accept: "application/json",
      },
    });
  }

  /**
   * Get messages for a given period (today or yesterday).
   * Calls GET /api/messages/{period} on the webhook service.
   */
  async getMessages(period: "today" | "yesterday"): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/api/messages/${period}`);
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const msg = error.response?.data?.message || error.message;
        throw new Error(
          `Webhook API error (${period}): HTTP ${status || "?"} — ${msg}`
        );
      }
      throw error;
    }
  }
}

// Lazy singleton — only instantiate when first used, so missing env var
// doesn't crash the server at startup (other tools still work).
let _instance: WebhookApi | null = null;

export const webhookApi = new Proxy({} as WebhookApi, {
  get(_target, prop) {
    if (!_instance) {
      _instance = new WebhookApi();
    }
    return (_instance as any)[prop];
  },
});
