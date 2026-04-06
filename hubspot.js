// ══════════════════════════════════════════════
// NotesGPT — HubSpot CRM Integration
// Handles contact sync, study event tracking,
// deal creation, and engagement scoring
// ══════════════════════════════════════════════

const HUBSPOT_BASE = "https://api.hubapi.com";

// Get API key from env (gracefully fails if not set)
function getKey() {
  return process.env.HUBSPOT_API_KEY || null;
}

// ── Helper: make HubSpot API calls ─────────────
async function hubspotRequest(method, endpoint, body = null) {
  const key = getKey();
  if (!key) {
    console.warn("⚠️ HubSpot: HUBSPOT_API_KEY not set — skipping CRM sync");
    return null;
  }

  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
  };

  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${HUBSPOT_BASE}${endpoint}`, opts);
    if (!res.ok) {
      const err = await res.text();
      console.warn(`⚠️ HubSpot ${method} ${endpoint} failed (${res.status}): ${err.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`⚠️ HubSpot request error: ${e.message}`);
    return null;
  }
}

// ── 1. Upsert Contact ───────────────────────────
// Creates or updates a contact by email.
// All NotesGPT-specific data is set as custom properties.
async function upsertContact(email, props = {}) {
  if (!email) return null;

  const properties = {
    email,
    ...props,
  };

  // HubSpot upsert: create if not exists, update if exists
  const result = await hubspotRequest("POST", "/crm/v3/objects/contacts", {
    properties,
  });

  // Handle 409 Conflict (already exists) — update instead
  if (!result) {
    // Try to find and update by email
    const search = await hubspotRequest("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{
        filters: [{ propertyName: "email", operator: "EQ", value: email }],
      }],
      properties: ["hs_object_id"],
      limit: 1,
    });

    if (search && search.results && search.results.length > 0) {
      const contactId = search.results[0].id;
      await hubspotRequest("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties });
      console.log(`✅ HubSpot: Updated contact ${email}`);
      return { id: contactId };
    }
    return null;
  }

  console.log(`✅ HubSpot: Created contact ${email}`);
  return result;
}

// ── 2. Update Contact Properties ───────────────
async function updateContact(email, props = {}) {
  if (!email || !getKey()) return null;

  const search = await hubspotRequest("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{
      filters: [{ propertyName: "email", operator: "EQ", value: email }],
    }],
    properties: ["hs_object_id", "notesgpt_sessions"],
    limit: 1,
  });

  if (!search || !search.results || search.results.length === 0) {
    // Contact doesn't exist — create it
    return await upsertContact(email, props);
  }

  const contactId = search.results[0].id;
  const existing = search.results[0].properties || {};

  // Increment sessions if requested
  if (props.notesgpt_sessions === "INCREMENT") {
    const current = parseInt(existing.notesgpt_sessions || "0", 10);
    props.notesgpt_sessions = String(current + 1);
  }

  await hubspotRequest("PATCH", `/crm/v3/objects/contacts/${contactId}`, {
    properties: props,
  });

  console.log(`✅ HubSpot: Updated contact ${email} → ${JSON.stringify(props).slice(0, 100)}`);
  return { id: contactId };
}

// ── 3. Log Study Event (Custom Timeline Event) ──
// Logs structured study activity to the contact's
// activity feed in HubSpot for full visibility.
async function logStudyEvent(email, eventType, eventProps = {}) {
  if (!email || !getKey()) return null;

  // First find the contact
  const search = await hubspotRequest("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{
      filters: [{ propertyName: "email", operator: "EQ", value: email }],
    }],
    properties: ["hs_object_id"],
    limit: 1,
  });

  if (!search || !search.results || search.results.length === 0) return null;
  const contactId = search.results[0].id;

  // Log as a note/engagement on the contact's timeline
  const noteBody = formatEventNote(eventType, eventProps);

  const result = await hubspotRequest("POST", "/crm/v3/objects/notes", {
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
    associations: [{
      to: { id: contactId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
    }],
  });

  console.log(`✅ HubSpot: Logged event "${eventType}" for ${email}`);
  return result;
}

function formatEventNote(eventType, props) {
  const ts = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const labels = {
    notes_generated: "📚 Notes Generated",
    flashcards_completed: "🃏 Flashcards Completed",
    practice_completed: "🔁 Practice Session Completed",
    test_submitted: "📝 Mock Test Submitted",
    audiobook_generated: "🎧 Audiobook Generated",
    visual_lesson_generated: "🖼️ Visual Lesson Generated",
    memory_song_generated: "🎵 Memory Song Generated",
    landing_cta_clicked: "🖱️ Landing Page CTA Clicked",
    signup: "🎉 New Student Sign-Up",
  };

  const title = labels[eventType] || eventType;
  let lines = [`**${title}**`, `_Time: ${ts} IST_`, ""];

  if (props.chapter) lines.push(`📖 Chapter: ${props.chapter}`);
  if (props.subject) lines.push(`📚 Subject: ${props.subject}`);
  if (props.classNum) lines.push(`🏫 Class: ${props.classNum}`);
  if (props.score !== undefined) lines.push(`🎯 Score: ${props.score}/${props.total} (${props.pct}%)`);
  if (props.word_count) lines.push(`📝 Word Count: ${props.word_count}`);
  if (props.duration_minutes) lines.push(`⏱ Duration: ~${props.duration_minutes} min`);
  if (props.source) lines.push(`🔗 Source: ${props.source}`);

  return lines.join("\n");
}

