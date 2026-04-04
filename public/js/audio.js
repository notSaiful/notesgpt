// ══════════════════════════════════════════════
// NotesGPT — Audiobook System (Bytez suno/bark TTS)
// Generates natural-sounding speech from chapter summaries
// ══════════════════════════════════════════════

const AudioPlayer = (() => {
  // ── State ──────────────────────────────────
  let audioChunks = [];
  let currentChunkIdx = 0;
  let isPlaying = false;

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("audiobook-section");
    els.listenBtn = document.getElementById("audio-quick-btn");
    els.player = document.getElementById("audio-player");
    els.playBtn = document.getElementById("audio-play-btn");
    els.progressBar = document.getElementById("audio-progress-fill");
    els.timeText = document.getElementById("audio-time");
    els.speedBtn = document.getElementById("audio-speed-btn");
    els.loading = document.getElementById("audio-gen-loading");
    els.modeLabel = document.getElementById("audio-mode-label");
    els.charLabel = document.getElementById("audio-char-label");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    if (els.listenBtn) els.listenBtn.addEventListener("click", generate);
    if (els.playBtn) els.playBtn.addEventListener("click", togglePlayback);
    if (els.speedBtn) els.speedBtn.addEventListener("click", cycleSpeed);
  }

  function show() {
    if (els.section) els.section.classList.remove("hidden");
  }

  function hide() {
    stop();
    if (els.section) els.section.classList.add("hidden");
  }

  // ── Generate audiobook ────────────────────
  async function generate() {
    const notesEl = document.getElementById("notes-content");
    const summaryText = notesEl ? notesEl.innerText.slice(0, 3000) : "";
    if (!summaryText) return;

    if (els.player) els.player.classList.add("hidden");
    if (els.loading) els.loading.classList.remove("hidden");
    if (els.listenBtn) {
      els.listenBtn.disabled = true;
      els.listenBtn.textContent = "⏳ Generating audio...";
    }

    // Update loading text
    const loadingP = els.loading ? els.loading.querySelector("p") : null;
    if (loadingP) loadingP.textContent = "Generating natural speech via AI... This takes 1-3 minutes.";

    try {
      const res = await fetch("/api/generate-audio-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum || "10",
          subject: window.currentSubject || "",
          chapter: window.currentChapter || "",
          summaryText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");

      if (data.type === "bark-audio" && data.audioChunks && data.audioChunks.length > 0) {
        // We have real AI-generated audio
        audioChunks = data.audioChunks;
        showBarkPlayer(data);
      } else {
        // Fallback: use browser TTS
        showBrowserTTSPlayer(data.script);
      }
    } catch (err) {
      if (els.loading) els.loading.classList.add("hidden");
      alert("Audio error: " + err.message);
    } finally {
      if (els.listenBtn) {
        els.listenBtn.disabled = false;
        els.listenBtn.textContent = "▶ Generate & Listen";
      }
    }
  }

  // ── Show Bark audio player ────────────────
  function showBarkPlayer(data) {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player) els.player.classList.remove("hidden");
    if (els.modeLabel) els.modeLabel.textContent = "🎧 AI Audiobook";
    if (els.playBtn) els.playBtn.textContent = "▶";
    if (els.charLabel) {
      els.charLabel.style.display = "block";
      els.charLabel.textContent = `${audioChunks.length} segments ready`;
    }

    currentChunkIdx = 0;
    isPlaying = false;
    updateProgress(0);

    const mins = Math.ceil((data.wordCount || 300) / 140);
    if (els.timeText) els.timeText.textContent = `~${mins} min`;
  }

  // ── Playback controls ─────────────────────
  function togglePlayback() {
    if (audioChunks.length > 0) {
      // Bark audio mode
      if (isPlaying) {
        pauseBark();
      } else {
        playBark();
      }
    } else {
      // Browser TTS fallback (shouldn't happen normally)
    }
  }

  // ── Bark audio playback ───────────────────
  let currentAudio = null;

  function playBark() {
    if (!audioChunks.length) return;

    isPlaying = true;
    if (els.playBtn) els.playBtn.textContent = "⏸";
    if (els.charLabel) els.charLabel.style.display = "block";

    playChunk(currentChunkIdx);
  }

  function playChunk(idx) {
    if (idx >= audioChunks.length) {
      // All done
      isPlaying = false;
      currentChunkIdx = 0;
      if (els.playBtn) els.playBtn.textContent = "▶";
      if (els.charLabel) els.charLabel.textContent = "✅ Audiobook complete";
      updateProgress(100);
      return;
    }

    const chunk = audioChunks[idx];
    currentChunkIdx = idx;

    // Show which segment is playing
    if (els.charLabel) {
      els.charLabel.textContent = `📖 ${idx + 1}/${audioChunks.length}: "${chunk.text.slice(0, 50)}..."`;
    }

    // Create and play audio element
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.removeAttribute("src");
    }

    currentAudio = new Audio(chunk.url);
    currentAudio.playbackRate = parseFloat(els.speedBtn ? els.speedBtn.textContent : "1") || 1;

    currentAudio.addEventListener("timeupdate", () => {
      if (!currentAudio.duration) return;
      const chunkProgress = currentAudio.currentTime / currentAudio.duration;
      const overallProgress = ((idx + chunkProgress) / audioChunks.length) * 100;
      updateProgress(overallProgress);

      // Update time display
      const elapsed = formatTime(currentAudio.currentTime);
      const total = formatTime(currentAudio.duration);
      if (els.timeText) els.timeText.textContent = `${elapsed} / ${total} (Seg ${idx + 1}/${audioChunks.length})`;
    });

    currentAudio.addEventListener("ended", () => {
      if (isPlaying) {
        playChunk(idx + 1);
      }
    });

    currentAudio.addEventListener("error", () => {
      console.warn(`Audio chunk ${idx + 1} failed to play`);
      if (isPlaying) playChunk(idx + 1);
    });

    currentAudio.play().catch(() => {
      if (isPlaying) playChunk(idx + 1);
    });
  }

  function pauseBark() {
    isPlaying = false;
    if (currentAudio) currentAudio.pause();
    if (els.playBtn) els.playBtn.textContent = "▶";
  }

  function stop() {
    isPlaying = false;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    currentChunkIdx = 0;
    if (els.playBtn) els.playBtn.textContent = "▶";
    updateProgress(0);
  }

  function cycleSpeed() {
    const speeds = [1.0, 1.25, 1.5, 0.75];
    const current = parseFloat(els.speedBtn ? els.speedBtn.textContent : "1") || 1;
    const idx = speeds.indexOf(current);
    const newSpeed = speeds[(idx + 1) % speeds.length];
    if (els.speedBtn) els.speedBtn.textContent = `${newSpeed}x`;

    if (currentAudio) {
      currentAudio.playbackRate = newSpeed;
    }
  }

  // ── Browser TTS fallback ──────────────────
  function showBrowserTTSPlayer(script) {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player) els.player.classList.remove("hidden");
    if (els.modeLabel) els.modeLabel.textContent = "🎧 Browser TTS";
    if (els.playBtn) els.playBtn.textContent = "▶";

    audioChunks = []; // empty = TTS mode
    
    // Store script and use old TTS approach as fallback
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    
    els.playBtn.onclick = () => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        els.playBtn.textContent = "▶";
      } else {
        window.speechSynthesis.speak(utterance);
        els.playBtn.textContent = "⏸";
      }
    };
  }

  // ── Helpers ────────────────────────────────
  function updateProgress(pct) {
    if (els.progressBar) els.progressBar.style.width = `${pct}%`;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return { init, show, hide, stop };
})();

document.addEventListener("DOMContentLoaded", () => AudioPlayer.init());
