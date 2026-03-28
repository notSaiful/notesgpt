// ══════════════════════════════════════════════
// NotesGPT — Mind Map Generator (v2 – Polished)
// ══════════════════════════════════════════════

const MindMap = (() => {
  // ── State ──────────────────────────────────
  let mapData = null;
  let weakTopics = [];

  // ── DOM refs ───────────────────────────────
  const els = {};
  function cacheDom() {
    els.section = document.getElementById("mindmap-section");
    els.loading = document.getElementById("mindmap-loading");
    els.canvas = document.getElementById("mindmap-canvas");
    els.title = document.getElementById("mindmap-title");
    els.dlPng = document.getElementById("mindmap-dl-png");
    els.dlPdf = document.getElementById("mindmap-dl-pdf");
    els.backBtn = document.getElementById("mindmap-back-btn");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();

    if (els.dlPng) els.dlPng.addEventListener("click", downloadPng);
    if (els.dlPdf) els.dlPdf.addEventListener("click", downloadPdf);
    if (els.backBtn) {
      els.backBtn.addEventListener("click", () => {
        if (typeof FlashcardEngine !== "undefined") {
          FlashcardEngine.start(
            window.currentClassNum,
            window.currentSubject,
            window.currentChapter
          );
        } else {
          setGlobalView("output");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }
  }

  // ── Generate mind map ──────────────────────
  async function generate(classNum, subject, chapter, weakArr) {
    weakTopics = weakArr || [];
    setGlobalView("mindmap-loading");

    try {
      const res = await fetch("/api/generate-mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNum, subject, chapter }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");

      mapData = data.mindmap;
      els.title.textContent = mapData.title;
      renderSvg(mapData);
      setGlobalView("mindmap");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      alert("Mind map error: " + err.message);
      setGlobalView("output");
    }
  }

  // ── Color palette ──────────────────────────
  const PALETTE = [
    { bg: "#312e81", border: "#818cf8", text: "#c7d2fe", glow: "rgba(129,140,248,0.3)" },
    { bg: "#064e3b", border: "#34d399", text: "#a7f3d0", glow: "rgba(52,211,153,0.3)" },
    { bg: "#7c2d12", border: "#fb923c", text: "#fed7aa", glow: "rgba(251,146,60,0.3)" },
    { bg: "#701a75", border: "#e879f9", text: "#f5d0fe", glow: "rgba(232,121,249,0.3)" },
    { bg: "#1e3a5f", border: "#38bdf8", text: "#bae6fd", glow: "rgba(56,189,248,0.3)" },
    { bg: "#713f12", border: "#fbbf24", text: "#fef3c7", glow: "rgba(251,191,36,0.3)" },
    { bg: "#3b0764", border: "#a78bfa", text: "#ddd6fe", glow: "rgba(167,139,250,0.3)" },
    { bg: "#134e4a", border: "#2dd4bf", text: "#99f6e4", glow: "rgba(45,212,191,0.3)" },
  ];

  // ── Render SVG (polished tree layout) ──────
  function renderSvg(data) {
    const nodes = data.nodes;
    const count = nodes.length;
    if (count === 0) return;

    // Layout parameters
    const nodeW = 180;
    const nodeH = 40;
    const subW = 160;
    const subH = 26;
    const subGap = 8;
    const branchGap = 28;
    const centerGap = 200;

    // Split nodes into left and right halves
    const midIdx = Math.ceil(count / 2);
    const leftNodes = nodes.slice(0, midIdx);
    const rightNodes = nodes.slice(midIdx);

    // Calculate heights for each side
    function calcSideH(sideNodes) {
      let total = 0;
      sideNodes.forEach((n, i) => {
        total += nodeH + (n.subtopics.length * (subH + subGap)) + branchGap;
      });
      return total;
    }

    const leftH = calcSideH(leftNodes);
    const rightH = calcSideH(rightNodes);
    const maxH = Math.max(leftH, rightH, 400);

    const W = 1100;
    const H = maxH + 120;
    const cx = W / 2;
    const cy = H / 2;

    // Center node dimensions
    const centerW = 220;
    const centerH = 56;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="mm-svg">`;

    // Defs: filters for glow
    svg += `<defs>`;
    PALETTE.forEach((c, i) => {
      svg += `<filter id="glow${i}" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feFlood flood-color="${c.glow}" result="color"/>
        <feComposite in="color" in2="blur" operator="in"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
    });
    // Center glow
    svg += `<filter id="glowCenter" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feFlood flood-color="rgba(139,92,246,0.4)" result="color"/>
      <feComposite in="color" in2="blur" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
    svg += `</defs>`;

    // Background
    svg += `<rect width="${W}" height="${H}" fill="#08081a" rx="16"/>`;

    // Subtle grid pattern
    for (let gx = 0; gx < W; gx += 40) {
      svg += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="rgba(255,255,255,0.015)" stroke-width="1"/>`;
    }
    for (let gy = 0; gy < H; gy += 40) {
      svg += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="rgba(255,255,255,0.015)" stroke-width="1"/>`;
    }

    // ── Draw center node ─────────────────────
    svg += `<rect x="${cx - centerW/2}" y="${cy - centerH/2}" width="${centerW}" height="${centerH}" rx="28" fill="#1a103d" stroke="#8b5cf6" stroke-width="2.5" filter="url(#glowCenter)"/>`;
    svg += centerText(data.title, cx, cy, 14, "#fff", 800, centerW - 20);

    // ── Draw left branches ───────────────────
    let yPos = cy - leftH / 2 + 30;
    leftNodes.forEach((node, i) => {
      const palette = PALETTE[i % PALETTE.length];
      const isWeak = weakTopics.some(w =>
        node.topic.toLowerCase().includes(w.toLowerCase()) ||
        w.toLowerCase().includes(node.topic.toLowerCase())
      );
      const nodeColor = isWeak ? "#ef4444" : palette.border;
      const nodeBg = isWeak ? "#3b1111" : palette.bg;
      const nodeGlow = isWeak ? "none" : `url(#glow${i % PALETTE.length})`;

      const nx = cx - centerGap - nodeW / 2;
      const ny = yPos;

      // Connection: curved line from center to node
      const midX = cx - centerGap / 2;
      svg += `<path d="M ${cx - centerW/2} ${cy} C ${midX} ${cy}, ${midX} ${ny + nodeH/2}, ${nx + nodeW} ${ny + nodeH/2}" fill="none" stroke="${nodeColor}" stroke-width="2" opacity="0.5"/>`;

      // Node rectangle
      svg += `<rect x="${nx}" y="${ny}" width="${nodeW}" height="${nodeH}" rx="12" fill="${nodeBg}" stroke="${nodeColor}" stroke-width="${isWeak ? 2.5 : 1.5}" filter="${nodeGlow}"/>`;
      if (isWeak) {
        svg += `<circle cx="${nx + 14}" cy="${ny + nodeH/2}" r="4" fill="#ef4444"/>`;
      }
      svg += `<text x="${nx + (isWeak ? 26 : 14)}" y="${ny + nodeH/2 + 5}" font-size="11.5" fill="#fff" font-weight="700" font-family="Inter,sans-serif">${esc(truncate(node.topic, 20))}</text>`;

      // Subtopics
      const subs = node.subtopics || [];
      subs.forEach((sub, si) => {
        const sy = ny + nodeH + 6 + si * (subH + subGap);
        const sx = nx - 20;

        // Connector line
        svg += `<line x1="${nx}" y1="${ny + nodeH/2}" x2="${sx + subW}" y2="${sy + subH/2}" stroke="${nodeColor}" stroke-width="1" opacity="0.25" stroke-dasharray="3,3"/>`;

        // Sub node
        svg += `<rect x="${sx}" y="${sy}" width="${subW}" height="${subH}" rx="8" fill="rgba(255,255,255,0.03)" stroke="${nodeColor}" stroke-width="0.8" opacity="0.8"/>`;
        svg += `<text x="${sx + 10}" y="${sy + subH/2 + 4}" font-size="9.5" fill="${palette.text}" font-family="Inter,sans-serif" font-weight="500" opacity="0.9">${esc(truncate(sub, 24))}</text>`;
      });

      yPos += nodeH + subs.length * (subH + subGap) + branchGap;
    });

    // ── Draw right branches ──────────────────
    yPos = cy - rightH / 2 + 30;
    rightNodes.forEach((node, ri) => {
      const i = ri + midIdx;
      const palette = PALETTE[i % PALETTE.length];
      const isWeak = weakTopics.some(w =>
        node.topic.toLowerCase().includes(w.toLowerCase()) ||
        w.toLowerCase().includes(node.topic.toLowerCase())
      );
      const nodeColor = isWeak ? "#ef4444" : palette.border;
      const nodeBg = isWeak ? "#3b1111" : palette.bg;
      const nodeGlow = isWeak ? "none" : `url(#glow${i % PALETTE.length})`;

      const nx = cx + centerGap - nodeW / 2;
      const ny = yPos;

      // Connection: curved line from center to node
      const midX = cx + centerGap / 2;
      svg += `<path d="M ${cx + centerW/2} ${cy} C ${midX} ${cy}, ${midX} ${ny + nodeH/2}, ${nx} ${ny + nodeH/2}" fill="none" stroke="${nodeColor}" stroke-width="2" opacity="0.5"/>`;

      // Node rectangle
      svg += `<rect x="${nx}" y="${ny}" width="${nodeW}" height="${nodeH}" rx="12" fill="${nodeBg}" stroke="${nodeColor}" stroke-width="${isWeak ? 2.5 : 1.5}" filter="${nodeGlow}"/>`;
      if (isWeak) {
        svg += `<circle cx="${nx + 14}" cy="${ny + nodeH/2}" r="4" fill="#ef4444"/>`;
      }
      svg += `<text x="${nx + (isWeak ? 26 : 14)}" y="${ny + nodeH/2 + 5}" font-size="11.5" fill="#fff" font-weight="700" font-family="Inter,sans-serif">${esc(truncate(node.topic, 20))}</text>`;

      // Subtopics
      const subs = node.subtopics || [];
      subs.forEach((sub, si) => {
        const sy = ny + nodeH + 6 + si * (subH + subGap);
        const sx = nx + nodeW + 20 - subW;

        // Connector
        svg += `<line x1="${nx + nodeW}" y1="${ny + nodeH/2}" x2="${sx}" y2="${sy + subH/2}" stroke="${nodeColor}" stroke-width="1" opacity="0.25" stroke-dasharray="3,3"/>`;

        // Sub node
        svg += `<rect x="${sx}" y="${sy}" width="${subW}" height="${subH}" rx="8" fill="rgba(255,255,255,0.03)" stroke="${nodeColor}" stroke-width="0.8" opacity="0.8"/>`;
        svg += `<text x="${sx + 10}" y="${sy + subH/2 + 4}" font-size="9.5" fill="${palette.text}" font-family="Inter,sans-serif" font-weight="500" opacity="0.9">${esc(truncate(sub, 24))}</text>`;
      });

      yPos += nodeH + subs.length * (subH + subGap) + branchGap;
    });

    // Legend
    svg += `<text x="20" y="${H - 16}" font-size="9" fill="rgba(255,255,255,0.3)" font-family="Inter,sans-serif">NotesGPT • CBSE Class ${window.currentClassNum || 10} • ${data.title}</text>`;

    svg += `</svg>`;
    els.canvas.innerHTML = svg;
  }

  // ── Helpers ────────────────────────────────
  function centerText(text, x, y, size, fill, weight, maxW) {
    const words = text.split(" ");
    if (text.length * size * 0.55 < maxW) {
      return `<text x="${x}" y="${y + size * 0.35}" text-anchor="middle" font-size="${size}" fill="${fill}" font-weight="${weight}" font-family="Inter,sans-serif">${esc(text)}</text>`;
    }
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(" ");
    const l2 = words.slice(mid).join(" ");
    return `
      <text x="${x}" y="${y - size * 0.35}" text-anchor="middle" font-size="${size}" fill="${fill}" font-weight="${weight}" font-family="Inter,sans-serif">${esc(l1)}</text>
      <text x="${x}" y="${y + size * 0.85}" text-anchor="middle" font-size="${size}" fill="${fill}" font-weight="${weight}" font-family="Inter,sans-serif">${esc(l2)}</text>`;
  }

  function truncate(t, max) { return t.length > max ? t.slice(0, max - 1) + "…" : t; }
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ── Download PNG ───────────────────────────
  async function downloadPng() {
    const svgEl = els.canvas.querySelector("svg");
    if (!svgEl) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const a = document.createElement("a");
        a.download = `mindmap-${mapData?.title || "chapter"}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      };
      img.src = url;
    } catch (err) { alert("Download failed: " + err.message); }
  }

  // ── Download PDF ───────────────────────────
  async function downloadPdf() {
    const svgEl = els.canvas.querySelector("svg");
    if (!svgEl) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const imgData = canvas.toDataURL("image/png");
        if (typeof window.jspdf !== "undefined") {
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF("landscape", "px", [canvas.width / 2, canvas.height / 2]);
          pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
          pdf.save(`mindmap-${mapData?.title || "chapter"}.pdf`);
        } else {
          const a = document.createElement("a");
          a.download = `mindmap-${mapData?.title || "chapter"}.png`;
          a.href = imgData;
          a.click();
        }
      };
      img.src = url;
    } catch (err) { alert("PDF download failed: " + err.message); }
  }

  return { init, generate };
})();

document.addEventListener("DOMContentLoaded", () => MindMap.init());