// ── 4. Create Deal (Hot Lead Signal) ───────────
// Creates a deal in HubSpot when a student shows
// high intent (90%+ score or 3+ sessions).
async function createDeal(email, reason, props = {}) {
  if (!email || !getKey()) return null;

  const contact = await hubspotRequest("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{
      filters: [{ propertyName: "email", operator: "EQ", value: email }],
    }],
    properties: ["hs_object_id", "firstname", "lastname"],
    limit: 1,
  });

  if (!contact || !contact.results || !contact.results.length) return null;
  const contactId = contact.results[0].id;
  const name = [
    contact.results[0].properties?.firstname,
    contact.results[0].properties?.lastname,
  ].filter(Boolean).join(" ") || email;

  const dealName = `🎓 ${name} — Premium Upsell (${reason})`;

  const deal = await hubspotRequest("POST", "/crm/v3/objects/deals", {
    properties: {
      dealname: dealName,
      dealstage: "appointmentscheduled", // First stage in default pipeline
      pipeline: "default",
      amount: "0",
      closedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      ...props,
    },
    associations: [{
      to: { id: contactId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 4 }],
    }],
  });

  console.log(`✅ HubSpot: Created deal for ${email} — "${reason}"`);
  return deal;
}

// ── 5. Full On-Signup Hook ──────────────────────
// Call this when a student signs up / first logs in.
async function onStudentSignup(user) {
  const { email, user_metadata } = user;
  const name = user_metadata?.full_name || user_metadata?.name || "";
  const [firstname, ...rest] = name.split(" ");
  const lastname = rest.join(" ");

  await upsertContact(email, {
    firstname: firstname || "",
    lastname: lastname || "",
    lifecyclestage: "lead",
    lead_source: "NotesGPT App",
    notesgpt_sessions: "0",
    notesgpt_engagement_tier: "new",
  });

  await logStudyEvent(email, "signup", { source: "NotesGPT Web App" });
}

// ── 6. Full On-Study-Event Hook ─────────────────
// Call this from the server when a major event happens.
async function onStudyEvent(email, eventType, data = {}) {
  if (!email) return;

  // Log the event on the contact timeline
  await logStudyEvent(email, eventType, data);

  // Update contact properties per event type
  const updates = {
    notesgpt_last_active: new Date().toISOString(),
  };

  if (data.chapter) updates.notesgpt_last_chapter = data.chapter;
  if (data.subject) {
    // Append subject if not already listed (best effort, no read-first to save API calls)
    updates.notesgpt_last_subject = data.subject;
  }

  if (eventType === "notes_generated") {
    updates.notesgpt_sessions = "INCREMENT";
    if (data.classNum) updates.notesgpt_class = `Class ${data.classNum}`;
  }

  if (eventType === "test_submitted" && data.pct !== undefined) {
    updates.notesgpt_last_test_score = String(data.pct);

    // 🔥 High-intent deal: 90%+ test score
    if (data.pct >= 90) {
      await createDeal(email, `Scored ${data.pct}% on ${data.chapter}`, {
        description: `High-performing student — scored ${data.pct}% on ${data.chapter} (${data.subject}, Class ${data.classNum})`,
      });
      updates.notesgpt_engagement_tier = "high";
    } else if (data.pct >= 70) {
      updates.notesgpt_engagement_tier = "medium";
    }
  }

  await updateContact(email, updates);

  // 🔥 Session-based deal: after 3rd session
  if (eventType === "notes_generated") {
    const contactData = await hubspotRequest("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{
        filters: [{ propertyName: "email", operator: "EQ", value: email }],
      }],
      properties: ["notesgpt_sessions"],
      limit: 1,
    });

    if (contactData?.results?.length) {
      const sessions = parseInt(contactData.results[0].properties?.notesgpt_sessions || "0", 10);
      if (sessions === 3) {
        await createDeal(email, "Completed 3 study sessions", {
          description: `Engaged student — completed 3 study sessions. High churn-risk if not converted to premium.`,
        });
      }
    }
  }
}

module.exports = {
  upsertContact,
  updateContact,
  logStudyEvent,
  createDeal,
  onStudentSignup,
  onStudyEvent,
};
