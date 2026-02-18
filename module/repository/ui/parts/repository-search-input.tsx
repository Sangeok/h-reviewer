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
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#606060] group-hover:text-[#4a6a4a] transition-colors duration-300" />
      <Input
        type="text"
        placeholder="Search repositories..."
        className="pl-10 bg-[#0a0a0a] border-[#1a1a1a] text-[#e0e0e0] placeholder:text-[#606060] hover:border-[#2d3e2d]/50 focus:border-[#2d3e2d] focus:ring-[#2d3e2d]/20 transition-all duration-300"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
