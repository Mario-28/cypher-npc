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

  // Sync bar live when actor data changes (health, flags, items)
  Hooks.on("updateActor", (actor, changes) => {
    if (!_activeBar || !_activeTokenId) return;
    const token = canvas.tokens?.get(_activeTokenId);
    if (!token || token.actor?.id !== actor.id) return;

    // Check if this is an active defense flag change — full rebuild needed
    const isDefenseChange = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.activeDefense`);

    // Full rebuild if level, armor, health max, or active defense changed
    const needsRebuild =
      isDefenseChange ||
      foundry.utils.hasProperty(changes, 'system.basic.level') ||
      foundry.utils.hasProperty(changes, 'system.combat.armor');

    if (needsRebuild) {
      _showBar(token);
      return;
    }

    // Fast path: just update HP bar if only health changed
    const hpBar = _activeBar.querySelector('.cne-token-hp-bar');
    if (!hpBar) return;

    const health = actor.system?.pools?.health ?? {};
    const hpValue = health.value ?? 0;
    const hpMax = health.max ?? 1;
    const hpPercent = hpMax > 0 ? (hpValue / hpMax) * 100 : 0;

    hpBar.style.width = `${Math.max(0, Math.min(100, hpPercent))}%`;

    hpBar.classList.remove('cne-hp-healthy', 'cne-hp-critical', 'cne-hp-dead');
    if (hpValue <= 0) {
      hpBar.classList.add('cne-hp-dead');
    } else if (hpPercent <= 25) {
      hpBar.classList.add('cne-hp-critical');
    } else {
      hpBar.classList.add('cne-hp-healthy');
    }
  });

  // Sync bar when items on this actor change (armor/ability stats)
  Hooks.on("updateItem", (item, changes) => {
    if (!_activeBar || !_activeTokenId) return;
    const token = canvas.tokens?.get(_activeTokenId);
    if (!token || token.actor?.id !== item.parent?.id) return;
    // Only rebuild if armor or ability item changed (affects defense stats)
    if (['armor', 'ability', 'attack'].includes(item.type)) {
      _showBar(token);
    }
  });

  Hooks.on("createItem", (item) => {
    if (!_activeBar || !_activeTokenId) return;
    const token = canvas.tokens?.get(_activeTokenId);
    if (!token || token.actor?.id !== item.parent?.id) return;
    if (['armor', 'ability', 'attack'].includes(item.type)) {
      _showBar(token);
    }
  });

  Hooks.on("deleteItem", (item) => {
    if (!_activeBar || !_activeTokenId) return;
    const token = canvas.tokens?.get(_activeTokenId);
    if (!token || token.actor?.id !== item.parent?.id) return;
    if (['armor', 'ability', 'attack'].includes(item.type)) {
      _showBar(token);
    }
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

  const actor = token.actor;
  const bar = document.createElement("div");
  bar.className = "cne-token-action-bar";
  bar.id = "cne-token-action-bar";

  /* === NPC STATS HEADER === */
  const statsHeader = document.createElement("div");
  statsHeader.className = "cne-token-stats";

  // Level
  const level = actor.system?.basic?.level ?? '?';
  const levelEl = document.createElement("span");
  levelEl.className = "cne-token-stat cne-token-level";
  levelEl.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${level}`;
  levelEl.title = `Level ${level}`;
  statsHeader.appendChild(levelEl);

  // === ATTACK stat: level + highest primary attack bonus ===
  const attacks = actor.items.filter(i => i.type === 'attack');
  const primaryAttacks = attacks.filter(a => (a.getFlag?.(MODULE_ID, 'attackType') || 'primary') === 'primary');
  let highestAttackBonus = 0;
  for (const atk of primaryAttacks) {
    const cciData = atk.getFlag?.('cypher-cool-items', 'data') || {};
    const native = atk.system?.basic || {};
    const bonus = cciData.attackBonus ?? native.attackBonus ?? 0;
    if (bonus > highestAttackBonus) highestAttackBonus = bonus;
  }
  const attackTotal = level + highestAttackBonus;
  const attackEl = document.createElement("span");
  attackEl.className = "cne-token-stat cne-token-attack-total";
  attackEl.innerHTML = `<i class="fa-solid fa-sword"></i> ${attackTotal}`;
  attackEl.title = `Attack: Level ${level} + ${highestAttackBonus > 0 ? '+' + highestAttackBonus : '0'} bonus`;
  statsHeader.appendChild(attackEl);

  // === DEFENSE stat: level + ARMOR MOD NPC of active defense ===
  const activeDefenseId = actor.getFlag?.(MODULE_ID, 'activeDefense') || 'default';
  let armorModNpc = 0;
  let armorRatingVal = 0;
  let activeDefName = 'Default';

  if (activeDefenseId === 'default') {
    armorRatingVal = actor.system?.combat?.armor ?? 0;
    activeDefName = 'Default Defense';
  } else {
    const defItem = actor.items.get(activeDefenseId);
    if (defItem) {
      activeDefName = defItem.name;
      const cciData = defItem.getFlag?.('cypher-cool-items', 'data') || {};
      if (defItem.type === 'armor') {
        armorModNpc = cciData.armorModNpc ?? 0;
        // Cypher System v2 stores armor rating at system.basic.rating
        armorRatingVal = defItem.system?.basic?.rating ?? defItem.system?.rating ?? 0;
      } else if (defItem.type === 'ability') {
        armorModNpc = cciData.armorModNpc ?? 0;
        armorRatingVal = cciData.defenseArmor ?? 0;
      } else if (defItem.type === 'attack') {
        armorModNpc = cciData.attackBonus ?? 0;
        armorRatingVal = cciData.defenseArmor ?? 0;
      }
    }
  }
  const defenseTotal = level + armorModNpc;
  const defenseEl = document.createElement("span");
  defenseEl.className = "cne-token-stat cne-token-defense-total";
  defenseEl.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${defenseTotal}`;
  defenseEl.title = `Defense: Level ${level} + ${armorModNpc > 0 ? '+' + armorModNpc : '0'} from ${activeDefName}`;
  statsHeader.appendChild(defenseEl);

  // === ARMOR RATING stat ===
  const armorEl = document.createElement("span");
  armorEl.className = "cne-token-stat cne-token-armor-rating";
  armorEl.innerHTML = `<i class="fa-solid fa-shield"></i> ${armorRatingVal}`;
  armorEl.title = `Armor Rating: ${armorRatingVal}`;
  statsHeader.appendChild(armorEl);

  // Movement
  const movement = actor.getFlag?.('cypher-npc-elegance', 'movement') || actor.system?.combat?.movement || '—';
  const moveEl = document.createElement("span");
  moveEl.className = "cne-token-stat cne-token-movement";
  moveEl.innerHTML = `<i class="fa-solid fa-person-running"></i> ${movement}`;
  moveEl.title = `Movement: ${movement}`;
  statsHeader.appendChild(moveEl);

  bar.appendChild(statsHeader);

  /* === HP BAR === */
  const health = actor.system?.pools?.health ?? {};
  const hpValue = health.value ?? 0;
  const hpMax = health.max ?? 1;
  const hpPercent = hpMax > 0 ? (hpValue / hpMax) * 100 : 0;

  const hpBarWrap = document.createElement("div");
  hpBarWrap.className = "cne-token-hp-wrap";

  const hpBar = document.createElement("div");
  hpBar.className = "cne-token-hp-bar";
  hpBar.style.width = `${Math.max(0, Math.min(100, hpPercent))}%`;

  // Color based on HP percentage
  if (hpValue <= 0) {
    hpBar.classList.add('cne-hp-dead');
  } else if (hpPercent <= 25) {
    hpBar.classList.add('cne-hp-critical');
  } else {
    hpBar.classList.add('cne-hp-healthy');
  }

  hpBarWrap.appendChild(hpBar);
  bar.appendChild(hpBarWrap);

  /* === ACTION BUTTONS === */
  const actionsRow = document.createElement("div");
  actionsRow.className = "cne-token-actions-row";

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
    actionsRow.appendChild(btn);
  }

  bar.appendChild(actionsRow);

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

let _attackDropdown = null;   // currently-open attack dropdown
let _defenseDropdown = null;  // currently-open defense dropdown

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

/** Pending defense-roll requests awaiting player results. */
const _pendingAttacks = new Map();
/** Pending resistance-roll requests awaiting player results. */
const _pendingResistRolls = new Map();
let _chatHookRegistered = false;

async function _rollAttackItem(item) {
  const targets = Array.from(game.user.targets);
  if (!targets.length) {
    ui.notifications.warn("No targets selected. Use the TARGET button first.");
    return;
  }

  // Gather attack data from CCI flags first, then native
  const cciData = item.getFlag?.('cypher-cool-items', 'data') || {};
  const native = item.system?.basic || {};
  const npcLevel = item.actor?.system?.basic?.level ?? 1;
  const level = cciData.level ?? native.level ?? npcLevel;
  const attackBonus = cciData.attackBonus ?? native.attackBonus ?? 0;
  const damage = cciData.damage || native.damage || '';
  const difficulty = Math.max(0, Math.min(15, level + attackBonus));

  // Collect DEFENSE ROLL types from the attack item
  let defenseRollTypes = [...(cciData.defenseRoll || [])];

  // If no defense roll on attack, check linked ability items
  if (!defenseRollTypes.length) {
    const linkedAbilities = cciData.specialAbilities || cciData.linkedAbilities || [];
    for (const abi of linkedAbilities) {
      const abiItem = item.actor?.items.get(abi.id);
      const abiData = abiItem?.getFlag?.('cypher-cool-items', 'data') || {};
      if (abiData.defenseRoll?.length) {
        defenseRollTypes = [...abiData.defenseRoll];
        break;
      }
    }
  }

  // Process each target
  for (const target of targets) {
    const targetActor = target.actor;
    if (!targetActor) continue;

    if (targetActor.type === 'pc') {
      await _processPcAttack(item, targetActor, difficulty, damage, defenseRollTypes);
    } else {
      ui.notifications.info(`${targetActor.name}: Attack applied (NPC target).`);
    }
  }
}

/* -------------------------------------------- */
/*  PC Defense Roll Flow                        */
/* -------------------------------------------- */

async function _processPcAttack(attackItem, pcActor, difficulty, damage, defenseRollTypes) {
  // Determine defense pool from DEFENSE ROLL flags (check in priority order)
  let defensePool = null;
  for (const pool of ['might', 'speed', 'intellect']) {
    if (defenseRollTypes.includes(pool)) {
      defensePool = pool;
      break;
    }
  }
  // Default to might if no defense roll type specified
  if (!defensePool) defensePool = 'might';
  const poolCap = defensePool.charAt(0).toUpperCase() + defensePool.slice(1);

  // Check if PC has a matching defense skill
  const skills = pcActor.items.filter(i => i.type === 'skill');
  const defenseSkill = skills.find(s => {
    const name = s.name.toLowerCase();
    return name.includes(defensePool) && name.includes('defense');
  });

  // Register chat hook once for roll result detection
  _ensureChatHook();

  const requestId = foundry.utils.randomID();
  _pendingAttacks.set(requestId, {
    attackItem,
    targetActor: pcActor,
    difficulty,
    damage,
    defensePool,
    timestamp: Date.now()
  });

  // Clean up stale pending attacks (older than 5 minutes)
  const now = Date.now();
  for (const [id, pending] of _pendingAttacks) {
    if (now - pending.timestamp > 5 * 60 * 1000) _pendingAttacks.delete(id);
  }

  if (defenseSkill) {
    // Player has a defense skill — open skill roll dialog on their Taskbar
    game.socket.emit("module.cypher-taskbar", {
      type: "openSkillRollDialog",
      actorId: pcActor.id,
      skillId: defenseSkill.id,
      difficulty: difficulty
    });
    ui.notifications.info(
      `Defense roll: ${pcActor.name} — ${defenseSkill.name} (Difficulty ${difficulty})`
    );
  } else {
    // No defense skill — open attribute roll dialog on their Taskbar
    game.socket.emit("module.cypher-taskbar", {
      type: "openAttributeRollDialog",
      actorId: pcActor.id,
      poolName: poolCap,
      difficulty: difficulty
    });
    ui.notifications.info(
      `Defense roll: ${pcActor.name} — ${poolCap} attribute (Difficulty ${difficulty})`
    );
  }
}

/* -------------------------------------------- */
/*  Chat hook: detect defense roll results      */
/* -------------------------------------------- */

function _ensureChatHook() {
  if (_chatHookRegistered) return;
  _chatHookRegistered = true;

  Hooks.on("createChatMessage", (message) => {
    if (!_pendingAttacks.size && !_pendingResistRolls.size) return;

    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;

    const text = ((message.content || '') + ' ' + (message.flavor || '')).toLowerCase();
    const isSuccess = text.includes('success');
    const isFailure = text.includes('failure') || text.includes('gm intrusion');
    if (!isSuccess && !isFailure) return;

    // ── Defense roll results → open damage dialog on failure ──
    const attackMatch = Array.from(_pendingAttacks.entries()).find(
      ([, p]) => p.targetActor.id === speakerActorId
    );
    if (attackMatch) {
      const [requestId, ctx] = attackMatch;
      _pendingAttacks.delete(requestId);
      if (isFailure) {
        _showDamageDialog(ctx);
      } else {
        ui.notifications.info(`${ctx.targetActor.name} defended successfully vs ${ctx.attackItem.name}!`);
      }
      return;
    }

    // ── Resistance roll results → apply effect on failure ──
    const resistMatch = Array.from(_pendingResistRolls.entries()).find(
      ([, p]) => p.targetActor.id === speakerActorId
    );
    if (resistMatch) {
      const [requestId, ctx] = resistMatch;
      _pendingResistRolls.delete(requestId);
      if (isFailure) {
        ui.notifications.info(`${ctx.targetActor.name} failed to resist ${ctx.effect.name}!`);
        _transferEffect(ctx.targetActor, ctx.effect);
      } else {
        ui.notifications.info(`${ctx.targetActor.name} resisted ${ctx.effect.name}!`);
      }
    }
  });
}

/* -------------------------------------------- */
/*  GM Damage Dialog                            */
/* -------------------------------------------- */

/* -------------------------------------------- */
/*  Data collectors: specials + effects         */
/* -------------------------------------------- */

function _collectSpecials(attackItem) {
  const cciData = attackItem.getFlag?.('cypher-cool-items', 'data') || {};
  const specials = [...(cciData.specialAbilities || [])];

  // Also check linked abilities for their specials
  const linkedAbilities = cciData.specialAbilities || [];
  for (const abi of linkedAbilities) {
    const abiItem = attackItem.actor?.items.get(abi.id);
    if (!abiItem) continue;
    const abiData = abiItem.getFlag?.('cypher-cool-items', 'data') || {};
    for (const s of (abiData.specialAbilities || [])) {
      if (!specials.find(x => x.id === s.id)) specials.push(s);
    }
  }
  return specials;
}

function _collectEffects(attackItem) {
  const cciData = attackItem.getFlag?.('cypher-cool-items', 'data') || {};
  const effects = [...(cciData.effects || [])];

  // Also check linked abilities for their effects
  const linkedAbilities = cciData.specialAbilities || [];
  for (const abi of linkedAbilities) {
    const abiItem = attackItem.actor?.items.get(abi.id);
    if (!abiItem) continue;
    const abiData = abiItem.getFlag?.('cypher-cool-items', 'data') || {};
    for (const e of (abiData.effects || [])) {
      if (!effects.find(x => x.id === e.id)) effects.push(e);
    }
  }
  return effects;
}

/* -------------------------------------------- */
/*  Active Effect transfer                      */
/* -------------------------------------------- */

async function _transferEffect(targetActor, effect) {
  try {
    let effectData = null;

    if (effect.uuid) {
      const source = await fromUuid(effect.uuid);
      if (source) {
        effectData = source.toObject();
        delete effectData._id;
      }
    }

    // Fallback: build a minimal effect from stored data
    if (!effectData) {
      effectData = {
        name: effect.name || 'Unknown Effect',
        icon: effect.img || 'icons/svg/aura.svg',
        origin: targetActor.uuid,
        disabled: false,
        duration: { rounds: null, seconds: null, turns: null },
        description: effect.description || '',
        statuses: [],
        changes: []
      };
    }

    // Avoid duplicates
    const existing = targetActor.effects.find(e => e.name === effectData.name);
    if (existing) {
      ui.notifications.info(`${targetActor.name} already has "${effectData.name}".`);
      return;
    }

    await targetActor.createEmbeddedDocuments('ActiveEffect', [effectData]);
    ui.notifications.info(`⚡ "${effectData.name}" applied to ${targetActor.name}!`);
  } catch (err) {
    console.error('[CNE] Failed to transfer effect:', err);
    ui.notifications.error(`Failed to apply effect: ${effect.name}`);
  }
}

/* -------------------------------------------- */
/*  Resistance Roll request                     */
/* -------------------------------------------- */

function _requestResistanceRoll(effect, targetActor) {
  const resistance = effect.resistance || {};
  const attr = (resistance.attribute || 'might').toLowerCase();
  const diff = Math.max(0, Math.min(15, Number(resistance.difficulty ?? 0) || 0));
  const poolCap = attr.charAt(0).toUpperCase() + attr.slice(1);

  _ensureChatHook();

  const requestId = foundry.utils.randomID();
  _pendingResistRolls.set(requestId, {
    effect,
    targetActor,
    timestamp: Date.now()
  });

  // Clean stale entries
  const now = Date.now();
  for (const [id, p] of _pendingResistRolls) {
    if (now - p.timestamp > 5 * 60 * 1000) _pendingResistRolls.delete(id);
  }

  game.socket.emit("module.cypher-taskbar", {
    type: "openAttributeRollDialog",
    actorId: targetActor.id,
    poolName: poolCap,
    difficulty: diff
  });

  ui.notifications.info(
    `Resistance roll: ${targetActor.name} — ${poolCap} (Difficulty ${diff}) for "${effect.name}"`
  );
}

/* -------------------------------------------- */
/*  GM Damage Dialog — fancy, sleek, modern     */
/* -------------------------------------------- */

const TRIGGER_LABELS = {
  automatic: 'Auto',
  resistanceRoll: 'Resist',
  attributeDamage: 'Attr Dmg',
  attributeDamageResistance: 'Dmg Resist'
};

function _showDamageDialog(ctx) {
  const { attackItem, targetActor, damage, difficulty } = ctx;

  // Parse damage amount
  const dmgMatch = String(damage).match(/\d+/);
  const baseDamage = dmgMatch ? parseInt(dmgMatch[0], 10) : 0;

  // Collect specials + effects
  const specials = _collectSpecials(attackItem);
  const effects = _collectEffects(attackItem);

  const esc = foundry.utils.escapeHTML;

  // ── Build HTML ──
  let html = `<div class="cne-dmg-overlay">`;

  // Header
  html += `
    <div class="cne-dmg-header">
      <img class="cne-dmg-attack-icon" src="${esc(attackItem.img || 'icons/svg/sword.svg')}" alt="">
      <div class="cne-dmg-titles">
        <div class="cne-dmg-attack-name">${esc(attackItem.name)}</div>
        <div class="cne-dmg-target-row">
          <span class="cne-dmg-vs">vs</span>
          <span class="cne-dmg-target-name">${esc(targetActor.name)}</span>
        </div>
      </div>
      <div class="cne-dmg-diff-badge">
        DIFF ${difficulty ?? '—'}
        <span>target</span>
      </div>
    </div>`;

  // Body
  html += `<div class="cne-dmg-body">`;

  // Damage section
  html += `
    <div class="cne-dmg-section">
      <div class="cne-dmg-section-title">💥 Damage</div>
      <div class="cne-dmg-amount-row">
        <span class="cne-dmg-amount-label">Amount</span>
        <input type="number" class="cne-dmg-amount-input" id="cne-dmg-amount" value="${baseDamage}" min="0">
      </div>
      <div class="cne-dmg-pools">
        <label class="cne-dmg-pool"><input type="radio" name="cneDmgType" value="might" checked><span>⚔ Might</span></label>
        <label class="cne-dmg-pool"><input type="radio" name="cneDmgType" value="speed"><span>🏃 Speed</span></label>
        <label class="cne-dmg-pool"><input type="radio" name="cneDmgType" value="intellect"><span>🧠 Intellect</span></label>
        <label class="cne-dmg-pool"><input type="radio" name="cneDmgType" value="health"><span>❤ Health</span></label>
        <label class="cne-dmg-pool"><input type="radio" name="cneDmgType" value="xp"><span>⭐ XP</span></label>
      </div>
    </div>`;

  // Special section
  if (specials.length) {
    html += `
    <div class="cne-dmg-section">
      <div class="cne-dmg-section-title">✦ Special Abilities</div>
      <div class="cne-dmg-checklist">`;
    for (const s of specials) {
      html += `
        <label class="cne-dmg-check">
          <input type="checkbox" data-cne-special="${esc(s.id)}">
          <img src="${esc(s.img || 'icons/svg/book.svg')}" alt="">
          <span class="cne-dmg-check-name">${esc(s.name)}</span>
        </label>`;
    }
    html += `</div></div>`;
  }

  // Effects section
  if (effects.length) {
    html += `
    <div class="cne-dmg-section">
      <div class="cne-dmg-section-title">🌀 Effects</div>
      <div class="cne-dmg-checklist">`;
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      const trigger = e.trigger || 'automatic';
      const badgeClass = {
        automatic: 'cne-dmg-trigger-automatic',
        resistanceRoll: 'cne-dmg-trigger-resistance',
        attributeDamage: 'cne-dmg-trigger-attr-damage',
        attributeDamageResistance: 'cne-dmg-trigger-attr-resist'
      }[trigger] || 'cne-dmg-trigger-automatic';
      const badgeLabel = TRIGGER_LABELS[trigger] || trigger;

      html += `
        <label class="cne-dmg-check">
          <input type="checkbox" data-cne-effect-idx="${i}">
          <img src="${esc(e.img || 'icons/svg/aura.svg')}" alt="">
          <span class="cne-dmg-check-name">${esc(e.name)}</span>
          <span class="cne-dmg-trigger-badge ${badgeClass}">${esc(badgeLabel)}</span>
        </label>`;
    }
    html += `</div></div>`;
  }

  html += `</div></div>`; // close body + overlay

  // ── Create Dialog ──
  const dlg = new Dialog({
    title: '',
    content: html,
    buttons: {
      apply: {
        icon: '<i class="fas fa-heart-crack"></i>',
        label: 'Apply Damage',
        callback: async (html) => { await _onDamageDialogApply(html, ctx, effects); }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: 'Cancel'
      }
    },
    default: 'apply',
    render: (html) => {
      // Style the dialog window
      const win = html.closest('.dialog') || html[0]?.closest('.dialog');
      if (win) win.classList.add('cne-dmg-dialog-window');

      // Style apply button
      const applyBtn = html.closest('.dialog')?.querySelector('button[data-button="apply"]');
      if (applyBtn) applyBtn.classList.add('cne-dmg-btn-apply');
      const cancelBtn = html.closest('.dialog')?.querySelector('button[data-button="cancel"]');
      if (cancelBtn) cancelBtn.classList.add('cne-dmg-btn-cancel');

      // Auto-check effects that are automatic or attribute-damage
      effects.forEach((e, i) => {
        if (e.trigger === 'automatic' || e.trigger === 'attributeDamage') {
          const cb = html[0]?.querySelector(`[data-cne-effect-idx="${i}"]`);
          if (cb) cb.checked = true;
        }
      });
    }
  });
  dlg.render(true);
}

/* -------------------------------------------- */
/*  Damage Dialog: Apply callback               */
/* -------------------------------------------- */

async function _onDamageDialogApply(html, ctx, allEffects) {
  const root = html?.[0] ?? html;
  const { attackItem, targetActor } = ctx;

  // 1. Apply damage
  const amount = parseInt(root.querySelector('#cne-dmg-amount')?.value, 10) || 0;
  const dmgType = root.querySelector('input[name="cneDmgType"]:checked')?.value || 'might';
  await _applyDamage(targetActor, dmgType, amount);

  // 2. Collect checked specials → chat card
  const checkedSpecialIds = [];
  root.querySelectorAll('[data-cne-special]:checked').forEach(cb => {
    checkedSpecialIds.push(cb.dataset.cneSpecial);
  });
  if (checkedSpecialIds.length) {
    const specials = _collectSpecials(attackItem);
    const names = checkedSpecialIds.map(id => specials.find(s => s.id === id)?.name).filter(Boolean);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      content: `<div style="padding:4px 8px;border-left:3px solid #e8c95a;background:#1a1d27;border-radius:4px;">
        <strong style="color:#e8c95a;">✦ Special:</strong>
        <span style="color:#e0e4ec;">${names.map(n => foundry.utils.escapeHTML(n)).join(', ')}</span>
      </div>`
    });
  }

  // 3. Process checked effects based on trigger type
  const checkedEffectIdxs = [];
  root.querySelectorAll('[data-cne-effect-idx]:checked').forEach(cb => {
    checkedEffectIdxs.push(parseInt(cb.dataset.cneEffectIdx, 10));
  });

  for (const idx of checkedEffectIdxs) {
    const effect = allEffects[idx];
    if (!effect) continue;
    const trigger = effect.trigger || 'automatic';

    if (trigger === 'automatic') {
      // Auto-apply immediately
      await _transferEffect(targetActor, effect);
    } else if (trigger === 'attributeDamage') {
      // Damage was just applied — attach effect
      await _transferEffect(targetActor, effect);
    } else if (trigger === 'resistanceRoll' || trigger === 'attributeDamageResistance') {
      // Emit resistance roll on player's Taskbar
      _requestResistanceRoll(effect, targetActor);
    }
  }
}

/* -------------------------------------------- */
/*  Damage Application                          */
/* -------------------------------------------- */

async function _applyDamage(actor, damageType, amount) {
  const amt = Math.max(0, Number(amount) || 0);
  if (!actor || amt <= 0) return;

  const updates = {};

  switch (damageType) {
    case 'might':
    case 'speed':
    case 'intellect': {
      const pool = actor.system?.pools?.[damageType];
      if (!pool) {
        ui.notifications.warn(`${actor.name} has no ${damageType} pool.`);
        return;
      }
      const current = Number(pool.value ?? pool.current ?? 0) || 0;
      const next = Math.max(0, current - amt);
      if (Object.prototype.hasOwnProperty.call(pool, 'value')) {
        updates[`system.pools.${damageType}.value`] = next;
      }
      if (Object.prototype.hasOwnProperty.call(pool, 'current')) {
        updates[`system.pools.${damageType}.current`] = next;
      }
      if (!Object.keys(updates).length) {
        updates[`system.pools.${damageType}.value`] = next;
      }
      break;
    }
    case 'health': {
      const pool = actor.system?.pools?.health;
      const current = Number(pool?.value ?? 0);
      updates['system.pools.health.value'] = Math.max(0, current - amt);
      break;
    }
    case 'xp': {
      const current = Number(actor.system?.basic?.xp ?? 0);
      updates['system.basic.xp'] = Math.max(0, current - amt);
      break;
    }
  }

  if (Object.keys(updates).length) {
    await actor.update(updates);
    const label = damageType === 'health' ? 'Health'
                : damageType === 'xp' ? 'XP'
                : damageType.charAt(0).toUpperCase() + damageType.slice(1) + ' Pool';
    ui.notifications.info(`${amt} damage applied to ${actor.name}'s ${label}.`);
  }
}

