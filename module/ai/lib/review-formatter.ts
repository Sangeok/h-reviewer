import type { StructuredReviewOutput } from "./review-schema";
import type { LanguageCode } from "@/module/settings/constants";
import { SECTION_HEADERS } from "@/shared/constants";

export function formatStructuredReviewToMarkdown(
  output: StructuredReviewOutput,
  langCode: LanguageCode
): string {
  const headers = SECTION_HEADERS[langCode];
  const sections: string[] = [];

  sections.push(`## ${headers.summary}\n\n${output.summary}`);

  if (output.walkthrough) {
    sections.push(`## ${headers.walkthrough}\n\n${output.walkthrough}`);
  }

  if (output.sequenceDiagram) {
    sections.push(`## ${headers.sequenceDiagram}\n\n\`\`\`mermaid\n${output.sequenceDiagram}\n\`\`\``);
  }

  if (output.strengths.length > 0) {
    const items = output.strengths.map(s => `- ${s}`).join("\n");
    sections.push(`## ${headers.strengths}\n\n${items}`);
  }

  if (output.issues.length > 0) {
    const items = output.issues.map(i => `- ${i}`).join("\n");
    sections.push(`## ${headers.issues}\n\n${items}`);
  }

  if (output.suggestions.length > 0) {
    const items = output.suggestions.map(s =>
      `- **${s.file}:${s.line}** [${s.severity}]: ${s.explanation}`
    ).join("\n");
    sections.push(`## ${headers.suggestions}\n\n${items}`);
  }

  return sections.join("\n\n");
}
