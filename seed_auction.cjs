// seed_auction.cjs — plain CommonJS JavaScript, no TypeScript
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const COMPANY_ID = process.env.COMPANY_ID || "";

if (!COMPANY_ID) {
  console.error("ERROR: COMPANY_ID is not set in your .env file");
  process.exit(1);
}

const SALE = {
  company_id: COMPANY_ID,
  name: "Fine Arts & Estates Winter Collection",
  subtitle: "Day 1 — Atlanta Estates & Collections",
  status: "active",
  buyer_premium: 18.0,
  clerk_notes: "Test auction — 17 lots.",
  date: new Date().toISOString().split("T")[0],
  start_date: new Date().toISOString().split("T")[0],
};

const LOTS = [
  {
    lot_number: 1,
    name: "Gilt Bronze Mantel Clock",
    creator: "French, circa 1880",
    materials: "Gilt bronze, marble base",
    condition: "Very good. Original movement running.",
    category: "Decorative Arts",
    estimate_low: 1500,
    estimate_high: 2500,
    starting_bid: 500,
    bid_increment: 100,
    sort_order: 1,
    call_status: "sold",
    sold_price: 2200,
    height: 22,
    width: 8,
    depth: 18,
    dimension_unit: "in",
  },
  {
    lot_number: 2,
    name: "Sterling Silver Tea Service",
    creator: "Gorham Manufacturing Co., Providence RI",
    materials: "Sterling silver (.925)",
    condition: "Good. Minor surface wear. All hallmarked.",
    category: "Silver",
    estimate_low: 800,
    estimate_high: 1200,
    starting_bid: 300,
    bid_increment: 50,
    sort_order: 2,
    call_status: "sold",
    sold_price: 1050,
    height: 9,
    width: null,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 3,
    name: "Landscape with Figures, Watercolor",
    creator: "Anne Emerson Hall (American, 1857-1930)",
    materials: "Watercolor on paper",
    condition: "Good. Minor foxing to lower right margin.",
    category: "Fine Art",
    estimate_low: 300,
    estimate_high: 500,
    starting_bid: 100,
    bid_increment: 25,
    sort_order: 3,
    call_status: "sold",
    sold_price: 420,
    height: 14,
    width: 20,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 4,
    name: "Japanese Cloisonne Vase, Meiji",
    creator: "Japanese, Meiji Period (1868-1912)",
    materials: "Cloisonne enamel on copper, gilt",
    condition: "Excellent. No cracks or repairs.",
    category: "Asian Art",
    estimate_low: 600,
    estimate_high: 900,
    starting_bid: 200,
    bid_increment: 50,
    sort_order: 4,
    call_status: "sold",
    sold_price: 780,
    height: 12,
    width: null,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 5,
    name: "Federal Mahogany Sideboard",
    creator: "American, circa 1800-1820",
    materials: "Mahogany, satinwood inlay, brass",
    condition: "Good. Top professionally refinished c.1980.",
    category: "Furniture",
    estimate_low: 2000,
    estimate_high: 3000,
    starting_bid: 750,
    bid_increment: 250,
    sort_order: 5,
    call_status: "sold",
    sold_price: 2400,
    height: 42,
    width: 72,
    depth: 23,
    dimension_unit: "in",
  },
  {
    lot_number: 6,
    name: "Portrait of a Gentleman",
    creator: "Circle of Thomas Sully (American, 1783-1872)",
    materials: "Oil on canvas",
    condition: "Good. Canvas relined. Minor inpainting.",
    category: "Fine Art",
    estimate_low: 1200,
    estimate_high: 1800,
    starting_bid: 400,
    bid_increment: 100,
    sort_order: 6,
    call_status: "sold",
    sold_price: 1600,
    height: 30,
    width: 25,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 7,
    name: "Chinese Export Porcelain Bowl",
    creator: "Chinese, Qing Dynasty, 18th century",
    materials: "Hard-paste porcelain, enamels",
    condition: "Good. Hairline crack to rim approx. 2 in.",
    category: "Asian Art",
    estimate_low: 400,
    estimate_high: 600,
    starting_bid: 150,
    bid_increment: 50,
    sort_order: 7,
    call_status: "sold",
    sold_price: 550,
    height: 4,
    width: 12,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 8,
    name: "Tiffany-Style Leaded Glass Lamp",
    creator: "American, early 20th century",
    materials: "Leaded glass shade, bronze base",
    condition: "Very good. One replaced segment. Wiring updated.",
    category: "Lighting",
    estimate_low: 1800,
    estimate_high: 2500,
    starting_bid: 600,
    bid_increment: 100,
    sort_order: 8,
    call_status: "sold",
    sold_price: 2100,
    height: 24,
    width: 16,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 9,
    name: "Victorian Walnut Parlor Chair",
    creator: "American, circa 1865-1875",
    materials: "Carved walnut, needlepoint",
    condition: "Good. Upholstery original with minor fading.",
    category: "Furniture",
    estimate_low: 300,
    estimate_high: 500,
    starting_bid: 100,
    bid_increment: 25,
    sort_order: 9,
    call_status: "sold",
    sold_price: 380,
    height: 44,
    width: 28,
    depth: 32,
    dimension_unit: "in",
  },
  {
    lot_number: 10,
    name: "Silver-Mounted Walking Stick",
    creator: "English, circa 1890",
    materials: "Malacca cane, sterling silver",
    condition: "Very good. Silver hallmarked Birmingham.",
    category: "Accessories",
    estimate_low: 200,
    estimate_high: 350,
    starting_bid: 75,
    bid_increment: 25,
    sort_order: 10,
    call_status: "sold",
    sold_price: 310,
    height: null,
    width: null,
    depth: 36,
    dimension_unit: "in",
  },
  {
    lot_number: 11,
    name: "Pair of Meissen Porcelain Figurines",
    creator: "Meissen Manufactory, Germany, c.1875-1900",
    materials: "Hard-paste porcelain, gilt",
    condition: "Good. Minor chip to bocage on shepherd.",
    category: "Porcelain",
    estimate_low: 700,
    estimate_high: 1000,
    starting_bid: 250,
    bid_increment: 50,
    sort_order: 11,
    call_status: "sold",
    sold_price: 900,
    height: 8,
    width: null,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 12,
    name: "Autumn Landscape with Barn",
    creator: "Edward Loyal Field (American, 1856-1914)",
    materials: "Oil on canvas",
    condition: "Good. Original canvas. Minor craquelure.",
    category: "Fine Art",
    estimate_low: 800,
    estimate_high: 1200,
    starting_bid: 300,
    bid_increment: 50,
    sort_order: 12,
    call_status: "open",
    sold_price: null,
    height: 18,
    width: 24,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 13,
    name: "Portrait Study in Watercolor",
    creator: "Attributed to Polly Doyle (American, b.1940)",
    materials: "Watercolor on paper",
    condition: "Very good. No foxing. Colors fresh.",
    category: "Fine Art",
    estimate_low: 400,
    estimate_high: 600,
    starting_bid: 150,
    bid_increment: 25,
    sort_order: 13,
    call_status: "pending",
    sold_price: null,
    height: 12,
    width: 9,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 14,
    name: "Satsuma Pottery Vase, Meiji Period",
    creator: "Japanese, Meiji Period (1868-1912)",
    materials: "Satsuma earthenware, gilt",
    condition: "Excellent. No damage. Original wood stand.",
    category: "Asian Art",
    estimate_low: 1200,
    estimate_high: 1800,
    starting_bid: 400,
    bid_increment: 100,
    sort_order: 14,
    call_status: "pending",
    sold_price: null,
    height: 14,
    width: null,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 15,
    name: "Portrait of a Woman — Witkacy",
    creator: "Stanislaw Ignacy Witkiewicz (Polish, 1885-1939)",
    materials: "Pastel on paper",
    condition: "Good. Minor foxing to margins. Colors strong.",
    category: "Fine Art",
    estimate_low: 3000,
    estimate_high: 5000,
    starting_bid: 1000,
    bid_increment: 250,
    sort_order: 15,
    call_status: "pending",
    sold_price: null,
    height: 26,
    width: 20,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 16,
    name: "Bronze Dancer, Signed",
    creator: "European school, early 20th century",
    materials: "Patinated bronze on marble base",
    condition: "Very good. Patina original and even.",
    category: "Sculpture",
    estimate_low: 600,
    estimate_high: 900,
    starting_bid: 200,
    bid_increment: 50,
    sort_order: 16,
    call_status: "pending",
    sold_price: null,
    height: 18,
    width: null,
    depth: null,
    dimension_unit: "in",
  },
  {
    lot_number: 17,
    name: "Large Acrylic Abstract Composition",
    creator: "Polly Doyle (American, b.1940)",
    materials: "Acrylic on canvas",
    condition: "Excellent. Painted edges, no frame required.",
    category: "Fine Art",
    estimate_low: 500,
    estimate_high: 800,
    starting_bid: 150,
    bid_increment: 50,
    sort_order: 17,
    call_status: "pending",
    sold_price: null,
    height: 36,
    width: 48,
    depth: null,
    dimension_unit: "in",
  },
];

