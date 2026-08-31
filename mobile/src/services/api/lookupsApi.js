import { callApi } from "../api";

/**
 * The active instrument master — the same list behind the web app's new-idea
 * autocomplete and Add Holding search (lookups action=instruments-list).
 * Rows: { symbol, name, exchange, type, asset_class, currency, sector }.
 */
export async function getInstrumentsList() {
  const api = await callApi("/data?resource=lookups&action=instruments-list");
  return api.ok ? api.data.instruments || [] : [];
}

/** Sector options from sector_master. Empty list is a valid, expected answer. */
export async function getSectors() {
  const api = await callApi("/data?resource=lookups&action=sectors");
  return api.ok ? api.data.sectors || [] : [];
}
