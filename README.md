# CYPHER NPC

A complete restyle of the **Cypher System NPC actor sheet** for **Foundry VTT v14+**. Dark, sleek styling with gold and blue ribbons and separators, a color-coded seven-tab rail on the left border, and dedicated spaces for persona, combat, equipment, and GM notes.

## Requirements

- Foundry VTT **v14** or newer (verified on 14.360)
- **Cypher System** game system (verified on 3.5.2)

## Installation

1. In Foundry, open **Add-on Modules → Install Module**.
2. Choose the release zip (`cypher-npc-elegance-1.0.0.zip`) or extract it into `Data/modules/` so the folder is `Data/modules/cypher-npc-elegance/`.
3. Enable **CYPHER NPC** in your world.

The sheet registers itself as the **default NPC sheet** (world setting, configurable under *Module Settings*). The system's original sheet remains available — switch any time via the sheet configuration button in the sheet's title bar.

## Tabs

| Tab | Color | Contents |
|-----|-------|----------|
| **Main** | Gold | Portrait (35% showcase, click to change), System box (Level, Movement, Size), Basic info (name, role/occupation/career/path, gender, age, weight, height, skin/hair/eye color, body type), Roleplay traits with advice |
| **Persona** | Violet | Description (rich text), demeanor, personality, voice & mannerisms, secrets & hooks |
| **Action** | Orange | Attacks (drag & drop, create, edit, post to chat), tactics & behavior notes |
| **Combat** | Crimson | Health with quick adjust (Alt = ±10) and reset, damage, armor, initiative bonus |
| **Equipment** | Green | Equipment, plus toggleable sections for armor, ammunition, cyphers, artifacts, oddities, and materials — all drag & drop |
| **Info** | Blue | GM stat block & notes (rich text), document UUID |
| **Settings** | Slate (cog icon) | NPC type (Normal / Monster), portrait options, native sheet settings and equipment-section toggles |

### NPC type — Normal or Monster

The Settings tab lets you mark an NPC as **Normal** or **Monster**. Monsters get a full red, black and silver re-theme of the sheet (ribbons, panels, inputs, buttons, window chrome) while the layout and features stay identical. The choice is stored per NPC.

### Portrait options

Also on the Settings tab: change the main portrait image, choose how it is fitted (**Cover** / **Contain** / **Fill (stretch)**), flipped (**Normal** / **Mirrored** / **Flipped** / **Mirrored & flipped**), aligned (**Center** / **Top** / **Bottom** / **Left** / **Right**) and how wide the portrait space is, in percent of the main tab (**20–60 %**, default 35 %).

## Data storage

- Native Cypher System fields (level, health, damage, armor, description, notes, initiative bonus, equipment toggles) are stored **on the actor's own data model** and remain fully compatible with the standard sheet.
- Everything the system does not provide (movement, size, persona details, roleplay traits, tactics, NPC type, portrait presentation) is stored under **`flags.cypher-npc-elegance`** and never touches core or system data.

All JavaScript access to system data goes through a single compatibility adapter (`scripts/cypher-adapter.mjs`), verified against cyphersystem 3.5.2.

## Notes & limitations

- The Cypher System treats abilities, skills, and similar *character properties* as PC/companion-only. Dropping those onto an NPC is refused, mirroring the system's own behavior.
- NPC item rolls are a PC-only feature of the system's macro API; this sheet offers *post to chat* for items instead.
- Archived items are hidden from lists (see the *hide archived items* setting).

## Development

- ES modules, ApplicationV2 (`ActorSheetV2` + `HandlebarsApplicationMixin`), no jQuery.
- All styles live in `@layer module.cypher-npc-elegance` and are scoped to `.cypher-npc-elegance`.
- Localization namespace: `CNE.*` (`lang/en.json`).
