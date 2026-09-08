/**
 * Cypher NPC Sheet
 * Entry point: settings, sheet registration, lifecycle hooks.
 */

import { MODULE_ID } from "./constants.mjs";
import { CypherNpcEleganceSheet } from "./npc-sheet.mjs";
import { CypherAdapter } from "./cypher-adapter.mjs";

/* -------------------------------------------- */
/*  Init: settings                              */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "defaultNpcSheet", {
    name: "CNE.Settings.DefaultSheet.Name",
    hint: "CNE.Settings.DefaultSheet.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

/* -------------------------------------------- */
/*  Setup: sheet registration                   */
/*  (setup so the world setting value is loaded  */
/*   and so we register after the system)       */
/* -------------------------------------------- */

Hooks.once("setup", () => {
  // Guard: this module only works with the Cypher System.
  if (game.system?.id !== CypherAdapter.systemId) {
    console.warn(`[${MODULE_ID}] ${game.i18n.localize("CNE.Warnings.WrongSystem")}`);
    return;
  }

  // Guard: ActorSheetV2 must exist (Foundry v14+).
  if (!foundry.applications?.sheets?.ActorSheetV2) {
    console.error(`[${MODULE_ID}] ActorSheetV2 is unavailable. This module requires Foundry VTT v14 or newer.`);
    return;
  }

  const makeDefault = game.settings.get(MODULE_ID, "defaultNpcSheet");

  // The system sheet stays registered and selectable; this module simply
  // adds its own sheet (optionally the new default for NPCs).
  foundry.documents.collections.Actors.registerSheet(MODULE_ID, CypherNpcEleganceSheet, {
    types: ["npc"],
    makeDefault,
    label: "CNE.Sheet.Label"
  });

  console.log(`[${MODULE_ID}] NPC sheet registered (default: ${makeDefault}).`);
});
