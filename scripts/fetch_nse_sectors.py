"""
fetch_nse_sectors.py
--------------------
Fetches sector classifications for all NSE-listed equities using
NSE's sectoral index APIs. Produces a CSV with columns:
  symbol, sector

Usage:
  pip install requests pandas
  python fetch_nse_sectors.py

Output:
  nse_sectors.csv  — upload this via Admin → Instruments → Upload
                     (the uploader reads a 'sector' column automatically)

Upload format for the bulk uploader:
  symbol, name, exchange, asset_class, currency, sector
  RELIANCE, Reliance Industries, NSE, Equity, INR, Energy

Strategy:
  1. Pull constituents of each NSE sectoral index (NIFTY IT, NIFTY BANK, etc.)
  2. Map each symbol → sector
  3. For symbols not covered by any index, assign "Others"
  4. Save as CSV ready for the InvestorCircle uploader
"""

import requests
import pandas as pd
import time
import json

# Map of InvestorCircle sector name → NSE index name
SECTOR_INDEX_MAP = {
    "Technology":          "NIFTY IT",
    "Banking & Finance":   "NIFTY BANK",
    "Pharmaceuticals":     "NIFTY PHARMA",
    "FMCG":                "NIFTY FMCG",
    "Automobiles":         "NIFTY AUTO",
    "Energy":              "NIFTY ENERGY",
    "Metals & Mining":     "NIFTY METAL",
    "Real Estate":         "NIFTY REALTY",
    "Infrastructure":      "NIFTY INFRA",
    "Healthcare":          "NIFTY HEALTHCARE INDEX",
    "Financial Services":  "NIFTY FINANCIAL SERVICES",
    "Capital Goods":       "NIFTY INDIA MANUFACTURING",
    "Media":               "NIFTY INDIA DIGITAL",
    "Chemicals":           "NIFTY CHEMICALS",
    "Defence":             "NIFTY INDIA DEFENCE",
    "PSU":                 "NIFTY PSU BANK",
    "Telecom":             "NIFTY INDIA CONSUMPTION",
}

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://www.nseindia.com/",
}

def get_session():
    """NSE requires a valid session cookie from the homepage first."""
    session = requests.Session()
    print("Fetching NSE homepage to get session cookie...")
    session.get("https://www.nseindia.com", headers=HEADERS, timeout=15)
    time.sleep(2)
    return session

def fetch_index_constituents(session, index_name):
    """Returns list of symbols in the given NSE index."""
    url = f"https://www.nseindia.com/api/equity-stockIndices?index={index_name}"
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        symbols = [
            row["symbol"]
            for row in data.get("data", [])
            if row.get("symbol") and row["symbol"] != index_name
        ]
        return symbols
    except Exception as e:
        print(f"  ⚠ Failed for {index_name}: {e}")
        return []

def build_sector_map(session):
    sector_map = {}   # symbol → sector
    for sector, index_name in SECTOR_INDEX_MAP.items():
        print(f"  Fetching {index_name} → {sector}...")
        symbols = fetch_index_constituents(session, index_name)
        for sym in symbols:
            if sym not in sector_map:   # first match wins (most specific index)
                sector_map[sym] = sector
        print(f"    {len(symbols)} stocks, {len(sector_map)} unique so far")
        time.sleep(1.2)  # be polite to NSE API
    return sector_map

def merge_with_existing(sector_map, existing_csv_path=None):
    """
    Optional: if you already have an instruments CSV (from Zerodha/Kite),
    merge sector data into it for a ready-to-upload file.
    Pass existing_csv_path=None to just output the sector mapping.
    """
    if existing_csv_path:
        try:
            df = pd.read_csv(existing_csv_path)
            # Normalize column names
            df.columns = [c.lower().strip() for c in df.columns]
            sym_col = "tradingsymbol" if "tradingsymbol" in df.columns else "symbol"
            df["symbol"] = df[sym_col].str.strip().str.upper()
            df["sector"] = df["symbol"].map(sector_map)
            # Rename for custom uploader format
            if sym_col == "tradingsymbol":
                df = df.rename(columns={
                    "tradingsymbol": "symbol",
                    "instrument_type": "type",
                })
            df["asset_class"] = df.get("asset_class", df.get("type", "Equity")).replace({
                "EQ": "Equity", "ETF": "ETF", "MF": "Mutual Funds"
            })
            df["currency"] = df.get("currency", df.get("Currency", "INR")).fillna("INR")
            out = df[["symbol","name","exchange","asset_class","currency","sector"]].copy()
            out.to_csv("instruments_with_sectors.csv", index=False)
            print(f"\n✅ Merged file saved: instruments_with_sectors.csv")
            print(f"   {out['sector'].notna().sum()} of {len(out)} instruments have sector data")
            return out
        except Exception as e:
            print(f"Merge failed: {e}")

    # Just output the sector map
    df = pd.DataFrame(list(sector_map.items()), columns=["symbol", "sector"])
    df.to_csv("nse_sectors.csv", index=False)
    print(f"\n✅ Sector map saved: nse_sectors.csv ({len(df)} symbols)")
    return df

def main():
    print("=" * 60)
    print("NSE Sector Fetcher for InvestorCircle")
    print("=" * 60)

    session = get_session()
    print("\nFetching sector index constituents...")
    sector_map = build_sector_map(session)

    print(f"\nTotal symbols mapped: {len(sector_map)}")

    # If you have your Zerodha instruments CSV, pass the path here:
    # merge_with_existing(sector_map, "NSE.csv")

    # Otherwise just output the sector mapping:
    merge_with_existing(sector_map)

    print("\nSector distribution:")
    dist = {}
    for s in sector_map.values():
        dist[s] = dist.get(s, 0) + 1
    for sector, count in sorted(dist.items(), key=lambda x: -x[1]):
        print(f"  {sector:<30} {count} stocks")

    print("\nNext steps:")
    print("  1. If you have NSE.csv from Zerodha, re-run with:")
    print("     merge_with_existing(sector_map, 'NSE.csv')")
    print("     This produces instruments_with_sectors.csv ready to upload.")
    print("  2. Go to Admin → Instruments → Upload")
    print("  3. Upload nse_sectors.csv or instruments_with_sectors.csv")

if __name__ == "__main__":
    main()
