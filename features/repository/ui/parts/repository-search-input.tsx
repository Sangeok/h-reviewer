"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface RepositorySearchInputProps {
  value: string;
  onChange: (nextValue: string) => void;
}

export function RepositorySearchInput({ value, onChange }: RepositorySearchInputProps) {
  return (
    <div className="relative group">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground-alt group-hover:text-primary transition-colors duration-300" />
      <Input
        type="text"
        placeholder="Search repositories..."
        className="pl-10 bg-sidebar border-border text-sidebar-foreground placeholder:text-muted-foreground-alt hover:border-ring/50 focus:border-ring focus:ring-ring/20 transition-all duration-300"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
