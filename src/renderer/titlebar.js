// src/renderer/titlebar.js
// NVECode â€” Universal custom titlebar
//
// Renders macOS-style 3-dot traffic lights on Windows, Linux AND macOS.
// Injected via win.webContents.executeJavaScript() after workbench loads.
// The window is frameless (frame:false) on every platform.

(function initVecodeTitlebar() {
  'use strict';

  if (document.getElementById('vecode-titlebar')) return;

  // â”€â”€ Traffic light colours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const LIGHTS = {
    close:    { idle: '#ff5f57', hover: '#ff5f57', icon: '#4d0000' },
    minimize: { idle: '#ffbd2e', hover: '#ffbd2e', icon: '#4d3000' },
    maximize: { idle: '#28c940', hover: '#28c940', icon: '#003d10' },
  };

  // â”€â”€ SVG icons (visible on hover, hidden at rest) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ICONS = {
    close: `<svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
      <path d="M.22.22a.75.75 0 011.06 0L3 1.94 4.72.22a.75.75 0 111.06 1.06L4.06 3l1.72 1.72a.75.75 0 11-1.06 1.06L3 4.06 1.28 5.78A.75.75 0 01.22 4.72L1.94 3 .22 1.28A.75.75 0 01.22.22z"/>
    </svg>`,
    minimize: `<svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
      <rect x="0" y="2.5" width="6" height="1" rx="0.5"/>
    </svg>`,
    maximize: `<svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
      <path d="M.75 5.5h1.5a.75.75 0 000-1.5H1.5V2.75a.75.75 0 00-1.5 0v2a.75.75 0 00.75.75zM3.75.5H5.25A.75.75 0 016 1.25v1.5a.75.75 0 01-1.5 0V1.5H3.75a.75.75 0 010-1.5z"/>
    </svg>`,
    restore: `<svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
      <rect x=".5" y=".5" width="5" height="5" rx=".5" fill="none" stroke="currentColor" stroke-width="1"/>
    </svg>`,
  };

  // â”€â”€ Build titlebar DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bar = document.createElement('div');
  bar.id = 'vecode-titlebar';
  bar.innerHTML = `
    <div id="vecode-traffic">
      <button id="vecode-btn-close"    data-action="close"    title="Close">
        <span class="vecode-light-dot" style="background:${LIGHTS.close.idle}">
          <span class="vecode-light-icon">${ICONS.close}</span>
        </span>
      </button>
      <button id="vecode-btn-minimize" data-action="minimize" title="Minimize">
        <span class="vecode-light-dot" style="background:${LIGHTS.minimize.idle}">
          <span class="vecode-light-icon">${ICONS.minimize}</span>
        </span>
      </button>
      <button id="vecode-btn-maximize" data-action="maximize" title="Maximize">
        <span class="vecode-light-dot" style="background:${LIGHTS.maximize.idle}">
          <span class="vecode-light-icon" id="vecode-icon-max">${ICONS.maximize}</span>
        </span>
      </button>
    </div>

    <div id="vecode-title-text">NVECode</div>
  `;

  // â”€â”€ Styles injected as a <style> tag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const style = document.createElement('style');
  style.id = 'vecode-titlebar-style';
  style.textContent = `
    #vecode-titlebar {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 999999;
      height: 40px;
      background: #0d1117;
      border-bottom: 1px solid #161b24;
      display: flex;
      align-items: center;
      padding: 0;
      /* entire bar is draggable */
      -webkit-app-region: drag;
      user-select: none;
      box-sizing: border-box;
    }

    /* â”€â”€ Traffic lights cluster â”€â”€ */
    #vecode-traffic {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px 0 16px;
      /* NOT draggable â€” clickable buttons */
      -webkit-app-region: no-drag;
      flex-shrink: 0;
    }

    #vecode-traffic button {
      width: 12px;
      height: 12px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      outline: none;
    }

    .vecode-light-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: filter 0.1s;
      /* subtle inner shadow for depth */
      box-shadow: inset 0 0 0 0.5px rgba(0,0,0,0.25);
    }

    .vecode-light-icon {
      display: none;
      color: rgba(0,0,0,0.5);
      line-height: 0;
    }

    /* Show icons only when hovering the traffic group */
    #vecode-traffic:hover .vecode-light-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* Dim non-hovered dots when group is hovered */
    #vecode-traffic:hover button:not(:hover) .vecode-light-dot {
      filter: brightness(0.85);
    }
    /* Brighten on individual button hover */
    #vecode-traffic button:hover .vecode-light-dot {
      filter: brightness(1.1);
    }
    /* Press effect */
    #vecode-traffic button:active .vecode-light-dot {
      filter: brightness(0.8);
      transform: scale(0.92);
    }

    /* â”€â”€ Window inactive â€” desaturate lights â”€â”€ */
    #vecode-titlebar.vecode-inactive #vecode-traffic .vecode-light-dot {
      background: #3a3a3c !important;
    }
    #vecode-titlebar.vecode-inactive #vecode-traffic .vecode-light-icon {
      display: none !important;
    }

    /* â”€â”€ Title text â”€â”€ */
    #vecode-title-text {
      flex: 1;
      text-align: center;
      font-family: 'Inter', 'Inter Variable', -apple-system, system-ui, sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #3d4558;
      letter-spacing: 0.01em;
      pointer-events: none;
      /* keep centered by not caring about left padding offset */
      margin-right: 52px; /* compensate for traffic lights width */
    }

    /* â”€â”€ Ensure VSCodium workbench clears the titlebar â”€â”€ */
    body,
    .monaco-workbench,
    .monaco-workbench .part.titlebar {
      margin-top: 40px !important;
    }
    /* Hide VSCodium's own titlebar (we replace it) */
    .monaco-workbench .part.titlebar {
      display: none !important;
    }
    /* Compensate: push activity bar + sidebar down */
    .monaco-workbench .activitybar,
    .monaco-workbench .part.sidebar,
    .monaco-workbench .part.editor {
      top: 0 !important;
    }
  `;

  document.head.appendChild(style);
  document.body.prepend(bar);

  // â”€â”€ Wire button actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  document.getElementById('vecode-btn-close').onclick    = () => window.vecodeWindow?.close();
  document.getElementById('vecode-btn-minimize').onclick = () => window.vecodeWindow?.minimize();
  document.getElementById('vecode-btn-maximize').onclick = () => window.vecodeWindow?.maximize();

  // â”€â”€ Sync maximize icon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const iconMax = document.getElementById('vecode-icon-max');

  async function syncState() {
    if (!window.vecodeWindow) return;
    const state = await window.vecodeWindow.getState();
    const isMax = state === 'maximized' || state === 'fullscreen';
    if (iconMax) iconMax.innerHTML = isMax ? ICONS.restore : ICONS.maximize;
    document.getElementById('vecode-btn-maximize').title = isMax ? 'Restore' : 'Maximize';
  }

  if (window.vecodeWindow?.onStateChange) {
    window.vecodeWindow.onStateChange(syncState);
  }
  syncState();

  // â”€â”€ Inactive state (dim lights when window loses focus) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  window.addEventListener('blur',  () => bar.classList.add('vecode-inactive'));
  window.addEventListener('focus', () => bar.classList.remove('vecode-inactive'));

  // â”€â”€ Sync title text with document.title â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const titleEl = document.getElementById('vecode-title-text');
  const titleTag = document.querySelector('head > title');

  function updateTitle() {
    const t = document.title;
    // VSCodium format: "filename â€” NVECode"  â†’  strip the app name part
    titleEl.textContent = t.replace(/\s*[â€”â€“-]\s*NVECode$/i, '').trim() || 'NVECode';
  }
  updateTitle();

  if (titleTag) {
    new MutationObserver(updateTitle)
      .observe(titleTag, { childList: true, characterData: true, subtree: true });
  }

  // â”€â”€ macOS: also handle native traffic-light area if it leaked through â”€â”€â”€â”€â”€
  // (Our main.js pushes native lights off-screen; this is a safety measure)
  const nativeLights = document.querySelector('.window-controls-container');
  if (nativeLights) nativeLights.style.display = 'none';

})();





