// ══════════════════════════════════════════════
// NotesGPT — Saved History System (v4 – User-Scoped)
// ── Rules:
//   • Guest (not logged in) → NEVER save anything locally or to cloud
//   • Logged-in user → save under user-specific localStorage keys
//   • Keys are scoped per userId so accounts can't collide on same browser
//   • On login: sync from cloud; on logout: wipe local state for that user
// ══════════════════════════════════════════════

const History = (() => {
  const MAX_ITEMS = 50;

  // ── Derive storage keys scoped to current user ──
  function _uid() {
    if (typeof Auth !== "undefined" && Auth.isLoggedIn()) {
      const user = Auth.getUser();
      return user?.id || user?.email || null;
    }
    return null; // guest → no key → no saves
  }

  function _storageKey() {
    const uid = _uid();
    if (!uid) return null;
    return `notesgpt_history_${uid}`;
  }

  function _contentKey() {
    const uid = _uid();
    if (!uid) return null;
    return `notesgpt_content_${uid}`;
  }

  // ── Get all history for current user ───────
  function getAll() {
    const key = _storageKey();
    if (!key) return []; // guest → always empty
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch { return []; }
  }

  // ── Get stored content for a chapter ───────
  function getContent(classNum, subject, chapter) {
    const key = _contentKey();
    if (!key) return null;
    try {
      const all = JSON.parse(localStorage.getItem(key)) || {};
      return all[`${classNum}_${subject}_${chapter}`] || null;
    } catch { return null; }
  }

  // ── Save generated content for a chapter ───
  // Only saves if user is logged in
  function saveContent(classNum, subject, chapter, type, data) {
    const key = _contentKey();
    if (!key) return; // silent no-op for guests
    try {
      const all = JSON.parse(localStorage.getItem(key)) || {};
      const k = `${classNum}_${subject}_${chapter}`;
      if (!all[k]) all[k] = {};
      all[k][type] = data;
      all[k].lastUpdated = Date.now();
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  }

  // ── Save a session entry ───────────────────
  // Only saves if user is logged in
  function save(entry) {
    const key = _storageKey();
    if (!key) return; // guest → do nothing

    const all = getAll();
    const existIdx = all.findIndex(
      h => h.classNum === entry.classNum &&
           h.subject  === entry.subject  &&
           h.chapter  === entry.chapter
    );

    const record = {
      id:       existIdx >= 0 ? all[existIdx].id : Date.now(),
      classNum: entry.classNum,
      subject:  entry.subject,
      chapter:  entry.chapter,
      type:     entry.type || "summary",
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      timeStr: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      preview:     (entry.preview || "").slice(0, 120),
      testScore:   entry.testScore   || null,
      accuracy:    entry.accuracy    || null,
      arenaScore:  entry.arenaScore  || null,
      arenaStreak: entry.arenaStreak || null,
    };

    if (existIdx >= 0) {
      all[existIdx] = { ...all[existIdx], ...record };
    } else {
      all.unshift(record);
    }

    if (all.length > MAX_ITEMS) all.length = MAX_ITEMS;
    try { localStorage.setItem(key, JSON.stringify(all)); } catch {}

    // Cloud sync
    _cloudSave(entry);
  }

  // ── Delete entry ───────────────────────────
  function remove(id) {
    const key = _storageKey();
    if (!key) return;
    const all = getAll().filter(h => h.id !== id);
    try { localStorage.setItem(key, JSON.stringify(all)); } catch {}
  }

  // ── Clear all (for current user only) ──────
  function clearAll() {
    const sKey = _storageKey();
    const cKey = _contentKey();
    try {
      if (sKey) localStorage.removeItem(sKey);
      if (cKey) localStorage.removeItem(cKey);
    } catch {}
    _cloudClear();
  }

  // ── Wipe local state when user logs out ────
  // Called from app.js on auth change to null
  function wipeLocal() {
    // We can't use _uid() here since user is already logged out.
    // Instead, scan localStorage for any notesgpt_ keys and remove them.
    // This is safe — a fresh login will re-sync from cloud.
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("notesgpt_history_") || k.startsWith("notesgpt_content_"))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }

  // ═══════════════════════════════════════════
  // CLOUD SYNC
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
          subject:  entry.subject,
          chapter:  entry.chapter,
          topic:    entry.topic || "",
          step:     entry.type  || "summary",
          data: {
            preview:     (entry.preview || "").slice(0, 200),
            arenaScore:  entry.arenaScore  || null,
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

  // Fetch history from cloud and merge into user-scoped localStorage
  async function syncFromCloud() {
    const token = await _getAuthToken();
    const key = _storageKey();
    if (!token || !key) return; // guest → skip sync

    try {
      const res = await fetch("/api/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.history && data.history.length > 0) {
        const local = getAll();
        const merged = [...local];

        for (const cloud of data.history) {
          const cloudClass   = cloud.class_num || cloud.classNum;
          const cloudSubject = cloud.subject;
          const cloudChapter = cloud.chapter;
          const exists = merged.some(
            l => l.classNum === cloudClass &&
                 l.subject  === cloudSubject &&
                 l.chapter  === cloudChapter
          );
          if (!exists) {
            const ts = cloud.created_at ? new Date(cloud.created_at).getTime() : Date.now();
            merged.push({
              id:        Date.now() + Math.random(),
              classNum:  cloudClass,
              subject:   cloudSubject,
              chapter:   cloudChapter,
              type:      "summary",
              timestamp: ts,
              dateStr: new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
              timeStr: new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
              preview:    "",
              testScore:  null,
              accuracy:   null,
            });
          }
        }

        merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (merged.length > MAX_ITEMS) merged.length = MAX_ITEMS;
        try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
      }
    } catch (err) {
      console.warn("Cloud sync failed:", err.message);
    }
  }

  // ── Render history list ────────────────────
  // Shows a "sign in to save your progress" message for guests
  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Guest: show sign-in prompt
    if (!_uid()) {
      container.innerHTML = `
        <div class="hist-guest-prompt">
          <p class="hist-empty">🔒 <strong>Sign in to save your study progress</strong></p>
          <p class="hist-empty" style="font-size:0.8rem;margin-top:4px;opacity:0.7;">Your study history, test scores, and chapter progress will be saved to your account.</p>
          <button class="btn btn--primary btn--sm" style="margin-top:12px;" onclick="Auth.showModal()">Sign In / Sign Up</button>
        </div>
      `;
      return;
    }

    const all = getAll();

    if (all.length === 0) {
      container.innerHTML = `<p class="hist-empty">No saved sessions yet. Start studying to build your history!</p>`;
      return;
    }

    container.innerHTML = all.map(h => {
      const typeIcon = {
        summary: "📝", flashcards: "🔑", practice: "📋",
        test: "📝", correction: "🔧", arena: "⚔️"
      }[h.type] || "📝";

      const scoreHtml = h.testScore !== null
        ? `<span class="hist-card__score">${h.testScore}%</span>`
        : (h.arenaScore !== null ? `<span class="hist-card__score hist-card__score--arena">${h.arenaScore} pts</span>` : "");

      const content = getContent(h.classNum, h.subject, h.chapter);
      const hasContent = content && (content.summary || content.flashcards || content.testResults);

      return `
        <div class="hist-card" data-id="${h.id}">
          <div class="hist-card__icon">${typeIcon}</div>
          <div class="hist-card__info">
            <div class="hist-card__title">Class ${h.classNum} · ${h.subject}</div>
            <div class="hist-card__chapter">${h.chapter}</div>
            <div class="hist-card__meta">${h.dateStr} · ${h.timeStr}</div>
          </div>
          ${scoreHtml}
          <div class="hist-card__buttons">
            ${hasContent
              ? `<button class="hist-card__resume" onclick="History.resume(${h.id})">📖 Resume</button>`
              : `<button class="hist-card__resume" onclick="History.regenerate(${h.id})">🔄 Regenerate</button>`
            }
            <button class="hist-card__revise" onclick="History.revise(${h.id})">🔄 Revise</button>
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
    if (!content) { regenerate(id); return; }

    window.currentClassNum = entry.classNum;
    window.currentSubject  = entry.subject;
    window.currentChapter  = entry.chapter;

    const reviewContent = document.getElementById("review-content");
    const reviewTitle   = document.getElementById("review-title");
    if (!reviewContent || !reviewTitle) return;

    reviewTitle.textContent = `📖 ${entry.subject} — ${entry.chapter} (Class ${entry.classNum})`;

    let html = "";
    if (content.summary) {
      html += `
        <div class="review-block">
          <h3 class="review-block__title">📝 Summary Notes</h3>
          <div class="review-block__body notes-content">${content.summary}</div>
        </div>
      `;
    }
    if (content.flashcards && content.flashcards.length > 0) {
      html += `
        <div class="review-block">
          <h3 class="review-block__title">🔑 Flashcards (${content.flashcards.length} cards)</h3>
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
    if (content.testResults) {
      const tr = content.testResults;
      html += `
        <div class="review-block">
          <h3 class="review-block__title">📊 Test Results</h3>
          <div class="review-block__body">
            <p><strong>Score:</strong> ${tr.score || "N/A"} / ${tr.total || "N/A"} (${tr.accuracy || "N/A"}%)</p>
            ${tr.weakAreas ? `<p><strong>Weak Areas:</strong> ${tr.weakAreas}</p>` : ""}
          </div>
        </div>
      `;
    }
    if (!html) html = '<p class="hist-empty">No stored content found. Try regenerating.</p>';

    reviewContent.innerHTML = html;
    if (typeof setGlobalView === "function") setGlobalView("review");
  }

  // ── Regenerate (re-submit form) ────────────
  function regenerate(id) {
    const all = getAll();
    const entry = all.find(h => h.id === id);
    if (!entry) return;

    window.currentClassNum = entry.classNum;
    window.currentSubject  = entry.subject;
    window.currentChapter  = entry.chapter;

    const classSelect   = document.getElementById("class-select");
    const chapterSelect = document.getElementById("chapter-select");
    if (classSelect)   classSelect.value   = entry.classNum;
    if (chapterSelect) chapterSelect.value = entry.chapter;

    const form = document.getElementById("notes-form");
    if (form) form.dispatchEvent(new Event("submit", { cancelable: true }));
  }

  // ── Revise (restore notes or regenerate) ───
  function revise(id) {
    const all = getAll();
    const entry = all.find(h => h.id === id);
    if (!entry) return;

    window.currentClassNum = entry.classNum;
    window.currentSubject  = entry.subject;
    window.currentChapter  = entry.chapter;

    const content = getContent(entry.classNum, entry.subject, entry.chapter);
    if (content && content.summary) {
      const notesEl    = document.getElementById("notes-content");
      const outputTitle = document.getElementById("output-title");
      const outputBadge = document.getElementById("output-badge");
      if (notesEl)     notesEl.innerHTML    = content.summary;
      if (outputTitle) outputTitle.textContent = entry.chapter;
      if (outputBadge) outputBadge.textContent = `Class ${entry.classNum} · ${entry.subject}`;
      if (typeof setGlobalView === "function") setGlobalView("output");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      regenerate(id);
    }
  }

  return {
    getAll, save, saveContent, getContent,
    remove, clearAll, wipeLocal,
    render, resume, regenerate, revise,
    syncFromCloud,
  };
})();
