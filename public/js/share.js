// ══════════════════════════════════════════════
// NotesGPT — Share & Viral Growth Module
// WhatsApp, Web Share API, Copy Link
// India's #1 viral loop for edu-tech apps
// ══════════════════════════════════════════════

const ShareManager = (() => {

  // ── Build shareable message ─────────────────
  function buildMessage(type, classNum, subject, chapter, score = null) {
    const base = `https://notesgpt.onrender.com/?utm_source=whatsapp&utm_medium=share&utm_campaign=${type}`;

    switch (type) {
      case "notes":
        return {
          text: `📚 Just generated AI study notes for *${chapter}* (Class ${classNum} ${subject}) on NotesGPT!\n\nGet free CBSE notes, flashcards & mock tests instantly 👇\n${base}`,
          url: base,
        };
      case "test":
        return {
          text: `🎯 I scored *${score}%* on the ${chapter} mock test on NotesGPT!\n\nTest yourself on CBSE chapters for free 👇\n${base}`,
          url: base,
        };
      case "flashcards":
        return {
          text: `🧠 Memorising ${chapter} (Class ${classNum}) using AI flashcards on NotesGPT. Free for all CBSE students!\n${base}`,
          url: base,
        };
      default:
        return {
          text: `📖 Free AI CBSE study notes for Class 6-12! Notes, flashcards, tests & more.\n${base}`,
          url: base,
        };
    }
  }

  // ── WhatsApp share ──────────────────────────
  function shareWhatsApp(type, classNum, subject, chapter, score = null) {
    const { text } = buildMessage(type, classNum, subject, chapter, score);
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    if (typeof GA !== "undefined") GA.send("share", { method: "whatsapp", content_type: type });
  }

  // ── Web Share API (native mobile share sheet) ─
  async function shareNative(type, classNum, subject, chapter, score = null) {
    const { text, url } = buildMessage(type, classNum, subject, chapter, score);
    if (navigator.share) {
      try {
        await navigator.share({ title: "NotesGPT", text, url });
        if (typeof GA !== "undefined") GA.send("share", { method: "native", content_type: type });
      } catch (e) {
        if (e.name !== "AbortError") shareWhatsApp(type, classNum, subject, chapter, score);
      }
    } else {
      shareWhatsApp(type, classNum, subject, chapter, score);
    }
  }

  // ── Copy link ───────────────────────────────
  function copyLink(type, classNum, subject, chapter) {
    const { url } = buildMessage(type, classNum, subject, chapter);
    navigator.clipboard.writeText(url).then(() => {
      showToast("🔗 Link copied!");
      if (typeof GA !== "undefined") GA.send("share", { method: "copy_link", content_type: type });
    });
  }

  // ── Toast notification ──────────────────────
  function showToast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#18181b;border:1px solid rgba(139,92,246,0.4);color:#f4f4f5;
      padding:10px 20px;border-radius:100px;font-size:0.85rem;font-weight:600;
      z-index:99999;pointer-events:none;animation:fadeIn 0.2s ease;
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ── Inject share bar after notes output ─────
  function injectShareBar(containerId, type, classNum, subject, chapter, score = null) {
    const container = document.getElementById(containerId);
    if (!container || container.querySelector(".share-bar")) return;

    const bar = document.createElement("div");
    bar.className = "share-bar";
    bar.innerHTML = `
      <div style="
        display:flex;align-items:center;gap:10px;flex-wrap:wrap;
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
        border-radius:12px;padding:14px 16px;margin-top:16px;
      ">
        <span style="font-size:0.82rem;color:#71717a;font-weight:600;flex:1;">
          📤 Share with your study group:
        </span>
        <button class="share-wa" style="
          background:#25D366;color:#fff;border:none;border-radius:8px;
          padding:8px 14px;font-size:0.82rem;font-weight:700;cursor:pointer;
          display:flex;align-items:center;gap:5px;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </button>
        <button class="share-copy" style="
          background:rgba(255,255,255,0.07);color:#a1a1aa;border:1px solid rgba(255,255,255,0.1);
          border-radius:8px;padding:8px 14px;font-size:0.82rem;cursor:pointer;
        ">🔗 Copy Link</button>
      </div>
    `;

    bar.querySelector(".share-wa").addEventListener("click", () => shareNative(type, classNum, subject, chapter, score));
    bar.querySelector(".share-copy").addEventListener("click", () => copyLink(type, classNum, subject, chapter));

    container.appendChild(bar);
  }

  return { shareWhatsApp, shareNative, copyLink, injectShareBar, showToast };
})();

window.ShareManager = ShareManager;
