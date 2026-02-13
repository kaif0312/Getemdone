'use client';

/**
 * Renders text with URLs as clickable links that open in a new tab.
 */
interface LinkifyTextProps {
  text: string;
  className?: string;
  linkClassName?: string;
}

// Match http(s):// URLs and www. URLs (common patterns)
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str) || /^www\./i.test(str);
}

export default function LinkifyText({ text, className = '', linkClassName = '' }: LinkifyTextProps) {
  if (!text || typeof text !== 'string') return null;

  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part && isUrl(part) ? (
          <a
            key={i}
            href={part.startsWith('www.') ? `https://${part}` : part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline hover:opacity-80 ${linkClassName}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}
