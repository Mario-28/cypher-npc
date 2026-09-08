# Changelog

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
