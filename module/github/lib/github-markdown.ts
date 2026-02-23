import { validateMermaidSequenceDiagram } from "./mermaid-validator";
import { DIAGRAM_FALLBACK_TEXT } from "@/shared/constants";
import type { LanguageCode } from "@/module/settings/constants";

/** 위험 문자 패턴 - Unicode 텍스트(한국어 등)는 허용, 구문 파괴 문자만 금지. 소괄호는 메서드 호출에 빈번 사용되므로 허용 */
const DANGEROUS_CHARS = /[`"'{};<>\[\]]/g;

/**
 * Mermaid 시퀀스 다이어그램 sanitize + validate 파이프라인.
 * 유효하지 않은 다이어그램은 현지화된 fallback 텍스트로 교체한다.
 */
export function sanitizeMermaidSequenceDiagrams(
  markdown: string,
  lang: LanguageCode = "en",
): string {
  return markdown.replace(
    /```mermaid\s*\n([\s\S]*?)\n```/g,
    (fullMatch, mermaidBody: string) => {
      // sequenceDiagram이 아닌 경우 원본 유지
      if (!/^\s*sequenceDiagram\b/m.test(mermaidBody)) {
        return fullMatch;
      }

      const sanitizedBody = mermaidBody
        .split(/\r?\n/)
        .filter((line) => {
          const trimmed = line.trimStart();
          if (trimmed.startsWith("activate ")) return false;
          if (trimmed.startsWith("deactivate ")) return false;
          return true;
        })
        .map((line) => {
          // 화살표의 +/- 마커 제거
          let cleaned = line.replace(/(->>|-->>|->|-->)[ \t]*[+-]/g, "$1");
          // 위험 문자 제거 (sequenceDiagram 선언 라인과 주석 제외)
          const trimmed = cleaned.trimStart();
          if (
            trimmed !== "sequenceDiagram" &&
            !trimmed.startsWith("%%")
          ) {
            // HTML entity(&#NNN; 또는 &name;)를 임시 토큰으로 보호 후 위험 문자 제거
            cleaned = cleaned
              .replace(/&(#\d+|[a-zA-Z]+);/g, "§ENTITY§$1§END§")
              .replace(DANGEROUS_CHARS, "")
              .replace(/§ENTITY§(.*?)§END§/g, "&$1;");
          }
          // 멀티라인 label을 단일 라인으로 축소 (줄바꿈→공백)
          return cleaned.replace(/\\n/g, " ");
        })
        .join("\n");

      // validator로 최종 검증
      const { isValid } = validateMermaidSequenceDiagram(sanitizedBody);

      if (!isValid) {
        const fallback = DIAGRAM_FALLBACK_TEXT[lang];
        return `> ${fallback}`;
      }

      return `\`\`\`mermaid\n${sanitizedBody}\n\`\`\``;
    },
  );
}
