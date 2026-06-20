import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, X } from "lucide-react";

const SUGGESTIONS = [
  "Total outstanding receivable?",
  "Which invoices are overdue?",
  "Top 5 customers by sales",
  "Cash & bank balance",
  "Which items are low on stock?",
];

export default function Aria() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, open]);

  const ask = async (q) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    const history = messages.slice(-6);
    setMessages(m => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.post("/assistant", { question, history });
      setMessages(m => [...m, { role: "assistant", content: r.data?.answer || "No answer." }]);
    } catch (e) {
      const msg = e?.response?.status === 503
        ? "I'm not configured yet — add ANTHROPIC_API_KEY in Railway → Variables."
        : (e?.response?.data?.detail || "Something went wrong reaching me. Try again.");
      setMessages(m => [...m, { role: "assistant", content: msg }]);
    }
    setBusy(false);
  };

  return (
    <>
      {/* Launcher button */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open ARIA assistant"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg pl-3 pr-4 py-3 transition">
          <Sparkles className="h-5 w-5" />
          <span className="font-semibold text-sm">ARIA</span>
        </button>
      )}

      {/* Slide-in panel (right) */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] bg-white border-l border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-red-600 to-red-700 text-white">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center"><Sparkles className="h-4 w-4" /></div>
            <div>
              <div className="font-semibold leading-tight">ARIA</div>
              <div className="text-[10px] opacity-80 leading-tight">Denplex AI · read-only</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40 space-y-3">
          {messages.length === 0 && (
            <div>
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 mb-3">
                Hi, I'm <strong>ARIA</strong> 👋 — ask me about your sales, receivables, overdue invoices, stock or cash. I read your live ERP data.
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => ask(s)} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-red-600 text-white" : "bg-white border border-slate-200 text-slate-800"}`}>{m.content}</div>
            </div>
          ))}
          {busy && <div className="flex justify-start"><div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-400">ARIA is thinking…</div></div>}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ask(); }} placeholder="Ask ARIA…" className="flex-1" disabled={busy} />
            <button onClick={() => ask()} disabled={busy || !input.trim()} className="h-9 w-9 shrink-0 rounded-sm bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white flex items-center justify-center"><Send className="h-4 w-4" /></button>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5">Read-only — verify figures before acting.</div>
        </div>
      </div>
    </>
  );
}
