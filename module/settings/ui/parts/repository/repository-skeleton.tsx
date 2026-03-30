import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RepositorySkeleton() {
  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background">
      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-medium text-foreground">Connected Repository</CardTitle>
        <CardDescription className="font-light text-muted-foreground">
          Manage your connected GitHub repositories
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-lg bg-secondary" />
          <div className="h-16 animate-pulse rounded-lg bg-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}
