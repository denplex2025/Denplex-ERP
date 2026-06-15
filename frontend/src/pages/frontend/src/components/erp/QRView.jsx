import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, QrCode } from "lucide-react";

/**
 * Shows a printable QR code for a record (work-order | part | inventory).
 * Scanning opens /app/scan/<entity>/<id> in the ERP.
 * Controlled by `item` ({entity, id, code, label}); null = closed.
 */
export default function QRView({ item, onClose }) {
  const [src, setSrc] = useState("");
  const open = !!item;

  useEffect(() => {
    if (!open) { setSrc(""); return; }
    let url;
    api.get(`/qr/${item.entity}/${item.id}.png`, { responseType: "blob" })
      .then((r) => { url = URL.createObjectURL(r.data); setSrc(url); })
      .catch(() => setSrc(""));
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.entity, item?.id]);

  const printLabel = () => {
    if (!src) return;
    const w = window.open("", "_blank", "width=400,height=520");
    if (!w) return;
    w.document.write(
      `<html><head><title>${item.code || "QR"}</title></head>
       <body style="text-align:center;font-family:Arial,sans-serif;margin:24px" onload="window.focus();window.print();">
         <div style="font-size:20px;font-weight:700">${item.code || ""}</div>
         ${item.label ? `<div style="font-size:13px;color:#555;margin-bottom:8px">${item.label}</div>` : ""}
         <img src="${src}" style="width:300px;height:300px"/>
         <div style="font-size:11px;color:#888;margin-top:8px">Scan to open in Denplex ERP</div>
       </body></html>`
    );
    w.document.close();
  };

  const download = () => {
    if (!src) return;
    const a = document.createElement("a");
    a.href = src; a.download = `qr-${item.code || item.id}.png`; a.click();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-red-600" /> QR Code
          </DialogTitle>
        </DialogHeader>
        <div className="text-center">
          <div className="font-semibold text-sm">{item?.code}</div>
          {item?.label && <div className="text-xs text-slate-500 mb-2 truncate">{item.label}</div>}
          {src
            ? <img src={src} alt="QR code" className="mx-auto w-56 h-56 border border-slate-200 rounded-sm" />
            : <div className="py-20 text-slate-400 text-sm">Generating…</div>}
          <div className="text-[10px] text-slate-400 mt-2">
            Scan to open this {item?.entity?.replace("-", " ")} in the ERP
          </div>
          <div className="flex gap-2 justify-center mt-3">
            <Button size="sm" variant="outline" className="rounded-sm" onClick={printLabel} disabled={!src}>
              <Printer className="w-3.5 h-3.5 mr-1" /> Print
            </Button>
            <Button size="sm" variant="outline" className="rounded-sm" onClick={download} disabled={!src}>
              <Download className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
