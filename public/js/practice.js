// ══════════════════════════════════════════════
// NotesGPT — Practice Engine
// ══════════════════════════════════════════════

const Practice = (() => {
  // ── State ──────────────────────────────────
  let questions = [];
  let currentIndex = 0;
  let attempted = 0;
  let solutionsViewed = 0;
  let sessionClass = "";
  let sessionSubject = "";
  let sessionChapter = "";

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("practice-section");
    els.loading = document.getElementById("practice-loading");
    els.complete = document.getElementById("practice-complete");
    els.progressFill = document.getElementById("pq-progress-fill");
    els.progressText = document.getElementById("pq-progress-text");
    els.type = document.getElementById("pq-type");
    els.diff = document.getElementById("pq-diff");
    els.text = document.getElementById("pq-text");
    els.actions = document.getElementById("pq-actions");
    els.showSolutionBtn = document.getElementById("pq-show-solution-btn");
    els.attemptBtn = document.getElementById("pq-attempt-btn");
    els.attempt = document.getElementById("pq-attempt");
    els.attemptInput = document.getElementById("pq-attempt-input");
    els.submitAttemptBtn = document.getElementById("pq-submit-attempt-btn");
    els.solution = document.getElementById("pq-solution");
    els.solutionSteps = document.getElementById("pq-solution-steps");
    els.finalAnswer = document.getElementById("pq-final-answer");
    els.marksTip = document.getElementById("pq-marks-tip");
    els.nextBtn = document.getElementById("pq-next-btn");
    els.practiceStats = document.getElementById("practice-stats");

  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();

    if (els.showSolutionBtn) els.showSolutionBtn.addEventListener("click", showSolution);
    if (els.attemptBtn) els.attemptBtn.addEventListener("click", showAttemptMode);
    if (els.submitAttemptBtn) els.submitAttemptBtn.addEventListener("click", () => {
      attempted++;
      showSolution();
    });
    if (els.nextBtn) els.nextBtn.addEventListener("click", nextQuestion);

  }

  // ── Start practice ─────────────────────────
  async function start(classNum, subject, chapter) {
    sessionClass = classNum;
    sessionSubject = subject;
    sessionChapter = chapter;
    setGlobalView("practice-loading");

    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate questions.");

      questions = data.questions;
      currentIndex = 0;
      attempted = 0;
      solutionsViewed = 0;

      setGlobalView("practice");
      showQuestion();
    } catch (err) {
      setGlobalView("flashcard-complete");
      alert(err.message);
    }
  }

  // ── Show current question ──────────────────
  function showQuestion() {
    if (currentIndex >= questions.length) {
      showComplete();
      return;
    }

    const q = questions[currentIndex];

    // Progress
    const pct = Math.round(((currentIndex) / questions.length) * 100);
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = `Question ${currentIndex + 1} / ${questions.length}`;

    // Type badge
    const typeLabels = { mcq: "MCQ", short: "Short Answer", long: "Long Answer", case: "Case Study" };
    els.type.textContent = typeLabels[q.type] || "Question";
    els.type.className = `pq-question__type pq-question__type--${q.type}`;

    // Difficulty
    const diffLabels = { easy: "⚡ Easy", medium: "🔶 Medium", hard: "🔴 Hard" };
    els.diff.textContent = diffLabels[q.difficulty] || "🔶 Medium";
    els.diff.className = `pq-question__diff pq-question__diff--${q.difficulty}`;

    // Question text
    els.text.textContent = q.question;

    // Reset state
    els.actions.classList.remove("hidden");
    els.attempt.classList.add("hidden");
    els.solution.classList.add("hidden");
    els.attemptInput.value = "";

    // Animate in
    els.section.querySelector(".pq-question").classList.add("pq-question--enter");
    setTimeout(() => {
      els.section.querySelector(".pq-question").classList.remove("pq-question--enter");
    }, 300);

    window.scrollTo({ top: els.section.offsetTop - 20, behavior: "smooth" });
  }

  // ── Show attempt mode ──────────────────────
  function showAttemptMode() {
    els.actions.classList.add("hidden");
    els.attempt.classList.remove("hidden");
    els.attemptInput.focus();
  }

  // ── Show solution ──────────────────────────
  function showSolution() {
    const q = questions[currentIndex];
    solutionsViewed++;

    // Hide action buttons and attempt
    els.actions.classList.add("hidden");
    els.attempt.classList.add("hidden");

    // Populate solution
    els.solutionSteps.innerHTML = q.solution_steps
      .map((step) => `<li>${step}</li>`)
      .join("");

    els.finalAnswer.textContent = q.final_answer;

    if (q.marks_tip) {
      els.marksTip.innerHTML = `<span class="pq-solution__tip-icon">💡</span> <strong>Marks Tip:</strong> ${q.marks_tip}`;
      els.marksTip.classList.remove("hidden");
    } else {
      els.marksTip.classList.add("hidden");
    }

    // Update next button text
    if (currentIndex >= questions.length - 1) {
      els.nextBtn.textContent = "Finish Practice ✅";
    } else {
      els.nextBtn.textContent = "Next Question →";
    }

    // Show solution panel
    els.solution.classList.remove("hidden");
    els.solution.classList.add("pq-solution--enter");
    setTimeout(() => els.solution.classList.remove("pq-solution--enter"), 300);
  }

  // ── Next question ──────────────────────────
  function nextQuestion() {
    currentIndex++;
    showQuestion();
  }

  // ── Show completion ────────────────────────
  function showComplete() {
    els.practiceStats.innerHTML = `
      <div class="complete__stat complete__stat--blue">
        <span class="complete__stat-num">${questions.length}</span>
        <span class="complete__stat-label">Questions</span>
      </div>
      <div class="complete__stat complete__stat--green">
        <span class="complete__stat-num">${attempted}</span>
        <span class="complete__stat-label">Attempted</span>
      </div>
      <div class="complete__stat complete__stat--amber">
        <span class="complete__stat-num">${solutionsViewed}</span>
        <span class="complete__stat-label">Solutions</span>
      </div>
    `;

    setGlobalView("practice-complete");

    // Save to tracker
    if (typeof Tracker !== "undefined") {
      Tracker.savePractice(sessionClass, sessionSubject, sessionChapter, attempted, questions.length, solutionsViewed);
    }
  }

  return { init, start };
})();

document.addEventListener("DOMContentLoaded", () => Practice.init());
