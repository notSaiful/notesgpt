// ══════════════════════════════════════════════
// NotesGPT — Audiobook System (Neural TTS MP3)
// Generates AI narration → Microsoft Neural voice MP3
// Falls back to browser TTS if MP3 generation fails
// ══════════════════════════════════════════════

const AudioPlayer = (() => {
  // ── State ──────────────────────────────────
  let isPlaying   = false;
  let isPaused    = false;
  let playbackRate = 1.0;
  let audioElement = null;  // HTML5 <audio> for MP3
  let mode = "idle";        // idle | audio-file | text-only

  // Browser TTS fallback state
  let sentences = [];
  let currentIdx = 0;
  let selectedVoice = null;
  let utteranceInProgress = null;

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

  // ── Pick best browser voice (fallback) ─────
  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const preferred = [
      "Google UK English Female", "Google US English",
      "Google UK English Male", "Samantha", "Karen", "Daniel",
    ];
    for (const name of preferred) {
      const v = voices.find(v => v.name === name);
      if (v) return v;
    }
    return voices.find(v => v.lang.startsWith("en")) || voices[0];
  }

  // ── Split text for browser TTS (fallback) ──
  function splitIntoChunks(text) {
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

    // Load browser voices (fallback)
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => { selectedVoice = pickVoice(); };
    }
    if (window.speechSynthesis) selectedVoice = pickVoice();
  }

  function show() { if (els.section) els.section.classList.remove("hidden"); }
  function hide() { stop(); if (els.section) els.section.classList.add("hidden"); }

  // ══════════════════════════════════════════════
  // GENERATE AUDIOBOOK
  // ══════════════════════════════════════════════
  async function generate() {
    const notesEl = document.getElementById("notes-content");
    const summaryText = notesEl ? notesEl.innerText.slice(0, 4000) : "";
    if (!summaryText.trim()) {
      alert("No summary found. Please generate your notes first.");
      return;
    }

    // Reset
    stop();
    if (els.player)  els.player.classList.add("hidden");
    if (els.loading) els.loading.classList.remove("hidden");
    if (els.charLabel) { els.charLabel.style.display = "none"; els.charLabel.textContent = ""; }
    if (els.loadingP) els.loadingP.textContent = "AI is generating your audiobook…";
    if (els.listenBtn) {
      els.listenBtn.disabled = true;
      els.listenBtn.textContent = "⏳ Generating audiobook…";
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
      if (!res.ok) throw new Error(data.error || "Failed to generate audiobook.");

      if (data.type === "audio-file" && data.audio_url) {
        // ── Play real MP3 audio ──
        mode = "audio-file";
        setupAudioPlayer(data.audio_url, data.estimatedMinutes || 3);
      } else if (data.script) {
        // ── Fallback: browser TTS ──
        mode = "text-only";
        sentences = splitIntoChunks(data.script);
        currentIdx = 0;
        showPlayer(data.estimatedMinutes || 3, "🔊 Browser Voice");
        setTimeout(() => startBrowserTTS(), 300);
      } else {
        throw new Error("No audio data received.");
      }

    } catch (err) {
      if (els.loading) els.loading.classList.add("hidden");
      if (els.charLabel) {
        els.charLabel.style.display = "block";
        els.charLabel.textContent = "❌ " + err.message;
      }
    } finally {
      if (els.listenBtn) {
        els.listenBtn.disabled = false;
        els.listenBtn.textContent = "▶ Generate & Listen";
      }
    }
  }

  // ══════════════════════════════════════════════
  // MP3 AUDIO PLAYER (Primary — Neural TTS)
  // ══════════════════════════════════════════════
  function setupAudioPlayer(url, estimatedMins) {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player)  els.player.classList.remove("hidden");
    if (els.modeLabel) els.modeLabel.textContent = "🎧 Neural AI Voice";
    if (els.playBtn) els.playBtn.textContent = "⏸";

    // Create HTML5 audio element
    if (audioElement) { audioElement.pause(); audioElement.src = ""; }
    audioElement = new Audio(url);
    audioElement.playbackRate = playbackRate;

    // Progress tracking
    audioElement.addEventListener("timeupdate", () => {
      if (!audioElement.duration) return;
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      if (els.progressBar) els.progressBar.style.width = `${pct}%`;

      // Time display
      const cur = formatTime(audioElement.currentTime);
      const tot = formatTime(audioElement.duration);
      if (els.timeText) els.timeText.textContent = `${cur} / ${tot}`;
    });

    audioElement.addEventListener("ended", () => {
      isPlaying = false;
      isPaused = false;
      if (els.playBtn) els.playBtn.textContent = "▶";
      if (els.charLabel) els.charLabel.textContent = "✅ Audiobook complete! Great revision session.";
      if (els.progressBar) els.progressBar.style.width = "100%";
    });

    audioElement.addEventListener("error", (e) => {
      console.warn("Audio playback error:", e);
      if (els.charLabel) {
        els.charLabel.style.display = "block";
        els.charLabel.textContent = "⚠️ Audio playback failed. Try regenerating.";
      }
    });

    // Show duration once loaded
    audioElement.addEventListener("loadedmetadata", () => {
      const dur = formatTime(audioElement.duration);
      if (els.timeText) els.timeText.textContent = `0:00 / ${dur}`;
    });

    if (els.charLabel) {
      els.charLabel.style.display = "block";
      els.charLabel.textContent = "📖 Playing Neural AI narration…";
    }

    // Auto-play
    isPlaying = true;
    isPaused = false;
    audioElement.play().catch(err => {
      console.warn("Autoplay blocked:", err.message);
      isPlaying = false;
      if (els.playBtn) els.playBtn.textContent = "▶";
      if (els.charLabel) els.charLabel.textContent = "▶ Press play to start";
    });
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ══════════════════════════════════════════════
  // BROWSER TTS FALLBACK
  // ══════════════════════════════════════════════
  function startBrowserTTS() {
    isPlaying = true;
    isPaused = false;
    if (els.playBtn) els.playBtn.textContent = "⏸";
    speakChunk(currentIdx);
  }

  function speakChunk(idx) {
    if (idx >= sentences.length) {
      isPlaying = false;
      isPaused = false;
      if (els.playBtn) els.playBtn.textContent = "▶";
      if (els.charLabel) els.charLabel.textContent = "✅ Audiobook complete!";
      if (els.progressBar) els.progressBar.style.width = "100%";
      return;
    }

    currentIdx = idx;
    const pct = Math.round((idx / sentences.length) * 100);
    if (els.progressBar) els.progressBar.style.width = `${pct}%`;
    if (els.charLabel) {
      const preview = sentences[idx].slice(0, 60);
      els.charLabel.textContent = `📖 ${idx + 1}/${sentences.length}: "${preview}…"`;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentences[idx]);
    utterance.rate = playbackRate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (!selectedVoice) selectedVoice = pickVoice();
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onend = () => {
      if (isPlaying && !isPaused) speakChunk(idx + 1);
    };
    utterance.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      if (isPlaying && !isPaused) speakChunk(idx + 1);
    };

    utteranceInProgress = utterance;
    window.speechSynthesis.speak(utterance);

    // Chrome bug workaround
    if (!window._ttsBugFix) {
      window._ttsBugFix = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    }
  }

  // ══════════════════════════════════════════════
  // SHARED CONTROLS
  // ══════════════════════════════════════════════
  function showPlayer(estimatedMins, label) {
    if (els.loading)   els.loading.classList.add("hidden");
    if (els.player)    els.player.classList.remove("hidden");
    if (els.modeLabel) els.modeLabel.textContent = label || "🎧 AI Audiobook";
    if (els.playBtn)   els.playBtn.textContent = "⏸";
    if (els.timeText)  els.timeText.textContent = `~${estimatedMins || 3} min`;
    if (els.charLabel) {
      els.charLabel.style.display = "block";
      els.charLabel.textContent = "📖 Preparing narration…";
    }
  }

  function togglePlayback() {
    if (mode === "audio-file" && audioElement) {
      if (isPlaying && !isPaused) {
        audioElement.pause();
        isPlaying = false;
        isPaused = true;
        if (els.playBtn) els.playBtn.textContent = "▶";
      } else {
        audioElement.play();
        isPlaying = true;
        isPaused = false;
        if (els.playBtn) els.playBtn.textContent = "⏸";
      }
    } else if (mode === "text-only") {
      if (isPlaying && !isPaused) {
        window.speechSynthesis.pause();
        isPlaying = false;
        isPaused = true;
        if (els.playBtn) els.playBtn.textContent = "▶";
      } else if (isPaused) {
        window.speechSynthesis.resume();
        isPlaying = true;
        isPaused = false;
        if (els.playBtn) els.playBtn.textContent = "⏸";
      } else {
        startBrowserTTS();
      }
    }
  }

  function stop() {
    isPlaying = false;
    isPaused = false;
    mode = "idle";

    // Stop MP3
    if (audioElement) {
      audioElement.pause();
      audioElement.src = "";
      audioElement = null;
    }

    // Stop browser TTS
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    utteranceInProgress = null;
    currentIdx = 0;
    sentences = [];

    if (window._ttsBugFix) { clearInterval(window._ttsBugFix); window._ttsBugFix = null; }
    if (els.playBtn) els.playBtn.textContent = "▶";
    if (els.progressBar) els.progressBar.style.width = "0%";
  }

  function cycleSpeed() {
    const speeds = [1.0, 1.25, 1.5, 1.75, 0.75];
    const idx = speeds.indexOf(playbackRate);
    playbackRate = speeds[(idx + 1) % speeds.length];
    if (els.speedBtn) els.speedBtn.textContent = `${playbackRate}x`;

    if (mode === "audio-file" && audioElement) {
      audioElement.playbackRate = playbackRate;
    } else if (mode === "text-only" && isPlaying && !isPaused) {
      window.speechSynthesis.cancel();
      speakChunk(currentIdx);
    }
  }

  return { init, show, hide, stop };
})();

document.addEventListener("DOMContentLoaded", () => AudioPlayer.init());