/* -------------------------------------------- */
/*  DEFENSE dropdown handler                    */
/* -------------------------------------------- */

/**
 * Build and show the defense dropdown below the DEFENSE button.
 * Lists default defense + all defense-type attacks, armor, and abilities.
 * Clicking a defense sets it as active and rolls defense.
 */
async function _doDefense(actor) {
  // Gather available defenses
  const defenses = [];

  // 1. Default defense (always available)
  const activeDefenseId = actor.getFlag?.(MODULE_ID, 'activeDefense') || 'default';
  const npcLevel = actor.system?.basic?.level ?? 0;
  const armorRating = actor.system?.combat?.armor ?? 0;
  defenses.push({
    id: 'default',
    name: game.i18n.localize("CNE.Combat.DefaultDefense"),
    type: 'default',
    img: 'icons/svg/shield.svg',
    level: npcLevel,
    armor: armorRating,
    active: activeDefenseId === 'default'
  });

  // 2. Defense attack items
  for (const item of actor.items) {
    if (item.type === 'attack') {
      const atkType = item.getFlag?.(MODULE_ID, 'attackType') || 'primary';
      if (atkType === 'defense') {
        const cciData = item.getFlag?.('cypher-cool-items', 'data') || {};
        const native = item.system?.basic || {};
        defenses.push({
          id: item.id,
          name: item.name,
          type: 'attack',
          img: item.img,
          level: cciData.level ?? native.level ?? npcLevel,
          bonusPenalty: cciData.attackBonus ?? '',
          damage: cciData.damage || native.damage || '',
          active: activeDefenseId === item.id
        });
      }
    }
  }

  // 3. Armor items
  for (const item of actor.items) {
    if (item.type === 'armor') {
      // Cypher System v2 stores armor rating at system.basic.rating
      const rating = item.system?.basic?.rating ?? item.system?.rating ?? 0;
      defenses.push({
        id: item.id,
        name: item.name,
        type: 'armor',
        img: item.img,
        armor: rating,
        active: activeDefenseId === item.id
      });
    }
  }

  // 4. Ability items
  for (const item of actor.items) {
    if (item.type === 'ability') {
      defenses.push({
        id: item.id,
        name: item.name,
        type: 'ability',
        img: item.img,
        active: activeDefenseId === item.id
      });
    }
  }

  // If only default defense exists, still show dropdown so user can see active state
  // (previously auto-rolled here — removed per user request: no chat output on defense)

  // Close any existing dropdown
  _closeDefenseDropdown();

  // Get the DEFENSE button's screen position
  const defenseBtn = _activeBar?.querySelector('.cne-token-action--defense');
  if (!defenseBtn) return;

  const btnRect = defenseBtn.getBoundingClientRect();

  // Build dropdown
  const dd = document.createElement("div");
  dd.className = "cne-defense-dropdown";
  dd.style.left = `${btnRect.left}px`;
  dd.style.top = `${btnRect.bottom + 4}px`;

  // Header
  const header = document.createElement("div");
  header.className = "cne-defense-dropdown-header";
  header.textContent = game.i18n.localize("CNE.Combat.ActiveDefense");
  dd.appendChild(header);

  // Separator
  const sep = document.createElement("div");
  sep.className = "cne-defense-dropdown-separator";
  dd.appendChild(sep);

  // Defense rows
  for (const def of defenses) {
    dd.appendChild(_makeDefenseRow(actor, def));
  }

  // Close on click outside
  const onDocClick = (e) => {
    if (!dd.contains(e.target) && e.target !== defenseBtn) {
      _closeDefenseDropdown();
    }
  };
  document.addEventListener("pointerdown", onDocClick, { once: true });

  _defenseDropdown = dd;
  document.body.appendChild(dd);

  // Animate in
  requestAnimationFrame(() => dd.classList.add("cne-open"));
}

