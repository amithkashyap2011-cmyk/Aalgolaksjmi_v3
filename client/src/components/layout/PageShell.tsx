/*
 * ─── PageShell ─────────────────────────────────────────
 *
 * Wraps each route's page content with consistent
 * golden-ratio spacing + entry animation.
 * Responsive: max-width constraint on ultra-wide screens,
 * reduced padding on mobile.
 */
import type { ReactNode } from "react";

interface Props {
  title?: string;
  children: ReactNode;
}

export default function PageShell({ title, children }: Props) {
  return (
    <section
      className="space-y-phi-5 animate-in w-full max-w-[90rem] mx-auto"
      data-testid="page-shell"
    >
      {title && (
        <h2 className="text-phi-lg sm:text-phi-xl font-bold tracking-tight text-slate-800">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
