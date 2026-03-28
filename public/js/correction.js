// ══════════════════════════════════════════════
// NotesGPT — Correction & Reinforcement Engine
// ══════════════════════════════════════════════

const Correction = (() => {
  // ── State ──────────────────────────────────
  let mistakes = [];       // { question, userAnswer, correctAnswer, keyPoints, feedback, marks, totalMarks }
  let currentMistake = 0;
  let retryQuestions = [];
  let currentRetry = 0;
  let retryAttempted = 0;
  let sessionClass = "";
  let sessionSubject = "";
  let sessionChapter = "";

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.correctionSection = document.getElementById("correction-section");
    els.corrMistakeNum = document.getElementById("corr-mistake-num");
    els.corrTotal = document.getElementById("corr-total");
    els.corrQuestion = document.getElementById("corr-question");
    els.corrStudentAns = document.getElementById("corr-student-ans");
    els.corrCorrectAns = document.getElementById("corr-correct-ans");
    els.corrKeyPoints = document.getElementById("corr-key-points");
    els.corrFeedback = document.getElementById("corr-feedback");
    els.corrNextBtn = document.getElementById("corr-next-btn");
    els.retryLoading = document.getElementById("retry-loading");
    els.retrySection = document.getElementById("retry-section");
    els.retryProgressText = document.getElementById("retry-progress-text");
    els.retryQuestion = document.getElementById("retry-q-text");
    els.retryAttempt = document.getElementById("retry-attempt");
    els.retryInput = document.getElementById("retry-input");
    els.retrySubmitBtn = document.getElementById("retry-submit-btn");
    els.retrySolution = document.getElementById("retry-solution");
    els.retrySteps = document.getElementById("retry-steps");
    els.retryAnswer = document.getElementById("retry-answer");
    els.retryNextBtn = document.getElementById("retry-next-btn");
    els.retryComplete = document.getElementById("retry-complete");
    els.retryStats = document.getElementById("retry-stats");
    els.retryDashBtn = document.getElementById("retry-dash-btn");
    els.retryNewBtn = document.getElementById("retry-new-btn");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();

    els.corrNextBtn.addEventListener("click", nextMistake);
    els.retrySubmitBtn.addEventListener("click", () => {
      retryAttempted++;
      showRetrySolution();
    });
    els.retryNextBtn.addEventListener("click", nextRetry);
    els.retryDashBtn.addEventListener("click", () => {
      if (typeof resetToForm === "function") resetToForm();
    });
    els.retryNewBtn.addEventListener("click", () => {
      if (typeof resetToForm === "function") resetToForm();
    });
  }

  // ── Start correction flow ──────────────────
  function start(classNum, subject, chapter, testQuestions, testResults, userAnswers) {
    sessionClass = classNum;
    sessionSubject = subject;
    sessionChapter = chapter;

    // Extract mistakes (where marks < total)
    mistakes = [];
    testQuestions.forEach((q, i) => {
      const r = testResults[i];
      if (r.marks_awarded < r.total_marks) {
        mistakes.push({
          question: q.question,
          type: q.type,
          userAnswer: userAnswers[i] || "(No answer)",
          correctAnswer: q.answer,
          keyPoints: q.key_points || [],
          feedback: r.feedback,
          tip: r.improvement_tip,
          marks: r.marks_awarded,
          totalMarks: r.total_marks,
        });
      }
    });

    if (mistakes.length === 0) {
      // No mistakes — skip to dashboard
      if (typeof resetToForm === "function") resetToForm();
      return;
    }

    currentMistake = 0;
    setGlobalView("correction");
    showMistake();
  }

  // ── Show current mistake ───────────────────
  function showMistake() {
    const m = mistakes[currentMistake];

    els.corrMistakeNum.textContent = currentMistake + 1;
    els.corrTotal.textContent = mistakes.length;
    els.corrQuestion.textContent = m.question;
    els.corrStudentAns.textContent = m.userAnswer;
    els.corrCorrectAns.textContent = m.correctAnswer;

    // Key points
    if (m.keyPoints.length > 0) {
      els.corrKeyPoints.innerHTML = m.keyPoints.map(kp => `<li>${kp}</li>`).join("");
      els.corrKeyPoints.parentElement.classList.remove("hidden");
    } else {
      els.corrKeyPoints.parentElement.classList.add("hidden");
    }

    // Feedback
    els.corrFeedback.textContent = m.feedback || m.tip || "";

    // Button text
    if (currentMistake >= mistakes.length - 1) {
      els.corrNextBtn.textContent = "🔄 Retry Similar Questions →";
    } else {
      els.corrNextBtn.textContent = `Next Mistake (${currentMistake + 2}/${mistakes.length}) →`;
    }

    // Animate
    els.correctionSection.querySelector(".corr-card").classList.add("pq-question--enter");
    setTimeout(() => {
      els.correctionSection.querySelector(".corr-card").classList.remove("pq-question--enter");
    }, 300);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Next mistake / start retry ─────────────
  function nextMistake() {
    currentMistake++;
    if (currentMistake >= mistakes.length) {
      startRetryFlow();
    } else {
      showMistake();
    }
  }

  // ── Start retry questions ──────────────────
  async function startRetryFlow() {
    setGlobalView("retry-loading");

    // Extract weak topics from mistakes
    const weakTopics = mistakes.map(m => {
      const words = m.question.split(/\s+/).slice(0, 10).join(" ");
      return words;
    }).slice(0, 3);

    try {
      const res = await fetch("/api/generate-retry-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: sessionClass,
          subject: sessionSubject,
          chapter: sessionChapter,
          weakTopics,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate retry questions.");

      retryQuestions = data.questions;
      currentRetry = 0;
      retryAttempted = 0;

      setGlobalView("retry");
      showRetryQuestion();
    } catch (err) {
      // Fallback: go to completion
      showRetryComplete();
    }
  }

  // ── Show retry question ────────────────────
  function showRetryQuestion() {
    if (currentRetry >= retryQuestions.length) {
      showRetryComplete();
      return;
    }

    const q = retryQuestions[currentRetry];

    els.retryProgressText.textContent = `Retry ${currentRetry + 1} / ${retryQuestions.length}`;
    els.retryQuestion.textContent = q.question;

    // Reset state
    els.retryAttempt.classList.remove("hidden");
    els.retrySolution.classList.add("hidden");
    els.retryInput.value = "";
    els.retryInput.focus();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Show retry solution ────────────────────
  function showRetrySolution() {
    const q = retryQuestions[currentRetry];

    els.retryAttempt.classList.add("hidden");
    els.retrySolution.classList.remove("hidden");

    els.retrySteps.innerHTML = q.solution_steps.map(s => `<li>${s}</li>`).join("");
    els.retryAnswer.textContent = q.final_answer;

    if (currentRetry >= retryQuestions.length - 1) {
      els.retryNextBtn.textContent = "Finish Correction ✅";
    } else {
      els.retryNextBtn.textContent = "Next Retry →";
    }

    els.retrySolution.classList.add("pq-solution--enter");
    setTimeout(() => els.retrySolution.classList.remove("pq-solution--enter"), 300);
  }

  // ── Next retry ─────────────────────────────
  function nextRetry() {
    currentRetry++;
    showRetryQuestion();
  }

  // ── Show retry complete ────────────────────
  function showRetryComplete() {
    els.retryStats.innerHTML = `
      <div class="complete__stat complete__stat--red">
        <span class="complete__stat-num">${mistakes.length}</span>
        <span class="complete__stat-label">Mistakes Fixed</span>
      </div>
      <div class="complete__stat complete__stat--green">
        <span class="complete__stat-num">${retryAttempted}</span>
        <span class="complete__stat-label">Retries Done</span>
      </div>
      <div class="complete__stat complete__stat--blue">
        <span class="complete__stat-num">${retryQuestions.length}</span>
        <span class="complete__stat-label">Extra Practice</span>
      </div>
    `;

    setGlobalView("retry-complete");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return { init, start };
})();

document.addEventListener("DOMContentLoaded", () => Correction.init());
