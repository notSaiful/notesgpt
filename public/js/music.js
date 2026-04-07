// ══════════════════════════════════════════════
// NotesGPT — Music Generation System (Bytez suno/bark)
// ══════════════════════════════════════════════

const MusicPlayer = (() => {
  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("song-section");
    els.genBtn = document.getElementById("music-gen-btn");
    els.loading = document.getElementById("music-loading");
    els.player = document.getElementById("music-player-wrap");
    els.audio = document.getElementById("music-audio");
    els.playBtn = document.getElementById("music-play-btn");
    els.progressBar = document.getElementById("music-progress-fill");
    els.timeText = document.getElementById("music-time");
    els.lyrics = document.getElementById("music-lyrics");
    els.styleBadge = document.getElementById("music-style-badge");
    els.error = document.getElementById("music-error");
    els.retryBtn = document.getElementById("music-retry-btn");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    if (els.genBtn) els.genBtn.addEventListener("click", generate);
    if (els.retryBtn) els.retryBtn.addEventListener("click", generate);
    if (els.playBtn) els.playBtn.addEventListener("click", togglePlay);

    // Audio events
    if (els.audio) {
      els.audio.addEventListener("timeupdate", updateProgress);
      els.audio.addEventListener("ended", () => {
        els.playBtn.textContent = "▶";
      });
    }
  }

  // ── Show / Hide ────────────────────────────
  function show() {
    if (els.section) els.section.classList.remove("hidden");
  }

  function hide() {
    if (els.section) els.section.classList.add("hidden");
    if (els.audio) els.audio.pause();
  }

  // ── Generate ───────────────────────────────
  async function generate() {
    // Collect context
    const notesEl = document.getElementById("notes-content");
    const summaryText = notesEl ? notesEl.innerText.slice(0, 500) : "";
    const weakAreas = document.getElementById("test-weak-areas");
    const weakText = weakAreas ? weakAreas.innerText : "";

    const keyPoints = weakText || summaryText || window.currentChapter || "";

    // Determine performance level from score
    const scoreEl = document.getElementById("test-score-big");
    const totalEl = document.getElementById("test-score-total");
    let performanceLevel = "medium";
    if (scoreEl && totalEl) {
      const score = parseInt(scoreEl.textContent) || 0;
      const total = parseInt(totalEl.textContent.replace(/\D/g, "")) || 25;
      const pct = (score / total) * 100;
      performanceLevel = pct >= 70 ? "high" : pct >= 40 ? "medium" : "low";
    }

    // Show loading
    els.loading.classList.remove("hidden");
    els.player.classList.add("hidden");
    els.error.classList.add("hidden");
    els.genBtn.disabled = true;
    els.genBtn.textContent = "🎵 Generating...";

    try {
      const res = await fetch("/api/generate-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum || "10",
          subject: window.currentSubject || "",
          chapter: window.currentChapter || "",
          keyPoints,
          performanceLevel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate music.");

      // Set audio source
      els.audio.src = data.audio_url;
      els.audio.load();

      // Display lyrics
      els.lyrics.innerHTML = data.lyrics
        .split("\n")
        .filter(l => l.trim())
        .map(l => `<p>${l}</p>`)
        .join("");

      // Style badge
      const badgeColors = {
        "Victory Anthem": "#10b981",
        "Comeback Track": "#f59e0b",
        "Study Groove": "#8b5cf6",
      };
      els.styleBadge.textContent = `🎵 ${data.style}`;
      els.styleBadge.style.borderColor = badgeColors[data.style] || "#8b5cf6";
      els.styleBadge.style.color = badgeColors[data.style] || "#8b5cf6";

      // Show player
      els.loading.classList.add("hidden");
      els.player.classList.remove("hidden");
      els.playBtn.textContent = "▶";

      // ― Analytics ―
      if (typeof GA !== "undefined") GA.memorySongGenerated(window.currentClassNum, window.currentSubject, window.currentChapter);
      // ― HubSpot: Track memory song generation ―
      if (typeof HubTrack !== "undefined") {
        HubTrack.memorySongGenerated(window.currentClassNum, window.currentSubject, window.currentChapter);
      }

    } catch (err) {
      els.loading.classList.add("hidden");
      els.error.classList.remove("hidden");
      els.error.querySelector(".music-error__msg").textContent = err.message;
    } finally {
      els.genBtn.disabled = false;
      els.genBtn.textContent = "🎵 Generate Memory Song";
    }
  }

  // ── Playback ───────────────────────────────
  function togglePlay() {
    if (!els.audio.src) return;
    if (els.audio.paused) {
      els.audio.play();
      els.playBtn.textContent = "⏸";
    } else {
      els.audio.pause();
      els.playBtn.textContent = "▶";
    }
  }

  function updateProgress() {
    if (!els.audio.duration) return;
    const pct = (els.audio.currentTime / els.audio.duration) * 100;
    els.progressBar.style.width = `${pct}%`;

    const cur = formatTime(els.audio.currentTime);
    const dur = formatTime(els.audio.duration);
    els.timeText.textContent = `${cur} / ${dur}`;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // ── Download MP3 ───────────────────────────
  function downloadMp3() {
    if (!els.audio || !els.audio.src) return;
    const a = document.createElement("a");
    a.href = els.audio.src;
    a.download = `memory-song-${window.currentChapter || "chapter"}.mp3`;
    a.click();
    if (typeof ShareManager !== "undefined") ShareManager.showToast("⬇️ Song downloaded!");
  }

  // ── Download Lyrics ────────────────────────
  function downloadLyrics() {
    if (!els.lyrics) return;
    const text = els.lyrics.innerText;
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lyrics-${window.currentChapter || "chapter"}.txt`;
    a.click();
    if (typeof ShareManager !== "undefined") ShareManager.showToast("📝 Lyrics downloaded!");
  }

  // ── Share Song ─────────────────────────────
  function shareSong() {
    if (typeof ShareManager !== "undefined") {
      ShareManager.shareNative("song", window.currentClassNum, window.currentSubject, window.currentChapter);
    }
  }

  // ── Bind download/share buttons ────────────
  function bindActionBtns() {
    const dlBtn = document.getElementById("music-dl-btn");
    const dlLyricsBtn = document.getElementById("music-dl-lyrics-btn");
    const shareBtn = document.getElementById("music-share-btn");
    if (dlBtn) dlBtn.addEventListener("click", downloadMp3);
    if (dlLyricsBtn) dlLyricsBtn.addEventListener("click", downloadLyrics);
    if (shareBtn) shareBtn.addEventListener("click", shareSong);
  }

  return { init, show, hide, bindActionBtns };
})();

document.addEventListener("DOMContentLoaded", () => { MusicPlayer.init(); MusicPlayer.bindActionBtns(); });
