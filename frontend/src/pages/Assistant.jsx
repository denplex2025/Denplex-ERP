import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, User } from "lucide-react";

const SUGGESTIONS = [
  "What is my total outstanding receivable?",
  "Which invoices are overdue and by how many days?",
  "Who are my top 5 customers by sales?",
  "What's my cash and bank balance?",
  "Which items are low on stock?",
  "How much do I owe my suppliers?",
];

export default function Assistant() {
  const [messages, setMessages] = useState([]);   // {role, content}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

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
        ? "The AI assistant isn't configured yet — add ANTHROPIC_API_KEY in Railway → Variables."
        : (e?.response?.data?.detail || "Something went wrong reaching the assistant.");
      setMessages(m => [...m, { role: "assistant", content: msg }]);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-red-600" />
        <h1 className="text-xl font-bold font-display">AI Assistant</h1>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">read-only</span>
      </div>
      <p className="text-sm text-slate-500 mb-3">Ask about your sales, receivables, overdue invoices, stock, cash & bank — answered live from your ERP data.</p>

      <div className="flex-1 overflow-y-auto border border-slate-200 rounded-md p-4 bg-slate-50/40 space-y-4">
        {messages.length === 0 && (
          <div>
            <div className="text-sm text-slate-500 mb-2">Try asking:</div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => ask(s)} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className="shrink-0 h-7 w-7 rounded-full bg-red-600 text-white flex items-center justify-center"><Sparkles className="h-4 w-4" /></div>}
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-red-600 text-white" : "bg-white border border-slate-200 text-slate-800"}`}>{m.content}</div>
            {m.role === "user" && <div className="shrink-0 h-7 w-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center"><User className="h-4 w-4" /></div>}
          </div>
        ))}
        {busy && <div className="flex gap-2"><div className="shrink-0 h-7 w-7 rounded-full bg-red-600 text-white flex items-center justify-center"><Sparkles className="h-4 w-4" /></div><div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-400">Thinking…</div></div>}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ask(); }} placeholder="Ask about your business…" className="flex-1" disabled={busy} />
        <Button onClick={() => ask()} disabled={busy || !input.trim()} className="rounded-sm bg-red-600 hover:bg-red-700"><Send className="h-4 w-4" /></Button>
      </div>
      <div className="text-[11px] text-slate-400 mt-2">Read-only — the assistant answers questions but can't create or change records. Always verify figures before acting.</div>
    </div>
  );
}
