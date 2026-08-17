// src/components/HelpAssistant.tsx
// Tier 1 in-app help assistant: a floating chat widget that answers how-to
// questions about CatalogListPro. Calls the `help-assistant` edge function
// (the Gemini key stays server-side). It sends the current screen for context
// but cannot see live data yet.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X, ArrowUp, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Msg { role: 'assistant' | 'user'; text: string }

const STARTERS = [
  'How do I do a refund?',
  'How do I set the primary image?',
  "How do I find a buyer's basket?",
  'How do I export to LiveAuctioneers?',
];

const WELCOME: Msg = {
  role: 'assistant',
  text: 'Hi! Ask me how to do something in CatalogListPro — like "how do I do a refund?" I can walk you through the steps and point you to the right screen.',
};

function screenLabel(path: string): string {
  if (path === '/' || path === '') return 'the Dashboard';
  if (/^\/sales\/[^/]+\/lots\//.test(path)) return 'a lot detail page';
  if (/^\/sales\//.test(path)) return 'a sale (Setup / Items / Payments / Fulfillment / Reconciliation)';
  return path;
}

function formatReply(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

export default function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('help_size') || '');
      if (s && s.w && s.h) return s;
    } catch { /* default below */ }
    return { w: 380, h: 540 };
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const clamp = (w: number, h: number) => ({
    w: Math.max(300, Math.min(window.innerWidth * 0.96, w)),
    h: Math.max(240, Math.min(window.innerHeight * 0.92, h)),
  });
  const saveSize = (s: { w: number; h: number }) => {
    setSize(s);
    try { localStorage.setItem('help_size', JSON.stringify(s)); } catch { /* ignore */ }
  };
  // Drag the top-left corner to resize (panel is docked bottom-right, so growing
  // means dragging up and to the left).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY, startW = size.w, startH = size.h;
    const move = (ev: PointerEvent) => setSize(clamp(startW + (startX - ev.clientX), startH + (startY - ev.clientY)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSize((s) => { try { localStorage.setItem('help_size', JSON.stringify(s)); } catch { /* ignore */ } return s; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const isTall = size.h >= window.innerHeight * 0.7;
  const toggleSize = () =>
    saveSize(isTall ? clamp(380, 420) : clamp(Math.max(size.w, 460), window.innerHeight * 0.9));

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('help-assistant', {
        body: {
          messages: next.filter((m) => m !== WELCOME).map((m) => ({ role: m.role, text: m.text })),
          screen: screenLabel(location.pathname),
        },
      });
      if (error || !data?.reply) throw error || new Error('no reply');
      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply as string }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: "Sorry — I couldn't reach the help service just now. Please try again in a moment." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700"
        aria-label="Open help assistant"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium hidden sm:inline">Ask for help</span>
      </button>
    );
  }

  return (
    <div
      style={{ width: size.w, height: size.h, maxWidth: '96vw', maxHeight: '92vh' }}
      className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 flex flex-col bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Drag this corner to resize */}
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        className="absolute top-0 left-0 w-6 h-6 z-20 cursor-nwse-resize touch-none"
      >
        <span className="absolute top-1.5 left-1.5 w-2.5 h-2.5 border-t-2 border-l-2 border-white/70 rounded-tl-sm" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 pl-7 bg-indigo-600 text-white shrink-0">
        <Sparkles className="w-5 h-5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">CatalogListPro help</p>
          <p className="text-[11px] text-indigo-100 leading-tight">How-to answers · not your live data</p>
        </div>
        <button
          onClick={toggleSize}
          className="p-1 rounded-full hover:bg-white/15"
          aria-label={isTall ? 'Contract window' : 'Expand window'}
          title={isTall ? 'Contract' : 'Expand'}
        >
          {isTall ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-white/15" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-gray-50">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[85%] px-3 py-2 rounded-2xl text-sm ' +
                (m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md')
              }
              dangerouslySetInnerHTML={m.role === 'assistant' ? { __html: formatReply(m.text) } : undefined}
            >
              {m.role === 'user' ? m.text : undefined}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-white border border-gray-200 text-gray-400 text-sm">…thinking</div>
          </div>
        )}
        {messages.length <= 1 && !busy && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs text-gray-700 bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:border-indigo-400 hover:text-indigo-600"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="shrink-0 flex items-center gap-2 p-2.5 border-t border-gray-200 bg-white"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-full focus:outline-none focus:border-indigo-600"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
          aria-label="Send"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
