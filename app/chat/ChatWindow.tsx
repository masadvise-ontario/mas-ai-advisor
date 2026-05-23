'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

// Parses a single line for inline markdown links of the form
// [text](https://...) and returns an array of strings and anchor elements.
// Anchors open in a new tab.
function renderLine(line: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    parts.push(
      <a
        key={`${keyPrefix}-l${i}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
      >
        {match[1]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
    i += 1;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [line];
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modalCloseRef = useRef<HTMLButtonElement | null>(null);

  // Scroll the conversation as messages arrive.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Autofocus the textarea on mount and whenever the assistant finishes a
  // turn. Skip while the conversation is closed or the modal is open.
  useEffect(() => {
    if (!sending && !completed && !modalOpen) {
      textareaRef.current?.focus();
    }
  }, [sending, completed, modalOpen]);

  // Focus the close button when the modal opens; Escape closes it.
  useEffect(() => {
    if (!modalOpen) return;
    modalCloseRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

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

  const copyPrompt = useCallback(async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      const ta = document.getElementById('mas-prompt-modal-text') as HTMLTextAreaElement | null;
      ta?.select();
    }
  }, [promptText]);

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
                <p key={j} style={{ margin: j === 0 ? 0 : '0.5em 0 0' }}>
                  {renderLine(line, `${i}-${j}`)}
                </p>
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
        {completed && (
          <div className="mas-completion-actions">
            {promptText && (
              <button
                type="button"
                className="cta-btn primary"
                onClick={() => setModalOpen(true)}
              >
                Show your AI prompt
              </button>
            )}
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

      {modalOpen && promptText && (
        <div
          className="mas-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mas-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="mas-modal">
            <div className="mas-modal-header">
              <h2 id="mas-modal-title" className="mas-modal-title">Your custom AI prompt</h2>
              <div className="mas-modal-actions">
                <button
                  type="button"
                  className="mas-icon-btn"
                  onClick={copyPrompt}
                  aria-label={copied ? 'Prompt copied to clipboard' : 'Copy prompt to clipboard'}
                  title={copied ? 'Copied!' : 'Copy to clipboard'}
                >
                  {copied ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                  <span className="mas-icon-btn-label">{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  ref={modalCloseRef}
                  type="button"
                  className="mas-icon-btn"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                  title="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span className="mas-icon-btn-label">Close</span>
                </button>
              </div>
            </div>
            <p className="mas-modal-hint">Paste this into ChatGPT, Claude, Gemini, or whatever AI you use.</p>
            <textarea
              id="mas-prompt-modal-text"
              className="mas-modal-text"
              readOnly
              value={promptText}
              onClick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
            />
          </div>
        </div>
      )}

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
        .mas-chat-bubble :global(a) { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
        .mas-chat-bubble :global(a:hover) { color: #1d4ed8; }
        .mas-chat-msg-user .mas-chat-bubble :global(a) { color: #dbeafe; }
        .mas-chat-msg-user .mas-chat-bubble :global(a:hover) { color: #fff; }
        .mas-typing { letter-spacing: 4px; opacity: 0.6; }
        .mas-chat-error { padding: 8px 16px; background: #fef2f2; color: #b91c1c; font-size: 13px; border-top: 1px solid #fecaca; }
        .mas-chat-input { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e2e8f0; flex-shrink: 0; }
        .mas-chat-input textarea { flex: 1; resize: none; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-family: inherit; font-size: 15px; line-height: 1.4; outline: none; }
        .mas-chat-input textarea:focus { border-color: #2563eb; }
        .mas-chat-input button { padding: 0 18px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-weight: 500; cursor: pointer; }
        .mas-chat-input button:disabled { background: #94a3b8; cursor: not-allowed; }
        .mas-completion-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
        .mas-modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
        .mas-modal { background: #fff; border-radius: 14px; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25); max-width: 720px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; padding: 16px; gap: 10px; }
        .mas-modal-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .mas-modal-title { margin: 0; font-size: 17px; font-weight: 600; color: #0f172a; }
        .mas-modal-actions { display: flex; gap: 6px; }
        .mas-icon-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 8px; font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
        .mas-icon-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
        .mas-icon-btn:active { background: #e2e8f0; }
        .mas-icon-btn svg { display: block; }
        .mas-icon-btn-label { line-height: 1; }
        .mas-modal-hint { margin: 0; font-size: 13px; color: #475569; }
        .mas-modal-text { flex: 1; width: 100%; box-sizing: border-box; min-height: 240px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; background: #f8fafc; color: #0f172a; resize: vertical; }
        .mas-modal-text:focus { outline: 2px solid #2563eb; outline-offset: 1px; }
      `}</style>
      <style jsx global>{`
        :global(.cta-btn) { display: block; padding: 10px 14px; border-radius: 10px; background: #f1f5f9; color: #0f172a; text-decoration: none; font-size: 14px; border: none; font-family: inherit; cursor: pointer; text-align: center; }
        :global(.cta-btn.primary) { background: #2563eb; color: #fff; font-weight: 500; }
        :global(.cta-btn:hover) { filter: brightness(0.95); }
      `}</style>
    </div>
  );
}
