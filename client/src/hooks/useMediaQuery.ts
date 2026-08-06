import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render on change.
 * Example: const isMobile = useMediaQuery("(max-width: 991px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    // Safari < 14 uses addListener
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [query]);

  return matches;
}

/** Convenience breakpoints aligned with Bootstrap/Tailwind lg = 992px. */
export const useIsMobile = () => useMediaQuery("(max-width: 991px)");
export const useIsTablet = () => useMediaQuery("(min-width: 768px) and (max-width: 1199px)");
