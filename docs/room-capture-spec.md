# Room capture — Phase 1 spec

Estate-sale intake from wide room photos instead of one photo per item. The crew
photographs a room with numbered flip charts in frame, adds a voice note per photo,
and the app proposes lots — each with a crop from the photo, a name, a price, a room
and a zone. Staff combine, drop and correct rows on a review screen, then create the
lots in one step and print labels in location order.

Status: planned 2026-09-27. Nothing below is built.

## What the Step 0 test showed (office, 27 Sep 2026)

19 photos with marker cards O1–O8 and a 2:40 narrated video of a dense, high-value
office. Script: a throwaway spike outside the repo; results reviewed by hand.

| | Result |
|---|---|
| Model | **Gemini 3.8 Flash**. 3–5× faster than 2.5 Flash (the app's current model), tighter boxes, reads the marker cards. 3.1 Pro found slightly more small items and was slower; not worth it. 2.5 Pro is closed to new API keys. |
| Speed / cost | ~13 s per photo on average; well under $1 for the room |
| Detections | 270 from 19 photos, roughly 180 distinct items: **duplicates across photos are the main problem** |
| Markers | At least one card read in 17 of 19 photos; all of O1–O8 found, including a small card on the mantel |
| Pairs / sets | 41 rows grouped correctly (candelabra, cassolettes, urns, horn vases, a desk garniture) |
| Flags | 21 fixtures, 10 personal / not for sale, 3 possibly restricted |
| Crops | Furniture and large pieces usable (700–2200 px). Small items in wide shots only 150–350 px: fine for identification, not as a listing photo |
| Prices | **Consistently low** for this material |
| Zones | Mostly right |
| Overall | Owner's judgement: **75–80% effective** as a first pass |
| Video | Excellent transcript (including "only doing the peach room, not the dining room"), but no prices, made-up marker positions, and 1080p crops. Not a photo source. Stills + voice notes it is. |

Lessons that changed the design:
1. **Surface markers.** An overhead shot of a tabletop has no floor card in it, so its
   items can't be placed or matched to the same items seen in a wide shot. A card
   must sit on each loaded surface (desk, mantel, sideboard). All markers are **table-top flip
   charts**, readable from above and from the side, so the same card appears in both
   the wide and the overhead photo.
2. **Review is per room, not per photo.** Several rows from different photos are
   one item. The main review surface is a room-wide list where rows can be combined.
3. **Dropping is a first-class action.** Not-for-sale, fixture, personal and
   out-of-room rows arrive pre-dropped with a reason and are one tap to restore.
4. **Pricing needs a lever.** Prompt calibration plus a per-sale adjustment,
   and the AI's number kept next to the final one so the prompt can be tuned.
5. **"Needs detail" was too eager** (143 of 270). It flags on relative value
   within the room and on crop size, not on a fixed $200 line.
6. **Mirrors, doorways and backlit windows.** The prompt ignores reflections and
   other rooms. Crew guidance: shoot with your back to the windows.

## Where it lives: inside an open estate sale

Room capture is never free-standing. It is started from an **open estate sale**
(Items tab footer → *Room capture*), so every room, capture, crop and lot belongs to
that sale from the first photo, along with everything the sale already carries: date,
address, client / consignment, contract and documents, stage, staff.

What the sale gives room capture:
- **`sale_id` on everything:** `sale_rooms`, `room_captures`, `capture_items` and the
  created lots. Deleting the sale removes them all (`delete_sale`).
- **Pricing context:** the sale's city / region and per-sale price adjustment go into
  the AI prompt.
- **Client:** if the sale has exactly one client consignment (the usual estate case),
  new lots get its `consignment_id`, so Reconciliation and owner payouts include them.
- **Stage:** capture belongs to **intake / setup**. A derived checklist item, *Rooms
  captured and reviewed*, is true when every room in `sale_rooms` has been reviewed.
  Creating lots doesn't move the stage by itself.
- **Lot numbers** come from that sale's sequence, in walking order.

A sale's room list is built once (from the catalog) and reused by capture, tags,
labels, the walk lists and reports.

## Crew workflow

1. Pick the room in the app (e.g. **OF01 — Office**) and set the flip charts to that
   room: `OF 01`. Stand them about every 5 ft around the walls and one on each loaded
   surface, numbering the locations **from the doorway, then left to right** (below).
2. Shoot: one wide shot per wall with at least two charts in frame, plus a close or
   overhead shot of each loaded surface with its chart.
3. After each shot, **hold to talk**: "Location 3, walnut bureau plat, ormolu mounts,
   1,200. Skip the family photos." Spoken facts override the AI; spoken location
   numbers anchor to the charts.
4. Photos upload and are analysed in the background. Works with no signal; runs
   when the connection returns.
5. **Review the room** (below), then **Create lots** and **Print labels** in location order.
6. Collect the charts, reset them for the next room, and move on. Tag later using the
   lot list: each lot shows its **room photo with the item's box highlighted**, which
   is the map once the charts have moved.

## Room codes, locations and flip charts

### Location format
**Room code (2 letters) + room number (2 digits), a dash, then the location number:**
`LB01-3` (Library 1, location 3), `BD02-5` (Bedroom 2, location 5), `XX01-12`
(first miscellaneous room, location 12). The flip charts show the same thing without
the dash (`BD 02 5`); the app writes the dash everywhere: lots, labels, Item Lookup
and the Disposition Report.

**Every room carries a room number**, including rooms a house has only one of
(`LR01`, `KT01`). Numbers run `01`–`09` per room type, assigned in order as rooms are
added to the sale. Locations run `1`–`20` per room.

**Location numbering:** stand in the room's main doorway facing in. Location 1 is the
first spot on your left; continue around the room left to right. Charts on loaded
surfaces in the middle of the room take the next numbers after the walls. Lots are
numbered in the same order, so the lot list, the labels and the walk around the room
all follow one path.

### Room catalog
Two-letter codes, defined in `src/lib/roomCodes.ts`, matching the flip-chart pages
exactly (`BESL Flip Chart.pptx`). Each sale builds its own room list from the catalog
and can rename any room ("Gathering room" in place of "Family room") while keeping
the code.

| Area | Codes |
|---|---|
| Entry and living | `EN` Entrance · `HL` Hall · `MD` Mudroom · `FR` Family room · `LR` Living room · `BL` Ballroom · `BN` Bonus / play room · `MR` Music room · `DW` Drawing room / parlor · `LB` Library · `SR` Sunroom |
| Work | `OF` Office · `WS` Workshop |
| Dining and kitchen | `DR` Dining room · `BK` Breakfast room · `KT` Kitchen · `PN` Pantry · `LA` Laundry |
| Bedrooms | `BD` Bedroom (the primary bedroom is usually `BD01`) |
| Baths | `BA` Bathroom · `HB` Half bathroom · `GB` Guest bathroom · `CB` Cabana / pool bathroom |
| Up, down, out | `BS` Basement · `AT` Attic · `GA` Garage · `OB` Outbuilding (shed, barn, pool house) |
| Outdoors | `FP` Front porch · `SP` Screen porch · `PA` Patio · `DK` Deck · `BC` Balcony · `YD` Yard / grounds |
| Other | `XX` Miscellaneous (name typed per sale) |

Closets and storage areas are not rooms: their contents belong to the room they
open off. Anything unusual uses `XX`.

### Flip charts
**20 table-top flip charts**, each with three flip sections side by side:

| Section | Pages |
|---|---|
| Room type | `EN` … `XX` (34 pages, code large, room name small underneath) |
| Room number | `01`–`09` |
| Location | `1`–`20` |

- Pages 2.5" × 4", characters about 1" tall, **every character underlined** so the
  chart's orientation is obvious and 6 / 9 are never confused from overhead.
- Laminated **matte** (gloss turns into glare near windows).
- The charts move with the photographer and are reset for each room. Twenty covers
  a large room; a second crew needs its own set.
- The room type and number on the charts **duplicate the room picked in the app** on
  purpose. If the AI reads a chart that doesn't match the selected room (the wrong
  room picked, or a chart left behind in the next room seen through a doorway), the
  review screen flags it rather than trusting either.
