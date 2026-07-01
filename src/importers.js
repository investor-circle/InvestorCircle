// Portfolio importers — Excel/CSV via SheetJS, PDF via pdfjs-dist (best-effort).
// Returns { holdings, warnings, ... }. Holdings use acct:"import" so the app's
// account-name lookup falls back to the `acctName` we set here.
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
// Vite resolves the worker file to a URL we can hand to pdf.js.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const num = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  const n = parseFloat(String(v).replace(/[$,%\s]/g, ""));
  return isNaN(n) ? NaN : n;
};

// case-insensitive fuzzy column pick
const pick = (obj, candidates) => {
  for (const key of Object.keys(obj)) {
    const k = key.toLowerCase().trim();
    if (candidates.some((c) => k === c || k.includes(c))) return obj[key];
  }
  return undefined;
};

const normalizeType = (t) => {
  const s = String(t || "").toLowerCase();
  if (s.includes("etf")) return "ETF";
  if (s.includes("fund") || s.includes("mutual")) return "Fund";
  if (s.includes("crypto") || s.includes("coin") || s.includes("btc") || s.includes("eth")) return "Crypto";
  return "Stock";
};

function rowToHolding(obj, i, source) {
  const sym = pick(obj, ["symbol", "ticker", "sym", "scrip"]);
  const name = pick(obj, ["name", "security", "description", "company", "instrument"]);
  const sh = num(pick(obj, ["shares", "qty", "quantity", "units", "holding"]));
  const cost = num(pick(obj, ["cost", "avg cost", "cost/share", "buy price", "average", "cost basis", "purchase"]));
  const price = num(pick(obj, ["price", "last", "market price", "current", "ltp", "nav"]));
  const type = pick(obj, ["type", "asset type", "class", "category"]);

  if (!sym && !name) return null;
  if (isNaN(sh) || isNaN(price)) return null;

  return {
    id: "imp" + Date.now() + "_" + i,
    sym: String(sym || name || "ROW" + i).toUpperCase().slice(0, 10),
    name: String(name || sym || "Imported holding"),
    type: normalizeType(type),
    acct: "import",
    acctName: source || "Imported",
    sh,
    cost: isNaN(cost) ? price : cost,
    price,
  };
}

export async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { defval: null });
  const holdings = json.map((r, i) => rowToHolding(r, i, "Imported (file)")).filter(Boolean);
  return {
    holdings,
    rawRows: json.length,
    warnings: holdings.length
      ? []
      : ["No rows could be mapped. Expected columns like Symbol/Ticker, Shares/Quantity, Cost, Price."],
  };
}

export async function parsePDF(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // group text items into visual lines by rounded y-position
    const byY = {};
    content.items.forEach((it) => {
      const y = Math.round(it.transform[5]);
      (byY[y] = byY[y] || []).push(it.str);
    });
    Object.keys(byY)
      .sort((a, b) => b - a)
      .forEach((y) => lines.push(byY[y].join(" ").replace(/\s+/g, " ").trim()));
  }

  // best-effort: SYMBOL ... qty cost price  (last 3 numbers on a line)
  const re = /^([A-Za-z][A-Za-z0-9.\-&]{0,11})\b.*?(\d[\d,]*\.?\d*)\s+\$?(\d[\d,]*\.?\d*)\s+\$?(\d[\d,]*\.?\d*)\s*$/;
  const holdings = [];
  lines.forEach((ln, i) => {
    const m = ln.match(re);
    if (!m) return;
    const sh = num(m[2]);
    const cost = num(m[3]);
    const price = num(m[4]);
    if (isNaN(sh) || isNaN(price)) return;
    holdings.push({
      id: "imp" + Date.now() + "_" + i,
      sym: m[1].toUpperCase(),
      name: m[1].toUpperCase(),
      type: "Stock",
      acct: "import",
      acctName: "Imported (PDF)",
      sh,
      cost: isNaN(cost) ? price : cost,
      price,
    });
  });

  return {
    holdings,
    lines,
    warnings: holdings.length
      ? ["PDF parsing is best-effort — please review the extracted rows before importing."]
      : [
          "Couldn't confidently extract holdings from this PDF. PDF layouts vary widely; Excel/CSV import is far more reliable.",
        ],
  };
}

export async function parsePortfolioFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return parsePDF(file);
  if (["xlsx", "xls", "csv", "tsv"].includes(ext)) return parseSpreadsheet(file);
  // try spreadsheet as a fallback
  return parseSpreadsheet(file);
}
