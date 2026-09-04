// Ephemeral hand-off cache so tapping a reco card can open the detail screen
// instantly from data already in memory — no extra round-trip (the list
// already fetched the full reco). The detail screen reads by id and can fall
// back to its own fetch if the entry is missing (e.g. deep link / cold open).
const store = new Map();

export function putReco(reco) {
  if (reco && reco.id != null) store.set(String(reco.id), reco);
}

export function getReco(id) {
  return store.get(String(id)) || null;
}
