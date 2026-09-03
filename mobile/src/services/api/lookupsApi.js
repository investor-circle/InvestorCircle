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

/**
 * About Us — admin-authored rich text from app_settings (lookups
 * action=about-us). Returns an HTML string, or null when nothing has been
 * published yet, which is an ordinary state and not an error.
 *
 * The web hands this to dangerouslySetInnerHTML; the app has no such thing,
 * so it goes through parseHtmlBlocks() in src/utils/htmlText.js instead.
 */
export async function getAboutUsContent() {
  const api = await callApi("/data?resource=lookups&action=about-us");
  return api.ok ? api.data.html || null : null;
}

/**
 * Contact form submission (lookups action=contact-submit) — the same endpoint
 * and the same fields the web's Contact page posts. The server validates the
 * email, requires a subject and message, and rejects a category outside its
 * own list, so the categories offered on the phone must stay in step with
 * CONTACT_CATEGORIES in api/_lib/handlers/lookups.js.
 *
 * @returns null on success, or an error string to show.
 */
export async function submitContactForm({ name, email, subject, category, message }) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "contact-submit", name: name || null, email, subject, category: category || null, message },
  });
  if (api.ok) return null;
  return api.data?.error ? String(api.data.error) : "Could not send your message. Please try again.";
}
