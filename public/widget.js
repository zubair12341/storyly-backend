(function () {
  'use strict';

  const currentScript =
    document.currentScript ||
    (function () {
      const scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  const API_KEY = currentScript.getAttribute('data-api-key');
  const API_BASE =
    currentScript.getAttribute('data-api-url') || 'http://localhost:3000';
  const CONTAINER_SEL =
    currentScript.getAttribute('data-container') || '#story-widget';
  const CATEGORY = currentScript.getAttribute('data-category') || '';

  if (!API_KEY) {
    console.error('[StoryWidget] Missing data-api-key attribute.');
    return;
  }

  // ── Analytics ────────────────────────────────────────────────
  const eventQueue = [];
  let flushTimer = null;

  function track(type, payload) {
    eventQueue.push({ event_type: type, ...payload, ts: Date.now() });
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushEvents, 2000);
  }

  function flushEvents() {
    if (!eventQueue.length) return;
    const batch = eventQueue.splice(0);
    fetch(API_BASE + '/widget/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify(batch),
      keepalive: true,
    }).catch(() => {});
  }

  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushEvents();
  });

  // ── Icons ────────────────────────────────────────────────────
  const ICON_CLOSE = `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const ICON_MUTE = `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  const ICON_UNMUTE = `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`;
  const ICON_PAUSE = `<svg viewBox="0 0 24 24" style="fill:#fff;stroke:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  const ICON_PLAY = `<svg viewBox="0 0 24 24" style="fill:#fff;stroke:none"><polygon points="5,3 19,12 5,21"/></svg>`;

  // ── Shape styles ─────────────────────────────────────────────
  const SHAPE_STYLES = {
    circle: {
      thumbnailWidth: '72px',
      thumbnailHeight: '72px',
      thumbnailRadius: '50%',
      viewerRadius: '50%',
      labelMaxWidth: '72px',
      trayGap: '32px',
    },
    rounded: {
      thumbnailWidth: '64px',
      thumbnailHeight: '88px',
      thumbnailRadius: '16px',
      viewerRadius: '16px',
      labelMaxWidth: '64px',
      trayGap: '28px',
    },
    square: {
      thumbnailWidth: '80px',
      thumbnailHeight: '80px',
      thumbnailRadius: '8px',
      viewerRadius: '8px',
      labelMaxWidth: '80px',
      trayGap: '28px',
    },
    portrait: {
      thumbnailWidth: '56px',
      thumbnailHeight: '100px',
      thumbnailRadius: '12px',
      viewerRadius: '12px',
      labelMaxWidth: '56px',
      trayGap: '24px',
    },
  };

  // ── Styles ───────────────────────────────────────────────────
  const STYLES = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

    /* ═══════════════════════════════════════
       TRAY WRAPPER
    ═══════════════════════════════════════ */
    .tray-outer {
      width: 100%;
      overflow: hidden;
      padding: 0 16px 4px;
    }

    /* ═══════════════════════════════════════
       TRAY — horizontal scroll row
    ═══════════════════════════════════════ */
    .tray {
      display: flex;
      gap: 12px;
      padding: 8px 4px 16px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      cursor: grab;
      align-items: flex-start;
    }
    .tray:active { cursor: grabbing; }
    .tray::-webkit-scrollbar { display: none; }

    /* ═══════════════════════════════════════
       STORY CARD  — Netflix-style thumbnail
    ═══════════════════════════════════════ */
    .story-card {
      flex: 0 0 140px;
      width: 140px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      text-align: left;
      position: relative;
    }

    /* Visual wrapper — fixed 9:16 aspect ratio card */
    .story-card-visual {
      position: relative;
      width: 140px;
      height: 196px;   /* 9:16 → 140 × (16/9) ≈ 196 */
      border-radius: 8px;
      overflow: hidden;
      background: #1a1a1a;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      flex-shrink: 0;
    }
    .story-card:hover .story-card-visual {
      transform: scale(1.04);
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      z-index: 5;
    }

    /* Ring: thin coloured border = "unseen", grey = "seen" */
    .story-card-ring {
      position: absolute;
      inset: 0;
      border-radius: 8px;
      border: 2.5px solid transparent;
      background:
        linear-gradient(#1a1a1a,#1a1a1a) padding-box,
        linear-gradient(135deg,#e879f9,#6366f1,#06b6d4) border-box;
      z-index: 4;
      pointer-events: none;
    }
    .story-card-ring.seen {
      background:
        linear-gradient(#1a1a1a,#1a1a1a) padding-box,
        linear-gradient(135deg,#3f3f46,#52525b) border-box;
    }
    /* ring-inner not used in new layout */
    .story-card-ring-inner { display: none; }

    /* Media clip fills the visual */
    .story-card-media-clip {
      position: absolute;
      inset: 0;
      border-radius: 8px;
      overflow: hidden;
    }
    .story-card-media-wrap {
      position: absolute;
      inset: 0;
      width: 100% !important;
      height: 100% !important;
    }
    .story-card-img,
    .story-card-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.22s ease;
    }
    .story-card-video { opacity: 0; }
    .story-card.hovering .story-card-video { opacity: 1; }
    .story-card.hovering .story-card-img  { opacity: 0; }

    /* Gradient overlay at bottom of card */
    .story-card-gradient {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 50%;
      background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%);
      z-index: 2;
      pointer-events: none;
    }

    /* Placeholder when no cover image */
    .story-card-cover-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      background: linear-gradient(135deg, #18181b, #27272a);
      width: 100% !important;
      height: 100% !important;
      border-radius: 0 !important;
    }

    /* Logo badge — small pill in bottom-left corner */
    .story-card-logo-wrap {
      position: absolute;
      left: 8px;
      bottom: 8px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      overflow: hidden;
      border: 1.5px solid rgba(255,255,255,0.7);
      background: rgba(0,0,0,0.5);
      z-index: 5;
      flex-shrink: 0;
      transition: opacity 0.2s;
    }
    .story-card:hover .story-card-logo-wrap { opacity: 0; }
    .story-card-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
    .story-card-logo-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #fff;
    }

    /* Duration badge top-right */
    .story-card-count {
      position: absolute;
      top: 6px; right: 6px;
      z-index: 5;
      background: rgba(0,0,0,0.6);
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 5px;
      border-radius: 4px;
      letter-spacing: 0.02em;
    }

    /* Play icon on hover */
    .story-card-play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 6;
      opacity: 0;
      transition: opacity 0.18s;
      pointer-events: none;
    }
    .story-card:hover .story-card-play { opacity: 1; }
    .story-card-play svg {
      width: 36px; height: 36px;
      fill: rgba(255,255,255,0.9);
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));
    }

    /* Label below card */
    .story-card-label {
      margin-top: 7px;
      font-size: 12px;
      font-weight: 500;
      color: #e4e4e7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
      line-height: 1.35;
      padding: 0 1px;
      letter-spacing: 0.01em;
    }

    /* ═══════════════════════════════════════
       MOBILE TRAY
    ═══════════════════════════════════════ */
    .tray-outer.mobile-tray {
      padding: 0 8px 4px;
    }
    .tray-outer.mobile-tray .tray {
      gap: 8px;
      padding: 8px 4px 12px;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
    }
    .tray-outer.mobile-tray .story-card {
      flex: 0 0 var(--card-w);
      width: var(--card-w);
      scroll-snap-align: start;
    }
    .tray-outer.mobile-tray .story-card-visual {
      width: 100%;
      height: var(--card-h);
    }
    .tray-outer.mobile-tray .story-card-label {
      font-size: 11px;
      max-width: var(--card-w);
    }
    @media (hover: none) {
      .story-card:hover .story-card-visual { transform: none !important; box-shadow: none !important; }
      .story-card:hover .story-card-play { opacity: 0 !important; }
    }

    /* ═══════════════════════════════════════
       OVERLAY / FULL-SCREEN VIEWER
    ═══════════════════════════════════════ */
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.92);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s ease;
    }
    .overlay.open { opacity: 1; pointer-events: all; }

    /* ── Viewer layout ── */
    .viewer-layout {
      position: relative;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 0 20px;
      gap: 0;
    }

    /* ── Viewer card — always a clean rectangle ── */
    .viewer {
      position: relative;
      width: 340px;
      max-width: 340px;
      height: 605px;   /* 9:16 aspect ratio */
      max-height: 88vh;
      border-radius: 12px;
      overflow: hidden;
      background: #111;
      box-shadow: 0 24px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06);
      user-select: none;
      flex-shrink: 0;
      align-self: center;
      z-index: 1;
    }

    /* ── Side groups ── */
    .prev-group,
    .next-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-shrink: 0;
      width: 80px;
      z-index: 2;
    }
    .prev-group { margin-right: 12px; }
    .next-group { margin-left: 12px; }

    /* Prev/next labels */
    .preview-label {
      font-size: 9px;
      font-weight: 600;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      text-align: center;
    }

    /* Prev/next mini-preview panels */
    .prev-preview,
    .next-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    /* ── Progress bar ── */
    .progress-bar-row {
      position: absolute;
      top: 8px; left: 8px; right: 8px;
      z-index: 10;
      display: flex;
      gap: 3px;
    }
    .progress-seg {
      flex: 1;
      height: 2px;
      border-radius: 2px;
      background: rgba(255,255,255,0.28);
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: #fff;
      border-radius: 2px;
    }
    .progress-fill.complete   { width: 100%; }
    .progress-fill.animating  { transition: width linear; }

    /* ── Viewer header ── */
    .viewer-header {
      position: absolute;
      top: 20px; left: 10px; right: 10px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .viewer-avatar-wrap {
      width: 32px; height: 32px;
      border-radius: 6px;
      overflow: hidden;
      border: 1.5px solid rgba(255,255,255,0.7);
      flex-shrink: 0;
      background: #27272a;
    }
    .viewer-avatar { width: 100%; height: 100%; object-fit: cover; display: block; }
    .viewer-avatar-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700; color: #fff;
    }
    .viewer-title {
      flex: 1;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      text-shadow: 0 1px 4px rgba(0,0,0,0.6);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .viewer-actions { display: flex; align-items: center; gap: 4px; }

    .btn-icon {
      width: 28px; height: 28px;
      border-radius: 6px;
      background: rgba(0,0,0,0.35);
      border: none;
      color: #fff;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      flex-shrink: 0;
      backdrop-filter: blur(4px);
    }
    .btn-icon:hover { background: rgba(0,0,0,0.6); }
    .btn-icon svg {
      width: 14px; height: 14px;
      fill: none; stroke: #fff;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }

    /* ── Slide content ── */
    .slide-content { position: absolute; inset: 0; }
    .slide-bg {
      position: absolute; inset: 0;
      object-fit: cover;
      width: 100%; height: 100%;
      display: block;
    }
    .slide-bg-color {
      position: absolute; inset: 0;
      background: linear-gradient(160deg, #18181b 0%, #27272a 100%);
    }

    .tap-zone { position: absolute; top: 0; bottom: 0; z-index: 8; width: 40%; cursor: pointer; }
    .tap-prev { left: 0; }
    .tap-next { right: 0; }

    .slide-gradient {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 52%;
      background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%);
      z-index: 5;
      pointer-events: none;
    }

    /* ── CTA ── */
    .cta-wrap {
      position: absolute;
      bottom: 20px; left: 12px; right: 12px;
      z-index: 9;
      display: flex;
      justify-content: center;
    }
    .btn-cta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 11px 24px;
      border-radius: 8px;
      background: #fff;
      color: #111;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      transition: transform 0.12s ease, box-shadow 0.12s ease;
      letter-spacing: -0.01em;
    }
    .btn-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    .btn-cta:active { transform: scale(0.97); }

    /* ── Story nav arrows ── */
    .story-nav {
      width: 40px; height: 40px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(8px);
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.15s, border-color 0.15s;
      flex-shrink: 0;
    }
    .story-nav:hover {
      background: rgba(255,255,255,0.18);
      border-color: rgba(255,255,255,0.4);
      transform: scale(1.06);
    }
    .story-nav:disabled { opacity: 0.2; cursor: default; transform: none; }

    /* ── Next story mini-card ── */
    .next-story-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      padding: 4px;
      background: transparent;
      border: none;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .next-story-card:hover { background: rgba(255,255,255,0.07); }
    .next-story-thumb {
      width: 56px; height: 80px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.12);
    }
    .next-story-thumb img,
    .next-story-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .next-story-thumb-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; color: #52525b;
      background: #18181b;
    }
    .next-story-title {
      font-size: 10px;
      font-weight: 500;
      color: rgba(255,255,255,0.7);
      text-align: center;
      max-width: 68px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .next-story-info, .next-story-meta, .next-story-arrow { display: none; }

    /* ── Pause indicator ── */
    .pause-indicator {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20;
      width: 48px; height: 48px;
      border-radius: 50%;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0;
      transition: opacity 0.18s;
      pointer-events: none;
    }
    .pause-indicator.visible { opacity: 1; }
    .pause-indicator svg { width: 20px; height: 20px; fill: #fff; }

    .empty { padding: 20px; color: #71717a; font-size: 13px; text-align: center; }

    /* ── Mobile overlay ── */
    @media (max-width: 600px) {
      .viewer-layout { padding: 0; }
      .prev-group, .next-group { display: none; }
      .viewer {
        width: 100vw;
        max-width: 100vw;
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
      }
    }
  `;

  // ── Widget class ─────────────────────────────────────────────
  class StoryWidget {
    constructor(container) {
      this.container = container;
      this.stories = [];
      this.fontFamily = 'Inter';
      this.cardShape = 'rounded';
      this.currentStoryIdx = 0;
      this.currentSlideIdx = 0;
      this.timer = null;
      this.seenStories = new Set();
      this.paused = false;
      this.muted = true;

      this._autoScrollRAF = null;
      this._autoScrollPaused = false;
      this._autoScrollSpeed = 0.5;
      this._isDragging = false;
      this._dragStartX = 0;
      this._dragScrollLeft = 0;

      this._buildShadow();
      this._fetchStories();
    }

    _buildShadow() {
      this.shadow = this.container.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = STYLES;
      this.shadow.appendChild(style);

      this.trayOuter = document.createElement('div');
      this.trayOuter.className = 'tray-outer';
      this.shadow.appendChild(this.trayOuter);

      this.tray = document.createElement('div');
      this.tray.className = 'tray';
      this.trayOuter.appendChild(this.tray);

      this._applyMobileLayout();
      this._ro = new ResizeObserver(() => this._applyMobileLayout());
      this._ro.observe(this.container);

      this._setupAutoScroll();

      this.overlay = document.createElement('div');
      this.overlay.className = 'overlay';
      this.overlay.setAttribute('role', 'dialog');
      this.overlay.setAttribute('aria-modal', 'true');
      this.overlay.innerHTML = `
        <div class="viewer-layout">
          <div class="nav-group prev-group">
            <button class="story-nav prev" aria-label="Previous story">&#8249;</button>
            <div class="prev-preview"></div>
          </div>
          <div class="viewer">
            <div class="progress-bar-row"></div>
            <div class="viewer-header"></div>
            <div class="slide-content"></div>
            <div class="slide-gradient"></div>
            <div class="tap-zone tap-prev"></div>
            <div class="tap-zone tap-next"></div>
            <div class="cta-wrap"></div>
            <div class="pause-indicator">${ICON_PAUSE}</div>
          </div>
          <div class="nav-group next-group">
            <div class="next-preview"></div>
            <button class="story-nav next" aria-label="Next story">&#8250;</button>
          </div>
        </div>
      `;
      this.shadow.appendChild(this.overlay);

      this.prevPanel = this.overlay.querySelector('.prev-preview');
      this.progressRow = this.overlay.querySelector('.progress-bar-row');
      this.viewerHeader = this.overlay.querySelector('.viewer-header');
      this.slideContent = this.overlay.querySelector('.slide-content');
      this.ctaWrap = this.overlay.querySelector('.cta-wrap');
      this.nextPanel = this.overlay.querySelector('.next-preview');
      this.pauseIndicator = this.overlay.querySelector('.pause-indicator');
      this.btnPrev = this.overlay.querySelector('.story-nav.prev');
      this.btnNext = this.overlay.querySelector('.story-nav.next');

      this.overlay
        .querySelector('.tap-prev')
        .addEventListener('click', () => this._prevSlide());
      this.overlay
        .querySelector('.tap-next')
        .addEventListener('click', () => this._nextSlide());
      this.btnPrev.addEventListener('click', () => this._prevStory());
      this.btnNext.addEventListener('click', () => this._nextStory());

      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this._closeViewer();
      });

      this._onKey = (e) => {
        if (!this.overlay.classList.contains('open')) return;
        if (e.key === 'ArrowRight') this._nextSlide();
        if (e.key === 'ArrowLeft') this._prevSlide();
        if (e.key === 'Escape') this._closeViewer();
        if (e.key === ' ') this._togglePause();
      };
      document.addEventListener('keydown', this._onKey);
    }

    // ── Auto-scroll ───────────────────────────────────────────
    _setupAutoScroll() {
      const tray = this.tray;

      tray.addEventListener('mouseenter', () => {
        this._autoScrollPaused = true;
      });
      tray.addEventListener('mouseleave', () => {
        if (!this._isDragging) this._autoScrollPaused = false;
      });
      tray.addEventListener(
        'touchstart',
        () => {
          this._autoScrollPaused = true;
        },
        { passive: true },
      );
      tray.addEventListener(
        'touchend',
        () => {
          setTimeout(() => {
            this._autoScrollPaused = false;
          }, 1500);
        },
        { passive: true },
      );

      tray.addEventListener('mousedown', (e) => {
        this._isDragging = true;
        this._autoScrollPaused = true;
        this._dragStartX = e.pageX - tray.offsetLeft;
        this._dragScrollLeft = tray.scrollLeft;
        tray.style.cursor = 'grabbing';
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!this._isDragging) return;
        const x = e.pageX - tray.offsetLeft;
        const walk = (x - this._dragStartX) * 1.5;
        tray.scrollLeft = this._dragScrollLeft - walk;
      });
      document.addEventListener('mouseup', () => {
        if (!this._isDragging) return;
        this._isDragging = false;
        tray.style.cursor = 'grab';
        setTimeout(() => {
          this._autoScrollPaused = false;
        }, 1000);
      });

      this._startAutoScroll();
    }

    _startAutoScroll() {
      const tray = this.tray;
      const step = () => {
        if (
          !this._autoScrollPaused &&
          !this.overlay.classList.contains('open')
        ) {
          const maxScroll = tray.scrollWidth - tray.clientWidth;
          if (maxScroll > 0) {
            tray.scrollLeft += this._autoScrollSpeed;
            if (tray.scrollLeft >= maxScroll - 1) tray.scrollLeft = 0;
          }
        }
        this._autoScrollRAF = requestAnimationFrame(step);
      };
      this._autoScrollRAF = requestAnimationFrame(step);
    }

    // ── Mobile layout ─────────────────────────────────────────
    _applyMobileLayout() {
      const containerW =
        this.container.getBoundingClientRect().width ||
        this.container.offsetWidth;
      const isMobile = containerW < 768;
      if (isMobile) {
        this.trayOuter.classList.add('mobile-tray');
        const cardW = Math.max(260, Math.round(containerW * 0.78));
        const cardH = Math.round(cardW * 1.65);
        this.trayOuter.style.setProperty('--card-w', `${cardW}px`);
        this.trayOuter.style.setProperty('--card-h', `${cardH}px`);
      } else {
        this.trayOuter.classList.remove('mobile-tray');
        this.trayOuter.style.removeProperty('--card-w');
        this.trayOuter.style.removeProperty('--card-h');
      }
    }

    // ── Fetch ─────────────────────────────────────────────────
    async _fetchStories() {
      try {
        let url = CATEGORY
          ? API_BASE +
            '/widget/stories?category=' +
            encodeURIComponent(CATEGORY)
          : API_BASE + '/widget/stories';

        if (LIMIT > 0) {
          url += (url.includes('?') ? '&' : '?') + 'limit=' + LIMIT;
        }

        const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const payload = await res.json();

        // Support both legacy array response and new { stories, category } shape
        if (Array.isArray(payload)) {
          this.stories = payload;
          this.fontFamily = 'Inter';
          this.cardShape = 'rounded';
        } else {
          this.stories = payload.stories || [];
          const cat = payload.category;

          // ── Resolve card shape ──────────────────────────────
          const rawShape = cat && cat.card_shape;
          this.cardShape =
            rawShape && SHAPE_STYLES[rawShape] ? rawShape : 'rounded';
          if (cat && cat.custom_font_url) {
            // Inject @font-face for custom uploaded font
            this.fontFamily =
              'CustomWidgetFont_' + Math.random().toString(36).slice(2);
            const style = document.createElement('style');
            style.textContent =
              '@font-face { font-family: "' +
              this.fontFamily +
              '"; ' +
              'src: url("' +
              cat.custom_font_url +
              '"); }';
            document.head.appendChild(style);
          } else if (cat && cat.font_family && cat.font_family !== 'Inter') {
            // Inject Google Font link (deduped)
            this.fontFamily = cat.font_family;
            const linkId = 'swf-' + encodeURIComponent(cat.font_family);
            if (!document.getElementById(linkId)) {
              const link = document.createElement('link');
              link.id = linkId;
              link.rel = 'stylesheet';
              link.href =
                'https://fonts.googleapis.com/css2?family=' +
                encodeURIComponent(cat.font_family) +
                ':wght@400;600&display=swap';
              document.head.appendChild(link);
            }
          } else {
            this.fontFamily = 'Inter';
          }
        }

        // Apply font to the shadow host container
        this.container.style.fontFamily =
          '"' + this.fontFamily + '", sans-serif';

        this._renderTray();
      } catch (err) {
        console.error('[StoryWidget] Failed to fetch stories:', err);
        this.tray.innerHTML = '<div class="empty">Stories unavailable.</div>';
      }
    }

    // ── Tray ──────────────────────────────────────────────────
    _renderTray() {
      this.tray.innerHTML = '';
      if (!this.stories.length) {
        this.tray.innerHTML = '<div class="empty">No stories yet.</div>';
        return;
      }

      const shape = SHAPE_STYLES[this.cardShape] || SHAPE_STYLES.rounded;

      // Apply gap and extra portrait padding to the tray row
      this.tray.style.gap = shape.trayGap;

      this.stories.forEach((story, idx) => {
        const seen = this.seenStories.has(story.id);
        const card = document.createElement('button');
        card.className = 'story-card';
        card.setAttribute('aria-label', 'Open story: ' + story.title);

        // Size the card flex-basis to thumbnail width so labels align
        card.style.flexBasis = shape.thumbnailWidth;

        const visual = document.createElement('div');
        visual.className = 'story-card-visual';
        // Apply shape radius to the visual container
        visual.style.borderRadius = shape.thumbnailRadius;
        visual.style.width = shape.thumbnailWidth;

        const ring = document.createElement('div');
        ring.className = 'story-card-ring' + (seen ? ' seen' : '');
        // Match ring radius to shape (slightly larger than thumbnail)
        ring.style.borderRadius =
          shape.thumbnailRadius === '50%'
            ? '50%'
            : 'calc(' + shape.thumbnailRadius + ' + 3px)';
        const ringInner = document.createElement('div');
        ringInner.className = 'story-card-ring-inner';
        ringInner.style.borderRadius = shape.thumbnailRadius;
        ring.appendChild(ringInner);
        visual.appendChild(ring);

        const mediaClip = document.createElement('div');
        mediaClip.className = 'story-card-media-clip';
        // Apply shape radius to clip so cover image is clipped correctly
        mediaClip.style.borderRadius = shape.thumbnailRadius;

        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'story-card-media-wrap';
        // Use shape-defined height
        mediaWrap.style.height = shape.thumbnailHeight;
        mediaWrap.style.width = shape.thumbnailWidth;

        const coverSrc = story.cover_image_url || story.thumbnail_url || '';
        const firstSlide = story.slides?.[0];

        if (coverSrc || (firstSlide?.url && firstSlide?.type !== 'video')) {
          const img = document.createElement('img');
          img.className = 'story-card-img';
          img.src = coverSrc || firstSlide.url;
          img.alt = story.title;
          mediaWrap.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'story-card-cover-placeholder';
          ph.style.height = shape.thumbnailHeight;
          ph.style.borderRadius = shape.thumbnailRadius;
          ph.textContent = story.title.charAt(0).toUpperCase();
          mediaWrap.appendChild(ph);
        }

        const videoSlide = story.slides?.find(
          (s) =>
            s.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(s.url || ''),
        );
        if (videoSlide?.url) {
          const video = document.createElement('video');
          video.className = 'story-card-video';
          video.src = videoSlide.url;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.preload = 'metadata';
          mediaWrap.appendChild(video);

          card.addEventListener('mouseenter', () => {
            card.classList.add('hovering');
            card._hoverTimer = setTimeout(() => {
              video.currentTime = 0;
              video.play().catch(() => {});
            }, 120);
          });
          card.addEventListener('mouseleave', () => {
            card.classList.remove('hovering');
            clearTimeout(card._hoverTimer);
            video.pause();
            video.currentTime = 0;
          });
        }

        mediaClip.appendChild(mediaWrap);

        const gradient = document.createElement('div');
        gradient.className = 'story-card-gradient';
        mediaClip.appendChild(gradient);

        visual.appendChild(mediaClip);

        const logoWrap = document.createElement('div');
        logoWrap.className = 'story-card-logo-wrap';
        const logoSrc = story.logo_url || story.thumbnail_url || '';
        if (logoSrc) {
          const logo = document.createElement('img');
          logo.className = 'story-card-logo';
          logo.src = logoSrc;
          logo.alt = '';
          logoWrap.appendChild(logo);
        } else {
          const logoPh = document.createElement('div');
          logoPh.className = 'story-card-logo-placeholder';
          logoPh.textContent = story.title.charAt(0).toUpperCase();
          logoWrap.appendChild(logoPh);
        }
        visual.appendChild(logoWrap);

        const label = document.createElement('span');
        label.className = 'story-card-label';
        label.textContent = story.title;
        label.style.maxWidth = shape.labelMaxWidth;

        card.appendChild(visual);
        card.appendChild(label);
        card.addEventListener('click', () => this._openStory(idx));
        this.tray.appendChild(card);
      });
    }

    // ── Viewer open / close ───────────────────────────────────
    _openStory(storyIdx) {
      this.currentStoryIdx = storyIdx;
      this.currentSlideIdx = 0;
      this.paused = false;
      this.overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      this._autoScrollPaused = true;

      // Apply shape-specific border-radius and mobile-responsive dimensions
      const shape = SHAPE_STYLES[this.cardShape] || SHAPE_STYLES.rounded;
      const viewerEl = this.overlay.querySelector('.viewer');
      if (viewerEl) {
        const isMobile = window.innerWidth < 380;
        viewerEl.style.width = isMobile ? '100vw' : '320px';
        viewerEl.style.maxWidth = isMobile ? '100vw' : '320px';
        viewerEl.style.height = isMobile ? '100vh' : '568px';
        viewerEl.style.maxHeight = isMobile ? '100vh' : '85vh';
        viewerEl.style.borderRadius = isMobile ? '0' : shape.viewerRadius;
      }

      this._renderStory();
      const story = this.stories[storyIdx];
      track('story_view', {
        story_id: story.id,
        session_id: this._sessionId(),
      });
    }

    _closeViewer() {
      this._stopTimer();
      this.overlay.classList.remove('open');
      document.body.style.overflow = '';
      this._autoScrollPaused = false;
      const story = this.stories[this.currentStoryIdx];
      if (story) {
        this.seenStories.add(story.id);
        this._renderTray();
      }
    }

    // ── Render story shell ────────────────────────────────────
    _renderStory() {
      const story = this.stories[this.currentStoryIdx];
      if (!story) {
        this._closeViewer();
        return;
      }

      this.btnPrev.disabled = this.currentStoryIdx === 0;
      this.btnNext.disabled = this.currentStoryIdx === this.stories.length - 1;

      const slides = story.slides || [];
      this.progressRow.innerHTML = '';
      slides.forEach((_, i) => {
        const seg = document.createElement('div');
        seg.className = 'progress-seg';
        const fill = document.createElement('div');
        fill.className =
          'progress-fill' + (i < this.currentSlideIdx ? ' complete' : '');
        seg.appendChild(fill);
        this.progressRow.appendChild(seg);
      });

      this.viewerHeader.innerHTML = '';

      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'viewer-avatar-wrap';
      const avatarSrc =
        story.logo_url || story.cover_image_url || story.thumbnail_url || null;
      if (avatarSrc) {
        const img = document.createElement('img');
        img.className = 'viewer-avatar';
        img.src = avatarSrc;
        img.alt = story.title;
        avatarWrap.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'viewer-avatar-placeholder';
        ph.textContent = story.title.charAt(0).toUpperCase();
        avatarWrap.appendChild(ph);
      }
      this.viewerHeader.appendChild(avatarWrap);

      const titleEl = document.createElement('span');
      titleEl.className = 'viewer-title';
      titleEl.textContent = story.title;
      this.viewerHeader.appendChild(titleEl);

      const actions = document.createElement('div');
      actions.className = 'viewer-actions';

      this.btnMute = document.createElement('button');
      this.btnMute.className = 'btn-icon';
      this.btnMute.setAttribute('aria-label', 'Toggle mute');
      this.btnMute.innerHTML = this.muted ? ICON_MUTE : ICON_UNMUTE;
      this.btnMute.addEventListener('click', () => this._toggleMute());
      actions.appendChild(this.btnMute);

      this.btnPauseHeader = document.createElement('button');
      this.btnPauseHeader.className = 'btn-icon';
      this.btnPauseHeader.setAttribute('aria-label', 'Pause');
      this.btnPauseHeader.innerHTML = ICON_PAUSE;
      this.btnPauseHeader.addEventListener('click', () => this._togglePause());
      actions.appendChild(this.btnPauseHeader);

      const btnClose = document.createElement('button');
      btnClose.className = 'btn-icon';
      btnClose.setAttribute('aria-label', 'Close');
      btnClose.innerHTML = ICON_CLOSE;
      btnClose.addEventListener('click', () => this._closeViewer());
      actions.appendChild(btnClose);

      this.viewerHeader.appendChild(actions);

      this._renderNextPanel();
      this._renderPrevPanel();
      this._renderSlide();
    }

    // ── Side panels ───────────────────────────────────────────
    _renderPrevPanel() {
      this.prevPanel.innerHTML = '';

      const label = document.createElement('div');
      label.className = 'preview-label';
      label.textContent = 'Previous';
      this.prevPanel.appendChild(label);

      const prev = this.stories.slice(
        this.currentStoryIdx - 1,
        this.currentStoryIdx,
      );
      if (!prev.length) return;

      prev.forEach((story) => {
        const realIdx = this.currentStoryIdx - 1;
        const card = document.createElement('button');
        card.className = 'next-story-card';

        const thumb = document.createElement('div');
        thumb.className = 'next-story-thumb';
        const img = document.createElement('img');
        img.src = story.cover_image_url || story.thumbnail_url || '';
        img.alt = story.title;
        thumb.appendChild(img);

        const title = document.createElement('div');
        title.className = 'next-story-title';
        title.textContent = story.title;

        card.appendChild(thumb);
        card.appendChild(title);
        card.addEventListener('click', () => {
          this.currentStoryIdx = realIdx;
          this.currentSlideIdx = 0;
          this._renderStory();
        });
        this.prevPanel.appendChild(card);
      });
    }

    _renderNextPanel() {
      this.nextPanel.innerHTML = '';

      const label = document.createElement('div');
      label.className = 'preview-label';
      label.textContent = 'Up Next';
      this.nextPanel.appendChild(label);

      const upcoming = this.stories.slice(
        this.currentStoryIdx + 1,
        this.currentStoryIdx + 2,
      );
      if (!upcoming.length) return;

      upcoming.forEach((story, i) => {
        const realIdx = this.currentStoryIdx + 1 + i;
        const card = document.createElement('button');
        card.className = 'next-story-card';

        const thumb = document.createElement('div');
        thumb.className = 'next-story-thumb';
        const thumbSrc = story.cover_image_url || story.thumbnail_url || null;
        const firstSlide = story.slides && story.slides[0];

        if (thumbSrc) {
          const img = document.createElement('img');
          img.src = thumbSrc;
          img.alt = story.title;
          thumb.appendChild(img);
        } else if (firstSlide?.url) {
          if (firstSlide.type === 'video') {
            const v = document.createElement('video');
            v.src = firstSlide.url;
            v.muted = true;
            v.autoplay = true;
            v.loop = true;
            v.playsInline = true;
            thumb.appendChild(v);
          } else {
            const img = document.createElement('img');
            img.src = firstSlide.url;
            img.alt = story.title;
            thumb.appendChild(img);
          }
        } else {
          const ph = document.createElement('div');
          ph.className = 'next-story-thumb-placeholder';
          ph.textContent = story.title.charAt(0).toUpperCase();
          thumb.appendChild(ph);
        }

        const info = document.createElement('div');
        info.className = 'next-story-info';
        info.innerHTML = `<div class="next-story-title">${story.title}</div>`;

        const arrow = document.createElement('span');
        arrow.className = 'next-story-arrow';
        arrow.textContent = '›';

        card.appendChild(thumb);
        card.appendChild(info);
        card.appendChild(arrow);
        card.addEventListener('click', () => {
          this.currentStoryIdx = realIdx;
          this.currentSlideIdx = 0;
          this.paused = false;
          this._renderStory();
          track('story_view', {
            story_id: story.id,
            session_id: this._sessionId(),
          });
        });
        this.nextPanel.appendChild(card);
      });
    }

    // ── Slide rendering ───────────────────────────────────────
    _renderSlide() {
      this._stopTimer();
      const story = this.stories[this.currentStoryIdx];
      const slides = story?.slides || [];
      if (!slides.length) {
        this._closeViewer();
        return;
      }

      const slide = slides[this.currentSlideIdx];
      const duration = slide.duration || 5000;

      this.slideContent.innerHTML = '';

      if (slide.url) {
        const isVideo =
          slide.type === 'video' ||
          /\.(mp4|webm|ogg|mov|m4v)$/i.test(slide.url);

        if (isVideo) {
          const video = document.createElement('video');
          video.className = 'slide-bg';
          video.src = slide.url;
          video.autoplay = true;
          video.muted = this.muted;
          video.playsInline = true;
          video.controls = false;
          this._currentVideo = video;
          video.addEventListener('ended', () => this._nextSlide());
          this.slideContent.appendChild(video);
        } else {
          const img = document.createElement('img');
          img.className = 'slide-bg';
          img.src = slide.url;
          img.alt = '';
          img.draggable = false;
          this.slideContent.appendChild(img);
        }
      } else {
        const bg = document.createElement('div');
        bg.className = 'slide-bg-color';
        this.slideContent.appendChild(bg);
      }

      this.ctaWrap.innerHTML = '';
      if (slide.cta?.label && slide.cta?.url) {
        const btn = document.createElement('a');
        btn.className = 'btn-cta';
        btn.href = slide.cta.url;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.textContent = slide.cta.label;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          track('cta_click', {
            story_id: story.id,
            slide_index: this.currentSlideIdx,
            cta_url: slide.cta.url,
            session_id: this._sessionId(),
          });
        });
        this.ctaWrap.appendChild(btn);
      }

      const fills = this.progressRow.querySelectorAll('.progress-fill');
      fills.forEach((f, i) => {
        f.classList.remove('animating');
        f.style.transition = 'none';
        f.style.width = i < this.currentSlideIdx ? '100%' : '0%';
      });

      const currentFill = fills[this.currentSlideIdx];
      if (currentFill && slide.type !== 'video') {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            currentFill.classList.add('animating');
            currentFill.style.transitionDuration = duration + 'ms';
            currentFill.style.width = '100%';
          }),
        );
      }

      track('slide_view', {
        story_id: story.id,
        slide_index: this.currentSlideIdx,
        session_id: this._sessionId(),
      });

      if (slide.type !== 'video') {
        this.timer = setTimeout(() => this._nextSlide(), duration);
      }
    }

    // ── Controls ──────────────────────────────────────────────
    _togglePause() {
      this.paused = !this.paused;
      this.pauseIndicator.classList.toggle('visible', this.paused);

      if (this._currentVideo) {
        this.paused ? this._currentVideo.pause() : this._currentVideo.play();
      }

      if (this.paused) {
        const fills = this.progressRow.querySelectorAll('.progress-fill');
        fills.forEach((f) => {
          const w = getComputedStyle(f).width;
          f.style.transition = 'none';
          f.style.width = w;
        });
        clearTimeout(this.timer);
        this.timer = null;
      } else {
        this._renderSlide();
      }

      if (this.btnPauseHeader) {
        this.btnPauseHeader.innerHTML = this.paused ? ICON_PLAY : ICON_PAUSE;
      }
    }

    _toggleMute() {
      this.muted = !this.muted;
      if (this._currentVideo) this._currentVideo.muted = this.muted;
      if (this.btnMute)
        this.btnMute.innerHTML = this.muted ? ICON_MUTE : ICON_UNMUTE;
    }

    _nextSlide() {
      if (this.paused) return;
      const slides = this.stories[this.currentStoryIdx]?.slides || [];
      if (this.currentSlideIdx < slides.length - 1) {
        this.currentSlideIdx++;
        this._renderSlide();
      } else {
        this._nextStory();
      }
    }

    _prevSlide() {
      if (this.currentSlideIdx > 0) {
        this.currentSlideIdx--;
        this._renderSlide();
      } else {
        this._prevStory();
      }
    }

    _nextStory() {
      if (this.currentStoryIdx < this.stories.length - 1) {
        this.currentStoryIdx++;
        this.currentSlideIdx = 0;
        this.paused = false;
        const story = this.stories[this.currentStoryIdx];
        track('story_view', {
          story_id: story.id,
          session_id: this._sessionId(),
        });
        this._renderStory();
      } else {
        this._closeViewer();
      }
    }

    _prevStory() {
      if (this.currentStoryIdx > 0) {
        this.currentStoryIdx--;
        this.currentSlideIdx = 0;
        this.paused = false;
        this._renderStory();
      }
    }

    _stopTimer() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this._currentVideo) {
        this._currentVideo.pause();
        this._currentVideo.src = '';
        this._currentVideo = null;
      }
    }

    _sessionId() {
      if (!this._sid) {
        try {
          this._sid = sessionStorage.getItem('_sw_sid');
          if (!this._sid) {
            this._sid =
              'sw_' +
              Math.random().toString(36).slice(2) +
              Date.now().toString(36);
            sessionStorage.setItem('_sw_sid', this._sid);
          }
        } catch (_) {
          this._sid = 'sw_' + Math.random().toString(36).slice(2);
        }
      }
      return this._sid;
    }
  }

  // ── Mount ────────────────────────────────────────────────────
  function mount() {
    let container = document.querySelector(CONTAINER_SEL);
    if (!container) {
      container = document.createElement('div');
      container.id = 'story-widget';
      currentScript.parentNode.insertBefore(container, currentScript);
    }
    new StoryWidget(container);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
