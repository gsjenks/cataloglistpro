// src/services/InvoicePdfService.ts
// A buyer's invoice as a PDF file, so it can be attached to an email sent from the
// auction house's own address. Drawn with jsPDF (already used for the Avery labels)
// rather than the browser's print-to-PDF, so the file exists without a print dialog
// and carries a predictable filename.
//
// The caller passes finished figures — this draws, it doesn't calculate. Keeping the
// arithmetic in one place (BuyerInvoices' dueOf) is what stops the PDF and the screen
// ever quoting different totals.

export interface InvoicePdfLine {
  lot: string;
  name: string;
  hammer: number;
  premium: number;
  unpaid?: boolean;
}

export interface InvoicePdfCredit {
  lot: number;
  title: string;
  refunded: boolean;
  total: number;
}

export interface InvoicePdfInput {
  company: { name?: string; address?: string; phone?: string };
  saleName: string;
  buyerName: string;
  buyerAddress: string[];
  buyerEmail?: string;
  buyerPhone?: string;
  invoiceIds: string[];
  lines: InvoicePdfLine[];
  credits: InvoicePdfCredit[];
  /** Rows under the table, in print order. */
  totals: { label: string; value: number; muted?: boolean }[];
  laBilled?: number;          // LA's figure before credits, when it was imported
  due: number;
  unpaidCount: number;
  dueDate?: string;
  handoff?: string;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const sanitize = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'invoice';

export async function buildInvoicePdf(input: InvoicePdfInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });

  const L = 0.75;                 // left margin
  const R = 8.5 - 0.75;           // right edge
  let y = 0.85;

  const text = (s: string, x: number, size = 10, style: 'normal' | 'bold' = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.text(s, x, y);
  };
  const right = (s: string, size = 10, style: 'normal' | 'bold' = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.text(s, R - doc.getTextWidth(s), y);
  };
  const fit = (s: string, max: number, size: number) => {
    doc.setFontSize(size);
    let t = s;
    while (t.length > 1 && doc.getTextWidth(t) > max) t = t.slice(0, -1);
    return t.length < s.length ? `${t}…` : t;
  };
  // Start a new page when the next block wouldn't fit above the bottom margin.
  const room = (needed: number) => {
    if (y + needed > 10.4) {
      doc.addPage();
      y = 0.85;
    }
  };

  // ── Letterhead ────────────────────────────────────────────────────────────
  text(input.company.name || 'Invoice', L, 16, 'bold');
  right('INVOICE', 12, 'bold');
  y += 0.2;
  doc.setTextColor(90);
  if (input.company.address) { text(input.company.address, L, 9); y += 0.15; }
  if (input.company.phone) { text(input.company.phone, L, 9); y += 0.15; }
  doc.setTextColor(0);
  y += 0.06;
  text(input.saleName, L, 10, 'bold');
  if (input.invoiceIds.length) right(`LA ${input.invoiceIds.join(', ')}`, 9);
  y += 0.32;

  // ── Bill to ───────────────────────────────────────────────────────────────
  doc.setTextColor(120);
  text('BILL TO', L, 8);
  doc.setTextColor(0);
  y += 0.17;
  text(input.buyerName, L, 11, 'bold');
  y += 0.17;
  doc.setFontSize(9.5);
  [...input.buyerAddress, input.buyerPhone, input.buyerEmail].filter(Boolean).forEach((line) => {
    text(String(line), L, 9.5);
    y += 0.15;
  });
  if (input.handoff) {
    doc.setTextColor(110);
    text(`Handoff: ${input.handoff}`, L, 9);
    doc.setTextColor(0);
    y += 0.15;
  }
  y += 0.18;

  // ── Lots ──────────────────────────────────────────────────────────────────
  const colLot = L;
  const colItem = L + 0.6;
  const colHammer = R - 2.1;
  const colPremium = R - 0.9;

  doc.setFillColor(243, 244, 246);
  doc.rect(L, y - 0.14, R - L, 0.24, 'F');
  doc.setTextColor(70);
  text('Lot', colLot + 0.05, 9, 'bold');
  text('Item', colItem, 9, 'bold');
  doc.setFontSize(9);
  doc.text('Hammer', colHammer, y);
  doc.text('Premium', colPremium, y);
  doc.setTextColor(0);
  y += 0.26;

  input.lines.forEach((l) => {
    room(0.3);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(String(l.lot), colLot + 0.05, y);
    doc.text(fit(l.name, colHammer - colItem - 0.15, 9.5), colItem, y);
    doc.setFontSize(9.5);
    doc.text(money(l.hammer), colHammer, y);
    doc.text(l.premium ? money(l.premium) : '—', colPremium, y);
    if (l.unpaid) {
      doc.setTextColor(180, 100, 0);
      doc.setFontSize(7.5);
      doc.text('unpaid', colPremium + 0.75, y);
      doc.setTextColor(0);
    }
    y += 0.21;
  });

  y += 0.06;
  doc.setDrawColor(210);
  doc.line(L, y, R, y);
  y += 0.24;

  // ── Totals ────────────────────────────────────────────────────────────────
  input.totals.forEach((t) => {
    room(0.3);
    doc.setTextColor(t.muted ? 130 : 60);
    text(t.label, R - 2.6, 9.5);
    doc.setTextColor(t.muted ? 130 : 0);
    right(money(t.value), 9.5);
    doc.setTextColor(0);
    y += 0.19;
  });

  // Lots billed by LA that didn't complete, credited back.
  input.credits.forEach((c) => {
    room(0.3);
    doc.setTextColor(180, 100, 0);
    text(fit(`Less lot ${c.lot} — ${c.refunded ? 'refunded' : 'not completed'}`, 2.6, 9.5), R - 2.6, 9.5);
    // ASCII hyphen: jsPDF's built-in fonts are WinAnsi, and U+2212 MINUS renders as
    // a stray quote with the digits spaced out.
    right(`-${money(c.total)}`, 9.5);
    doc.setTextColor(0);
    y += 0.19;
  });

  y += 0.06;
  doc.line(R - 2.7, y, R, y);
  y += 0.26;
  text('Total', R - 2.6, 11, 'bold');
  right(money(input.due), 12, 'bold');
  y += 0.34;

  // ── Amount due ────────────────────────────────────────────────────────────
  if (input.unpaidCount > 0) {
    room(1.1);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(252, 211, 77);
    doc.rect(L, y - 0.02, R - L, 0.85, 'FD');
    y += 0.24;
    text('AMOUNT DUE', L + 0.15, 10, 'bold');
    right(money(input.due), 15, 'bold');
    y += 0.22;
    doc.setTextColor(120, 85, 10);
    const when = input.dueDate ? ` · due ${input.dueDate}` : '';
    text(`${input.unpaidCount} lot(s) unpaid${when}`, L + 0.15, 9);
    y += 0.17;
    text(
      fit(`Please remit to ${input.company.name || 'the auction house'}${input.company.phone ? ` · ${input.company.phone}` : ''}`, R - L - 0.3, 9),
      L + 0.15, 9,
    );
    doc.setTextColor(0);
    y += 0.4;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  room(0.4);
  doc.setTextColor(140);
  doc.setFontSize(8);
  if (input.laBilled != null && input.credits.length > 0) {
    doc.text(
      `Invoiced by LiveAuctioneers at ${money(input.laBilled)}; lots that did not complete are credited above.`,
      L, y,
    );
    y += 0.14;
  }
  doc.text('Lots are released once payment clears.', L, y);
  doc.setTextColor(0);

  return doc;
}

export async function downloadInvoicePdf(input: InvoicePdfInput): Promise<string> {
  const doc = await buildInvoicePdf(input);
  const name = `${sanitize(input.saleName)}_Invoice_${sanitize(input.buyerName)}.pdf`;
  doc.save(name);
  return name;
}
