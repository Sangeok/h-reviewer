"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApplySuggestion, useDismissSuggestion } from "../hooks/use-apply-suggestion";
import { SEVERITY_CONFIG, STATUS_CONFIG } from "../constants";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  suggestion: {
    id: string;
    filePath: string;
    lineNumber: number;
    beforeCode: string;
    afterCode: string;
    explanation: string;
    severity: keyof typeof SEVERITY_CONFIG;
    status: keyof typeof STATUS_CONFIG;
  };
}

export function SuggestionCard({ suggestion }: Props) {
  const applyMutation = useApplySuggestion();
  const dismissMutation = useDismissSuggestion();

  const severityConfig = SEVERITY_CONFIG[suggestion.severity];
  const isPending = suggestion.status === "PENDING";
  const isApplying = applyMutation.isPending;

  return (
    <Card className={`border-[#1a1a1a] bg-[#0a0a0a] ${severityConfig.borderColor}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header: severity + file path + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={severityConfig.color}>
              {severityConfig.emoji} {suggestion.severity}
            </span>
            <span className="text-sm text-[#707070] font-mono">
              {suggestion.filePath}:{suggestion.lineNumber}
            </span>
          </div>
          <span className={`text-xs ${STATUS_CONFIG[suggestion.status].color}`}>
            {STATUS_CONFIG[suggestion.status].label.en}
          </span>
        </div>

        {/* Explanation */}
        <p className="text-sm text-[#d0d0d0]">{suggestion.explanation}</p>

        {/* Code diff */}
        <div className="rounded border border-[#1a1a1a] overflow-hidden">
          <div className="bg-red-950/20 p-3 border-b border-[#1a1a1a]">
            <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap">{`- ${suggestion.beforeCode}`}</pre>
          </div>
          <div className="bg-green-950/20 p-3">
            <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap">{`+ ${suggestion.afterCode}`}</pre>
          </div>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => applyMutation.mutate(suggestion.id)}
              disabled={isApplying}
              className="bg-[#2d3e2d] hover:bg-[#3d523d] text-[#e0e0e0]"
            >
              {isApplying ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Check className="w-3 h-3 mr-1" />
              )}
              Apply Fix
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismissMutation.mutate(suggestion.id)}
              disabled={dismissMutation.isPending || isApplying}
              className="text-[#707070] hover:text-[#e0e0e0]"
            >
              {dismissMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <X className="w-3 h-3 mr-1" />
              )}
              Dismiss
            </Button>
          </div>
        )}

        {/* Error display */}
        {applyMutation.isError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="w-3 h-3" />
            {applyMutation.error?.message || "Failed to apply suggestion"}
          </div>
        )}
        {dismissMutation.isError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="w-3 h-3" />
            {dismissMutation.error?.message || "Failed to dismiss suggestion"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
