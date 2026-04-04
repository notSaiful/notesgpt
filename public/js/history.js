// ══════════════════════════════════════════════
// NotesGPT — Saved History System (v3 – Cloud Sync + Local Fallback)
// ══════════════════════════════════════════════

const History = (() => {
  const STORAGE_KEY = "notesgpt_history";
  const CONTENT_KEY = "notesgpt_content";
  const MAX_ITEMS = 50;

  // ── Get all history (local) ────────────────
  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }

  // ── Get stored content for a chapter ───────
  function getContent(classNum, subject, chapter) {
    try {
      const all = JSON.parse(localStorage.getItem(CONTENT_KEY)) || {};
      const key = `${classNum}_${subject}_${chapter}`;
      return all[key] || null;
    } catch { return null; }
  }

  // ── Save generated content for a chapter ───
  function saveContent(classNum, subject, chapter, type, data) {
    try {
      const all = JSON.parse(localStorage.getItem(CONTENT_KEY)) || {};
      const key = `${classNum}_${subject}_${chapter}`;
      if (!all[key]) all[key] = {};
      all[key][type] = data;
      all[key].lastUpdated = Date.now();
      localStorage.setItem(CONTENT_KEY, JSON.stringify(all));
    } catch {}
  }

  // ── Save a generation ──────────────────────
  function save(entry) {
    const all = getAll();

    const existIdx = all.findIndex(
      h => h.classNum === entry.classNum &&
           h.subject === entry.subject &&
           h.chapter === entry.chapter
    );

    const record = {
      id: existIdx >= 0 ? all[existIdx].id : Date.now(),
      classNum: entry.classNum,
      subject: entry.subject,
      chapter: entry.chapter,
      type: entry.type || "summary",
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric"
      }),
      timeStr: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit"
      }),
      preview: (entry.preview || "").slice(0, 120),
      testScore: entry.testScore || null,
      accuracy: entry.accuracy || null,
      arenaScore: entry.arenaScore || null,
      arenaStreak: entry.arenaStreak || null,
    };

    if (existIdx >= 0) {
      all[existIdx] = { ...all[existIdx], ...record };
    } else {
      all.unshift(record);
    }

    if (all.length > MAX_ITEMS) all.length = MAX_ITEMS;

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}

    // Cloud sync: save to server if logged in
    _cloudSave(entry);
  }

  // ── Delete entry ───────────────────────────
  function remove(id) {
    const all = getAll().filter(h => h.id !== id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
  }

  // ── Clear all ──────────────────────────────
  function clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CONTENT_KEY);
    } catch {}
    // Cloud sync: clear on server
    _cloudClear();
  }

  // ═══════════════════════════════════════════
  // CLOUD SYNC (Firebase/Firestore via API)
  // ═══════════════════════════════════════════

  async function _getAuthToken() {
    if (typeof Auth !== "undefined" && Auth.isLoggedIn()) {
      return await Auth.getToken();
    }
    return null;
  }

  async function _cloudSave(entry) {
    const token = await _getAuthToken();
    if (!token) return;
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classNum: entry.classNum,
          subject: entry.subject,
          chapter: entry.chapter,
          topic: entry.topic || "",
          step: entry.type || "summary",
          data: { 
            preview: (entry.preview || "").slice(0, 200),
            arenaScore: entry.arenaScore || null,
            arenaStreak: entry.arenaStreak || null,
          },
        }),
      });
    } catch (err) {
      console.warn("Cloud save failed:", err.message);
    }
  }

  async function _cloudClear() {
    const token = await _getAuthToken();
    if (!token) return;
    try {
      await fetch("/api/history", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn("Cloud clear failed:", err.message);
    }
  }

  // Fetch history from cloud and merge with local
  async function syncFromCloud() {
    const token = await _getAuthToken();
    if (!token) return;
    try {
      const res = await fetch("/api/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.history && data.history.length > 0) {
        const local = getAll();
        const merged = [...local];
        // Add cloud entries not already in local
        for (const cloud of data.history) {
          const cloudClass = cloud.class_num || cloud.classNum;
          const cloudSubject = cloud.subject;
          const cloudChapter = cloud.chapter;
          const exists = merged.some(
            l => l.classNum === cloudClass &&
                 l.subject === cloudSubject &&
                 l.chapter === cloudChapter
          );
          if (!exists) {
            const ts = cloud.created_at ? new Date(cloud.created_at).getTime() : Date.now();
            merged.push({
              id: Date.now() + Math.random(),
              classNum: cloud.class_num || cloud.classNum,
              subject: cloud.subject,
              chapter: cloud.chapter,
              type: "summary",
              timestamp: ts,
              dateStr: new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
              timeStr: new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
              preview: "",
              testScore: null,
              accuracy: null,
            });
          }
        }
        // Sort by timestamp descending
        merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (merged.length > MAX_ITEMS) merged.length = MAX_ITEMS;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
      }
    } catch (err) {
      console.warn("Cloud sync failed:", err.message);
    }
  }

  // ── Render history list ────────────────────
  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const all = getAll();

    if (all.length === 0) {
      container.innerHTML = `<p class="hist-empty">No saved sessions yet. Start studying to build your history!</p>`;
      return;
    }

    container.innerHTML = all.map(h => {
      const typeIcon = {
        summary: "\ud83d\udcdd", flashcards: "\ud83d\udd12", practice: "\ud83d\udccb",
        test: "\ud83d\udcdd", correction: "\ud83d\udd27", arena: "\u2694\ufe0f"
      }[h.type] || "\ud83d\udcdd";

      const scoreHtml = h.testScore !== null
        ? `<span class="hist-card__score">${h.testScore}%</span>`
        : (h.arenaScore !== null ? `<span class="hist-card__score hist-card__score--arena">${h.arenaScore} pts</span>` : "");

      // Check if content is available for review
      const content = getContent(h.classNum, h.subject, h.chapter);
      const hasContent = content && (content.summary || content.flashcards || content.testResults);

      return `
        <div class="hist-card" data-id="${h.id}">
          <div class="hist-card__icon">${typeIcon}</div>
          <div class="hist-card__info">
            <div class="hist-card__title">Class ${h.classNum} \u00b7 ${h.subject}</div>
            <div class="hist-card__chapter">${h.chapter}</div>
            <div class="hist-card__meta">${h.dateStr} \u00b7 ${h.timeStr}</div>
          </div>
          ${scoreHtml}
          <div class="hist-card__buttons">
            ${hasContent ? `<button class="hist-card__resume" onclick="History.resume(${h.id})">\ud83d\udcd6 Resume</button>` : `<button class="hist-card__resume" onclick="History.regenerate(${h.id})">\ud83d\udd04 Regenerate</button>`}
            <button class="hist-card__revise" onclick="History.revise(${h.id})">\ud83d\udd04 Revise</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // ── Resume a session (show stored content) ─
  function resume(id) {
    const all = getAll();
    const entry = all.find(h => h.id === id);
    if (!entry) return;

    const content = getContent(entry.classNum, entry.subject, entry.chapter);
    if (!content) {
      regenerate(id);
      return;
    }

    // Set current session
    window.currentClassNum = entry.classNum;
    window.currentSubject = entry.subject;
    window.currentChapter = entry.chapter;

    // Build review HTML
    const reviewContent = document.getElementById("review-content");
    const reviewTitle = document.getElementById("review-title");
    if (!reviewContent || !reviewTitle) return;

    reviewTitle.textContent = `\ud83d\udcd6 ${entry.subject} \u2014 ${entry.chapter} (Class ${entry.classNum})`;

    let html = "";

    // Summary
    if (content.summary) {
      html += `
        <div class="review-block">
          <h3 class="review-block__title">\ud83d\udcdd Summary Notes</h3>
          <div class="review-block__body notes-content">${content.summary}</div>
        </div>
      `;
    }

    // Flashcards
    if (content.flashcards && content.flashcards.length > 0) {
      html += `
        <div class="review-block">
          <h3 class="review-block__title">\ud83d\udd12 Flashcards (${content.flashcards.length} cards)</h3>
          <div class="review-block__body review-fc-list">
            ${content.flashcards.map((fc, i) => `
              <div class="review-fc">
                <div class="review-fc__q"><strong>Q${i+1}:</strong> ${fc.question}</div>
                <div class="review-fc__a"><strong>A:</strong> ${fc.answer}</div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    // Test Results
    if (content.testResults) {
      const tr = content.testResults;
      html += `
        <div class="review-block">
          <h3 class="review-block__title">\ud83d\udcca Test Results</h3>
          <div class="review-block__body">
            <p><strong>Score:</strong> ${tr.score || "N/A"} / ${tr.total || "N/A"} (${tr.accuracy || "N/A"}%)</p>
            ${tr.weakAreas ? `<p><strong>Weak Areas:</strong> ${tr.weakAreas}</p>` : ""}
          </div>
        </div>
      `;
    }

    // Mind Map
    if (content.mindmap) {
      html += `
        <div class="review-block">
          <h3 class="review-block__title">\ud83d\uddfa\ufe0f Mind Map Data</h3>
          <div class="review-block__body">
            <p>Mind map was generated for this chapter.</p>
          </div>
        </div>
      `;
    }

    if (!html) {
      html = '<p class="hist-empty">No stored content found. Try regenerating.</p>';
    }

    reviewContent.innerHTML = html;

    // Show review section
    if (typeof setGlobalView === "function") setGlobalView("review");
  }

  // ── Regenerate (re-submit form) ────────────
  function regenerate(id) {
    const all = getAll();
    const entry = all.find(h => h.id === id);
    if (!entry) return;

    window.currentClassNum = entry.classNum;
    window.currentSubject = entry.subject;
    window.currentChapter = entry.chapter;

    const classSelect = document.getElementById("class-select");
    const subjectSelect = document.getElementById("subject-select");
    const chapterSelect = document.getElementById("chapter-select");

    if (classSelect) classSelect.value = entry.classNum;
    if (chapterSelect) chapterSelect.value = entry.chapter;

    const form = document.getElementById("notes-form");
    if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }

  // ── Revise (launch revision tools) ─────────
  function revise(id) {
    const all = getAll();
    const entry = all.find(h => h.id === id);
    if (!entry) return;

    window.currentClassNum = entry.classNum;
    window.currentSubject = entry.subject;
    window.currentChapter = entry.chapter;

    // Open YouTube video for this chapter
    if (typeof VideoHelp !== "undefined") {
      VideoHelp.show("");
    }

    // Show audio section
    if (typeof AudioPlayer !== "undefined") {
      AudioPlayer.show();
    }

    // Show music section
    if (typeof MusicPlayer !== "undefined") {
      MusicPlayer.show();
    }

    // Navigate to test-results view which shows revision tools
    if (typeof setGlobalView === "function") {
      setGlobalView("test-results");
    }

    // Scroll to audio section
    const audioSection = document.getElementById("audio-section");
    if (audioSection) {
      setTimeout(() => {
        audioSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }

  return { getAll, save, saveContent, getContent, remove, clearAll, render, resume, regenerate, revise, syncFromCloud };
})();
