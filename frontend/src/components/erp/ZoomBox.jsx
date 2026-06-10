import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";

/**
 * Wraps wide / tall content (tables, matrices) with a zoom control so the whole
 * thing can be scaled to fit one window instead of scrolling. The scaled wrapper
 * uses width:100/z% so layout reflows correctly at the chosen scale.
 *
 * Usage: <ZoomBox>{...big content...}</ZoomBox>
 */
export default function ZoomBox({ children, min = 0.5, max = 1.6, step = 0.1, defaultZoom = 1, className = "" }) {
  const [z, setZ] = useState(defaultZoom);
  const dec = () => setZ((v) => Math.max(min, +(v - step).toFixed(2)));
  const inc = () => setZ((v) => Math.min(max, +(v + step).toFixed(2)));
  return (
    <div className={className}>
      <div className="flex items-center justify-end gap-1 mb-2 sticky top-0 z-20 bg-white/90 backdrop-blur-sm py-1">
        <span className="text-[11px] text-slate-400 mr-1 uppercase tracking-wider">View</span>
        <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-sm"
          onClick={dec} disabled={z <= min} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <button type="button" onClick={() => setZ(defaultZoom)}
          className="text-xs w-12 tabular-nums text-center hover:underline" title="Reset to 100%">
          {Math.round(z * 100)}%
        </button>
        <Button type="button" size="icon" variant="outline" className="h-7 w-7 rounded-sm"
          onClick={inc} disabled={z >= max} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div style={{ transform: `scale(${z})`, transformOrigin: "top left", width: `${100 / z}%` }}>
        {children}
      </div>
    </div>
  );
}
