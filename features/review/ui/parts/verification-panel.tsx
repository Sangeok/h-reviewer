import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { StoredReviewData, ReviewVerification, VerificationVerdict } from "@/features/ai";
import type { LanguageCode } from "@/shared/types/language";
import { VERIFICATION_LABELS } from "@/shared/constants";

interface Props {
  issues: StoredReviewData["issues"];
  verification: ReviewVerification;
  langCode: LanguageCode;
}

// REJECTED verdicts never survive into kept findings, so this map omits it.
// (satisfies는 좁은 타입을 유지해 full-union 인덱싱이 불가 — Partial 주석으로 키 검사 + string|undefined 인덱싱)
const VERDICT_STYLE: Partial<Record<VerificationVerdict, string>> = {
  CONFIRMED: "text-green-500",
  UNCERTAIN: "text-muted-foreground",
};

export function VerificationPanel({ issues, verification, langCode }: Props) {
  const labels = VERIFICATION_LABELS[langCode];

  if (verification.status === "skipped") {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <ShieldAlert className="w-4 h-4" />
          {labels.skipped}
        </CardContent>
      </Card>
    );
  }

  const rejectedCount =
    verification.rejectedIssues.length + verification.rejectedSuggestions.length;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-medium text-foreground">
          <ShieldCheck className="w-5 h-5 text-green-500" />
          {labels.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 생존 이슈별 판정 — verification.issueVerdicts는 issues와 index 정렬 */}
        {issues.length > 0 && (
          <ul className="space-y-1">
            {issues.map((issue, index) => {
              const entry = verification.issueVerdicts[index];
              if (!entry) return null;
              return (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className={`shrink-0 font-mono text-xs ${VERDICT_STYLE[entry.verdict] ?? ""}`}>
                    {entry.verdict}
                  </span>
                  <span className="text-foreground">{issue.title}</span>
                </li>
              );
            })}
          </ul>
        )}

        {/* 걸러진 항목 — 접기 */}
        {rejectedCount > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {labels.excluded} ({rejectedCount})
            </summary>
            <ul className="mt-2 space-y-2 border-l border-border pl-3">
              {verification.rejectedIssues.map((issue, index) => (
                <li key={`issue-${index}`}>
                  <p className="text-foreground line-through">{issue.title}</p>
                  <p className="text-xs text-muted-foreground">{issue.reason}</p>
                </li>
              ))}
              {verification.rejectedSuggestions.map((suggestion, index) => (
                <li key={`suggestion-${index}`}>
                  <p className="text-foreground line-through">
                    {suggestion.file}:{suggestion.line}
                  </p>
                  <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
