import parseDiff from "parse-diff";

export type DiffChangeType = "added" | "modified" | "deleted" | "renamed";

export type ChangedFileInfo = {
  filePath: string;
  addedLines: number[];
  changeType: DiffChangeType;
  originalPath?: string;
};

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
      const hasTo = Boolean(f.to && f.to !== "/dev/null");
      const hasFrom = Boolean(f.from && f.from !== "/dev/null");
      const rawPath = hasTo ? f.to! : f.from!;
      const isRename = hasTo && hasFrom && f.to !== f.from;
      const changeType: DiffChangeType = !hasTo
        ? "deleted"
        : !hasFrom
          ? "added"
          : isRename
            ? "renamed"
            : "modified";
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
        changeType,
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
      if (f.changeType === "deleted") {
        return `- ${f.filePath} (deleted)`;
      }

      if (f.changeType === "renamed" && f.addedLines.length === 0) {
        return `- ${f.filePath} (renamed from ${f.originalPath})`;
      }

      if (f.changeType === "renamed") {
        return `- ${f.filePath} (renamed from ${f.originalPath}): added lines [${lineRanges}]`;
      }

      return `- ${f.filePath}: added lines [${lineRanges}]`;
    })
    .join("\n");
}

/**
 * diff에 포함된 파일별 added line 번호 Set을 반환한다.
 * suggestion line 검증에 사용. 게시 가능한 current path만 key로 둔다.
 */
export function extractDiffAddedLinesMap(
  diffText: string,
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const f of parseDiffFiles(diffText)) {
    const lineSet = new Set(f.addedLines);
    map.set(f.filePath, lineSet);
  }
  return map;
}

/**
 * diff에 포함된 게시 가능한 current file path Set을 반환한다.
 */
export function extractDiffFileSet(diffText: string): Set<string> {
  const set = new Set<string>();
  for (const f of parseDiffFiles(diffText)) {
    set.add(f.filePath);
  }
  return set;
}

/** rename old path를 GitHub review에 사용할 current path로 변환한다. */
export function extractDiffPathAliases(
  diffText: string,
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const file of parseDiffFiles(diffText)) {
    if (file.originalPath) {
      aliases.set(file.originalPath, file.filePath);
    }
  }

  return aliases;
}

/** suggestion의 전체 before 범위가 diff의 added line인지 검증한다. */
export function isRangeFullyAdded(
  addedLinesByPath: Map<string, Set<number>>,
  filePath: string,
  startLine: number,
  lineCount: number,
): boolean {
  if (
    !Number.isInteger(startLine) ||
    startLine < 1 ||
    !Number.isInteger(lineCount) ||
    lineCount < 1
  ) {
    return false;
  }

  const addedLines = addedLinesByPath.get(filePath);
  if (!addedLines || addedLines.size === 0) return false;

  for (let offset = 0; offset < lineCount; offset += 1) {
    if (!addedLines.has(startLine + offset)) return false;
  }

  return true;
}

function summarizeLineRanges(lines: number[]): string {
  if (lines.length === 0) return "none";
  if (lines.length <= 10) return lines.join(", ");

  const sorted = [...lines].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[sorted.length - 1]} (${sorted.length} lines)`;
}

/**
 * compare API per-file patch에서 old side(변경 전 파일 좌표) 기준으로
 * 삭제/수정된 라인 번호 집합을 추출한다.
 * 순수 추가(+만 있는) patch는 빈 Set을 반환한다 — 삽입은 기존 라인을 건드리지 않으므로.
 */
export function extractPatchOldSideTouchedLines(patch: string): Set<number> {
  const touched = new Set<number>();
  let oldLine = 0;

  for (const line of patch.split("\n")) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1]);
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      touched.add(oldLine);
      oldLine++;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      // new side 전용 — old 좌표 증가 없음
    } else if (line !== "" && !line.startsWith("\\")) {
      // context 라인 (blank context는 " "이므로 여기 포함).
      // "" (split의 trailing-newline 아티팩트)와 "\ No newline..."은 카운트 제외 — old 좌표 오증가 방지.
      oldLine++;
    }
  }

  return touched;
}