const BIDDERS = [
  {
    first_name: "James",
    last_name: "Whitfield",
    email: "jwhitfield@test.com",
    paddle_number: 101,
    is_approved: true,
    city: "Atlanta",
    state: "GA",
  },
  {
    first_name: "Patricia",
    last_name: "Monroe",
    email: "pmonroe@test.com",
    paddle_number: 102,
    is_approved: true,
    city: "Buckhead",
    state: "GA",
  },
  {
    first_name: "David",
    last_name: "Harrington",
    email: "dharrington@test.com",
    paddle_number: 103,
    is_approved: true,
    city: "Marietta",
    state: "GA",
  },
  {
    first_name: "Susan",
    last_name: "Albright",
    email: "salbright@test.com",
    paddle_number: 104,
    is_approved: true,
    city: "Savannah",
    state: "GA",
  },
  {
    first_name: "Online",
    last_name: "LiveAuctioneers",
    email: "la_proxy@test.com",
    paddle_number: 201,
    is_approved: true,
  },
  {
    first_name: "Online",
    last_name: "ProxiBid",
    email: "proxibid_proxy@test.com",
    paddle_number: 202,
    is_approved: true,
  },
  {
    first_name: "Online",
    last_name: "HiBid",
    email: "hibid_proxy@test.com",
    paddle_number: 203,
    is_approved: true,
  },
];

