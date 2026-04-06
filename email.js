// ══════════════════════════════════════════════
// NotesGPT — Resend Email Service
// 4 automated email sequences:
// 1. Welcome (on sign-up)
// 2. Notes Summary (after studying)
// 3. Test Score (after mock test)
// 4. Streak Reminder (2 days idle)
// ══════════════════════════════════════════════

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "NotesGPT <onboarding@resend.dev>"; // Update to your domain when ready
const APP_URL = "https://notesgpt.onrender.com";

// ── Shared email styles ────────────────────────
const BASE_STYLES = `
  body { margin:0; padding:0; background:#09090b; font-family:'Segoe UI',Arial,sans-serif; }
  .wrapper { max-width:600px; margin:0 auto; padding:40px 20px; }
  .card { background:#18181b; border:1px solid #27272a; border-radius:16px; overflow:hidden; }
  .header { background:linear-gradient(135deg,#1e1b4b,#312e81); padding:32px; text-align:center; }
  .logo { font-size:1.8rem; font-weight:800; color:#fff; letter-spacing:-0.5px; }
  .logo span { color:#a78bfa; }
  .body { padding:32px; }
  h1 { color:#f4f4f5; font-size:1.4rem; font-weight:700; margin:0 0 12px; line-height:1.3; }
  p { color:#a1a1aa; font-size:0.92rem; line-height:1.6; margin:0 0 16px; }
  .cta { display:block; background:#7c3aed; color:#fff; text-decoration:none; padding:14px 28px;
         border-radius:10px; font-weight:700; font-size:0.95rem; text-align:center; margin:24px 0; }
  .stat-row { display:flex; gap:12px; margin:20px 0; }
  .stat { background:#27272a; border-radius:10px; padding:14px; flex:1; text-align:center; }
  .stat-val { font-size:1.5rem; font-weight:800; color:#a78bfa; display:block; }
  .stat-label { font-size:0.75rem; color:#71717a; margin-top:4px; display:block; }
  .badge { display:inline-block; background:rgba(124,58,237,0.15); color:#a78bfa;
           border:1px solid rgba(124,58,237,0.3); border-radius:100px; padding:4px 12px; font-size:0.78rem; font-weight:600; }
  .footer { text-align:center; padding:24px 0 0; }
  .footer p { font-size:0.75rem; color:#52525b; margin:0; }
  .footer a { color:#71717a; text-decoration:underline; }
  .divider { border:none; border-top:1px solid #27272a; margin:20px 0; }
  .tip { background:#1c1917; border-left:3px solid #a78bfa; border-radius:6px; padding:14px 16px; margin:16px 0; }
  .tip p { margin:0; font-size:0.85rem; color:#d4d4d8; }
`;

// ── 1. Welcome Email ──────────────────────────
function welcomeTemplate({ name, provider = "email" }) {
  const displayName = name || "Student";
  return `<!DOCTYPE html><html><head><style>${BASE_STYLES}</style></head>
<body><div class="wrapper"><div class="card">
  <div class="header">
    <div class="logo">Notes<span>GPT</span></div>
    <p style="color:#c4b5fd;margin:8px 0 0;font-size:0.9rem;">Your AI study partner is ready 🚀</p>
  </div>
  <div class="body">
    <h1>Welcome, ${displayName}! 🎓</h1>
    <p>You just unlocked the smartest way to prepare for CBSE exams. No more reading 50 pages to understand a 5-minute concept.</p>
    <div class="tip"><p>💡 <strong style="color:#f4f4f5;">Quick start:</strong> Pick your class, subject, and chapter — NotesGPT generates your complete study pack in under 10 seconds.</p></div>
    <p><strong style="color:#f4f4f5;">Here's what you get for free:</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:8px 0;color:#a1a1aa;font-size:0.88rem;">📚</td><td style="padding:8px 0;color:#d4d4d8;font-size:0.88rem;"><strong>AI Study Notes</strong> — NCERT-aligned, exam-focused</td></tr>
      <tr><td style="padding:8px 0;color:#a1a1aa;font-size:0.88rem;">🃏</td><td style="padding:8px 0;color:#d4d4d8;font-size:0.88rem;"><strong>Smart Flashcards</strong> — Active recall for long-term retention</td></tr>
      <tr><td style="padding:8px 0;color:#a1a1aa;font-size:0.88rem;">📝</td><td style="padding:8px 0;color:#d4d4d8;font-size:0.88rem;"><strong>Mock Tests</strong> — Board-pattern with AI evaluation</td></tr>
      <tr><td style="padding:8px 0;color:#a1a1aa;font-size:0.88rem;">🎧</td><td style="padding:8px 0;color:#d4d4d8;font-size:0.88rem;"><strong>Audiobooks & Visual Lessons</strong> — Study in any mode</td></tr>
      <tr><td style="padding:8px 0;color:#a1a1aa;font-size:0.88rem;">🎵</td><td style="padding:8px 0;color:#d4d4d8;font-size:0.88rem;"><strong>Memory Songs</strong> — Never forget key concepts</td></tr>
    </table>
    <a href="${APP_URL}?utm_source=email&utm_medium=welcome&utm_campaign=onboarding" class="cta">Start Your First Study Session →</a>
    <hr class="divider">
    <p style="font-size:0.82rem;color:#52525b;">Signed in with ${provider}. If this wasn't you, ignore this email.</p>
  </div>
</div>
<div class="footer"><p>© 2026 NotesGPT · Free AI CBSE Study Platform · <a href="${APP_URL}/privacy.html">Privacy</a> · <a href="${APP_URL}/terms.html">Terms</a></p></div>
</div></body></html>`;
}

