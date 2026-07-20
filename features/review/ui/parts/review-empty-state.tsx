import { Card, CardContent } from "@/components/ui/card";
import { FileCode } from "lucide-react";

export function ReviewEmptyState() {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-b from-card to-background border-border">
      <CardContent className="pt-6">
        <div className="text-center py-16">
          <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-lg bg-secondary border border-ring/30">
            <FileCode className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground font-light">No reviews found</p>
          <p className="text-xs text-muted-foreground-alt font-light mt-2">
            Connect a repository and create a pull request to get started
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
