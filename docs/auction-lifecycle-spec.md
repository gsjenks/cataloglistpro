# Auction Lifecycle & Setup Checklist — Spec

Design doc for roadmap **#2 Setup / planning** and the sale **status pipeline**.
Scope: the **3rd-party / LiveAuctioneers** auction path (export catalog → bidding on
LA → import results back). The in-app live bidding room is out of scope.

Status: **Decisions locked (§6); ready to spec the migration.** Fields marked _(verify)_
need a DB check before build; _(new)_ means a migration is required.

---

## 1. Model — hybrid linear + checklist, with override

- The sale advances through an **ordered set of stages**. Stages are **gates**.
- Each stage owns a **checklist**; its items can be completed **in any order**.
- A stage's gate is **satisfied** when all of its *required* items are done. Optional
  items never block.
- **Override:** the operator can force-advance a sale past a stage even with open
  required items. The override records `who / when / reason`; skipped items remain
  visible as warnings on the sale, not silently lost.
- Two **per-lot** state machines run *inside* the pipeline (not sale-level):
  post-auction **payment resolution** and **unsold disposition**.

Rationale: real 3rd-party auction ops are mostly linear between stages but parallel
within a stage, and operators need to skip a step when info is missing — exactly the
hybrid the operator asked for.

### Relationship to existing `sales.status`
Do **not** replace `sales.status` (`upcoming | active | completed`) — CLAUDE.md warns
against conflating status systems. Add a **new** `sales.stage` field for the fine
pipeline and derive the coarse status from it:

| stage | derived `status` |
|---|---|
| intake, setup, listed | upcoming |
| live, settlement, fulfillment, reconciliation | active |
| closed | completed |

The sale stays **active** through the entire back office (settlement → fulfillment →
reconciliation); only **Closed** derives `completed`. _(decided)_

---

## 2. Stages

| # | Stage | Gate (advance when…) | Coarse status |
|---|---|---|---|
| 1 | **Intake** | signed contract + terms captured | upcoming |
| 2 | **Setup / Cataloging** | all lots cataloged + reviewed | upcoming |
| 3 | **Listed** | catalog pushed & approved on LA, date set | upcoming |
| 4 | **Live** | auction ended on LA | active |
| 5 | **Settlement** | every sold lot resolved (paid / 2nd-chance / defaulted) | active |
| 6 | **Fulfillment** | every paid lot shipped or picked up | active |
| 7 | **Reconciliation** | consignor(s) settled + every unsold lot dispositioned | active |
| 8 | **Closed** | archived | completed |

---

## 3. Checklists & fields, stage by stage

Legend: ✅ already exists in app · 🔨 build · _(new)_ needs migration ·
_(verify)_ confirm column exists.

### Stage 1 — Intake
Checklist:
- [ ] Contact / lead logged
- [ ] Consultation / preliminary valuation done
- [ ] Contract signed & on file — ✅ (contract-on-file marker already built)
- [ ] Consignment terms captured 🔨
- [ ] Intake receipt / chain-of-custody recorded 🔨
- [ ] Insurance-in-custody noted 🔨 (optional)

**A sale pools lots from MULTIPLE consignors, each with their own terms** _(decided)_.
So terms live on a per-consignor **`consignments`** table, not the sale, and every lot
is tagged with which consignment it belongs to.

New **`consignments`** table _(new)_ — one row per (sale, consignor):
- `id uuid`
- `sale_id uuid` → sales
- `contact_id uuid` → contacts (the consignor; reuses existing Contacts)
- `commission_rate numeric`
- `buyers_premium_rate numeric`
- `reserve_policy text` — none / per-lot / blanket
- `fee_schedule jsonb` — {photography, cataloging, insurance, storage, buyin}
- `lead_source text` (optional)
- `created_at timestamptz`

On **`lots`**: `consignment_id uuid` _(new)_ → consignments. Every lot must resolve to a
consignor so Stage 7 can split proceeds correctly. Intake gate = **≥1 consignment with a
signed contract**; Setup gate additionally requires **every lot assigned to a consignment**.

### Stage 2 — Setup / Cataloging
Checklist (per sale; several are per-lot rollups):
- [ ] Photography complete — ✅ (PhotoService)
- [ ] Lotting decided (grouping) 🔨
- [ ] Condition reports entered 🔨
- [ ] Dimensions + weight captured — ✅ height/width/depth exist _(verify weight)_
- [ ] Pricing set: **reserve / estimate low+high / starting bid** — ✅ already on `lots`
- [ ] Categories / taxonomy set — ✅ (LA category autocomplete)
- [ ] Restricted-items check 🔨 (compliance gate: ivory / firearms / hazmat / etc.)
- [ ] Cross-list target chosen (LA / ProxiBid) 🔨
- [ ] QC / review pass 🔨

