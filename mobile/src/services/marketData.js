import { API_ORIGIN } from "./api";

/**
 * Live market price, via the same /api/price proxy the web app uses.
 *
 * WHY THIS EXISTS: when an author signals an exit, the price at that moment
 * is stamped onto the idea and becomes its final, frozen result — the number
 * the track record and the ICI score are computed from. The web fetches that
 * price and sends it with the exit (marketData.js -> getTodayClose).
 *
 * Mobile did not, and sent no price at all. The server stores what it is
 * given, so an idea exited from the phone recorded exit_price = NULL, and the
 * displayed return then fell back to the CURRENT price — meaning a closed
 * idea's "final" result kept drifting with the market instead of being fixed
 * at the moment the author called it. A comment in the exit handler claimed
 * the server stamped the price itself; it does not.
 *
 * The endpoint is a plain proxy (no auth, no token): the browser never talks
 * to Yahoo or the NSE directly, so provider keys stay server-side.
 */

const TIMEOUT_MS = 10000;

/**
 * Today's close for one symbol.
 * @returns { price, currency, date, source, symbol } or null — never throws.
 *
 * Null is a legitimate answer, not an error: the web shows "Price
 * unavailable — will not be stamped" and still lets the exit through, so the
 * exit is never blocked by a price lookup.
 */
export async function getTodayClose(symbol, exchange = "NSE") {
  const sym = String(symbol || "").trim();
  if (!sym) return null;

  const url =
    `${API_ORIGIN}/api/price?symbol=${encodeURIComponent(sym)}` +
    `&exchange=${encodeURIComponent(exchange || "NSE")}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error || data.price == null) return null;
    return data;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Human-readable label for a price source. Mirrors the web's sourceName(). */
export function sourceName(source) {
  return (
    {
      nse_bhavcopy: "NSE Official (Bhavcopy)",
      yahoo_finance: "Yahoo Finance",
      twelve_data: "Twelve Data",
      manual: "Manual entry",
      unavailable: "Source unavailable",
    }[source] || source || "—"
  );
}
