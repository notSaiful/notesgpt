// ══════════════════════════════════════════════
// NotesGPT — Video Help System (Direct YouTube)
// ══════════════════════════════════════════════

const VideoHelp = (() => {
  function openVideo(topic) {
    const classNum = window.currentClassNum || "10";
    const subject = window.currentSubject || "";
    const chapter = window.currentChapter || "";

    const query = encodeURIComponent(
      `CBSE Class ${classNum} ${subject} ${chapter} ${topic || ""} explanation`.trim()
    );
    window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
  }

  // Convenience: open for the current chapter (no specific topic)
  function openForChapter() {
    openVideo("");
  }

  return { show: openVideo, hide: () => {}, init: () => {}, openForChapter };
})();

document.addEventListener("DOMContentLoaded", () => VideoHelp.init());