Fields on `lots`:
- `condition_report text` _(verify / new)_
- `weight numeric` _(verify / new)_ — feeds shipping quotes later
- `is_restricted boolean` + `restricted_category text` _(new)_
- reserve/estimate/starting-bid — ✅ present (`reserve_price`, `estimate_low`,
  `estimate_high`, `starting_bid`)

### Stage 3 — Listed
Checklist:
- [ ] Catalog exported to LA — ✅ (ExportService: CSV + photo ZIP)
- [ ] Terms of sale set on platform 🔨 (tracked as done/not)
- [ ] Auction date/time scheduled 🔨
- [ ] Catalog approved by LA 🔨 (external wait state)
- [ ] Preview / exhibition set 🔨 (optional)
- [ ] Marketing kicked off 🔨 — ties into existing social-media sales stream

Fields on sale:
- `la_auction_url text` _(new)_, `auction_starts_at timestamptz` _(new)_,
  `la_approved_at timestamptz` _(new)_

### Stage 4 — Live
App is passive (bidding on LA). Checklist is mostly informational:
- [ ] Auction live
- [ ] Auction ended → triggers EOA import

### Stage 5 — Settlement
Driven by the **EOA .xlsx import** — ✅ partial (EOAProcessing updates `sold_price`).
Checklist (rollup of per-lot payment states):
- [ ] EOA results imported — ✅
- [ ] Invoices sent 🔨 (or handled on LA — tracked as done)
- [ ] Payments collected 🔨
- [ ] Non-paying lots resolved 🔨 → **Payment Resolution state machine (§4.1)**

Sales tax: **deferred.** For the 3rd-party path, the LA vendor collects & remits tax.
Revisit only when we run our own in-app auctions (a real tax obligation then). See §5.

### Stage 6 — Fulfillment
- [ ] Ship/pickup method per lot 🔨
- [ ] Packing labels printed — ✅ partial (Avery 55163)
- [ ] Packing list / manifest — ✅ partial (Excel)
- [ ] Shipping insurance 🔨 (optional)
- [ ] Tracking + delivery confirmation 🔨
- [ ] Pickup appointments 🔨 (optional)

Fields on `lots`: `fulfillment_method text` _(new)_ (ship|pickup),
`tracking_number text` _(new)_, `shipped_at`/`delivered_at timestamptz` _(new)_.
Weight/dimensions from Stage 2 feed quotes here.

### Stage 7 — Reconciliation
Settlement is **per consignment** (one statement per consignor), since a sale can hold
lots from several consignors with different terms.
- [ ] Settlement statement generated **per consignment** 🔨
      — for that consignor's lots: Σ hammer − commission − fees = net
- [ ] Each consignor paid 🔨 (timing ~30 days; method check/ACH)
- [ ] Unsold lots dispositioned 🔨 → **Unsold Disposition cascade (§4.2)**
- [ ] Accounting export 🔨 (optional; QuickBooks etc.)
- [ ] 1099 / tax reporting 🔨 (optional / annual)

Fields on `consignments`: `net_due numeric`, `settled_at timestamptz`,
`paid_at timestamptz`, `payment_method text` _(new)_. Gate = every consignment settled
**and** every unsold lot dispositioned.

### Stage 8 — Closed
- [ ] Archived
- [ ] Analytics captured (sell-through %, avg lot value)

---

## 4. Per-lot state machines

These attach to **lots**, run inside stages 5–7, and are what the operator's rules
describe. Proposed lot columns _(new)_ to drive them:

- `outcome text` — `pending | sold | passed` (passed = no bid / reserve not met)
- `payment_status text` — `unpaid | paid | second_chance | defaulted`
- `payment_due_at timestamptz` — the 72-hour deadline
- `second_bidder_amount numeric`, `second_bidder_contact text` — **manual entry** _(decided)_;
  the LA export does not include underbidder info, so the operator maintains this by hand
- `disposition text` — `null | returned | hold_relist | charity`
- `disposition_at timestamptz`, `disposition_note text`

### 4.1 Payment Resolution (a sold lot goes unpaid)
```
SOLD → payment_status = unpaid, payment_due_at = won_at + 72h
  ├─ paid within 72h ─────────────────────────────→ paid  ✔ (→ Fulfillment)
  └─ unpaid after 72h → defaulted
       ├─ have 2nd-highest bidder? → offer (second_chance)
       │     ├─ accepted → sold to 2nd, payment_status = paid ✔
       │     └─ declined / no response ─────────────→ becomes UNSOLD (→ 4.2)
       └─ no 2nd bidder on file ────────────────────→ becomes UNSOLD (→ 4.2)
```

### 4.2 Unsold Disposition cascade (passed lots + defaulted-with-no-buyer)
Linear, in priority order, with override at each step:
```
UNSOLD
  1. Offer return to consignor
        consignor wants it?  → disposition = returned  ✔ (arrange return logistics)
  2. Consignor declines
        evaluate to hold for a future sale? → disposition = hold_relist ✔ (relink to next sale)
  3. Not held
        → disposition = charity  ✔ (record charity + date)
```

