import { Loader2 } from "lucide-react";

export function ReviewSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 rounded-lg border border-border bg-gradient-to-b from-sidebar to-black">
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground font-light">Loading reviews...</p>
    </div>
  );
}
