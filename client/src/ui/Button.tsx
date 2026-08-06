/*
 * Generic <Button> atom with variant + size support.
 * Keeps DRY across Order Panel, forms, nav, etc.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "danger" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary: "bg-aalgreen text-white hover:bg-aalgreen/90 active:scale-[0.97]",
  danger: "bg-aalred text-white hover:bg-aalred/90 active:scale-[0.97]",
  ghost: "bg-transparent text-slate-400 hover:bg-slate-800/15",
  outline: "bg-terminal-900 border border-terminal-800 text-slate-200 hover:bg-slate-800/10",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-2.5 text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "rounded-lg font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
