/*
 * Small pill / tag component for labels (GREEN, AMBER, RED, etc.)
 */
import clsx from "clsx";

interface TagProps {
  label: string;
  color?: "green" | "amber" | "red" | "blue" | "slate";
  className?: string;
}

const palette: Record<string, string> = {
  green: "bg-aalgreen/10 text-aalgreen",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-aalred/10 text-aalred",
  blue: "bg-blue-100 text-blue-700",
  slate: "bg-slate-100 text-slate-600",
};

export default function Tag({ label, color = "slate", className }: TagProps) {
  return (
    <span
      className={clsx(
        "inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide",
        palette[color],
        className,
      )}
    >
      {label}
    </span>
  );
}
