/**
 * Token Action Bar — a compact HUD that appears next to NPC tokens
 * on the canvas, providing quick TARGET / ATTACK / DEFENSE buttons.
 */

import { MODULE_ID } from "./constants.mjs";

/** Active bar element (only one at a time). */
let _activeBar = null;
let _activeTokenId = null;
let _sourceTokenId = null;

/** Targeting mode state */
let _targetingMode = false;
let _targetingCtrlHeld = false;
let _aoeGraphics = null;
let _dragStart = null;
let _dragStartTime = 0;
let _isDragging = false;

/** Constants for click vs drag detection */
const DRAG_THRESHOLD_PX = 20;
const CLICK_THRESHOLD_MS = 300;

/* -------------------------------------------- */
/*  Init overlay + hooks                        */
/* -------------------------------------------- */

export function initTokenActionBar() {
  // Create a viewport-level overlay so bar positioning uses raw screen
  // pixels with zero parent-transform interference.
  _ensureOverlay();

  // When a token is selected/deselected
  Hooks.on("controlToken", (token, controlled) => {
    if (!token?.actor || token.actor.type !== "npc") return;

    if (controlled) {
      _showBar(token);
    } else if (_activeTokenId === token.id) {
      _hideBar();
    }
  });

  // Reposition when canvas pans/zooms
  Hooks.on("canvasPan", () => {
    if (_activeBar && _activeTokenId) {
      const token = canvas.tokens?.get(_activeTokenId);
      if (token) _positionBar(token, _activeBar);
    }
  });

  // Reposition when token itself moves or is refreshed
  Hooks.on("refreshToken", (token) => {
    if (_activeBar && _activeTokenId === token.id) {
      _positionBar(token, _activeBar);
    }
  });

  // Reposition on window resize
  window.addEventListener("resize", () => {
    if (_activeBar && _activeTokenId) {
      const token = canvas.tokens?.get(_activeTokenId);
      if (token) _positionBar(token, _activeBar);
    }
  });

  // Hide bar when canvas is deactivated (e.g. switching scenes)
  Hooks.on("canvasTearDown", () => {
    _exitTargetingMode();
    _hideBar();
  });
}

/* -------------------------------------------- */
/*  Overlay container (viewport-level)          */
/* -------------------------------------------- */

