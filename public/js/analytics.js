// ══════════════════════════════════════════════
// NotesGPT — Google Analytics 4 Event Tracker
// Measurement ID: G-5J7MKXNT45
//
// Tracks all meaningful student interactions:
// - Study flow progression (notes → test → song)
// - Conversion events (sign-up, CTA clicks)
// - Engagement (scores, chapters, subjects)
// - Revenue signals (feature usage depth)
// ══════════════════════════════════════════════

const GA = (() => {
  const MEASUREMENT_ID = "G-5J7MKXNT45";

  // Check if gtag is loaded
  function ready() {
    return typeof window.gtag === "function";
  }

  // Core event sender — fire and forget, never blocks UI
  function send(eventName, params = {}) {
    if (!ready()) return;
    try {
      window.gtag("event", eventName, {
        ...params,
        app_name: "NotesGPT",
        app_version: "2.0",
      });
    } catch (e) {
      // Silent fail — analytics must never break the app
    }
  }

  // ── User Identity (critical for cross-device tracking) ──────
  // Call this once after login with the Supabase user ID
  function setUser(userId, properties = {}) {
    if (!ready() || !userId) return;
    try {
      // Set user_id for cross-device/session stitching
      window.gtag("config", MEASUREMENT_ID, { user_id: userId });
      // Set user properties — these persist on the user in GA4
      window.gtag("set", "user_properties", {
        user_class: properties.class || null,
        user_subject: properties.subject || null,
        account_type: properties.accountType || "free",
        signup_method: properties.provider || "email",
      });
    } catch (e) { /* silent */ }
  }

  // ── Performance Timing ──────────────────────────────────────
  const _timers = {};
  function startTimer(label) { _timers[label] = performance.now(); }
  function endTimer(label, eventName, extraParams = {}) {
    if (!_timers[label]) return;
    const durationMs = Math.round(performance.now() - _timers[label]);
    delete _timers[label];
    send(eventName || `${label}_timing`, {
      event_category: "performance",
      duration_ms: durationMs,
      duration_seconds: Math.round(durationMs / 1000),
      ...extraParams,
    });
  }

  // ── Conversion Events (Most Important) ─────────────────────

  // User signs up for the first time
  function signUp(method = "google") {
    send("sign_up", { method });
    send("conversion", { send_to: `${MEASUREMENT_ID}/signup` });
  }

  // User signs in
  function signIn(method = "google") {
    send("login", { method });
  }

  // User clicks the main CTA on the landing page
  function heroCtaClick(location = "hero") {
    send("cta_click", {
      event_category: "conversion",
      event_label: location,
      location,
    });
  }

  // ── Study Flow Events (Engagement) ─────────────────────────

  // Notes generated — the core action
  function notesGenerated(classNum, subject, chapter, wordCount = 0) {
    send("notes_generated", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
      word_count: wordCount,
      value: 1,
    });
    // Also send as a standard 'generate_lead' conversion
    send("generate_lead", {
      currency: "INR",
      value: 0,
      class_level: `Class ${classNum}`,
      subject,
    });
  }

  // Flashcards started
  function flashcardsStarted(classNum, subject, chapter) {
    send("flashcards_started", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
    });
  }

  // Flashcards completed
  function flashcardsCompleted(classNum, subject, chapter) {
    send("flashcards_completed", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
      engagement_type: "flashcard_completion",
    });
  }

  // Practice session completed
  function practiceCompleted(classNum, subject, chapter) {
    send("practice_completed", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
    });
  }

  // Mock test submitted with score
  function testSubmitted(classNum, subject, chapter, score, total) {
    const pct = Math.round((score / total) * 100);
    send("test_submitted", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
      score,
      total,
      score_percent: pct,
      performance: pct >= 90 ? "excellent" : pct >= 70 ? "good" : pct >= 50 ? "average" : "needs_improvement",
    });
    // High scorers are our most engaged users — track separately
    if (pct >= 90) {
      send("high_score_achieved", {
        event_category: "engagement",
        subject,
        chapter,
        score_percent: pct,
      });
    }
  }

  // Audiobook generated
  function audiobookGenerated(classNum, subject, chapter) {
    send("audiobook_generated", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
    });
  }

  // Visual lesson (slideshow) generated
  function visualLessonGenerated(classNum, subject, chapter, slideCount = 4) {
    send("visual_lesson_generated", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
      slide_count: slideCount,
    });
  }

  // Memory song generated
  function memorySongGenerated(classNum, subject, chapter) {
    send("memory_song_generated", {
      event_category: "study_flow",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
    });
  }

  // Chapter fully completed (all 11 steps done)
  function chapterCompleted(classNum, subject, chapter) {
    send("chapter_completed", {
      event_category: "retention",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
      value: 10, // High value event
    });
    // Mark as core conversion
    send("purchase", {
      currency: "INR",
      value: 0,
      transaction_id: `${classNum}-${subject}-${chapter}-${Date.now()}`,
      items: [{ item_name: chapter, item_category: subject, quantity: 1 }],
    });
  }

  // ── Feature Events ──────────────────────────────────────────

  // Doubt asked
  function doubtAsked(classNum, subject) {
    send("doubt_asked", {
      event_category: "engagement",
      class_level: `Class ${classNum}`,
      subject,
    });
  }

  // Mind map viewed
  function mindmapViewed(classNum, subject, chapter) {
    send("mindmap_viewed", {
      event_category: "engagement",
      class_level: `Class ${classNum}`,
      subject,
      chapter,
    });
  }

  // ── Navigation / UI Events ──────────────────────────────────

  // User scrolls past hero (engagement signal)
  function scrolledPastHero() {
    send("scroll", {
      event_category: "engagement",
      event_label: "past_hero",
      percent_scrolled: 25,
    });
  }

  // Footer CTA clicked
  function footerCtaClick() {
    send("cta_click", {
      event_category: "conversion",
      event_label: "footer",
      location: "footer",
    });
  }

  // CBSE Notes hub page subject card clicked
  function subjectCardClick(classNum, subject) {
    send("subject_card_click", {
      event_category: "navigation",
      class_level: `Class ${classNum}`,
      subject,
    });
  }

  // ── Scroll depth tracking ───────────────────────────────────
  function initScrollTracking() {
    const depths = [25, 50, 75, 90];
    const fired = new Set();

    window.addEventListener("scroll", () => {
      const pct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      depths.forEach((d) => {
        if (pct >= d && !fired.has(d)) {
          fired.add(d);
          send("scroll_depth", {
            event_category: "engagement",
            percent_scrolled: d,
          });
        }
      });
    }, { passive: true });
  }

  // ── Session start ───────────────────────────────────────────
  function init() {
    // Track scroll depth on landing page
    if (!document.querySelector("#app-view")) return; // only on index
    initScrollTracking();

    // Track hero CTA clicks
    const heroBtn = document.getElementById("hero-start-btn");
    if (heroBtn) {
      heroBtn.addEventListener("click", () => heroCtaClick("hero"), { once: true });
    }

    const footerBtn = document.getElementById("footer-start-btn");
    if (footerBtn) {
      footerBtn.addEventListener("click", () => footerCtaClick(), { once: true });
    }

    console.log(`📊 GA4 analytics active (${MEASUREMENT_ID})`);
  }

  return {
    // Init
    init,
    // Identity
    setUser,
    // Timing
    startTimer,
    endTimer,
    // Conversions
    signUp,
    signIn,
    heroCtaClick,
    // Study flow
    notesGenerated,
    flashcardsStarted,
    flashcardsCompleted,
    practiceCompleted,
    testSubmitted,
    audiobookGenerated,
    visualLessonGenerated,
    memorySongGenerated,
    chapterCompleted,
    // Features
    doubtAsked,
    mindmapViewed,
    subjectCardClick,
    // Raw sender
    send,
  };
})();

window.GA = GA;
document.addEventListener("DOMContentLoaded", () => GA.init());