function _makeDefenseRow(actor, def) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `cne-defense-dropdown-item ${def.active ? 'cne-defense-active' : ''}`;

  // Active indicator (checkmark)
  const activeIcon = def.active
    ? `<i class="fa-solid fa-check cne-defense-checkmark" title="${game.i18n.localize('CNE.Combat.ActiveDefense')}"></i>`
    : `<span class="cne-defense-check-placeholder"></span>`;

  // Build stat pills
  const statsHtml = [];
  if (def.level !== undefined && def.level !== '') {
    statsHtml.push(`<span class="cne-defense-dd-stat cne-defense-dd-level">Lv.${def.level}</span>`);
  }
  if (def.armor !== undefined && def.armor !== '') {
    statsHtml.push(`<span class="cne-defense-dd-stat cne-defense-dd-armor">+${def.armor} ${game.i18n.localize('CNE.TokenHud.ArmorRating')}</span>`);
  }
  if (def.bonusPenalty !== undefined && def.bonusPenalty !== '') {
    const sign = def.bonusPenalty > 0 ? '+' : '';
    statsHtml.push(`<span class="cne-defense-dd-stat cne-defense-dd-bonus">${sign}${def.bonusPenalty}</span>`);
  }
  if (def.damage) {
    statsHtml.push(`<span class="cne-defense-dd-stat cne-defense-dd-damage">${foundry.utils.escapeHTML(def.damage)}</span>`);
  }

  // Type badge
  const typeLabel = game.i18n.localize(`CNE.ItemTypes.${def.type}`) || def.type;

  row.innerHTML = `
    ${activeIcon}
    <img src="${def.img || 'icons/svg/shield.svg'}" alt="" class="cne-defense-dd-item-img">
    <span class="cne-defense-dd-name">${foundry.utils.escapeHTML(def.name)}</span>
    <span class="cne-defense-dd-type">${typeLabel}</span>
    <span class="cne-defense-dd-stats">
      ${statsHtml.join('')}
    </span>
  `;

  row.addEventListener("click", async () => {
    _closeDefenseDropdown();
    // Set as active defense
    await actor.setFlag(MODULE_ID, 'activeDefense', def.id);
    // No chat roll — user requested silent defense selection
  });

  return row;
}

