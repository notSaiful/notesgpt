document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     1. THE MASTERPIECE CURSOR ENGINE
  ========================================================= */
  const dot = document.createElement("div");
  dot.classList.add("cursor-dot");
  document.body.appendChild(dot);

  const ring = document.createElement("div");
  ring.classList.add("cursor-ring");
  document.body.appendChild(ring);

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX = window.innerWidth / 2;
  let ringY = window.innerHeight / 2;
  let isHovering = false;

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
  });

  const cursorLoop = () => {
    // Smooth trailing spring physics
    if (!isHovering) {
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
    }
    requestAnimationFrame(cursorLoop);
  };
  cursorLoop();

  /* =========================================================
     2. MAGNETIC BUTTONS (Awwwards Style)
  ========================================================= */
  const magnetics = document.querySelectorAll(".landing-btn--primary, .landing-btn--secondary");
  
  magnetics.forEach(btn => {
    btn.addEventListener("mousemove", (e) => {
      const rect = btn.getBoundingClientRect();
      const hX = e.clientX - rect.left - rect.width / 2;
      const hY = e.clientY - rect.top - rect.height / 2;
      
      // Pull the button towards cursor
      btn.style.transform = `translate(${hX * 0.3}px, ${hY * 0.3}px)`;
      
      // Snap the ring cursor to the button perfectly
      isHovering = true;
      ring.style.width = `${rect.width + 10}px`;
      ring.style.height = `${rect.height + 10}px`;
      ring.style.borderRadius = '12px';
      ring.style.transform = `translate(${rect.left + rect.width / 2}px, ${rect.top + rect.height / 2}px)`;
      ring.style.borderColor = "rgba(255,255,255,0.8)";
      ring.style.background = "rgba(255,255,255,0.05)";
      dot.style.opacity = '0';
    });

    btn.addEventListener("mouseleave", () => {
      btn.style.transform = `translate(0px, 0px)`;
      isHovering = false;
      ring.style.width = `32px`;
      ring.style.height = `32px`;
      ring.style.borderRadius = '50%';
      ring.style.borderColor = "rgba(255,255,255,0.4)";
      ring.style.background = "transparent";
      dot.style.opacity = '1';
    });
  });

  /* =========================================================
     3. LASER-TRACED BORDER GLOWS & SPOTLIGHT
  ========================================================= */
  const cards = document.querySelectorAll(".clean-card");
  document.addEventListener("mousemove", (e) => {
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Inject coordinates to be used by CSS masking
      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);
    });
  });

  /* =========================================================
     4. TRUE HOLOGRAPHIC 3D PARALLAX (Hero Mockup)
  ========================================================= */
  const mockup = document.querySelector(".landing-mockup");
  const parallaxLayers = document.querySelectorAll("[data-depth]");
  
  if (mockup) {
    document.addEventListener("mousemove", (e) => {
      const calcX = -(window.innerHeight / 2 - e.clientY) / 30; // Tilt intensity
      const calcY = (window.innerWidth / 2 - e.clientX) / 30;
      
      // Rotate the physical card base
      mockup.style.transform = `rotateX(${15 + calcX}deg) rotateY(${-20 + calcY}deg)`;

      // Translate the internal elements on the Z-axis (Hologram effect)
      parallaxLayers.forEach(layer => {
        const depth = layer.getAttribute("data-depth");
        layer.style.transform = `translateZ(${depth}px)`;
      });
    });
  }

  /* =========================================================
     5. KINETIC TEXT ENGINE (Staggered Type)
  ========================================================= */
  const heroTitle = document.querySelector(".landing-hero__title");
  if (heroTitle) {
    const text = heroTitle.textContent;
    heroTitle.innerHTML = "";
    const words = text.split(" ");
    
    words.forEach((word, index) => {
      if(word.includes("<br>")) {
         heroTitle.appendChild(document.createElement("br"));
      } else {
        const span = document.createElement("span");
        span.textContent = word + " ";
        span.style.opacity = "0";
        span.style.display = "inline-block";
        // Start pushed drastically down
        span.style.transform = "translateY(40px) rotateX(-40deg) scale(0.9)";
        span.style.transformOrigin = "top center";
        span.style.transition = `all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.1) ${index * 0.08}s`;
        heroTitle.appendChild(span);
        
        setTimeout(() => {
          span.style.opacity = "1";
          span.style.transform = "translateY(0) rotateX(0deg) scale(1)";
        }, 50);
      }
    });
  }

  /* =========================================================
     6. INTERSECTION OBSERVER (Scroll Matrix Physics)
  ========================================================= */
  const observerOptions = {
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px"
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll(".clean-card, .clean-step, .landing-problem__text").forEach(el => {
    el.classList.add("js-hidden");
    observer.observe(el);
  });

});
