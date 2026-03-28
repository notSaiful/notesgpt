// ══════════════════════════════════════════════
// NotesGPT — Main App Logic
// ══════════════════════════════════════════════

// ── Current session state ────────────────────
let currentClassNum = "";
let currentSubject = "";
let currentChapter = "";
window.currentClassNum = "";
window.currentSubject = "";
window.currentChapter = "";

// ── DOM refs ─────────────────────────────────
const DOM = {
  form: document.getElementById("notes-form"),
  classSelect: document.getElementById("class-select"),
  subject: document.getElementById("subject-select"),
  chapter: document.getElementById("chapter-input"),
  submitBtn: document.getElementById("submit-btn"),
  errorMsg: document.getElementById("error-msg"),
  dashboardSection: document.getElementById("dashboard-section"),
  dashStats: document.getElementById("dash-stats"),
  dashChapters: document.getElementById("dash-chapters"),
  dashTasks: document.getElementById("dash-tasks"),
  dashNewBtn: document.getElementById("dash-new-btn"),
  inputSection: document.getElementById("input-section"),
  loadingSection: document.getElementById("loading-section"),
  outputSection: document.getElementById("output-section"),
  outputBadge: document.getElementById("output-badge"),
  outputTitle: document.getElementById("output-title"),
  notesContent: document.getElementById("notes-content"),
  newNotesBtn: document.getElementById("new-notes-btn"),
  flashcardBtn: document.getElementById("flashcard-btn"),
  flashcardLoading: document.getElementById("flashcard-loading"),
  flashcardSection: document.getElementById("flashcard-section"),
  flashcardComplete: document.getElementById("flashcard-complete"),
  practiceLoading: document.getElementById("practice-loading"),
  practiceSection: document.getElementById("practice-section"),
  practiceComplete: document.getElementById("practice-complete"),
  testLoading: document.getElementById("test-loading"),
  testSection: document.getElementById("test-section"),
  testEvalLoading: document.getElementById("test-eval-loading"),
  testResults: document.getElementById("test-results"),
  fcPracticeBtn: document.getElementById("fc-practice-btn"),
  pqTestBtn: document.getElementById("pq-test-btn"),
  correctionSection: document.getElementById("correction-section"),
  retryLoading: document.getElementById("retry-loading"),
  retrySection: document.getElementById("retry-section"),
  retryComplete: document.getElementById("retry-complete"),
  mindmapLoading: document.getElementById("mindmap-loading"),
  mindmapSection: document.getElementById("mindmap-section"),
};

// All view sections
const ALL_SECTIONS = [
  DOM.dashboardSection,
  DOM.inputSection,
  DOM.loadingSection,
  DOM.outputSection,
  DOM.flashcardLoading,
  DOM.flashcardSection,
  DOM.flashcardComplete,
  DOM.practiceLoading,
  DOM.practiceSection,
  DOM.practiceComplete,
  DOM.testLoading,
  DOM.testSection,
  DOM.testEvalLoading,
  DOM.testResults,
  DOM.correctionSection,
  DOM.retryLoading,
  DOM.retrySection,
  DOM.retryComplete,
  DOM.mindmapLoading,
  DOM.mindmapSection,
];

// ── Global view manager ──────────────────────
function setGlobalView(view) {
  const viewMap = {
    dashboard: DOM.dashboardSection,
    form: DOM.inputSection,
    loading: DOM.loadingSection,
    output: DOM.outputSection,
    "flashcard-loading": DOM.flashcardLoading,
    flashcards: DOM.flashcardSection,
    "flashcard-complete": DOM.flashcardComplete,
    "practice-loading": DOM.practiceLoading,
    practice: DOM.practiceSection,
    "practice-complete": DOM.practiceComplete,
    "test-loading": DOM.testLoading,
    test: DOM.testSection,
    "test-eval-loading": DOM.testEvalLoading,
    "test-results": DOM.testResults,
    correction: DOM.correctionSection,
    "retry-loading": DOM.retryLoading,
    retry: DOM.retrySection,
    "retry-complete": DOM.retryComplete,
    "mindmap-loading": DOM.mindmapLoading,
    mindmap: DOM.mindmapSection,
  };

  ALL_SECTIONS.forEach((s) => s.classList.add("hidden"));
  const target = viewMap[view];
  if (target) target.classList.remove("hidden");

  // Show audio section inline with test results (after scores)
  if (typeof AudioPlayer !== "undefined") {
    if (view === "test-results") AudioPlayer.show();
    else AudioPlayer.stop();
  }

  // Show music section with test results
  if (typeof MusicPlayer !== "undefined") {
    if (view === "test-results") MusicPlayer.show();
    else MusicPlayer.hide();
  }
}

