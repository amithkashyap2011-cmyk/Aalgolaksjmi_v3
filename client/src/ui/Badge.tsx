/*
 * Small numeric badge (e.g. confidence percentages, counts).
 */
import clsx from "clsx";

interface BadgeProps {
  value: string | number;
  color?: "gold" | "green" | "red" | "blue" | "purple" | "slate";
  className?: string;
}

const palette: Record<string, string> = {
  gold: "bg-aalgold/15 text-aalgold",
  green: "bg-aalgreen/10 text-aalgreen",
  red: "bg-aalred/10 text-aalred",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  slate: "bg-slate-100 text-slate-600",
};

export default function Badge({ value, color = "slate", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-bold",
        palette[color],
        className,
      )}
    >
      {value}
    </span>
  );
}
