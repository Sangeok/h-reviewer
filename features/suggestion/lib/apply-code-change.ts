export type ApplyCodeChangeResult = {
  content: string;
  changed: boolean;
};

type ApplyCodeChangeParams = {
  fileContent: string;
  beforeCode: string;
  afterCode: string;
  lineNumber: number;
  strict: boolean;
};

export function applyCodeChange({
  fileContent,
  beforeCode,
  afterCode,
  lineNumber,
  strict,
}: ApplyCodeChangeParams): ApplyCodeChangeResult {
  const originalContent = fileContent.replace(/\r\n/g, "\n");
  const originalBefore = beforeCode.replace(/\r\n/g, "\n");
  const originalAfter = afterCode.replace(/\r\n/g, "\n");

  if (originalContent.includes(originalBefore)) {
    const content = replaceNearestOccurrence(originalContent, originalBefore, originalAfter, lineNumber);
    return { content, changed: true };
  }

  if (strict) {
    return { content: originalContent, changed: false };
  }

  const normalizedBefore = originalBefore.replace(/[ \t]+$/gm, "");
  const escaped = normalizedBefore.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexPattern = escaped.split("\n").map((line) => line + "[ \\t]*").join("\\n");
  const regex = new RegExp(flexPattern, "g");

  const matches: { index: number; length: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(originalContent)) !== null) {
    matches.push({ index: match.index, length: match[0].length });
    regex.lastIndex = match.index + 1;
  }

  if (matches.length === 0) return { content: originalContent, changed: false };

  const lineOfIndex = (idx: number) => originalContent.slice(0, idx).split("\n").length;
  let best = matches[0];
  let bestDist = Math.abs(lineOfIndex(best.index) - lineNumber);
  for (let i = 1; i < matches.length; i++) {
    const dist = Math.abs(lineOfIndex(matches[i].index) - lineNumber);
    if (dist < bestDist) {
      bestDist = dist;
      best = matches[i];
    }
  }

  const content =
    originalContent.slice(0, best.index) +
    originalAfter +
    originalContent.slice(best.index + best.length);
  return { content, changed: true };
}

export function replaceNearestOccurrence(
  content: string,
  before: string,
  after: string,
  targetLine: number,
): string {
  const indices: number[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = content.indexOf(before, searchFrom);
    if (idx === -1) break;
    indices.push(idx);
    searchFrom = idx + 1;
  }

  if (indices.length === 0) return content;
  if (indices.length === 1) {
    return content.slice(0, indices[0]) + after + content.slice(indices[0] + before.length);
  }

  const lineOfIndex = (idx: number) => content.slice(0, idx).split("\n").length;
  let bestIdx = indices[0];
  let bestDist = Math.abs(lineOfIndex(indices[0]) - targetLine);

  for (let i = 1; i < indices.length; i++) {
    const dist = Math.abs(lineOfIndex(indices[i]) - targetLine);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = indices[i];
    }
  }

  return content.slice(0, bestIdx) + after + content.slice(bestIdx + before.length);
}
