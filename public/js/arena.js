/**
 * NotesGPT Exam Arena System
 * Fast, decision-based game logic for final chapter mastery.
 */

const ExamArena = {
  questions: [],
  currentIndex: 0,
  score: 0,
  streak: 0,
  maxStreak: 0,
  timer: null,
  timeLeft: 8,
  isPaused: false,
  startTime: 0,
  totalTimeTaken: 0,
  correctCount: 0,

  init() {
    console.log("⚔️ Arena System Initialized");
    this.bindEvents();
  },

  bindEvents() {
    document.getElementById("arena-retry-btn")?.addEventListener("click", () => {
      this.reset();
      this.startArena();
    });
    document.getElementById("arena-continue-btn")?.addEventListener("click", () => {
      window.location.reload(); // Simple reset back to dashboard
    });
  },

  async startArena(classNum, subject, chapter) {
    this.reset();
    
    // UI: Show loading
    document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
    document.getElementById("arena-loading").classList.remove("hidden");
    
    try {
      const response = await fetch("/api/generate-arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter })
      });
      const data = await response.json();
      
      if (data.error || !data.questions) throw new Error(data.error || "Failed to load Arena");
      
      this.questions = data.questions;
      this.startTime = Date.now();
      
      // Transition to game
      document.getElementById("arena-loading").classList.add("hidden");
      document.getElementById("arena-section").classList.remove("hidden");
      this.loadQuestion();
    } catch (err) {
      console.error(err);
      alert("Failed to enter Arena. Please try again.");
      document.getElementById("arena-loading").classList.add("hidden");
      document.getElementById("input-section").classList.remove("hidden");
    }
  },

  reset() {
    this.questions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.correctCount = 0;
    this.totalTimeTaken = 0;
    this.isPaused = false;
    clearInterval(this.timer);
    
    // UI Resets
    document.getElementById("arena-score").textContent = "0";
    document.getElementById("arena-streak").textContent = "🔥 0";
    document.getElementById("arena-progress-fill").style.width = "0%";
  },

  loadQuestion() {
    if (this.currentIndex >= this.questions.length) {
      this.endArena();
      return;
    }

    const q = this.questions[this.currentIndex];
    const choicesContainer = document.getElementById("arena-choices");
    
    // UI: Update HUD
    document.getElementById("arena-progress-text").textContent = `${this.currentIndex + 1} / ${this.questions.length}`;
    document.getElementById("arena-progress-fill").style.width = `${((this.currentIndex + 1) / this.questions.length) * 100}%`;
    document.getElementById("arena-q-type").textContent = q.type.toUpperCase().replace(/_/g, ' ');
    document.getElementById("arena-q-text").textContent = q.question;
    
    // Clear choices
    choicesContainer.innerHTML = "";
    
    // Render Choices with shuffled distribution
    q.options.forEach(optionText => {
      const btn = document.createElement("button");
      btn.className = "arena-choice-btn";
      btn.textContent = optionText;
      btn.addEventListener("click", () => this.handleAnswer(optionText, btn));
      choicesContainer.appendChild(btn);
    });

    this.startTimer();
  },

  startTimer() {
    clearInterval(this.timer);
    this.timeLeft = 8;
    const timerFill = document.getElementById("arena-timer-fill");
    const timerText = document.getElementById("arena-timer-text");
    
    const updateHUD = () => {
      timerText.textContent = Math.ceil(this.timeLeft);
      const offset = (1 - (this.timeLeft / 8)) * 283;
      timerFill.style.strokeDashoffset = offset;
      
      // Visual urgency
      if (this.timeLeft < 3) {
        timerFill.style.stroke = "#ff4757";
      } else {
        timerFill.style.stroke = "#fff";
      }
    };

    updateHUD();
    
    this.timer = setInterval(() => {
      this.timeLeft -= 0.1;
      updateHUD();
      
      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this.handleAnswer(null); // Timeout
      }
    }, 100);
  },

  handleAnswer(selected, btn = null) {
    if (this.isPaused) return;
    this.isPaused = true;
    clearInterval(this.timer);

    const q = this.questions[this.currentIndex];
    const isCorrect = selected === q.answer;
    
    if (isCorrect) {
      this.score += 10;
      this.correctCount++;
      // Speed bonus
      if (this.timeLeft > 5) this.score += 5;
      
      this.streak++;
      if (this.streak > this.maxStreak) this.maxStreak = this.streak;
      
      // Streak multipliers (UI only for now, points already added)
      if (this.streak >= 3) this.score += 5;
      if (this.streak >= 5) this.score += 10;
      
      if (btn) btn.classList.add("correct");
    } else {
      this.streak = 0;
      if (btn) btn.classList.add("wrong");
      
      // Highlight correct answer
      const choices = document.querySelectorAll(".arena-choice-btn");
      choices.forEach(b => {
        if (b.textContent === q.answer) b.classList.add("correct");
      });
    }

    // Update Stats HUD
    document.getElementById("arena-score").textContent = this.score;
    document.getElementById("arena-streak").textContent = `${this.streak >= 3 ? '⚡' : '🔥'} ${this.streak}`;

    this.showFeedback(isCorrect, q.insightRefinement);
  },

  showFeedback(isCorrect, insight) {
    const feedbackOverlay = document.getElementById("arena-feedback");
    const icon = document.getElementById("arena-feedback-icon");
    const msg = document.getElementById("arena-feedback-msg");
    const insightText = document.getElementById("arena-feedback-insight");

    feedbackOverlay.classList.remove("hidden");
    
    if (isCorrect) {
      icon.textContent = "✅";
      msg.textContent = "CORRECT";
      insightText.textContent = "Speed Mastery +1";
    } else {
      icon.textContent = "❌";
      msg.textContent = "MISTAKE";
      insightText.textContent = insight;
    }

    setTimeout(() => {
      feedbackOverlay.classList.add("hidden");
      this.currentIndex++;
      this.isPaused = false;
      this.loadQuestion();
    }, 1200);
  },

  endArena() {
    this.totalTimeTaken = (Date.now() - this.startTime) / 1000;
    
    document.getElementById("arena-section").classList.add("hidden");
    document.getElementById("arena-results").classList.remove("hidden");
    
    // Set Results
    const accuracy = Math.round((this.correctCount / this.questions.length) * 100);
    document.getElementById("arena-final-score").textContent = this.score;
    document.getElementById("arena-final-accuracy").textContent = `${accuracy}%`;
    document.getElementById("arena-final-streak").textContent = this.maxStreak;
    
    // Speed Rating
    const avgTime = this.totalTimeTaken / this.questions.length;
    let rating = "SLOW";
    if (avgTime < 3) rating = "LIGHTNING";
    else if (avgTime < 5) rating = "FAST";
    else if (avgTime < 7) rating = "STABLE";
    document.getElementById("arena-final-speed").textContent = rating;

    // Insight
    let resultMsg = "";
    if (accuracy > 90) resultMsg = "Immense mastery. You are fully ready for the top 1% rank.";
    else if (accuracy > 70) resultMsg = "Strong performance. Tighten up your quick recall to avoid silly mistakes.";
    else resultMsg = "Decision speed is low. We recommend another round of Flashcards before the real test.";
    
    document.getElementById("arena-final-insight").textContent = resultMsg;

    // Save to History
    if (typeof History !== "undefined") {
      History.save({
        classNum: window.currentClassNum,
        subject: window.currentSubject,
        chapter: window.currentChapter,
        type: "arena",
        arenaScore: this.score,
        arenaStreak: this.maxStreak,
        accuracy: accuracy,
        preview: `Arena Score: ${this.score} | Streak: ${this.maxStreak} | ${rating}`
      });
    }
  }
};

document.addEventListener("DOMContentLoaded", () => ExamArena.init());
