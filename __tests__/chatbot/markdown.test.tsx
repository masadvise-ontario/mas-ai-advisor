import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '@/lib/chatbot/markdown';

function html(content: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(content, 'k')}</>);
}

describe('renderMarkdown — links', () => {
  it('renders [text](url) as an anchor with target=_blank', () => {
    const out = html('See [MAS](https://www.masadvise.org/) for more.');
    expect(out).toMatch(/<a[^>]+href="https:\/\/www\.masadvise\.org\/"[^>]+target="_blank"[^>]+>MAS<\/a>/);
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  it('renders multiple links in the same paragraph', () => {
    const out = html('Try [one](https://a.example.com/) and [two](https://b.example.com/) options.');
    expect(out).toContain('href="https://a.example.com/"');
    expect(out).toContain('href="https://b.example.com/"');
  });

  it('leaves non-link text untouched', () => {
    const out = html('Just a plain sentence with no links.');
    expect(out).toContain('Just a plain sentence with no links.');
    expect(out).not.toContain('<a');
  });
});

describe('renderMarkdown — bold + inline code', () => {
  it('renders **bold** as <strong>', () => {
    const out = html('This is **important** info.');
    expect(out).toContain('<strong>important</strong>');
  });

  it('renders `inline code` as <code>', () => {
    const out = html('Run `pnpm test` to check.');
    expect(out).toContain('<code>pnpm test</code>');
  });
});

describe('renderMarkdown — headings', () => {
  it('renders ## as h4 (downshifted from chat-bubble context)', () => {
    const out = html('## Section title\nbody');
    expect(out).toContain('<h4');
    expect(out).toContain('Section title');
  });

  it('renders ### as h5', () => {
    const out = html('### Sub-section');
    expect(out).toContain('<h5');
  });
});

describe('renderMarkdown — unordered list', () => {
  it('groups consecutive - lines into a single <ul>', () => {
    const out = html('- first\n- second\n- third');
    const ulCount = (out.match(/<ul/g) || []).length;
    expect(ulCount).toBe(1);
    expect((out.match(/<li/g) || []).length).toBe(3);
  });

  it('accepts * bullets too', () => {
    const out = html('* alpha\n* beta');
    expect(out).toContain('<ul');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
  });
});

describe('renderMarkdown — ordered list', () => {
  it('groups consecutive 1. 2. 3. lines into an <ol>', () => {
    const out = html('1. step one\n2. step two\n3. step three');
    expect(out).toContain('<ol');
    expect((out.match(/<li/g) || []).length).toBe(3);
  });
});

describe('renderMarkdown — paragraphs', () => {
  it('splits blocks on blank lines', () => {
    const out = html('first paragraph\n\nsecond paragraph');
    const pCount = (out.match(/<p /g) || []).length + (out.match(/<p>/g) || []).length;
    expect(pCount).toBeGreaterThanOrEqual(2);
  });

  it('keeps adjacent non-blank lines in one paragraph with <br>', () => {
    const out = html('line A\nline B');
    const pOpens = (out.match(/<p /g) || []).length + (out.match(/<p>/g) || []).length;
    expect(pOpens).toBe(1);
    expect(out).toContain('<br');
  });
});

describe('renderMarkdown — mixed content', () => {
  it('handles a realistic Advisor reply with headings, lists, bold, and links', () => {
    const reply = [
      "Got it — sounds like [Allard Prize](https://www.npaiadvisor.com/projects/allard-prize?source=masadvise) is the closest pattern.",
      '',
      'A few quick context questions:',
      '',
      '- What does your week look like?',
      '- What have you tried so far?',
      '- Which AI tool are you on — ChatGPT, Claude, or something else?',
    ].join('\n');
    const out = html(reply);
    expect(out).toContain('<a');
    expect(out).toContain('Allard Prize');
    expect(out).toContain('<ul');
    expect((out.match(/<li/g) || []).length).toBe(3);
  });
});

describe('renderMarkdown — graceful fallthrough', () => {
  it('does not strip characters when syntax is malformed', () => {
    const out = html('**unclosed bold and a [broken link');
    expect(out).toContain('**unclosed bold');
    expect(out).toContain('broken link');
  });

  it('handles empty input', () => {
    const out = html('');
    expect(out).toBe('');
  });
});
