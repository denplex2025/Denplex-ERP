import { useCallback, useEffect, useRef, useState } from "react";

/** Makes a fixed-position floating element (ARIA launcher, Quick Actions button, etc.)
 * user-draggable with mouse/touch/pen (via the Pointer Events API), and remembers where the
 * user left it in localStorage so it doesn't reset on every page load. Distinguishes an actual
 * drag from a tap/click by movement distance (>6px), so the element's own onClick still fires
 * normally for a plain tap — callers should guard their click handler with `!wasDragged()`.
 * Position is expressed as distance from the bottom-right viewport corner (matches how these
 * widgets were already positioned with Tailwind's bottom / right spacing utilities), and is
 * clamped so the element can't be dragged off-screen. */
export function useDraggable(storageKey, defaultPos) {
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return defaultPos;
  });
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, startPos: pos });

  const onPointerDown = useCallback((e) => {
    drag.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, startPos: pos };
  }, [pos]);

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) drag.current.moved = true;
      if (!drag.current.moved) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const right = Math.min(Math.max(drag.current.startPos.right - dx, 8), vw - 56);
      const bottom = Math.min(Math.max(drag.current.startPos.bottom - dy, 8), vh - 56);
      setPos({ right, bottom });
    };
    const onUp = () => {
      if (drag.current.active && drag.current.moved) {
        setPos((p) => {
          try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch { /* ignore */ }
          return p;
        });
      }
      drag.current.active = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [storageKey]);

  return {
    style: { right: `${pos.right}px`, bottom: `${pos.bottom}px` },
    onPointerDown,
    wasDragged: () => drag.current.moved,
  };
}
