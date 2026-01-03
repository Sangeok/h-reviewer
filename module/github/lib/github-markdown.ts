export function sanitizeMermaidSequenceDiagrams(markdown: string): string {
  // GitHub Mermaid rendering is strict. The most common break we see is mismatched activation
  // (activate/deactivate or arrow +/-). Safest fix: strip activation syntax entirely.
  return markdown.replace(/```mermaid\s*\n([\s\S]*?)\n```/g, (fullMatch, mermaidBody: string) => {
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
      .map((line) =>
        // Remove activation markers on arrows (e.g. ->>+ , -->>-). Keep the arrow itself.
        line.replace(/(->>|-->>|->|-->)[ \t]*[+-]/g, "$1")
      )
      .join("\n");

    return `\`\`\`mermaid\n${sanitizedBody}\n\`\`\``;
  });
}
