// ══════════════════════════════════════════════
// NotesGPT — Saved History System
// ══════════════════════════════════════════════

const History = (() => {
  const STORAGE_KEY = "notesgpt_history";
  const MAX_ITEMS = 50;

  // ── Get all history ────────────────────────
  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }

  // ── Save a generation ──────────────────────
  function save(entry) {
    const all = getAll();

    // Check for duplicate (same class/subject/chapter)
    const existIdx = all.findIndex(
      h => h.classNum === entry.classNum &&
           h.subject === entry.subject &&
           h.chapter === entry.chapter
    );

    const record = {
      id: existIdx >= 0 ? all[existIdx].id : Date.now(),
      classNum: entry.classNum,
      subject: entry.subject,
      chapter: entry.chapter,
      type: entry.type || "summary",
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric"
      }),
      timeStr: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit"
      }),
      preview: (entry.preview || "").slice(0, 120),
      testScore: entry.testScore || null,
      accuracy: entry.accuracy || null,
    };

    if (existIdx >= 0) {
      all[existIdx] = { ...all[existIdx], ...record };
    } else {
      all.unshift(record);
    }

    // Limit size
    if (all.length > MAX_ITEMS) all.length = MAX_ITEMS;

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
  }

  // ── Delete entry ───────────────────────────
  function remove(id) {
    const all = getAll().filter(h => h.id !== id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
  }

  // ── Clear all ──────────────────────────────
  function clearAll() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // ── Render history list ────────────────────
  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const all = getAll();

    if (all.length === 0) {
      container.innerHTML = `<p class="hist-empty">No saved sessions yet. Start studying to build your history!</p>`;
      return;
    }

    container.innerHTML = all.map(h => {
      const typeIcon = {
        summary: "📝", flashcards: "🔒", practice: "📋",
        test: "📝", correction: "🔧"
      }[h.type] || "📝";

      const scoreHtml = h.testScore !== null
        ? `<span class="hist-card__score">${h.testScore}%</span>`
        : "";

      return `
        <div class="hist-card" data-id="${h.id}">
          <div class="hist-card__icon">${typeIcon}</div>
          <div class="hist-card__info">
            <div class="hist-card__title">Class ${h.classNum} · ${h.subject}</div>
            <div class="hist-card__chapter">${h.chapter}</div>
            <div class="hist-card__meta">${h.dateStr} · ${h.timeStr}</div>
          </div>
          ${scoreHtml}
          <button class="hist-card__resume" onclick="History.resume(${h.id})">Resume →</button>
        </div>
      `;
    }).join("");
  }

  // ── Resume a session ───────────────────────
  function resume(id) {
    const all = getAll();
    const entry = all.find(h => h.id === id);
    if (!entry) return;

    // Set current session
    window.currentClassNum = entry.classNum;
    window.currentSubject = entry.subject;
    window.currentChapter = entry.chapter;

    // Set form values if possible
    const classSelect = document.getElementById("class-select");
    const subjectSelect = document.getElementById("subject-select");
    const chapterInput = document.getElementById("chapter-input");

    if (classSelect) classSelect.value = entry.classNum;
    if (chapterInput) chapterInput.value = entry.chapter;

    // Trigger form submission
    const form = document.getElementById("notes-form");
    if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }

  return { getAll, save, remove, clearAll, render, resume };
})();
