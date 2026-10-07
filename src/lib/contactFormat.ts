// src/lib/contactFormat.ts
// Phone and email masks/validation for contact fields typed on the floor.
// US numbers only: 10 digits, shown as (555) 555-5555. A leading 1 is dropped.

export function phoneDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}

/** Format as the user types: "5555" -> "(555) 5", "5555555555" -> "(555) 555-5555". */
export function formatPhone(input: string): string {
  const d = phoneDigits(input);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function isValidPhone(input: string): boolean {
  return phoneDigits(input).length === 10;
}

// name@domain.tld: something, an @, a domain with at least one dot, a 2+ letter TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input.trim());
}

/** YYYY-MM-DD, the only value an <input type="date"> accepts. */
export function isIsoDate(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(input.trim());
}