- Readability check before relying on them: one assembled chart photographed from the
  far side of the largest room must read correctly in the Step 0 test. If it doesn't,
  the fallback is larger pages; the AI only strictly needs the location number.

## Data model

Migration `supabase/migrations/2026MMDD000000_room_capture.sql` — **applied by hand.**

`room_captures` — one row per photo
- `id uuid pk`, `sale_id uuid fk → sales on delete cascade`, `room_code text`
  (with room number, e.g. `BD02`), `room_name text` (the sale's name for it),
  `photo_path text` (private bucket), `audio_path text null`, `width int`, `height int`
- `status text` — `pending | uploaded | detecting | detected | failed`
- `markers jsonb` (code + box), `transcript text`, `model text`, `error text`
- `created_by uuid`, `created_at timestamptz`
- RLS: company membership through `sales.company_id`, the same pattern as `lots`

`capture_items` — one row per detection; the review screen's working set
- `id uuid pk`, `capture_id fk → room_captures on delete cascade`, `sale_id`, `room_code`
- `zone text`, `box jsonb` (`[ymin,xmin,ymax,xmax]` 0–1000), `crop_path text`, `crop_w int`, `crop_h int`
- AI suggestion, never edited: `ai jsonb` (name, category, price, flags, group…)
- Working fields: `name`, `description`, `category`, `quantity`, `price`,
  `is_fixture`, `is_restricted`, `restricted_category`, `needs_detail`, `from_voice`
- `ai_group text` (the AI's pair/set key), `lot_key uuid` — **rows sharing a `lot_key`
  become one lot**; combining = giving rows the same key
- `state text` — `suggested | kept | dropped`; `drop_reason text` —
  `not_for_sale | fixture | personal | other_room | duplicate | junk | other`
- `lot_id uuid null fk → lots on delete set null`, set when the lot is created

`sale_rooms` — the sale's room list
- `id uuid pk`, `sale_id fk → sales on delete cascade`, `room_code text` (e.g. `BD02`),
  `name text`, `sort_order int`; unique (`sale_id`, `room_code`)

`lots` — add `room text` (the room code), `zone text` (the full location, e.g.
`BD02-5`), `needs_detail boolean default false`. `capture_items.zone` uses the same
`ROOM##-N` form.

Storage: new **private** bucket `room-captures` (full room photos and voice notes,
read with signed URLs). Crops go to the existing public `photos` bucket only once
they become lot photos. Whole-room interiors never sit at public URLs.

`delete_sale` must delete `capture_items`, `room_captures` and their storage objects
(client-side file removal first, as today).

## Edge function `room-detect` (deployed by hand)

Same caller verification as `lot-enrich`; uses the existing `GEMINI_API_KEY`. Model
is a constant (`gemini-3.8-flash`). Confirm that the key stored in Supabase can
call it before deploying.

- **`mode: "detect"`** — input: a 2048 px JPEG (base64), optional voice note, room
  code and name, the sale's price adjustment. One call, JSON output: `markers[]`,
  `items[]`, `transcript`. The prompt carries the rules proven in Step 0 (pairs by
  group, bundles, ignore reflections and other rooms, fixtures, personal items,
  restricted materials, voice overrides photo). Each flip chart is reported with its three parts
  (room type, room number, location). Zones are **not** assigned by the model: the
  client gives each box the nearest chart's location and writes `ROOM##-N`, and
  flags any chart whose room doesn't match the selected room.
- **`mode: "consolidate"`** — input: every kept or suggested row in a room, as
  (row id, name, zone, photo, 384 px crop thumbnail). Output: clusters of row ids
  that are the same physical item. Only a suggestion; the reviewer confirms.

## Client

New service `src/services/RoomCaptureService.ts`:
capture → save to IndexedDB → upload → detect → write `capture_items` → consolidate
→ create lots.

**Offline:** new IndexedDB store `roomCaptures` in `PhotoInventoryDB` **v6**
(photo blob, audio blob, metadata, status). No boolean index; filter in JS. Capture
never needs a connection. Upload and detect drain when online, from the same
triggers as `pushLocalChanges`. Review and lot creation need a connection in Phase 1.

**Crops** are cut on the device from the full-resolution original (4% padding) and
uploaded to the private bucket for review. Only the crops of created lots are copied
into `photos`.

### Screens

1. **Room capture** (Items tab footer → *Room capture*, estate sales only).
   Room picker (the sale's room list; *Add room* picks from the catalog and numbers
   repeating types automatically) → native camera → photo shown full screen with a
   **hold-to-talk** button → *Next photo* / *Done with room*. Room list shows each
   photo's status and a *Review room* button once all photos are detected.

2. **Room review — list view** (the main screen)
   - Rows grouped into **suggested lots**: AI pairs/sets plus consolidation clusters.
     Each card shows all its crops (from every photo it appears in), name, zone,
     price, quantity and flags.
   - **Multi-select → Combine into one lot** (any rows, any photos). **Split** takes a
     row back out. **Drop** with a reason. Dropped rows are hidden behind a filter.
   - Not-for-sale, fixture, personal and other-room rows **arrive already dropped**,
     reason shown, one tap to keep.
   - Inline edit of name, price and quantity. **Bulk price**: ±% and round to $1/$5/$10.
   - Badges: *pair/set*, *voice*, *restricted?*, *needs detail*, *small crop*.
   - Filters: zone, needs detail, dropped, price range.

3. **Room review — photo view.** Tap a row to open its photo with every box drawn;
   the selected one is highlighted. **Drag to adjust** a box (re-crops); **draw a new
   box** for a missed item (new row, name typed or one quick AI call on the crop).

4. **Create lots.** One lot per kept `lot_key`:
   - Numbered via `getNextLotNumber` in walking order: zone, then left to right
     within the photo.
   - Fields: `name`, `description`, `category`, `quantity`, `starting_bid` (the estate
     tag price), `room`, `zone`, `is_restricted`, `restricted_category`,
     `needs_detail`, `inventory_status='available'`.
   - Photos: every member crop, **largest as primary**, through `PhotoService.savePhotoFast`.
   - Written with the same offline-safe path as `LotDetail`: `queueLotUpsert` moves
     into a shared helper. QR code generated as today.
   - Then offer **Print labels for this room**, sorted by zone (`QRCodeLabelGenerator`
     gains a room/zone filter and sort).

### Needs detail
Set when the item is in the **top ~15% of the room by price**, possibly restricted,
or its crop is **under 400 px on the short side**. The Items tab gets a *Needs detail
shot* filter. Taking a new photo in `LotDetail` clears the flag.

### Pricing
- The prompt asks for tag prices for an **upscale estate sale**; the wording is
  calibrated against the office photos before building.
- **Per-sale price adjustment** (%) on the sale, applied to suggestions.
- `capture_items.ai` keeps the model's price; `lots.starting_bid` is the final price.
  Comparing them later tunes the prompt.

### Room and zone everywhere
`LotForm` (editable), `LotsList` rows, Item Lookup search (`src/lib/lotSearch.ts`),
QR labels, Disposition Report.

## Lot tags (Niimbot B1)

Thermal tags printed on the floor from the phone, replacing Avery sheets for estate
sales (Avery stays for auctions).

**Printer.** Niimbot B1, 203 dpi, **50 × 30 mm** labels. The print head is 48 mm
(384 dots), so a tag is **384 × 240 dots**. No official SDK; printed over **Web
Bluetooth** by `src/lib/niimbot.ts`, a lean port of the B1 path of niimbluelib (MIT,
attribution in the file). The package itself is not installed: every release depends
on Capacitor 8 and its BLE plugin, and the app is pinned to Capacitor 7. Works in
Chrome on Android and desktop; **not on iPhone Safari** and **not in the installed
Capacitor Android app** (neither has Web Bluetooth), which would need a BLE plugin later.
Pair once; printing needs no internet connection.

**Layout** (rendered to a 1-bit canvas):
- QR code top left, about 18 mm square, with the **sale name** (2 lines) and **start
  date** under it.
- Right side: the company name in bold (or, if switched on in the print dialog, the
  company logo trimmed of its white border; a one-colour wordmark prints best, a colour
  crest does not); **Lot number**; **title** (2 lines, bold); **description** (up to 3 lines, cut with "…"); **price** large.
- QR encodes a short link, `/l/<lot id>`, which redirects to the lot. Fewer characters
  means larger QR modules and easier scanning. Existing `/view/sales/:saleId/lots/:lotId`
  codes keep working.

**Printing.** *Print tag* on a lot; *Print tags* for a room or a filter, in location order.
- `lots.tag_printed_at` and `lots.tag_price` record what was printed. The Items tab
  gets a **Needs tag** filter (never printed, or the price changed since) and a
  **Print tags** button that prints whatever list is showing, in lot-number order.
- Lots with a temporary (offline) lot number are held back from printing until they sync.

**Stock.** Use **removable (low-tack)** labels, or stick the label to a string tag, on
gilding, finishes, paper and anything fragile. Thermal labels fade in sun and heat;
fine for the run of a sale.

## Scanning a tag: who sees what

One QR, one URL. What appears depends on who is looking, **enforced in the database**,
not just hidden on the page.

| Viewer | Sees |
|---|---|
| **Staff** (signed in, member of the lot's company) | Everything: sale, sale date, stage, room/location, status, disposition, tag price, sold price, payment and refunds, hold and basket, buyer, delivery, all photos, history |
| **The lot's own buyer or holder** (verified shopper on that device whose shopper record holds or bought the lot) | The public view plus **their own** hold/purchase details and delivery for that lot |
| **Everyone else** | Public view only: photos, title, description, lot number, price, available / held / sold, add to basket. No buyer, holder, sold price or delivery information |

Staff can scan with the in-app **Scan** button or the phone camera while signed in.

### Required security fix (affects the live app today)
Checked 2026-10-04 with the public (anon) key: **every column of `lots` is readable
without signing in**, including `buyer` (filled in on 85 of 200 sampled lots), `sold_price`,
`held_by` and the `delivery_*` columns. `held_by` is the shopper id, and the shopper id is
also the shopper's only credential (`useShopper` keeps it in `localStorage`), so reading
it is enough to act as that shopper.

Fix, before the scan page ships:
1. **Stop anon reading `lots` directly.** Public pages read through a `SECURITY DEFINER`
   function (or a view) that returns only the public columns, e.g.
   `public_lot(p_lot_id)` and `public_sale_lots(p_sale_id)`.
2. **Give shoppers a real secret.** Issue a random `shopper_token` at verification, stored
   hashed, and kept on the device in place of the bare id. Holder/buyer details come from
   `my_lot(p_lot_id, p_token)`, which returns them only when the token's shopper holds or
   bought that lot.
3. Update `PublicLotPage`, `PublicSale`, the basket hooks (`useServerBasket`,
   `useBuyerBasket`, `holds.ts`) and realtime subscriptions to use these functions.
4. The `lots` RLS policies live only in the hosted database (no migration); this change
   adds them to a migration so they are version-controlled from now on.

All applied **by hand**; existing shoppers re-verify once.

## QR codes on manifests, pickup and delivery

The same scan-to-open idea extends to fulfillment, so load-out and hand-over are
checked by scanning lot tags instead of ticking paper.

| Paper | QR opens | Then |
|---|---|---|
| **Delivery mover manifest** (`DeliveryMoverManifest`, estate) | That delivery's **load-out checklist** | Scan each lot tag as it goes on the truck → marked *loaded*; at the door, scan again → *delivered*. Missing items are obvious before the truck leaves |
| **Shipper manifest** (`ShipperManifest`, auction) | That shipper's **pickup checklist** | Scan each lot as the shipper takes it → *released to shipper*; the signature block stays on paper |
| **Pickup slip / receipt** (customer carry-out and will-call) | The customer's **pickup list** for the sale | Staff scan the receipt, then scan each tag as it's handed over → *picked up*. Anything not yet scanned stays on the list |

Rules:
- Manifest and receipt QRs open a **staff-only** view; they carry a customer's address
  and purchases. A customer scanning **their own** receipt sees only their own purchase
  and delivery (the same token rule as lot tags).
- Scanning a tag that doesn't belong to the open manifest or receipt warns loudly:
  *"Lot 214 is not on this delivery."*
- Today the mover manifest's load-check boxes are paper only and nothing is saved. This
  adds a **`fulfillment_events`** table (lot, sale, kind: `loaded | delivered |
  released_to_shipper | picked_up`, by, at, manifest/receipt ref), so hand-over is recorded
  and shows in the lot's staff view and the Disposition Report.
- Works offline like photos: scans queue on the device and sync later.

Builds on the lot tags and the security fix; it's its own step after the scan views.

## Native permissions
- Android: `RECORD_AUDIO` in `AndroidManifest.xml`
- iOS: `NSMicrophoneUsageDescription` in `Info.plist`
- Web/PWA: microphone prompt on first hold-to-talk

## Build order

Each step is usable on its own.

0. **Prompt calibration (spike, no app changes).** Re-run the office photos with:
   the upscale pricing wording, the flip-chart format, and relative *needs detail*.
   Test `consolidate` on the office's 270 rows; target about 180 clusters.
   Reshoot the desk with a flip chart on it to prove wide ↔ overhead linking, and
   photograph one chart from the far side of the room to prove it reads.
1. **Foundation.** Migration, private bucket, `roomCodes.ts`, sale room list,
   flip-chart page printout, `room`/`zone`/`needs_detail` on lots and shown in the lot
   screens, and the room-photo locator on each lot.
2. **Capture.** Capture screen, IndexedDB v6 store, background upload.
3. **Detect.** `room-detect` function (detect + consolidate), crops, `capture_items`.
4. **Review.** List view (combine / split / drop / bulk price), then photo view
   (adjust / draw boxes).
5. **Create lots.** Lots, photos, QR, location-sorted labels, *Needs detail* filter.
5a. **Lot tags.** *Built 2026-10-05:* Niimbot B1 printing (single and by filter),
   `/l/<id>` short link, *Needs tag* filter. By room waits for room/zone columns (step 1).
5b. **Scan views.** *Security fix shipped 2026-10-05 (#46); routing built with 5a:*
   `/l/<id>` sends staff to the lot screen and everyone else to the public page, which
   shows a verified shopper their own hold or purchase. A compact staff floor summary
   (sale, stage, hold, buyer, delivery, history in one card) is still to do.
5c. **Fulfillment QR codes.** Manifest, pickup slip and receipt QRs; scan-to-load,
   scan-to-hand-over; `fulfillment_events`.
6. **Voice notes.** Hold-to-talk, native permissions, transcript on the review screen.

## Out of scope for Phase 1
- Video capture: revisit with 4K/8K recording and sharp-frame selection
- Reading placed tags or stickers to match items
- Auction-mode use (quick pre-inventory before a consignment)
- Offline review and lot creation
- Tag-walk checklist per zone
- Moving the AI Detail Editor (`lot-enrich`) to 3.8 Flash: worth doing separately,
  since 2.5 is already closed to new keys

## Deploy checklist
- [ ] Migration applied
- [ ] `room-captures` bucket created (private)
- [ ] `supabase functions deploy room-detect`
- [ ] The stored `GEMINI_API_KEY` can call `gemini-3.8-flash`
- [ ] Android and iOS builds with the microphone permission
