// src/lib/laInvoiceParse.ts
// Pure parser for the LiveAuctioneers end-of-auction invoice PDF (partners.liveauctioneers
// .com "print" view). Takes the text lines pdf.js gives us and returns one record per
// invoice — the only place tax, shipping and the online-payments fee exist for the
// LA path. No I/O; pdf.js and the DB writes live in BuyerInvoiceImportService.
//
// Layout, per invoice (invoices can span page breaks, and long titles wrap):
//   7597221 Paid
//   <house name>
//   Summary / Auction / <title> / <date> / <address…>
//   Bidder            → name, email, phone
//   Shipping Address  → 1-3 address lines
//   Shipping Method   → text
//   Invoice Details
//   Description Hammer Premium Price
//   0216 - Vintage Fur Trim Coat $250.00 $50.00 $300.00
//   [Shipping $238.00]
//   Estimated Online Payments Fee $61.48
//   Sales Tax $127.70
//   Totals $1,060.00 $212.00 $1,699.18      (single-lot invoices print "Total $X")
//   [Payment Received, Credit Card / <date> / $1,699.18]
//   Balance Due $0.00

export interface LaInvoiceLot {
  lotNumber: number;
  title: string;
  hammer: number;
  premium: number;
  price: number;
}

export interface LaInvoice {
  invoiceId: string;
  status: 'paid' | 'unpaid';
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  shipTo: string[];
  shippingMethod?: string;
  lots: LaInvoiceLot[];
  hammerTotal: number;
  premiumTotal: number;
  shipping: number;
  onlineFee: number;
  salesTax: number;
  total: number;
  balanceDue: number;
  paymentMethod?: string;
  paidAtText?: string;
  /** Printed total agrees with lots + shipping + fee + tax (to the cent). */
  totalsBalance: boolean;
}

