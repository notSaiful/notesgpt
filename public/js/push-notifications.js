// ══════════════════════════════════════════════
// NotesGPT — Web Push Notifications Manager
// Re-engages students with smart study reminders
// ══════════════════════════════════════════════

const PushManager = (() => {
  let swRegistration = null;

  // ── Register Service Worker ─────────────────
  async function init() {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;

    try {
      swRegistration = await navigator.serviceWorker.register("/service-worker.js");
      console.log("📲 Service Worker registered");

      // Show permission prompt after user studies (5s delay)
      setTimeout(() => maybeAskPermission(), 5000);
    } catch (err) {
      console.warn("SW registration failed:", err.message);
    }
  }

  // ── Ask for notification permission ─────────
  async function maybeAskPermission() {
    // Don't ask if already decided
    if (Notification.permission !== "default") return;

    // Don't ask on first visit — wait until user generates notes
    const hasStudied = localStorage.getItem("notesgpt_has_studied");
    if (!hasStudied) return;

    // Don't ask again within 3 days of dismissal
    const lastAsked = localStorage.getItem("push_last_asked");
    if (lastAsked && Date.now() - parseInt(lastAsked) < 3 * 24 * 60 * 60 * 1000) return;

    showPermissionBanner();
  }

  // ── Show elegant permission banner ──────────
  function showPermissionBanner() {
    if (document.getElementById("push-banner")) return;

    const banner = document.createElement("div");
    banner.id = "push-banner";
    banner.innerHTML = `
      <div style="
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:rgba(15,15,20,0.95); border:1px solid rgba(139,92,246,0.4);
        border-radius:16px; padding:16px 20px; z-index:9999;
        display:flex; align-items:center; gap:14px; max-width:380px; width:90%;
        backdrop-filter:blur(12px); box-shadow:0 8px 32px rgba(0,0,0,0.5);
        animation: slideUp 0.3s ease;
      ">
        <span style="font-size:1.8rem;">🔔</span>
        <div style="flex:1;">
          <p style="margin:0;font-size:0.88rem;font-weight:600;color:#f4f4f5;">Study streak reminders?</p>
          <p style="margin:4px 0 0;font-size:0.78rem;color:#a1a1aa;">We'll nudge you before exams. No spam.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button id="push-allow" style="
            background:#7c3aed;color:#fff;border:none;border-radius:8px;
            padding:6px 14px;font-size:0.78rem;cursor:pointer;font-weight:600;
          ">Allow</button>
          <button id="push-deny" style="
            background:transparent;color:#71717a;border:none;
            font-size:0.75rem;cursor:pointer;text-decoration:underline;
          ">Not now</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById("push-allow").addEventListener("click", async () => {
      banner.remove();
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        localStorage.setItem("push_enabled", "1");
        showLocalNotification("🎉 Reminders enabled!", "We'll help you stay on your study streak.");
        if (typeof GA !== "undefined") GA.send("push_notifications_enabled");
      }
    });

    document.getElementById("push-deny").addEventListener("click", () => {
      banner.remove();
      localStorage.setItem("push_last_asked", Date.now().toString());
    });
  }

  // ── Show a local notification ────────────────
  function showLocalNotification(title, body, url = "/") {
    if (Notification.permission !== "granted" || !swRegistration) return;
    swRegistration.showNotification(title, {
      body,
      icon: "/assets/logo.svg",
      badge: "/assets/logo.svg",
      data: { url },
      vibrate: [100, 50, 100],
    });
  }

  // ── Schedule smart study reminders ──────────
  function scheduleReminders(classNum, subject, chapter) {
    if (Notification.permission !== "granted") return;

    // Mark that user has studied (unlocks permission prompt for future)
    localStorage.setItem("notesgpt_has_studied", "1");
    localStorage.setItem("notesgpt_last_chapter", `${classNum}|${subject}|${chapter}`);
    localStorage.setItem("notesgpt_last_study_time", Date.now().toString());

    // 2-hour reminder: "Test yourself while it's fresh"
    const remind2h = setTimeout(() => {
      if (document.hasFocus()) return; // Don't notify if they're already on the site
      showLocalNotification(
        "⏰ Test Yourself Now!",
        `It's been 2 hours since you studied ${chapter}. Take the mock test while it's fresh!`,
        "/"
      );
    }, 2 * 60 * 60 * 1000);

    // Clear if they come back
    window.addEventListener("focus", () => clearTimeout(remind2h), { once: true });
  }

  // ── Daily streak reminder (24h) ──────────────
  function checkStreakReminder() {
    const lastStudy = localStorage.getItem("notesgpt_last_study_time");
    if (!lastStudy || Notification.permission !== "granted") return;

    const hoursSince = (Date.now() - parseInt(lastStudy)) / (1000 * 60 * 60);
    const lastChapter = localStorage.getItem("notesgpt_last_chapter") || "";
    const [cls, subj, chap] = lastChapter.split("|");

    if (hoursSince >= 22 && hoursSince < 26) {
      showLocalNotification(
        "📚 Don't break your streak!",
        `You haven't studied today. Continue ${chap || "your chapter"} and keep your streak alive!`,
        "/"
      );
    }
  }

  return { init, maybeAskPermission, scheduleReminders, showPermissionBanner, checkStreakReminder };
})();

window.PushManager = PushManager;
document.addEventListener("DOMContentLoaded", () => PushManager.init());
