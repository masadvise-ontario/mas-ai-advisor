'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_GREETING: Message = {
  role: 'assistant',
  content:
    "Hi — I'm the MAS AI Advisor. I help nonprofit teams figure out where AI can help them most, then I produce a thorough prompt you can paste into ChatGPT, Claude, Gemini, or whatever AI you use to keep going. Tell me about your nonprofit and what you'd like to use AI for — even if you're not sure yet.",
};

const CONTACT_URL = 'https://www.masadvise.org/contact-us/';

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptVisible, setPromptVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Scroll the conversation as messages arrive.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, promptVisible]);

  // Autofocus the textarea on mount and whenever the assistant finishes a turn
  // (sending toggles false). Skip while the conversation is closed.
  useEffect(() => {
    if (!sending && !completed) {
      textareaRef.current?.focus();
    }
  }, [sending, completed]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending || completed) return;
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
      if (res.status === 503) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply ?? "The advisor is briefly paused. Please come back later." }]);
        setCompleted(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? `Server returned ${res.status}`);
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      if (data.completion) {
        setCompleted(true);
        if (typeof data.prompt_text === 'string' && data.prompt_text.trim().length > 0) {
          setPromptText(data.prompt_text);
        }
      }
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

  async function copyPrompt() {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      // Fallback: select-all the textarea so the user can ctrl+C themselves
      const ta = document.getElementById('mas-prompt-output') as HTMLTextAreaElement | null;
      ta?.select();
    }
  }

  const showCompletionPanel = completed;

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
        {showCompletionPanel && (
          <div className="mas-completion">
            {promptText && (
              <div className="mas-completion-actions">
                <button
                  type="button"
                  className="cta-btn primary"
                  onClick={() => setPromptVisible((v) => !v)}
                  aria-expanded={promptVisible}
                >
                  {promptVisible ? 'Hide your custom AI prompt' : 'Get your custom AI prompt →'}
                </button>
                <a
                  className="cta-btn"
                  href={CONTACT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contact MAS — talk to a person
                </a>
              </div>
            )}
            {!promptText && (
              <div className="mas-completion-actions">
                <a
                  className="cta-btn primary"
                  href={CONTACT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contact MAS — talk to a person
                </a>
              </div>
            )}
            {promptVisible && promptText && (
              <div className="mas-prompt-output">
                <p className="mas-prompt-output-label">
                  Copy this prompt into ChatGPT, Claude, Gemini, or whatever AI you use:
                </p>
                <textarea
                  id="mas-prompt-output"
                  className="mas-prompt-output-text"
                  readOnly
                  value={promptText}
                  rows={Math.min(20, Math.max(8, promptText.split('\n').length + 1))}
                  onClick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
                />
                <button type="button" className="cta-btn primary" onClick={copyPrompt}>
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </button>
              </div>
            )}
          </div>
        )}
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
          ref={textareaRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={completed ? 'Conversation closed — use the buttons above to keep going.' : 'Type your reply…'}
          disabled={sending || completed}
          aria-label="Type your reply"
          autoFocus
        />
        <button type="submit" disabled={sending || completed || !input.trim()}>Send</button>
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
        .mas-completion { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
        .mas-completion-actions { display: flex; flex-direction: column; gap: 8px; }
        .mas-prompt-output { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
        .mas-prompt-output-label { margin: 0; font-size: 13px; color: #475569; }
        .mas-prompt-output-text { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.45; background: #fff; color: #0f172a; resize: vertical; }
        .mas-prompt-output-text:focus { outline: 2px solid #2563eb; outline-offset: 1px; }
      `}</style>
      <style jsx global>{`
        :global(.cta-btn) { display: block; padding: 10px 14px; border-radius: 10px; background: #f1f5f9; color: #0f172a; text-decoration: none; font-size: 14px; border: none; font-family: inherit; cursor: pointer; text-align: center; }
        :global(.cta-btn.primary) { background: #2563eb; color: #fff; font-weight: 500; }
        :global(.cta-btn:hover) { filter: brightness(0.95); }
      `}</style>
    </div>
  );
}
