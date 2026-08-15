import {
  getInstrumentsList as dbGetInstrumentsList,
  getSectors as dbGetSectors
} from "../services/api/lookupsApi";
import { FALLBACK_SECTORS } from "../constants/app";

export let _instrCache = null;

export let _instrLoadPromise = null;

export async function loadInstruments() {
  if (_instrCache) return _instrCache;
  if (_instrLoadPromise) return _instrLoadPromise;
  _instrLoadPromise = dbGetInstrumentsList()
    .then(rows => { _instrCache = rows; return rows; })
    .catch(() => { _instrCache = []; return []; });
  return _instrLoadPromise;
}

export function clearInstrCache() { _instrCache = null; _instrLoadPromise = null; }

// Sector options cache — mirrors loadInstruments pattern exactly.

export let _sectorCache = null;

export let _sectorLoadPromise = null;

export function loadSectorOpts() {
  if (_sectorCache)       return Promise.resolve(_sectorCache);
  if (_sectorLoadPromise) return _sectorLoadPromise;
  _sectorLoadPromise = dbGetSectors()
    .then(sectors => {
      _sectorCache = sectors.length ? sectors : FALLBACK_SECTORS;
      return _sectorCache;
    })
    .catch(() => {
      _sectorLoadPromise = null;   // allow retry on next open
      return FALLBACK_SECTORS;
    });
  return _sectorLoadPromise;
}

export function clearSectorCache() { _sectorCache = null; _sectorLoadPromise = null; }
