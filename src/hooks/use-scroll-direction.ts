import { useEffect, useState } from "react";

/**
 * Tracks vertical scroll direction with a threshold so tiny movements
 * don't flap the value. Returns "up" while at rest or scrolling up.
 */
export function useScrollDirection(threshold = 8) {
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const y = window.scrollY;
      setAtTop(y < 4);
      if (Math.abs(y - lastY) >= threshold) {
        setDirection(y > lastY && y > 80 ? "down" : "up");
        lastY = y;
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return { direction, atTop };
}
