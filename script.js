/* ============================================================
   NIGHTQUILL — lightweight interaction layer
   No WebGL, no GSAP, no scroll-scrub. Built to stay smooth
   on low-end phones and laptops.
   ============================================================ */

(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const pad = (number) => String(number).padStart(2, "0");
  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (character) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[character];
    });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const perfLow = root.classList.contains("perf-low") || reduceMotion;
  const finePointer = window.matchMedia("(pointer: fine)").matches && !perfLow;
  const artworks = Array.isArray(window.NQ_ARTWORKS) ? window.NQ_ARTWORKS.slice() : [];
  const featured = Array.isArray(window.NQ_FEATURED) ? window.NQ_FEATURED.slice() : [];
  const bySlug = new Map(artworks.map((item) => [item.slug, item]));

  const thumb = (slug) => `assets/thumbs/${slug}.webp`;
  const full = (slug) => `assets/art/${slug}.webp`;
  // Coverflow fanned layout is flat on purpose: depth is faked with scale,
  // overlap and shadow, so even software-rendered browsers stay smooth.
  const flatShowcase = () => true;

  let visibleArtworks = artworks.slice();
  let lightboxList = artworks.slice();
  let lightboxIndex = 0;
  let lightboxTrigger = null;
  let lightboxOpen = false;
  let menuOpen = false;
  const baseTitle = document.title;

  if (!artworks.length) {
    const preloader = $("#preloader");
    if (preloader) preloader.classList.add("is-done");
    body.classList.remove("is-loading");
    return;
  }

  /* ==========================================================
     Featured coverflow
     ========================================================== */

  const coverflow = {
    index: 0,
    cards: [],
    timer: null,
    paused: false,
    dragged: false,
    startX: null,
    deltaX: 0
  };

  function buildCoverflow() {
    const stage = $("#coverflowStage");
    const total = $("#cfTotal");
    if (!stage) return;

    const items = featured.map((slug) => bySlug.get(slug)).filter(Boolean);
    if (!items.length) return;

    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "cover-card";
      card.dataset.index = String(index);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `View ${item.title}, ${item.label}`);
      card.innerHTML = `
        <div class="cover-card__inner">
          <div class="cover-card__frame">
            <img src="${thumb(item.slug)}" alt="NIGHTQUILL — ${esc(item.title)}, ${esc(item.label)}" width="${item.w}" height="${item.h}" draggable="false" ${index < 3 ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}>
          </div>
        </div>`;
      stage.appendChild(card);
      coverflow.cards.push(card);

      card.addEventListener("click", () => {
        if (coverflow.dragged) return;
        if (index === coverflow.index) {
          openLightbox(item.slug);
        } else {
          setCover(index);
        }
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (index === coverflow.index) openLightbox(item.slug);
          else setCover(index);
        }
      });
    });

    if (total) total.textContent = pad(items.length);
    updateCoverflow();
    startCoverflowAuto();

    const bar = $(".coverflow__bar");
    const showcase = $(".hero__showcase");
    showcase?.addEventListener("pointerenter", () => {
      coverflow.paused = true;
    });
    showcase?.addEventListener("pointerleave", () => {
      coverflow.paused = false;
    });

    stage.addEventListener("focusin", () => {
      coverflow.paused = true;
    });
    stage.addEventListener("focusout", (event) => {
      if (!stage.contains(event.relatedTarget)) coverflow.paused = false;
    });

    if (bar) {
      bar.addEventListener("pointerenter", () => {
        coverflow.paused = true;
      });
      bar.addEventListener("pointerleave", () => {
        coverflow.paused = false;
      });
    }

    $("#cfPrev")?.addEventListener("click", () => setCover(coverflow.index - 1));
    $("#cfNext")?.addEventListener("click", () => setCover(coverflow.index + 1));

    initCoverflowDrag(stage);

    let resizeTimer = 0;
    window.addEventListener(
      "resize",
      () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => updateCoverflow(), 160);
      },
      { passive: true }
    );
  }

  function setCover(index) {
    const count = coverflow.cards.length;
    if (!count) return;
    coverflow.index = ((index % count) + count) % count;
    updateCoverflow();
    restartCoverflowAuto();
  }

  function updateCoverflow() {
    const count = coverflow.cards.length;
    if (!count) return;
    const half = Math.floor(count / 2);
    const activeItem = featured.map((slug) => bySlug.get(slug)).filter(Boolean)[coverflow.index];
    const flat = flatShowcase();

    coverflow.cards.forEach((card, index) => {
      let offset = index - coverflow.index;
      if (offset > half) offset -= count;
      if (offset < -half) offset += count;

      const distance = Math.abs(offset);
      const visible = distance <= 1;
      const scale = Math.max(0.78, 1 - distance * 0.14);

      if (flat) {
        card.style.transform = `translate(-50%, -50%) translateX(${offset * 58}%) scale(${scale})`;
      } else {
        card.style.transform = `translate(-50%, -50%) translateX(${offset * 54}%) translateZ(${distance * -90}px) rotateY(${offset * -22}deg) scale(${scale})`;
      }
      card.style.zIndex = String(20 - distance);
      card.style.opacity = visible ? String(1 - distance * 0.18) : "0";
      card.style.pointerEvents = visible ? "auto" : "none";
      card.classList.toggle("is-active", offset === 0);
      card.setAttribute("aria-hidden", visible ? "false" : "true");
      card.tabIndex = visible ? 0 : -1;
    });

    const indexNode = $("#cfIndex");
    const titleNode = $("#cfTitle");
    const categoryNode = $("#cfCategory");
    if (indexNode) indexNode.textContent = pad(coverflow.index + 1);
    if (titleNode) titleNode.textContent = activeItem ? activeItem.title : "";
    if (categoryNode) categoryNode.textContent = activeItem ? activeItem.label : "";
  }

  function startCoverflowAuto() {
    stopCoverflowAuto();
    if (perfLow || window.innerWidth <= 980) return;
    coverflow.timer = window.setInterval(() => {
      if (coverflow.paused || document.hidden) return;
      coverflow.index = (coverflow.index + 1) % coverflow.cards.length;
      updateCoverflow();
    }, 6200);
  }

  function stopCoverflowAuto() {
    if (coverflow.timer) {
      window.clearInterval(coverflow.timer);
      coverflow.timer = null;
    }
  }

  function restartCoverflowAuto() {
    startCoverflowAuto();
  }

  function initCoverflowDrag(stage) {
    stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      coverflow.startX = event.clientX;
      coverflow.deltaX = 0;
      coverflow.dragged = false;
      try {
        stage.setPointerCapture(event.pointerId);
      } catch (error) {
        /* progressive enhancement */
      }
    });

    stage.addEventListener("pointermove", (event) => {
      if (coverflow.startX === null) return;
      coverflow.deltaX = event.clientX - coverflow.startX;
      if (Math.abs(coverflow.deltaX) > 10) coverflow.dragged = true;
    });

    const endDrag = () => {
      if (coverflow.startX === null) return;
      const distance = coverflow.deltaX;
      coverflow.startX = null;
      coverflow.deltaX = 0;
      if (Math.abs(distance) > 44) {
        setCover(coverflow.index + (distance < 0 ? 1 : -1));
        coverflow.dragged = true;
        window.setTimeout(() => {
          coverflow.dragged = false;
        }, 60);
      }
    };

    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("pointerleave", () => {
      if (coverflow.startX !== null) endDrag();
    });
  }

  /* ==========================================================
     Artwork grid
     ========================================================== */

  function buildGallery() {
    const grid = $("#workGrid");
    if (!grid) return;

    const fragment = document.createDocumentFragment();

    artworks.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "work-card";
      card.dataset.category = item.category;
      card.dataset.slug = item.slug;
      card.style.setProperty("--accent", item.accent);
      card.innerHTML = `
        <button class="work-card__open" type="button" data-open="${esc(item.slug)}" aria-label="View ${esc(item.title)}, ${esc(item.label)}">
          <span class="work-card__frame">
            <span class="work-card__media">
              <img src="${thumb(item.slug)}" alt="NIGHTQUILL — ${esc(item.title)}, ${esc(item.label)}" width="${item.w}" height="${item.h}" loading="lazy" decoding="async">
              <span class="work-card__sheen" aria-hidden="true"></span>
              <span class="work-card__view" aria-hidden="true">View piece
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5.2 4H12v6.8"/></svg>
              </span>
            </span>
          </span>
          <span class="work-card__meta">
            <span class="work-card__meta-left">
              <span class="work-card__index">${pad(index + 1)}</span>
              <span class="work-card__title">${esc(item.title)}</span>
              <span class="work-card__tag"><i></i>${esc(item.label)}</span>
            </span>
          </span>
        </button>`;
      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
    updateFilterCounts();
    applyFilter("all");
    initCardTilt();
  }

  function updateFilterCounts() {
    const counts = { all: artworks.length };
    artworks.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    $$(".filter").forEach((button) => {
      const count = $(".filter__count", button);
      if (count && counts[button.dataset.filter] !== undefined) {
        count.textContent = String(counts[button.dataset.filter]);
      }
    });
  }

  function applyFilter(filter) {
    const grid = $("#workGrid");
    if (!grid) return;

    $$(".filter").forEach((button) => {
      const active = button.dataset.filter === filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const cards = $$(".work-card", grid);
    cards.forEach((card) => {
      const show = filter === "all" || card.dataset.category === filter;
      card.hidden = !show;
    });

    visibleArtworks = artworks.filter((item) => filter === "all" || item.category === filter);
    const shownNode = $("#workShown");
    if (shownNode) {
      shownNode.textContent = `${visibleArtworks.length} ${visibleArtworks.length === 1 ? "work" : "works"}`;
    }
  }

  function initFilters() {
    $$(".filter").forEach((button) => {
      button.addEventListener("click", () => applyFilter(button.dataset.filter || "all"));
    });

    $$("[data-goto-filter]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        applyFilter(link.dataset.gotoFilter || "all");
        const work = $("#work");
        if (work) work.scrollIntoView({ behavior: perfLow ? "auto" : "smooth", block: "start" });
      });
    });
  }

  function initCardTilt() {
    const grid = $("#workGrid");
    if (!grid || !finePointer) return;

    let frame = 0;
    let pending = null;

    grid.addEventListener(
      "pointermove",
      (event) => {
        const card = event.target.closest(".work-card");
        if (!card) return;
        pending = { card, clientX: event.clientX, clientY: event.clientY };
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!pending) return;
          const { card: target, clientX, clientY } = pending;
          pending = null;
          const open = $(".work-card__open", target);
          if (!open) return;
          const rect = target.getBoundingClientRect();
          const x = (clientX - rect.left) / rect.width;
          const y = (clientY - rect.top) / rect.height;
          target.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
          target.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
          const rotateX = (0.5 - y) * 3.6;
          const rotateY = (x - 0.5) * 4.4;
          open.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
        });
      },
      { passive: true }
    );

    grid.addEventListener(
      "pointerout",
      (event) => {
        const card = event.target.closest(".work-card");
        if (!card || card.contains(event.relatedTarget)) return;
        const open = $(".work-card__open", card);
        if (open) open.style.transform = "";
      },
      { passive: true }
    );
  }

  /* ==========================================================
     Lightbox
     ========================================================== */

  const lightbox = $("#lightbox");
  const lightboxMedia = $("#lbMedia");
  const lightboxImage = $("#lbImage");
  const lightboxLoading = $("#lbLoading");
  const lightboxCategory = $("#lbCategory");
  const lightboxCount = $("#lbCount");
  const lightboxTitle = $("#lbTitle");
  const lightboxDesc = $("#lbDesc");
  const lightboxLabel = $("#lbLabel");
  const lightboxClose = $(".lightbox__close", lightbox || document);

  function openLightbox(slug) {
    if (!lightbox) return;
    const item = bySlug.get(slug);
    if (!item) return;

    const withinVisible = visibleArtworks.some((artwork) => artwork.slug === slug);
    lightboxList = withinVisible ? visibleArtworks.slice() : artworks.slice();
    lightboxIndex = lightboxList.findIndex((artwork) => artwork.slug === slug);
    if (lightboxIndex < 0) lightboxIndex = 0;

    lightboxTrigger = document.activeElement;
    renderLightbox();

    if (menuOpen) closeMenu();
    lightboxOpen = true;
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    body.classList.add("is-locked");
    document.title = `${item.title} — NIGHTQUILL`;

    window.setTimeout(() => {
      lightboxClose?.focus({ preventScroll: true });
    }, 90);
  }

  function renderLightbox() {
    const item = lightboxList[lightboxIndex];
    if (!item || !lightboxImage) return;

    lightboxMedia?.classList.remove("is-ready");
    if (lightboxLoading) lightboxLoading.textContent = "Loading artwork";
    lightboxImage.setAttribute("src", full(item.slug));
    lightboxImage.setAttribute("alt", `NIGHTQUILL — ${item.title}, ${item.label}`);
    lightboxImage.style.opacity = "0";

    const requested = lightboxImage.getAttribute("src");
    lightboxImage.onload = () => {
      if (lightboxImage.getAttribute("src") === requested) {
        lightboxMedia?.classList.add("is-ready");
        lightboxImage.style.opacity = "";
      }
    };
    lightboxImage.onerror = () => {
      if (lightboxLoading) lightboxLoading.textContent = "Artwork unavailable";
    };

    if (lightboxCategory) lightboxCategory.textContent = item.label;
    if (lightboxTitle) lightboxTitle.textContent = item.title;
    if (lightboxDesc) lightboxDesc.textContent = item.desc;
    if (lightboxLabel) lightboxLabel.textContent = item.label;
    if (lightboxCount) lightboxCount.textContent = `${pad(lightboxIndex + 1)} / ${pad(lightboxList.length)}`;
    if (lightbox) lightbox.style.setProperty("--accent", item.accent);

    if (lightboxImage.complete && lightboxImage.naturalWidth > 0) {
      lightboxMedia?.classList.add("is-ready");
      lightboxImage.style.opacity = "";
    }
  }

  function closeLightbox() {
    if (!lightbox || !lightboxOpen) return;
    lightboxOpen = false;
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    if (!menuOpen) body.classList.remove("is-locked");
    document.title = baseTitle;
    if (lightboxTrigger && typeof lightboxTrigger.focus === "function") {
      lightboxTrigger.focus({ preventScroll: true });
    }
  }

  function stepLightbox(direction) {
    if (!lightboxOpen || !lightboxList.length) return;
    lightboxIndex = (lightboxIndex + direction + lightboxList.length) % lightboxList.length;
    renderLightbox();
  }

  function initLightbox() {
    if (!lightbox) return;

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-open]");
      if (trigger) {
        event.preventDefault();
        openLightbox(trigger.dataset.open);
      }
    });

    lightbox.addEventListener("click", (event) => {
      if (event.target.closest("[data-lb-close]")) closeLightbox();
    });

    $("#lbPrev")?.addEventListener("click", () => stepLightbox(-1));
    $("#lbNext")?.addEventListener("click", () => stepLightbox(1));

    document.addEventListener("keydown", (event) => {
      if (!lightboxOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepLightbox(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepLightbox(1);
        return;
      }

      if (event.key === "Tab") {
        const focusable = [$(".lightbox__close", lightbox), $("#lbPrev"), $("#lbNext")].filter(Boolean);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* ==========================================================
     Navigation, scroll progress & active section
     ========================================================== */

  function initNav() {
    const nav = $("#nav");
    const progressBar = $("#progressBar");
    const toTop = $("#toTop");
    const navLinks = $$(".nav__link");
    const sections = navLinks
      .map((link) => document.getElementById(link.dataset.section))
      .filter(Boolean);

    let maxScroll = 1;
    let ticking = false;
    let measureFrame = 0;

    const measure = () => {
      maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    };

    const setActive = (id) => {
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.dataset.section === id);
      });
    };

    const update = () => {
      ticking = false;
      const y = window.scrollY || window.pageYOffset || 0;
      const ratio = Math.min(1, Math.max(0, y / maxScroll));

      if (nav) nav.classList.toggle("is-scrolled", y > 20);
      if (progressBar) progressBar.style.transform = `scaleX(${ratio.toFixed(4)})`;
      if (toTop) toTop.classList.toggle("is-visible", y > window.innerHeight * 0.75);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    const queueMeasure = () => {
      if (measureFrame) return;
      measureFrame = window.requestAnimationFrame(() => {
        measureFrame = 0;
        measure();
        update();
      });
    };

    if ("IntersectionObserver" in window && sections.length) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setActive(entry.target.id);
          });
        },
        { rootMargin: "-32% 0px -58% 0px", threshold: 0 }
      );
      sections.forEach((section) => observer.observe(section));
    }

    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", queueMeasure, { passive: true });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(queueMeasure);
      resizeObserver.observe(document.body);
    } else {
      window.addEventListener("load", queueMeasure, { once: true });
    }

    // Image decoding can change the document height after load.
    $$("#workGrid img").forEach((image) => {
      if (!image.complete) image.addEventListener("load", queueMeasure, { once: true });
    });

    toTop?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: perfLow ? "auto" : "smooth" });
    });
  }

  /* ==========================================================
     Mobile menu
     ========================================================== */

  function initMenu() {
    const menu = $("#menu");
    const toggle = $("#menuToggle");
    if (!menu || !toggle) return;

    toggle.addEventListener("click", () => {
      if (menuOpen) closeMenu();
      else openMenu();
    });

    $$(".menu__link, .menu__foot a", menu).forEach((link) => {
      link.addEventListener("click", () => closeMenu());
    });

    document.addEventListener("keydown", (event) => {
      if (!menuOpen || lightboxOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key === "Tab") {
        const focusable = $$(".menu__link, .menu__foot a", menu);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    window.addEventListener(
      "resize",
      () => {
        if (window.innerWidth > 1060 && menuOpen) closeMenu();
      },
      { passive: true }
    );
  }

  function openMenu() {
    const menu = $("#menu");
    const toggle = $("#menuToggle");
    if (!menu || !toggle || menuOpen) return;

    menuOpen = true;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    toggle.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    body.classList.add("is-locked");

    window.setTimeout(() => {
      if (menuOpen) $(".menu__link", menu)?.focus({ preventScroll: true });
    }, 120);
  }

  function closeMenu() {
    const menu = $("#menu");
    const toggle = $("#menuToggle");
    if (!menu || !toggle || !menuOpen) return;

    menuOpen = false;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    toggle.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");

    if (!lightboxOpen) body.classList.remove("is-locked");
  }

  /* ==========================================================
     Custom cursor (desktop only)
     ========================================================== */

  function initCursor() {
    const cursor = $("#cursor");
    if (!cursor || !finePointer) return;

    root.classList.add("has-cursor");

    const dot = $(".cursor__dot", cursor);
    const ring = $(".cursor__ring", cursor);
    const label = $(".cursor__label", cursor);
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let ringX = pointerX;
    let ringY = pointerY;
    let frame = 0;
    let shown = false;

    const loop = () => {
      ringX += (pointerX - ringX) * 0.18;
      ringY += (pointerY - ringY) * 0.18;
      if (ring) {
        ring.style.transform = `translate3d(${ringX.toFixed(2)}px, ${ringY.toFixed(2)}px, 0) translate(-50%, -50%)`;
      }
      if (Math.abs(pointerX - ringX) > 0.15 || Math.abs(pointerY - ringY) > 0.15) {
        frame = window.requestAnimationFrame(loop);
      } else {
        frame = 0;
      }
    };

    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(loop);
    };

    document.addEventListener(
      "pointermove",
      (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;

        if (!shown) {
          shown = true;
          ringX = pointerX;
          ringY = pointerY;
          cursor.style.opacity = "1";
        }

        if (dot) {
          dot.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%)`;
        }
        queue();
      },
      { passive: true }
    );

    document.addEventListener("pointerleave", () => {
      shown = false;
      cursor.style.opacity = "0";
    });

    document.addEventListener(
      "pointerover",
      (event) => {
        if (!(event.target instanceof Element)) return;
        const view = event.target.closest(
          "[data-cursor='view'], .work-card__open, .cover-card, .feature__book"
        );
        const drag = event.target.closest(".coverflow__stage");
        const hover = event.target.closest("a, button, .discipline");

        cursor.classList.toggle("is-view", Boolean(view));
        cursor.classList.toggle("is-drag", Boolean(drag) && !view);
        cursor.classList.toggle("is-hover", Boolean(hover) && !view && !drag);

        if (label) {
          label.textContent = view
            ? view.dataset.cursorLabel || "View"
            : drag
              ? "Drag"
              : "";
        }
      },
      { passive: true }
    );

    const stage = $("#coverflowStage");
    if (stage) {
      stage.addEventListener("pointerdown", () => {
        cursor.classList.add("is-drag");
        if (label) label.textContent = "Drag";
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
        stage.addEventListener(name, () => {
          cursor.classList.remove("is-drag");
          if (label && !cursor.classList.contains("is-view")) label.textContent = "";
        });
      });
    }
  }

  function initDisciplineGlow() {
    if (!finePointer) return;

    $$(".discipline").forEach((element) => {
      let frame = 0;
      let pending = null;
      element.addEventListener(
        "pointermove",
        (event) => {
          pending = event;
          if (frame) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            if (!pending) return;
            const rect = element.getBoundingClientRect();
            element.style.setProperty("--mx", `${(((pending.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
            element.style.setProperty("--my", `${(((pending.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
            pending = null;
          });
        },
        { passive: true }
      );
    });
  }

  /* ==========================================================
     Preloader — short, no image waiting
     ========================================================== */

  function initPreloader(onDone) {
    const preloader = $("#preloader");
    if (!preloader) {
      onDone();
      return;
    }

    const bar = $("#preloaderBar");
    const percent = $("#preloaderPct");
    const duration = perfLow ? 200 : 380;
    const started = performance.now();
    let frame = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (bar) bar.style.width = "100%";
      if (percent) percent.textContent = "100";
      body.classList.add("is-ready");

      window.setTimeout(
        () => {
          preloader.classList.add("is-done");
          preloader.setAttribute("aria-hidden", "true");
          body.classList.remove("is-loading");
          onDone();
        },
        perfLow ? 60 : 220
      );
    };

    const tick = (now) => {
      if (finished) return;
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.min(99, Math.round(eased * 100));
      if (bar) bar.style.width = `${value}%`;
      if (percent) percent.textContent = pad(value);
      if (t < 1) frame = window.requestAnimationFrame(tick);
      else finish();
    };

    frame = window.requestAnimationFrame(tick);
    window.setTimeout(finish, 2500);
  }

  /* ==========================================================
     Gentle reveals — desktop only, IntersectionObserver
     ========================================================== */

  function initReveals() {
    if (perfLow || !("IntersectionObserver" in window)) return;

    const targets = [
      ...$$(".section-head"),
      $(".feature__panel"),
      ...$$(".disciplines__grid .discipline"),
      $(".studio__title"),
      $(".studio__side"),
      ...$$(".studio__values .value"),
      ...$$(".cta__inner > :not(.cta__stamp)"),
      $(".cta__stamp"),
      $(".footer__top"),
      $(".footer__word")
    ].filter(Boolean);

    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-inview");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );

    targets.forEach((element) => {
      element.classList.add("nq-reveal");
      observer.observe(element);
    });
  }

  /* ==========================================================
     Idle image warming — decode thumbs before the user scrolls
     ========================================================== */

  function warmGallery() {
    const images = $$("#workGrid img");
    if (!images.length) return;
    const connection = navigator.connection;
    if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ""))) {
      return;
    }

    let lastInteraction = performance.now();
    const markInteraction = () => {
      lastInteraction = performance.now();
    };
    window.addEventListener("scroll", markInteraction, { passive: true });
    window.addEventListener("pointerdown", markInteraction, { passive: true });

    let index = 0;
    const step = () => {
      if (document.hidden || performance.now() - lastInteraction < 800) {
        window.setTimeout(step, 700);
        return;
      }
      const batch = images.slice(index, index + 4);
      index += 4;
      if (!batch.length) return;
      Promise.allSettled(
        batch.map((image) => {
          image.loading = "eager";
          return typeof image.decode === "function" ? image.decode() : Promise.resolve();
        })
      ).then(() => {
        if (index < images.length) window.setTimeout(step, 160);
      });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(step, { timeout: 2200 });
    } else {
      window.setTimeout(step, 900);
    }
  }

  /* ==========================================================
     Boot
     ========================================================== */

  function boot() {
    buildCoverflow();
    buildGallery();
    initFilters();
    initLightbox();
    initNav();
    initMenu();
    initCursor();
    initDisciplineGlow();

    const year = $("#year");
    if (year) year.textContent = String(new Date().getFullYear());

    initPreloader(() => {
      initReveals();
      warmGallery();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
