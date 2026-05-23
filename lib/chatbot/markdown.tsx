/**
 * Small, opinionated markdown renderer for chat bubbles.
 *
 * Supports:
 * - `[text](https://url)` — clickable links opening in a new tab
 * - `**bold**`
 * - `` `inline code` ``
 * - `## heading` / `### heading` (single-line)
 * - `- bullet` / `* bullet` (unordered list)
 * - `1. numbered` / `2. numbered` (ordered list)
 * - Blank-line-separated paragraphs
 *
 * Intentionally NOT supported (keep the surface tight):
 * - fenced code blocks (```)
 * - blockquotes
 * - tables
 * - images
 * - single-asterisk italic (too easy to confuse with bullets)
 *
 * If the LLM emits unsupported syntax it falls through as plain text —
 * never crashes, never strips characters silently.
 */
import React from 'react';

type Block =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] };

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let para: string[] | null = null;
  let ul: string[] | null = null;
  let ol: string[] | null = null;

  const flushPara = () => {
    if (para && para.length) blocks.push({ type: 'paragraph', lines: para });
    para = null;
  };
  const flushUl = () => {
    if (ul && ul.length) blocks.push({ type: 'ul', items: ul });
    ul = null;
  };
  const flushOl = () => {
    if (ol && ol.length) blocks.push({ type: 'ol', items: ol });
    ol = null;
  };
  const flushAll = () => {
    flushPara();
    flushUl();
    flushOl();
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushAll();
      continue;
    }

    const h = /^(#{2,3}) (.+)$/.exec(line);
    if (h) {
      flushAll();
      blocks.push({ type: 'heading', level: h[1].length as 2 | 3, text: h[2] });
      continue;
    }

    const u = /^[-*] (.+)$/.exec(line);
    if (u) {
      flushPara();
      flushOl();
      if (!ul) ul = [];
      ul.push(u[1]);
      continue;
    }

    const o = /^\d+\. (.+)$/.exec(line);
    if (o) {
      flushPara();
      flushUl();
      if (!ol) ol = [];
      ol.push(o[1]);
      continue;
    }

    flushUl();
    flushOl();
    if (!para) para = [];
    para.push(line);
  }
  flushAll();
  return blocks;
}

interface Token {
  start: number;
  end: number;
  render: (key: string) => React.ReactNode;
}

/**
 * Inline parser — handles links, bold, and inline code in a single pass.
 * Tokens are sorted by start position; overlapping tokens are resolved by
 * taking the first (so `**[link](url)**` becomes bold containing a link
 * if we processed bold first — but we process links first to preserve
 * the URL semantics).
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens: Token[] = [];

  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null) {
    const linkText = m[1];
    const href = m[2];
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      render: (k) => (
        <a key={k} href={href} target="_blank" rel="noopener noreferrer">
          {linkText}
        </a>
      ),
    });
  }

  const boldRe = /\*\*([^*]+)\*\*/g;
  while ((m = boldRe.exec(text)) !== null) {
    const inner = m[1];
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      render: (k) => <strong key={k}>{inner}</strong>,
    });
  }

  const codeRe = /`([^`]+)`/g;
  while ((m = codeRe.exec(text)) !== null) {
    const inner = m[1];
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      render: (k) => <code key={k}>{inner}</code>,
    });
  }

  tokens.sort((a, b) => a.start - b.start);
  const accepted: Token[] = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.start >= cursor) {
      accepted.push(t);
      cursor = t.end;
    }
  }

  const out: React.ReactNode[] = [];
  let pos = 0;
  let i = 0;
  for (const t of accepted) {
    if (t.start > pos) out.push(text.slice(pos, t.start));
    out.push(t.render(`${keyPrefix}-t${i}`));
    pos = t.end;
    i += 1;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out.length ? out : [text];
}

export function renderMarkdown(content: string, keyPrefix: string): React.ReactNode[] {
  const blocks = parseBlocks(content);
  return blocks.map((block, bi) => {
    const k = `${keyPrefix}-b${bi}`;
    if (block.type === 'paragraph') {
      return (
        <p key={k} className="mas-md-p">
          {block.lines.map((line, li) => (
            <React.Fragment key={`${k}-l${li}`}>
              {li > 0 && <br />}
              {renderInline(line, `${k}-l${li}`)}
            </React.Fragment>
          ))}
        </p>
      );
    }
    if (block.type === 'heading') {
      // Bump levels down: h2 in markdown → h4 in DOM, h3 → h5. Chat bubbles
      // shouldn't carry h2/h3 weight visually.
      const Tag = (block.level === 2 ? 'h4' : 'h5') as 'h4' | 'h5';
      return (
        <Tag key={k} className="mas-md-h">
          {renderInline(block.text, k)}
        </Tag>
      );
    }
    if (block.type === 'ul') {
      return (
        <ul key={k} className="mas-md-ul">
          {block.items.map((item, ii) => (
            <li key={`${k}-i${ii}`}>{renderInline(item, `${k}-i${ii}`)}</li>
          ))}
        </ul>
      );
    }
    return (
      <ol key={k} className="mas-md-ol">
        {block.items.map((item, ii) => (
          <li key={`${k}-i${ii}`}>{renderInline(item, `${k}-i${ii}`)}</li>
        ))}
      </ol>
    );
  });
}
