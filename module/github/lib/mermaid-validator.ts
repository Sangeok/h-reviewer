export interface MermaidValidationResult {
  isValid: boolean;
  reason: string | null;
}

const SAFE_ID = /[a-zA-Z0-9_]+/;
const ARROW = /(?:->>|-->>|->|-->|-x|--x|-\)|--\))/;

const LINE_PATTERNS: RegExp[] = [
  // sequenceDiagram 선언
  /^\s*sequenceDiagram\s*$/,
  // participant (as 별칭 포함)
  new RegExp(`^\\s*participant\\s+${SAFE_ID.source}(\\s+as\\s+.+)?\\s*$`),
  // actor (participant와 동일 구문)
  new RegExp(`^\\s*actor\\s+${SAFE_ID.source}(\\s+as\\s+.+)?\\s*$`),
  // 화살표 메시지: ID->>ID: 메시지
  new RegExp(
    `^\\s*${SAFE_ID.source}\\s*${ARROW.source}\\s*${SAFE_ID.source}\\s*:\\s*.+$`,
  ),
  // Note over ID[,ID]: TEXT
  new RegExp(
    `^\\s*Note\\s+over\\s+${SAFE_ID.source}(\\s*,\\s*${SAFE_ID.source})?\\s*:\\s*.+$`,
  ),
  // Note right of ID: TEXT / Note left of ID: TEXT
  new RegExp(
    `^\\s*Note\\s+(?:right|left)\\s+of\\s+${SAFE_ID.source}\\s*:\\s*.+$`,
  ),
  // 제어 구조
  /^\s*loop\s+.+$/,
  /^\s*alt\s+.+$/,
  /^\s*else(\s+.*)?$/,
  /^\s*opt\s+.+$/,
  /^\s*end\s*$/,
  // autonumber
  /^\s*autonumber\s*$/,
  // 주석
  /^\s*%%.*$/,
  // 빈 줄/공백
  /^\s*$/,
];

/**
 * Mermaid sequenceDiagram 라인 레벨 검증.
 * 모든 라인이 허용 패턴에 매칭되고, 무결성 조건을 만족해야 유효.
 */
export function validateMermaidSequenceDiagram(
  mermaidBody: string,
): MermaidValidationResult {
  const lines = mermaidBody.split(/\r?\n/);

  let participantCount = 0;
  let arrowCount = 0;
  const unknownLines: string[] = [];

  for (const line of lines) {
    const matched = LINE_PATTERNS.some((pattern) => pattern.test(line));

    if (!matched) {
      unknownLines.push(line);
      continue;
    }

    if (/^\s*(?:participant|actor)\s+/.test(line)) {
      participantCount++;
    }

    const arrowMatch = line.match(
      new RegExp(
        `^\\s*(${SAFE_ID.source})\\s*${ARROW.source}\\s*(${SAFE_ID.source})`,
      ),
    );
    if (arrowMatch) {
      arrowCount++;
    }
  }

  if (unknownLines.length > 0) {
    return {
      isValid: false,
      reason: `미인식 라인 ${unknownLines.length}개 발견: "${unknownLines[0]}"`,
    };
  }

  if (participantCount < 2 && arrowCount < 1) {
    return {
      isValid: false,
      reason: `participant ${participantCount}개, 화살표 ${arrowCount}개 - 최소 조건 미충족`,
    };
  }

  if (arrowCount < 1) {
    return {
      isValid: false,
      reason: "화살표 라인이 최소 1개 필요",
    };
  }

  return { isValid: true, reason: null };
}