// ── 2. Notes Generated / Study Summary ────────
function studySummaryTemplate({ name, classNum, subject, chapter, wordCount = 500 }) {
  return `<!DOCTYPE html><html><head><style>${BASE_STYLES}</style></head>
<body><div class="wrapper"><div class="card">
  <div class="header">
    <div class="logo">Notes<span>GPT</span></div>
    <p style="color:#c4b5fd;margin:8px 0 0;font-size:0.9rem;">Study session complete 📚</p>
  </div>
  <div class="body">
    <h1>You just studied ${chapter}!</h1>
    <p>Great work, ${name || "Student"}! You've generated your complete study pack for <strong style="color:#f4f4f5;">${chapter}</strong> (Class ${classNum} ${subject}).</p>
    <div style="display:flex;gap:12px;margin:20px 0;">
      <div class="stat"><span class="stat-val">${Math.ceil(wordCount / 200)}m</span><span class="stat-label">Reading time</span></div>
      <div class="stat"><span class="stat-val">~10</span><span class="stat-label">Flashcards</span></div>
      <div class="stat"><span class="stat-val">5</span><span class="stat-label">Mock Qs</span></div>
    </div>
    <div class="tip"><p>📌 <strong style="color:#f4f4f5;">Pro tip:</strong> Take the mock test now while the chapter is fresh in your memory. Studies show testing within 2 hours increases retention by 70%.</p></div>
    <a href="${APP_URL}?utm_source=email&utm_medium=study_summary" class="cta">Take the Mock Test Now →</a>
    <hr class="divider">
    <p>Keep your study streak going tomorrow to lock-in long-term retention.</p>
  </div>
</div>
<div class="footer"><p>© 2026 NotesGPT · <a href="${APP_URL}/privacy.html">Unsubscribe</a></p></div>
</div></body></html>`;
}

