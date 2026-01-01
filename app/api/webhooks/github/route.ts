import { generatePRSummary, parseCommand, reviewPullRequest } from "@/module/ai";
import { NextRequest, NextResponse } from "next/server";

type RepoFullNameParts = {
  owner: string;
  repoName: string;
  fullName: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRepoFullName(value: unknown): RepoFullNameParts | null {
  if (typeof value !== "string") return null;

  const fullName = value.trim();
  const parts = fullName.split("/");

  if (parts.length !== 2) return null;

  const [owner, repoName] = parts;
  if (!owner || !repoName) return null;

  return { owner, repoName, fullName };
}

function parsePrNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const event = request.headers.get("x-github-event");

    if (!event) {
      return NextResponse.json({ error: "Missing x-github-event header" }, { status: 400 });
    }

    const body: unknown = await request.json();

    if (event === "ping") {
      return NextResponse.json({ message: "Pong" }, { status: 200 });
    }

    if (!isRecord(body)) {
      return NextResponse.json({ message: "Ignored: invalid payload" }, { status: 200 });
    }

    if (event === "pull_request") {
      const action = body["action"];
      const repository = body["repository"];
      const repoInfo = parseRepoFullName(isRecord(repository) ? repository["full_name"] : undefined);
      const prNumber = parsePrNumber(body["number"]);

      if (typeof action !== "string" || !repoInfo || prNumber === null) {
        return NextResponse.json({ message: "Ignored: malformed pull_request payload" }, { status: 200 });
      }

      if (action === "opened" || action === "synchronize") {
        reviewPullRequest(repoInfo.owner, repoInfo.repoName, prNumber)
          .then(() => console.log(`Review completed for ${repoInfo.fullName} #${prNumber}`))
          .catch((error) => console.error(`Review failed for ${repoInfo.fullName} #${prNumber}:`, error));
      }

      return NextResponse.json({ message: "Event Processed" }, { status: 200 });
    }

    if (event === "issue_comment") {
      const action = body["action"];

      if (action !== "created") {
        return NextResponse.json({ message: "Ignored" }, { status: 200 });
      }

      const repository = body["repository"];
      const issue = body["issue"];
      const comment = body["comment"];

      const isPullRequest = isRecord(issue) && issue["pull_request"] != null;

      // if not a PR comment, return 200
      if (!isPullRequest) {
        return NextResponse.json({ message: "Not a PR comment" }, { status: 200 });
      }

      const commentBody = isRecord(comment) ? comment["body"] : undefined;
      const repoInfo = parseRepoFullName(isRecord(repository) ? repository["full_name"] : undefined);
      const prNumber = parsePrNumber(isRecord(issue) ? issue["number"] : undefined);

      if (typeof commentBody !== "string" || !repoInfo || prNumber === null) {
        return NextResponse.json({ message: "Ignored: malformed issue_comment payload" }, { status: 200 });
      }

      const command = parseCommand(commentBody);

      if (command?.type === "summary") {
        generatePRSummary(repoInfo.owner, repoInfo.repoName, prNumber)
          .then(() => console.log(`Summary generated for ${repoInfo.fullName} #${prNumber}`))
          .catch((error) => console.error(`Summary failed for ${repoInfo.fullName} #${prNumber}:`, error));
      }

      return NextResponse.json({ message: "Event Processed" }, { status: 200 });
    }

    return NextResponse.json({ message: "Ignored" }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ error: "Error processing webhook" }, { status: 500 });
  }
}
