import { useEffect, useState } from "react";
import { subscribeToRequests } from "@/lib/api";
import Spinner from "@/components/erp/Spinner";

/**
 * Global floating loading indicator. Shows whenever any API request is in flight.
 * Auto-mounts once in AppLayout. Uses a small delay so fast requests don't flash.
 */
export default function GlobalSpinner() {
  const [count, setCount] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => subscribeToRequests(setCount), []);

  useEffect(() => {
    if (count > 0) {
      // Delay showing slightly so very fast requests don't flash
      const t = setTimeout(() => setShow(true), 180);
      return () => clearTimeout(t);
    }
    setShow(false);
  }, [count]);

  if (!show || count === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] bg-white border border-slate-200 shadow-md rounded-sm px-3 py-2 flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-top-1"
      data-testid="global-spinner"
      aria-live="polite"
      role="status"
    >
      <Spinner size="sm" label={count > 1 ? `Loading (${count} requests)` : "Loading…"} />
    </div>
  );
}
