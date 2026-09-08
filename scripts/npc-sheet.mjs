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
      traitAdd: CypherNpcEleganceSheet.#onTraitAdd,
      traitDelete: CypherNpcEleganceSheet.#onTraitDelete,
      copyUuid: CypherNpcEleganceSheet.#onCopyUuid
    }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "CNE.Tabs.Main", icon: "fa-solid fa-id-card" },
        { id: "persona", label: "CNE.Tabs.Persona", icon: "fa-solid fa-masks-theater" },
        { id: "action", label: "CNE.Tabs.Action", icon: "fa-solid fa-burst" },
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
    main: {
      template: `${MODULE_PATH}/templates/tab-main.hbs`,
      container: { id: "cne-tab-body", classes: ["cne-tab-body"] },
      scrollable: [""]
    },
    persona: {
      template: `${MODULE_PATH}/templates/tab-persona.hbs`,
      container: { id: "cne-tab-body", classes: ["cne-tab-body"] },
      scrollable: [""]
    },
    action: {
      template: `${MODULE_PATH}/templates/tab-action.hbs`,
      container: { id: "cne-tab-body", classes: ["cne-tab-body"] },
      scrollable: [""]
    },
    combat: {
      template: `${MODULE_PATH}/templates/tab-combat.hbs`,
      container: { id: "cne-tab-body", classes: ["cne-tab-body"] },
      scrollable: [""]
    },
    equipment: {
      template: `${MODULE_PATH}/templates/tab-equipment.hbs`,
      container: { id: "cne-tab-body", classes: ["cne-tab-body"] },
      scrollable: [""]
    },
    info: {
      template: `${MODULE_PATH}/templates/tab-info.hbs`,
      container: { id: "cne-tab-body", classes: ["cne-tab-body"] },
      scrollable: [""]
    },
    settings: {
      template: `${MODULE_PATH}/templates/tab-settings.hbs`,
      container: { id: "cne-tab-body", classes: ["cne-tab-body"] },
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
      demeanorChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Demeanor", ["Calm", "Friendly", "Nervous", "Aggressive", "Aloof", "Curious", "Menacing"]),
      fitChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Fit", ["Cover", "Contain", "Fill"]),
      orientationChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Orientation", ["Normal", "FlipH", "FlipV", "FlipBoth"]),
      alignChoices: CypherNpcEleganceSheet.#choices("CNE.Choices.Align", ["Center", "Top", "Bottom", "Left", "Right"]),

      // Roleplay traits, annotated with their array index for form binding.
      traits: (flags.traits ?? []).map((trait, index) => ({ ...trait, index }))
    });

    // Limited users (non-owners) only ever see the MAIN tab (portrait, name).
    if (actor.limited && !actor.isOwner) {
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

    // Store context for on-demand tab rendering.
    this._sheetContext = context;

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    try {
      context = await super._preparePartContext(partId, context, options);
      if (partId in (context.tabs ?? {})) {
        context.tab = context.tabs[partId];
      }
    } catch (err) {
      console.error(`[${MODULE_ID}] Error preparing part context for "${partId}":`, err);
    }
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
   * Group the actor's items by sheet section, sorted by name.
   * Archived items are excluded (they are intentionally filed away).
   * @returns {Record<string, object[]>}
   */
  _prepareItemGroups() {
    const groups = {};
    for (const key of Object.values(ITEM_GROUP_BY_TYPE)) groups[key] = [];

    for (const item of this.document.items) {
      if (CypherAdapter.isArchived(item)) continue;
      const group = ITEM_GROUP_BY_TYPE[item.type];
      if (!group) continue;
      groups[group].push(this.#prepareItemRow(item));
    }
    for (const items of Object.values(groups)) {
      items.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
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
   */
  #prepareItemRow(item) {
    const basic = CypherAdapter.getItemBasic(item);
    let detail = "";
    switch (item.type) {
      case "attack": {
        const parts = [];
        if (basic.type) parts.push(basic.type);
        parts.push(`${game.i18n.localize("CNE.Items.Damage")} ${basic.damage ?? 0}`);
        detail = parts.join(" · ");
        break;
      }
      case "armor": {
        const parts = [];
        if (basic.type) parts.push(basic.type);
        parts.push(`+${basic.rating ?? 0}`);
        detail = parts.join(" · ");
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
    return { id: item.id, name: item.name, img: item.img, type: item.type, detail };
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    try {
      await super._onRender(context, options);
    } catch (err) {
      console.error(`[${MODULE_ID}] Error in super._onRender:`, err);
    }

    // Render ALL tab content into the shared container.
    // ApplicationV2's default part rendering overwrites the shared container
    // for each tab, so only the last one survives. We fix this by rendering
    // every tab directly and appending to the container.
    const container = this.element.querySelector('#cne-tab-body');
    if (container && this._sheetContext) {
      const tabGroupId = "primary";
      const activeTab = this.tabGroups?.[tabGroupId] ?? this.constructor.TABS[tabGroupId]?.initial ?? "main";

      for (const tab of this.constructor.TABS[tabGroupId].tabs) {
        if (tab.id === 'rail') continue;
        let existing = container.querySelector(`[data-tab="${tab.id}"]`);
        if (!existing) {
          try {
            const part = this.constructor.PARTS[tab.id];
            if (part?.template) {
              const tabContext = await this._preparePartContext(tab.id, foundry.utils.deepClone(this._sheetContext), {});
              const html = await renderTemplate(part.template, tabContext);
              const wrapper = document.createElement('div');
              wrapper.innerHTML = html.trim();
              const section = wrapper.firstElementChild;
              if (section) {
                section.classList.toggle('active', tab.id === activeTab);
                container.appendChild(section);
              }
            }
          } catch (err) {
            console.error(`[${MODULE_ID}] Failed to render tab "${tab.id}" on open:`, err);
          }
        }
      }
    }

    // Monster type: swap the whole window to the red/black/silver theme.
    this.element.classList.toggle("cne-monster", context?.isMonster === true);

    // Non-editors get a fully read-only sheet (tab rail stays interactive).
    if (!this.isEditable) {
      const fields = this.element.querySelectorAll(
        ".cne-tab-body input, .cne-tab-body select, .cne-tab-body textarea, .cne-tab-body button"
      );
      for (const field of fields) field.disabled = true;
    }
  }

  /**
   * Override changeTab to render tab content on demand.
   * Because all tab parts share the same container (#cne-tab-body),
   * only the last-rendered part is in the DOM. When switching tabs,
   * we compile the template directly and append it to the container.
   * @override
   */
  async changeTab(tab, group, options={}) {
    let tabContent = this.element.querySelector(`[data-group="${group}"][data-tab="${tab}"]`);
    if (!tabContent && this._sheetContext) {
      try {
        const part = this.constructor.PARTS[tab];
        if (part?.template) {
          const tabContext = await this._preparePartContext(tab, foundry.utils.deepClone(this._sheetContext), {});
          const html = await renderTemplate(part.template, tabContext);
          const container = this.element.querySelector('#cne-tab-body');
          if (container) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html.trim();
            const section = wrapper.firstElementChild;
            if (section) {
              section.classList.remove('active');
              container.appendChild(section);
              tabContent = section;
            }
          }
        }
      } catch (err) {
        console.error(`[${MODULE_ID}] Failed to render tab "${tab}" on demand:`, err);
      }
    }
    return super.changeTab(tab, group, options);
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
    const isForeign = item.parent !== this.document;
    if (isForeign && PC_ONLY_ITEM_TYPES.includes(item.type)) {
      ui.notifications.warn(game.i18n.localize("CNE.Warnings.ItemTypeBlocked"));
      return null;
    }
    return super._onDropItem(event, item);
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
    created?.sheet.render(true);
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
   * Append an empty roleplay trait (stored under module flags).
   * @this {CypherNpcEleganceSheet}
   */
  static async #onTraitAdd(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const traits = foundry.utils.deepClone(this.document.flags?.[MODULE_ID]?.traits ?? []);
    traits.push({ name: "", advice: "" });
    await this.document.update({ [`flags.${MODULE_ID}.traits`]: traits });
  }

  /**
   * Delete a roleplay trait after confirmation (destructive action).
   * @this {CypherNpcEleganceSheet}
   */
  static async #onTraitDelete(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const index = Number(target.closest("[data-trait-index]")?.dataset.traitIndex);
    const traits = foundry.utils.deepClone(this.document.flags?.[MODULE_ID]?.traits ?? []);
    if (!Number.isInteger(index) || !traits[index]) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CNE.Traits.DeleteTitle") },
      content: `<p>${game.i18n.format("CNE.Traits.DeleteConfirm", {
        name: foundry.utils.escapeHTML(traits[index].name || game.i18n.localize("CNE.Traits.Unnamed"))
      })}</p>`,
      modal: true,
      rejectClose: false
    });
    if (!confirmed) return;
    traits.splice(index, 1);
    await this.document.update({ [`flags.${MODULE_ID}.traits`]: traits });
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
}
