import { NextRequest, NextResponse } from "next/server";

import {
  handleGithubWebhook,
  type GithubWebhookResponse,
} from "./github-webhook-handler";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<GithubWebhookResponse["body"]>> {
  const response = await handleGithubWebhook({
    event: request.headers.get("x-github-event"),
    deliveryId: request.headers.get("x-github-delivery"),
    signature: request.headers.get("x-hub-signature-256"),
    rawBody: await request.text(),
    secret: process.env.GITHUB_WEBHOOK_SECRET,
  });

  return NextResponse.json(response.body, { status: response.status });
}