window.setGlobalView = setGlobalView;

// ── Reset to form ────────────────────────────
function resetToForm() {
  renderDashboard();
  DOM.chapter.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.resetToForm = resetToForm;

// ── Mind Map button ──────────────────────────
const mindmapBtn = document.getElementById("mindmap-btn");
if (mindmapBtn) {
  mindmapBtn.addEventListener("click", () => {
    if (typeof MindMap !== "undefined" && currentClassNum && currentSubject && currentChapter) {
      MindMap.generate(currentClassNum, currentSubject, currentChapter);
    }
  });
}

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════

function renderDashboard() {
  const chapters = Tracker.getAllChapters();

  if (chapters.length === 0) {
    // No history — show form only
    DOM.dashboardSection.classList.add("hidden");
    DOM.inputSection.classList.remove("hidden");
    return;
  }

  // Show dashboard + form
  ALL_SECTIONS.forEach((s) => s.classList.add("hidden"));
  DOM.dashboardSection.classList.remove("hidden");
  DOM.inputSection.classList.remove("hidden");

  // ── Stats row ──
  const stats = Tracker.getDashboardStats();
  DOM.dashStats.innerHTML = `
    <div class="dash-stat">
      <span class="dash-stat__num">${stats.total}</span>
      <span class="dash-stat__label">Chapters</span>
    </div>
    <div class="dash-stat dash-stat--green">
      <span class="dash-stat__num">${stats.strong}</span>
      <span class="dash-stat__label">Strong</span>
    </div>
    <div class="dash-stat dash-stat--amber">
      <span class="dash-stat__num">${stats.moderate}</span>
      <span class="dash-stat__label">Moderate</span>
    </div>
    <div class="dash-stat dash-stat--red">
      <span class="dash-stat__num">${stats.weak}</span>
      <span class="dash-stat__label">Weak</span>
    </div>
  `;

  // ── Chapter cards ──
  const levelIcons = { strong: "✅", moderate: "⚠️", weak: "❌", new: "🆕" };
  const levelLabels = { strong: "Strong", moderate: "Moderate", weak: "Weak", new: "New" };

  DOM.dashChapters.innerHTML = chapters.slice(0, 8).map(ch => {
    const issue = Tracker.detectIssue(ch);
    const fcPct = ch.flashcards ? `${ch.flashcards.knewPct}%` : "—";
    const prPct = ch.practice ? `${ch.practice.attemptPct}%` : "—";
    const tsPct = ch.test ? `${ch.test.pct}%` : "—";

    return `
      <div class="dash-ch dash-ch--${ch.level}">
        <div class="dash-ch__header">
          <span class="dash-ch__icon">${levelIcons[ch.level] || "📚"}</span>
          <div class="dash-ch__info">
            <span class="dash-ch__name">${ch.chapter}</span>
            <span class="dash-ch__meta">Class ${ch.classNum} · ${ch.subject}</span>
          </div>
          <span class="dash-ch__level dash-ch__level--${ch.level}">${levelLabels[ch.level]}</span>
        </div>
        <div class="dash-ch__scores">
          <span class="dash-ch__score">🔒 ${fcPct}</span>
          <span class="dash-ch__score">📋 ${prPct}</span>
          <span class="dash-ch__score">📝 ${tsPct}</span>
        </div>
        ${issue ? `<div class="dash-ch__issue">${issue.icon} ${issue.label}: ${issue.desc}</div>` : ""}
      </div>
    `;
  }).join("");

  // ── Today's tasks ──
  const tasks = Tracker.getTodayTasks();
  if (tasks.length > 0) {
    DOM.dashTasks.innerHTML = `
      <h3 class="dash-tasks__title">🎯 Today's Tasks</h3>
      <ul class="dash-tasks__list">
        ${tasks.map(t => `<li class="dash-tasks__item">${t.text}</li>`).join("")}
      </ul>
    `;
  } else {
    DOM.dashTasks.innerHTML = "";
  }

  // ── Saved History ──
  if (typeof History !== "undefined") {
    History.render("hist-list");
  }

  // Wire clear history button
  const clearBtn = document.getElementById("hist-clear-btn");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm("Clear all study history?")) {
        History.clearAll();
        History.render("hist-list");
      }
    };
  }
}