function _ensureOverlay() {
  if (document.getElementById("cne-token-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "cne-token-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 9999;
  `;
  document.body.appendChild(overlay);
}

function _overlay() {
  return document.getElementById("cne-token-overlay");
}

/* -------------------------------------------- */
/*  Targeting overlay (captures all events)     */
/* -------------------------------------------- */

function _ensureTargetingOverlay() {
  if (document.getElementById("cne-targeting-overlay")) return;

  const el = document.createElement("div");
  el.id = "cne-targeting-overlay";
  el.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(200, 40, 40, 0.10);
    cursor: crosshair;
    pointer-events: all;
    z-index: 9998;
    opacity: 0;
    transition: opacity 0.25s ease;
  `;
  document.body.appendChild(el);
}

function _getTargetingOverlay() {
  return document.getElementById("cne-targeting-overlay");
}

function _setTargetingOverlay(show) {
  const el = _getTargetingOverlay();
  if (!el) return;
  el.style.opacity = show ? "1" : "0";
  el.style.pointerEvents = show ? "all" : "none";
}

/* -------------------------------------------- */
/*  Coordinate conversion: screen → world       */
/* -------------------------------------------- */

function _screenToWorld(clientX, clientY) {
  const board = document.getElementById("board");
  if (!board || !canvas.stage) return { x: 0, y: 0 };

  const rect = board.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;

  // PIXI v8: stage.toLocal converts screen → world
  const pt = new PIXI.Point(screenX, screenY);
  return canvas.stage.toLocal(pt);
}

/* -------------------------------------------- */
/*  Show / Hide                                 */
/* -------------------------------------------- */

function _showBar(token) {
  _hideBar(); // Only one bar at a time

  const bar = document.createElement("div");
  bar.className = "cne-token-action-bar";
  bar.id = "cne-token-action-bar";

  const actions = [
    { key: "target", icon: "fa-solid fa-crosshairs", label: null },  // icon-only
    { key: "attack", icon: "fa-solid fa-sword",      label: game.i18n.localize("CNE.TokenHud.Attack") },
    { key: "defense", icon: "fa-solid fa-shield-halved", label: game.i18n.localize("CNE.TokenHud.Defense") }
  ];

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cne-token-action cne-token-action--${action.key}`;
    btn.dataset.action = action.key;
    btn.title = action.label || game.i18n.localize("CNE.TokenHud.Target");
    const iconHtml = `<i class="${action.icon}"></i>`;
    const labelHtml = action.label ? `<span>${action.label}</span>` : "";
    btn.innerHTML = iconHtml + labelHtml;
    btn.addEventListener("click", (ev) => _onActionClick(ev, token, action.key));
    bar.appendChild(btn);
  }

  const overlay = _overlay();
  if (overlay) {
    overlay.appendChild(bar);
    _activeBar = bar;
    _activeTokenId = token.id;
    _positionBar(token, bar);
  }
}

function _hideBar() {
  if (_activeBar) {
    _activeBar.remove();
    _activeBar = null;
    _activeTokenId = null;
  }
}

/* -------------------------------------------- */
/*  Positioning — viewport screen pixels        */
/* -------------------------------------------- */

function _positionBar(token, bar) {
  if (!token || !bar || !canvas.ready) return;

  const canvasEl = document.getElementById("board");
  if (!canvasEl) return;
  const canvasRect = canvasEl.getBoundingClientRect();

  const tokenPos = token.getGlobalPosition();

  // Place bar well to the RIGHT of the token so it clears the core Foundry
  // token HUD controls which appear on the left side of selected tokens.
  const tokenW = (token.w || (token.document?.width || 1) * (canvas.grid?.size || 100)) * canvas.stage.scale.x;

  const screenX = canvasRect.left + tokenPos.x + tokenW + 70; // 70px gap to clear left HUD
  const screenY = canvasRect.top  + tokenPos.y + 8;

  bar.style.left = `${screenX}px`;
  bar.style.top  = `${screenY}px`;
}

/* -------------------------------------------- */
/*  Action handlers                             */
/* -------------------------------------------- */

function _onActionClick(event, token, action) {
  event.preventDefault();
  event.stopPropagation();

  const actor = token.actor;
  if (!actor) return;

  switch (action) {
    case "target":
      _enterTargetingMode(token);
      break;
    case "attack":
      _doAttack(actor);
      break;
    case "defense":
      _doDefense(actor);
      break;
  }
}

/* -------------------------------------------- */
/*  TARGETING MODE                              */
/* -------------------------------------------- */

function _enterTargetingMode(sourceToken) {
  if (_targetingMode) return;
  _targetingMode = true;

  // Remember which token initiated targeting so we can re-show its bar later
  _sourceTokenId = sourceToken?.id || _activeTokenId;

  // Hide the action bar while targeting
  _hideBar();

  // Ensure targeting overlay exists and show it
  _ensureTargetingOverlay();
  _setTargetingOverlay(true);

  // Bind DOM pointer events on the overlay (captures everything, tokens can't intercept)
  const overlay = _getTargetingOverlay();
  if (overlay) {
    overlay.addEventListener("pointerdown", _onTargetMouseDown);
    overlay.addEventListener("pointermove", _onTargetMouseMove);
    overlay.addEventListener("pointerup",   _onTargetMouseUp);
  }

  // Track Ctrl key
  document.addEventListener("keydown", _onTargetKeyDown);
  document.addEventListener("keyup",   _onTargetKeyUp);

  // Escape cancels targeting mode
  document.addEventListener("keydown", _onTargetEscape);

  ui.notifications.info("Click a token to target it. Drag for AOE. Hold Ctrl to multi-select. Esc to cancel.");
}

function _exitTargetingMode() {
  if (!_targetingMode) return;
  _targetingMode = false;

  // Hide targeting overlay
  _setTargetingOverlay(false);

  // Unbind DOM pointer events
  const overlay = _getTargetingOverlay();
  if (overlay) {
    overlay.removeEventListener("pointerdown", _onTargetMouseDown);
    overlay.removeEventListener("pointermove", _onTargetMouseMove);
    overlay.removeEventListener("pointerup",   _onTargetMouseUp);
  }

  // Unbind key events
  document.removeEventListener("keydown", _onTargetKeyDown);
  document.removeEventListener("keyup",   _onTargetKeyUp);
  document.removeEventListener("keydown", _onTargetEscape);

  // Remove AOE graphics
  _clearAoeGraphics();
  _dragStart = null;
  _dragStartTime = 0;
  _isDragging = false;

  // Re-show the action bar for the source token
  const sourceId = _sourceTokenId;
  _sourceTokenId = null;

  if (sourceId) {
    const token = canvas.tokens?.get(sourceId);
    if (token) {
      // Use requestAnimationFrame to ensure any pending controlToken hooks
      // have fired before we show the bar, avoiding race conditions.
      requestAnimationFrame(() => {
        if (!token.controlled) {
          token.control({ releaseOthers: true });
          // The controlToken hook will fire and show the bar
        } else {
          // Token is still controlled; show bar directly.
          // Force a re-show even if _activeTokenId matches (bar was hidden).
          _activeTokenId = null;
          _showBar(token);
        }
      });
    }
  }
}

/* -------------------------------------------- */
/*  Targeting: DOM mouse events                 */
/* -------------------------------------------- */

function _onTargetMouseDown(event) {
  if (!_targetingMode) return;

  const world = _screenToWorld(event.clientX, event.clientY);
  _dragStart = { x: world.x, y: world.y };
  _dragStartTime = Date.now();
  _isDragging = false;
}

function _onTargetMouseMove(event) {
  if (!_targetingMode || !_dragStart) return;

  const world = _screenToWorld(event.clientX, event.clientY);
  const dx = Math.abs(world.x - _dragStart.x);
  const dy = Math.abs(world.y - _dragStart.y);

  // Only count as a drag if moved beyond BOTH pixel and time thresholds
  const elapsed = Date.now() - _dragStartTime;
  if ((dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) && elapsed > CLICK_THRESHOLD_MS) {
    _isDragging = true;
    _drawAoeBox(_dragStart.x, _dragStart.y, world.x, world.y);
  }
}

function _onTargetMouseUp(event) {
  if (!_targetingMode || !_dragStart) return;

  const world = _screenToWorld(event.clientX, event.clientY);
  const clickDuration = Date.now() - _dragStartTime;

  let didTargeting = false;

  if (_isDragging) {
    // AOE selection
    _targetTokensInBox(_dragStart.x, _dragStart.y, world.x, world.y);
    didTargeting = true;
    if (_targetingCtrlHeld) {
      // Stay in targeting mode for more selections; reset drag state
      _dragStart = null;
      _dragStartTime = 0;
      _isDragging = false;
      _clearAoeGraphics();
      return; // Stay in targeting mode
    }
  } else if (clickDuration <= CLICK_THRESHOLD_MS) {
    // Single click
    _targetTokenAt(world.x, world.y);
    didTargeting = true;
    if (_targetingCtrlHeld) {
      // Stay in targeting mode for more targets; reset drag state
      _dragStart = null;
      _dragStartTime = 0;
      _isDragging = false;
      _clearAoeGraphics();
      return; // Stay in targeting mode
    }
  }

  // Always exit targeting mode on mouse up (unless Ctrl held, handled above).
  // This covers:
  // - Normal click on a token (targets it, exits)
  // - Normal drag release (targets AOE, exits)
  // - Click on empty space (no target, exits)
  // - Slow click that exceeds time threshold (exits cleanly)
  _exitTargetingMode();
}

/* -------------------------------------------- */
/*  Targeting: keyboard helpers                 */
/* -------------------------------------------- */

function _onTargetKeyDown(event) {
  if (event.key === "Control" || event.key === "Meta") {
    _targetingCtrlHeld = true;
  }
}

function _onTargetKeyUp(event) {
  if (event.key === "Control" || event.key === "Meta") {
    _targetingCtrlHeld = false;
    // Exit targeting mode when Ctrl is released (ends multi-target mode).
    // Only exit if the mouse is not currently down to avoid interrupting an
    // in-progress click.
    if (_targetingMode && !_dragStart) {
      _exitTargetingMode();
    }
  }
}

function _onTargetEscape(event) {
  if (event.key === "Escape" && _targetingMode) {
    _exitTargetingMode();
    ui.notifications.info("Targeting cancelled.");
  }
}

/* -------------------------------------------- */
/*  Targeting: AOE graphics                     */
/* -------------------------------------------- */

function _drawAoeBox(x1, y1, x2, y2) {
  if (!_aoeGraphics) {
    _aoeGraphics = new PIXI.Graphics();
    _aoeGraphics.eventMode = "none";
    canvas.tokens.addChild(_aoeGraphics);
  }

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  _aoeGraphics.clear();
  _aoeGraphics.lineStyle(2, 0xff3333, 0.9);
  _aoeGraphics.beginFill(0xff3333, 0.15);
  _aoeGraphics.drawRect(minX, minY, w, h);
  _aoeGraphics.endFill();
}

function _clearAoeGraphics() {
  if (_aoeGraphics) {
    _aoeGraphics.clear();
    _aoeGraphics.destroy();
    _aoeGraphics = null;
  }
}

/* -------------------------------------------- */
/*  Targeting: token selection logic            */
/* -------------------------------------------- */

function _getTokenBounds(t) {
  // Always construct a proper Rectangle — t.bounds in v14 may be a PIXI.Bounds
  // object which lacks contains() / intersects() methods.
  const w = t.w || (t.document?.width || 1) * (canvas.grid?.size || 100);
  const h = t.h || (t.document?.height || 1) * (canvas.grid?.size || 100);
  return new PIXI.Rectangle(t.x, t.y, w, h);
}

function _targetTokenAt(x, y) {
  const token = canvas.tokens.placeables.find(t => {
    if (!t.visible) return false;
    const bounds = _getTokenBounds(t);
    return bounds.contains(x, y);
  });

  if (token) {
    if (_targetingCtrlHeld) {
      // Ctrl+click: toggle target (add/remove without releasing others)
      token.setTarget(!token.isTargeted, { releaseOthers: false });
    } else {
      // Normal click: target this token, release others
      token.setTarget(true, { releaseOthers: true });
    }
  }
}

function _targetTokensInBox(x1, y1, x2, y2) {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const maxX = Math.max(x1, x2);
  const maxY = Math.max(y1, y2);

  const box = new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);

  const tokensToTarget = canvas.tokens.placeables.filter(t => {
    if (!t.visible) return false;
    const bounds = _getTokenBounds(t);
    return box.intersects(bounds);
  });

  if (tokensToTarget.length === 0) return;

  if (_targetingCtrlHeld) {
    // Ctrl held: add all to targets without releasing others
    for (const t of tokensToTarget) {
      t.setTarget(true, { releaseOthers: false });
    }
  } else {
    // Normal drag: target these, release others
    for (const t of canvas.tokens.placeables) {
      t.setTarget(false, { releaseOthers: false });
    }
    for (const t of tokensToTarget) {
      t.setTarget(true, { releaseOthers: false });
    }
  }

  ui.notifications.info(`${tokensToTarget.length} token(s) targeted.`);
}

/* -------------------------------------------- */
/*  ATTACK dropdown handler                     */
/* -------------------------------------------- */

let _attackDropdown = null;   // currently-open dropdown element

/**
 * Build and show the attack dropdown below the ATTACK button.
 * Items are split into primary / secondary per the module flag.
 */
async function _doAttack(actor) {
  const attacks = actor.items.filter(i => i.type === "attack");
  if (!attacks.length) {
    ui.notifications.warn(game.i18n.localize("CNE.TokenHud.NoAttacks"));
    return;
  }

  if (attacks.length === 1) {
    await _rollAttackItem(attacks[0]);
    return;
  }

  // Split into primary / secondary
  const primary   = attacks.filter(a => (a.getFlag?.(MODULE_ID, "attackType") || "primary") === "primary");
  const secondary = attacks.filter(a => (a.getFlag?.(MODULE_ID, "attackType") || "primary") === "secondary");

  // Close any existing dropdown
  _closeAttackDropdown();

  // Get the ATTACK button's screen position
  const attackBtn = _activeBar?.querySelector('.cne-token-action--attack');
  if (!attackBtn) return;

  const btnRect = attackBtn.getBoundingClientRect();

  // Build dropdown
  const dd = document.createElement("div");
  dd.className = "cne-attack-dropdown";
  dd.style.left = `${btnRect.left}px`;
  dd.style.top  = `${btnRect.bottom + 4}px`;

  // --- Primary attacks ---
  if (primary.length) {
    const header = document.createElement("div");
    header.className = "cne-attack-dropdown-header";
    header.textContent = game.i18n.localize("CNE.TokenHud.PrimaryAttacks") || "Primary";
    dd.appendChild(header);

    for (const item of primary) {
      dd.appendChild(_makeAttackRow(item));
    }
  }

  // --- Separator ---
  if (primary.length && secondary.length) {
    const sep = document.createElement("div");
    sep.className = "cne-attack-dropdown-separator";
    dd.appendChild(sep);
  }

  // --- Secondary attacks ---
  if (secondary.length) {
    const header = document.createElement("div");
    header.className = "cne-attack-dropdown-header";
    header.textContent = game.i18n.localize("CNE.TokenHud.SecondaryAttacks") || "Secondary";
    dd.appendChild(header);

    for (const item of secondary) {
      dd.appendChild(_makeAttackRow(item));
    }
  }

  // Close on click outside
  const onDocClick = (e) => {
    if (!dd.contains(e.target) && e.target !== attackBtn) {
      _closeAttackDropdown();
    }
  };
  document.addEventListener("pointerdown", onDocClick, { once: true });

  // Track so we can close later
  _attackDropdown = dd;

  document.body.appendChild(dd);

  // Animate in
  requestAnimationFrame(() => dd.classList.add("cne-open"));
}

function _makeAttackRow(item) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "cne-attack-dropdown-item";

  // Read attack stats from CCI flags first, then native
  const cciData = item.getFlag?.('cypher-cool-items', 'data') || {};
  const native = item.system?.basic || {};
  const level = cciData.level ?? native.level ?? '';
  const damage = cciData.damage || native.damage || '';
  const attackBonus = cciData.attackBonus ?? native.attackBonus ?? '';

  // Special abilities (icons)
  const specialAbilities = cciData.specialAbilities || [];
  const specialIcons = specialAbilities.map(a =>
    `<img src="${a.img}" class="cne-attack-dd-icon" title="${foundry.utils.escapeHTML(a.name)}" alt="">`
  ).join('');

  // Effects (icons)
  const effects = cciData.effects || [];
  const effectIcons = effects.map(e =>
    `<img src="${e.img || 'icons/svg/aura.svg'}" class="cne-attack-dd-icon cne-effect-icon" title="${foundry.utils.escapeHTML(e.name)}" alt="">`
  ).join('');

  // Build stat pills
  const statsHtml = [];
  if (level !== '') {
    statsHtml.push(`<span class="cne-attack-dd-stat cne-attack-dd-level">Lv.${level}</span>`);
  }
  if (damage) {
    statsHtml.push(`<span class="cne-attack-dd-stat cne-attack-dd-damage">${foundry.utils.escapeHTML(damage)}</span>`);
  }
  if (attackBonus !== '') {
    const sign = attackBonus > 0 ? '+' : '';
    statsHtml.push(`<span class="cne-attack-dd-stat cne-attack-dd-bonus">${sign}${attackBonus}</span>`);
  }

  row.innerHTML = `
    <img src="${item.img || "icons/svg/sword.svg"}" alt="" class="cne-attack-dd-item-img">
    <span class="cne-attack-dd-name">${foundry.utils.escapeHTML(item.name)}</span>
    <span class="cne-attack-dd-stats">
      ${statsHtml.join('')}
    </span>
    ${specialIcons ? `<span class="cne-attack-dd-icons">${specialIcons}</span>` : ''}
    ${effectIcons ? `<span class="cne-attack-dd-icons">${effectIcons}</span>` : ''}
  `;
  row.addEventListener("click", async () => {
    _closeAttackDropdown();
    await _rollAttackItem(item);
  });
  return row;
}

function _closeAttackDropdown() {
  if (_attackDropdown) {
    _attackDropdown.remove();
    _attackDropdown = null;
  }
}

async function _rollAttackItem(item) {
  if (item.roll instanceof Function) {
    await item.roll();
  } else if (item.system?.roll instanceof Function) {
    await item.system.roll();
  } else {
    const description = await TextEditor.enrichHTML(item.system?.description ?? "", { secrets: false });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.actor }),
      content: `<div class="cne-chat-card"><header class="cne-chat-card-header"><img src="${item.img}" alt="" width="32" height="32"><h3>${foundry.utils.escapeHTML(item.name)}</h3></header>${description}</div>`
    });
  }
}

/* -------------------------------------------- */
/*  DEFENSE handler                             */
/* -------------------------------------------- */

async function _doDefense(actor) {
  if (actor.rollDefense instanceof Function) {
    await actor.rollDefense("Might");
    return;
  }

  const armor = actor.items.find(i => i.type === "armor");
  const armorRating = armor?.system?.rating ?? 0;

  const content = `
    <div class="cne-chat-card">
      <header class="cne-chat-card-header">
        <i class="fa-solid fa-shield-halved" style="font-size:28px;color:var(--cne-gold-bright,#e8c95a)"></i>
        <h3>${game.i18n.localize("CNE.TokenHud.DefenseRoll")}</h3>
      </header>
      <p><strong>${actor.name}</strong> — ${game.i18n.localize("CNE.TokenHud.ArmorRating")}: <strong>${armorRating}</strong></p>
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}
