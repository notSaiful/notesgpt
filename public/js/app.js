// ══════════════════════════════════════════════
// NotesGPT — Main App Logic (v2 — 11-Step Flow)
// ══════════════════════════════════════════════
// Flow: Summary → Flashcards → Practice → Test → Fix → Improve → Unlock → Mind Map → Audio Book → AI Video → Song

// ── Current session state ────────────────────
let currentClassNum = "";
let currentSubject = "";
let currentChapter = "";
let currentTopic = "";
window.currentClassNum = "";
window.currentSubject = "";
window.currentChapter = "";
window.currentTopic = "";

// ── DOM refs ─────────────────────────────────
const DOM = {
  form: document.getElementById("notes-form"),
  classSelect: document.getElementById("class-select"),
  subject: document.getElementById("subject-select"),
  chapter: document.getElementById("chapter-select"),
  submitBtn: document.getElementById("submit-btn"),
  errorMsg: document.getElementById("error-msg"),
  dashStats: document.getElementById("dash-stats"),
  dashChapters: document.getElementById("dash-chapters"),
  dashTasks: document.getElementById("dash-tasks"),
  dashNewBtn: document.getElementById("dash-new-btn"),
  histSection: document.getElementById("hist-section"),
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
  unlockSection: document.getElementById("unlock-section"),
  mindmapLoading: document.getElementById("mindmap-loading"),
  mindmapSection: document.getElementById("mindmap-section"),
  audiobookSection: document.getElementById("audiobook-section"),
  aivideoSection: document.getElementById("aivideo-section"),
  songSection: document.getElementById("song-section"),
  arenaLoading: document.getElementById("arena-loading"),
  arenaSection: document.getElementById("arena-section"),
  arenaResults: document.getElementById("arena-results"),
  reviewSection: document.getElementById("review-section"),
  chapterComplete: document.getElementById("chapter-complete"),
  histSectionWrap: document.getElementById("hist-section-wrap"),
};

// All sequential view sections
const ALL_SECTIONS = [
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
  DOM.unlockSection,
  DOM.mindmapLoading,
  DOM.mindmapSection,
  DOM.audiobookSection,
  DOM.aivideoSection,
  DOM.songSection,
  DOM.arenaLoading,
  DOM.arenaSection,
  DOM.arenaResults,
  DOM.reviewSection,
  DOM.chapterComplete,
];

// ── Global view manager ──────────────────────
function updateStepper(view) {
  const stepper = document.getElementById("flow-stepper");
  if (!stepper) return;
  
  // Only show stepper during active learning flow
  const learningViews = [
    "loading", "output",
    "flashcard-loading", "flashcards", "flashcard-complete",
    "practice-loading", "practice", "practice-complete",
    "test-loading", "test", "test-eval-loading", "test-results",
    "correction", "retry-loading", "retry", "retry-complete",
    "unlock",
    "mindmap-loading", "mindmap",
    "audiobook",
    "aivideo",
    "song",
  ];
  if (learningViews.includes(view)) {
    stepper.classList.remove("hidden");
  } else {
    stepper.classList.add("hidden");
    return;
  }

  // 5 phases: Learn, Practice, Fix, Revise, Master
  const steps = ["step-learn", "step-practice", "step-fix", "step-revise", "step-master"];
  
  let activeIndex = 0;
  // Learn phase: summary, flashcards
  if (["loading", "output", "flashcard-loading", "flashcards", "flashcard-complete"].includes(view)) activeIndex = 0;
  // Practice phase: practice, test
  else if (["practice-loading", "practice", "practice-complete", "test-loading", "test", "test-eval-loading", "test-results"].includes(view)) activeIndex = 1;
  // Fix phase: correction, retry, unlock
  else if (["correction", "retry-loading", "retry", "retry-complete", "unlock"].includes(view)) activeIndex = 2;
  // Revise phase: mindmap, audiobook
  else if (["mindmap-loading", "mindmap", "audiobook"].includes(view)) activeIndex = 3;
  // Master phase: aivideo, song, chapter-complete
  else if (["aivideo", "song", "chapter-complete"].includes(view)) activeIndex = 4;

  steps.forEach((stepId, index) => {
    const el = document.getElementById(stepId);
    if (!el) return;
    
    el.classList.remove("flow-step--active", "flow-step--completed");
    
    if (index === activeIndex) {
      el.classList.add("flow-step--active");
    } else if (index < activeIndex) {
      el.classList.add("flow-step--completed");
    }
  });
}

