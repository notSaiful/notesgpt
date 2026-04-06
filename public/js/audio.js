// ══════════════════════════════════════════════
// NotesGPT — Audiobook System (Web Speech API)
// Generates AI narration script → plays via browser TTS
// Proper chunking, voice selection, progress tracking
// ══════════════════════════════════════════════

const AudioPlayer = (() => {
  // ── State ──────────────────────────────────
  let sentences   = [];   // array of sentence strings
  let currentIdx  = 0;
  let isPlaying   = false;
  let isPaused    = false;
  let playbackRate = 1.0;
  let selectedVoice = null;
  let utteranceInProgress = null;
  let fullScript  = "";

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section     = document.getElementById("audiobook-section");
    els.listenBtn   = document.getElementById("audio-quick-btn");
    els.player      = document.getElementById("audio-player");
    els.playBtn     = document.getElementById("audio-play-btn");
    els.progressBar = document.getElementById("audio-progress-fill");
    els.timeText    = document.getElementById("audio-time");
    els.speedBtn    = document.getElementById("audio-speed-btn");
    els.loading     = document.getElementById("audio-gen-loading");
    els.modeLabel   = document.getElementById("audio-mode-label");
    els.charLabel   = document.getElementById("audio-char-label");
    els.loadingP    = els.loading ? els.loading.querySelector("p") : null;
  }

  // ── Pick best available voice ──────────────
  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // Priority order — best sounding voices for English narration
    const preferred = [
      "Google UK English Female",
      "Google US English",
      "Google UK English Male",
      "Microsoft Zira - English (United States)",
      "Microsoft David - English (United States)",
      "Samantha",
      "Karen",
      "Daniel",
    ];

    for (const name of preferred) {
      const v = voices.find(v => v.name === name);
      if (v) return v;
    }

    // Fallback: first English voice
    return voices.find(v => v.lang.startsWith("en")) || voices[0];
  }

  // ── Split script into sentence chunks ──────
  // Keeps chunks ≤200 chars to avoid Chrome's 15s TTS timeout bug
  function splitIntoChunks(text) {
    // Split on sentence boundaries
    const raw = text.match(/[^.!?…]+[.!?…]+["']?\s*/g) || [text];
    const chunks = [];
    let buffer = "";

    for (const sentence of raw) {
      if ((buffer + sentence).length > 200 && buffer.trim()) {
        chunks.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer += sentence;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    if (els.listenBtn) els.listenBtn.addEventListener("click", generate);
    if (els.playBtn)   els.playBtn.addEventListener("click", togglePlayback);
    if (els.speedBtn)  els.speedBtn.addEventListener("click", cycleSpeed);

    // Load voices (Chrome loads them asynchronously)
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        selectedVoice = pickVoice();
      };
    }
    selectedVoice = pickVoice();
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
    const summaryText = notesEl ? notesEl.innerText.slice(0, 4000) : "";
    if (!summaryText.trim()) {
      alert("No summary found. Please generate your notes first.");
      return;
    }

    // Reset state
    stop();
    if (els.player)  els.player.classList.add("hidden");
    if (els.loading) els.loading.classList.remove("hidden");
    if (els.charLabel) { els.charLabel.style.display = "none"; els.charLabel.textContent = ""; }
    if (els.loadingP) els.loadingP.textContent = "AI is writing your narration script…";
    if (els.listenBtn) {
      els.listenBtn.disabled = true;
      els.listenBtn.textContent = "⏳ Generating script…";
    }

    try {
      const res = await fetch("/api/generate-audio-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum || "10",
          subject:  window.currentSubject  || "",
          chapter:  window.currentChapter  || "",
          summaryText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate script.");

      fullScript = data.script || summaryText;
      sentences  = splitIntoChunks(fullScript);
      currentIdx = 0;

      const mins = data.estimatedMinutes || Math.ceil(sentences.length * 0.12);
      showPlayer(mins);

      // Auto-start playing
      setTimeout(() => startPlayback(), 300);

    } catch (err) {
      if (els.loading) els.loading.classList.add("hidden");
      if (els.charLabel) {
        els.charLabel.style.display = "block";
        els.charLabel.textContent   = "❌ " + err.message;
      }
    } finally {
      if (els.listenBtn) {
        els.listenBtn.disabled    = false;
        els.listenBtn.textContent = "▶ Generate & Listen";
      }
    }
  }

  // ── Show player UI ─────────────────────────
  function showPlayer(estimatedMins) {
    if (els.loading)   els.loading.classList.add("hidden");
    if (els.player)    els.player.classList.remove("hidden");
    if (els.modeLabel) els.modeLabel.textContent = "🎧 AI Audiobook";
    if (els.playBtn)   els.playBtn.textContent = "⏸";
    if (els.timeText)  els.timeText.textContent = `~${estimatedMins || 3} min`;
    if (els.charLabel) {
      els.charLabel.style.display = "block";
      els.charLabel.textContent   = "📖 Preparing narration…";
    }
  }

  // ── Playback ───────────────────────────────
  function startPlayback() {
    isPlaying = true;
    isPaused  = false;
    if (els.playBtn) els.playBtn.textContent = "⏸";
    speakChunk(currentIdx);
  }

  function speakChunk(idx) {
    if (idx >= sentences.length) {
      onComplete();
      return;
    }

    currentIdx = idx;
    updateProgress(idx);

    if (els.charLabel) {
      const preview = sentences[idx].slice(0, 60);
      els.charLabel.textContent = `📖 ${idx + 1}/${sentences.length}: "${preview}…"`;
    }

    // Cancel any existing utterance
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentences[idx]);
    utterance.rate  = playbackRate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Re-pick voice each utterance (Chrome sometimes loses it)
    if (!selectedVoice) selectedVoice = pickVoice();
    if (selectedVoice)  utterance.voice = selectedVoice;

    utterance.onend = () => {
      if (isPlaying && !isPaused) {
        speakChunk(idx + 1);
      }
    };

    utterance.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      console.warn("TTS error:", e.error, "— skipping chunk", idx);
      if (isPlaying && !isPaused) speakChunk(idx + 1);
    };

    utteranceInProgress = utterance;
    window.speechSynthesis.speak(utterance);

    // Chrome bug workaround: speechSynthesis pauses after ~15s in background
    // Keep it alive by nudging it every 10s
    if (!window._ttsBugFix) {
      window._ttsBugFix = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    }
  }

  function togglePlayback() {
    if (!sentences.length) return;

    if (isPlaying && !isPaused) {
      // Pause
      window.speechSynthesis.pause();
      isPlaying = false;
      isPaused  = true;
      if (els.playBtn) els.playBtn.textContent = "▶";
    } else if (isPaused) {
      // Resume from pause
      window.speechSynthesis.resume();
      isPlaying = true;
      isPaused  = false;
      if (els.playBtn) els.playBtn.textContent = "⏸";
    } else {
      // Fresh start or restart
      startPlayback();
    }
  }

  function stop() {
    isPlaying = false;
    isPaused  = false;
    window.speechSynthesis.cancel();
    utteranceInProgress = null;
    currentIdx = 0;
    if (window._ttsBugFix) { clearInterval(window._ttsBugFix); window._ttsBugFix = null; }
    if (els.playBtn)    els.playBtn.textContent = "▶";
    updateProgress(0);
  }

  function onComplete() {
    isPlaying  = false;
    isPaused   = false;
    currentIdx = 0;
    if (window._ttsBugFix) { clearInterval(window._ttsBugFix); window._ttsBugFix = null; }
    if (els.playBtn)   els.playBtn.textContent = "▶";
    if (els.charLabel) els.charLabel.textContent = "✅ Audiobook complete! Great revision session.";
    if (els.timeText)  els.timeText.textContent = "Done";
    updateProgress(100);
  }

  // ── Speed control ──────────────────────────
  function cycleSpeed() {
    const speeds = [1.0, 1.25, 1.5, 1.75, 0.75];
    const idx    = speeds.indexOf(playbackRate);
    playbackRate  = speeds[(idx + 1) % speeds.length];
    if (els.speedBtn) els.speedBtn.textContent = `${playbackRate}x`;

    // Restart current chunk at new speed (cancel & re-speak)
    if (isPlaying && !isPaused) {
      window.speechSynthesis.cancel();
      speakChunk(currentIdx);
    }
  }

  // ── Progress bar ───────────────────────────
  function updateProgress(idx) {
    if (!els.progressBar || !sentences.length) return;
    const pct = Math.round((idx / sentences.length) * 100);
    els.progressBar.style.width = `${pct}%`;
  }

  return { init, show, hide, stop };
})();

document.addEventListener("DOMContentLoaded", () => AudioPlayer.init());
