// ══════════════════════════════════════════════
// NotesGPT — Audio Learning System (v2 – Engaging)
// ══════════════════════════════════════════════

const AudioPlayer = (() => {
  // ── State ──────────────────────────────────
  let currentScript = "";
  let currentMode = "quick";
  let isPlaying = false;
  let isPaused = false;
  let rate = 1.0;
  let progress = 0;
  let totalChunks = 0;
  let currentChunk = 0;
  let chunks = [];
  let voices = [];

  // Voice characters
  const CHARACTERS = {
    teacher: { pitch: 1.0, rate: 0.95, name: "Teacher" },
    student: { pitch: 1.35, rate: 1.05, name: "Student" },
    narrator: { pitch: 0.85, rate: 0.9, name: "Narrator" },
  };

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("audio-section");
    els.quickBtn = document.getElementById("audio-quick-btn");
    els.podcastBtn = document.getElementById("audio-podcast-btn");
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

    if (els.quickBtn) els.quickBtn.addEventListener("click", () => generateScript("quick"));
    if (els.podcastBtn) els.podcastBtn.addEventListener("click", () => generateScript("podcast"));
    if (els.playBtn) els.playBtn.addEventListener("click", togglePlayback);
    if (els.speedBtn) els.speedBtn.addEventListener("click", cycleSpeed);

    // Load voices
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function loadVoices() {
    voices = window.speechSynthesis.getVoices();
  }

  function getVoice(character) {
    if (!voices.length) loadVoices();

    if (character === "student") {
      // Prefer a female/younger voice for student
      return voices.find(v => v.lang.startsWith("en") && /female|samantha|karen|victoria|fiona/i.test(v.name))
        || voices.find(v => v.lang.startsWith("en"))
        || voices[0];
    }
    if (character === "narrator") {
      // Deeper, authoritative voice
      return voices.find(v => v.lang.startsWith("en") && /daniel|alex|tom|james|fred/i.test(v.name))
        || voices.find(v => v.lang.startsWith("en"))
        || voices[0];
    }
    // Teacher: clear, default voice
    return voices.find(v => v.lang.startsWith("en") && /google|samantha|daniel|premium/i.test(v.name))
      || voices.find(v => v.lang.startsWith("en"))
      || voices[0];
  }

  function show() {
    if (els.section) els.section.classList.remove("hidden");
  }

  function hide() {
    stop();
    if (els.section) els.section.classList.add("hidden");
  }

  // ── Generate script ────────────────────────
  async function generateScript(mode) {
    currentMode = mode;

    // Check cache
    const key = `audio_${window.currentClassNum}_${window.currentSubject}_${window.currentChapter}_${mode}`;
    const cached = localStorage.getItem(key);
    if (cached) {
      currentScript = cached;
      preparePlayback();
      return;
    }

    const notesEl = document.getElementById("notes-content");
    const summaryText = notesEl ? notesEl.innerText.slice(0, 3000) : "";
    if (!summaryText) return;

    els.player.classList.add("hidden");
    els.loading.classList.remove("hidden");

    els.quickBtn.classList.toggle("btn--accent", mode === "quick");
    els.quickBtn.classList.toggle("btn--outline", mode !== "quick");
    els.podcastBtn.classList.toggle("btn--accent", mode === "podcast");
    els.podcastBtn.classList.toggle("btn--outline", mode !== "podcast");

    try {
      const res = await fetch("/api/generate-audio-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum || "10",
          subject: window.currentSubject || "",
          chapter: window.currentChapter || "",
          summaryText,
          mode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");

      currentScript = data.script;
      try { localStorage.setItem(key, currentScript); } catch {}

      preparePlayback();
    } catch (err) {
      els.loading.classList.add("hidden");
      els.player.classList.remove("hidden");
      alert("Audio error: " + err.message);
    }
  }

  // ── Prepare playback ──────────────────────
  function preparePlayback() {
    stop();
    els.loading.classList.add("hidden");
    els.player.classList.remove("hidden");
    els.modeLabel.textContent = currentMode === "podcast" ? "🎙 Podcast" : "🎧 Quick";
    els.playBtn.textContent = "▶";

    if (currentMode === "podcast") {
      // Parse dialogue into character chunks
      chunks = parsePodcastScript(currentScript);
    } else {
      // Narrator-style chunks
      chunks = splitIntoChunks(currentScript, 200).map(c => ({
        text: c,
        character: "narrator",
      }));
    }

    totalChunks = chunks.length;
    currentChunk = 0;
    progress = 0;
    updateProgress();
    updateCharLabel("");

    const words = currentScript.split(/\s+/).length;
    const mins = Math.ceil(words / (140 * rate));
    els.timeText.textContent = `~${mins} min`;
  }

  // ── Parse podcast into teacher/student ─────
  function parsePodcastScript(text) {
    const lines = text.split("\n").filter(l => l.trim());
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      let character = "narrator";
      let dialogue = trimmed;

      if (/^(teacher|sir|professor|mentor)\s*[:]/i.test(trimmed)) {
        character = "teacher";
        dialogue = trimmed.replace(/^(teacher|sir|professor|mentor)\s*[:]\s*/i, "");
      } else if (/^(student|pupil|learner)\s*[:]/i.test(trimmed)) {
        character = "student";
        dialogue = trimmed.replace(/^(student|pupil|learner)\s*[:]\s*/i, "");
      }

      if (dialogue.trim()) {
        // Split long dialogue into manageable chunks
        const subChunks = splitIntoChunks(dialogue, 180);
        subChunks.forEach(c => result.push({ text: c, character }));
      }
    }

    return result.length > 0 ? result : [{ text: text, character: "narrator" }];
  }

  // ── Split text ─────────────────────────────
  function splitIntoChunks(text, maxLen) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const result = [];
    let current = "";
    for (const sentence of sentences) {
      if ((current + sentence).length > maxLen && current) {
        result.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  // ── Playback controls ─────────────────────
  function togglePlayback() {
    if (isPlaying && !isPaused) pause();
    else if (isPaused) resume();
    else play();
  }

  function play() {
    if (!chunks.length) return;
    window.speechSynthesis.cancel();
    currentChunk = 0;
    isPlaying = true;
    isPaused = false;
    els.playBtn.textContent = "⏸";
    speakChunk();
  }

  function speakChunk() {
    if (currentChunk >= totalChunks) {
      stop();
      updateCharLabel("✅ Complete");
      return;
    }

    const chunk = chunks[currentChunk];
    const charConfig = CHARACTERS[chunk.character] || CHARACTERS.narrator;
    const utterance = new SpeechSynthesisUtterance(chunk.text);

    utterance.rate = charConfig.rate * rate;
    utterance.pitch = charConfig.pitch;
    utterance.volume = 1.0;

    const voice = getVoice(chunk.character);
    if (voice) utterance.voice = voice;

    // Show which character is speaking
    const charEmoji = chunk.character === "teacher" ? "👨‍🏫" : chunk.character === "student" ? "🙋" : "🎙";
    updateCharLabel(`${charEmoji} ${charConfig.name} speaking...`);

    utterance.onend = () => {
      currentChunk++;
      progress = (currentChunk / totalChunks) * 100;
      updateProgress();
      if (isPlaying && !isPaused) {
        // Small pause between character switches for podcast
        if (currentMode === "podcast" && currentChunk < totalChunks) {
          const nextChar = chunks[currentChunk].character;
          if (nextChar !== chunk.character) {
            setTimeout(speakChunk, 400);
            return;
          }
        }
        speakChunk();
      }
    };

    utterance.onerror = () => {
      currentChunk++;
      if (isPlaying && !isPaused) speakChunk();
    };

    window.speechSynthesis.speak(utterance);
  }

  function pause() {
    window.speechSynthesis.pause();
    isPaused = true;
    els.playBtn.textContent = "▶";
  }

  function resume() {
    window.speechSynthesis.resume();
    isPaused = false;
    els.playBtn.textContent = "⏸";
  }

  function stop() {
    window.speechSynthesis.cancel();
    isPlaying = false;
    isPaused = false;
    currentChunk = 0;
    progress = 0;
    if (els.playBtn) els.playBtn.textContent = "▶";
    updateProgress();
    updateCharLabel("");
  }

  function cycleSpeed() {
    const speeds = [1.0, 1.25, 1.5, 0.75];
    const idx = speeds.indexOf(rate);
    rate = speeds[(idx + 1) % speeds.length];
    els.speedBtn.textContent = `${rate}x`;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      isPaused = false;
      speakChunk();
    }

    const words = currentScript.split(/\s+/).length;
    const mins = Math.ceil(words / (140 * rate));
    els.timeText.textContent = `~${mins} min`;
  }

  function updateProgress() {
    if (els.progressBar) els.progressBar.style.width = `${progress}%`;
  }

  function updateCharLabel(text) {
    if (els.charLabel) {
      els.charLabel.textContent = text;
      els.charLabel.style.display = text ? "block" : "none";
    }
  }

  return { init, show, hide, stop };
})();

document.addEventListener("DOMContentLoaded", () => {
  AudioPlayer.init();
  window.speechSynthesis.getVoices();
});
