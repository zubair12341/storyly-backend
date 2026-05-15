(function () {
  'use strict';

  // ── Locate the widget <script> tag ───────────────────────────
  // document.currentScript is null for external scripts on some browsers
  // (Firefox, older Safari) when the page is served from file://, because
  // the property is only populated during synchronous inline execution.
  // Strategy: prefer document.currentScript, then find the <script> tag
  // whose src contains this bundle's known filename, then fall back to the
  // last <script> in the document at execution time.
  const currentScript = (function () {
    if (document.currentScript) return document.currentScript;
    // Walk all script tags and find one whose src ends with widget.js
    const all = document.getElementsByTagName('script');
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      if (s.src && /\/widget(?:\.min)?\.js(\?.*)?$/.test(s.src)) return s;
    }
    // Last-resort: the last script tag present at execution time
    return all[all.length - 1] || null;
  })();

  if (!currentScript) {
    console.error('[StoryWidget] Could not locate the widget <script> tag.');
    return;
  }

  const API_KEY = currentScript.getAttribute('data-api-key');

  // data-api-url is REQUIRED when the host page is on file:// because there
  // is no origin to resolve a relative URL against. Provide a hard fallback
  // only for local dev convenience; in production the attribute must be set.
  const API_BASE = (function () {
    const attr = currentScript.getAttribute('data-api-url');
    if (attr && attr.trim()) return attr.trim().replace(/\/$/, '');
    // If widget.js itself was fetched from a remote origin, derive the base
    // from its own src (works even when the host page is file://)
    if (currentScript.src && currentScript.src.indexOf('http') === 0) {
      try {
        const u = new URL(currentScript.src);
        return u.origin; // e.g. "https://storyly-backend.onrender.com"
      } catch (_) {}
    }
    return 'http://localhost:3000';
  })();

  const CONTAINER_SEL =
    currentScript.getAttribute('data-container') || '#story-widget';
  const CATEGORY = currentScript.getAttribute('data-category') || '';
  // data-limit is optional; 0 means "no limit" (omit the query param)
  const LIMIT =
    parseInt(currentScript.getAttribute('data-limit') || '0', 10) || 0;

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
  // ── Shape styles ─────────────────────────────────────────────
  const SHAPE_STYLES = {
    rounded: {
      thumbnailWidth: '195px',
      thumbnailHeight: '315px',
      thumbnailRadius: '26px',
      trayGap: '20px',
      aspectRatio: '9 / 16',
    },

    square: {
      thumbnailWidth: '165px',
      thumbnailHeight: '165px',
      thumbnailRadius: '22px',
      trayGap: '14px',
      aspectRatio: '1 / 1',
    },

    circle: {
      thumbnailWidth: '165px',
      thumbnailHeight: '165px',
      thumbnailRadius: '50%',
      trayGap: '14px',
      aspectRatio: '1 / 1',
    },

    portrait: {
      thumbnailWidth: '195px',
      thumbnailHeight: '315px',
      thumbnailRadius: '24px',
      trayGap: '14px',
      aspectRatio: '9 / 16',
    },
  };

  // ── Styles ───────────────────────────────────────────────────
  const STYLES = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host {
      display: block;
    }

    /* ═══════════════════════════════════════
       TRAY WRAPPER
    ═══════════════════════════════════════ */
    .tray-outer {
      width: 100%;
      overflow: hidden;
      padding: 0 80px;
      padding-bottom: 18px;
    }

    .tray {
      display: flex;
      gap: 22px;
      padding: 18px 10px 28px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      cursor: grab;
    }
    .tray:active { cursor: grabbing; }
    .tray::-webkit-scrollbar { display: none; }

    /* ═══════════════════════════════════════
       STORY CARD
    ═══════════════════════════════════════ */
    .story-card {
      flex: 0 0 auto;

      display: flex;
      flex-direction: column;
      align-items: center;

      cursor: pointer;

      background: none;
      border: none;

      padding: 0;

      text-align: center;

      position: relative;

      overflow: visible;
    }
    .story-card-visual {
      position: relative;
      width: 100%;
      border-radius: 18px;
      overflow: visible;
      background: #ddd;
      transition: transform 0.35s ease;
    }
    .story-card-media-clip {
      border-radius: 18px;
      overflow: hidden;
      position: relative;
    }
    .story-card:hover .story-card-visual {
      transform: translateY(-6px) scale(1.02);
      z-index: 5;
    }
    .story-card-media-clip::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 18px;
      background: rgba(0,0,0,0.08);
      pointer-events: none;
      transition: background 0.3s;
      z-index: 3;
    }
    .story-card:hover .story-card-media-clip::after { background: rgba(0,0,0,0.16); }

    .story-card-ring {
      display: none;
      position: absolute;
      inset: -3px;
      border-radius: 21px;
      z-index: 0;
      pointer-events: none;
    }
    .story-card-ring.seen { background: rgba(200,200,200,0.5); }
    .story-card-ring-inner {
      position: absolute;
      inset: 3px;
      border-radius: 18px;
      background: #ddd;
      z-index: 0;
    }

    .story-card-media-wrap {
        position: relative;
        width: 100%;
        overflow: hidden;
    }
    .story-card-img,
    .story-card-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.25s ease;
    }
    .story-card-video { opacity: 0; }
    .story-card.hovering .story-card-video { opacity: 1; }
    .story-card.hovering .story-card-img  { opacity: 0; }

    .story-card-cover-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 52px;
      font-weight: 700;
      color: rgba(255,255,255,0.6);
      background: linear-gradient(135deg, #1f2937, #374151);
    }

    .prev-group{
        margin-right: 16px;
        position: absolute;
        left: 20%;
        transform: translate(-50%, -50%);
        top: 80%;
    }
    .next-group {
        margin-right: 16px;
        position: absolute;
        right: 20%;
        transform: translate(-50%, -50%);
        top: 80%;
    }

    .story-card-logo-wrap {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      position: absolute;
      left: 10px;
      bottom: 10px;
      transform: none;
      background: #fff;
      padding: 3px;
      border: 3px solid #fff;
      overflow: hidden;
      box-shadow:
        0 4px 12px rgba(0,0,0,0.25),
        0 1px 4px rgba(0,0,0,0.15);
      z-index: 12;
      display: flex;
      align-items: center;
      justify-content: center;
      transition:
        opacity 0.25s ease,
        transform 0.25s ease;
    }

    .story-card-logo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .story-card:hover .story-card-logo-wrap {
      opacity: 0;
      transform: scale(0.7);
      pointer-events: none;
    }
    .story-card-logo-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;

      font-size: 18px;
      font-weight: 800;

      color: #fff;

      background: linear-gradient(135deg, #6366f1, #ec4899);
    }
    .story-card-logo-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: 700;
      color: #fff;
    }

    .story-card-gradient {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 40%;
      background: linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%);
      z-index: 2;
      pointer-events: none;
      border-radius: 0 0 24px 24px;
    }

    .story-card-label {
      margin-top: 12px;

      font-size: 14px;
      font-weight: 600;
      line-height: 1.2;

      color: #0b0e14;

      text-align: center;
      width: 100%;

      letter-spacing: -0.01em;

      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* ═══════════════════════════════════════
       MOBILE TRAY
    ═══════════════════════════════════════ */
    .tray-outer.mobile-tray .story-card:hover .story-card-visual { transform: none; }

    .tray-outer.mobile-tray {
      padding: 0 0 0 12px;
      overflow: visible;
    }
    .tray-outer.mobile-tray .tray {
      gap: 25px;
      padding: 10px 12px 90px 0;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
    }
    .tray-outer.mobile-tray .story-card {
      flex: 0 0 var(--card-w);
      width: var(--card-w);
      scroll-snap-align: start;
      scroll-snap-stop: always;
    }
    .tray-outer.mobile-tray .story-card-visual,
    .tray-outer.mobile-tray .story-card-media-clip { border-radius: 22px; }
    .tray-outer.mobile-tray .story-card-ring       { border-radius: 25px; }
    .tray-outer.mobile-tray .story-card-ring-inner { border-radius: 22px; }
    .tray-outer.mobile-tray .story-card-media-wrap,
    .tray-outer.mobile-tray .story-card-cover-placeholder { height: var(--card-h); }
    .tray-outer.mobile-tray .story-card-logo-wrap {
      width: 55px;
      height: 55px;
      bottom: 12px;
      left: 12px;
      border-width: 2px;
    }
    .tray-outer.mobile-tray .story-card-label {
      margin-top: 12px;
      font-size: 13px;
      line-height: 1.35;
    }

    @media (hover: none) {
      .story-card:hover .story-card-visual { transform: none !important; }
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
      background: rgb(0 0 0 / 96%);
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
      padding: 45px 24px 24px;
      gap: 0;
    }

    /* ── Viewer card ── */
    .viewer {
      position: relative;

      width: min(360px, 92vw);

      aspect-ratio: 9 / 16;

      max-height: 88vh;

      border-radius: 22px;

      overflow: hidden;

      background: #111;

      box-shadow: 0 20px 60px rgba(0,0,0,0.45);

      flex-shrink: 0;
    }

    /* ── Side groups: sit beside viewer, content at bottom of group ── */
    .prev-group,
    .next-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-shrink: 0;
      align-self: stretch;
      width: 90px;
      z-index: 2;
      padding-bottom: 60px;
    }

    .prev-group { margin-right: 34px; }
    .next-group { margin-left: 34px; }

    /* arrow below preview */
    .story-nav.prev { order: 2; position: static; }
    .prev-preview   { order: 1; }
    .next-preview   { order: 1; }
    .story-nav.next { order: 2; position: static; }

    /* Preview panels — column: label → thumbnail → title */
    .prev-preview,
    .next-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      width: 80px;
    }

    .preview-label {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.55);
      text-align: center;
      white-space: nowrap;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .progress-bar-row {
      position: absolute;
      top: 10px; left: 10px; right: 10px;
      z-index: 10;
      display: flex;
      gap: 3px;
    }
    .progress-seg {
      flex: 1;
      height: 2.5px;
      border-radius: 3px;
      background: rgba(255,255,255,0.35);
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: #fff;
      border-radius: 3px;
    }
    .progress-fill.complete   { width: 100%; }
    .progress-fill.animating  { transition: width linear; }

    .viewer-header {
      position: absolute;
      top: 22px; left: 10px; right: 10px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .viewer-avatar-wrap {
      width: 36px; height: 36px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid rgba(255,255,255,0.85);
      flex-shrink: 0;
      background: #374151;
    }
    .viewer-avatar { width: 100%; height: 100%; object-fit: cover; display: block; }
    .viewer-avatar-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700; color: #fff;
    }
    .viewer-title {
      flex: 1;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      text-shadow: 0 1px 4px rgba(0,0,0,0.5);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .viewer-actions { display: flex; align-items: center; gap: 6px; }

    .btn-icon {
      width: 30px; height: 30px;
      border-radius: 50%;
      background: rgba(0,0,0,0.3);
      border: none;
      color: #fff;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .btn-icon:hover { background: rgba(0,0,0,0.55); }
    .btn-icon svg {
      width: 15px; height: 15px;
      fill: none; stroke: #fff;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }

    .slide-content { position: absolute; inset: 0; }
    .slide-bg { position: absolute; inset: 0; object-fit: cover; width: 100%; height: 100%; display: block; }
    .slide-bg-color { position: absolute; inset: 0; background: linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95); }

    .tap-zone { position: absolute; top: 0; bottom: 0; z-index: 8; width: 38%; cursor: pointer; }
    .tap-prev { left: 0; }
    .tap-next { right: 0; }

    .slide-gradient {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 55%;
      background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
      z-index: 5;
      pointer-events: none;
    }

    .cta-wrap {
      position: absolute;
      bottom: 24px; left: 14px; right: 14px;
      z-index: 9;
      display: flex;
      justify-content: center;
    }
    .btn-cta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 12px 28px;
      border-radius: 100px;
      background: #fff;
      color: #111;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      transition: transform 0.12s ease, box-shadow 0.12s ease;
      letter-spacing: -0.01em;
    }
    .btn-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
    .btn-cta:active { transform: scale(0.97); }

    .story-nav {
      width: 44px; height: 44px;
      border-radius: 50%;
      border: none;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(6px);
      color: #fff;
      font-size: 22px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.15s;
      flex-shrink: 0;
    }
    .story-nav:hover { background: rgba(255,255,255,0.25); transform: scale(1.08); }
    .story-nav:disabled { opacity: 0.25; cursor: default; transform: none; }

    /* Next-story mini-card */
    .next-story-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px;
      background: transparent;
      border: none;
      cursor: pointer;
    }
    .next-story-card:hover { background: rgba(255,255,255,0.08); border-radius: 8px; }
    .next-story-thumb { width: 40px; height: 52px; border-radius: 6px; overflow: hidden; }
    .next-story-thumb img,
    .next-story-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .next-story-thumb-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; color: #6b7280;
      background: linear-gradient(135deg, #1f2937, #374151);
    }
    .next-story-info { flex: 1; min-width: 0; }
    .next-story-title { font-size: 11px; color: #fff; max-width: 80px; }
    .next-story-meta  { display: none; }
    .next-story-arrow { display: none; }

    /* Pause indicator */
    .pause-indicator {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20;
      width: 52px; height: 52px;
      border-radius: 50%;
      background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .pause-indicator.visible { opacity: 1; }
    .pause-indicator svg { width: 22px; height: 22px; fill: #fff; }

    .empty { padding: 20px; color: #9ca3af; font-size: 13px; text-align: center; }

    /* ── Mobile overlay ── */
    @media (max-width: 600px) {
      .viewer-layout {
        padding: 0 4px;
      }
      .prev-group,
      .next-group {
        width: 44px;
        margin: 0 -12px;
        padding-bottom: 32px;
        gap: 8px;
      }
      .prev-preview,
      .next-preview {
        display: none;
      }
      .story-nav {
        width: 36px;
        height: 36px;
        font-size: 18px;
      }
      .viewer {
        max-width: calc(100vw - 80px);
        height: min(568px, 85vh);
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
        const cardW = Math.min(240, Math.round(containerW * 0.72));
        this.trayOuter.style.setProperty('--card-w', `${cardW}px`);
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
        // Apply dynamic font inside shadow DOM
        const dynamicFontStyle = document.createElement('style');

        dynamicFontStyle.textContent = `
          :host,
          .tray,
          .story-card,
          .story-card-label,
          .viewer,
          .viewer-title,
          .next-story-title,
          .btn-cta,
          .preview-label {
            font-family: "${this.fontFamily}", sans-serif !important;
          }
        `;

        this.shadow.appendChild(dynamicFontStyle);

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
        const visual = document.createElement('div');
        visual.className = 'story-card-visual';
        // Apply shape radius to the visual container
        visual.style.width = shape.thumbnailWidth;

        visual.style.borderRadius = shape.thumbnailRadius;

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

        mediaClip.style.borderRadius = shape.thumbnailRadius;
        // Apply shape radius to clip so cover image is clipped correctly

        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'story-card-media-wrap';
        mediaWrap.style.borderRadius = shape.thumbnailRadius;

        mediaWrap.style.aspectRatio = shape.aspectRatio;
        mediaWrap.style.height = shape.thumbnailHeight;
        // Use shape-defined height

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
      // currentScript.parentNode can be null by the time DOMContentLoaded
      // fires (the parser has moved on). Prefer inserting before the script
      // tag when its parent is still in the DOM, otherwise append to body.
      const anchor =
        currentScript && currentScript.parentNode ? currentScript : null;
      if (anchor) {
        anchor.parentNode.insertBefore(container, anchor);
      } else {
        (document.body || document.documentElement).appendChild(container);
      }
    }
    new StoryWidget(container);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
