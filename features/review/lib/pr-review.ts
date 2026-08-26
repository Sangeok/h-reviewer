import type {
  CodeSuggestion,
  RepeatBadgeInfo,
  StructuredIssue,
} from "@/features/ai";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/features/ai";
import { normalizeSuggestionExplanation } from "@/features/ai/lib/suggestion-format";
import { GITHUB_POST_TIMEOUT_MS } from "@/features/review/constants";
import {
  ISSUE_FIELD_LABELS,
  REPEAT_BADGE_LABELS,
  VERIFICATION_LABELS,
} from "@/shared/constants";
import type { LanguageCode } from "@/shared/types/language";
import {
  buildGithubArtifactBody,
  GithubArtifactBodyBudgetError,
} from "@/lib/github/github-artifact-body";
import { createOctokitClient } from "@/lib/github/github";
import type { PostedGithubArtifact } from "@/lib/github/github-review-artifacts";

type RepeatAnnotatedIssue = StructuredIssue & {
  repeat?: RepeatBadgeInfo | null;
  verifierConfirmed?: boolean;
};

export type MarkedCodeSuggestion = CodeSuggestion & { marker: string };
export type MarkedReviewIssue = RepeatAnnotatedIssue & { marker: string };

interface ReviewComment {
  path: string;
  line: number;
  startLine?: number;
  body: string;
}

export interface PostPRReviewParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  reviewContent: string;
  mainMarker: string;
  suggestions: MarkedCodeSuggestion[];
  headSha: string;
}

export interface PostInlineReviewIssuesInput {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  issues: MarkedReviewIssue[];
  headSha: string;
  langCode: LanguageCode;
  beforePost(): Promise<void>;
}

export interface PostVerificationReviewInput {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  content: string;
  marker: string;
}

function parsePostedAt(value: string | null | undefined): Date {
  if (!value) {
    throw new Error("GitHub review response is missing its timestamp");
  }
  const postedAt = new Date(value);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error("GitHub review response has an invalid timestamp");
  }
  return postedAt;
}

function createGithubRequestSignal(): AbortSignal {
  return AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS);
}

/** Posts the primary PR review and native suggestions in one GitHub request. */
export async function postPRReviewWithSuggestions(
  input: PostPRReviewParams,
): Promise<PostedGithubArtifact> {
  const octokit = createOctokitClient(input.token);
  const comments: ReviewComment[] = input.suggestions.flatMap((suggestion) => {
    const beforeLineCount = suggestion.before.split("\n").length;
    try {
      return [
        {
          path: suggestion.file,
          line: suggestion.line + beforeLineCount - 1,
          ...(beforeLineCount > 1 ? { startLine: suggestion.line } : {}),
          body: buildGithubArtifactBody({
            content: formatSuggestionComment(suggestion),
            marker: suggestion.marker,
          }),
        },
      ];
    } catch (error) {
      if (!(error instanceof GithubArtifactBodyBudgetError)) throw error;
      console.warn("Oversized native suggestion was omitted from GitHub inline posting", {
        file: suggestion.file,
        line: suggestion.line,
      });
      return [];
    }
  });
  const body = buildGithubArtifactBody({
    content: input.reviewContent,
    marker: input.mainMarker,
    title: "AI Code Review",
  });

  const { data } = await octokit.rest.pulls.createReview({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
    commit_id: input.headSha,
    body,
    event: "COMMENT",
    comments: comments.map(({ startLine, ...comment }) => ({
      ...comment,
      ...(startLine ? { start_line: startLine } : {}),
    })),
    request: { signal: createGithubRequestSignal() },
  });
  if (data.id === null || data.id === undefined) {
    throw new Error("GitHub review response is missing its ID");
  }

  return {
    id: String(data.id),
    kind: "pull-request-review",
    commitId: data.commit_id ?? null,
    postedAt: parsePostedAt(data.submitted_at),
  };
}

/** Posts persisted line issues as a best-effort advisory batch. */
export async function postInlineReviewIssues(
  input: PostInlineReviewIssuesInput,
): Promise<void> {
  const inlineIssues = input.issues.filter(
    (issue): issue is MarkedReviewIssue & { file: string; line: number } =>
      issue.file !== null && issue.line !== null,
  );
  if (inlineIssues.length === 0) return;

  await input.beforePost();
  const labels = ISSUE_FIELD_LABELS[input.langCode];
  const octokit = createOctokitClient(input.token);
  await octokit.rest.pulls.createReview({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
    commit_id: input.headSha,
    event: "COMMENT",
    comments: inlineIssues.map((issue) => ({
      path: issue.file,
      line: issue.line,
      body: buildGithubArtifactBody({
        content: formatIssueComment(
          issue,
          labels,
          REPEAT_BADGE_LABELS[input.langCode],
          VERIFICATION_LABELS[input.langCode],
        ),
        marker: issue.marker,
      }),
    })),
    request: { signal: createGithubRequestSignal() },
  });
}

function formatSuggestionComment(suggestion: CodeSuggestion): string {
  const explanation = normalizeSuggestionExplanation(suggestion.explanation);
  return `${SEVERITY_EMOJI[suggestion.severity]} **${suggestion.severity}**: ${explanation}

\`\`\`suggestion
${suggestion.after}
\`\`\``;
}

function formatIssueComment(
  issue: RepeatAnnotatedIssue,
  labels: { impact: string; recommendation: string },
  repeatLabels: { badge: string; context: string },
  verificationLabels: { badge: string },
): string {
  const severity = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
  const category = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;
  const title = (issue.title ?? "").trim();
  const rawBody = (
    issue.body ??
    (issue as { description?: string }).description ??
    ""
  ).trim();
  const impact = (issue.impact ?? "").trim();
  const recommendation = (issue.recommendation ?? "").trim();
  const titleSuffix =
    title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
  const body =
    titleSuffix !== null &&
    (titleSuffix === "" || /^[\s.,:;-]/.test(titleSuffix))
      ? titleSuffix.replace(/^[\s.,:;-]+/, "")
      : rawBody;
  const lines = [`### ${severity} · ${category}${title ? ` — ${title}` : ""}`];

  if (issue.repeat) {
    lines.push(
      "",
      `> 🔁 **${repeatLabels.badge}** — ${repeatLabels.context} ${issue.repeat.prUrl} (${issue.repeat.date})`,
    );
  }
  if (issue.verifierConfirmed) {
    lines.push("", `> ✅ **${verificationLabels.badge}**`);
  }
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) {
    lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  }
  return lines.join("\n");
}

export async function postVerificationReview(
  input: PostVerificationReviewInput,
): Promise<PostedGithubArtifact> {
  const octokit = createOctokitClient(input.token);
  const body = buildGithubArtifactBody({
    content: input.content,
    marker: input.marker,
  });
  const { data } = await octokit.rest.pulls.createReview({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
    commit_id: input.headSha,
    body,
    event: "COMMENT",
    request: { signal: createGithubRequestSignal() },
  });
  if (data.id === null || data.id === undefined) {
    throw new Error("GitHub review response is missing its ID");
  }

  return {
    id: String(data.id),
    kind: "pull-request-review",
    commitId: data.commit_id ?? null,
    postedAt: parsePostedAt(data.submitted_at),
  };
}