Both cascades are **linear with override** — the operator can jump a lot straight to any
terminal state if information is missing (matches the stated requirement).

---

## 5. Deferred / out of scope (by decision)
- **Sales tax collection & remittance** — handled by the LA vendor on the 3rd-party
  path. Becomes a real obligation (collect + remit + resale-exemption certs) **only**
  when the app runs its own auctions. Park here; revisit then.
- In-app live bidding room / POS stack — unchanged, untouched.

---

## 6. Resolved decisions
1. **Checklist storage:** JSONB `stage_progress` on `sales`
   (`{ [itemKey]: { done, done_at, done_by, note } }`). Offline-friendly, no joins.
2. **Multi-consignor sales:** yes — a sale pools lots from multiple consignors. Terms
   live on a per-consignor **`consignments`** table; each lot carries `consignment_id`;
   settlement is per consignment (Stages 1 & 7 above).
3. **Second-highest bidder:** manual entry/maintenance — LA export omits underbidder
   info (§4.1, §4 fields).
4. **Stage ↔ status:** sale stays `active` through settlement/fulfillment/reconciliation;
   only Closed → `completed` (§1).
5. **UI placement:** **both** — a persistent **stage banner** across the top of
   SaleDetail (shows current stage + gate progress + override) **and** a dedicated
   **Setup/Checklist tab** for working the items of the current stage.

## 7. Suggested build order
1. Migration: `sales.stage`, `sales.stage_progress jsonb`, `consignments` table,
   `lots.consignment_id`, plus lot outcome/disposition/fulfillment columns.
   → **`supabase/migrations/20260813000000_auction_lifecycle.sql`** (written; not yet applied).
2. Stage banner + Setup tab shell on SaleDetail (read `stage` / `stage_progress`).
3. Stage 1–2 checklists + consignment CRUD (highest daily value; enables lot→consignor).
4. Per-lot state machines (§4) wired into EOA import (Stage 5) + disposition (Stage 7).
5. Per-consignment settlement statement (Stage 7).

## 8. UI / build task breakdown

### A. Data layer (foundation for everything)
- **A1** Types: extend `Sale` (`stage`, `stage_progress`, `la_*`), extend `Lot`
  (`consignment_id`, cataloging + outcome/payment/disposition/fulfillment fields),
  add `Consignment` type. → `src/types.ts`
- **A2** Stage config module: ordered stage list; per-stage checklist item defs
  (`key`, `label`, `required`, `optional`, `derived?`); gate = all required done.
  → new `src/lib/auctionStages.ts`
- **A3** Helpers: `gateStatus(sale)` → {done, total, satisfied}; `advanceStage(sale)`;
  `setChecklistItem(sale, key, {done, note})` writing `stage_progress`.
- **A4** `ConsignmentService` — CRUD scoped by company; assign/unassign lots.

### B. Stage banner (persistent, top of SaleDetail)
- **B1** `<StageBanner sale>` — horizontal stage stepper, current stage highlighted,
  gate progress "n/m required", **Advance** button.
- **B2** Advance flow: gate satisfied → advance directly; else open **Override modal**
  (reason required) → advance + stamp override into `stage_progress.__overrides`.
- **B3** Derives + writes `sales.stage`; keeps `status` in sync per §1 table.

### C. Setup / Checklist tab (new tab on SaleDetail)
- **C1** New `Setup` tab rendering the **current stage's** checklist from A2 config;
  each item = toggle + optional note; writes via A3.
- **C2** Derived (read-only) items computed live, e.g. "every lot assigned to a
  consignment", "photography complete" — shown checked/unchecked, not togglable.
- **C3** Show open items from prior stages as warnings (post-override visibility).

### D. Stage-specific pieces (incremental, after B/C shell works)
- **D1 (Stage 1)** Consignment CRUD UI + consignor picker (reuse Contacts).
- **D2 (Stage 2)** Lot→consignment assignment: picker on `LotForm` + bulk-assign on
  `LotsList`; `condition_report`, `weight`, `is_restricted` inputs on `LotForm`.
- **D3 (Stage 5)** EOA import wiring: on import set `outcome`, `payment_status`,
  `payment_due_at (= won + 72h)`. → `EOAProcessing.tsx`
- **D4 (Stage 5)** Payment-resolution panel: lots unpaid past 72h → actions
  {mark paid · offer 2nd-chance (manual bidder entry) · mark defaulted → unsold}.
- **D5 (Stage 7)** Unsold-disposition panel: per passed/defaulted lot, cascade
  actions {return to consignor · hold for future sale · charity} (§4.2).
- **D6 (Stage 7)** Per-consignment settlement statement: compute
  Σ hammer − commission − fees = net; generate/print; write `net_due`/`settled_at`.

### Sequencing
A → B/C shell → D1/D2 (Stages 1–2, the "#2 Setup" core) → D3–D6 (back office).
D1/D2 deliver the immediate #2 value; D3–D6 close the money/back-end gaps.
