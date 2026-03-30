import parseDiff from "parse-diff";

export interface ChangedFileInfo {
  filePath: string;
  addedLines: number[];
}

/**
 * unified diff를 파싱하여 파일별 added line 정보를 추출한다.
 */
export function parseDiffFiles(diffText: string): ChangedFileInfo[] {
  const files = parseDiff(diffText);

  return files
    .filter((f) => f.to && f.to !== "/dev/null")
    .map((f) => {
      const addedLines: number[] = [];
      for (const chunk of f.chunks) {
        for (const change of chunk.changes) {
          if (change.type === "add" && "ln" in change) {
            addedLines.push(change.ln);
          }
        }
      }
      return {
        filePath: f.to!,
        addedLines,
      };
    });
}

/**
 * AI 프롬프트에 포함할 파일별 변경 라인 요약 문자열을 생성한다.
 */
export function parseDiffToChangedFiles(diffText: string): string {
  const files = parseDiffFiles(diffText);

  return files
    .map((f) => {
      const lineRanges = summarizeLineRanges(f.addedLines);
      return `- ${f.filePath}: added lines [${lineRanges}]`;
    })
    .join("\n");
}

/**
 * diff에 포함된 파일 경로 Set을 반환한다.
 * issue의 file 필드가 실제 diff 파일인지 검증할 때 사용한다.
 */
export function extractDiffFileSet(diffText: string): Set<string> {
  return new Set(parseDiffFiles(diffText).map(f => f.filePath));
}

function summarizeLineRanges(lines: number[]): string {
  if (lines.length === 0) return "none";
  if (lines.length <= 10) return lines.join(", ");

  const sorted = [...lines].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[sorted.length - 1]} (${sorted.length} lines)`;
}
