// ══════════════════════════════════════════════
// NotesGPT — AI Visual Lesson (Cinema Player)
// Auto-playing video with Neural TTS voiceover
// No manual slide navigation — press play, it plays
// ══════════════════════════════════════════════

const AIVideo = (() => {
  // ── State ──────────────────────────────────
  let slides = [];
  let currentIndex = 0;
  let isPlaying = false;
  let isPaused = false;
  let currentAudio = null;
  let progressTimer = null;
  let startTime = 0;

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

  // ── Generate visual lesson ────────────────
  async function generate() {
    const classNum = window.currentClassNum || "10";
    const subject = window.currentSubject || "";
    const chapter = window.currentChapter || "";

    if (!chapter) return;

    // Reset
    slides = [];
    currentIndex = 0;
    isPlaying = false;
    isPaused = false;
    stopPlayback();

    // Show loading
    if (els.loading) els.loading.classList.remove("hidden");
    if (els.error) els.error.classList.add("hidden");
    if (els.player) els.player.classList.add("hidden");
    if (els.genBtn) els.genBtn.disabled = true;
    if (els.genBtn) els.genBtn.textContent = "🎬 Generating visual lesson...";

    const loadingMsg = els.loading ? els.loading.querySelector("p") : null;
    if (loadingMsg) loadingMsg.textContent = "AI is creating your video lesson with neural voiceover... This takes about 30 seconds.";

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter }),
      });

      const data = await res.json();

      if (!res.ok || data.fallback === "youtube") {
        throw new Error(data.error || "Visual lesson generation failed.");
      }

      if (data.slides && data.slides.length > 0) {
        slides = data.slides;
        buildPlayer(data);
        // ― Analytics ―
        if (typeof GA !== "undefined") GA.visualLessonGenerated(classNum, subject, chapter, slides.length);
        if (typeof HubTrack !== "undefined") {
          HubTrack.visualLessonGenerated(classNum, subject, chapter, slides.length);
        }
      } else {
        throw new Error("No scenes generated.");
      }

    } catch (err) {
      console.warn("Visual lesson failed:", err.message);
      if (els.loading) els.loading.classList.add("hidden");
      openYouTubeFallback(classNum, subject, chapter);

      if (els.error) {
        els.error.classList.remove("hidden");
        const msg = els.error.querySelector(".aivideo-error__msg");
        if (msg) msg.textContent = "Visual lesson unavailable. We've opened a YouTube search for you!";
      }
    } finally {
      if (els.genBtn) {
        els.genBtn.disabled = false;
        els.genBtn.textContent = "🎬 Generate Visual Lesson";
      }
    }
  }

  // ── Build the cinema player ───────────────
  function buildPlayer(data) {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player) els.player.classList.remove("hidden");

    const chapter = data.chapter || window.currentChapter || "";
    const subject = data.subject || window.currentSubject || "";
    const classNum = data.classNum || window.currentClassNum || "";

    // Preload all images
    slides.forEach(s => {
      const img = new Image();
      img.src = s.imageUrl;
    });

    els.player.innerHTML = `
      <div class="vl-cinema">
        <!-- Title bar -->
        <div class="vl-cinema__header">
          <div class="vl-cinema__title">📺 ${chapter}</div>
          <div class="vl-cinema__meta">Class ${classNum} · ${subject} · ${slides.length} scenes</div>
        </div>

        <!-- Main viewport -->
        <div class="vl-cinema__viewport">
          <img class="vl-cinema__img vl-cinema__img--active" id="vl-img-a" src="${slides[0].imageUrl}" alt="Visual lesson" />
          <img class="vl-cinema__img" id="vl-img-b" src="" alt="" />
          
          <!-- Scene title overlay -->
          <div class="vl-cinema__scene-title" id="vl-scene-title">${slides[0].title || "Introduction"}</div>
          
          <!-- Big play button (shown initially) -->
          <button class="vl-cinema__play-big" id="vl-play-big">▶</button>
        </div>

        <!-- Narration subtitle bar -->
        <div class="vl-cinema__subtitle" id="vl-subtitle">
          <p id="vl-subtitle-text">${slides[0].narration || ""}</p>
        </div>

        <!-- Controls bar -->
        <div class="vl-cinema__controls">
          <button class="vl-ctrl-btn" id="vl-play-btn">▶</button>
          <div class="vl-cinema__progress" id="vl-progress-wrap">
            <div class="vl-cinema__progress-fill" id="vl-progress-fill" style="width:0%"></div>
            ${slides.map((s, i) => `<div class="vl-cinema__marker" style="left:${((i + 1) / slides.length) * 100}%" title="${s.title || `Scene ${i + 1}`}"></div>`).join("")}
          </div>
          <span class="vl-cinema__time" id="vl-time-display">0:00</span>
          <button class="vl-ctrl-btn" id="vl-mute-btn">🔊</button>
        </div>

        <!-- Scene list (compact) -->
        <div class="vl-cinema__chapters" id="vl-chapters">
          ${slides.map((s, i) => `
            <div class="vl-chapter ${i === 0 ? "vl-chapter--active" : ""}" data-index="${i}">
              <span class="vl-chapter__num">${i + 1}</span>
              <span class="vl-chapter__title">${s.title || `Scene ${i + 1}`}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // Bind events
    const playBig = document.getElementById("vl-play-big");
    const playBtn = document.getElementById("vl-play-btn");
    const muteBtn = document.getElementById("vl-mute-btn");
    const chapters = document.getElementById("vl-chapters");

    playBig.addEventListener("click", () => {
      playBig.classList.add("hidden");
      startPlayback();
    });

    playBtn.addEventListener("click", togglePlayPause);

    muteBtn.addEventListener("click", () => {
      if (currentAudio) {
        currentAudio.muted = !currentAudio.muted;
        muteBtn.textContent = currentAudio.muted ? "🔇" : "🔊";
      }
    });

    chapters.addEventListener("click", (e) => {
      const ch = e.target.closest(".vl-chapter");
      if (!ch) return;
      const idx = parseInt(ch.dataset.index, 10);
      if (!isNaN(idx)) {
        stopPlayback();
        currentIndex = idx;
        playScene(idx);
      }
    });
  }

  // ── Playback engine ───────────────────────
  function startPlayback() {
    isPlaying = true;
    isPaused = false;
    startTime = Date.now();
    updatePlayBtn();
    playScene(currentIndex);
  }

  function togglePlayPause() {
    if (!isPlaying) {
      startPlayback();
      const playBig = document.getElementById("vl-play-big");
      if (playBig) playBig.classList.add("hidden");
      return;
    }

    if (isPaused) {
      // Resume
      isPaused = false;
      if (currentAudio) currentAudio.play();
      updatePlayBtn();
    } else {
      // Pause
      isPaused = true;
      if (currentAudio) currentAudio.pause();
      updatePlayBtn();
    }
  }

  function stopPlayback() {
    isPlaying = false;
    isPaused = false;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    clearInterval(progressTimer);
    updatePlayBtn();
  }

  function updatePlayBtn() {
    const btn = document.getElementById("vl-play-btn");
    if (!btn) return;
    btn.textContent = (!isPlaying || isPaused) ? "▶" : "⏸";
  }

  // ── Play a single scene ───────────────────
  function playScene(idx) {
    if (idx >= slides.length) {
      // Video finished
      isPlaying = false;
      updatePlayBtn();
      // Show replay
      const playBig = document.getElementById("vl-play-big");
      if (playBig) {
        playBig.textContent = "↻";
        playBig.classList.remove("hidden");
      }
      currentIndex = 0;

      // GA event
      if (typeof GA !== "undefined") {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        GA.send("visual_lesson_completed", {
          event_category: "study_flow",
          scenes_watched: slides.length,
          watch_time_seconds: elapsed,
        });
      }
      return;
    }

    const slide = slides[idx];
    currentIndex = idx;

    // Update scene title
    const titleEl = document.getElementById("vl-scene-title");
    if (titleEl) {
      titleEl.textContent = slide.title || `Scene ${idx + 1}`;
      titleEl.classList.add("vl-title-animate");
      setTimeout(() => titleEl.classList.remove("vl-title-animate"), 2000);
    }

    // Crossfade images
    crossfadeImage(slide.imageUrl);

    // Update subtitle
    const subtitleText = document.getElementById("vl-subtitle-text");
    if (subtitleText) subtitleText.textContent = slide.narration || "";

    // Update chapter markers
    document.querySelectorAll(".vl-chapter").forEach((el, i) => {
      el.classList.toggle("vl-chapter--active", i === idx);
      if (i < idx) el.classList.add("vl-chapter--done");
    });

    // Update progress
    updateProgress(idx);

    // Play audio narration
    if (slide.audioUrl) {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }

      currentAudio = new Audio(slide.audioUrl);
      const muteBtn = document.getElementById("vl-mute-btn");
      if (muteBtn && muteBtn.textContent === "🔇") {
        currentAudio.muted = true;
      }

      currentAudio.onended = () => {
        // Small pause between scenes, then advance
        setTimeout(() => {
          if (isPlaying && !isPaused) {
            playScene(idx + 1);
          }
        }, 800);
      };

      currentAudio.onerror = () => {
        // If audio fails, wait 5 seconds then advance
        setTimeout(() => {
          if (isPlaying && !isPaused) playScene(idx + 1);
        }, 5000);
      };

      currentAudio.play().catch(() => {
        // Autoplay blocked — try again after user interaction
        setTimeout(() => {
          if (isPlaying && !isPaused) playScene(idx + 1);
        }, 5000);
      });
    } else {
      // No audio — auto-advance after 6 seconds
      setTimeout(() => {
        if (isPlaying && !isPaused) playScene(idx + 1);
      }, 6000);
    }
  }

  // ── Crossfade images (Ken Burns effect) ───
  let useImgA = true;
  function crossfadeImage(src) {
    const imgA = document.getElementById("vl-img-a");
    const imgB = document.getElementById("vl-img-b");
    if (!imgA || !imgB) return;

    const incoming = useImgA ? imgB : imgA;
    const outgoing = useImgA ? imgA : imgB;

    incoming.src = src;
    incoming.onload = () => {
      incoming.classList.add("vl-cinema__img--active");
      outgoing.classList.remove("vl-cinema__img--active");
    };

    // Randomize Ken Burns direction
    const directions = ["vl-kb-1", "vl-kb-2", "vl-kb-3", "vl-kb-4"];
    const pick = directions[Math.floor(Math.random() * directions.length)];
    incoming.className = `vl-cinema__img vl-cinema__img--active ${pick}`;

    useImgA = !useImgA;
  }

  // ── Progress bar ──────────────────────────
  function updateProgress(idx) {
    const fill = document.getElementById("vl-progress-fill");
    const timeDisplay = document.getElementById("vl-time-display");
    if (!fill) return;

    // Scene-based progress
    const pct = ((idx + 1) / slides.length) * 100;
    fill.style.width = `${pct}%`;

    // Time display
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!startTime || isPaused) return;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      if (timeDisplay) timeDisplay.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
    }, 1000);
  }

  // ── YouTube Fallback ──────────────────────
  function openYouTubeFallback(classNum, subject, chapter) {
    const query = encodeURIComponent(
      `CBSE Class ${classNum} ${subject} ${chapter} explanation one shot`
    );
    window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
  }

  // ── Download all slides as images ──────────
  function downloadSlides() {
    if (slides.length === 0) {
      if (typeof ShareManager !== "undefined") ShareManager.showToast("No slides to download.");
      return;
    }
    slides.forEach((slide, i) => {
      const a = document.createElement("a");
      a.href = slide.imageUrl;
      a.download = `slide-${i + 1}-${slide.title || "scene"}.png`;
      a.target = "_blank";
      document.body.appendChild(a);
      setTimeout(() => { a.click(); a.remove(); }, i * 300);
    });
    if (typeof ShareManager !== "undefined") ShareManager.showToast(`🖼️ Downloading ${slides.length} slides...`);
  }

  // ── Share AI video ────────────────────────
  function shareVideo() {
    if (typeof ShareManager !== "undefined") {
      ShareManager.shareNative("aivideo", window.currentClassNum, window.currentSubject, window.currentChapter);
    }
  }

  // ── Bind action buttons ───────────────────
  function bindActionBtns() {
    const dlBtn = document.getElementById("aivideo-dl-slides-btn");
    const shareBtn = document.getElementById("aivideo-share-btn");
    if (dlBtn) dlBtn.addEventListener("click", downloadSlides);
    if (shareBtn) shareBtn.addEventListener("click", shareVideo);
  }

  return { init, generate, bindActionBtns };
})();

document.addEventListener("DOMContentLoaded", () => { AIVideo.init(); AIVideo.bindActionBtns(); });
