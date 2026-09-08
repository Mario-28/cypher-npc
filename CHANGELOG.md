# Changelog

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