const HEADER = /^(\d{6,9})\s+(Paid|Unpaid)\b/i;
const LOT_START = /^(\d{1,5})\s*-\s*(.*)$/;
const FOOTER = /(LiveAuctioneers Partners\s*$)|(^https:\/\/partners\.liveauctioneers\.com)/i;
const LABELS = /^(Shipping|Estimated Online Payments Fee|Sales Tax|Totals?|Balance Due|Payment Received|Refund)\b/i;
// The whole trailing money run on a lot line ("… Coat $250.00 $50.00 $300.00").
const TRAILING_MONEY = /\s*(?:\$[\d,.\s]+)+$/;
// LA rounds each line's price on its own, so a long invoice's printed total can
// drift a cent or two from the sum. Beyond a dime means the invoice really differs
// (e.g. shipping added after the total was printed) and is worth flagging.
const TOTAL_TOLERANCE = 0.1;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Money tokens tolerating the stray spaces pdf.js leaves inside numbers ("$7 7.44"):
// a token runs to the next "$" or end of line, then all whitespace is stripped.
export function moneyTokens(line: string): number[] {
  const out: number[] = [];
  const re = /\$([\d,][\d,.\s]*?)(?=\s*\$|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = parseFloat(m[1].replace(/[\s,]/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const lastMoney = (line: string, count: number): number[] | null => {
  const t = moneyTokens(line);
  return t.length >= count ? t.slice(-count) : null;
};

// Split the whole document into per-invoice line blocks. Page footers are dropped
// first so an invoice that spans a page break reads as one continuous block.
export function splitInvoiceBlocks(lines: string[]): string[][] {
  const clean = lines.map((l) => l.trim()).filter((l) => l && !FOOTER.test(l));
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of clean) {
    if (HEADER.test(line)) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseBlock(block: string[]): LaInvoice | null {
  const head = block[0].match(HEADER);
  if (!head) return null;

  const inv: LaInvoice = {
    invoiceId: head[1],
    status: head[2].toLowerCase() === 'unpaid' ? 'unpaid' : 'paid',
    shipTo: [],
    lots: [],
    hammerTotal: 0,
    premiumTotal: 0,
    shipping: 0,
    onlineFee: 0,
    salesTax: 0,
    total: 0,
    balanceDue: 0,
    totalsBalance: false,
  };

  let section: 'none' | 'bidder' | 'shipto' | 'method' | 'items' = 'none';
  let pendingTitle: string[] = [];      // a lot title still waiting for its amounts
  let pendingLotNumber: number | null = null;
  let printedHammer: number | null = null;
  let printedPremium: number | null = null;

  const flushPending = (amounts?: number[]) => {
    if (pendingLotNumber === null) return;
    if (amounts && amounts.length >= 3) {
      inv.lots.push({
        lotNumber: pendingLotNumber,
        title: pendingTitle.join(' ').replace(/\s+/g, ' ').trim(),
        hammer: amounts[0],
        premium: amounts[1],
        price: amounts[2],
      });
    }
    pendingLotNumber = null;
    pendingTitle = [];
  };

  for (let i = 1; i < block.length; i++) {
    const line = block[i];

    if (/^Bidder$/i.test(line)) { section = 'bidder'; continue; }
    if (/^Shipping Address$/i.test(line)) { flushPending(); section = 'shipto'; continue; }
    if (/^Shipping Method$/i.test(line)) { section = 'method'; continue; }
    if (/^Invoice Details$/i.test(line)) { section = 'items'; continue; }
    if (/^Description\s+Hammer\s+Premium\s+Price$/i.test(line)) { section = 'items'; continue; }

    if (section === 'bidder') {
      if (line.includes('@')) inv.buyerEmail = line;
      else if (/^\+?[\d\s()-]{7,}$/.test(line)) inv.buyerPhone = line;
      else if (!inv.buyerName) inv.buyerName = line;
      continue;
    }
    if (section === 'shipto') { inv.shipTo.push(line); continue; }
    if (section === 'method') {
      if (!inv.shippingMethod) inv.shippingMethod = line;
      continue;
    }

    if (section !== 'items') continue;

    // Money labels close out any lot whose amounts never arrived.
    if (LABELS.test(line)) {
      flushPending();
      const t = moneyTokens(line);
      if (/^Shipping\b/i.test(line) && t.length) inv.shipping = t[t.length - 1];
      else if (/^Estimated Online Payments Fee/i.test(line) && t.length) inv.onlineFee = t[t.length - 1];
      else if (/^Sales Tax/i.test(line) && t.length) inv.salesTax = t[t.length - 1];
      else if (/^Totals\b/i.test(line) && t.length >= 3) {
        printedHammer = t[0];
        printedPremium = t[1];
        inv.total = t[2];
      } else if (/^Total\b/i.test(line) && t.length) inv.total = t[t.length - 1];
      else if (/^Balance Due/i.test(line) && t.length) inv.balanceDue = t[t.length - 1];
      else if (/^Payment Received/i.test(line)) {
        inv.paymentMethod = line.replace(/^Payment Received,?\s*/i, '').replace(TRAILING_MONEY, '').trim() || undefined;
        // The date usually sits on the following line, the amount after that.
        const next = block[i + 1];
        if (next && !LABELS.test(next) && !/\$/.test(next)) inv.paidAtText = next;
      }
      continue;
    }

    const start = line.match(LOT_START);
    if (start) {
      flushPending();
      pendingLotNumber = parseInt(start[1], 10);
      const rest = start[2];
      const amounts = lastMoney(rest, 3);
      if (amounts) {
        pendingTitle = [rest.replace(TRAILING_MONEY, '').trim()];
        flushPending(amounts);
      } else {
        pendingTitle = [rest];
      }
      continue;
    }

    // Continuation of a wrapped title — the amounts land on the last wrapped line.
    if (pendingLotNumber !== null) {
      const amounts = lastMoney(line, 3);
      if (amounts) {
        const text = line.replace(TRAILING_MONEY, '').trim();
        if (text) pendingTitle.push(text);
        flushPending(amounts);
      } else {
        pendingTitle.push(line);
      }
    }
  }
  flushPending();

  const sumHammer = round2(inv.lots.reduce((s, l) => s + l.hammer, 0));
  const sumPremium = round2(inv.lots.reduce((s, l) => s + l.premium, 0));
  inv.hammerTotal = printedHammer ?? sumHammer;
  inv.premiumTotal = printedPremium ?? sumPremium;

  const computed = round2(
    inv.lots.reduce((s, l) => s + l.price, 0) + inv.shipping + inv.onlineFee + inv.salesTax,
  );
  inv.totalsBalance = Math.abs(computed - inv.total) <= TOTAL_TOLERANCE;

  return inv;
}

export function parseLaInvoices(lines: string[]): LaInvoice[] {
  return splitInvoiceBlocks(lines)
    .map(parseBlock)
    .filter((i): i is LaInvoice => i !== null && i.lots.length > 0);
}

// ── Address helper ───────────────────────────────────────────────────────────
// "16519 Irwindale Ct" / "Lakeville, MN, US, 55044-4507" (a c/o line may precede).
export function splitShipTo(shipTo: string[]): {
  address?: string; city?: string; state?: string; zip?: string; country?: string;
} {
  if (shipTo.length === 0) return {};
  const last = shipTo[shipTo.length - 1];
  const parts = last.split(',').map((p) => p.trim()).filter(Boolean);
  const street = shipTo.slice(0, -1).join(', ') || undefined;
  if (parts.length >= 4) {
    return { address: street, city: parts[0], state: parts[1], country: parts[2], zip: parts[3] };
  }
  if (parts.length === 3) {
    return { address: street, city: parts[0], state: parts[1], zip: parts[2] };
  }
  return { address: shipTo.join(', ') };
}
