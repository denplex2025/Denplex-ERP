import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function ExportMenu({ collection, label = "Export" }) {
  const download = async (format) => {
    try {
      const tok = localStorage.getItem("erp_token");
      const base = process.env.REACT_APP_BACKEND_URL || "";
      const url = `${base}/api/export/${collection}.${format}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const dl = document.createElement("a");
      dl.href = URL.createObjectURL(blob);
      dl.download = `${collection}.${format}`;
      document.body.appendChild(dl); dl.click(); dl.remove();
      toast.success(`${collection}.${format} downloaded`);
    } catch (e) { toast.error(`Export failed: ${e.message}`); }
  };
  return (
    <div className="inline-flex border border-slate-300 rounded-sm overflow-hidden" data-testid={`export-${collection}`}>
      <Button onClick={() => download("xlsx")} variant="ghost" size="sm" className="rounded-none border-r border-slate-300 h-8 px-3 text-xs font-medium hover:bg-emerald-50">
        <Download className="h-3.5 w-3.5 mr-1 text-emerald-700" /> Excel
      </Button>
      <Button onClick={() => download("csv")} variant="ghost" size="sm" className="rounded-none h-8 px-3 text-xs font-medium hover:bg-slate-50">
        <Download className="h-3.5 w-3.5 mr-1" /> CSV
      </Button>
    </div>
  );
}
