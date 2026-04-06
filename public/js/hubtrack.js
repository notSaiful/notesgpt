// ══════════════════════════════════════════════
// NotesGPT — HubSpot Frontend Tracker
// Fires study events to the server which relays
// them to HubSpot CRM. Fire-and-forget pattern.
// ══════════════════════════════════════════════

const HubTrack = (() => {
  // Get current user's email from Supabase auth session
  function getUserEmail() {
    try {
      // Try to get from window auth state (set by auth.js)
      if (window.currentUserEmail) return window.currentUserEmail;

      // Fallback: check localStorage for any Supabase session
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.includes("auth-token") || key.includes("supabase")) {
          try {
            const val = JSON.parse(localStorage.getItem(key));
            const email = val?.user?.email || val?.currentSession?.user?.email;
            if (email) return email;
          } catch {}
        }
      }
    } catch {}
    return null;
  }

  // Core track function — fire and forget, never blocks UI
  async function track(eventType, data = {}) {
    const email = getUserEmail();
    if (!email) return; // Guest users aren't tracked (no CRM entry)

    try {
      await fetch("/api/hubspot/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, eventType, data }),
      });
    } catch {
      // Silently ignore — CRM tracking must never affect the user
    }
  }

  // ── Named event helpers ──────────────────────

  function notesGenerated(classNum, subject, chapter, wordCount) {
    track("notes_generated", { classNum, subject, chapter, word_count: wordCount });
  }

  function flashcardsCompleted(classNum, subject, chapter, cardCount) {
    track("flashcards_completed", { classNum, subject, chapter, cards_reviewed: cardCount });
  }

  function practiceCompleted(classNum, subject, chapter) {
    track("practice_completed", { classNum, subject, chapter });
  }

  function testSubmitted(classNum, subject, chapter, score, total) {
    const pct = Math.round((score / total) * 100);
    track("test_submitted", { classNum, subject, chapter, score, total, pct });
  }

  function audiobookGenerated(classNum, subject, chapter) {
    track("audiobook_generated", { classNum, subject, chapter });
  }

  function visualLessonGenerated(classNum, subject, chapter, slidesCount) {
    track("visual_lesson_generated", { classNum, subject, chapter, slides_count: slidesCount });
  }

  function memorySongGenerated(classNum, subject, chapter) {
    track("memory_song_generated", { classNum, subject, chapter });
  }

  function landingCtaClicked(email) {
    if (!email) return;
    fetch("/api/hubspot/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        eventType: "landing_cta_clicked",
        data: { source: "hero_cta" },
      }),
    }).catch(() => {});
  }

  function onSignup(email, userData = {}) {
    fetch("/api/hubspot/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, eventType: "signup", data: userData }),
    }).catch(() => {});
  }

  return {
    track,
    notesGenerated,
    flashcardsCompleted,
    practiceCompleted,
    testSubmitted,
    audiobookGenerated,
    visualLessonGenerated,
    memorySongGenerated,
    landingCtaClicked,
    onSignup,
  };
})();

// Expose globally
window.HubTrack = HubTrack;
