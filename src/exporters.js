// Portfolio exporters — Excel (SheetJS) and PDF (jsPDF + autotable).
// Kept dependency-free of App.jsx (no shared imports) to avoid circular deps;
// formatting helpers are inlined here.
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const pct = (p) => (p >= 0 ? "+" : "") + (Number(p) * 100).toFixed(1) + "%";
const stamp = () => new Date().toISOString().slice(0, 10);

// `rows` are derived holdings: { sym, name, type, acct, acctName, sh, cost, price, ... }
function totals(rows) {
  const value = rows.reduce((s, r) => s + r.sh * r.price, 0);
  const cost = rows.reduce((s, r) => s + r.sh * r.cost, 0);
  return { value, cost, pnl: value - cost, ret: cost ? (value - cost) / cost : 0 };
}

export function exportPortfolioExcel(rows) {
  const HEADERS = [
    "Symbol", "Name", "Type", "Account",
    "Shares", "Cost / Share", "Price",
    "Cost Basis", "Market Value", "Unrealized P&L", "Return %",
  ];

  const data = rows.map((r) => {
    const value = r.sh * r.price;
    const cost  = r.sh * r.cost;
    return {
      Symbol:            r.sym,
      Name:              r.name,
      Type:              r.type,
      Account:           r.acctName || r.acct || "",
      Shares:            r.sh,
      "Cost / Share":    +(+r.cost).toFixed(2),
      Price:             +(+r.price).toFixed(2),
      "Cost Basis":      +cost.toFixed(2),
      "Market Value":    +value.toFixed(2),
      "Unrealized P&L":  +(value - cost).toFixed(2),
      "Return %":        +(((r.price - r.cost) / r.cost) * 100).toFixed(2),
    };
  });

  let ws;
  if (data.length === 0) {
    // Empty portfolio — write headers-only template so the user knows the import format
    ws = XLSX.utils.aoa_to_sheet([HEADERS]);
    // Add a sample row in grey to make the format obvious
    XLSX.utils.sheet_add_aoa(ws, [
      ["RELIANCE", "Reliance Industries", "Stock", "Zerodha", 10, 2400, 2550, 24000, 25500, 1500, 6.25],
    ], { origin: "A2" });
  } else {
    ws = XLSX.utils.json_to_sheet(data);
    const t = totals(rows);
    XLSX.utils.sheet_add_aoa(
      ws,
      [["", "", "", "", "", "", "Total",
        +t.cost.toFixed(2), +t.value.toFixed(2), +t.pnl.toFixed(2), +(t.ret * 100).toFixed(2)]],
      { origin: -1 }
    );
  }

  ws["!cols"] = [
    { wch: 10 }, { wch: 28 }, { wch: 9 }, { wch: 20 }, { wch: 9 },
    { wch: 12 }, { wch: 11 }, { wch: 13 }, { wch: 14 }, { wch: 15 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, rows.length === 0 ? "Template" : "Portfolio");
  XLSX.writeFile(wb, rows.length === 0
    ? `investorcircle_portfolio_template.xlsx`
    : `investorcircle_portfolio_${stamp()}.xlsx`
  );
}

export function exportPortfolioPDF(rows) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const t = totals(rows);

  doc.setFontSize(18);
  doc.setTextColor(19, 20, 43);
  doc.text("InvestorCircle — Portfolio", 40, 42);

  doc.setFontSize(10);
  doc.setTextColor(141, 144, 173);
  doc.text(
    `Generated ${new Date().toLocaleString()}   ·   ${rows.length} holdings   ·   Total ${money(t.value)}   ·   P&L ${money(t.pnl)} (${pct(t.ret)})`,
    40,
    60
  );

  autoTable(doc, {
    startY: 78,
    head: [["Symbol", "Name", "Type", "Account", "Shares", "Cost", "Price", "Market Value", "P&L", "Return"]],
    body: rows.map((r) => {
      const value = r.sh * r.price;
      const cost = r.sh * r.cost;
      return [
        r.sym, r.name, r.type, r.acctName || r.acct || "",
        String(r.sh), money(r.cost), money(r.price), money(value), money(value - cost),
        pct((r.price - r.cost) / r.cost),
      ];
    }),
    foot: [["", "", "", "", "", "", "Total", money(t.value), money(t.pnl), pct(t.ret)]],
    styles: { fontSize: 9, cellPadding: 5, lineColor: [235, 235, 245], lineWidth: 0.5 },
    headStyles: { fillColor: [109, 93, 245], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [245, 245, 251], textColor: [19, 20, 43], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 253] },
    columnStyles: {
      4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
      7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
    },
  });

  doc.save(`investorcircle_portfolio_${stamp()}.pdf`);
}
