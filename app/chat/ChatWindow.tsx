'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { renderMarkdown } from '@/lib/chatbot/markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type FeedbackRating = 'up' | 'down';

interface FeedbackState {
  rating?: FeedbackRating;
  commentOpen?: boolean;
  comment?: string;
  submitted?: boolean;
}

const INITIAL_GREETING: Message = {
  role: 'assistant',
  content:
    "Hi — I'm the MAS AI Advisor. I help nonprofit teams figure out where AI can help them most, then I produce a thorough prompt you can paste into ChatGPT, Claude, Gemini, or whatever AI you use to keep going. Tell me about your nonprofit and what you'd like to use AI for — even if you're not sure yet.",
};

// Starter chips shown below the greeting before the first user message.
// Click → sends the chip text immediately (matches the mas-vc-chatbot
// pattern). Currently disabled (Brian's call 2026-05-23 — may re-enable
// based on workshop feedback). Render gate is set to false below; the
// constant is kept so the chips can be re-enabled with a single edit.
const STARTERS_ENABLED = false;
const STARTER_PROMPTS = [
  'We want to use AI but aren’t sure where to start',
  'Help me think about AI for donor outreach',
  'Can AI help us with grant writing?',
  'What can AI realistically do for a small nonprofit?',
];

const CONTACT_URL = 'https://www.masadvise.org/contact-us/';

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<number, FeedbackState>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modalCloseRef = useRef<HTMLButtonElement | null>(null);
  const msgRefs = useRef<Array<HTMLDivElement | null>>([]);
  const prevMessageCount = useRef<number>(messages.length);

  // Scroll behaviour:
  // - When the NEW message is from the assistant, scroll so the user's
  //   prior message sits near the top of the visible area (so the user
  //   reads the response from the beginning, not the end). Mirrors the
  //   mas-vc-chatbot widget pattern.
  // - Otherwise (user sent a message, typing dots), scroll to the bottom.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const grew = messages.length > prevMessageCount.current;
    const latest = messages[messages.length - 1];
    if (grew && latest && latest.role === 'assistant' && messages.length > 1) {
      const targetIdx = messages.length - 2;
      const target = msgRefs.current[targetIdx];
      if (target) {
        const listRect = list.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        list.scrollTop += targetRect.top - listRect.top - 8;
      } else {
        list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
      }
    } else {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
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

  async function sendText(text: string) {
    const trimmed = text.trim();
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

  async function send() {
    await sendText(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onStarterClick(text: string) {
    sendText(text);
  }

  const [copyFailed, setCopyFailed] = useState(false);

  const copyPrompt = useCallback(async () => {
    if (!promptText) return;
    setCopyFailed(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard api unavailable');
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
      return;
    } catch {
      // Likely cause: iframe lacks `allow="clipboard-write"` permission, or
      // the browser blocks the clipboard API outside a direct user gesture.
      // Fallback: select all the text in the textarea so the user can
      // Ctrl+C / Cmd+C it themselves, and surface a visible hint.
      const ta = document.getElementById('mas-prompt-modal-text') as HTMLTextAreaElement | null;
      if (ta) {
        ta.focus();
        ta.select();
        // Last-ditch: execCommand('copy') is deprecated but still works in
        // many browsers when the clipboard API is blocked.
        try {
          const ok = document.execCommand('copy');
          if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2400);
            return;
          }
        } catch {
          /* fall through to hint */
        }
      }
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 6000);
    }
  }, [promptText]);

  // Server-side message index for the assistant message at UI index `i`.
  // The UI includes INITIAL_GREETING at index 0, but the server doesn't see
  // it — so server-side index = UI index - 1.
  function serverMessageIndex(uiIndex: number): number {
    return uiIndex - 1;
  }

  function setMessageFeedback(uiIndex: number, patch: Partial<FeedbackState>) {
    setFeedback((prev) => ({
      ...prev,
      [uiIndex]: { ...(prev[uiIndex] ?? {}), ...patch },
    }));
  }

  async function submitFeedback(uiIndex: number, rating: FeedbackRating | null, comment: string | null) {
    try {
      const res = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          assistant_message_index: serverMessageIndex(uiIndex),
          rating,
          comment: comment?.trim() || null,
        }),
      });
      if (!res.ok) {
        console.warn('[feedback] server returned', res.status);
        // Fail soft — show "thanks" anyway so the user isn't blocked.
      }
    } catch (err) {
      console.warn('[feedback] network error', err);
    } finally {
      setMessageFeedback(uiIndex, { submitted: true, commentOpen: false });
    }
  }

  function handleRatingClick(uiIndex: number, rating: FeedbackRating) {
    const current = feedback[uiIndex];
    if (current?.submitted) return;
    setMessageFeedback(uiIndex, { rating, commentOpen: true });
  }

  function handleCommentClick(uiIndex: number) {
    const current = feedback[uiIndex];
    if (current?.submitted) return;
    setMessageFeedback(uiIndex, { commentOpen: true });
  }

  function handleCommentSend(uiIndex: number) {
    const current = feedback[uiIndex] ?? {};
    submitFeedback(uiIndex, current.rating ?? null, current.comment ?? null);
  }

  function handleSkipComment(uiIndex: number) {
    const current = feedback[uiIndex] ?? {};
    if (current.rating) {
      // Submit thumbs-only feedback.
      submitFeedback(uiIndex, current.rating, null);
    } else {
      setMessageFeedback(uiIndex, { commentOpen: false });
    }
  }

  return (
    <div className="mas-chat">
      <header className="mas-chat-header">
        <strong>MAS AI Advisor</strong>
        <span style={{ fontSize: 12, color: '#64748b' }}>Free, pro bono — by MAS, a Canadian charity since 1994</span>
      </header>
      <div ref={listRef} className="mas-chat-list" role="log" aria-live="polite">
        {messages.map((m, i) => {
          const isModelAssistant = m.role === 'assistant' && i > 0;
          const fb = feedback[i] ?? {};
          return (
            <div
              key={i}
              ref={(el) => {
                msgRefs.current[i] = el;
              }}
              className={`mas-chat-msg mas-chat-msg-${m.role}`}
            >
              <div className="mas-chat-bubble-col">
                <div className="mas-chat-bubble">{renderMarkdown(m.content, `msg-${i}`)}</div>
                {isModelAssistant && (
                  <div className="mas-feedback">
                    {fb.submitted ? (
                      <span className="mas-feedback-thanks">Thanks for your feedback!</span>
                    ) : (
                      <>
                        <div className="mas-feedback-row">
                          <button
                            type="button"
                            className={`mas-feedback-btn ${fb.rating === 'up' ? 'selected' : ''}`}
                            onClick={() => handleRatingClick(i, 'up')}
                            aria-label="Mark this reply as helpful"
                            title="Helpful"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M7 10v12" />
                              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`mas-feedback-btn ${fb.rating === 'down' ? 'selected' : ''}`}
                            onClick={() => handleRatingClick(i, 'down')}
                            aria-label="Mark this reply as not helpful"
                            title="Not helpful"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M17 14V2" />
                              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="mas-feedback-btn"
                            onClick={() => handleCommentClick(i)}
                            aria-label="Leave a comment about this reply"
                            title="Leave a comment"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                          </button>
                        </div>
                        {fb.commentOpen && (
                          <div className="mas-feedback-comment-row">
                            <input
                              type="text"
                              maxLength={2000}
                              placeholder="Add a comment (optional)…"
                              value={fb.comment ?? ''}
                              onChange={(e) => setMessageFeedback(i, { comment: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCommentSend(i);
                                }
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="cta-btn primary mas-feedback-send"
                              onClick={() => handleCommentSend(i)}
                            >
                              Send
                            </button>
                            {fb.rating && (
                              <button
                                type="button"
                                className="cta-btn mas-feedback-skip"
                                onClick={() => handleSkipComment(i)}
                              >
                                Skip
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {STARTERS_ENABLED && messages.length === 1 && !sending && !completed && (
          <div className="mas-starters" aria-label="Suggested starting points">
            {STARTER_PROMPTS.map((text, ix) => (
              <button
                key={`starter-${ix}`}
                type="button"
                className="mas-starter-chip"
                onClick={() => onStarterClick(text)}
              >
                {text}
              </button>
            ))}
          </div>
        )}
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
            {copyFailed && (
              <p className="mas-modal-hint mas-modal-hint-warn">
                Your browser blocked auto-copy. The prompt is selected below — press <kbd>Ctrl</kbd>+<kbd>C</kbd> (or <kbd>⌘</kbd>+<kbd>C</kbd> on Mac) to copy it manually.
              </p>
            )}
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
        .mas-chat-bubble-col { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-width: 80%; }
        .mas-chat-msg-user .mas-chat-bubble-col { align-items: flex-end; }
        .mas-chat-bubble { padding: 10px 14px; border-radius: 14px; line-height: 1.5; font-size: 15px; }
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
        .mas-starters { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 2px 0; }
        .mas-starter-chip { padding: 8px 14px; background: #fff; color: #1d4ed8; border: 1px solid #93c5fd; border-radius: 999px; font-family: inherit; font-size: 13px; line-height: 1.3; cursor: pointer; text-align: left; }
        .mas-starter-chip:hover { background: #eff6ff; border-color: #60a5fa; }
        .mas-starter-chip:active { background: #dbeafe; }
        .mas-md-p { margin: 0 0 0.5em 0; }
        .mas-md-p:last-child { margin-bottom: 0; }
        .mas-md-h { margin: 0.5em 0 0.25em 0; font-size: 15px; font-weight: 600; }
        .mas-md-h:first-child { margin-top: 0; }
        .mas-md-ul, .mas-md-ol { margin: 0.25em 0 0.5em 0; padding-left: 1.4em; }
        .mas-md-ul:last-child, .mas-md-ol:last-child { margin-bottom: 0; }
        .mas-md-ul li, .mas-md-ol li { margin: 0.15em 0; }
        .mas-chat-bubble :global(code) { background: rgba(15, 23, 42, 0.06); padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
        .mas-chat-msg-user .mas-chat-bubble :global(code) { background: rgba(255, 255, 255, 0.18); }
        .mas-feedback { display: flex; flex-direction: column; gap: 6px; padding-left: 4px; }
        .mas-feedback-row { display: flex; gap: 4px; }
        .mas-feedback-btn { display: inline-flex; align-items: center; justify-content: center; padding: 4px 7px; background: #fff; color: #64748b; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; font-family: inherit; }
        .mas-feedback-btn:hover { background: #f1f5f9; color: #0f172a; }
        .mas-feedback-btn.selected { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }
        .mas-feedback-thanks { display: inline-block; font-size: 12px; color: #475569; padding: 4px 2px; }
        .mas-feedback-comment-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .mas-feedback-comment-row input { flex: 1; min-width: 160px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-family: inherit; font-size: 13px; outline: none; }
        .mas-feedback-comment-row input:focus { border-color: #2563eb; }
        .mas-feedback-send, .mas-feedback-skip { padding: 6px 12px !important; font-size: 12px !important; }
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
        .mas-modal-hint-warn { padding: 8px 10px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; color: #78350f; }
        .mas-modal-hint kbd { display: inline-block; padding: 1px 6px; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
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
