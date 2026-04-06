// ══════════════════════════════════════════════
// NotesGPT — AI Visual Slideshow (Pollinations.ai)
// Generates educational images + narration voiceover
// Plays as an auto-advancing slideshow with TTS
// ══════════════════════════════════════════════

const AIVideo = (() => {
  // ── State ──────────────────────────────────
  let slides = [];
  let currentSlide = 0;
  let autoPlayTimer = null;
  let isSpeaking = false;

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("aivideo-section");
    els.genBtn = document.getElementById("aivideo-gen-btn");
    els.loading = document.getElementById("aivideo-loading");
    els.error = document.getElementById("aivideo-error");
    els.player = document.getElementById("aivideo-player");
    els.continueBtn = document.getElementById("aivideo-continue-btn");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    if (els.genBtn) els.genBtn.addEventListener("click", generate);
  }

  // ── Pick best voice for narration ──────────
  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const preferred = [
      "Google UK English Female", "Google US English",
      "Samantha", "Karen", "Daniel",
    ];
    for (const name of preferred) {
      const v = voices.find(v => v.name === name);
      if (v) return v;
    }
    return voices.find(v => v.lang.startsWith("en")) || voices[0];
  }

  // ── Generate slides ───────────────────────
  async function generate() {
    const classNum = window.currentClassNum || "10";
    const subject = window.currentSubject || "";
    const chapter = window.currentChapter || "";

    if (!chapter) return;

    // Reset
    slides = [];
    currentSlide = 0;
    stopNarration();

    // Show loading
    if (els.loading) els.loading.classList.remove("hidden");
    if (els.error) els.error.classList.add("hidden");
    if (els.player) els.player.classList.add("hidden");
    if (els.genBtn) els.genBtn.disabled = true;
    if (els.genBtn) els.genBtn.textContent = "🖼️ Generating slides...";

    const loadingMsg = els.loading ? els.loading.querySelector("p") : null;
    if (loadingMsg) loadingMsg.textContent = "AI is creating illustrated scenes...";

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter }),
      });

      const data = await res.json();

      if (!res.ok || data.fallback === "youtube") {
        throw new Error(data.error || "Slideshow generation failed.");
      }

      if (data.type === "slideshow" && data.slides && data.slides.length > 0) {
        slides = data.slides;
        showPlayer();
      } else {
        throw new Error("No slides generated.");
      }

    } catch (err) {
      console.warn("AI Slideshow failed, using YouTube fallback:", err.message);
      if (els.loading) els.loading.classList.add("hidden");

      openYouTubeFallback(classNum, subject, chapter);

      if (els.error) {
        els.error.classList.remove("hidden");
        const msg = els.error.querySelector(".aivideo-error__msg");
        if (msg) msg.textContent = "Visual generation unavailable. We've opened a YouTube search for you instead!";
      }
    } finally {
      if (els.genBtn) {
        els.genBtn.disabled = false;
        els.genBtn.textContent = "🖼️ Generate Visual Lesson";
      }
    }
  }

  // ── Show the slideshow player ─────────────
  function showPlayer() {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player) els.player.classList.remove("hidden");

    const playerContainer = els.player;
    playerContainer.innerHTML = `
      <div class="slide-viewer">
        <div class="slide-counter">
          <span id="slide-num">1</span> / <span id="slide-total">${slides.length}</span>
        </div>
        <div class="slide-image-wrap">
          <img id="slide-image" class="slide-image" src="${slides[0].url}" alt="Educational slide" />
          <div class="slide-transition-overlay" id="slide-overlay"></div>
        </div>
        <div class="slide-narration" id="slide-narration">
          <p id="slide-narration-text">${slides[0].narration || ""}</p>
        </div>
        <div class="slide-controls">
          <button class="btn btn--outline btn--sm" id="slide-prev-btn" disabled>⏮ Prev</button>
          <button class="btn btn--outline btn--sm" id="slide-play-btn">▶ Auto-Play</button>
          <button class="btn btn--accent btn--sm" id="slide-next-btn">Next ⏭</button>
        </div>
        <div class="slide-thumbnails" id="slide-thumbnails">
          ${slides.map((s, i) => `
            <div class="slide-thumb ${i === 0 ? "slide-thumb--active" : ""}" data-index="${i}">
              <img src="${s.url}" alt="Slide ${i + 1}" />
              <span class="slide-thumb-num">${i + 1}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // Get element refs
    const imgEl = document.getElementById("slide-image");
    const prevBtn = document.getElementById("slide-prev-btn");
    const nextBtn = document.getElementById("slide-next-btn");
    const playBtn = document.getElementById("slide-play-btn");
    const thumbsEl = document.getElementById("slide-thumbnails");

    currentSlide = 0;

    // Narrate first slide
    narrateSlide(0);

    // Event listeners
    prevBtn.addEventListener("click", () => {
      if (currentSlide > 0) goToSlide(currentSlide - 1);
    });

    nextBtn.addEventListener("click", () => {
      if (currentSlide < slides.length - 1) goToSlide(currentSlide + 1);
    });

    playBtn.addEventListener("click", () => {
      if (autoPlayTimer) {
        stopAutoPlay();
        playBtn.textContent = "▶ Auto-Play";
      } else {
        startAutoPlay();
        playBtn.textContent = "⏸ Pause";
      }
    });

    thumbsEl.addEventListener("click", (e) => {
      const thumb = e.target.closest(".slide-thumb");
      if (!thumb) return;
      const idx = parseInt(thumb.dataset.index, 10);
      if (!isNaN(idx)) goToSlide(idx);
    });
  }

  // ── Navigate to a slide ───────────────────
  function goToSlide(idx) {
    if (idx < 0 || idx >= slides.length) return;

    const slide = slides[idx];
    currentSlide = idx;

    // Transition effect
    const overlay = document.getElementById("slide-overlay");
    if (overlay) {
      overlay.classList.add("slide-fade");
      setTimeout(() => overlay.classList.remove("slide-fade"), 600);
    }

    // Update image
    const imgEl = document.getElementById("slide-image");
    if (imgEl) imgEl.src = slide.url;

    // Update narration text
    const narrationText = document.getElementById("slide-narration-text");
    if (narrationText) narrationText.textContent = slide.narration || "";

    // Update counter
    const numEl = document.getElementById("slide-num");
    if (numEl) numEl.textContent = idx + 1;

    // Update buttons
    const prevBtn = document.getElementById("slide-prev-btn");
    const nextBtn = document.getElementById("slide-next-btn");
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx === slides.length - 1;

    // Update thumbnails
    document.querySelectorAll(".slide-thumb").forEach((el, i) => {
      el.classList.toggle("slide-thumb--active", i === idx);
    });

    // Narrate
    narrateSlide(idx);
  }

  // ── Narrate a slide using browser TTS ─────
  function narrateSlide(idx) {
    stopNarration();

    const slide = slides[idx];
    if (!slide || !slide.narration || !window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(slide.narration);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      isSpeaking = false;
      // If auto-play is active, advance after narration ends
      if (autoPlayTimer && currentSlide < slides.length - 1) {
        setTimeout(() => goToSlide(currentSlide + 1), 1500);
      }
    };

    isSpeaking = true;
    window.speechSynthesis.speak(utterance);
  }

  function stopNarration() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeaking = false;
  }

  // ── Auto-play ─────────────────────────────
  function startAutoPlay() {
    if (autoPlayTimer) return;
    autoPlayTimer = true; // flag — actual advancing is driven by narration onend
    // If not currently speaking, start with next slide
    if (!isSpeaking && currentSlide < slides.length - 1) {
      goToSlide(currentSlide + 1);
    }
  }

  function stopAutoPlay() {
    autoPlayTimer = null;
  }

  // ── YouTube Fallback ───────────────────────
  function openYouTubeFallback(classNum, subject, chapter) {
    const query = encodeURIComponent(
      `CBSE Class ${classNum} ${subject} ${chapter} explanation one shot`.trim()
    );
    window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
  }

  return { init, generate };
})();

document.addEventListener("DOMContentLoaded", () => AIVideo.init());
