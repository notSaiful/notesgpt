// ══════════════════════════════════════════════
// NotesGPT — Video Help System
// ══════════════════════════════════════════════

const VideoHelp = (() => {
  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("video-help-section");
    els.cards = document.getElementById("video-cards");
    els.loading = document.getElementById("video-loading");
    els.closeBtn = document.getElementById("video-close");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    if (els.closeBtn) {
      els.closeBtn.addEventListener("click", hide);
    }
  }

  // ── Show videos for a topic ────────────────
  async function show(topic) {
    if (!els.section) return;

    els.section.classList.remove("hidden");
    els.loading.classList.remove("hidden");
    els.cards.innerHTML = "";
    els.section.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      const res = await fetch("/api/get-video-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classNum: window.currentClassNum || "10",
          subject: window.currentSubject || "",
          chapter: window.currentChapter || "",
          topic: topic || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch videos.");

      renderCards(data.videos || []);
    } catch (err) {
      els.cards.innerHTML = `<p class="vid-error">Could not load videos. Try again later.</p>`;
    } finally {
      els.loading.classList.add("hidden");
    }
  }

  // ── Render video cards ─────────────────────
  function renderCards(videos) {
    if (videos.length === 0) {
      els.cards.innerHTML = `<p class="vid-error">No videos found for this topic.</p>`;
      return;
    }

    els.cards.innerHTML = videos.map((v, i) => {
      const focusIcons = { concept: "📖", formula: "🔢", solving: "✍️" };
      const icon = focusIcons[v.focus] || "📺";

      return `
        <a href="${v.url}" target="_blank" rel="noopener" class="vid-card" style="animation-delay: ${i * 0.1}s">
          <div class="vid-card__thumb">
            <div class="vid-card__play">▶</div>
          </div>
          <div class="vid-card__info">
            <span class="vid-card__focus">${icon} ${v.focus}</span>
            <h4 class="vid-card__title">${v.title}</h4>
            <div class="vid-card__meta">
              <span>📺 ${v.channel_hint}</span>
              <span>⏱ ${v.duration_hint}</span>
            </div>
          </div>
        </a>
      `;
    }).join("");
  }

  // ── Hide ───────────────────────────────────
  function hide() {
    if (els.section) els.section.classList.add("hidden");
  }

  return { init, show, hide };
})();

document.addEventListener("DOMContentLoaded", () => VideoHelp.init());
