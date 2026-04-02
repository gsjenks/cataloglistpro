// seed_bidder_auth.cjs
// Creates Supabase Auth accounts for the seeded test bidders
// and links them to their bidders table rows via user_id.
//
// Run: node seed_bidder_auth.cjs

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Must use SERVICE ROLE key to create auth users
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// Test bidders to create auth accounts for
// Password is set to 'BidNow2025!' for all test accounts
const TEST_PASSWORD = "BidNow2025!";

const TEST_BIDDERS = [
  {
    email: "jwhitfield@test.com",
    first_name: "James",
    last_name: "Whitfield",
    paddle: 101,
  },
  {
    email: "pmonroe@test.com",
    first_name: "Patricia",
    last_name: "Monroe",
    paddle: 102,
  },
  {
    email: "dharrington@test.com",
    first_name: "David",
    last_name: "Harrington",
    paddle: 103,
  },
  {
    email: "salbright@test.com",
    first_name: "Susan",
    last_name: "Albright",
    paddle: 104,
  },
];

async function main() {
  console.log("\n🔐 Creating auth accounts for test bidders");
  console.log("==========================================\n");

  for (var i = 0; i < TEST_BIDDERS.length; i++) {
    var b = TEST_BIDDERS[i];

    // 1. Create auth user
    var authRes = await supabase.auth.admin.createUser({
      email: b.email,
      password: TEST_PASSWORD,
      email_confirm: true, // skip email confirmation for test accounts
    });

    if (authRes.error) {
      if (authRes.error.message.includes("already been registered")) {
        console.log(
          "⚠  " + b.email + " already has an auth account — skipping",
        );
        continue;
      }
      console.error(
        "❌ Failed to create auth user for " + b.email + ":",
        authRes.error.message,
      );
      continue;
    }

    var userId = authRes.data.user.id;
    console.log("✓ Auth account created: " + b.email + " (" + userId + ")");

    // 2. Link to bidders table
    var updateRes = await supabase
      .from("bidders")
      .update({ user_id: userId })
      .eq("email", b.email);

    if (updateRes.error) {
      console.error(
        "❌ Failed to link bidder record for " + b.email + ":",
        updateRes.error.message,
      );
    } else {
      console.log("  → Linked to bidders table (paddle " + b.paddle + ")");
    }
  }

  console.log("\n✅ Done!");
  console.log("\nTest login credentials:");
  console.log("  Email:    jwhitfield@test.com");
  console.log("  Password: " + TEST_PASSWORD);
  console.log("\nAll test bidders use the same password: " + TEST_PASSWORD);
  console.log(
    "Paddles: 101 (James), 102 (Patricia), 103 (David), 104 (Susan)\n",
  );
}

main().catch(function (err) {
  console.error("Unexpected error:", err);
  process.exit(1);
});
