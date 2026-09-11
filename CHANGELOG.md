# Changelog

## 1.2.5

- **Renamed module to CYPHER NPC.** All user-facing names, labels, settings, and descriptions now display "CYPHER NPC" instead of "Cypher NPC Sheet". The module ID (`cypher-npc-elegance`) and folder name remain unchanged for compatibility.

## 1.2.4

- **Fixed Token Action Bar positioning.** Bar now sits correctly above the selected NPC token using proper world-to-screen coordinate conversion.

## 1.2.3

- **Fixed Token Action Bar trigger.** Switched from `renderTokenHUD` (hover) to `controlToken` hook (selection). Bar now appears when you click to select an NPC token, not on hover.

- **Token Action Bar — quick combat HUD under NPC tokens.**
  - When an NPC token is selected on the canvas, a compact action bar appears underneath the token.
  - Three buttons: **TARGET** (toggle targeting), **ATTACK** (roll attack), **DEFENSE** (roll defense).
  - **TARGET**: toggles the token as a target (same as core T key), with visual pulse feedback.
  - **ATTACK**: if the NPC has one attack, rolls it directly. If multiple attacks, shows a picker dialog.
  - **DEFENSE**: attempts the Cypher System's native defense roll; falls back to posting armor rating to chat.
  - Bar auto-positions beneath the token and follows canvas pan/zoom.
  - Styled to match the module's dark gold-and-blue theme — each button has its own color accent (red for Target, gold for Attack, green for Defense).
  - Only appears for NPC tokens; other token types are unaffected.

## 1.1.12

- **Combat tab: full drag-and-drop overhaul.**
  - Removed the toggle-type icon button from all attack/defense rows — cleaner UI.
  - **Drag and drop between sections:** drag any attack from Primary → Secondary → Defense (or any direction). Items automatically update their category via the `attackType` flag.
  - **Drag and drop INTO sections:** dropping an attack item from compendiums or other actors onto any of the three boxes tags it with the correct category automatically.
  - Added visual feedback: sections highlight with a dashed red border when dragging over them.
  - Items are now `draggable="true"` in the Combat tab.

## 1.1.11

- **Fixed traits crash on sheet open.** Some older NPC data (or external migrations) stored `traits` as an object or string rather than an array, causing `(flags.traits ?? []).map is not a function`. Added defensive `Array.isArray` check — traits now safely fall back to an empty array when corrupted.

## 1.1.10

- **Combat tab expanded: Primary Attacks, Secondary Attacks, and Defenses.**
  - Attacks are now split into three categories based on the `flags.cypher-npc-elegance.attackType` flag:
    - **Primary Attacks** — default for all existing attacks.
    - **Secondary Attacks** — for backup/ranged/alternate attacks.
    - **Defenses** — for shields, reactive abilities, and special defenses.
  - Each section has its own create button; newly created items are tagged with the correct type automatically.
  - A **toggle button** (circular icon) on each row cycles the item's type: primary → secondary → defense → primary. Icons update instantly.
  - Right-click on any row still opens the item sheet.
- **Fixed attack item deletion (defensive fallback).** Added explicit `click` event listeners on delete buttons inside the Combat tab as a fallback to Foundry's core action delegation. Some users reported delete not working on dynamically rendered tabs; this ensures it always fires.

## 1.1.9

- **Combat tab attack UX refresh.**
  - Removed "Post to chat" and "Edit" buttons from attack items in the Combat tab — the row is now cleaner.
  - Right-click on any attack item opens the item sheet directly (no more hunting for the tiny edit icon).
  - The delete button remains for users with edit permission.

## 1.1.8

- **Merged Action and Combat tabs.** The former Action tab (attacks list + tactics notes) has been merged into the Combat tab. The Combat tab now displays: Vitals (health, damage, armor, initiative) → Attacks list → Tactics & behavior. This reduces tab clutter and keeps all combat-relevant data in one place.
- **Removed Action tab from navigation rail.** Six tabs remain: Main, Persona, Combat, Equipment, Info, Settings.
- **Defensive tab restoration.** `_onRender()` now validates that a saved active tab still exists in the sheet's tab configuration before attempting to restore it. Prevents blank sheets if a previously-opened tab is removed in a module update.
- **Cleaned up CSS.** Removed unused Action tab design token (`--cne-c-action`) and rail color rule (`.cne-rail-action`).

## 1.1.7

- **Fixed settings tab reset on change.** When `submitOnChange: true` triggers a re-render (e.g. toggling a checkbox in Settings), Foundry resets the active tab back to the `initial` tab ("main"). Added per-group tab-state tracking (`this._activeTabs`) in `changeTab()`; `_onRender()` now restores the saved active tab after every re-render so the user stays on their current tab.

## 1.1.6

- **Fixed tab switching (CRITICAL).** Foundry v14's `TabsController` throws "No matching tab element found" because the tab-content sections are rendered as siblings of the navigation rail, not inside a shared container the controller can locate. Added `changeTab()` override that bypasses the controller and toggles `.active` classes directly on buttons and tab sections. This restores full tab navigation across all seven tabs.

