/**
 * Cypher System compatibility adapter.
 *
 * This is the ONE place in the module that knows where the Cypher System
 * stores NPC data. All JavaScript reads/writes of system fields go through
 * here. Verified against cyphersystem 3.5.2 (template.json, npc-sheet.html).
 *
 * Verified native NPC paths:
 *   system.basic.level                        (number)
 *   system.pools.health.value / .max          (number)
 *   system.combat.damage / .armor             (number)
 *   system.description                        (html string)
 *   system.notes                              (html string, GM stat block)
 *   system.settings.general.initiativeBonus   (number)
 *   system.settings.general.hideArchive       (boolean)
 *   system.settings.equipment.<key>.active    (boolean)
 *   system.settings.equipment.<key>.label     (string, cyphers/artifacts/oddities/materials)
 */
export const CypherAdapter = {

  /** The game-system id this module integrates with. */
  systemId: "cyphersystem",

  /* -------------------------------------------- */
  /*  Reads                                       */
  /* -------------------------------------------- */

  /** NPC level (target number = level × 3). */
  getLevel(actor) {
    return actor.system?.basic?.level ?? 1;
  },

  /** NPC health pool: {value, max}. */
  getHealth(actor) {
    const health = actor.system?.pools?.health ?? {};
    return { value: health.value ?? 0, max: health.max ?? 0 };
  },

  /** Damage the NPC inflicts. */
  getDamage(actor) {
    return actor.system?.combat?.damage ?? 0;
  },

  /** Armor rating of the NPC. */
  getArmor(actor) {
    return actor.system?.combat?.armor ?? 0;
  },

  /** Flat bonus added to initiative rolls. */
  getInitiativeBonus(actor) {
    return actor.system?.settings?.general?.initiativeBonus ?? 0;
  },

  /** Whether archived items are hidden in lists. */
  getHideArchive(actor) {
    return actor.system?.settings?.general?.hideArchive ?? false;
  },

  /** Public description (HTML). */
  getDescription(actor) {
    return actor.system?.description ?? "";
  },

  /** GM stat-block notes (HTML). */
  getNotes(actor) {
    return actor.system?.notes ?? "";
  },

  /**
   * Native equipment-section toggles.
   * @returns {Record<string, {active: boolean, label: string}>}
   */
  getEquipmentToggles(actor) {
    const sections = actor.system?.settings?.equipment ?? {};
    const result = {};
    for (const [key, value] of Object.entries(sections)) {
      result[key] = { active: value?.active ?? false, label: value?.label ?? "" };
    }
    return result;
  },

  /** Whether an item is archived (hidden from active lists). */
  isArchived(item) {
    return item.system?.archived === true;
  },

  /** Item description (HTML) for chat cards and summaries. */
  getItemDescription(item) {
    return item.system?.description ?? "";
  },

  /** Item "basic" payload (level, damage, quantity, …; shape varies by type). */
  getItemBasic(item) {
    return item.system?.basic ?? {};
  },

  /* -------------------------------------------- */
  /*  Writes                                      */
  /* -------------------------------------------- */

  /**
   * Set the NPC's health, clamped to [0, max].
   * @param {Actor} actor
   * @param {number} value
   */
  async setHealth(actor, value) {
    const { max } = this.getHealth(actor);
    const clamped = Math.max(0, Math.min(max, Math.round(value)));
    return actor.update({ "system.pools.health.value": clamped });
  }
};
