import parseDiff from "parse-diff";

export interface ChangedFileInfo {
  filePath: string;
  addedLines: number[];
  /** rename 케이스일 때만 존재. diff의 `a/` 쪽(old path). */
  originalPath?: string;
}

/**
 * Git core.quotepath=true 모드가 출력하는 quoted path를 역변환한다.
 *   입력: "public/\353\263\200\352\262\275 \354\202\254\355\225\255.png"
 *   출력: public/변경 사항.png
 * Quote가 없거나 backslash가 없는 경우 그대로 반환 (fast path).
 */
export function unescapeGitPath(path: string): string {
  const unquoted =
    path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
  if (!unquoted.includes("\\")) return unquoted;

  const bytes: number[] = [];
  let i = 0;
  while (i < unquoted.length) {
    const ch = unquoted[i];
    if (
      ch === "\\" &&
      i + 3 < unquoted.length &&
      /^[0-7]{3}$/.test(unquoted.slice(i + 1, i + 4))
    ) {
      bytes.push(parseInt(unquoted.slice(i + 1, i + 4), 8));
      i += 4;
    } else if (ch === "\\" && i + 1 < unquoted.length) {
      const next = unquoted[i + 1];
      const cEscape: Record<string, number> = {
        a: 0x07, b: 0x08, t: 0x09, n: 0x0a, v: 0x0b,
        f: 0x0c, r: 0x0d, '"': 0x22, "\\": 0x5c,
      };
      bytes.push(cEscape[next] ?? next.charCodeAt(0));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf-8");
}

/**
 * unified diff를 파싱하여 파일별 changed file 정보를 추출한다.
 * 삭제·rename 파일도 포함하며, 경로는 UTF-8로 정규화된다.
 */
export function parseDiffFiles(diffText: string): ChangedFileInfo[] {
  const files = parseDiff(diffText);

  return files
    .filter((f) => {
      const hasTo = f.to && f.to !== "/dev/null";
      const hasFrom = f.from && f.from !== "/dev/null";
      return hasTo || hasFrom;
    })
    .map((f) => {
      const hasTo = f.to && f.to !== "/dev/null";
      const hasFrom = f.from && f.from !== "/dev/null";
      const rawPath = hasTo ? f.to! : f.from!;
      const isRename = hasTo && hasFrom && f.to !== f.from;
      const addedLines: number[] = [];
      for (const chunk of f.chunks) {
        for (const change of chunk.changes) {
          if (change.type === "add" && "ln" in change) {
            addedLines.push(change.ln);
          }
        }
      }
      return {
        filePath: unescapeGitPath(rawPath),
        addedLines,
        originalPath: isRename ? unescapeGitPath(f.from!) : undefined,
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
      if (f.addedLines.length === 0) {
        return f.originalPath
          ? `- ${f.filePath} (renamed from ${f.originalPath})`
          : `- ${f.filePath} (deleted)`;
      }
      return `- ${f.filePath}: added lines [${lineRanges}]`;
    })
    .join("\n");
}

/**
 * diff에 포함된 파일 경로 Set을 반환한다.
 * rename의 old/new 경로 둘 다 포함하여 AI가 어느 쪽을 써도 매치된다.
 */
export function extractDiffFileSet(diffText: string): Set<string> {
  const set = new Set<string>();
  for (const f of parseDiffFiles(diffText)) {
    set.add(f.filePath);
    if (f.originalPath) set.add(f.originalPath);
  }
  return set;
}

function summarizeLineRanges(lines: number[]): string {
  if (lines.length === 0) return "none";
  if (lines.length <= 10) return lines.join(", ");

  const sorted = [...lines].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[sorted.length - 1]} (${sorted.length} lines)`;
}
