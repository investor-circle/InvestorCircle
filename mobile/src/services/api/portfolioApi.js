import { callApi } from "../api";

/** The caller's manual portfolio holdings. */
export async function getPortfolioHoldings() {
  const api = await callApi("/data?resource=lookups&action=portfolio-list");
  return api.ok ? api.data.holdings || [] : [];
}

/** Add one holding. `holding` is normalized server-side (holdingFields). */
export async function addPortfolioHolding(holding) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "portfolio-add", holding },
  });
  return api.ok;
}

/** Delete one holding by id. */
export async function deletePortfolioHolding(id) {
  const api = await callApi("/data?resource=lookups", {
    method: "POST",
    body: { action: "portfolio-delete", id },
  });
  return api.ok;
}
