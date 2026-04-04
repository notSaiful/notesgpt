document.addEventListener("DOMContentLoaded", () => {

  /* =========================================================
     1. NEURAL CANVAS — Performance-Optimised
        Key wins:
        - Only 70 particles (was 120) — fewer O(n²) checks
        - No shadowBlur — was the #1 GPU killer
        - Merged cursor into the same rAF loop (was 2 loops)
        - Throttled resize with debounce
  ========================================================= */
  const canvas = document.getElementById("neural-matrix");

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;

  // Shared mouse position (used by canvas + cursor)
  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive: true });

  if (canvas) {
    const ctx = canvas.getContext("2d", { alpha: true });
    let w, h, particles = [];

    const PARTICLE_COUNT = window.innerWidth > 768 ? 70 : 40;
    const CONNECT_DIST = 140;
    const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST; // avoid sqrt in hot loop
    const BASE_SPEED = 0.2;

    // Smoothed mouse for parallax (canvas only)
    let smoothX = mouseX, smoothY = mouseY;

    const init = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const z = 0.3 + Math.random() * 0.7;
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: z > 0.8 ? Math.random() * 1.5 + 1 : Math.random() * 1 + 0.4,
          vx: (Math.random() - 0.5) * BASE_SPEED,
          vy: (Math.random() - 0.5) * BASE_SPEED,
          cx: 0, cy: 0  // computed screen positions
        });
      }
    };

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(init, 200);
    }, { passive: true });

    init();

    /* -------------------------------------------------------
       CURSOR — merged here to avoid a second rAF loop
    ------------------------------------------------------- */
    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    let dot, ring, ringX, ringY;

    if (!isTouch) {
      dot = document.createElement("div");
      dot.className = "cursor-dot";
      document.body.appendChild(dot);

      ring = document.createElement("div");
      ring.className = "cursor-ring";
      document.body.appendChild(ring);

      ringX = mouseX;
      ringY = mouseY;
    }

    /* -------------------------------------------------------
       MAIN LOOP — single rAF for everything
    ------------------------------------------------------- */
    const loop = () => {
      // ── Cursor update (inside same rAF) ──
      if (!isTouch && ring) {
        dot.style.transform = `translate(${mouseX}px,${mouseY}px)`;
        ringX += (mouseX - ringX) * 0.15;
        ringY += (mouseY - ringY) * 0.15;
        ring.style.transform = `translate(${ringX}px,${ringY}px)`;
      }

      // ── Canvas: smooth parallax ──
      smoothX += (mouseX - smoothX) * 0.06;
      smoothY += (mouseY - smoothY) * 0.06;
      const px = (smoothX - w / 2) * 0.04;
      const py = (smoothY - h / 2) * 0.04;

      ctx.clearRect(0, 0, w, h);

      // Compute screen positions
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
        p.cx = p.x - px * p.z;
        p.cy = p.y - py * p.z;
      }

      // ── Draw connections — using squared distance (no sqrt) ──
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p2.cx - p1.cx;
          const dy = p2.cy - p1.cy;
          const distSq = dx * dx + dy * dy;
          if (distSq < CONNECT_DIST_SQ) {
            const alpha = (1 - distSq / CONNECT_DIST_SQ) * 0.18;
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p1.cx, p1.cy);
            ctx.lineTo(p2.cx, p2.cy);
            ctx.stroke();
          }
        }
      }

      // ── Draw nodes — NO shadowBlur (was the #1 GPU killer) ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const a = p.z * 0.5 + 0.2;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, 0, 6.2832); // 6.2832 = Math.PI*2 (no recalc)
        ctx.fill();
      }

      requestAnimationFrame(loop);
    };

    loop();
  }

  /* =========================================================
     2. STAGGERED HERO TEXT
  ========================================================= */
  const heroTitle = document.querySelector(".landing-hero__title");
  if (heroTitle) {
    const words = heroTitle.textContent.split(" ");
    heroTitle.innerHTML = "";
    words.forEach((word, i) => {
      const span = document.createElement("span");
      span.textContent = word + " ";
      span.style.cssText = `opacity:0;display:inline-block;transform:translateY(14px);transition:opacity 0.5s ${i * 0.06}s ease,transform 0.5s ${i * 0.06}s ease`;
      heroTitle.appendChild(span);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        span.style.opacity = "1";
        span.style.transform = "translateY(0)";
      }));
    });
  }

  /* =========================================================
     3. MAGNETIC BUTTONS (touch guard already in place)
  ========================================================= */
  const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  if (!isTouch) {
    document.querySelectorAll(".landing-btn--primary, .landing-btn--secondary").forEach(btn => {
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px,${(e.clientY - r.top - r.height / 2) * 0.25}px)`;
      }, { passive: true });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "translate(0,0)";
      });
    });
  }

  /* =========================================================
     4. 3D CARD TILT — only on desktop, passive listeners
  ========================================================= */
  if (!isTouch) {
    document.querySelectorAll(".clean-card").forEach(card => {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        card.style.setProperty("--mouse-x", `${x}px`);
        card.style.setProperty("--mouse-y", `${y}px`);
        const rotX = -((y / r.height) - 0.5) * 16;
        const rotY = ((x / r.width) - 0.5) * 16;
        card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02,1.02,1.02)`;
      }, { passive: true });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
      });
    });
  }

  /* =========================================================
     5. HERO MOCKUP PARALLAX — throttled to 30fps cap
  ========================================================= */
  const mockup = document.querySelector(".landing-mockup");
  if (mockup && !isTouch) {
    let ticking = false;
    document.addEventListener("mousemove", (e) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const calcX = -(window.innerHeight / 2 - e.clientY) / 35;
        const calcY = (window.innerWidth / 2 - e.clientX) / 35;
        mockup.style.transform = `rotateX(${10 + calcX}deg) rotateY(${-15 + calcY}deg)`;
        ticking = false;
      });
    }, { passive: true });
  }

  /* =========================================================
     6. INTERSECTION OBSERVER — scroll-in animations
  ========================================================= */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".clean-card, .clean-step, .landing-problem__text, .preview-mock").forEach(el => {
    el.classList.add("js-hidden");
    observer.observe(el);
  });

});
