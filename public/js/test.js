// ══════════════════════════════════════════════
// NotesGPT — Test Engine
// ══════════════════════════════════════════════

const TestEngine = (() => {
  // ── State ──────────────────────────────────
  let questions = [];
  let userAnswers = [];
  let currentIndex = 0;
  let totalMarks = 0;
  let results = null;
  let sessionClass = "";
  let sessionSubject = "";
  let sessionChapter = "";

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("test-section");
    els.loading = document.getElementById("test-loading");
    els.evalLoading = document.getElementById("test-eval-loading");
    els.results = document.getElementById("test-results");
    els.progressFill = document.getElementById("test-progress-fill");
    els.progressText = document.getElementById("test-progress-text");
    els.marksInfo = document.getElementById("test-marks-info");
    els.type = document.getElementById("test-q-type");
    els.text = document.getElementById("test-q-text");
    els.answerInput = document.getElementById("test-answer-input");
    els.nextBtn = document.getElementById("test-next-btn");
    els.scoreBig = document.getElementById("test-score-big");
    els.scoreTotal = document.getElementById("test-score-total");
    els.accuracy = document.getElementById("test-accuracy");
    els.accuracyBar = document.getElementById("test-accuracy-bar");
    els.breakdown = document.getElementById("test-breakdown");
    els.weakAreas = document.getElementById("test-weak-areas");

    els.retryBtn = document.getElementById("test-retry-btn");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();

    if (els.nextBtn) els.nextBtn.addEventListener("click", nextQuestion);

    if (els.retryBtn) {
      els.retryBtn.addEventListener("click", () => {
        setGlobalView("output");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // Fix mistakes button — starts the Correction flow
    const fixBtn = document.getElementById("test-fix-btn");
    if (fixBtn) {
      fixBtn.addEventListener("click", () => {
        if (typeof Correction !== "undefined" && results) {
          Correction.start(sessionClass, sessionSubject, sessionChapter, questions, results, userAnswers);
        }
      });
    }
  }

  // ── Start test ─────────────────────────────
  async function start(classNum, subject, chapter) {
    sessionClass = classNum;
    sessionSubject = subject;
    sessionChapter = chapter;
    setGlobalView("test-loading");

    try {
      const res = await fetch("/api/generate-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate test.");

      questions = data.questions;
      totalMarks = data.totalMarks;
      userAnswers = new Array(questions.length).fill("");
      currentIndex = 0;
      results = null;

      setGlobalView("test");
      showQuestion();
    } catch (err) {
      setGlobalView("practice-complete");
      alert(err.message);
    }
  }

  // ── Show current question ──────────────────
  function showQuestion() {
    if (currentIndex >= questions.length) {
      submitTest();
      return;
    }

    const q = questions[currentIndex];

    // Progress
    const pct = Math.round((currentIndex / questions.length) * 100);
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = `Question ${currentIndex + 1} / ${questions.length}`;
    els.marksInfo.textContent = `${q.marks} mark${q.marks > 1 ? "s" : ""}`;

    // Type badge
    const typeLabels = { mcq: "MCQ", short: "Short Answer", long: "Long Answer" };
    els.type.textContent = typeLabels[q.type] || "Question";
    els.type.className = `test-q__type test-q__type--${q.type}`;

    // Question text
    els.text.textContent = q.question;

    // Set textarea rows based on type
    els.answerInput.rows = q.type === "long" ? 6 : q.type === "short" ? 3 : 2;
    els.answerInput.value = userAnswers[currentIndex] || "";
    els.answerInput.placeholder = q.type === "mcq"
      ? "Type the correct option (e.g., B)"
      : "Type your answer here…";

    // Button text
    if (currentIndex >= questions.length - 1) {
      els.nextBtn.textContent = "Submit Test 📄";
      els.nextBtn.className = "btn btn--accent test-next-btn";
    } else {
      els.nextBtn.textContent = "Next Question →";
      els.nextBtn.className = "btn btn--primary test-next-btn";
    }

    // Animate
    const qCard = els.section.querySelector(".test-q");
    qCard.classList.add("pq-question--enter");
    setTimeout(() => qCard.classList.remove("pq-question--enter"), 300);

    els.answerInput.focus();
    window.scrollTo({ top: els.section.offsetTop - 20, behavior: "smooth" });
  }

  // ── Next question / save answer ────────────
  function nextQuestion() {
    userAnswers[currentIndex] = els.answerInput.value.trim();
    currentIndex++;
    showQuestion();
  }

  // ── Submit test for evaluation ─────────────
  async function submitTest() {
    setGlobalView("test-eval-loading");

    try {
      const res = await fetch("/api/evaluate-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum,
          questions,
          userAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to evaluate test.");

      results = data.results;
      showResults(data.totalAwarded, data.totalMax);
    } catch (err) {
      setGlobalView("test");
      currentIndex = questions.length - 1;
      showQuestion();
      alert("Evaluation failed: " + err.message);
    }
  }

  // ── Show results ───────────────────────────
  function showResults(awarded, max) {
    const pct = Math.round((awarded / max) * 100);

    // Score
    els.scoreBig.textContent = awarded;
    els.scoreTotal.textContent = `/ ${max}`;

    // Accuracy
    els.accuracy.textContent = `${pct}%`;
    els.accuracyBar.style.width = `${pct}%`;

    // Color based on score
    let color = "var(--success)";
    if (pct < 40) color = "var(--error)";
    else if (pct < 70) color = "var(--warning)";
    els.scoreBig.style.color = color;
    els.accuracy.style.color = color;
    els.accuracyBar.style.background = `linear-gradient(90deg, ${color}, ${color})`;

    // Per-question breakdown
    els.breakdown.innerHTML = results.map((r, i) => {
      const q = questions[i];
      const typeLabels = { mcq: "MCQ", short: "Short", long: "Long", case: "Case" };
      const isGood = r.marks_awarded >= r.total_marks * 0.7;
      const isPoor = r.marks_awarded < r.total_marks * 0.4;
      const statusClass = isGood ? "good" : isPoor ? "poor" : "partial";
      const statusIcon = r.marks_awarded >= r.total_marks ? "✅" : r.marks_awarded === 0 ? "❌" : "🟡";
      const studentAnswer = userAnswers[i] || "(no answer)";

      return `
        <div class="test-result-card test-result-card--${statusClass}">
          <div class="test-result-card__header">
            <span class="test-result-card__num">${statusIcon} Q${i + 1}</span>
            <span class="test-result-card__type">${typeLabels[q.type] || "Q"}</span>
            <span class="test-result-card__score">${r.marks_awarded}/${r.total_marks}</span>
          </div>
          <p class="test-result-card__q"><strong>Question:</strong> ${q.question}</p>
          <div class="test-result-card__answers">
            <p class="test-result-card__student-ans"><strong>Your answer:</strong> <span style="color:${isPoor ? 'var(--error, #e74c3c)' : isGood ? 'var(--success, #27ae60)' : 'var(--warning, #f39c12)'}">${studentAnswer}</span></p>
            ${r.correct_answer ? `<p class="test-result-card__correct-ans"><strong>✅ Correct answer:</strong> <span style="color:var(--success, #27ae60)">${r.correct_answer}</span></p>` : ""}
          </div>
          <p class="test-result-card__feedback"><strong>Feedback:</strong> ${r.feedback}</p>
          ${r.improvement_tip ? `<p class="test-result-card__tip">💡 <strong>Tip:</strong> ${r.improvement_tip}</p>` : ""}
        </div>
      `;
    }).join("");

    // Weak areas
    const weak = results
      .map((r, i) => ({ ...r, idx: i, q: questions[i] }))
      .filter((r) => r.marks_awarded < r.total_marks * 0.5)
      .map((r) => `<li>${r.q.question.slice(0, 80)}… <span class="weak-score">(${r.marks_awarded}/${r.total_marks})</span></li>`);

    if (weak.length > 0) {
      els.weakAreas.innerHTML = `
        <h3 class="test-weak__title">📉 Areas to Improve</h3>
        <ul class="test-weak__list">${weak.join("")}</ul>
        <p class="test-weak__suggestion">💡 Re-read the summary, review flashcards, and practice these topics again.</p>
      `;
    } else {
      els.weakAreas.innerHTML = `<p class="test-weak__great">🎉 Great job! No significant weak areas found.</p>`;
    }

    setGlobalView("test-results");
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Save to tracker
    if (typeof Tracker !== "undefined") {
      Tracker.saveTest(sessionClass, sessionSubject, sessionChapter, awarded, max, results);
    }
  }

  return { init, start, getState: () => ({ questions, results, userAnswers, sessionClass, sessionSubject, sessionChapter }) };
})();

document.addEventListener("DOMContentLoaded", () => TestEngine.init());
