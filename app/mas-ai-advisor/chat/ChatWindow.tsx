'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_GREETING: Message = {
  role: 'assistant',
  content:
    "Hi — I'm the MAS AI Advisor. I help nonprofit teams find their highest-value AI opportunity using a short five-step discovery. Two ways we can do this: we can start **top-down** from your mission and strategic priorities, or **bottom-up** from what your week actually looks like. Either lands in the same place. Which feels more natural?",
};

const CAP_HIT_CTA = (
  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <a className="cta-btn primary" href="https://www.masadvise.org/contact-us/" target="_blank" rel="noopener noreferrer">Engage MAS — submit a project request</a>
    <a className="cta-btn" href="https://masadvise.org/ai" target="_blank" rel="noopener noreferrer">Install the Advisor in your own LLM</a>
    <a className="cta-btn" href="https://www.masadvise.org/donate/" target="_blank" rel="noopener noreferrer">Support MAS — donate</a>
  </div>
);

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [capHit, setCapHit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending || capHit) return;
    setError(null);
    const next: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/chat/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          // Strip the hardcoded greeting before sending — the system prompt
          // already covers the first-turn behaviour, and including the
          // greeting wastes tokens on every turn.
          messages: next.filter((m) => m !== INITIAL_GREETING),
        }),
      });
      const data = await res.json();
      if (res.status === 429 && data.error === 'turn_cap') {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        setCapHit(true);
        return;
      }
      if (res.status === 503) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply ?? "The advisor is briefly paused. Please come back later." }]);
        setCapHit(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? `Server returned ${res.status}`);
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mas-chat">
      <header className="mas-chat-header">
        <strong>MAS AI Advisor</strong>
        <span style={{ fontSize: 12, color: '#64748b' }}>Free, pro bono — by MAS, a Canadian charity since 1994</span>
      </header>
      <div ref={listRef} className="mas-chat-list" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`mas-chat-msg mas-chat-msg-${m.role}`}>
            <div className="mas-chat-bubble">
              {m.content.split('\n').map((line, j) => (
                <p key={j} style={{ margin: j === 0 ? 0 : '0.5em 0 0' }}>{line}</p>
              ))}
            </div>
          </div>
        ))}
        {sending && (
          <div className="mas-chat-msg mas-chat-msg-assistant">
            <div className="mas-chat-bubble">
              <span className="mas-typing">●●●</span>
            </div>
          </div>
        )}
        {capHit && CAP_HIT_CTA}
      </div>
      {error && <div className="mas-chat-error">{error}</div>}
      <form
        className="mas-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={capHit ? 'Conversation closed. Use the buttons above to go deeper.' : 'Type your reply…'}
          disabled={sending || capHit}
          aria-label="Type your reply"
        />
        <button type="submit" disabled={sending || capHit || !input.trim()}>Send</button>
      </form>
      <style jsx>{`
        .mas-chat { display: flex; flex-direction: column; height: 100vh; max-height: 100vh; background: #fff; font-family: system-ui, -apple-system, sans-serif; color: #0f172a; }
        .mas-chat-header { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
        .mas-chat-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .mas-chat-msg { display: flex; }
        .mas-chat-msg-assistant { justify-content: flex-start; }
        .mas-chat-msg-user { justify-content: flex-end; }
        .mas-chat-bubble { max-width: 80%; padding: 10px 14px; border-radius: 14px; line-height: 1.5; font-size: 15px; }
        .mas-chat-msg-assistant .mas-chat-bubble { background: #f1f5f9; color: #0f172a; border-bottom-left-radius: 4px; }
        .mas-chat-msg-user .mas-chat-bubble { background: #2563eb; color: #fff; border-bottom-right-radius: 4px; }
        .mas-typing { letter-spacing: 4px; opacity: 0.6; }
        .mas-chat-error { padding: 8px 16px; background: #fef2f2; color: #b91c1c; font-size: 13px; border-top: 1px solid #fecaca; }
        .mas-chat-input { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e2e8f0; flex-shrink: 0; }
        .mas-chat-input textarea { flex: 1; resize: none; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-family: inherit; font-size: 15px; line-height: 1.4; outline: none; }
        .mas-chat-input textarea:focus { border-color: #2563eb; }
        .mas-chat-input button { padding: 0 18px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-weight: 500; cursor: pointer; }
        .mas-chat-input button:disabled { background: #94a3b8; cursor: not-allowed; }
      `}</style>
      <style jsx global>{`
        :global(.cta-btn) { display: block; padding: 10px 14px; border-radius: 10px; background: #f1f5f9; color: #0f172a; text-decoration: none; font-size: 14px; }
        :global(.cta-btn.primary) { background: #2563eb; color: #fff; font-weight: 500; }
        :global(.cta-btn:hover) { filter: brightness(0.95); }
      `}</style>
    </div>
  );
}
