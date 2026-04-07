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
    els.backBtn = document.getElementById("mindmap-continue-btn");
  }

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();

    if (els.dlPng) els.dlPng.addEventListener("click", downloadPng);
    if (els.dlPdf) els.dlPdf.addEventListener("click", downloadPdf);
    // Navigation (Mind Map → Audio Book) is wired in app.js via mindmap-continue-btn
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
      // ― GA: Mind map viewed ―
      if (typeof GA !== "undefined") {
        GA.mindmapViewed(classNum, subject, chapter);
        GA.send("mindmap_nodes", {
          event_category: "engagement",
          node_count: (data.mindmap?.nodes || []).length,
          chapter,
        });
      }
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
    const centerGap = 220; // Increased spacing for curves

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

    const W = 1200;
    const H = maxH + 140;
    const cx = W / 2;
    const cy = H / 2;

    // Center node dimensions
    const centerW = 240;
    const centerH = 64;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="mm-svg">`;

    // ── CSS Animations for SVG ─────────────────
    svg += `<style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap');
      .mm-svg { font-family: 'Space Grotesk', sans-serif; }
      @keyframes drawPath { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
      @keyframes drawSubPath { from { stroke-dashoffset: 500; } to { stroke-dashoffset: 0; } }
      @keyframes floatY { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      @keyframes pulseGlow { 0%, 100% { filter: drop-shadow(0 0 10px rgba(139,92,246,0.4)); } 50% { filter: drop-shadow(0 0 20px rgba(139,92,246,0.8)); } }
      .anim-path { stroke-dasharray: 2000; animation: drawPath 1.5s ease-out forwards; }
      .anim-subpath { stroke-dasharray: 500; stroke-dashoffset: 500; animation: drawSubPath 1s ease-out forwards 0.8s; }
      .center-grp { animation: floatY 4s ease-in-out infinite, pulseGlow 3s ease-in-out infinite; transform-origin: center; }
      .node-grp { animation: floatY 4.5s ease-in-out infinite; }
    </style>`;

    // Defs: filters and gradients
    svg += `<defs>`;
    PALETTE.forEach((c, i) => {
      svg += `<filter id="glow${i}" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feFlood flood-color="${c.glow}" result="color"/>
        <feComposite in="color" in2="blur" operator="in"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
      svg += `<linearGradient id="grad${i}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.bg}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#0a0a1a" stop-opacity="0.9"/>
      </linearGradient>`;
    });
    
    // Center glow & grad
    svg += `<filter id="glowCenter" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feFlood flood-color="rgba(139,92,246,0.6)" result="color"/>
      <feComposite in="color" in2="blur" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
    svg += `<linearGradient id="centerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b0764"/>
      <stop offset="100%" stop-color="#1e0a3c"/>
    </linearGradient>`;

    // BG Radial
    svg += `<radialGradient id="bgRadial" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#0e0a1a"/>
      <stop offset="100%" stop-color="#030108"/>
    </radialGradient>`;

    // Dot pattern
    svg += `<pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.04)" />
    </pattern>`;

    svg += `</defs>`;

    // Background Layer
    svg += `<rect width="${W}" height="${H}" fill="url(#bgRadial)" rx="24"/>`;
    svg += `<rect width="${W}" height="${H}" fill="url(#dots)" rx="24"/>`;

    // ── Draw center node ─────────────────────
    svg += `<g class="center-grp">`;
    svg += `<rect x="${cx - centerW/2}" y="${cy - centerH/2}" width="${centerW}" height="${centerH}" rx="32" fill="url(#centerGrad)" stroke="#a78bfa" stroke-width="2.5" filter="url(#glowCenter)"/>`;
    svg += centerText(data.title, cx, cy, 15, "#fff", 800, centerW - 30);
    svg += `</g>`;

    // ── Draw left branches ───────────────────
    let yPos = cy - leftH / 2 + 30;
    leftNodes.forEach((node, i) => {
      const palette = PALETTE[i % PALETTE.length];
      const isWeak = weakTopics.some(w =>
        node.topic.toLowerCase().includes(w.toLowerCase()) ||
        w.toLowerCase().includes(node.topic.toLowerCase())
      );
      const nodeColor = isWeak ? "#ef4444" : palette.border;
      const nodeBg = isWeak ? "#3b1111" : `url(#grad${i % PALETTE.length})`;
      const nodeGlow = isWeak ? "none" : `url(#glow${i % PALETTE.length})`;

      const nx = cx - centerGap - nodeW / 2;
      const ny = yPos;

      // Group for animation
      svg += `<g class="node-grp" style="animation-delay: ${Math.random()*0.5}s">`;

      // Connection: curved line
      const midX = cx - centerGap / 1.5;
      svg += `<path d="M ${cx - centerW/2 + 10} ${cy} C ${midX} ${cy}, ${midX} ${ny + nodeH/2}, ${nx + nodeW} ${ny + nodeH/2}" fill="none" stroke="${nodeColor}" stroke-width="2.5" stroke-opacity="0.4" class="anim-path"/>`;

      // Node rectangle
      svg += `<rect x="${nx}" y="${ny}" width="${nodeW}" height="${nodeH}" rx="12" fill="${nodeBg}" stroke="${nodeColor}" stroke-width="${isWeak ? 2.5 : 1.5}" filter="${nodeGlow}"/>`;
      
      // Node text + indicator
      if (isWeak) {
        svg += `<circle cx="${nx + 14}" cy="${ny + nodeH/2}" r="5" fill="#ef4444"/>`;
      }
      svg += `<text x="${nx + (isWeak ? 28 : 16)}" y="${ny + nodeH/2 + 5}" font-size="13" fill="#fff" font-weight="700">${esc(truncate(node.topic, 19))}</text>`;

      // Subtopics
      const subs = node.subtopics || [];
      subs.forEach((sub, si) => {
        const sy = ny + nodeH + 8 + si * (subH + subGap);
        const sx = nx - 10;

        // Connector line
        svg += `<path d="M ${nx + 15} ${ny + nodeH} V ${sy + subH/2} H ${sx + subW}" fill="none" stroke="${nodeColor}" stroke-width="1.5" stroke-opacity="0.3" class="anim-subpath"/>`;

        // Sub node
        svg += `<rect x="${sx}" y="${sy}" width="${subW}" height="${subH}" rx="8" fill="rgba(255,255,255,0.03)" stroke="${nodeColor}" stroke-width="0.8" stroke-opacity="0.6"/>`;
        svg += `<text x="${sx + 10}" y="${sy + subH/2 + 4}" font-size="10.5" fill="${palette.text}" font-weight="500">${esc(truncate(sub, 22))}</text>`;
      });
      svg += `</g>`;

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
      const nodeBg = isWeak ? "#3b1111" : `url(#grad${i % PALETTE.length})`;
      const nodeGlow = isWeak ? "none" : `url(#glow${i % PALETTE.length})`;

      const nx = cx + centerGap - nodeW / 2;
      const ny = yPos;

      // Group
      svg += `<g class="node-grp" style="animation-delay: ${Math.random()*0.5}s">`;

      // Connection
      const midX = cx + centerGap / 1.5;
      svg += `<path d="M ${cx + centerW/2 - 10} ${cy} C ${midX} ${cy}, ${midX} ${ny + nodeH/2}, ${nx} ${ny + nodeH/2}" fill="none" stroke="${nodeColor}" stroke-width="2.5" stroke-opacity="0.4" class="anim-path"/>`;

      // Node
      svg += `<rect x="${nx}" y="${ny}" width="${nodeW}" height="${nodeH}" rx="12" fill="${nodeBg}" stroke="${nodeColor}" stroke-width="${isWeak ? 2.5 : 1.5}" filter="${nodeGlow}"/>`;
      if (isWeak) {
        svg += `<circle cx="${nx + 14}" cy="${ny + nodeH/2}" r="5" fill="#ef4444"/>`;
      }
      svg += `<text x="${nx + (isWeak ? 28 : 16)}" y="${ny + nodeH/2 + 5}" font-size="13" fill="#fff" font-weight="700">${esc(truncate(node.topic, 19))}</text>`;

      // Subtopics
      const subs = node.subtopics || [];
      subs.forEach((sub, si) => {
        const sy = ny + nodeH + 8 + si * (subH + subGap);
        const sx = nx + nodeW + 10 - subW;

        // Connector
        svg += `<path d="M ${nx + nodeW - 15} ${ny + nodeH} V ${sy + subH/2} H ${sx}" fill="none" stroke="${nodeColor}" stroke-width="1.5" stroke-opacity="0.3" class="anim-subpath"/>`;

        // Sub node
        svg += `<rect x="${sx}" y="${sy}" width="${subW}" height="${subH}" rx="8" fill="rgba(255,255,255,0.03)" stroke="${nodeColor}" stroke-width="0.8" stroke-opacity="0.6"/>`;
        svg += `<text x="${sx + 10}" y="${sy + subH/2 + 4}" font-size="10.5" fill="${palette.text}" font-weight="500">${esc(truncate(sub, 22))}</text>`;
      });
      svg += `</g>`;

      yPos += nodeH + subs.length * (subH + subGap) + branchGap;
    });

    // Logo / Watermark
    svg += `<g transform="translate(24, ${H - 24})" opacity="0.6">
              <path d="M0,0 l8,-12 l8,12 Z" fill="#8b5cf6"/>
              <text x="24" y="0" font-size="13" fill="#9ca3af" font-weight="700">StyleLearn AI • Class ${window.currentClassNum || 10}</text>
            </g>`;

    svg += `</svg>`;
    els.canvas.innerHTML = svg;
  }

  // ── Helpers ────────────────────────────────
  function centerText(text, x, y, size, fill, weight, maxW) {
    const words = text.split(" ");
    if (text.length * size * 0.55 < maxW) {
      return `<text x="${x}" y="${y + size * 0.35}" text-anchor="middle" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(text)}</text>`;
    }
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(" ");
    const l2 = words.slice(mid).join(" ");
    return `
      <text x="${x}" y="${y - size * 0.35}" text-anchor="middle" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(l1)}</text>
      <text x="${x}" y="${y + size * 0.85}" text-anchor="middle" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(l2)}</text>`;
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
