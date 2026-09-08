/**
 * Shared constants for the Cypher NPC Sheet — Dark Elegance module.
 */

/** Module id — must match module.json and the folder name. */
export const MODULE_ID = "cypher-npc-elegance";

/** Base path used for templates and assets. */
export const MODULE_PATH = `modules/${MODULE_ID}`;

/**
 * Item types an NPC can meaningfully carry in the Cypher System.
 * Verified against cyphersystem 3.5.2 (module/actor/actor-sheet.js, _onDropItem).
 */
export const NPC_ITEM_TYPES = [
  "attack",
  "armor",
  "ammo",
  "equipment",
  "cypher",
  "artifact",
  "oddity",
  "material"
];

/**
 * Item types the Cypher System treats as PC/companion-only "character
 * properties". Dropping these onto an NPC is rejected, mirroring the system
 * behaviour (CYPHERSYSTEM.CharacterPropertiesCanOnlySharedAcrossPCs).
 */
export const PC_ONLY_ITEM_TYPES = [
  "ability",
  "lasting-damage",
  "power-shift",
  "skill",
  "recursion",
  "tag"
];

/** Maps item type -> item-group key used by the sheet context. */
export const ITEM_GROUP_BY_TYPE = {
  attack: "attacks",
  armor: "armor",
  ammo: "ammo",
  equipment: "equipment",
  cypher: "cyphers",
  artifact: "artifacts",
  oddity: "oddities",
  material: "materials"
};

/** Equipment sections gated by the NPC's native equipment toggles. */
export const TOGGLED_SECTIONS = ["ammo", "armor", "cyphers", "artifacts", "oddities", "materials"];
