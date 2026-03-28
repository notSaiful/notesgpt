// ══════════════════════════════════════════════
// NotesGPT — Doubt Solver
// ══════════════════════════════════════════════

const DoubtSolver = (() => {
  // ── State ──────────────────────────────────
  let isOpen = false;
  let lastQuestion = "";
  let currentStep = "summary";

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.fab = document.getElementById("doubt-fab");
    els.overlay = document.getElementById("doubt-overlay");
    els.modal = document.getElementById("doubt-modal");
    els.closeBtn = document.getElementById("doubt-close");
    els.input = document.getElementById("doubt-input");
    els.askBtn = document.getElementById("doubt-ask-btn");
    els.loading = document.getElementById("doubt-loading");
    els.response = document.getElementById("doubt-response");
    els.responseBody = document.getElementById("doubt-response-body");
    els.followBtns = document.getElementById("doubt-follow-btns");
    els.confusedBtn = document.getElementById("doubt-confused-btn");
    els.exampleBtn = document.getElementById("doubt-example-btn");
    els.hint = document.getElementById("doubt-hint");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();

    els.fab.addEventListener("click", open);
    els.closeBtn.addEventListener("click", close);
    els.overlay.addEventListener("click", (e) => {
      if (e.target === els.overlay) close();
    });

    els.askBtn.addEventListener("click", askDoubt);
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askDoubt(); }
    });

    els.confusedBtn.addEventListener("click", () => askFollowUp(true));
    els.exampleBtn.addEventListener("click", () => askFollowUp(false));

    // Video help from doubt solver
    const videoBtn = document.getElementById("doubt-video-btn");
    if (videoBtn) {
      videoBtn.addEventListener("click", () => {
        close();
        if (typeof VideoHelp !== "undefined") {
          VideoHelp.show(lastQuestion || window.currentChapter || "");
        }
      });
    }

    // Track which step is active
    const origSetView = window.setGlobalView;
    window.setGlobalView = function (view) {
      origSetView(view);
      updateFabVisibility(view);
      updateContextStep(view);
    };
  }

  // ── Show/hide FAB based on current view ────
  function updateFabVisibility(view) {
    const showOn = [
      "output", "flashcards", "practice", "test",
      "correction", "retry",
    ];
    if (showOn.includes(view)) {
      els.fab.classList.remove("hidden");
    } else {
      els.fab.classList.add("hidden");
    }
  }

  function updateContextStep(view) {
    if (view === "flashcards") currentStep = "flashcards";
    else if (view === "practice") currentStep = "practice";
    else if (view === "test") currentStep = "test";
    else if (view === "correction" || view === "retry") currentStep = "correction";
    else currentStep = "summary";
  }

  // ── Open / Close modal ─────────────────────
  function open() {
    isOpen = true;
    els.overlay.classList.remove("hidden");
    els.overlay.classList.add("doubt-overlay--active");
    els.input.focus();
    // Reset state
    els.loading.classList.add("hidden");
    els.response.classList.add("hidden");
    els.followBtns.classList.add("hidden");
    els.hint.classList.remove("hidden");
    if (!lastQuestion) els.input.value = "";
  }

  function close() {
    isOpen = false;
    els.overlay.classList.remove("doubt-overlay--active");
    setTimeout(() => {
      if (!isOpen) els.overlay.classList.add("hidden");
    }, 250);
  }

  // ── Ask doubt ──────────────────────────────
  async function askDoubt() {
    const question = els.input.value.trim();
    if (!question) { els.input.focus(); return; }

    lastQuestion = question;
    els.hint.classList.add("hidden");
    els.response.classList.add("hidden");
    els.followBtns.classList.add("hidden");
    els.loading.classList.remove("hidden");

    try {
      const res = await fetch("/api/solve-doubt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum || "10",
          subject: window.currentSubject || "",
          chapter: window.currentChapter || "",
          question,
          contextStep: currentStep,
          followUp: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get answer.");

      showResponse(data.answer);
    } catch (err) {
      showResponse("❌ " + err.message);
    }
  }

  // ── Follow-up ──────────────────────────────
  async function askFollowUp(stillConfused) {
    const question = stillConfused
      ? lastQuestion + " (Explain more simply with a different approach)"
      : lastQuestion + " (Give me a different example)";

    els.response.classList.add("hidden");
    els.followBtns.classList.add("hidden");
    els.loading.classList.remove("hidden");

    try {
      const res = await fetch("/api/solve-doubt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum || "10",
          subject: window.currentSubject || "",
          chapter: window.currentChapter || "",
          question,
          contextStep: currentStep,
          followUp: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");

      showResponse(data.answer);
    } catch (err) {
      showResponse("❌ " + err.message);
    }
  }

  // ── Show response ──────────────────────────
  function showResponse(text) {
    els.loading.classList.add("hidden");

    // Convert the structured text to HTML
    let html = text
      .replace(/📌\s*EXPLANATION:?/gi, '<div class="doubt-section"><span class="doubt-section__icon">📌</span><span class="doubt-section__title">Explanation</span></div><div class="doubt-section__body">')
      .replace(/📊\s*STEPS?\s*\(?if applicable\)?:?/gi, '</div><div class="doubt-section"><span class="doubt-section__icon">📊</span><span class="doubt-section__title">Steps</span></div><div class="doubt-section__body">')
      .replace(/🧠\s*KEY CONCEPT:?/gi, '</div><div class="doubt-section"><span class="doubt-section__icon">🧠</span><span class="doubt-section__title">Key Concept</span></div><div class="doubt-section__body doubt-section__body--key">')
      .replace(/🎯\s*EXAM TIP:?/gi, '</div><div class="doubt-section"><span class="doubt-section__icon">🎯</span><span class="doubt-section__title">Exam Tip</span></div><div class="doubt-section__body doubt-section__body--tip">');

    // Close the last div
    html += "</div>";

    // Clean up empty divs
    html = html.replace(/<div class="doubt-section__body"><\/div>/g, "");

    // If no sections were created, wrap in a simple paragraph
    if (!html.includes("doubt-section")) {
      html = `<div class="doubt-section__body">${text.replace(/\n/g, "<br>")}</div>`;
    }

    els.responseBody.innerHTML = html;
    els.response.classList.remove("hidden");
    els.followBtns.classList.remove("hidden");

    // Scroll response into view
    els.response.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => DoubtSolver.init());
