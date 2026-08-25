import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { handleGithubWebhook } = vi.hoisted(() => ({
  handleGithubWebhook: vi.fn(),
}));

vi.mock("./github-webhook-handler", () => ({
  handleGithubWebhook,
}));

import { POST } from "./route";

describe("POST /api/webhooks/github", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  it("passes raw webhook headers and body to the route-private handler", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
    handleGithubWebhook.mockResolvedValue({
      status: 200,
      body: { message: "Event Processed" },
    });
    const rawBody = JSON.stringify({ action: "opened" });
    const request = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "x-github-event": "pull_request",
        "x-github-delivery": "delivery-123",
        "x-hub-signature-256": "sha256=signature",
      },
      body: rawBody,
    });

    const response = await POST(request);

    expect(handleGithubWebhook).toHaveBeenCalledOnce();
    expect(handleGithubWebhook).toHaveBeenCalledWith({
      event: "pull_request",
      deliveryId: "delivery-123",
      signature: "sha256=signature",
      rawBody,
      secret: "webhook-secret",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Event Processed" });
  });
});
