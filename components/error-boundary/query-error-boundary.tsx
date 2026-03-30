"use client";

import { type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/utils";

interface QueryBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  title?: string;
  description?: string;
}

export function QueryBoundary({ children, fallback, title, description }: QueryBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ resetErrorBoundary, error }) => (
            <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
              <CardHeader className="relative z-10">
                {title && (
                  <CardTitle className="text-lg font-medium text-foreground">{title}</CardTitle>
                )}
                <CardDescription className="font-light text-muted-foreground">
                  {description ?? "Failed to load data"}
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10 space-y-3">
                <p className="text-sm font-light text-muted-foreground">
                  {getErrorMessage(error, "An unexpected error occurred")}
                </p>
                <Button
                  variant="outline"
                  className="border-ring/30 bg-secondary text-secondary-foreground transition-all duration-300 hover:bg-accent hover:text-foreground"
                  onClick={resetErrorBoundary}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}
        >
          <Suspense fallback={fallback}>
            {children}
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