function setGlobalView(view) {
  const viewMap = {
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
    unlock: DOM.unlockSection,
    "mindmap-loading": DOM.mindmapLoading,
    mindmap: DOM.mindmapSection,
    audiobook: DOM.audiobookSection,
    aivideo: DOM.aivideoSection,
    song: DOM.songSection,
    review: DOM.reviewSection,
    "chapter-complete": DOM.chapterComplete,
  };

  ALL_SECTIONS.forEach((s) => { if (s) s.classList.add("hidden"); });
  const target = viewMap[view];
  if (target) target.classList.remove("hidden");

  if (DOM.histSectionWrap) {
    if (view === "form" || view === "review") {
      // Visibility is managed by renderDashboard / review logic
    } else {
      DOM.histSectionWrap.style.display = "none";
    }
  }

  // Update Stepper UI
  updateStepper(view);
}

window.setGlobalView = setGlobalView;

// ── Reset to form ────────────────────────────
function resetToForm() {
  renderDashboard();
  DOM.chapter.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.resetToForm = resetToForm;

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════

function renderDashboard() {
  const chapters = Tracker.getAllChapters();
  const wrap = DOM.histSectionWrap || document.getElementById("hist-section-wrap");

  if (chapters.length === 0) {
    if (wrap) wrap.style.display = "none";
    setGlobalView("form");
    return;
  }

  if (wrap) wrap.style.display = "block";
  if (!document.querySelector(".flow-step--active")) {
     setGlobalView("form");
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
  DOM.chapter.disabled = true;
  DOM.chapter.innerHTML = '<option value="" disabled selected>Select subject first</option>';

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

// ── Dynamic Chapter Loader ───────────────────
DOM.subject.addEventListener("change", () => {
  const classNum = DOM.classSelect.value;
  const subjectStr = DOM.subject.value;
  
  DOM.chapter.disabled = true;
  DOM.chapter.innerHTML = '<option value="" disabled selected>Select a chapter</option>';

  if (typeof CBSE_SYLLABUS !== "undefined" && CBSE_SYLLABUS[classNum]) {
    const chapters = CBSE_SYLLABUS[classNum][subjectStr] || [];
    chapters.forEach((ch) => {
      const opt = document.createElement("option");
      opt.value = ch;
      opt.textContent = ch;
      DOM.chapter.appendChild(opt);
    });
    if (chapters.length > 0) {
      DOM.chapter.disabled = false;
    }
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
  const topicEl = document.getElementById("topic-input");
  const topic = topicEl ? topicEl.value.trim() : "";

  if (!classNum) { showError("Please select a class."); return; }
  if (!subject) { showError("Please select a subject."); return; }
  if (!chapter) { showError("Please enter a chapter name."); return; }

  currentClassNum = classNum;
  currentSubject = subject;
  currentChapter = chapter;
  currentTopic = topic;
  window.currentClassNum = classNum;
  window.currentSubject = subject;
  window.currentChapter = chapter;
  window.currentTopic = topic;

  DOM.submitBtn.disabled = true;
  setGlobalView("loading");

  try {
    const res = await fetch("/api/generate-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classNum, subject, chapter, topic }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");

    DOM.outputBadge.textContent = `Class ${classNum}`;
    DOM.outputTitle.textContent = topic
      ? `${subject} — ${chapter} → ${topic}`
      : `${subject} — ${chapter}`;
    DOM.notesContent.innerHTML = renderMarkdown(data.notes);

    // Save to history
    if (typeof History !== "undefined") {
      History.save({
        classNum, subject, chapter,
        type: "summary",
        preview: data.notes.slice(0, 120),
      });
      History.saveContent(classNum, subject, chapter, "summary", DOM.notesContent.innerHTML);
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
if (DOM.newNotesBtn) DOM.newNotesBtn.addEventListener("click", resetToForm);

if (DOM.dashNewBtn) DOM.dashNewBtn.addEventListener("click", () => {
  setGlobalView("form");
  if (DOM.histSectionWrap) DOM.histSectionWrap.style.display = "none";
  // Clear previous selections for a fresh start
  DOM.classSelect.value = "";
  DOM.subject.innerHTML = '<option value="" disabled selected>Select class first</option>';
  DOM.subject.disabled = true;
  DOM.chapter.innerHTML = '<option value="" disabled selected>Select subject first</option>';
  DOM.chapter.disabled = true;
  currentClassNum = "";
  currentSubject = "";
  currentChapter = "";
  window.currentClassNum = "";
  window.currentSubject = "";
  window.currentChapter = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => DOM.classSelect.focus(), 300);
});

// Summary → Flashcards
if (DOM.flashcardBtn) {
  DOM.flashcardBtn.addEventListener("click", () => {
    if (currentClassNum && currentSubject && currentChapter) {
      Flashcards.start(currentClassNum, currentSubject, currentChapter);
    }
  });
}

// Flashcard Complete → Practice
if (DOM.fcPracticeBtn) {
  DOM.fcPracticeBtn.addEventListener("click", () => {
    if (currentClassNum && currentSubject && currentChapter) {
      Practice.start(currentClassNum, currentSubject, currentChapter);
    }
  });
}

// Practice Complete → Test
if (DOM.pqTestBtn) {
  DOM.pqTestBtn.addEventListener("click", () => {
    if (currentClassNum && currentSubject && currentChapter) {
      TestEngine.start(currentClassNum, currentSubject, currentChapter);
    }
  });
}

// ── On page load: render dashboard & handle landing ──
document.addEventListener("DOMContentLoaded", () => {
  renderDashboard();

  const landingView = document.getElementById("landing-view");
  const appView = document.getElementById("app-view");
  const heroBtn = document.getElementById("hero-start-btn");
  const footerBtn = document.getElementById("footer-start-btn");

  const startApp = () => {
    landingView.style.opacity = "0";
    landingView.style.transform = "translateY(-20px)";
    landingView.style.transition = "all 0.4s ease-out";
    
    setTimeout(() => {
      landingView.style.display = "none";
      
      const welcome = document.getElementById("welcome-intro");
      const appViewIsReady = () => {
        appView.classList.remove("hidden");
        appView.style.opacity = "0";
        appView.style.animation = "fadeUp 0.6s ease-out forwards";
        window.scrollTo(0, 0);
      };

      if (welcome) {
        // Show welcome overlay
        welcome.classList.remove("hidden");
        // Force reflow
        void welcome.offsetWidth;
        welcome.classList.add("is-active");
        
        // Wait 2 seconds, then fade out welcome and fade in app
        setTimeout(() => {
          welcome.classList.remove("is-active");
          
          setTimeout(() => {
            welcome.classList.add("hidden");
            appViewIsReady();
          }, 800); // Wait for fade out
        }, 2000);
      } else {
        appViewIsReady();
      }

    }, 400);
  };

  const ctaBtns = document.querySelectorAll(".lp-cta-btn, #hero-start-btn, #footer-start-btn");
  ctaBtns.forEach(btn => btn.addEventListener("click", startApp));

  // ── Retry Complete → Unlock ──────────────────
  const retryUnlockBtn = document.getElementById("retry-unlock-btn");
  if (retryUnlockBtn) {
    retryUnlockBtn.addEventListener("click", () => {
      // Show unlock stats
      const unlockStats = document.getElementById("unlock-stats");
      if (unlockStats) {
        unlockStats.innerHTML = `
          <div class="complete__stat complete__stat--green">
            <span class="complete__stat-num">✅</span>
            <span class="complete__stat-label">Notes Done</span>
          </div>
          <div class="complete__stat complete__stat--blue">
            <span class="complete__stat-num">✅</span>
            <span class="complete__stat-label">Tested</span>
          </div>
          <div class="complete__stat complete__stat--amber">
            <span class="complete__stat-num">✅</span>
            <span class="complete__stat-label">Mistakes Fixed</span>
          </div>
        `;
      }
      setGlobalView("unlock");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ── Unlock → Mind Map ────────────────────────
  const unlockMindmapBtn = document.getElementById("unlock-mindmap-btn");
  if (unlockMindmapBtn) {
    unlockMindmapBtn.addEventListener("click", () => {
      if (typeof MindMap !== "undefined" && currentClassNum && currentSubject && currentChapter) {
        MindMap.generate(currentClassNum, currentSubject, currentChapter);
      }
    });
  }

  // ── Mind Map → Audio Book ────────────────────
  const mindmapContinueBtn = document.getElementById("mindmap-continue-btn");
  if (mindmapContinueBtn) {
    mindmapContinueBtn.addEventListener("click", () => {
      setGlobalView("audiobook");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ── Audio Book → AI Video ────────────────────
  const audiobookContinueBtn = document.getElementById("audiobook-continue-btn");
  if (audiobookContinueBtn) {
    audiobookContinueBtn.addEventListener("click", () => {
      setGlobalView("aivideo");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ── AI Video → Song ──────────────────────────
  const aivideoContinueBtn = document.getElementById("aivideo-continue-btn");
  if (aivideoContinueBtn) {
    aivideoContinueBtn.addEventListener("click", () => {
      setGlobalView("song");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ── Song Complete → Exam Arena ────────────────
  const songCompleteBtn = document.getElementById("song-complete-btn");
  if (songCompleteBtn) {
    songCompleteBtn.addEventListener("click", () => {
      if (typeof ExamArena !== "undefined" && window.currentClassNum && window.currentSubject && window.currentChapter) {
        ExamArena.startArena(window.currentClassNum, window.currentSubject, window.currentChapter);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        resetToForm();
      }
    });
  }

  // ── Chapter Completion Screen ──────────────────
  const ccNextBtn = document.getElementById("cc-next-chapter-btn");
  if (ccNextBtn) {
    ccNextBtn.addEventListener("click", () => {
      resetToForm();
    });
  }

  const ccReviseBtn = document.getElementById("cc-revise-btn");
  if (ccReviseBtn) {
    ccReviseBtn.addEventListener("click", () => {
      // Check if notes content still exists; if so, show it
      const notesEl = document.getElementById("notes-content");
      if (notesEl && notesEl.innerHTML.trim()) {
        setGlobalView("output");
      } else {
        // Notes were cleared — go back to form to regenerate
        setGlobalView("form");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ── Review section buttons ────────────────────
  const reviewCloseBtn = document.getElementById("review-close-btn");
  if (reviewCloseBtn) {
    reviewCloseBtn.addEventListener("click", () => {
      setGlobalView("form");
      renderDashboard();
    });
  }

  const reviewPracticeBtn = document.getElementById("review-practice-btn");
  if (reviewPracticeBtn) {
    reviewPracticeBtn.addEventListener("click", () => {
      if (window.currentClassNum && window.currentSubject && window.currentChapter) {
        Practice.start(window.currentClassNum, window.currentSubject, window.currentChapter);
      }
    });
  }

  const reviewReviseBtn = document.getElementById("review-revise-btn");
  if (reviewReviseBtn) {
    reviewReviseBtn.addEventListener("click", () => {
      setGlobalView("audiobook");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ── Auth state listener — sync history on login / wipe on logout ──
  if (typeof Auth !== "undefined") {
    Auth.onAuthChange(async (user) => {
      if (user) {
        // User just logged in — sync from cloud into user-scoped localStorage
        await History.syncFromCloud();
        renderDashboard();
        console.log(`✅ Signed in as ${user.email || user.user_metadata?.full_name || "user"}`);
      } else {
        // User logged out — wipe their local data, show guest dashboard
        if (typeof History !== "undefined") History.wipeLocal();
        renderDashboard();
        console.log("👋 Signed out — local history cleared");
      }
    });
  }
});