async function main() {
  console.log("\n BAS Auction Platform — Seed Script");
  console.log("=====================================\n");

  // 1. Create the sale
  console.log("Creating sale...");
  var saleRes = await supabase.from("sales").insert(SALE).select().single();
  if (saleRes.error) {
    console.error("Sale error:", saleRes.error.message);
    process.exit(1);
  }
  var sale = saleRes.data;
  console.log("Sale created: " + sale.name + " (" + sale.id + ")");

  // 2. Create lots
  console.log("Creating lots...");
  var lotsWithSale = LOTS.map(function (l) {
    return Object.assign({}, l, { sale_id: sale.id });
  });
  var lotsRes = await supabase.from("lots").insert(lotsWithSale).select();
  if (lotsRes.error) {
    console.error("Lots error:", lotsRes.error.message);
    process.exit(1);
  }
  var lots = lotsRes.data;
  console.log(lots.length + " lots created");

  // 3. Create photo placeholder records
  console.log("Creating photo records...");
  var photoRows = [];
  lots.forEach(function (lot) {
    photoRows.push({
      lot_id: lot.id,
      file_path: "lots/" + lot.id + "/main.jpg",
      file_name: "main.jpg",
      is_primary: true,
      sort_order: 0,
      caption: lot.name + " - main view",
    });
    photoRows.push({
      lot_id: lot.id,
      file_path: "lots/" + lot.id + "/detail.jpg",
      file_name: "detail.jpg",
      is_primary: false,
      sort_order: 1,
      caption: lot.name + " - detail",
    });
    photoRows.push({
      lot_id: lot.id,
      file_path: "lots/" + lot.id + "/verso.jpg",
      file_name: "verso.jpg",
      is_primary: false,
      sort_order: 2,
      caption: lot.name + " - verso",
    });
  });
  var photoRes = await supabase.from("photos").insert(photoRows);
  if (photoRes.error) {
    console.error("Photos error:", photoRes.error.message);
    process.exit(1);
  }
  console.log(photoRows.length + " photo records created");

  // 4. Create bidders
  console.log("Creating bidders...");
  var biddersRes = await supabase.from("bidders").insert(BIDDERS).select();
  if (biddersRes.error) {
    console.error("Bidders error:", biddersRes.error.message);
    process.exit(1);
  }
  var bidders = biddersRes.data;
  console.log(bidders.length + " bidders created");

  // 5. Register bidders for this sale
  console.log("Registering bidders...");
  var regs = bidders.map(function (b) {
    return {
      sale_id: sale.id,
      bidder_id: b.id,
      paddle_number: b.paddle_number,
      is_approved: true,
    };
  });
  var regRes = await supabase.from("auction_registrations").insert(regs);
  if (regRes.error) {
    console.error("Registrations error:", regRes.error.message);
    process.exit(1);
  }
  console.log(regs.length + " registrations created");

  // 6. Initialize auction_state for lot 12 (the open one)
  console.log("Initializing auction state...");
  var openLot = lots.find(function (l) {
    return l.lot_number === 12;
  });
  var stateRes = await supabase.from("auction_state").insert({
    sale_id: sale.id,
    current_lot_id: openLot.id,
    current_bid: 800,
    bid_count: 7,
    call_status: "open",
    watching_count: 247,
    auctioneer_call: "Eight hundred on the floor — do I hear eight fifty?",
  });
  if (stateRes.error) {
    console.error("State error:", stateRes.error.message);
    process.exit(1);
  }
  console.log("Auction state initialized — Lot 12 open at $800");

  // 7. Seed sample bids on lot 12
  console.log("Seeding sample bids...");
  var b101 = bidders.find(function (b) {
    return b.paddle_number === 101;
  });
  var b102 = bidders.find(function (b) {
    return b.paddle_number === 102;
  });
  var bLA = bidders.find(function (b) {
    return b.paddle_number === 201;
  });
  var bPrx = bidders.find(function (b) {
    return b.paddle_number === 202;
  });
  var now = Date.now();
  var sampleBids = [
    {
      lot_id: openLot.id,
      sale_id: sale.id,
      bidder_id: b101.id,
      amount: 300,
      source: "floor",
      is_winning: false,
      placed_at: new Date(now - 360000).toISOString(),
    },
    {
      lot_id: openLot.id,
      sale_id: sale.id,
      bidder_id: bLA.id,
      amount: 350,
      source: "liveauctioneers",
      is_winning: false,
      placed_at: new Date(now - 300000).toISOString(),
    },
    {
      lot_id: openLot.id,
      sale_id: sale.id,
      bidder_id: b102.id,
      amount: 400,
      source: "floor",
      is_winning: false,
      placed_at: new Date(now - 240000).toISOString(),
    },
    {
      lot_id: openLot.id,
      sale_id: sale.id,
      bidder_id: bPrx.id,
      amount: 500,
      source: "proxibid",
      is_winning: false,
      placed_at: new Date(now - 180000).toISOString(),
    },
    {
      lot_id: openLot.id,
      sale_id: sale.id,
      bidder_id: b102.id,
      amount: 600,
      source: "floor",
      is_winning: false,
      placed_at: new Date(now - 120000).toISOString(),
    },
    {
      lot_id: openLot.id,
      sale_id: sale.id,
      bidder_id: bLA.id,
      amount: 700,
      source: "liveauctioneers",
      is_winning: false,
      placed_at: new Date(now - 60000).toISOString(),
    },
    {
      lot_id: openLot.id,
      sale_id: sale.id,
      bidder_id: b101.id,
      amount: 800,
      source: "floor",
      is_winning: true,
      placed_at: new Date(now - 10000).toISOString(),
    },
  ];
  var bidRes = await supabase.from("bids").insert(sampleBids);
  if (bidRes.error) {
    console.error("Bids error:", bidRes.error.message);
    process.exit(1);
  }
  console.log(sampleBids.length + " sample bids seeded");

  // Done
  console.log("\n Seed complete!\n");
  console.log("Sale ID:  " + sale.id);
  console.log(
    "Open lot: Lot 12 - Autumn Landscape with Barn ($800 current bid)",
  );
  console.log("\nAdd this to your .env file:");
  console.log("VITE_SALE_ID=" + sale.id + "\n");
}

main().catch(function (err) {
  console.error("Unexpected error:", err);
  process.exit(1);
});
