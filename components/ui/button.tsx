"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl border text-sm font-extrabold shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        ghost: "border-white/15 bg-white/5 hover:bg-white/10",
        primary: "border-emerald-300/45 bg-emerald-300/15 hover:bg-emerald-300/20",
        settings: "border-fuchsia-400/55 bg-gradient-to-b from-fuchsia-500/25 to-cyan-400/10 hover:border-cyan-300/55",
      },
      size: {
        default: "h-11 px-3",
        sm: "h-10 px-3",
        icon: "h-11 w-11 p-0",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);
Button.displayName = "Button";

