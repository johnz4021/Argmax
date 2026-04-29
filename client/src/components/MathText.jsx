import { useMemo } from 'react';
import katex from 'katex';

// Decode common HTML entities and render **bold** markdown in plain-text segments.
function renderInline(text) {
  const decoded = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

  const boldParts = decoded.split(/(\*\*[^*]+\*\*)/);
  const nodes = [];
  boldParts.forEach((chunk, i) => {
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      nodes.push(<strong key={i}>{chunk.slice(2, -2)}</strong>);
    } else {
      const lines = chunk.split('\n');
      lines.forEach((line, j) => {
        if (j > 0) nodes.push(<br key={`${i}-br-${j}`} />);
        if (line) nodes.push(<span key={`${i}-${j}`}>{line}</span>);
      });
    }
  });
  return nodes;
}

/**
 * Renders text with inline LaTeX math delimited by $...$.
 * Non-math parts support **bold**, &nbsp;, and newlines.
 */
export default function MathText({ children, className }) {
  const rendered = useMemo(() => {
    if (typeof children !== 'string') return children;

    // Split on $...$ but not escaped \$
    const parts = [];
    let remaining = children;
    let inMath = false;

    while (remaining.length > 0) {
      const idx = remaining.indexOf('$');
      if (idx === -1) {
        parts.push({ text: remaining, math: false });
        break;
      }
      // Skip escaped \$
      if (idx > 0 && remaining[idx - 1] === '\\') {
        parts.push({ text: remaining.slice(0, idx - 1) + '$', math: false });
        remaining = remaining.slice(idx + 1);
        continue;
      }
      if (idx > 0) {
        parts.push({ text: remaining.slice(0, idx), math: false });
      }
      remaining = remaining.slice(idx + 1);
      inMath = !inMath;

      if (inMath) {
        // Find closing $
        const closeIdx = remaining.indexOf('$');
        if (closeIdx === -1) {
          // No closing $ — treat the rest as plain text
          parts.push({ text: '$' + remaining, math: false });
          remaining = '';
        } else {
          parts.push({ text: remaining.slice(0, closeIdx), math: true });
          remaining = remaining.slice(closeIdx + 1);
          inMath = false;
        }
      }
    }

    return parts.map((part, i) => {
      if (!part.math) return <span key={i}>{renderInline(part.text)}</span>;
      try {
        const html = katex.renderToString(part.text, {
          throwOnError: false,
          displayMode: false,
        });
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        return <span key={i}>${part.text}$</span>;
      }
    });
  }, [children]);

  return <span className={className}>{rendered}</span>;
}
