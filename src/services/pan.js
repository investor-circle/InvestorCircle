// Pull portfolio holdings by PAN — MOCK service.
//
// This demo resolves a few hard-coded PANs after a short delay. In production you
// would NOT fetch holdings from a PAN directly; you'd use a consent-based pipe:
//
//   • India — Account Aggregator (AA) framework (RBI). The user grants consent via
//     an AA (e.g. Finvu, OneMoney) and a TSP/aggregator (Setu, Finbox, Dashboro)
//     returns demat + mutual-fund holdings. PAN is one identifier in the consent
//     handshake, not a lookup key on its own.
//   • CAS (Consolidated Account Statement) from NSDL/CDSL, or CAMS/KFintech for MFs,
//     fetched with explicit user authorization.
//
// Compliance notes for a real build:
//   • Never store PAN unencrypted; collect only with explicit consent and a clear
//     purpose; honor data-deletion requests.
//   • Be careful displaying/holding others' performance — see SEBI rules on
//     performance/return claims and investment advice by unregistered persons.
//
// This file keeps everything in memory and ships no real network calls.

export const isValidPAN = (pan) =>
  /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(pan || "").toUpperCase().trim());

const MOCK = {
  ABCDE1234F: [
    { sym: "RELIANCE", name: "Reliance Industries", type: "Stock", sh: 25, cost: 2450, price: 2980 },
    { sym: "TCS", name: "Tata Consultancy Services", type: "Stock", sh: 12, cost: 3300, price: 3890 },
    { sym: "INFY", name: "Infosys", type: "Stock", sh: 40, cost: 1420, price: 1610 },
    { sym: "NIFTYBEES", name: "Nippon India ETF Nifty 50", type: "ETF", sh: 150, cost: 230, price: 268 },
    { sym: "PPFAS", name: "Parag Parikh Flexi Cap Fund", type: "Fund", sh: 520, cost: 62, price: 81 },
  ],
  AAAPZ1234C: [
    { sym: "HDFCBANK", name: "HDFC Bank", type: "Stock", sh: 30, cost: 1480, price: 1705 },
    { sym: "ICICIBANK", name: "ICICI Bank", type: "Stock", sh: 22, cost: 980, price: 1240 },
    { sym: "GOLDBEES", name: "Nippon India ETF Gold BeES", type: "ETF", sh: 300, cost: 58, price: 71 },
  ],
};

const GENERIC = [
  { sym: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", sh: 10, cost: 380, price: 545 },
  { sym: "AAPL", name: "Apple Inc.", type: "Stock", sh: 8, cost: 150, price: 213 },
];

export function fetchHoldingsByPAN(pan, { delay = 900 } = {}) {
  return new Promise((resolve, reject) => {
    const key = String(pan || "").toUpperCase().trim();
    if (!isValidPAN(key)) {
      reject(new Error("Invalid PAN. Expected 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)."));
      return;
    }
    setTimeout(() => {
      const list = MOCK[key] || GENERIC;
      resolve(
        list.map((h, i) => ({
          ...h,
          id: "pan" + Date.now() + "_" + i,
          acct: "pan",
          acctName: "Linked via PAN",
        }))
      );
    }, delay);
  });
}