// ── Dynamic subjects loader ──────────────────
DOM.classSelect.addEventListener("change", async () => {
  const classNum = DOM.classSelect.value;
  DOM.subject.disabled = true;
  DOM.subject.innerHTML = '<option value="" disabled selected>Loading…</option>';

  try {
    const res = await fetch(`/api/subjects/${classNum}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    DOM.subject.innerHTML = '<option value="" disabled selected>Choose a subject</option>';
    data.subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      DOM.subject.appendChild(opt);
    });
    DOM.subject.disabled = false;
  } catch {
    DOM.subject.innerHTML = '<option value="" disabled selected>Error loading</option>';
  }
});

// ── Simple Markdown → HTML renderer ──────────
function renderMarkdown(md) {
  let html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^(\d+)\.\s+\*\*(.+?)\*\*\s*$/gm, "<h2>$1. $2</h2>");

  const lines = html.split("\n");
  let result = [];
  let inList = false;
  let listType = null;

  for (const line of lines) {
    const ulMatch = line.match(/^\s*[-*]\s+(.+)/);
    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    const isHeading = line.startsWith("<h2>") || line.startsWith("<h3>");

    if (ulMatch && !isHeading) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
        result.push("<ul>");
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch && !isHeading) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
        result.push("<ol>");
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${olMatch[2]}</li>`);
    } else {
      if (inList) {
        result.push(listType === "ul" ? "</ul>" : "</ol>");
        inList = false;
        listType = null;
      }
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("<")) {
        result.push(`<p>${trimmed}</p>`);
      } else {
        result.push(line);
      }
    }
  }
  if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
  return result.join("\n");
}

// ── Error helpers ────────────────────────────
function showError(msg) { DOM.errorMsg.textContent = msg; }
function clearError() { DOM.errorMsg.textContent = ""; }

// ── Form submit ──────────────────────────────
DOM.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const classNum = DOM.classSelect.value;
  const subject = DOM.subject.value;
  const chapter = DOM.chapter.value.trim();

  if (!classNum) { showError("Please select a class."); return; }
  if (!subject) { showError("Please select a subject."); return; }
  if (!chapter) { showError("Please enter a chapter name."); return; }

  currentClassNum = classNum;
  currentSubject = subject;
  currentChapter = chapter;
  window.currentClassNum = classNum;
  window.currentSubject = subject;
  window.currentChapter = chapter;

  DOM.submitBtn.disabled = true;
  setGlobalView("loading");

  try {
    const res = await fetch("/api/generate-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classNum, subject, chapter }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");

    DOM.outputBadge.textContent = `Class ${classNum}`;
    DOM.outputTitle.textContent = `${subject} — ${chapter}`;
    DOM.notesContent.innerHTML = renderMarkdown(data.notes);

    // Save to history
    if (typeof History !== "undefined") {
      History.save({
        classNum, subject, chapter,
        type: "summary",
        preview: data.notes.slice(0, 120),
      });
    }

    setGlobalView("output");
  } catch (err) {
    setGlobalView("form");
    showError(err.message);
  } finally {
    DOM.submitBtn.disabled = false;
  }
});

// ── Button handlers ──────────────────────────
DOM.newNotesBtn.addEventListener("click", resetToForm);

DOM.dashNewBtn.addEventListener("click", () => {
  DOM.chapter.focus();
  DOM.chapter.scrollIntoView({ behavior: "smooth" });
});

DOM.flashcardBtn.addEventListener("click", () => {
  if (currentClassNum && currentSubject && currentChapter) {
    Flashcards.start(currentClassNum, currentSubject, currentChapter);
  }
});

DOM.fcPracticeBtn.addEventListener("click", () => {
  if (currentClassNum && currentSubject && currentChapter) {
    Practice.start(currentClassNum, currentSubject, currentChapter);
  }
});

DOM.pqTestBtn.addEventListener("click", () => {
  if (currentClassNum && currentSubject && currentChapter) {
    TestEngine.start(currentClassNum, currentSubject, currentChapter);
  }
});

// ── On page load: render dashboard ───────────
document.addEventListener("DOMContentLoaded", () => {
  renderDashboard();
});
