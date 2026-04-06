// ══════════════════════════════════════════════
// NotesGPT — Chapter Completion Screen
// ══════════════════════════════════════════════
// Shows after the entire chapter flow is done.
// Gathers data from Test + Arena, shows insights,
// animates the score count-up, and guides next action.

const ChapterComplete = (() => {

  /**
   * Show the completion screen with gathered data.
   * @param {Object} data
   *   - chapter, subject, classNum
   *   - arenaScore, arenaAccuracy, arenaSpeed, arenaStreak
   */
  function show(data = {}) {
    // ── Gather test data from TestEngine if available ──
    let testScore = "—";
    let testAccuracy = "—";
    let testMax = 0;
    let testAwarded = 0;
    let weakAreas = [];
    let strongAreas = [];

    if (typeof TestEngine !== "undefined") {
      const state = TestEngine.getState();
      if (state && state.results && state.results.length > 0) {
        testMax = state.results.reduce((sum, r) => sum + r.total_marks, 0);
        testAwarded = state.results.reduce((sum, r) => sum + r.marks_awarded, 0);
        const pct = testMax > 0 ? Math.round((testAwarded / testMax) * 100) : 0;
        testScore = `${testAwarded}/${testMax}`;
        testAccuracy = `${pct}%`;

        // Find weak and strong areas
        state.results.forEach((r, i) => {
          const q = state.questions[i];
          const ratio = r.total_marks > 0 ? r.marks_awarded / r.total_marks : 0;
          if (ratio < 0.5) {
            weakAreas.push(q.question.slice(0, 60));
          } else if (ratio >= 0.8) {
            strongAreas.push(q.question.slice(0, 60));
          }
        });
      }
    }

    // ── Use arena data if test data isn't available ──
    const displayScore = testScore !== "—" ? testScore : (data.arenaScore ? `${data.arenaScore} pts` : "—");
    const displayAccuracy = testAccuracy !== "—" ? testAccuracy : (data.arenaAccuracy ? `${data.arenaAccuracy}%` : "—");
    const displaySpeed = data.arenaSpeed || "—";

    // ── Determine accuracy number for color/confidence ──
    let accuracyNum = 0;
    if (testAccuracy !== "—") {
      accuracyNum = parseInt(testAccuracy);
    } else if (data.arenaAccuracy) {
      accuracyNum = data.arenaAccuracy;
    }

    // ── Set chapter name ──
    const chapterName = data.chapter || window.currentChapter || "";
    const subjectName = data.subject || window.currentSubject || "";
    const className = data.classNum || window.currentClassNum || "";
    const subtitleEl = document.getElementById("cc-chapter-name");
    if (subtitleEl && chapterName) {
      subtitleEl.textContent = `${chapterName} — Class ${className} ${subjectName}`;
    }

    // ── Set stats ──
    document.getElementById("cc-score-val").textContent = "0";
    document.getElementById("cc-accuracy-val").textContent = "0%";
    document.getElementById("cc-speed-val").textContent = displaySpeed;

    // ── Set insight ──
    const strongEl = document.getElementById("cc-strong-text");
    const weakEl = document.getElementById("cc-weak-text");
    const weakRow = document.getElementById("cc-insight-weak");

    if (strongAreas.length > 0) {
      strongEl.textContent = `You are strong in "${strongAreas[0]}…"`;
    } else if (accuracyNum >= 80) {
      strongEl.textContent = "You have strong command over this chapter's core concepts.";
    } else if (accuracyNum >= 60) {
      strongEl.textContent = "You have a good grasp of the key topics in this chapter.";
    } else {
      strongEl.textContent = "You've completed all learning stages for this chapter.";
    }

    if (weakAreas.length > 0) {
      weakEl.textContent = `You should revise "${weakAreas[0]}…"`;
      weakRow.style.display = "flex";
    } else if (accuracyNum < 60 && accuracyNum > 0) {
      weakEl.textContent = "Consider going through the summary and flashcards once more.";
      weakRow.style.display = "flex";
    } else {
      weakRow.style.display = "none";
    }

    // ── Set confidence message ──
    const confidenceEl = document.getElementById("cc-confidence-msg");
    if (accuracyNum >= 90) {
      confidenceEl.textContent = "Outstanding. You've mastered this chapter completely.";
    } else if (accuracyNum >= 75) {
      confidenceEl.textContent = "You're now well-prepared for this chapter.";
    } else if (accuracyNum >= 60) {
      confidenceEl.textContent = "With one more revision, you can master this completely.";
    } else if (accuracyNum > 0) {
      confidenceEl.textContent = "Keep going — another round of practice will strengthen your understanding.";
    } else {
      confidenceEl.textContent = "You've completed the full study journey for this chapter.";
    }

    // ── Set progress bar ──
    const history = typeof History !== "undefined" ? History.getAll() : [];
    const completedChapters = history.filter(h => h.arenaScore || h.type === "arena").length + 1; // +1 for this one
    const progressFill = document.getElementById("cc-progress-fill");
    const progressBadge = document.getElementById("cc-progress-badge");
    if (progressBadge) progressBadge.textContent = `${completedChapters} Chapter${completedChapters !== 1 ? "s" : ""} Completed`;

    // ── Show the view ──
    if (typeof setGlobalView === "function") {
      setGlobalView("chapter-complete");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

    // ── Animate in (delayed sequence) ──
    requestAnimationFrame(() => {
      // Trigger check animation
      const ring = document.getElementById("cc-check-ring");
      if (ring) ring.classList.add("cc-check-ring--animate");

      // Count-up score
      setTimeout(() => {
        _countUp("cc-score-val", displayScore, 800);
      }, 400);

      // Count-up accuracy
      setTimeout(() => {
        _countUp("cc-accuracy-val", displayAccuracy, 600);
      }, 700);

      // Progress bar fill
      setTimeout(() => {
        if (progressFill) {
          const fillPct = Math.min(completedChapters * 8, 100); // ~12 chapters = 100%
          progressFill.style.width = `${fillPct}%`;
        }
      }, 1000);

      // Fade in insight
      const insightBox = document.querySelector(".cc-insight");
      if (insightBox) {
        insightBox.style.opacity = "0";
        insightBox.style.transform = "translateY(10px)";
        setTimeout(() => {
          insightBox.style.transition = "all 0.5s ease";
          insightBox.style.opacity = "1";
          insightBox.style.transform = "translateY(0)";
        }, 900);
      }

      // Fade in actions
      const actions = document.querySelector(".cc-actions");
      if (actions) {
        actions.style.opacity = "0";
        actions.style.transform = "translateY(10px)";
        setTimeout(() => {
          actions.style.transition = "all 0.5s ease";
          actions.style.opacity = "1";
          actions.style.transform = "translateY(0)";
        }, 1200);
      }
    });

    // ── Save completion to History ──
    if (typeof History !== "undefined") {
      History.save({
        classNum: className,
        subject: subjectName,
        chapter: chapterName,
        type: "completed",
        testScore: testScore,
        accuracy: accuracyNum || null,
        arenaScore: data.arenaScore || null,
        arenaStreak: data.arenaStreak || null,
        preview: `✅ Chapter Completed | Score: ${displayScore} | Accuracy: ${displayAccuracy}`,
      });
    }

    // ── GA: Chapter fully completed (highest-value event) ──
    if (typeof GA !== "undefined") {
      GA.chapterCompleted(className, subjectName, chapterName);
      GA.send("chapter_mastery", {
        event_category: "retention",
        class_level: `Class ${className}`,
        subject: subjectName,
        chapter: chapterName,
        final_accuracy: accuracyNum || 0,
        arena_score: data.arenaScore || 0,
        performance: accuracyNum >= 90 ? "mastered" : accuracyNum >= 70 ? "proficient" : "completed",
      });
    }
  }

  /**
   * Count-up animation for a stat value.
   * Supports formats: "78%", "15/20", "120 pts", plain numbers, or dashes.
   */
  function _countUp(elementId, targetStr, duration) {
    const el = document.getElementById(elementId);
    if (!el || !targetStr || targetStr === "—") {
      if (el) el.textContent = targetStr || "—";
      return;
    }

    // Parse target
    let targetNum = 0;
    let suffix = "";
    let prefix = "";

    if (targetStr.includes("/")) {
      // Format: "15/20"
      const parts = targetStr.split("/");
      targetNum = parseInt(parts[0]) || 0;
      suffix = `/${parts[1]}`;
    } else if (targetStr.includes("%")) {
      targetNum = parseInt(targetStr) || 0;
      suffix = "%";
    } else if (targetStr.includes("pts")) {
      targetNum = parseInt(targetStr) || 0;
      suffix = " pts";
    } else {
      targetNum = parseInt(targetStr) || 0;
    }

    if (targetNum === 0) {
      el.textContent = targetStr;
      return;
    }

    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(targetNum * eased);
      el.textContent = `${prefix}${current}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = targetStr; // Ensure exact final value
      }
    };
    requestAnimationFrame(step);
  }

  return { show };
})();