## 1.1.5

- **Fixed health clamping on direct input (CRITICAL).** The health value input field in the Combat tab allowed typing values above max or below 0, bypassing the adapter's clamping. Added `_updateObject` override to intercept form submissions and clamp `system.pools.health.value` to `[0, max]`.
- **Fixed max health reduction edge case.** When max health is reduced below the current value, current health is now automatically clamped to the new max.
- **Fixed item sorting crash.** Added defensive fallback `(a.name || "")` in `_prepareItemGroups` sort to prevent `localeCompare` errors on items with missing names.
- **Fixed tab label double-localization.** Removed redundant `{{localize}}` helpers from `rail.hbs` — `_prepareTabs()` already localizes tab labels; applying `localize` again was unnecessary.

## 1.1.4

- **Fixed tab switching (definitive).** The root cause was the `container: { id: "cne-tab-body" }` shared-container config on the tab parts: in Foundry v14 a shared container does not retain every part's element, so only the last tab (Settings) survived in the DOM and core's tab handler had nothing to activate.
  - Removed the `container` config from all tab parts — each tab now renders as a direct child of `.window-content`, concatenated in order (the documented v13/v14 pattern).
  - Removed the manual `renderTemplate()` workarounds in `_onRender` and the `changeTab` override — tab switching is once again handled entirely by core's built-in tab action, which toggles the `.active` class; visibility is pure CSS.
  - Removed the silent try/catch wrappers and the stored `_sheetContext` snapshot (stale-data risk).
  - Updated the stylesheet: tab layout/scroll rules now target `.window-content > .tab` instead of the removed `.cne-tab-body` container.

## 1.1.3

- **Fixed Settings tab and ALL tab switching** (take 3) — previous fix (`_renderPart`) still replaced container contents, causing the same error. Switched to direct `renderTemplate()` + `appendChild()` approach:
  - `_onRender` now renders **all 7 tabs** into `#cne-tab-body` on initial open, so every tab's content exists in the DOM from the start.
  - `changeTab` override uses `renderTemplate()` to compile the tab template directly, then appends the resulting element to the container (instead of calling `_renderPart` which overwrites).
  - Both methods use `document.createElement('div')` as a parsing wrapper to turn HTML string into DOM elements before appending.

## 1.1.2

- **Fixed Settings tab and all tab switching** — the root cause was that all 7 tab parts shared the same DOM container (`#cne-tab-body`). During initial render, only the last part (Settings) survived in the DOM. When clicking any tab, Foundry's `TabsController` threw "No matching tab element found" because the clicked tab's content wasn't in the DOM.
  - Added `changeTab()` override that renders tab content **on demand** when switching tabs.
  - Stored sheet context in `_sheetContext` during `_prepareContext()` so on-demand rendering has access to the full context.
  - Kept the `_onRender` active-tab re-render for initial open.

## 1.1.1

- **Renamed** module display name from "Cypher NPC Sheet — Dark Elegance" to **"Cypher NPC Sheet"** across all user-facing strings (module title, sheet label, settings, README, and localization).
- **Fixed Settings tab button** — the sheet now correctly re-renders the active tab on open, preventing the shared container from showing the wrong tab content. Also hardened `actor.limited` checks so owners always see all tabs.

## 1.1.0

- Settings tab: new **Type** section — choose the NPC type (Normal or Monster). Monster re-themes the entire sheet in red, black and silver (per-NPC flag).
- Settings tab: new **Portrait** section — change the main portrait image, image fit (cover/contain/fill), image orientation (normal/mirrored/flipped), image align (center/top/bottom/left/right) and image space width in percent (20–60, default 35).
- All sheet colors now flow from CSS custom-property tokens, so the Monster theme restyles every panel, ribbon, input and button consistently.

## 1.0.0

Initial release.

- New ApplicationV2 NPC sheet for the Cypher System with a dark gold-and-blue theme.
- Seven color-coded tabs on a left rail: Main, Persona, Action, Combat, Equipment, Info, Settings (cog icon).
- Main tab: 35% cover portrait with ornate frame and image picker, system box (level, movement, size), basic info fields, roleplay trait list with roleplay advice.
- Persona tab: rich-text description, demeanor, personality, mannerisms, secrets.
- Action tab: attack item list with drag & drop, create/edit/delete (with confirmation) and post-to-chat; tactics notes.
- Combat tab: health with quick-adjust buttons and reset, damage, armor, initiative bonus.
- Equipment tab: item sections (equipment always; armor, ammunition, cyphers, artifacts, oddities, materials via native toggles) with drag & drop.
- Info tab: GM stat block (rich text) and document UUID with copy button.
- Settings tab: initiative bonus, hide-archived toggle, equipment-section toggles with custom labels.
- World setting to control whether this sheet is the default NPC sheet.
- Accessible focus states, tooltips, reduced-motion support, narrow-window responsive layout.
