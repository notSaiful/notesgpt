// ══════════════════════════════════════════════
// NotesGPT — Audiobook System (Edge Neural TTS MP3)
// Generates AI narration script → real MP3 via Edge TTS
// Downloadable, playable from anywhere
// ══════════════════════════════════════════════

const AudioPlayer = (() => {
  // ── State ──────────────────────────────────
  let isPlaying = false;
  let audioElement = null;

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

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    if (els.listenBtn) els.listenBtn.addEventListener("click", generate);
    if (els.playBtn)   els.playBtn.addEventListener("click", togglePlayback);
    if (els.speedBtn)  els.speedBtn.addEventListener("click", cycleSpeed);
  }

  function show() { if (els.section) els.section.classList.remove("hidden"); }
  function hide() { stop(); if (els.section) els.section.classList.add("hidden"); }

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
    if (els.charLabel) { els.charLabel.style.display = "none"; }
    if (els.loadingP) els.loadingP.textContent = "AI is writing your narration script…";
    if (els.listenBtn) {
      els.listenBtn.disabled = true;
      els.listenBtn.textContent = "⏳ Generating audiobook…";
    }

    // Remove old download button if present
    const oldDl = document.getElementById("audio-download-btn");
    if (oldDl) oldDl.remove();

    try {
      // Update loading message after a delay
      setTimeout(() => {
        if (els.loadingP) els.loadingP.textContent = "Converting to high-quality MP3 audio…";
      }, 5000);

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
      if (!res.ok) throw new Error(data.error || "Failed to generate audio.");

      if (data.type === "mp3" && data.audioUrl) {
        // ✅ Real MP3 generated — show native audio player
        showMP3Player(data);
      } else {
        // Fallback: browser TTS
        showBrowserTTSPlayer(data.script);
      }
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

  // ── Show real MP3 player ───────────────────
  function showMP3Player(data) {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player)  els.player.classList.remove("hidden");
    if (els.modeLabel) els.modeLabel.textContent = "🎧 AI Audiobook (HD)";
    if (els.playBtn) els.playBtn.textContent = "▶";
    if (els.charLabel) {
      els.charLabel.style.display = "block";
      els.charLabel.textContent = `✅ High-quality MP3 ready (~${data.estimatedMinutes || 3} min)`;
    }

    // Create hidden audio element
    if (audioElement) { audioElement.pause(); audioElement.src = ""; }
    audioElement = new Audio(data.audioUrl);
    audioElement.preload = "auto";

    // Time update
    audioElement.addEventListener("timeupdate", () => {
      if (!audioElement.duration) return;
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      if (els.progressBar) els.progressBar.style.width = `${pct}%`;

      const elapsed  = formatTime(audioElement.currentTime);
      const total    = formatTime(audioElement.duration);
      if (els.timeText) els.timeText.textContent = `${elapsed} / ${total}`;
    });

    audioElement.addEventListener("ended", () => {
      isPlaying = false;
      if (els.playBtn) els.playBtn.textContent = "▶";
      if (els.charLabel) els.charLabel.textContent = "✅ Audiobook complete! Great revision session.";
    });

    audioElement.addEventListener("error", () => {
      if (els.charLabel) {
        els.charLabel.textContent = "⚠️ Audio failed to load. Try regenerating.";
      }
    });

    // Add download button
    const downloadBtn = document.createElement("button");
    downloadBtn.id = "audio-download-btn";
    downloadBtn.className = "btn btn--outline";
    downloadBtn.style.cssText = "margin-top:12px; font-size:0.85rem;";
    downloadBtn.textContent = "⬇ Download MP3";
    downloadBtn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = `NotesGPT_${(window.currentChapter || "audiobook").replace(/\s+/g, "_")}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    // Insert download button after the player
    const playerEl = els.player;
    if (playerEl && playerEl.parentNode) {
      // Remove old download btn if any
      const existing = document.getElementById("audio-download-btn");
      if (existing) existing.remove();
      playerEl.parentNode.insertBefore(downloadBtn, playerEl.nextSibling);
    }

    // Auto-start
    setTimeout(() => {
      audioElement.play().then(() => {
        isPlaying = true;
        if (els.playBtn) els.playBtn.textContent = "⏸";
      }).catch(() => {});
    }, 300);
  }

  // ── Playback controls ─────────────────────
  function togglePlayback() {
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
      isPlaying = false;
      if (els.playBtn) els.playBtn.textContent = "▶";
    } else {
      audioElement.play().catch(() => {});
      isPlaying = true;
      if (els.playBtn) els.playBtn.textContent = "⏸";
    }
  }

  function stop() {
    isPlaying = false;
    if (audioElement) { audioElement.pause(); audioElement.currentTime = 0; }
    if (els.playBtn) els.playBtn.textContent = "▶";
    if (els.progressBar) els.progressBar.style.width = "0%";
  }

  function cycleSpeed() {
    const speeds = [1.0, 1.25, 1.5, 1.75, 0.75];
    const current = audioElement ? audioElement.playbackRate : 1;
    const idx = speeds.indexOf(current);
    const newSpeed = speeds[(idx + 1) % speeds.length];
    if (els.speedBtn) els.speedBtn.textContent = `${newSpeed}x`;
    if (audioElement) audioElement.playbackRate = newSpeed;
  }

  // ── Browser TTS fallback ──────────────────
  function showBrowserTTSPlayer(script) {
    if (els.loading) els.loading.classList.add("hidden");
    if (els.player)  els.player.classList.remove("hidden");
    if (els.modeLabel) els.modeLabel.textContent = "🎧 Browser TTS (Fallback)";
    if (els.playBtn) els.playBtn.textContent = "▶";
    if (els.charLabel) {
      els.charLabel.style.display = "block";
      els.charLabel.textContent = "📖 Using browser voice (MP3 generation unavailable)";
    }

    // Split into chunks to avoid Chrome 15s bug
    const sentences = script.match(/[^.!?…]+[.!?…]+["']?\s*/g) || [script];
    const chunks = [];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > 200 && buf.trim()) { chunks.push(buf.trim()); buf = s; }
      else buf += s;
    }
    if (buf.trim()) chunks.push(buf.trim());

    let chunkIdx = 0;
    let speaking = false;

    function speakNext() {
      if (chunkIdx >= chunks.length) {
        speaking = false;
        if (els.playBtn) els.playBtn.textContent = "▶";
        if (els.charLabel) els.charLabel.textContent = "✅ Done";
        return;
      }
      const utt = new SpeechSynthesisUtterance(chunks[chunkIdx]);
      utt.rate = 1.0;
      utt.onend = () => { chunkIdx++; if (speaking) speakNext(); };
      utt.onerror = () => { chunkIdx++; if (speaking) speakNext(); };
      window.speechSynthesis.speak(utt);
    }

    if (els.playBtn) {
      els.playBtn.onclick = () => {
        if (speaking) {
          window.speechSynthesis.cancel();
          speaking = false;
          els.playBtn.textContent = "▶";
        } else {
          speaking = true;
          els.playBtn.textContent = "⏸";
          speakNext();
        }
      };
    }
  }

  // ── Helpers ────────────────────────────────
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return { init, show, hide, stop };
})();

document.addEventListener("DOMContentLoaded", () => AudioPlayer.init());
