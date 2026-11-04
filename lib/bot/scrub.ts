// Pure: strips e-mail addresses, phone numbers (8+ digits, ISO dates kept) and the given names from text
// before it goes to the learning log (lib/server/learning.ts). Tested in scripts/tests/test_privacy.mts.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scrub(text: string, names: string[] = []): string {
  let out = text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');
  out = out.replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => {
    if (ISO_DATE.test(m.trim())) return m;
    return (m.match(/\d/g)?.length ?? 0) >= 8 ? '[number]' : m;
  });
  for (const raw of names) {
    const n = raw.trim();
    if (n.length < 2 || n.toLowerCase() === 'friend') continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'giu'), '[name]');
  }
  return out;
}
