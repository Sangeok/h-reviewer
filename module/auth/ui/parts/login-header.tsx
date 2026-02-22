import { Code2 } from "lucide-react";
import { LOGIN_STRINGS } from "../../constants";

export default function LoginHeader() {
  return (
    <div className="mb-16 text-center">
      <div className="mb-4 inline-flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 bg-ring blur-xl opacity-20" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-ring/30 bg-gradient-to-br from-secondary to-card shadow-lg">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h1 className="-mb-0.5 font-mono text-2xl font-medium tracking-tight text-secondary-foreground">
          {LOGIN_STRINGS.brandName}
        </h1>
      </div>
      <p className="text-sm font-light tracking-wide text-chart-4">{LOGIN_STRINGS.brandTagline}</p>
    </div>
  );
}
