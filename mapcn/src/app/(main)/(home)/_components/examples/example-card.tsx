"use client";

import { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface ExampleCardProps {
  className?: string;
  stagger?: number;
  children: React.ReactNode;
}

export function ExampleCard({
  className,
  stagger = 5,
  children,
}: ExampleCardProps) {
  return (
    <div
      className={cn(
        "bg-card border-border/50 animate-scale-in animate-stagger relative overflow-hidden rounded-xl border shadow-sm",
        className,
      )}
      style={
        {
          "--stagger": stagger,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
