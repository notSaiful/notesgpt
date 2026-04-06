// ══════════════════════════════════════════════
// NotesGPT — Flashcard Engine
// ══════════════════════════════════════════════

const Flashcards = (() => {
  // ── State ──────────────────────────────────
  let cards = [];
  let queue = [];           // indices to show (includes repeats)
  let queuePos = 0;         // position in queue
  let results = {};         // cardIndex -> 'knew' | 'partial' | 'didnt'
  let knownSet = new Set(); // cards marked as known at least once
  let totalCards = 0;
  let sessionClass = "";
  let sessionSubject = "";
  let sessionChapter = "";


  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("flashcard-section");
    els.loading = document.getElementById("flashcard-loading");
    els.complete = document.getElementById("flashcard-complete");
    els.progressFill = document.getElementById("fc-progress-fill");
    els.progressText = document.getElementById("fc-progress-text");
    els.card = document.getElementById("fc-card");
    els.cardType = document.getElementById("fc-card-type");
    els.cardQuestion = document.getElementById("fc-card-question");
    els.cardDivider = document.getElementById("fc-card-divider");
    els.cardAnswer = document.getElementById("fc-card-answer");
    els.showBtn = document.getElementById("fc-show-btn");
    els.rating = document.getElementById("fc-rating");
    els.rateNo = document.getElementById("fc-rate-no");
    els.ratePartial = document.getElementById("fc-rate-partial");
    els.rateYes = document.getElementById("fc-rate-yes");
    els.completeStats = document.getElementById("complete-stats");

  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();

    if (els.showBtn) els.showBtn.addEventListener("click", revealAnswer);
    if (els.rateNo) els.rateNo.addEventListener("click", () => rateCard("didnt"));
    if (els.ratePartial) els.ratePartial.addEventListener("click", () => rateCard("partial"));
    if (els.rateYes) els.rateYes.addEventListener("click", () => rateCard("knew"));

  }

  // ── Start flashcards ──────────────────────
  async function start(classNum, subject, chapter) {
    sessionClass = classNum;
    sessionSubject = subject;
    sessionChapter = chapter;
    setGlobalView("flashcard-loading");

    try {
      const res = await fetch("/api/generate-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate flashcards.");

      cards = data.flashcards;
      totalCards = cards.length;
      queue = cards.map((_, i) => i);
      queuePos = 0;
      results = {};
      knownSet = new Set();

      // Save flashcard data for resume/review
      if (typeof History !== "undefined") {
        History.saveContent(sessionClass, sessionSubject, sessionChapter, "flashcards", cards);
      }

      setGlobalView("flashcards");
      showCard();
    } catch (err) {
      // Go back to notes output with error
      setGlobalView("output");
      alert(err.message);
    }
  }

  // ── Show current card ─────────────────────
  function showCard() {
    if (queuePos >= queue.length) {
      // Check if all done
      if (knownSet.size >= totalCards) {
        showComplete();
        return;
      }
      // Shouldn't happen, but safety
      showComplete();
      return;
    }

    const idx = queue[queuePos];
    const card = cards[idx];

    // Update progress
    const pct = Math.round((knownSet.size / totalCards) * 100);
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = `Card ${queuePos + 1} / ${queue.length}  •  ${knownSet.size}/${totalCards} mastered`;

    // Type badge
    const typeLabels = { definition: "📖 Definition", formula: "📐 Formula", concept: "💡 Concept" };
    els.cardType.textContent = typeLabels[card.type] || "💡 Concept";

    // Show question, hide answer
    els.cardQuestion.textContent = card.question;
    els.cardAnswer.textContent = card.answer;
    els.cardDivider.classList.add("hidden");
    els.cardAnswer.classList.add("hidden");
    els.showBtn.classList.remove("hidden");
    els.rating.classList.add("hidden");

    // Animate card in
    els.card.classList.remove("fc-card--flip");
    void els.card.offsetWidth; // force reflow
    els.card.classList.add("fc-card--enter");
    setTimeout(() => els.card.classList.remove("fc-card--enter"), 300);
  }

  // ── Reveal answer ─────────────────────────
  function revealAnswer() {
    els.cardDivider.classList.remove("hidden");
    els.cardAnswer.classList.remove("hidden");
    els.showBtn.classList.add("hidden");
    els.rating.classList.remove("hidden");

    // Animate
    els.card.classList.add("fc-card--flip");
    els.cardAnswer.classList.add("fc-answer--enter");
    setTimeout(() => els.cardAnswer.classList.remove("fc-answer--enter"), 300);
  }

  // ── Rate card ─────────────────────────────
  function rateCard(rating) {
    const idx = queue[queuePos];
    results[idx] = rating;

    if (rating === "knew") {
      knownSet.add(idx);
    } else if (rating === "didnt") {
      // Re-insert after 3 cards
      const insertAt = Math.min(queuePos + 4, queue.length);
      queue.splice(insertAt, 0, idx);
    } else if (rating === "partial") {
      // Re-insert after 7 cards
      const insertAt = Math.min(queuePos + 8, queue.length);
      queue.splice(insertAt, 0, idx);
    }

    queuePos++;
    showCard();
  }

  // ── Show completion ───────────────────────
  function showComplete() {
    // Count stats
    let knew = 0, partial = 0, didnt = 0;
    Object.values(results).forEach((r) => {
      if (r === "knew") knew++;
      else if (r === "partial") partial++;
      else didnt++;
    });

    els.completeStats.innerHTML = `
      <div class="complete__stat complete__stat--green">
        <span class="complete__stat-num">${knew}</span>
        <span class="complete__stat-label">Knew</span>
      </div>
      <div class="complete__stat complete__stat--amber">
        <span class="complete__stat-num">${partial}</span>
        <span class="complete__stat-label">Partial</span>
      </div>
      <div class="complete__stat complete__stat--red">
        <span class="complete__stat-num">${didnt}</span>
        <span class="complete__stat-label">Retry</span>
      </div>
     `;

    // Save to tracker
    if (typeof Tracker !== "undefined") {
      Tracker.saveFlashcards(sessionClass, sessionSubject, sessionChapter, knew, partial, didnt);
    }

    setGlobalView("flashcard-complete");
  }

  // ── Public API ─────────────────────────────
  return { init, start };
})();

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => Flashcards.init());
