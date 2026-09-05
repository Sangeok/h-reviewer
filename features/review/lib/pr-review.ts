import { createOctokitClient } from "@/lib/github/github";
import {
  assertGithubArtifactBodyBudget,
  buildGithubArtifactBody,
} from "@/lib/github/github-artifact-body";
import {
  createPostedGithubArtifact,
  type PostedGithubArtifact,
} from "@/lib/github/github-review-artifacts";
import type { CodeSuggestion, StructuredIssue, RepeatBadgeInfo } from "@/features/ai";
import { CATEGORY_EMOJI, SEVERITY_EMOJI } from "@/features/ai";
import { normalizeSuggestionExplanation } from "@/features/ai/lib/suggestion-format";
import type { LanguageCode } from "@/shared/types/language";
import { ISSUE_FIELD_LABELS, REPEAT_BADGE_LABELS, VERIFICATION_LABELS } from "@/shared/constants";
import { GITHUB_POST_TIMEOUT_MS } from "../constants";
import { buildReviewArtifactMarker } from "./review-artifact-marker";

export type RepeatAnnotatedIssue = StructuredIssue & {
  repeat?: RepeatBadgeInfo | null;
  verifierConfirmed?: boolean;
};

interface ReviewComment {
  path: string;
  line: number;
  startLine?: number;
  body: string;
}

export type PersistedReviewSuggestion = CodeSuggestion & { id: string };
export type PersistedReviewIssue = RepeatAnnotatedIssue & { id: string };

export interface PostPRReviewParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  reviewId: string;
  reviewContent: string;
  mainMarker: string;
  suggestions: PersistedReviewSuggestion[];
  issues: PersistedReviewIssue[];
  headSha: string;
  langCode: LanguageCode;
  beforeInlinePost(): Promise<void>;
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

/**
 * PR Review API로 인라인 suggestion 코멘트를 포스팅한다.
 * 전체 리뷰 요약은 review body에, 개별 제안은 inline comment로.
 *
 * ⚠️ 분리 포스팅 전략:
 * inline issues를 suggestions와 같은 createReview() 호출에 넣으면,
 * AI가 diff 범위 밖 line number를 생성한 경우 전체 호출이 422로 실패하여 정상 suggestions까지 손실된다.
 * suggestions는 before 필드로 diff 정합성을 검증할 수 있지만, issues는 검증 수단이 없다.
 * 따라서 suggestions 먼저 포스팅 → issues 별도 포스팅(실패 허용) 전략을 사용한다.
 */
export async function postPRReviewWithSuggestions(
  params: PostPRReviewParams,
): Promise<PostedGithubArtifact> {
  const {
    token,
    owner,
    repo,
    prNumber,
    reviewId,
    reviewContent,
    mainMarker,
    suggestions,
    issues,
    headSha,
    langCode,
    beforeInlinePost,
  } = params;
  const labels = ISSUE_FIELD_LABELS[langCode];
  const octokit = createOctokitClient(token);

  // suggestion comments
  const suggestionComments: ReviewComment[] = suggestions.flatMap((s) => {
    const beforeLineCount = s.before.split("\n").length;
    const body = buildAdvisoryBody({
      content: formatSuggestionComment(s),
      marker: buildReviewArtifactMarker(reviewId, {
        kind: "suggestion",
        id: s.id,
      }),
    });
    if (!body) {
      return [];
    }
    const comment: ReviewComment = {
      path: s.file,
      line: s.line + beforeLineCount - 1,
      body,
    };
    if (beforeLineCount > 1) {
      comment.startLine = s.line;
    }
    return [comment];
  });

  // issue comments (file+line 둘 다 있는 issues만 inline comment로)
  // file-level issues (line: null)는 review body 테이블에 포함됨
  // ⚠️ type predicate 사용 — plain .filter()는 TypeScript narrowing 불가
  const inlineIssues = issues.filter(
    (i): i is PersistedReviewIssue & { file: string; line: number } =>
      i.file !== null && i.line !== null
  );
  const issueComments: ReviewComment[] = inlineIssues.flatMap((i) => {
    const body = buildAdvisoryBody({
      content: formatIssueComment(
        i,
        labels,
        REPEAT_BADGE_LABELS[langCode],
        VERIFICATION_LABELS[langCode],
      ),
      marker: buildReviewArtifactMarker(reviewId, {
        kind: "issue",
        id: i.id,
      }),
    });

    return body ? [{ path: i.file, line: i.line, body }] : [];
  });

  const mainBody = buildGithubArtifactBody({
    content: reviewContent,
    marker: mainMarker,
    title: "AI Code Review",
  });
  assertGithubArtifactBodyBudget({ body: mainBody });

  // 1차 호출: suggestions + review body (summary + general issues 테이블)
  const { data: mainReview } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    body: mainBody,
    event: "COMMENT",
    comments: suggestionComments.map(({ startLine, ...c }) => ({
      ...c,
      ...(startLine ? { start_line: startLine } : {}),
    })),
    request: { signal: AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS) },
  });

  const artifact = createPostedGithubArtifact({
    id: mainReview.id,
    kind: "pull-request-review",
    commitId: mainReview.commit_id,
    postedAt: mainReview.submitted_at,
  });

  // 2차 호출: inline issues — 실패해도 suggestions에 영향 없음
  // ⚠️ line-specific issues(file+line)는 review body에 미포함 — 2차 호출 실패 시 유실됨
  // general issues(line: null)만 review body 테이블에 포함되어 보존됨
  if (issueComments.length > 0) {
    await beforeInlinePost();
    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: headSha,
        // body 필드 생략 — body: "" 사용 시 GitHub PR Conversation 탭에 빈 review entry 생성됨
        event: "COMMENT",
        // issueComments는 startLine이 없으므로 (single-line만) 직접 전달
        comments: issueComments.map(({ body, path, line }) => ({
          path,
          line,
          body,
        })),
        request: { signal: AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS) },
      });
    } catch (error) {
      console.warn("Inline issue comments failed (suggestions were posted successfully):", error);
    }
  }

  return artifact;
}

