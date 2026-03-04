/**
 * Intersection Observer-based lazy image loading hook
 * Only loads images when they enter the viewport
 */
import { useState, useEffect, useRef } from "react";

export function useLazyImage(src: string | null | undefined) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" } // Start loading 200px before viewport
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || !src) return;
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.src = src;
  }, [inView, src]);

  return { ref, inView, loaded, shouldRender: inView };
}