function _closeDefenseDropdown() {
  if (_defenseDropdown) {
    _defenseDropdown.remove();
    _defenseDropdown = null;
  }
}

async function _rollDefense(actor, defenseId) {
  // If the actor has a native rollDefense, use it
  if (actor.rollDefense instanceof Function) {
    await actor.rollDefense("Might");
    return;
  }

  // Find the active defense details for the chat message
  let defenseName = game.i18n.localize("CNE.Combat.DefaultDefense");
  let armorRating = actor.system?.combat?.armor ?? 0;
  let defenseLevel = actor.system?.basic?.level ?? 0;

  if (defenseId !== 'default') {
    const item = actor.items.get(defenseId);
    if (item) {
      defenseName = item.name;
      if (item.type === 'armor') {
        // Cypher System v2 stores armor rating at system.basic.rating
        armorRating = item.system?.basic?.rating ?? item.system?.rating ?? 0;
      } else if (item.type === 'attack') {
        const cciData = item.getFlag?.('cypher-cool-items', 'data') || {};
        const native = item.system?.basic || {};
        defenseLevel = cciData.level ?? native.level ?? defenseLevel;
      }
    }
  }

  const content = `
    <div class="cne-chat-card">
      <header class="cne-chat-card-header">
        <i class="fa-solid fa-shield-halved" style="font-size:28px;color:var(--cne-gold-bright,#e8c95a)"></i>
        <h3>${game.i18n.localize("CNE.TokenHud.DefenseRoll")}</h3>
      </header>
      <p><strong>${actor.name}</strong> — ${game.i18n.localize("CNE.TokenHud.ArmorRating")}: <strong>${armorRating}</strong></p>
      <p style="font-size:11px;color:#93a0b4;margin-top:4px;">${game.i18n.localize("CNE.Combat.ActiveDefense")}: ${foundry.utils.escapeHTML(defenseName)}</p>
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}
