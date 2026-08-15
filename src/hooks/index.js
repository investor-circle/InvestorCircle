import React, { useState, useMemo, useEffect } from "react";
import { ACCOUNTS } from "../constants/app";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width:768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width:768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

/* =================================================================== */

export function useDerivedHoldings(holdings, includeCrypto = true) {
  return useMemo(()=>{
    const rows = holdings.filter(h=>includeCrypto || h.type!=="Crypto").map(h=>{
      const value=h.sh*h.price, costTot=h.sh*h.cost, pnl=value-costTot;
      return { ...h, value, costTot, pnl, pnlPct: pnl/costTot, acctName: ACCOUNTS.find(a=>a.id===h.acct)?.name || h.acctName || "—" };
    });
    const total=rows.reduce((s,r)=>s+r.value,0), cost=rows.reduce((s,r)=>s+r.costTot,0);
    return { rows, total, cost, pnl: total-cost, pnlPct:(total-cost)/cost };
  },[holdings,includeCrypto]);
}
