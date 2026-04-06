#!/usr/bin/env node
// ══════════════════════════════════════════════
// NotesGPT — HubSpot One-Time Setup Script
// Run ONCE after adding your HUBSPOT_API_KEY
// to create all custom contact properties in
// your HubSpot portal.
//
// Usage: node hubspot-setup.js
// ══════════════════════════════════════════════

require("dotenv").config();

const HUBSPOT_BASE = "https://api.hubapi.com";
const KEY = process.env.HUBSPOT_API_KEY;

if (!KEY) {
  console.error("❌ HUBSPOT_API_KEY not set in .env");
  process.exit(1);
}

async function hs(method, endpoint, body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${HUBSPOT_BASE}${endpoint}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// ── Custom contact properties to create ────────
const CUSTOM_PROPERTIES = [
  {
    name: "notesgpt_class",
    label: "NotesGPT Class",
    type: "string",
    fieldType: "text",
    description: "The CBSE class the student is studying (e.g. Class 10)",
    groupName: "contactinformation",
  },
  {
    name: "notesgpt_last_subject",
    label: "NotesGPT Last Subject",
    type: "string",
    fieldType: "text",
    description: "Most recent subject studied in NotesGPT",
    groupName: "contactinformation",
  },
  {
    name: "notesgpt_last_chapter",
    label: "NotesGPT Last Chapter",
    type: "string",
    fieldType: "text",
    description: "Most recent chapter studied in NotesGPT",
    groupName: "contactinformation",
  },
  {
    name: "notesgpt_sessions",
    label: "NotesGPT Study Sessions",
    type: "number",
    fieldType: "number",
    description: "Total number of study sessions (notes generated) in NotesGPT",
    groupName: "contactinformation",
  },
  {
    name: "notesgpt_last_test_score",
    label: "NotesGPT Last Test Score (%)",
    type: "number",
    fieldType: "number",
    description: "Percentage score on the most recent mock test in NotesGPT",
    groupName: "contactinformation",
  },
  {
    name: "notesgpt_engagement_tier",
    label: "NotesGPT Engagement Tier",
    type: "enumeration",
    fieldType: "select",
    description: "Student engagement level based on activity and test scores",
    groupName: "contactinformation",
    options: [
      { label: "New", value: "new", displayOrder: 0, hidden: false },
      { label: "Low", value: "low", displayOrder: 1, hidden: false },
      { label: "Medium", value: "medium", displayOrder: 2, hidden: false },
      { label: "High", value: "high", displayOrder: 3, hidden: false },
    ],
  },
  {
    name: "notesgpt_last_active",
    label: "NotesGPT Last Active",
    type: "datetime",
    fieldType: "date",
    description: "Timestamp of last activity in NotesGPT",
    groupName: "contactinformation",
  },
];

// ── Run setup ──────────────────────────────────
async function setup() {
  console.log("\n🚀 NotesGPT HubSpot Setup\n" + "=".repeat(40));

  // 1. Test connection
  console.log("\n1️⃣  Testing API connection...");
  const test = await hs("GET", "/crm/v3/objects/contacts?limit=1");
  if (!test.ok) {
    console.error(`❌ Connection failed (${test.status}):`, JSON.stringify(test.data).slice(0, 200));
    console.error("\n→ Make sure your HUBSPOT_API_KEY is a Private App token (starts with pat-na1-)");
    process.exit(1);
  }
  console.log("✅ HubSpot connection: OK");

  // 2. Create custom properties
  console.log("\n2️⃣  Creating custom contact properties...");
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const prop of CUSTOM_PROPERTIES) {
    const result = await hs("POST", "/crm/v3/properties/contacts", prop);

    if (result.ok) {
      console.log(`  ✅ Created: ${prop.name}`);
      created++;
    } else if (result.status === 409) {
      // Already exists — that's fine
      console.log(`  ⏭  Skipped (already exists): ${prop.name}`);
      skipped++;
    } else {
      console.error(`  ❌ Failed: ${prop.name} — ${JSON.stringify(result.data).slice(0, 100)}`);
      failed++;
    }
  }

  console.log(`\n  Summary: ${created} created, ${skipped} already existed, ${failed} failed`);

  // 3. Create a property group for NotesGPT
  console.log("\n3️⃣  Creating NotesGPT property group...");
  const group = await hs("POST", "/crm/v3/properties/contacts/groups", {
    name: "notesgpt",
    label: "NotesGPT Data",
    displayOrder: 10,
  });
  if (group.ok) {
    console.log("  ✅ Property group 'NotesGPT Data' created");
  } else if (group.status === 409) {
    console.log("  ⏭  Property group already exists");
  } else {
    console.log("  ℹ️  Property group creation skipped (may not affect functionality)");
  }

  // 4. Update properties to use the new group (optional, best-effort)
  console.log("\n4️⃣  Updating properties to use NotesGPT group...");
  for (const prop of CUSTOM_PROPERTIES) {
    await hs("PATCH", `/crm/v3/properties/contacts/${prop.name}`, {
      groupName: "notesgpt",
    });
  }
  console.log("  ✅ Done");

  // 5. Final summary
  console.log("\n" + "=".repeat(40));
  console.log("🎉 Setup complete!\n");
  console.log("Next steps:");
  console.log("  1. Add HUBSPOT_API_KEY to your Render environment variables");
  console.log("  2. Run: git push origin main  (to deploy)");
  console.log("  3. Sign in to NotesGPT — your contact will appear in HubSpot within seconds");
  console.log("  4. Study a chapter → check contact timeline in HubSpot");
  console.log("  5. Score 90%+ on a test → a Deal will be auto-created\n");
}

setup().catch((err) => {
  console.error("Setup error:", err.message);
  process.exit(1);
});
