/*
 * Reusable <Card> wrapper – uses the .card utility class from index.css
 * so Codex can restyle globally in one place.
 */
import type { ReactNode, HTMLAttributes } from "react";
import clsx from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className, ...rest }: CardProps) {
  return <div className={clsx("card", className)} {...rest}>{children}</div>;
}
