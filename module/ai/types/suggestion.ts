export type SuggestionSeverity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";

export interface CodeSuggestion {
  file: string;
  line: number;
  before: string;
  after: string;
  explanation: string;
  severity: SuggestionSeverity;
}

export interface StructuredReview {
  summary: string;
  walkthrough: string | null;
  strengths: string[];
  issues: string[];
  suggestions: CodeSuggestion[];
  sequenceDiagram: string | null;
}
