"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ExternalLink, Loader2, Trash2 } from "lucide-react";

interface RepositoryItemProps {
  repository: {
    id: string;
    name: string;
    fullName: string;
    url: string;
    createdAt: Date;
  };
  onDisconnect: (id: string) => void;
  isDisconnecting: boolean;
}

export function RepositoryItem({ repository, onDisconnect, isDisconnecting }: RepositoryItemProps) {
  return (
    <div className="group relative flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all duration-300 hover:border-ring/50 hover:bg-accent">
      <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-r from-ring/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative z-10 flex min-w-0 flex-1 items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="truncate font-medium text-foreground">{repository.fullName}</h3>
          <a
            href={repository.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary transition-colors duration-300 hover:text-primary-hover"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-4 text-destructive transition-all duration-300 hover:bg-destructive-bg/30 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-border bg-gradient-to-b from-card to-background">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span>Disconnect Repository?</span>
              </AlertDialogTitle>
              <AlertDialogDescription className="font-light text-muted-foreground">
                This action will disconnect the repository and delete all associated AI reviews. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-ring/30 bg-secondary text-secondary-foreground transition-all duration-300 hover:bg-accent hover:text-foreground">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDisconnect(repository.id)}
                className="border border-destructive-bg/50 bg-gradient-to-r from-destructive-bg to-destructive-bg/80 text-destructive hover:from-destructive-bg hover:to-destructive-bg/70"
                disabled={isDisconnecting}
              >
                {isDisconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Disconnect"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
