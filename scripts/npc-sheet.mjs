/**
 * CypherNpcEleganceSheet — a complete ApplicationV2 restyle of the Cypher
 * System NPC actor sheet for Foundry VTT v14+.
 *
 * Design notes:
 * - Native Cypher System fields stay on the actor's own data model and are
 *   accessed exclusively through the CypherAdapter (single adapter).
 * - Everything the system does not provide (movement, size, persona details,
 *   roleplay traits, tactics, …) is stored under flags.cypher-npc-elegance.
 * - Item rows use `.draggable` + `data-item-id` so ActorSheetV2 supplies
 *   drag-out and drop-to-create behaviour automatically.
 */

import { MODULE_ID, MODULE_PATH, ITEM_GROUP_BY_TYPE, PC_ONLY_ITEM_TYPES, TOGGLED_SECTIONS } from "./constants.mjs";
import { CypherAdapter } from "./cypher-adapter.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

export class CypherNpcEleganceSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["cypher-npc-elegance"],
    tag: "form",
    position: { width: 760, height: 800 },
    window: { resizable: true, minimizable: true },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      editImage: CypherNpcEleganceSheet.#onEditImage,
      adjustHealth: CypherNpcEleganceSheet.#onAdjustHealth,
      resetHealth: CypherNpcEleganceSheet.#onResetHealth,
      itemCreate: CypherNpcEleganceSheet.#onItemCreate,
      itemEdit: CypherNpcEleganceSheet.#onItemEdit,
      itemDelete: CypherNpcEleganceSheet.#onItemDelete,
      itemChat: CypherNpcEleganceSheet.#onItemChat,
      toggleAttackType: CypherNpcEleganceSheet.#onToggleAttackType,
      journalDelete: CypherNpcEleganceSheet.#onJournalDelete,
      copyUuid: CypherNpcEleganceSheet.#onCopyUuid
    }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "CNE.Tabs.Main", icon: "fa-solid fa-id-card" },
        { id: "persona", label: "CNE.Tabs.Persona", icon: "fa-solid fa-masks-theater" },
        { id: "combat", label: "CNE.Tabs.Combat", icon: "fa-solid fa-shield-halved" },
        { id: "equipment", label: "CNE.Tabs.Equipment", icon: "fa-solid fa-sack-xmark" },
        { id: "info", label: "CNE.Tabs.Info", icon: "fa-solid fa-scroll" },
        { id: "settings", label: "CNE.Tabs.Settings", icon: "fa-solid fa-gear" }
      ],
      initial: "main"
    }
  };

  /** @override */
  static PARTS = {
    rail: {
      template: `${MODULE_PATH}/templates/rail.hbs`
    },
    // Tab parts render as direct children of .window-content, concatenated in
    // order (the documented v13/v14 pattern). No shared `container` config:
    // in v14 a shared container does not retain every part's element, which
    // left only the last tab in the DOM and broke tab switching.
    main: {
      template: `${MODULE_PATH}/templates/tab-main.hbs`,
      scrollable: [""]
    },
    persona: {
      template: `${MODULE_PATH}/templates/tab-persona.hbs`,
      scrollable: [""]
    },
    combat: {
      template: `${MODULE_PATH}/templates/tab-combat.hbs`,
      scrollable: [""]
    },
    equipment: {
      template: `${MODULE_PATH}/templates/tab-equipment.hbs`,
      scrollable: [""]
    },
    info: {
      template: `${MODULE_PATH}/templates/tab-info.hbs`,
      scrollable: [""]
    },
    settings: {
      template: `${MODULE_PATH}/templates/tab-settings.hbs`,
      scrollable: [""]
    }
  };

  /* -------------------------------------------- */
  /*  Context preparation                         */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const A = CypherAdapter;

    const flags = actor.flags?.[MODULE_ID] ?? {};
    const portrait = flags.portrait ?? {};
    const npcType = flags.npcType === "monster" ? "monster" : "normal";

    Object.assign(context, {
      actor,
      system: actor.system,
      flags,
      editable: this.isEditable,
      limited: actor.limited,
      tabs: this._prepareTabs("primary"),

      // NPC type (drives the monster theme) and portrait presentation.
      npcType,
      isMonster: npcType === "monster",
      npcTypeChoices: [
        { value: "normal", label: game.i18n.localize("CNE.Choices.NpcType.Normal") },
        { value: "monster", label: game.i18n.localize("CNE.Choices.NpcType.Monster") }
      ],
      portraitStyle: CypherNpcEleganceSheet.#portraitStyle(portrait),
      portraitWidth: CypherNpcEleganceSheet.#portraitWidth(portrait),

      // Select choices (labels localized here, not in templates).
      movementChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Movement", ["Immediate", "Short", "Long", "VeryLong"]),
      sizeChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Size", ["Tiny", "Small", "Medium", "Large", "Huge", "Gigantic"]),
      bodyTypeChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.BodyType", ["Slim", "Average", "Athletic", "Stocky", "Heavy", "Massive"]),
      genderChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Gender", ["Male", "Female", "Other"]),
      demeanorChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Demeanor", ["Calm", "Friendly", "Nervous", "Aggressive", "Aloof", "Curious", "Menacing"]),
      fitChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Fit", ["Cover", "Contain", "Fill"]),
      orientationChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Orientation", ["Normal", "FlipH", "FlipV", "FlipBoth"]),
      alignChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Align", ["Center", "Top", "Bottom", "Left", "Right"]),

      // Roleplay journals — dropped journal entries for quick GM reference.
      roleplayJournals: await CypherNpcEleganceSheet.#prepareRoleplayJournals(actor),

      // Active defense tracking (default defense = 'default', item ID for custom).
      activeDefense: flags.activeDefense ?? 'default'
    });

    // Limited users only ever see the MAIN tab (portrait, name).
    if (actor.limited) {
      for (const id of Object.keys(context.tabs)) {
        if (id !== "main") delete context.tabs[id];
      }
      return context;
    }

    // Enriched HTML for the prose-mirror fields and read-only views.
    const enrichment = { secrets: actor.isOwner, relativeTo: actor };
    context.enrichedDescription = await TextEditor.enrichHTML(A.getDescription(actor), enrichment);
    context.enrichedNotes = await TextEditor.enrichHTML(A.getNotes(actor), enrichment);

    // Item groups (sorted, archived filtered out).
    context.itemGroups = this._prepareItemGroups();
    context.equipmentSections = this._prepareEquipmentSections(context.itemGroups);

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId in (context.tabs ?? {})) context.tab = context.tabs[partId];
    return context;
  }

  /**
   * Build select-option choice arrays: [{value, label}…] with a blank entry.
   * @param {string} prefix  Localization prefix.
   * @param {string[]} keys  Choice keys appended to the prefix.
   * @returns {{value: string, label: string}[]}
   */
  static #choices(prefix, keys) {
    const choices = [{ value: "", label: game.i18n.localize("CNE.Choices.Unspecified") }];
    for (const key of keys) {
      choices.push({ value: key, label: game.i18n.localize(`${prefix}.${key}`) });
    }
    return choices;
  }

  /**
   * Compose the inline CSS for the main portrait image from the portrait
   * settings: fit -> object-fit, align -> object-position, orientation ->
   * transform flips. Defaults to cover / center / no flip.
   * @param {object} portrait  The portrait flag object.
   * @returns {string}
   */
  static #portraitStyle(portrait) {
    const fit = { Cover: "cover", Contain: "contain", Fill: "fill" }[portrait.fit] ?? "cover";
    const align = {
      Center: "center", Top: "center top", Bottom: "center bottom",
      Left: "left center", Right: "right center"
    }[portrait.align] ?? "center";
    const transform = {
      FlipH: "scaleX(-1)", FlipV: "scaleY(-1)", FlipBoth: "scale(-1, -1)"
    }[portrait.orientation];
    return `object-fit: ${fit}; object-position: ${align};${transform ? ` transform: ${transform};` : ""}`;
  }

  /**
   * Read the portrait space width (percent of the main-grid row), defaulting
   * to 35% and clamping to the sane 20-60% range.
   * @param {object} portrait  The portrait flag object.
   * @returns {number}
   */
  static #portraitWidth(portrait) {
    const width = Number(portrait.width);
    if (!Number.isFinite(width) || width <= 0) return 35;
    return Math.min(60, Math.max(20, Math.round(width)));
  }

  /**
   * Resolve journal entries stored in roleplayJournals flags and enrich their
   * content for tooltip previews.
   * @param {Actor} actor
   * @returns {Promise<{uuid:string,name:string,img:string,enrichedContent:string}[]>}
   */
  static async #prepareRoleplayJournals(actor) {
    const entries = actor.flags?.[MODULE_ID]?.roleplayJournals ?? [];
    const results = [];
    for (const uuid of entries) {
      const doc = await fromUuid(uuid);
      if (!doc) continue;
      const enriched = await TextEditor.enrichHTML(doc.pages?.contents[0]?.text?.content ?? doc.description ?? "", { secrets: false, relativeTo: doc });
      results.push({ uuid, name: doc.name, img: doc.img || "icons/svg/book.svg", enrichedContent: enriched });
    }
    return results;
  }

  /**
   * Group the actor's items by sheet section, sorted by name.
   * Archived items are excluded (they are intentionally filed away).
   * Attacks are further split into primary, secondary, and defenses
   * via the `flags.cypher-npc-elegance.attackType` flag.
   * @returns {Record<string, object[]>}
   */
  _prepareItemGroups() {
    const groups = {};
    for (const key of Object.values(ITEM_GROUP_BY_TYPE)) groups[key] = [];
    groups.primaryAttacks = [];
    groups.secondaryAttacks = [];
    groups.defenses = [];

    for (const item of this.document.items) {
      if (CypherAdapter.isArchived(item)) continue;
      const group = ITEM_GROUP_BY_TYPE[item.type];
      if (!group) {
        // Abilities can be used as defenses
        if (item.type === "ability") {
          groups.defenses.push(this.#prepareItemRow(item));
        }
        continue;
      }
      if (group === "attacks") {
        const type = item.getFlag?.(MODULE_ID, "attackType") || "primary";
        const target = type === "secondary" ? groups.secondaryAttacks
                     : type === "defense"  ? groups.defenses
                     : groups.primaryAttacks;
        target.push(this.#prepareItemRow(item, type));
      } else {
        groups[group].push(this.#prepareItemRow(item));
        // Armor also appears in the Defenses list
        if (group === "armor") {
          groups.defenses.push(this.#prepareItemRow(item));
        }
      }
    }
    for (const items of Object.values(groups)) {
      items.sort((a, b) => (a.name || "").localeCompare(b.name || "", game.i18n.lang));
    }
    return groups;
  }

  /**
   * Build the Equipment tab sections, honoring the NPC's native toggles.
   * @param {Record<string, object[]>} groups
   * @returns {{key: string, type: string, label: string, items: object[]}[]}
   */
  _prepareEquipmentSections(groups) {
    const toggles = CypherAdapter.getEquipmentToggles(this.document);
    const sections = [{
      key: "equipment",
      type: "equipment",
      label: game.i18n.localize("CNE.Sections.equipment"),
      items: groups.equipment
    }];
    for (const key of TOGGLED_SECTIONS) {
      const toggle = toggles[key];
      if (!toggle?.active) continue;
      sections.push({
        key,
        type: this.#itemTypeForSection(key),
        label: toggle.label?.trim() || game.i18n.localize(`CNE.Sections.${key}`),
        items: groups[key] ?? []
      });
    }
    return sections;
  }

  /** Map an equipment-section key back to its item type. */
  #itemTypeForSection(key) {
    for (const [type, group] of Object.entries(ITEM_GROUP_BY_TYPE)) {
      if (group === key) return type;
    }
    return "equipment";
  }

  /**
   * Compact row data for an item.
   * @param {Item} item
   * @param {string} [attackType]  "primary" | "secondary" | "defense"
   */
  #prepareItemRow(item, attackType = null) {
    const basic = CypherAdapter.getItemBasic(item);
    const actor = this.document;
    let detail = "";
    let attackStats = null;
    let defenseStats = null;
    let abilities = null;
    switch (item.type) {
      case "attack": {
        // --- Cypher Cool Items v2.0.37 stat sync ---
        // Read from CCI flags first, then fall back to native Cypher System fields
        const cciData = item.getFlag('cypher-cool-items', 'data') || {};
        const npcLevel = actor.system?.basic?.level ?? 0;
        // CCI stores attack stats in flags; fall back to native system.basic
        const atkLevel = cciData.level ?? basic.level ?? npcLevel;
        const atkDamage = cciData.damage ?? basic.damage ?? 0;
        // Bonus/penalty: CCI has explicit attackBonus field, else compute from level diff
        let bonusPenalty = cciData.attackBonus ?? '';
        if (bonusPenalty === '') {
          bonusPenalty = atkLevel - npcLevel;
        }
        const bonusPenaltyNum = Number(bonusPenalty);
        const parts = [];
        if (basic.type) parts.push(basic.type);
        parts.push(`${game.i18n.localize("CNE.Items.Damage")} ${atkDamage}`);
        detail = parts.join(" · ");
        attackStats = {
          level: npcLevel,
          attackLevel: atkLevel,
          bonusPenalty: bonusPenaltyNum,
          bonusPenaltySign: bonusPenaltyNum > 0 ? `+${bonusPenaltyNum}` : `${bonusPenaltyNum}`,
          damage: atkDamage
        };
        // --- Cypher Cool Items v2.0.37 abilities ---
        abilities = [];
        // Linked ability item (ability-type attacks)
        if (cciData.abilityItem) {
          const abi = cciData.abilityItem;
          const realItem = actor.items.get(abi.id);
          abilities.push({
            id: abi.id,
            name: abi.name,
            img: abi.img,
            uuid: abi.uuid,
            attackBonus: abi.attackBonus,
            damage: abi.damage,
            range: abi.range,
            duration: abi.duration,
            pool: abi.pool,
            poolValue: abi.poolValue,
            description: realItem ? CypherAdapter.getItemDescription(realItem) : ''
          });
        }
        // Special abilities array
        if (cciData.specialAbilities?.length) {
          for (const abi of cciData.specialAbilities) {
            const realItem = actor.items.get(abi.id);
            abilities.push({
              id: abi.id,
              name: abi.name,
              img: abi.img,
              uuid: abi.uuid,
              description: realItem ? CypherAdapter.getItemDescription(realItem) : ''
            });
          }
        }
        break;
      }
      case "armor": {
        // Cypher System v2 stores armor rating at system.basic.rating;
        // fall back to system.rating for older versions.
        const armorRating = item.system?.basic?.rating ?? item.system?.rating ?? 0;
        const parts = [];
        if (basic.type) parts.push(basic.type);
        parts.push(`+${armorRating}`);
        detail = parts.join(" · ");
        // --- Defense stats for armor items ---
        const cciData = item.getFlag('cypher-cool-items', 'data') || {};
        defenseStats = {
          armorRating: armorRating,
          armorModNpc: cciData.armorModNpc ?? 0,
          armorPenalty: cciData.armorPenalty ?? 0
        };
        break;
      }
      case "ability": {
        // --- Defense stats for ability items (when used as defense) ---
        const cciData = item.getFlag('cypher-cool-items', 'data') || {};
        defenseStats = {
          armorRating: cciData.defenseArmor ?? 0,
          armorModNpc: cciData.armorModNpc ?? 0,
          armorPenalty: cciData.defensePenalty ?? 0
        };
        break;
      }
      case "cypher":
      case "artifact":
      case "oddity":
        detail = `${game.i18n.localize("CNE.Items.Level")} ${basic.level || "—"}`;
        break;
      case "ammo":
      case "equipment":
      case "material":
        detail = `×${basic.quantity ?? 1}`;
        break;
    }
    const row = { id: item.id, name: item.name, img: item.img, type: item.type, detail };
    if (attackStats) row.attackStats = attackStats;
    if (defenseStats) row.defenseStats = defenseStats;
    if (abilities?.length) row.abilities = abilities;
    if (attackType) {
      row.attackType = attackType;
      row.attackIcon = attackType === "secondary" ? "fa-wand-magic-sparkles"
                     : attackType === "defense"  ? "fa-shield-halved"
                     : "fa-crosshairs";
    }
    return row;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Register a one-time hook to re-render this sheet when any item on
    // this actor changes (e.g. attack level/damage edited in item sheet).
    if (!this._itemHookRegistered) {
      this._itemHookRegistered = true;
      this._itemUpdateHook = Hooks.on("updateItem", (item, changes, opts, userId) => {
        if (item.parent === this.document) this.render();
      });
      this._itemCreateHook = Hooks.on("createItem", (item, opts, userId) => {
        if (item.parent === this.document) this.render();
      });
      this._itemDeleteHook = Hooks.on("deleteItem", (item, opts, userId) => {
        if (item.parent === this.document) this.render();
      });
    }

    // Monster type: swap the whole window to the red/black/silver theme.
    this.element.classList.toggle("cne-monster", context.isMonster === true);

    // Non-editors get a fully read-only sheet (tab rail stays interactive).
    if (!this.isEditable) {
      const fields = this.element.querySelectorAll(
        ".tab input, .tab select, .tab textarea, .tab button"
      );
      for (const field of fields) field.disabled = true;
    }

    // Restore previously active tab after a re-render (submitOnChange resets to initial).
    // Defensive: if the saved tab no longer exists (e.g. a tab was removed in an update),
    // fall back to the initial tab so the sheet doesn't render blank.
    const savedTab = this._activeTabs?.primary;
    const validTabIds = new Set(this.constructor.TABS.primary.tabs.map(t => t.id));
    const tabToRestore = validTabIds.has(savedTab) ? savedTab : this.constructor.TABS.primary.initial;
    if (tabToRestore && tabToRestore !== this.constructor.TABS.primary.initial) {
      this.changeTab(tabToRestore, { group: "primary" });
    }

    // Combat tab interactions (right-click, delete fallback, drag-and-drop).
    const combatTab = this.element.querySelector('.tab[data-tab="combat"]');
    if (combatTab) {
      // Right-click on attack/defense items opens the item sheet.
      for (const row of combatTab.querySelectorAll('.cne-item[data-item-id]')) {
        row.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          const item = this.document.items.get(row.dataset.itemId);
          item?.sheet.render(true);
        });
      }

      /* ---------- Active defense checkbox (default + custom) ---------- */
      for (const chk of combatTab.querySelectorAll('.cne-defense-checkbox')) {
        chk.addEventListener('change', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const defenseId = chk.dataset.defenseId;
          const isChecked = chk.checked;
          // Uncheck all other defense checkboxes in the DOM
          for (const other of combatTab.querySelectorAll('.cne-defense-checkbox')) {
            if (other !== chk) other.checked = false;
          }
          // Remove active class from all defense rows
          for (const row of combatTab.querySelectorAll('.cne-defense-active')) {
            row.classList.remove('cne-defense-active');
          }
          // Update the active defense flag
          const newActive = isChecked ? defenseId : 'default';
          await this.document.setFlag(MODULE_ID, 'activeDefense', newActive);
          // Add active class to the checked row
          if (isChecked) {
            const row = chk.closest('.cne-item');
            if (row) row.classList.add('cne-defense-active');
          } else {
            // Default defense gets the active class when nothing is checked
            const defaultRow = combatTab.querySelector('.cne-default-defense');
            if (defaultRow) defaultRow.classList.add('cne-defense-active');
          }
        });
      }

      // Fallback: explicit delete click handlers (defensive — some users
      // report core action delegation failing on dynamically-rendered tabs).
      for (const btn of combatTab.querySelectorAll('[data-action="itemDelete"]')) {
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!this.isEditable) return;
          const id = btn.closest("[data-item-id]")?.dataset.itemId;
          const item = id ? this.document.items.get(id) : undefined;
          if (!item) return;
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("CNE.Items.DeleteTitle") },
            content: `<p>${game.i18n.format("CNE.Items.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`,
            modal: true,
            rejectClose: false
          });
          if (!confirmed) return;
          await item.delete();
        });
      }

      /* ---------- Intra-sheet drag-and-drop (primary ↔ secondary ↔ defense) ---------- */
      for (const row of combatTab.querySelectorAll('.cne-item[data-item-id]')) {
        row.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.setData('text/plain', JSON.stringify({
            source: 'cne-combat',
            actorId: this.document.id,
            itemId: row.dataset.itemId
          }));
          ev.dataTransfer.effectAllowed = 'move';
        });
      }

      for (const section of combatTab.querySelectorAll('.cne-item-section[data-drop-zone]')) {
        section.addEventListener('dragenter', (ev) => {
          ev.preventDefault();
          section.classList.add('cne-drag-over');
        });
        section.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          section.classList.add('cne-drag-over');
        });
        section.addEventListener('dragleave', (ev) => {
          section.classList.remove('cne-drag-over');
        });
        section.addEventListener('drop', async (ev) => {
          section.classList.remove('cne-drag-over');
          const zone = section.dataset.dropZone; // "primary" | "secondary" | "defense"

          // ---- Internal drop: item already on this actor ----
          try {
            const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
            if (data.source === 'cne-combat' && data.actorId === this.document.id && data.itemId) {
              ev.preventDefault();
              ev.stopPropagation();
              const item = this.document.items.get(data.itemId);
              if (!item) return;
              // Defense zone only accepts armor and abilities
              if (zone === 'defense') {
                if (!['armor', 'ability'].includes(item.type)) {
                  ui.notifications.warn(game.i18n.localize('CNE.Warnings.DefenseDropBlocked'));
                  return;
                }
                // Armor/ability already on actor — nothing to move, just show in defenses
                return;
              }
              if (item.type === 'attack') {
                const current = item.getFlag(MODULE_ID, 'attackType') || 'primary';
                if (current !== zone) {
                  await item.setFlag(MODULE_ID, 'attackType', zone);
                }
              }
              return;
            }
          } catch (e) {
            // Not internal data — let Foundry handle external drops.
          }

          // ---- External drop: track target zone so _onDropItem can tag it ----
          this._lastDropZone = zone;
        });
      }

    }

    // Ability icon click: open the linked ability item sheet
    if (combatTab) {
      for (const icon of combatTab.querySelectorAll('.cne-ability-icon[data-ability-id]')) {
        icon.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const abilityId = icon.dataset.abilityId;
          const ability = abilityId ? this.document.items.get(abilityId) : undefined;
          ability?.sheet.render(true);
        });

        // Position fixed tooltip on hover (escapes overflow:hidden ancestors)
        const tooltip = icon.querySelector('.cne-ability-tooltip');
        if (tooltip) {
          icon.addEventListener('mouseenter', () => {
            const rect = icon.getBoundingClientRect();
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.top = `${rect.top - 8}px`;
            tooltip.classList.add('cne-visible');
          });
          icon.addEventListener('mouseleave', () => {
            tooltip.classList.remove('cne-visible');
          });
        }
      }
    }

    /* ---------- Roleplay journal grid: drag, drop, and fancy tooltips ---------- */
    const roleplayGrid = this.element.querySelector('.cne-journal-grid[data-drop-zone="roleplay"]');
    if (roleplayGrid) {
      // Visual drag feedback
      roleplayGrid.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        roleplayGrid.classList.add('cne-drag-over');
      });
      roleplayGrid.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
        roleplayGrid.classList.add('cne-drag-over');
      });
      roleplayGrid.addEventListener('dragleave', (ev) => {
        roleplayGrid.classList.remove('cne-drag-over');
      });
      roleplayGrid.addEventListener('drop', async (ev) => {
        roleplayGrid.classList.remove('cne-drag-over');
        const data = foundry.applications.ux.TextEditor.getDragEventData(ev);
        if (data.type === 'JournalEntry' || data.type === 'JournalEntryPage') {
          ev.preventDefault();
          ev.stopPropagation();
          const doc = await fromUuid(data.uuid);
          const journal = data.type === 'JournalEntryPage' ? doc?.parent : doc;
          if (!journal) return;
          const uuid = journal.uuid;
          const current = foundry.utils.deepClone(this.document.flags?.[MODULE_ID]?.roleplayJournals ?? []);
          if (current.includes(uuid)) {
            ui.notifications.info(game.i18n.localize('CNE.Journals.AlreadyAdded'));
            return;
          }
          current.push(uuid);
          await this.document.setFlag(MODULE_ID, 'roleplayJournals', current);
        }
      });

      // Fancy fixed-position tooltip on journal hover (positioned above item)
      for (const item of roleplayGrid.querySelectorAll('.cne-journal-item')) {
        const tooltip = item.querySelector('.cne-journal-tooltip');
        if (!tooltip) continue;
        item.addEventListener('mouseenter', () => {
          const rect = item.getBoundingClientRect();
          const tooltipHeight = tooltip.offsetHeight;
          const arrowSize = 6; // matches CSS border-width
          const gap = 4;
          let top = rect.top - tooltipHeight - arrowSize - gap;
          // Flip to below if it would go off the top of the viewport
          if (top < 4) {
            top = rect.bottom + arrowSize + gap;
            tooltip.classList.add('cne-below');
          } else {
            tooltip.classList.remove('cne-below');
          }
          tooltip.style.left = `${rect.left + rect.width / 2}px`;
          tooltip.style.top = `${top}px`;
          tooltip.classList.add('cne-visible');
        });
        item.addEventListener('mouseleave', () => {
          tooltip.classList.remove('cne-visible', 'cne-below');
        });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Tab switching                               */
  /* -------------------------------------------- */

  /**
   * Manually handle tab activation.  Foundry v14's TabsController throws
   * "No matching tab element found" when tab-content parts are rendered as
   * siblings of the navigation rail rather than inside a single shared
   * container.  This override bypasses the controller and toggles the
   * .active class directly.
   * @override
   */
  changeTab(tab, options = {}) {
    const group = options.group ?? "primary";

    // Remember active tab so re-renders (submitOnChange) don't snap back to "main"
    this._activeTabs = this._activeTabs || {};
    this._activeTabs[group] = tab;

    // Deactivate current tab
    const activeBtn = this.element.querySelector(`[data-group="${group}"][data-action="tab"].active`);
    const activeContent = this.element.querySelector(`[data-group="${group}"].tab.active`);
    activeBtn?.classList.remove("active");
    activeContent?.classList.remove("active");

    // Activate target tab
    const targetBtn = this.element.querySelector(
      `[data-group="${group}"][data-action="tab"][data-tab="${tab}"]`
    );
    const targetContent = this.element.querySelector(
      `[data-group="${group}"].tab[data-tab="${tab}"]`
    );
    targetBtn?.classList.add("active");
    targetContent?.classList.add("active");

    // Scroll new tab to top
    targetContent?.scrollTo?.({ top: 0, behavior: "auto" });
  }

  /* -------------------------------------------- */
  /*  Form handling                               */
  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const data = { ...formData.object };

    // Clamp health value to [0, max] when updated directly via input
    if ("system.pools.health.value" in data) {
      const val = Number(data["system.pools.health.value"]);
      if (!Number.isNaN(val)) {
        const { max } = CypherAdapter.getHealth(this.document);
        data["system.pools.health.value"] = Math.max(0, Math.min(max, Math.round(val)));
      }
    }

    // Ensure max health is non-negative; if reduced below current health, clamp current too
    if ("system.pools.health.max" in data) {
      const maxVal = Number(data["system.pools.health.max"]);
      if (!Number.isNaN(maxVal)) {
        const clampedMax = Math.max(0, Math.round(maxVal));
        data["system.pools.health.max"] = clampedMax;
        const current = CypherAdapter.getHealth(this.document).value;
        if (current > clampedMax) {
          data["system.pools.health.value"] = clampedMax;
        }
      }
    }

    await this.document.update(data);
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /**
   * Mirror the Cypher System rule that character properties (abilities,
   * skills, …) cannot be moved onto NPCs. Verified against
   * cyphersystem 3.5.2 module/actor/actor-sheet.js (_onDropItem).
   * @override
   */
  async _onDropItem(event, item) {
    const zone = this._lastDropZone;

    // Defense zone only accepts armor and abilities
    if (zone === "defense") {
      if (!["armor", "ability"].includes(item.type)) {
        ui.notifications.warn(game.i18n.localize("CNE.Warnings.DefenseDropBlocked"));
        this._lastDropZone = null;
        return null;
      }
      // Allow abilities for defense zone even though they're PC-only
      return super._onDropItem(event, item);
    }

    const isForeign = item.parent !== this.document;
    if (isForeign && PC_ONLY_ITEM_TYPES.includes(item.type)) {
      ui.notifications.warn(game.i18n.localize("CNE.Warnings.ItemTypeBlocked"));
      this._lastDropZone = null; // clear stale zone
      return null;
    }
    return super._onDropItem(event, item);
  }

  /**
   * After Foundry creates items from a drop, tag attack items with the
   * combat-section zone they were dropped on (primary / secondary / defense).
   * @override
   */
  async _onDropItemCreate(itemData) {
    const zone = this._lastDropZone;
    const items = await super._onDropItemCreate(itemData);
    this._lastDropZone = null; // always clear
    if (zone && items?.length) {
      for (const item of items) {
        if (item.type === "attack") {
          await item.setFlag(MODULE_ID, "attackType", zone);
        }
      }
    }
    return items;
  }

  /**
   * Handle drops onto the sheet.  Journal entries dropped onto the
   * Roleplay box are stored under flags for quick GM reference.
   * @override
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.getDragEventData(event);

    if (data.type === "JournalEntry" || data.type === "JournalEntryPage") {
      const doc = await fromUuid(data.uuid);
      const journal = data.type === "JournalEntryPage" ? doc?.parent : doc;
      if (!journal) return;
      const uuid = journal.uuid;
      const current = foundry.utils.deepClone(this.document.flags?.[MODULE_ID]?.roleplayJournals ?? []);
      if (current.includes(uuid)) {
        ui.notifications.info(game.i18n.localize("CNE.Journals.AlreadyAdded"));
        return;
      }
      current.push(uuid);
      await this.document.setFlag(MODULE_ID, "roleplayJournals", current);
      return;
    }

    return super._onDrop(event);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Pick a new portrait image.
   * @this {CypherNpcEleganceSheet}
   */
  static async #onEditImage(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const current = this.document.img;
    // v14: FilePicker is the AppV2 class; .implementation covers the
    // factory/namespace variant defensively.
    const FilePickerClass = foundry.applications.apps.FilePicker?.implementation
      ?? foundry.applications.apps.FilePicker;
    const picker = new FilePickerClass({
      type: "image",
      current,
      callback: path => this.document.update({ img: path })
    });
    picker.render(true);
  }

  /**
   * Adjust health by ±1 (Alt: ±10), clamped to [0, max].
   * @this {CypherNpcEleganceSheet}
   */
  static async #onAdjustHealth(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    if (this._healthBusy) return; // prevent duplicate clicks
    this._healthBusy = true;
    try {
      const step = (event.altKey ? 10 : 1) * Number(target.dataset.delta || 0);
      if (!step) return;
      const { value } = CypherAdapter.getHealth(this.document);
      await CypherAdapter.setHealth(this.document, value + step);
    } finally {
      this._healthBusy = false;
    }
  }

  /**
   * Reset health to maximum.
   * @this {CypherNpcEleganceSheet}
   */
  static async #onResetHealth(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const { max } = CypherAdapter.getHealth(this.document);
    await CypherAdapter.setHealth(this.document, max);
  }

  /**
   * Create a new item of the given type and open its sheet for editing.
   * When `data-subtype` is present on the trigger (e.g. "primary",
   * "secondary", "defense" for attacks), the flag is set immediately.
   * @this {CypherNpcEleganceSheet}
   */
  static async #onItemCreate(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const type = target.dataset.type;
    if (!type || !(type in ITEM_GROUP_BY_TYPE)) return;
    const typeLabel = game.i18n.localize(`CNE.ItemTypes.${type}`);
    const [created] = await this.document.createEmbeddedDocuments("Item", [{
      name: game.i18n.format("CNE.Items.New", { type: typeLabel }),
      type
    }]);
    if (!created) return;
    const subtype = target.dataset.subtype;
    if (subtype && type === "attack") {
      await created.setFlag(MODULE_ID, "attackType", subtype);
    }
    created.sheet.render(true);
  }

  /**
   * Open an item's own sheet.
   * @this {CypherNpcEleganceSheet}
   */
  static #onItemEdit(event, target) {
    event.preventDefault();
    const item = this.#itemFromTarget(target);
    item?.sheet.render(true);
  }

  /**
   * Delete an item after confirmation (destructive action).
   * @this {CypherNpcEleganceSheet}
   */
  static async #onItemDelete(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const item = this.#itemFromTarget(target);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CNE.Items.DeleteTitle") },
      content: `<p>${game.i18n.format("CNE.Items.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`,
      modal: true,
      rejectClose: false
    });
    if (!confirmed) return;
    await item.delete();
  }

  /**
   * Post an item card to chat.
   * @this {CypherNpcEleganceSheet}
   */
  static async #onItemChat(event, target) {
    event.preventDefault();
    const item = this.#itemFromTarget(target);
    if (!item) return;
    const description = await TextEditor.enrichHTML(CypherAdapter.getItemDescription(item), {
      secrets: item.isOwner,
      relativeTo: item
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      content: `<div class="cne-chat-card"><header class="cne-chat-card-header"><img src="${item.img}" alt="" width="32" height="32"><h3>${foundry.utils.escapeHTML(item.name)}</h3></header>${description}</div>`
    });
  }

  /**
   * Cycle an attack item's type between primary → secondary → defense → primary.
   * @this {CypherNpcEleganceSheet}
   */
  static async #onToggleAttackType(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const item = this.#itemFromTarget(target);
    if (!item) return;
    const current = item.getFlag(MODULE_ID, "attackType") || "primary";
    const next = current === "primary" ? "secondary" : current === "secondary" ? "defense" : "primary";
    await item.setFlag(MODULE_ID, "attackType", next);
  }

  /**
   * Delete a roleplay journal from the Roleplay box.
   * @this {CypherNpcEleganceSheet}
   */
  static async #onJournalDelete(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const index = Number(target.closest("[data-journal-index]")?.dataset.journalIndex);
    const journals = foundry.utils.deepClone(this.document.flags?.[MODULE_ID]?.roleplayJournals ?? []);
    if (!Number.isInteger(index) || !journals[index]) return;
    journals.splice(index, 1);
    await this.document.setFlag(MODULE_ID, "roleplayJournals", journals);
  }

  /**
   * Copy the actor UUID to the clipboard.
   * @this {CypherNpcEleganceSheet}
   */
  static async #onCopyUuid(event, target) {
    event.preventDefault();
    try {
      await game.clipboard.copyPlainText(this.document.uuid);
      ui.notifications.info(game.i18n.localize("CNE.Info.UuidCopied"));
    } catch (err) {
      console.error(`[${MODULE_ID}] Failed to copy UUID`, err);
      ui.notifications.error(this.document.uuid);
    }
  }

  /**
   * Resolve the item from a control inside a `[data-item-id]` row.
   * @param {HTMLElement} target
   * @returns {Item|undefined}
   */
  static #itemFromTarget(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? this.document.items.get(id) : undefined;
  }

  /* -------------------------------------------- */
  /*  Lifecycle cleanup                           */
  /* -------------------------------------------- */

  /** @override */
  async close(options = {}) {
    if (this._itemHookRegistered) {
      Hooks.off("updateItem", this._itemUpdateHook);
      Hooks.off("createItem", this._itemCreateHook);
      Hooks.off("deleteItem", this._itemDeleteHook);
      this._itemHookRegistered = false;
    }
    return super.close(options);
  }
}
