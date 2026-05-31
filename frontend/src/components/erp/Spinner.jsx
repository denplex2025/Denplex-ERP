import { Cog, Settings } from "lucide-react";

/**
 * Mechanical-themed loading spinner — two counter-rotating gears.
 * Sizes: "sm" | "md" | "lg" | "xl"
 * Usage: <Spinner /> or <Spinner size="lg" label="Loading BOM..." />
 */
export default function Spinner({ size = "md", label, className = "" }) {
  const sizes = {
    sm:  { big: "h-4 w-4",   small: "h-3 w-3"   },
    md:  { big: "h-6 w-6",   small: "h-4 w-4"   },
    lg:  { big: "h-10 w-10", small: "h-7 w-7"   },
    xl:  { big: "h-14 w-14", small: "h-10 w-10" },
  };
  const s = sizes[size] || sizes.md;
  return (
    <div className={`inline-flex items-center gap-2 text-slate-600 ${className}`}>
      <div className="relative inline-flex items-center">
        <Cog className={`${s.big} text-red-600 animate-spin`} style={{ animationDuration: "2.5s" }} />
        <Settings
          className={`${s.small} text-slate-500 -ml-1 -mb-2 animate-spin`}
          style={{ animationDuration: "1.8s", animationDirection: "reverse" }}
        />
      </div>
      {label && <span className="text-sm font-medium">{label}</span>}
    </div>
  );
}

/** Full-screen overlay variant for blocking operations. */
export function SpinnerOverlay({ label = "Working..." }) {
  return (
    <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-sm" data-testid="spinner-overlay">
      <Spinner size="xl" label={label} />
    </div>
  );
}
