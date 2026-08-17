# CatalogPro — Project Context for Claude Code

Auction / estate-sale cataloging PWA for auction houses. This file is the working
context and roadmap. Read it at the start of each session.

## Stack & deploy
- React + TypeScript + Vite frontend; Supabase backend (auth, Postgres, storage, realtime).
- Capacitor for Android (target: Samsung Galaxy S24 Ultra).
- Hosted at **cataloglistpro.vercel.app**, auto-deployed from **github.com/gsjenks/cataloglistpro** (push to `main` → Vercel builds).
- **Build:** `vite build` only. Do NOT gate on `tsc -b` — there are ~60 pre-existing TS errors, isolated to the live-auction-room files, that the Vite build intentionally skips. Don't "fix" unrelated files to make tsc pass.
- **Line endings: CRLF** (Windows repo). Preserve CRLF on any file you edit so diffs stay clean.

## Data model
`Company → Sale → Lot → Photo`. Contacts and Documents attach to either a Company or a Sale.
Two independent status systems exist and should not be conflated:
- `sales.status`: `upcoming | active | completed` (the everyday sale lifecycle).
- `src/types/auction.ts`: `auction.status` and `lot.status` — these belong to the **in-app live bidding room**, a separate feature.

## Current focus: the LiveAuctioneers marketplace auction
We are working the end-to-end lifecycle of an auction **sold through LiveAuctioneers** (export a catalog to LA, bidding happens on their site, import results back).

**Explicitly out of scope for now:** the in-app virtual bidding room / POS stack
(`AuctionRoom3D`, `BidPanel`, `ClerkPanel`, `PointOfSale`, etc.). Leave it alone unless asked.

### End-to-end map & status
The lifecycle is built end to end. Sales carry a `stage` (intake → setup → listed →
live → settlement → fulfillment → reconciliation → closed) with per-stage checklists;
see `docs/auction-lifecycle-spec.md` and `src/lib/auctionStages.ts`.

1. **Contract / consignment intake** — Contacts + Documents (CRUD) + contract-on-file marker; Intake stage checklist.
2. **Setup / planning** — Setup tab: stage checklist, consignors (`ConsignmentsManager`) with terms/fees, catalogue PDF import.
3. **Photos** — Camera/webcam capture, offline-first (`PhotoService`), primary photo, reorder, `LotNumber_sequence.jpg` naming.
4. **Cataloging → LA listing** — `LotForm` editor, auto lot-numbering (`LotNumberService`), Gemini enrichment (inline `gemini-2.5-flash` call in `LotDetail.tsx`; `src/lib/Gemini.ts` is dead code). `ExportService` builds the full LA CSV + optional photo ZIP. Manual file upload to LA — no LA API.
5. **Auction on LA** — external; app is passive.
6. **End-of-auction** — `EOAImportService` imports the LA eoa-list **XML** (creates sale + consignor + sold lots); older `EOAProcessing` still reads the .xlsx and prints Avery 55163 labels / packing list. Payments tab works the 72h payment-resolution machine.
7. **Fulfillment / shipping** — Fulfillment tab: group paid lots by buyer, assign a shipper from the company **shippers directory** (or Pickup/Store), packing invoice, tracking, delivery, lookup.
8. **Closing the books** — Unsold tab (disposition cascade + printable sections) and **Reconciliation tab** (consignor payouts, house revenue, accounting CSV). Stage 8 *Closed* — final wrap-up/archive UI — is still just checkboxes.

### Ordered next steps
- **Stage 8 Close** — sale wrap-up summary + archive (stage `closed` → status `completed`); currently the only stage with no UI of its own.
- Cleanups: `photography_complete` is stubbed in `computeDerived`; `EOAProcessing` label header is hardcoded; `src/lib/Gemini.ts` is dead.

## Known caveats
- **Live-auction DB objects** (`bids`, `auction_state`, `bidders`, `auction_registrations`, `chat_messages`, `watched_lots` tables; `place_bid`/`advance_lot`/`retract_last_bid`/`reset_auction` RPCs) are called by code but have **no migration in `supabase/migrations/`** — they live only in the hosted Supabase project. Estate-sale/POS/holds/shopper backend IS version-controlled.
- `EOAProcessing.tsx` shipping-label header is **hardcoded** ("Benson Auction Services", a phone, a date) instead of pulled from company/sale data.
- `src/lib/Gemini.ts` is legacy/unused; enrichment lives inline in `LotDetail.tsx`.

