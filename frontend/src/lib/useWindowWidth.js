import { useState, useEffect } from "react";

export const MOBILE = 640; // px — single source of truth for the mobile breakpoint

export function useWindowWidth() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return w;
}