// ── 3. Test Score Email ────────────────────────
function testScoreTemplate({ name, classNum, subject, chapter, score, total }) {
  const pct = Math.round((score / total) * 100);
  const isExcellent = pct >= 90;
  const isGood = pct >= 70;
  const emoji = isExcellent ? "🏆" : isGood ? "🎯" : "💪";
  const headline = isExcellent ? "Outstanding! Board topper material!" : isGood ? "Great score! Keep it up!" : "Good effort! Let's improve this.";
  const accentColor = isExcellent ? "#10b981" : isGood ? "#3b82f6" : "#f59e0b";
  return `<!DOCTYPE html><html><head><style>${BASE_STYLES}</style></head>
<body><div class="wrapper"><div class="card">
  <div class="header">
    <div class="logo">Notes<span>GPT</span></div>
    <p style="color:#c4b5fd;margin:8px 0 0;font-size:0.9rem;">Test results are in! ${emoji}</p>
  </div>
  <div class="body">
    <h1>${headline}</h1>
    <p>Here are your results for the <strong style="color:#f4f4f5;">${chapter}</strong> mock test (Class ${classNum} ${subject}):</p>
    <div style="text-align:center;background:#27272a;border-radius:12px;padding:28px;margin:20px 0;">
      <span style="font-size:4rem;font-weight:900;color:${accentColor};">${pct}%</span>
      <p style="margin:8px 0 0;color:#71717a;font-size:0.85rem;">${score} out of ${total} correct</p>
    </div>
    ${!isExcellent ? `<div class="tip"><p>💡 <strong style="color:#f4f4f5;">Improve faster:</strong> Use the AI Correction feature to understand exactly where you went wrong and retry those specific questions.</p></div>` : `<div class="tip"><p>🌟 <strong style="color:#f4f4f5;">You scored 90%+!</strong> You're on track for a top grade. Share your score with your study group to motivate them!</p></div>`}
    <a href="${APP_URL}?utm_source=email&utm_medium=test_score" class="cta">${isExcellent ? "Challenge Yourself with Arena Mode →" : "Review Mistakes & Retry →"}</a>
  </div>
</div>
<div class="footer"><p>© 2026 NotesGPT · <a href="${APP_URL}/privacy.html">Unsubscribe</a></p></div>
</div></body></html>`;
}

// ── 4. Streak Reminder Email ──────────────────
function streakReminderTemplate({ name, lastChapter, lastSubject, lastClass, daysSince }) {
  return `<!DOCTYPE html><html><head><style>${BASE_STYLES}</style></head>
<body><div class="wrapper"><div class="card">
  <div class="header">
    <div class="logo">Notes<span>GPT</span></div>
    <p style="color:#c4b5fd;margin:8px 0 0;font-size:0.9rem;">Your streak is waiting ⚡</p>
  </div>
  <div class="body">
    <h1>Hey ${name || "Student"}, don't break your streak!</h1>
    <p>You haven't studied in <strong style="color:#f87171;">${daysSince} day${daysSince > 1 ? "s" : ""}</strong>. Your competitors aren't taking breaks.</p>
    ${lastChapter ? `<div style="background:#27272a;border-radius:10px;padding:16px;margin:16px 0;"><p style="margin:0;font-size:0.85rem;color:#a1a1aa;">Last studied:</p><p style="margin:6px 0 0;font-size:1rem;font-weight:700;color:#f4f4f5;">📚 ${lastChapter}</p><p style="margin:4px 0 0;font-size:0.8rem;color:#71717a;">Class ${lastClass} · ${lastSubject}</p></div>` : ""}
    <div class="tip"><p>⏱️ <strong style="color:#f4f4f5;">Just 15 minutes today</strong> is enough to maintain your retention curve. Pick up where you left off.</p></div>
    <a href="${APP_URL}?utm_source=email&utm_medium=streak_reminder&utm_campaign=reengagement" class="cta">Resume Studying Now →</a>
    <hr class="divider">
    <p style="font-size:0.82rem;">Board exams don't wait. Every chapter you revise today is one less chapter to panic over in the exam hall.</p>
  </div>
</div>
<div class="footer"><p>© 2026 NotesGPT · <a href="${APP_URL}/privacy.html">Unsubscribe</a></p></div>
</div></body></html>`;
}

// ── Send functions ─────────────────────────────

async function sendWelcomeEmail(to, data) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `Welcome to NotesGPT, ${data.name || "Student"}! 🎓 Your AI study partner is ready`,
      html: welcomeTemplate(data),
    });
    console.log("📧 Welcome email sent:", result.data?.id);
    return result;
  } catch (e) {
    console.warn("Email send failed (welcome):", e.message);
  }
}

async function sendStudySummaryEmail(to, data) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `✅ Study pack ready: ${data.chapter} — Class ${data.classNum} ${data.subject}`,
      html: studySummaryTemplate(data),
    });
    console.log("📧 Study summary email sent:", result.data?.id);
    return result;
  } catch (e) {
    console.warn("Email send failed (study summary):", e.message);
  }
}

async function sendTestScoreEmail(to, data) {
  if (!process.env.RESEND_API_KEY) return;
  const pct = Math.round((data.score / data.total) * 100);
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `${pct >= 90 ? "🏆" : pct >= 70 ? "🎯" : "📝"} You scored ${pct}% on ${data.chapter} — NotesGPT`,
      html: testScoreTemplate(data),
    });
    console.log("📧 Test score email sent:", result.data?.id);
    return result;
  } catch (e) {
    console.warn("Email send failed (test score):", e.message);
  }
}

async function sendStreakReminderEmail(to, data) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `⚡ ${data.name || "Student"}, your study streak is at risk! ${data.daysSince} day${data.daysSince > 1 ? "s" : ""} since last session`,
      html: streakReminderTemplate(data),
    });
    console.log("📧 Streak reminder email sent:", result.data?.id);
    return result;
  } catch (e) {
    console.warn("Email send failed (streak reminder):", e.message);
  }
}

// ── Test connection ────────────────────────────
async function testConnection() {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️  RESEND_API_KEY not set");
    return false;
  }
  try {
    // Just validate the key by checking domains
    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    const ok = r.status < 400 || r.status === 200;
    if (ok) console.log("📧 Resend email service: connected");
    return ok;
  } catch (e) {
    console.warn("Resend connection test failed:", e.message);
    return false;
  }
}

module.exports = {
  sendWelcomeEmail,
  sendStudySummaryEmail,
  sendTestScoreEmail,
  sendStreakReminderEmail,
  testConnection,
};