## Work log
- **Certificates shared across companies** (branch `feat/packing-print`, PR #13, 2026-08-16): the app is used by **two companies — Benson Auction Services and Benson Estate Sales** — so resale-certificate lookups drop the `company_id` filter and let RLS (`company_id IN (user's companies)`) scope them; siblings share, no schema change, `company_id` still records who collected it. Caveat: sharing follows the *viewer's* memberships. `TaxExemptionsManager` lists everything on file (expired first, then soonest to lapse; search; "no image" flag), opened from "Resale certificates" beside "Manage shippers" in Fulfillment.
- **Tax liability split + resale certificates** (branch `feat/packing-print`, PR #13, 2026-08-16): Reconciliation separates house revenue (commission + BP + fees + in-house shipping/handling) from **sales tax collected in-house, which is a liability to remit, not revenue** — its own block in the panel and the accounting CSV — with LA-collected tax/shipping shown only for cross-checking. `tax_exemptions` table (migration `20260816000003`, **applied to remote**): company-scoped resale certificates keyed on buyer email, certificate photographed (`capture="environment"`) or uploaded into the **private `documents` bucket**, signed-URL reads. Valid cert auto-exempts and prints its state/permit on the invoice; expired never exempts. This branch merges `feat/reconciliation` (PR #11), since `ReconciliationPanel` lives there.
- **House charges** (branch `feat/packing-print`, in PR #13, 2026-08-16): `house_charges` table (migration `20260816000002`, **applied to remote**) — per (sale, buyer) shipping/handling/tax the HOUSE collects, kept out of `buyer_invoices` so LA re-imports can't wipe it. `HouseChargesModal` from a Charges button on every Fulfillment buyer row; prints as a "Collected by <house>" block on the buyer invoice. Tax base = hammer + premium + shipping + handling; `tax_includes_goods` defaults off when LA already taxed that buyer (no double tax). **Outstanding:** Reconciliation must show collected tax as a liability to remit (not revenue) and exclude LA-collected amounts — needs PR #11 merged first; resale-certificate table (`tax_exemptions`) still unbuilt, `tax_exempt`/`exempt_reason` is the manual stand-in.
- **LA invoice PDF ingest** (branch `feat/packing-print`, in PR #13, 2026-08-16): `lib/laInvoiceParse.ts` (pure parser for the partners.liveauctioneers.com invoice print-out — page-spanning invoices, wrapped titles, `Total` vs `Totals`, pdf.js's stray in-number spaces; flags invoices whose printed total ≠ their lines) + `BuyerInvoiceImportService` (pdf.js in browser → upsert `buyer_invoices`, optional mark-paid from LA's zero balance) + `BuyerInvoiceImportModal` on the Payments tab. Migration `20260816000001_buyer_invoices.sql` **applied to remote**; joins lots via `lots.la_invoice_id`. **This is the only source of sales tax + shipping** — printed buyer invoices now prefer it, manual tax rate demoted to fallback. Verified on the real 68-page Liz PDF: 52 invoices / 132 lots / $15,323 hammer / $3,064.60 premium (matches the EOA XML exactly) + $1,281.80 tax + $1,230 shipping.
- **Packing-session paperwork** (branch `feat/packing-print`, PR #13, stacked on #12, 2026-08-16): "Print for packing" row in the Fulfillment tab → (1) `AuctionPackingList.tsx` master sheet (lot/item/buyer/address/shipper, sortable, unpaid + unassigned warnings), (2) `BuyerInvoices.tsx` financial invoice per buyer one-per-page (hammer/premium/tax/total; **tax rate entered on screen + stored in `localStorage['invoice_taxrate_<saleId>']`** since LA collects tax and it's in no table), (3) `services/LabelService.ts` Avery 55163 PDF, one label per lot with buyer/address/lot #/shipper/"piece n of m". Shared math in `lib/invoices.ts`. Per-buyer "Invoice" button renamed "Slip" (it's the packing slip).
- **Shipper handoff manifest** (branch `feat/shipper-manifest`, PR #12, 2026-08-16): `ShipperManifest.tsx` — one printable page per shipper listing every lot going to them grouped by buyer (tick box per lot, per-shipment subtotal, lots/shipments/declared-value header), with a single signature block (driver name + signature + date + time, released-by, exceptions). "Manifest" button on each shipper section in `FulfillmentPanel`. Defaults to lots not yet shipped/delivered; built from all of the shipper's shipments, never the search-filtered view.
- **Stage 7 Reconciliation** (branch `feat/reconciliation`, 2026-08-16): `ReconciliationPanel` tab — sale money summary (gross hammer, BP, commission, fees, house revenue, payouts due/paid/outstanding, sell-through), per-consignor payout worklist (record check/ACH with reference + date, edit/undo, drift warning), accounting CSV. Pure roll-up in `src/lib/reconciliation.ts`; `ConsignmentService` gained `markSettled`/`recordPayout`/`clearPayout`. Stage-7 checklist items are now derived. Migration `20260816000000_consignment_payout.sql` adds `consignments.payment_reference` + `payout_note`.
- **Contract-on-file marker** (`SalesList.tsx`, `Dashboard.tsx`, `SaleDetail.tsx`): sales with a document of `document_type === 'contract'` show a green **Contract** badge; otherwise an amber **No contract** marker. On each Dashboard sale card and the SaleDetail header (amber marker deep-links to the Documents tab). No schema change. Branch `feat/contract-on-file-marker`.

## Conventions
- Ask for the relevant files before creating new ones; keep explanations tight.
- Source of truth is git. Don't run two Claude surfaces editing the same file simultaneously.