function buildAdvisoryBody(input: {
  content: string;
  marker: string;
}): string | null {
  try {
    const body = buildGithubArtifactBody(input);
    assertGithubArtifactBodyBudget({ body });
    return body;
  } catch (error) {
    console.warn("Skipped oversized or invalid advisory GitHub artifact:", error);
    return null;
  }
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
  const sev = `${SEVERITY_EMOJI[issue.severity]} ${issue.severity}`;
  const cat = `${CATEGORY_EMOJI[issue.category]} ${issue.category}`;

  // 방어적 기본값 — in-flight resume + 빈 값 대응
  const title = (issue.title ?? "").trim();
  const rawBody = (issue.body ?? (issue as { description?: string }).description ?? "").trim();
  const impact = (issue.impact ?? "").trim();
  const recommendation = (issue.recommendation ?? "").trim();

  // 문장 경계 검사 + body 빈값 skip guard
  const titleSuffix = title && rawBody.startsWith(title) ? rawBody.slice(title.length) : null;
  const body =
    titleSuffix !== null && (titleSuffix === "" || /^[.,:;—\-]/.test(titleSuffix))
      ? titleSuffix.replace(/^[\s.,:;—\-]+/, "")
      : rawBody;

  const lines: string[] = [
    `### ${sev} · ${cat}${title ? ` — ${title}` : ""}`,
  ];
  if (issue.repeat) {
    lines.push("", `> ⚠️ **${repeatLabels.badge}** — ${repeatLabels.context} ${issue.repeat.prUrl} (${issue.repeat.date})`);
  }
  if (issue.verifierConfirmed) {
    lines.push("", `> ✅ **${verificationLabels.badge}**`);
  }
  if (body) lines.push("", body);
  if (impact) lines.push("", `**${labels.impact}:** ${impact}`);
  if (recommendation) lines.push("", `**${labels.recommendation}:** ${recommendation}`);
  return lines.join("\n");
  // SYNC:formatIssueBody — review-formatter.ts · structured-review-body.tsx 와 동일 로직 유지
}

/** 검수자 명의(동일 계정)의 body-only 리뷰 엔트리 게시.
 *  인라인 코멘트 없음 — body가 있는 review는 PR Conversation 탭에 별도 리뷰 카드로 나타난다
 *  (위 postPRReviewWithSuggestions 2차 호출의 "body 필드 생략" 주석과 동일 근거의 역방향 활용). */
export async function postVerificationReview(
  input: PostVerificationReviewInput,
): Promise<PostedGithubArtifact> {
  const { token, owner, repo, prNumber, headSha, content, marker } = input;
  const octokit = createOctokitClient(token);
  const body = buildGithubArtifactBody({ content, marker });
  assertGithubArtifactBodyBudget({ body });
  const { data } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    body,
    event: "COMMENT",
    request: { signal: AbortSignal.timeout(GITHUB_POST_TIMEOUT_MS) },
  });

  return createPostedGithubArtifact({
    id: data.id,
    kind: "pull-request-review",
    commitId: data.commit_id,
    postedAt: data.submitted_at,
  });
}
