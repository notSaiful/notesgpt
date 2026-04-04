// ══════════════════════════════════════════════
// NotesGPT — AI Video Generation (Bytez Multi-Clip Player)
// Generates multiple clips and plays them as a combined video
// ══════════════════════════════════════════════

const AIVideo = (() => {
  // ── State ──────────────────────────────────
  let clips = [];
  let currentClip = 0;

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("aivideo-section");
    els.genBtn = document.getElementById("aivideo-gen-btn");
    els.loading = document.getElementById("aivideo-loading");
    els.error = document.getElementById("aivideo-error");
    els.player = document.getElementById("aivideo-player");
    els.video = document.getElementById("aivideo-video");
    els.continueBtn = document.getElementById("aivideo-continue-btn");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    if (els.genBtn) els.genBtn.addEventListener("click", generate);
  }

  // ── Generate all clips ─────────────────────
  async function generate() {
    const classNum = window.currentClassNum || "10";
    const subject = window.currentSubject || "";
    const chapter = window.currentChapter || "";

    if (!chapter) return;

    // Reset state
    clips = [];
    currentClip = 0;

    // Show loading
    if (els.loading) els.loading.classList.remove("hidden");
    if (els.error) els.error.classList.add("hidden");
    if (els.player) els.player.classList.add("hidden");
    if (els.genBtn) els.genBtn.disabled = true;
    if (els.genBtn) els.genBtn.textContent = "🎬 Generating clips...";

    // Update loading message with progress
    const loadingMsg = els.loading ? els.loading.querySelector("p") : null;
    if (loadingMsg) loadingMsg.textContent = "Step 1: AI is writing scene descriptions...";

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter }),
      });

      const data = await res.json();

      if (!res.ok || data.fallback === "youtube") {
        throw new Error(data.error || "Video generation failed.");
      }

      if (data.type === "playlist" && data.clips && data.clips.length > 0) {
        clips = data.clips;
        showPlayer();
      } else {
        throw new Error("No clips generated.");
      }

    } catch (err) {
      console.warn("AI Video failed, using YouTube fallback:", err.message);
      if (els.loading) els.loading.classList.add("hidden");
      
      // YouTube fallback
      openYouTubeFallback(classNum, subject, chapter);
      
      if (els.error) {
        els.error.classList.remove("hidden");
        const msg = els.error.querySelector(".aivideo-error__msg");
        if (msg) msg.textContent = "AI video unavailable. We've opened a YouTube search for you instead!";
      }
    } finally {
      if (els.genBtn) {
        els.genBtn.disabled = false;
        els.genBtn.textContent = "🎬 Generate Explanatory Video";
      }
    }
  }

  // ── Show the multi-clip player ─────────────
  function showPlayer() {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player) els.player.classList.remove("hidden");

    // Build the playlist UI
    const playerContainer = els.player;
    playerContainer.innerHTML = `
      <div class="aivideo-now-playing">
        <div class="aivideo-clip-counter">
          <span id="aivideo-clip-num">1</span> / <span id="aivideo-clip-total">${clips.length}</span>
        </div>
        <p class="aivideo-scene-desc" id="aivideo-scene-desc"></p>
      </div>
      <video id="aivideo-video-el" controls autoplay
        style="width:100%;border-radius:12px;max-height:400px;background:#000;">
      </video>
      <div class="aivideo-playlist" id="aivideo-playlist"></div>
      <div class="aivideo-controls">
        <button class="btn btn--outline btn--sm" id="aivideo-prev-btn" disabled>⏮ Prev</button>
        <button class="btn btn--accent btn--sm" id="aivideo-next-btn">Next ⏭</button>
      </div>
    `;

    // Render playlist thumbnails
    const playlistEl = document.getElementById("aivideo-playlist");
    playlistEl.innerHTML = clips.map((clip, i) => `
      <div class="aivideo-playlist-item ${i === 0 ? 'aivideo-playlist-item--active' : ''}" 
           data-index="${i}">
        <span class="aivideo-playlist-num">${i + 1}</span>
        <span class="aivideo-playlist-label">${clip.scene.slice(0, 40)}${clip.scene.length > 40 ? '…' : ''}</span>
      </div>
    `).join("");

    // Get video element
    const videoEl = document.getElementById("aivideo-video-el");
    const prevBtn = document.getElementById("aivideo-prev-btn");
    const nextBtn = document.getElementById("aivideo-next-btn");

    // Play first clip
    currentClip = 0;
    loadClip(videoEl, 0);

    // Auto-advance to next clip
    videoEl.addEventListener("ended", () => {
      if (currentClip < clips.length - 1) {
        currentClip++;
        loadClip(videoEl, currentClip);
      }
    });

    // Prev/Next buttons
    prevBtn.addEventListener("click", () => {
      if (currentClip > 0) {
        currentClip--;
        loadClip(videoEl, currentClip);
      }
    });

    nextBtn.addEventListener("click", () => {
      if (currentClip < clips.length - 1) {
        currentClip++;
        loadClip(videoEl, currentClip);
      }
    });

    // Click on playlist item
    playlistEl.addEventListener("click", (e) => {
      const item = e.target.closest(".aivideo-playlist-item");
      if (!item) return;
      const idx = parseInt(item.dataset.index, 10);
      if (!isNaN(idx)) {
        currentClip = idx;
        loadClip(videoEl, idx);
      }
    });
  }

  // ── Load a specific clip ───────────────────
  function loadClip(videoEl, idx) {
    const clip = clips[idx];
    if (!clip) return;

    videoEl.src = clip.url;
    videoEl.play().catch(() => {});

    // Update counter
    const numEl = document.getElementById("aivideo-clip-num");
    const descEl = document.getElementById("aivideo-scene-desc");
    const prevBtn = document.getElementById("aivideo-prev-btn");
    const nextBtn = document.getElementById("aivideo-next-btn");
    
    if (numEl) numEl.textContent = idx + 1;
    if (descEl) descEl.textContent = clip.scene;
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx === clips.length - 1;

    // Highlight active playlist item
    const items = document.querySelectorAll(".aivideo-playlist-item");
    items.forEach((item, i) => {
      item.classList.toggle("aivideo-playlist-item--active", i === idx);
    });
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
