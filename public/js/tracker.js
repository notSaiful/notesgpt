// ══════════════════════════════════════════════
// NotesGPT — Performance Tracker (localStorage)
// ══════════════════════════════════════════════

const Tracker = (() => {
  const STORAGE_KEY = "notesgpt_performance";

  // ── Get all data ───────────────────────────
  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { return {}; }
  }

  function saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ── Chapter key ────────────────────────────
  function key(classNum, subject, chapter) {
    return `${classNum}|${subject}|${chapter}`.toLowerCase();
  }

  // ── Get chapter data ───────────────────────
  function getChapter(classNum, subject, chapter) {
    const all = getAll();
    const k = key(classNum, subject, chapter);
    return all[k] || {
      classNum, subject, chapter,
      flashcards: null,
      practice: null,
      test: null,
      level: "new",
      lastUpdated: null,
    };
  }

  // ── Save flashcard results ─────────────────
  function saveFlashcards(classNum, subject, chapter, knew, partial, didnt) {
    const all = getAll();
    const k = key(classNum, subject, chapter);
    const ch = all[k] || { classNum, subject, chapter };
    const total = knew + partial + didnt;

    ch.flashcards = {
      knew, partial, didnt, total,
      knewPct: total > 0 ? Math.round((knew / total) * 100) : 0,
      timestamp: Date.now(),
    };
    ch.lastUpdated = Date.now();
    ch.level = computeLevel(ch);
    all[k] = ch;
    saveAll(all);
  }

  // ── Save practice results ──────────────────
  function savePractice(classNum, subject, chapter, attempted, totalQuestions, solutionsViewed) {
    const all = getAll();
    const k = key(classNum, subject, chapter);
    const ch = all[k] || { classNum, subject, chapter };

    ch.practice = {
      attempted, totalQuestions, solutionsViewed,
      attemptPct: totalQuestions > 0 ? Math.round((attempted / totalQuestions) * 100) : 0,
      timestamp: Date.now(),
    };
    ch.lastUpdated = Date.now();
    ch.level = computeLevel(ch);
    all[k] = ch;
    saveAll(all);
  }

  // ── Save test results ─────────────────────
  function saveTest(classNum, subject, chapter, awarded, maxMarks, results) {
    const all = getAll();
    const k = key(classNum, subject, chapter);
    const ch = all[k] || { classNum, subject, chapter };

    ch.test = {
      awarded, maxMarks,
      pct: maxMarks > 0 ? Math.round((awarded / maxMarks) * 100) : 0,
      weakQuestions: results.filter(r => r.marks_awarded < r.total_marks * 0.5).length,
      timestamp: Date.now(),
    };
    ch.lastUpdated = Date.now();
    ch.level = computeLevel(ch);
    all[k] = ch;
    saveAll(all);
  }

  // ── Compute strength level ─────────────────
  function computeLevel(ch) {
    let score = 0;
    let factors = 0;

    if (ch.flashcards) {
      score += ch.flashcards.knewPct;
      factors++;
    }
    if (ch.practice) {
      score += ch.practice.attemptPct;
      factors++;
    }
    if (ch.test) {
      score += ch.test.pct;
      factors++;
    }

    if (factors === 0) return "new";
    const avg = score / factors;

    if (avg >= 75) return "strong";
    if (avg >= 45) return "moderate";
    return "weak";
  }

  // ── Detect issue type ──────────────────────
  function detectIssue(ch) {
    if (!ch.flashcards && !ch.practice && !ch.test) return null;

    // Memory issue: flashcards poor
    if (ch.flashcards && ch.flashcards.knewPct < 50) {
      return { type: "memory", label: "Memory Issue", icon: "🧠", desc: "Too many flashcards missed" };
    }

    // Application issue: practice poor
    if (ch.practice && ch.practice.attemptPct < 50) {
      return { type: "application", label: "Application Issue", icon: "✍️", desc: "Low attempt rate on practice" };
    }

    // Concept issue: test poor
    if (ch.test && ch.test.pct < 50) {
      return { type: "concept", label: "Concept Issue", icon: "📖", desc: "Low test score, needs revision" };
    }

    return null;
  }

  // ── Get action plan ────────────────────────
  function getActions(ch) {
    const issue = detectIssue(ch);
    const actions = [];

    if (ch.level === "weak" || ch.level === "new") {
      actions.push({ label: "📝 Re-read Summary", step: "output" });
      actions.push({ label: "🔒 Redo Flashcards", step: "flashcards" });
      actions.push({ label: "📋 Practice Questions", step: "practice" });
    } else if (ch.level === "moderate") {
      if (issue?.type === "memory") {
        actions.push({ label: "🔒 Redo Flashcards", step: "flashcards" });
      }
      actions.push({ label: "📋 Practice More", step: "practice" });
      actions.push({ label: "📝 Retake Test", step: "test" });
    } else {
      actions.push({ label: "📝 Retake Test", step: "test" });
      actions.push({ label: "✅ Move to Next Chapter", step: "new" });
    }

    return actions;
  }

  // ── Get all chapters sorted ────────────────
  function getAllChapters() {
    const all = getAll();
    return Object.values(all)
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  }

  // ── Get dashboard stats ────────────────────
  function getDashboardStats() {
    const chapters = getAllChapters();
    const stats = { total: chapters.length, strong: 0, moderate: 0, weak: 0 };

    chapters.forEach(ch => {
      if (ch.level === "strong") stats.strong++;
      else if (ch.level === "moderate") stats.moderate++;
      else if (ch.level === "weak") stats.weak++;
    });

    return stats;
  }

  // ── Get today's tasks ──────────────────────
  function getTodayTasks() {
    const chapters = getAllChapters();
    const tasks = [];

    // Find weak chapters first
    const weak = chapters.filter(ch => ch.level === "weak");
    const moderate = chapters.filter(ch => ch.level === "moderate");

    weak.forEach(ch => {
      const issue = detectIssue(ch);
      if (issue?.type === "memory") {
        tasks.push({ text: `Redo flashcards for ${ch.chapter}`, chapter: ch });
      } else {
        tasks.push({ text: `Revise ${ch.chapter} summary`, chapter: ch });
      }
    });

    moderate.forEach(ch => {
      tasks.push({ text: `Practice ${ch.chapter} questions`, chapter: ch });
    });

    return tasks.slice(0, 5); // Max 5 tasks
  }

  // ── Clear all data ─────────────────────────
  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    getChapter, saveFlashcards, savePractice, saveTest,
    detectIssue, getActions, getAllChapters, getDashboardStats,
    getTodayTasks, clearAll,
  };
})();
