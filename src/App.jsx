import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Home, PieChart, Users, Lightbulb, Shield, Search, Bell, Settings,
  Lock, Eye, EyeOff, TrendingUp, TrendingDown, Plus, X, Check, Send,
  UserCog, Layers, Wallet, ArrowUpRight, ArrowDownRight, MessageSquare,
  Bookmark, ChevronRight, ChevronDown, ChevronsUpDown, Sparkles, ArrowUpDown,
  List, Table as TableIcon, Mail, UserPlus, Calendar, Crown,
  ThumbsUp, ThumbsDown, Trash2, LogOut, AlertTriangle, Filter,
  Download, Upload, CreditCard, Share2, Forward, FileSpreadsheet, FileText, Loader, RefreshCw, Pencil, Database
} from "lucide-react";
import { exportPortfolioExcel, exportPortfolioPDF } from "./exporters";
import { parsePortfolioFile } from "./importers";
import * as XLSX from "xlsx";
import { fetchHoldingsByPAN, isValidPAN } from "./services/pan";
import { fetchLivePrices, isFinnhubConfigured } from "./services/priceService";
import { useAuth } from "./AuthContext";
import { sql } from "./supabaseClient";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { secondaryAuth } from "./firebase";
import LoginPage from "./LoginPage";
import {
  getMyConnections, sendConnectionRequest, acceptConnection, rejectConnection, removeConnection,
  getMyGroups, createGroup as dbCreateGroup, renameGroup as dbRenameGroup,
  deleteGroup as dbDeleteGroup, exitGroup as dbExitGroup,
  addGroupMembers as dbAddGroupMembers, removeGroupMember as dbRemoveGroupMember,
  getMyReceivedRecos, getMyMadeRecos, createRecommendation as dbCreateReco,
  updateDelivery, toggleExitSignal as dbToggleExit, forwardRecommendation as dbForwardReco,
  getMyNotifications, markNotifRead, markAllNotifRead,
  getSharingPrefs, upsertSharingPref,
} from "./db";

/* ============================================================
   InvestorCircle — social space for investors.
   Palette: deep navy sidebar, indigo→violet→magenta gradient,
   light content; green/red only for gains/losses.
   Single-file React artifact. All data is mock / in-memory.
   ============================================================ */

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
:root{
  --bg:#f5f5fb; --surface:#ffffff; --surface-2:#f1f1f8;
  --ink:#13142b; --ink-soft:#565a78; --muted:#8d90ad;
  --line:#e9e9f2; --line-2:#dddcec;
  --accent:#6d5df5; --accent-ink:#5a49e6; --accent-soft:#eeecff; --accent-line:#dcd8fb;
  --grad:linear-gradient(135deg,#6d5df5 0%,#9a55ee 55%,#cf52d8 100%);
  --side:#0a0b18; --side-2:#11132a; --side-line:#23253f; --side-text:#a7abc6; --side-dim:#6d7196;
  --gain:#15924e; --gain-soft:#e6f4ec; --loss:#c2453d; --loss-soft:#f8eae8;
  --r:16px; --shadow:0 1px 2px rgba(20,20,50,.04), 0 6px 18px rgba(20,20,50,.05);
  --font:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif; --serif:'Fraunces',Georgia,serif;
}
*{box-sizing:border-box;}
.app{font-family:var(--font);color:var(--ink);background:var(--bg);min-height:100vh;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum";}
.app button,.app input,.app select,.app textarea{font-family:var(--font);}
.tnum{font-variant-numeric:tabular-nums;}
.pos{color:var(--gain);} .neg{color:var(--loss);}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px;}

.shell{display:flex;min-height:100vh;}
.sidebar{width:256px;flex-shrink:0;background:var(--side);color:#fff;display:flex;flex-direction:column;padding:18px 14px;}
.brand{display:flex;align-items:center;gap:12px;padding:6px 8px 16px;}
.brand .mark{width:42px;height:42px;border-radius:13px;background:var(--grad);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;letter-spacing:-1px;box-shadow:0 6px 18px rgba(124,92,252,.45);}
.brand .nm{font-weight:800;font-size:18px;letter-spacing:-.4px;line-height:1.1;}
.brand .tag{font-size:10px;letter-spacing:1.4px;color:var(--side-dim);text-transform:uppercase;margin-top:2px;}
.viewing{background:var(--grad);border-radius:15px;padding:13px 14px;display:flex;align-items:center;gap:11px;cursor:pointer;box-shadow:0 8px 22px rgba(124,92,252,.4);margin-bottom:18px;transition:.15s;}
.viewing:hover{filter:brightness(1.06);}
.viewing .ava{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;}
.viewing .vs{font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:rgba(255,255,255,.78);}
.viewing .role{font-size:16px;font-weight:700;line-height:1.1;}
.side-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--side-dim);padding:4px 12px 8px;}
.nav-item{display:flex;align-items:center;gap:13px;padding:12px 13px;border-radius:12px;font-size:14.5px;font-weight:600;color:var(--side-text);cursor:pointer;margin-bottom:3px;border:1px solid transparent;transition:.12s;}
.nav-item svg{color:var(--side-dim);}
.nav-item:hover{background:rgba(255,255,255,.045);color:#fff;}
.nav-item:hover svg{color:#cfd2ee;}
.nav-item.active{background:rgba(124,92,252,.16);border-color:rgba(124,92,252,.45);color:#fff;box-shadow:0 8px 20px rgba(124,92,252,.12);}
.nav-item.active svg{color:#b6a9ff;}
.nav-badge{margin-left:auto;background:var(--grad);color:#fff;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;}
.side-foot{margin-top:auto;padding-top:14px;border-top:1px solid var(--side-line);}
.side-stat{display:flex;justify-content:space-between;padding:7px 12px;font-size:13px;color:var(--side-dim);}
.side-stat b{color:#fff;font-weight:700;}

.main{flex:1;display:flex;flex-direction:column;min-width:0;}
.topbar{height:64px;background:rgba(245,245,251,.8);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 26px;position:sticky;top:0;z-index:30;}
.searchbox{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:9px 14px;}
.searchbox input{border:none;outline:none;background:transparent;font-size:13.5px;width:100%;}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.icon-btn{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);display:flex;align-items:center;justify-content:center;cursor:pointer;}
.icon-btn:hover{background:var(--surface-2);}
.avatar-pill{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:5px 8px 5px 6px;}
.avatar-pill .gava{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px;}

.content{padding:28px 30px;max-width:1280px;}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px;gap:16px;flex-wrap:wrap;}
.eyebrow{font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent);margin-bottom:6px;}
.page-title{font-size:26px;font-weight:800;letter-spacing:-.6px;}
.page-sub{font-size:14px;color:var(--muted);margin-top:4px;}

.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;}
.card.lift{transition:transform .15s, box-shadow .15s;}
.card.lift:hover{transform:translateY(-2px);box-shadow:0 8px 26px rgba(20,20,50,.1);}
.card-head{padding:15px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:700;}
.card-body{padding:18px;}

.hero-grad{background:var(--grad);border-radius:22px;padding:26px 28px;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:18px;box-shadow:0 14px 36px rgba(124,92,252,.32);}
.hero-grad .lbl{font-size:13px;font-weight:600;color:rgba(255,255,255,.82);margin-bottom:8px;}
.balance{font-family:var(--serif);font-size:46px;font-weight:600;letter-spacing:-1px;line-height:1;color:var(--ink);}
.hero-grad .balance{color:#fff;}
.delta-light{display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:14px;margin-top:12px;color:#fff;}
.delta{display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:14px;}

.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px;}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 17px;}
.kpi .lbl{font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px;}
.kpi .val{font-size:23px;font-weight:800;letter-spacing:-.5px;}
.kpi .sub{font-size:12px;font-weight:700;margin-top:3px;}

table.grid{width:100%;border-collapse:collapse;font-size:14px;}
.grid th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);padding:0 14px 11px;border-bottom:1px solid var(--line);}
.grid th.sortable{cursor:pointer;user-select:none;white-space:nowrap;}
.grid th.sortable:hover{color:var(--ink);}
.grid th .si{display:inline-flex;vertical-align:-2px;margin-left:4px;opacity:.55;}
.grid th.sorted .si{opacity:1;color:var(--accent);}
.grid td{padding:13px 14px;border-bottom:1px solid var(--line);vertical-align:middle;}
.grid tr:last-child td{border-bottom:none;}
.grid tbody tr.hoverable{transition:background .1s;}
.grid tbody tr.hoverable:hover td{background:var(--surface-2);}
.sym{font-weight:700;letter-spacing:-.2px;}
.muted{color:var(--muted);} .small{font-size:12px;}

.ttag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ink-soft);}
.dot{width:8px;height:8px;border-radius:3px;flex-shrink:0;}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--surface-2);color:var(--ink-soft);}
.pill.accent{background:var(--accent-soft);color:var(--accent-ink);}
.pill.gain{background:var(--gain-soft);color:var(--gain);}
.hl{display:inline-flex;align-items:center;gap:5px;background:var(--accent-soft);color:var(--accent-ink);border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;}
.hl.green{background:#ecfdf5;color:#15924e;}
.pill.loss{background:var(--loss-soft);color:var(--loss);}
.pill.amber{background:#fdf0dc;color:#9a6a16;}

.btn{border:none;border-radius:12px;font-size:13px;font-weight:700;padding:10px 16px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:.12s;}
.btn-pri{background:var(--grad);color:#fff;box-shadow:0 6px 16px rgba(124,92,252,.3);}
.btn-pri:hover{filter:brightness(1.06);}
.btn-ghost{background:var(--surface);border:1px solid var(--line-2);color:var(--ink);} .btn-ghost:hover{background:var(--surface-2);}
.btn-soft{background:var(--accent-soft);color:var(--accent-ink);} .btn-soft:hover{background:#e4e0ff;}
.btn-sm{padding:7px 12px;font-size:12px;border-radius:10px;}
.btn:disabled{background:var(--surface-2);color:var(--muted);cursor:not-allowed;border:1px solid var(--line);box-shadow:none;filter:none;}

.seg{display:inline-flex;background:var(--surface-2);border-radius:12px;padding:3px;gap:2px;}
.seg button{border:none;background:transparent;color:var(--muted);font-size:13px;font-weight:700;padding:8px 16px;border-radius:9px;cursor:pointer;display:flex;align-items:center;gap:7px;transition:.15s;}
.seg button:hover{color:var(--ink);}
.seg button.active{background:var(--surface);color:var(--accent-ink);box-shadow:0 1px 4px rgba(20,20,50,.12);}
.seg.tiny button{padding:6px 11px;font-size:12px;}

.av{border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0;letter-spacing:-.3px;}
.sw{width:44px;height:25px;border-radius:999px;background:var(--line-2);position:relative;cursor:pointer;transition:.15s;flex-shrink:0;}
.sw.on{background:var(--accent);}
.sw .knob{width:19px;height:19px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.28);}
.sw.on .knob{left:22px;}

.feed-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:18px;margin-bottom:14px;}
.feed-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;}
.feed-act{font-size:13px;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:600;}
.feed-act:hover{color:var(--ink);}

.chip{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line-2);color:var(--ink-soft);border-radius:999px;font-size:13px;font-weight:600;padding:6px 12px;cursor:pointer;transition:.12s;}
.chip:hover{border-color:var(--accent);color:var(--accent-ink);}
.chip.sel{background:var(--grad);border-color:transparent;color:#fff;}
.chip.mini{font-size:11px;padding:3px 9px;cursor:default;}
.chip.mini:hover{border-color:var(--line-2);color:var(--ink-soft);}

.overlay{position:fixed;inset:0;background:rgba(13,14,30,.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;}
.modal{background:var(--surface);border-radius:20px;width:560px;max-width:100%;max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.32);}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 14px;}
.modal-head h3{margin:0;font-size:19px;font-weight:800;letter-spacing:-.4px;}
.modal-body{padding:6px 22px 18px;}
.modal-foot{padding:16px 22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px;}
.field{margin-bottom:16px;}
.field label{display:block;font-size:13px;font-weight:600;color:var(--ink-soft);margin-bottom:7px;}
.field input,.field textarea,.field select{width:100%;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;font-size:14px;outline:none;background:var(--surface);transition:.12s;}
.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
.inline-select{border:1px solid var(--line-2);border-radius:10px;padding:8px 11px;font-size:13px;font-weight:600;background:var(--surface);cursor:pointer;color:var(--ink);}
.inline-select.sm{padding:6px 9px;font-size:12px;}

.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;}
.toolbar .grow{flex:1;min-width:200px;}
.fl{display:flex;align-items:center;gap:7px;}
.fl .lab{font-size:12px;font-weight:700;color:var(--muted);}
.clickable{cursor:pointer;color:var(--accent-ink);font-weight:700;display:inline-flex;align-items:center;gap:6px;}
.clickable:hover{text-decoration:underline;}
.expand-row > td{background:var(--surface-2);padding:0;}
.expand-inner{padding:16px 18px;}
.member-row{display:flex;align-items:center;gap:11px;padding:9px 8px;border-bottom:1px solid var(--line);}
.member-row:last-child{border-bottom:none;}
.note{font-size:13px;border-radius:12px;padding:12px 14px;display:flex;gap:9px;align-items:flex-start;font-weight:600;}
.note.ok{background:var(--gain-soft);color:var(--gain);}
.note.info{background:var(--accent-soft);color:var(--accent-ink);}
.note.warn{background:#fdf0dc;color:#9a6a16;}
.counter{font-size:12px;font-weight:700;color:var(--muted);}
.empty{padding:36px;text-align:center;color:var(--muted);font-size:14px;}
.tscroll{overflow-x:auto;}
tr.exit > td{background:var(--loss-soft);}
tr.exit > td:first-child{box-shadow:inset 3px 0 0 var(--loss);}
tr.expired > td{opacity:.42;background:#f8f8fc;}
tr.hiddenrow > td{opacity:.55;}
.iconbtn{width:30px;height:30px;border-radius:9px;border:1px solid var(--line-2);background:var(--surface);color:var(--ink-soft);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}
.iconbtn:hover{background:var(--surface-2);}
.iconbtn.on-like{background:var(--gain-soft);color:var(--gain);border-color:transparent;}
.iconbtn.on-dislike{background:var(--loss-soft);color:var(--loss);border-color:transparent;}
.iconbtn.on-exit{background:var(--loss-soft);color:var(--loss);border-color:transparent;}
.iconbtn.danger:hover{background:var(--loss-soft);color:var(--loss);border-color:transparent;}
.actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;}
.expand-sub{padding:14px 16px;background:var(--surface-2);}
.namelist{display:flex;flex-wrap:wrap;gap:8px;}
.nl-item{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:5px 12px 5px 6px;font-size:13px;font-weight:600;}
.statgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px;}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 13px;}
.stat .v{font-size:19px;font-weight:800;letter-spacing:-.3px;}
.stat .l{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:4px;}
.stat.click{cursor:pointer;transition:.12s;}
.stat.click:hover{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
.menu{position:absolute;top:calc(100% + 6px);right:0;z-index:30;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 40px rgba(20,20,50,.16);padding:6px;min-width:170px;}
.menu-item{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}
.menu-item:hover{background:var(--surface-2);color:var(--accent-ink);}
.cap{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
.spin{animation:spin 1s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
.nowrap{white-space:nowrap;}
@media (prefers-reduced-motion:reduce){*{transition:none!important;}}
`;

/* ---------- mock data ---------- */
const TODAY = new Date().toISOString().slice(0, 10); // always today

const ACCOUNTS = []; // populated when user links accounts

const HOLDINGS = []; // starts empty — user adds holdings or imports
const TYPE_COLORS = { Stock:"#6d5df5", ETF:"#9a55ee", Fund:"#cf52d8", Crypto:"#2b2b40" };
const CONTACT_COLORS = ["#6d5df5","#15924e","#cf52d8","#9a55ee","#5a49e6","#0ea5b7","#d97706","#be185d"];
const DEFAULT_CLASSES = ["Equity","Bonds","ETF","Mutual Funds","Crypto","Metals","F&P","Others"];
const CLASS_COLOR = { Equity:"#6d5df5", Bonds:"#0ea5b7", ETF:"#9a55ee", "Mutual Funds":"#cf52d8", Crypto:"#d97706", Metals:"#64748b", "F&P":"#15924e", Others:"#8d90ad" };
const classColor = (c) => CLASS_COLOR[c] || "#8d90ad";




const SPARK = [62,61,64,63,67,66,69,72,70,74,77,76,80,84,83,88,92,90,95,100];

const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
const fmtSigned = (n) => (n>=0?"+":"-") + fmt(Math.abs(n));
const fmtPct = (p) => (p >= 0 ? "+" : "") + (p * 100).toFixed(1) + "%";
const fmtDate = (iso) => new Date(iso+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
const initialsOf = (name) => name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

const NOTIONAL = 1000; // assumed notional per acted recommendation, for demo P&L
const recoStats = (recs, pred) => {
  const list = recs.filter(pred);
  const acted = list.filter(r=>r.invested);
  const pnl = acted.reduce((s,r)=> s + NOTIONAL*((r.price/(r.investedPrice||r.priceAt))-1), 0);
  return {
    count:list.length, acted:acted.length,
    liked:list.filter(r=>r.reaction==="like").length,
    disliked:list.filter(r=>r.reaction==="dislike").length,
    inMoney:list.filter(r=>(r.price-r.priceAt)/r.priceAt>=0).length,
    outMoney:list.filter(r=>(r.price-r.priceAt)/r.priceAt<0).length,
    pnl,
  };
};

const TypeTag = ({ t }) => <span className="ttag"><span className="dot" style={{ background:TYPE_COLORS[t]||"#999" }}/>{t}</span>;
const Avatar = ({ f, size=40 }) => {
  if (!f) return <div className="av" style={{ width:size, height:size, background:"var(--grad)", fontSize:size*0.38 }}>?</div>;
  return <div className="av" style={{ width:size, height:size, background:f.color||"var(--grad)", fontSize:size*0.38 }}>{f.initials||initialsOf(f.name||"?")}</div>;
};

/* permission helpers (outbound = what I share with them) */
const PERM_ORDER = { off:0, names:1, full:2 };
const normLevel = (lvl) => lvl==="none" ? "off" : lvl;          // their level -> off/names/full
const myPerm = (sharing,id) => { const c=sharing[id]; if(!c||c.visibility==="off") return "off"; return c.level==="full"?"full":"names"; };
const setMyPerm = (setSharing,id,val) => setSharing(s=>({ ...s, [id]:{ visibility: val==="off"?"off":"all", level: val==="full"?"full":"names", selected: s[id]?.selected||[] } }));
const PermBadge = ({ p }) => p==="full" ? <span className="pill accent">Amounts & P&L</span> : p==="names" ? <span className="pill">Only names</span> : <span className="pill">Not shared</span>;

/* =================================================================== */
export default function App() {
  const { user, role, setRole, userIsAdmin, logout, authLoading, profile, updateProfile } = useAuth();
  const ME = useMemo(() => {
    if (!user) return { id:"", name:"", firstName:"", lastName:"", initials:"", email:"" };
    const firstName = profile?.first_name || user.email?.split("@")[0] || "User";
    const lastName  = profile?.last_name  || "";
    const name = `${firstName} ${lastName}`.trim();
    return { id:user.uid, name, firstName, lastName, initials:initialsOf(name), email:user.email||"" };
  }, [user?.uid, profile?.first_name, profile?.last_name]);

  // ── Page navigation ─────────────────────────────────────────────────────────
  const [investorPage, setInvestorPage] = useState("home");
  const [adminPage,    setAdminPage]    = useState("users");
  const [recoInit,     setRecoInit]     = useState(null);

  // ── App-level state ─────────────────────────────────────────────────────────
  const [connections,   setConnections]   = useState([]); // all connections (all statuses)
  const [groups,        setGroups]        = useState([]); // shared groups from ic_groups
  const [recsReceived,  setRecsReceived]  = useState([]); // from recommendation_deliveries
  const [recsMade,      setRecsMade]      = useState([]); // from ic_recommendations
  const [sharing,       setSharing]       = useState({});
  const [notifications, setNotifications] = useState([]);
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [holdings,      setHoldings]      = useState(HOLDINGS);
  const [assetClasses,  setAssetClasses]  = useState(DEFAULT_CLASSES);
  const [users,         setUsers]         = useState([]);
  const [configs,       setConfigs]       = useState({
    enableRecommendations:true, allowCryptoAccounts:true, publicFeed:true,
    requireAccountApproval:true, allowAmountSharing:true, defaultDisclosure:"names",
    maxGroupMembers:8, groupCreationPolicy:"all",
  });
  const [providers, setProviders] = useState(["Fidelity","Vanguard","Robinhood","Coinbase","Schwab","E*TRADE"]);
  const [priceRefresh, setPriceRefresh] = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);

  // Derived: confirmed contacts only (accepted connections, shaped for UI backward compat)
  const contacts = useMemo(() =>
    connections
      .filter(c => c.status === "accepted")
      .map((c, i) => ({
        id:           c.user_id,
        connectionId: c.connection_id,
        name:         c.name,
        email:        c.email,
        initials:     initialsOf(c.name),
        color:        CONTACT_COLORS[i % CONTACT_COLORS.length],
        title:        "InvestorCircle member",
        shared:       { level:"none", holdings:[] },
      })),
    [connections]
  );
  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);

  const refreshPrices = async () => {
    if (!isFinnhubConfigured()) return;
    setPriceRefresh("loading");
    const syms = [...new Set(holdings.map(h=>h.sym))];
    const prices = await fetchLivePrices(syms);
    setHoldings(hs => hs.map(h => prices[h.sym] != null ? {...h, price:prices[h.sym]} : h));
    setPriceRefresh("done");
    setTimeout(()=>setPriceRefresh(null),3000);
  };

  // ── Load all shared data from Neon on login ─────────────────────────────────
  useEffect(() => {
    if (!user || !sql) return;
    const load = async () => {
      try {
        const [conns, grps, recv, made, notifs, shr] = await Promise.all([
          getMyConnections(user.uid),
          getMyGroups(user.uid),
          getMyReceivedRecos(user.uid),
          getMyMadeRecos(user.uid),
          getMyNotifications(user.uid),
          getSharingPrefs(user.uid),
        ]);
        setConnections(conns);
        setGroups(grps);
        setRecsReceived(recv);
        setRecsMade(made);
        setNotifications(notifs);
        setSharing(shr);
      } catch(e) { console.warn("Data load failed:", e.message); }
      // Load registered users for admin panel
      try {
        const profiles = await sql`SELECT * FROM user_profiles ORDER BY created_at`;
        if (profiles.length) setUsers(profiles.map(p => ({
          id: p.id, name: p.full_name, email: p.email,
          role: p.is_admin ? "Admin" : "Investor", status: "Active", accounts: 0,
          joined: new Date(p.created_at).toLocaleDateString("en-US",{month:"short",year:"numeric"}),
        })));
      } catch(_) {}
    };
    load();
  }, [user?.uid]);

  // Poll notifications every 30 seconds to surface new connection requests etc.
  useEffect(() => {
    if (!user || !sql) return;
    const iv = setInterval(async () => {
      try { setNotifications(await getMyNotifications(user.uid)); } catch(_) {}
    }, 30000);
    return () => clearInterval(iv);
  }, [user?.uid]);

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{minHeight:"100vh",background:"#0a0b18",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#8a8daa",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15}}>Loading…</div>
    </div>
  );
  if (!user) return <LoginPage />;


  // Non-admin users are ALWAYS investors, regardless of role state.
  // Admin users can toggle between "investor" and "admin" views via the sidebar button.
  const isInv = !userIsAdmin || role === "investor";
  const newRecs = recsReceived.filter(r=>!r.invested && !r.hidden).length;
  const page = isInv ? investorPage : adminPage;
  const setPage = isInv ? setInvestorPage : setAdminPage;
  const canCreateGroups = configs.groupCreationPolicy==="all";

  const nav = isInv ? [
    { id:"home",      label:"Home",            icon:Home },
    { id:"portfolio", label:"My Portfolio",     icon:PieChart },
    { id:"network",   label:"Network",          icon:Users },
    ...(configs.enableRecommendations ? [{ id:"recs", label:"Recommendations", icon:Lightbulb, badge:newRecs }] : []),
    { id:"sharing",   label:"Sharing & Privacy",icon:Shield },
  ] : [
    { id:"users",       label:"Users",             icon:UserCog },
    { id:"groups",      label:"Groups",            icon:Layers },
    { id:"instruments", label:"Instruments",        icon:Database },
    { id:"configs",     label:"App Configuration", icon:Settings },
  ];

  const stats = isInv
    ? [["Connections", contacts.length], ["Groups", groups.length], ["Accounts", ACCOUNTS.length]]
    : [["Users", users.length], ["Active", users.filter(u=>u.status==="Active").length], ["Groups", groups.length]];

  return (
    <div className="app">
      <style>{STYLES}</style>
      <div className="shell">
        <div className="sidebar">
          <div className="brand"><div className="mark">ic</div>
            <div><div className="nm">InvestorCircle</div><div className="tag">Social Investing</div></div></div>
          {userIsAdmin && <div className="viewing" onClick={()=>setRole(isInv?"admin":"investor")} title="Switch view">
            <div className="ava">{isInv ? ME.initials : "AD"}</div>
            <div style={{flex:1}}><div className="vs">Viewing as</div><div className="role">{isInv?"Investor":"Admin"}</div></div>
            <ChevronsUpDown size={17} color="rgba(255,255,255,.85)"/>
          </div>}
          {!userIsAdmin && <div className="viewing" style={{cursor:"default"}}>
            <div className="ava">{ME.initials}</div>
            <div style={{flex:1}}><div className="vs">Signed in as</div><div className="role">{ME.name}</div></div>
          </div>}
          <div className="side-label">{isInv?"Menu":"Admin"}</div>
          {nav.map(n=>(
            <div key={n.id} className={"nav-item"+(page===n.id?" active":"")} onClick={()=>setPage(n.id)}>
              <n.icon size={19}/> {n.label}{n.badge>0 && <span className="nav-badge">{n.badge}</span>}
            </div>
          ))}
          <div className="side-foot">
            {stats.map(([l,v])=><div key={l} className="side-stat"><span>{l}</span><b>{v}</b></div>)}
            <div className="side-stat" style={{marginTop:8,borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:8}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>{ME.email}</span></div>
            <button onClick={logout} style={{marginTop:10,width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"7px 10px",color:"rgba(255,255,255,.65)",fontSize:12.5,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
              <LogOut size={14}/> Sign out</button>
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <div className="searchbox" style={{width:300,maxWidth:"40vw"}}><Search size={16} color="var(--muted)"/><input placeholder="Search investors, tickers…"/></div>
            <div className="tb-right">
              {/* Notification bell */}
              <div style={{position:"relative"}}>
                <button className="icon-btn" onClick={()=>setNotifOpen(v=>!v)}>
                  <Bell size={18}/>
                  {unreadCount>0 && <span style={{position:"absolute",top:0,right:0,background:"var(--accent)",color:"#fff",borderRadius:"50%",fontSize:10,fontWeight:800,width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>{unreadCount>9?"9+":unreadCount}</span>}
                </button>
                {notifOpen && <NotificationPanel
                  notifications={notifications}
                  myId={ME.id}
                  onAccept={async (n) => {
                    await acceptConnection(n.reference_id, ME.id);
                    await markNotifRead(n.id, ME.id);
                    const [conns, notifs] = await Promise.all([getMyConnections(ME.id), getMyNotifications(ME.id)]);
                    setConnections(conns); setNotifications(notifs);
                  }}
                  onReject={async (n) => {
                    await rejectConnection(n.reference_id, ME.id);
                    await markNotifRead(n.id, ME.id);
                    const [conns, notifs] = await Promise.all([getMyConnections(ME.id), getMyNotifications(ME.id)]);
                    setConnections(conns); setNotifications(notifs);
                  }}
                  onRead={async (n) => {
                    await markNotifRead(n.id, ME.id);
                    setNotifications(ns => ns.map(x => x.id===n.id ? {...x,is_read:true} : x));
                  }}
                  onReadAll={async () => {
                    await markAllNotifRead(ME.id);
                    setNotifications(ns => ns.map(x => ({...x,is_read:true})));
                  }}
                  onClose={()=>setNotifOpen(false)}
                />}
              </div>
              <div style={{position:"relative"}}>
                <button
                  onClick={()=>{ setProfileOpen(v=>!v); setNotifOpen(false); }}
                  style={{background:"none",border:"none",padding:0,cursor:"pointer"}}
                  title="View / edit profile"
                >
                  <div className="avatar-pill">
                    <div className="gava">{isInv ? ME.initials : "AD"}</div>
                    <div style={{paddingRight:6}}>
                      <div style={{fontSize:13,fontWeight:700,lineHeight:1.2}}>
                        {isInv ? ME.name : "Admin"}
                      </div>
                      <div style={{fontSize:11,color:"var(--muted)"}}>
                        {isInv ? "Investor" : "Administrator"}
                      </div>
                    </div>
                  </div>
                </button>
                {profileOpen && isInv && (
                  <ProfileModal
                    me={ME} updateProfile={updateProfile}
                    onClose={()=>setProfileOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="content">
            {isInv && page==="home"      && <HomeFeed setPage={setPage} recsReceived={recsReceived} configs={configs} holdings={holdings} contacts={contacts}/>}
            {isInv && page==="portfolio" && <Portfolio configs={configs} holdings={holdings} setHoldings={setHoldings} refreshPrices={refreshPrices} priceRefresh={priceRefresh}/>}
            {isInv && page==="network"   && <Network
                connections={connections} setConnections={setConnections}
                groups={groups} setGroups={setGroups}
                sharing={sharing} setSharing={setSharing}
                configs={configs} canCreateGroups={canCreateGroups}
                pendingInvites={pendingInvites} setPendingInvites={setPendingInvites}
                recsReceived={recsReceived} me={ME}
                onOpenRecos={(f)=>{ setRecoInit(f); setInvestorPage("recs"); }}/>}
            {isInv && page==="recs"      && <Recommendations
                recsReceived={recsReceived} setRecsReceived={setRecsReceived}
                recsMade={recsMade} setRecsMade={setRecsMade}
                contacts={contacts} groups={groups}
                assetClasses={assetClasses} setAssetClasses={setAssetClasses}
                initFilter={recoInit} holdings={holdings} me={ME}
                onReload={async()=>{ setRecsReceived(await getMyReceivedRecos(ME.id)); setRecsMade(await getMyMadeRecos(ME.id)); }}/>}
            {isInv && page==="sharing"   && <Sharing sharing={sharing} setSharing={setSharing} configs={configs} holdings={holdings} contacts={contacts} groups={groups} myId={ME.id}/>}
            {!isInv && page==="users"       && <AdminUsers users={users} setUsers={setUsers} contacts={contacts} setContacts={()=>{}}/>}
            {!isInv && page==="groups"      && <AdminGroups groups={groups} setGroups={setGroups} contacts={contacts} me={ME}/>}
            {!isInv && page==="instruments" && <AdminInstruments/>}
            {!isInv && page==="configs"     && <AdminConfigs configs={configs} setConfigs={setConfigs} providers={providers} setProviders={setProviders}/>}
          </div>
        </div>
      </div>
    </div>
  );
}


/* =================================================================== NETWORK */
function SortTh({ label, k, sort, setSort, align }) {
  const active = sort.key===k;
  return (
    <th className={"sortable"+(active?" sorted":"")} style={align?{textAlign:align}:null}
        onClick={()=>setSort(s=>({ key:k, dir: s.key===k && s.dir==="asc" ? "desc":"asc" }))}>
      {label}<span className="si">{active ? (sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>) : <ArrowUpDown size={12}/>}</span>
    </th>
  );
}

function RecoBreakdown({ stats, onPnl, pnlLabel }) {
  return (
    <div className="statgrid">
      <div className="stat"><div className="v">{stats.count}</div><div className="l">Recommendations</div></div>
      <div className="stat"><div className="v">{stats.acted}</div><div className="l">I acted on</div></div>
      <div className="stat"><div className="v">{stats.liked}</div><div className="l">I liked</div></div>
      <div className="stat"><div className="v">{stats.disliked}</div><div className="l">I disliked</div></div>
      <div className="stat"><div className="v pos">{stats.inMoney}</div><div className="l">In the money</div></div>
      <div className="stat"><div className="v neg">{stats.outMoney}</div><div className="l">Out of money</div></div>
      <div className="stat click" onClick={(e)=>{ e.stopPropagation(); onPnl(); }}>
        <div className={"v "+(stats.pnl>=0?"pos":"neg")}>{fmtSigned(stats.pnl)}</div>
        <div className="l" style={{color:"var(--accent-ink)"}}>{pnlLabel||"My P&L"} ↗</div></div>
    </div>
  );
}

/* ── Notification Panel ─────────────────────────────────────────────────────── */
function NotificationPanel({ notifications, myId, onAccept, onReject, onRead, onReadAll, onClose }) {
  const unread = notifications.filter(n => !n.is_read);
  const TYPE_LABEL = {
    connection_request:  "wants to connect with you",
    connection_accepted: "accepted your connection request",
    connection_rejected: "declined your connection request",
    group_added:         "added you to a group",
    group_member_exit:   "left your group",
    recommendation:      "shared a recommendation with you",
    exit_signal:         "issued an exit signal",
  };
  return (
    <div style={{position:"absolute",top:44,right:0,width:380,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:16,boxShadow:"0 8px 32px rgba(0,0,0,.12)",zIndex:200,maxHeight:520,display:"flex",flexDirection:"column"}}
         onClick={e=>e.stopPropagation()}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <b style={{fontSize:14}}>Notifications {unread.length>0 && <span className="nav-badge" style={{position:"static",marginLeft:6}}>{unread.length}</span>}</b>
        <div style={{display:"flex",gap:8}}>
          {unread.length>0 && <button className="btn btn-ghost btn-sm" onClick={onReadAll}>Mark all read</button>}
          <button className="icon-btn" onClick={onClose}><X size={16}/></button>
        </div>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        {notifications.length===0 && <div className="empty" style={{padding:32}}>No notifications yet</div>}
        {notifications.map(n=>(
          <div key={n.id} style={{padding:"12px 18px",borderBottom:"1px solid var(--line)",background:n.is_read?"transparent":"var(--surface-2)",display:"flex",gap:12,alignItems:"flex-start"}}>
            <div className="av" style={{width:36,height:36,flexShrink:0,background:"#6d5df5",fontSize:13}}>{initialsOf(n.from_name||"?")}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,lineHeight:1.5}}><b>{n.from_name||"Someone"}</b> {TYPE_LABEL[n.type]||n.type}
                {n.metadata?.groupName && <> — <b>{n.metadata.groupName}</b></>}
                {n.metadata?.ticker    && <> — <b>{n.metadata.ticker}</b></>}
              </div>
              <div className="muted small">{fmtDate(n.created_at?.toString?.()?.slice(0,10)||"")}</div>
              {/* Action buttons for connection requests */}
              {n.type==="connection_request" && !n.is_read && (
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button className="btn btn-pri btn-sm" onClick={()=>onAccept(n)}><Check size={13}/> Accept</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>onReject(n)}><X size={13}/> Decline</button>
                </div>
              )}
              {n.type==="connection_request" && n.is_read && (
                <span className="pill muted" style={{fontSize:11,marginTop:4}}>Responded</span>
              )}
            </div>
            {!n.is_read && n.type!=="connection_request" && (
              <button className="icon-btn" title="Mark read" onClick={()=>onRead(n)}><Check size={14}/></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Network shell ─────────────────────────────────────────────────────────── */
function Network({ connections, setConnections, groups, setGroups, sharing, setSharing, configs,
    canCreateGroups, pendingInvites, setPendingInvites, recsReceived, onOpenRecos, me }) {
  const [tab, setTab] = useState("contacts");
  const pendingReceived = connections.filter(c=>c.status==="pending"&&c.direction==="received").length;
  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Network</div><div className="page-title">Your circle</div>
          <div className="page-sub">Manage connections and groups</div></div>
      </div>
      <div className="seg" style={{marginBottom:20}}>
        <button className={tab==="contacts"?"active":""} onClick={()=>setTab("contacts")}>
          <Users size={15}/> Contacts · {connections.filter(c=>c.status==="accepted").length}
          {pendingReceived>0 && <span className="nav-badge" style={{position:"static",marginLeft:6}}>{pendingReceived}</span>}
        </button>
        <button className={tab==="groups"?"active":""} onClick={()=>setTab("groups")}>
          <Layers size={15}/> Groups · {groups.length}
        </button>
      </div>
      {tab==="contacts"
        ? <ContactsSection connections={connections} setConnections={setConnections}
            groups={groups} sharing={sharing} setSharing={setSharing} configs={configs}
            pendingInvites={pendingInvites} setPendingInvites={setPendingInvites}
            recsReceived={recsReceived} onOpenRecos={onOpenRecos} me={me}/>
        : <GroupsSection groups={groups} setGroups={setGroups}
            contacts={connections.filter(c=>c.status==="accepted").map((c,i)=>({id:c.user_id,name:c.name,color:CONTACT_COLORS[i%CONTACT_COLORS.length],connectionId:c.connection_id}))}
            configs={configs} canCreateGroups={canCreateGroups} me={me}
            recsReceived={recsReceived} onOpenRecos={onOpenRecos}/>}
    </>
  );
}

/* ── Contacts section ─────────────────────────────────────────────────────── */
function ContactsSection({ connections, setConnections, groups, sharing, setSharing, configs,
    pendingInvites, setPendingInvites, recsReceived, onOpenRecos, me }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({key:"name",dir:"asc"});
  const [showAdd, setShowAdd] = useState(false);
  const [openContact, setOpenContact] = useState(null);
  const [expandId, setExpandId] = useState(null);
  const [busy, setBusy] = useState({});
  const myId = me?.id || "me";

  // ALL connections shown (all statuses) so user can see pending/rejected
  const rows = useMemo(() => {
    let r = [...connections];
    if (q.trim()) { const s=q.toLowerCase(); r=r.filter(c=>c.name.toLowerCase().includes(s)||c.email.toLowerCase().includes(s)); }
    const dir=sort.dir==="asc"?1:-1;
    r.sort((a,b)=>{
      if(sort.key==="name")   return a.name.localeCompare(b.name)*dir;
      if(sort.key==="status") return a.status.localeCompare(b.status)*dir;
      return 0;
    });
    return r;
  }, [connections, q, sort]);

  const statsOf = (c) => recoStats(recsReceived, r => r.from===c.user_id||(r.byName&&r.byName===c.name));
  const commonGroups = (c) => groups.filter(g=>g.members?.some(m=>m.user_id===c.user_id));
  const myPermFor = (c) => {
    const s = sharing[c.user_id];
    if (!s) return "off";
    if (s.visibility==="off") return "off";
    return s.level==="full"?"full":"names";
  };

  const doAccept = async (c) => {
    setBusy(b=>({...b,[c.connection_id]:true}));
    await acceptConnection(c.connection_id, myId);
    setConnections(await getMyConnections(myId));
    setBusy(b=>({...b,[c.connection_id]:false}));
  };
  const doReject = async (c) => {
    setBusy(b=>({...b,[c.connection_id]:true}));
    await rejectConnection(c.connection_id, myId);
    setConnections(await getMyConnections(myId));
    setBusy(b=>({...b,[c.connection_id]:false}));
  };
  const doRemove = async (c) => {
    if(!confirm(`Remove ${c.name} from your network?`)) return;
    await removeConnection(c.connection_id, myId);
    setConnections(cs=>cs.filter(x=>x.connection_id!==c.connection_id));
    setSharing(s=>{const ns={...s}; delete ns[c.user_id]; return ns;});
  };
  const setMyPerm_ = async (userId, val) => {
    const next = { visibility: val==="off"?"off":"all", level: val==="full"?"full":"names", selected:[] };
    setSharing(s=>({...s,[userId]:next}));
    await upsertSharingPref(myId, userId, "user", next);
  };

  const accepted = rows.filter(c=>c.status==="accepted");
  const pendingReceived = rows.filter(c=>c.status==="pending"&&c.direction==="received");
  const pendingSent = rows.filter(c=>c.status==="pending"&&c.direction==="sent");
  const rejected = rows.filter(c=>c.status==="rejected");

  const ContactRow = ({c, showActions}) => {
    const stats = statsOf(c);
    const mine = myPermFor(c);
    const open = expandId===c.connection_id;
    const cg = commonGroups(c);
    const av = {name:c.name,initials:initialsOf(c.name),color:CONTACT_COLORS[connections.indexOf(c)%CONTACT_COLORS.length]};
    return (<React.Fragment key={c.connection_id}>
      <tr className={"hoverable"+(c.status!=="accepted"?" hiddenrow":"")} style={{cursor:"pointer"}} onClick={()=>setExpandId(open?null:c.connection_id)}>
        <td><div style={{display:"flex",gap:11,alignItems:"center"}}>
          <Avatar f={av} size={36}/>
          <div className="sym">{c.name}</div>
          {c.status==="pending"&&c.direction==="sent"     && <span className="pill" style={{fontSize:11,background:"#f59e0b22",color:"#b45309"}}>Pending</span>}
          {c.status==="pending"&&c.direction==="received" && <span className="pill accent" style={{fontSize:11}}>Wants to connect</span>}
          {c.status==="rejected" && <span className="pill loss" style={{fontSize:11}}>Rejected</span>}
          <ChevronDown size={14} className="muted" style={{transform:open?"rotate(180deg)":"none",transition:".15s"}}/>
        </div></td>
        <td className="muted small">{c.email}</td>
        <td>{cg.length===0?<span className="muted small">—</span>:<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{cg.map(g=><span key={g.id} className="chip mini">{g.name}</span>)}</div>}</td>
        <td className="tnum">{c.status==="accepted"?stats.count:<span className="muted">—</span>}</td>
        <td style={{textAlign:"right"}}>
          {c.status==="accepted"
            ? <span className="clickable tnum nowrap" onClick={(e)=>{e.stopPropagation();onOpenRecos({by:c.name});}}>{fmtSigned(stats.pnl)} ↗</span>
            : <span className="muted">—</span>}</td>
        <td onClick={e=>e.stopPropagation()}>
          {c.status==="accepted"
            ? <select className="inline-select sm" value={mine} onChange={e=>setMyPerm_(c.user_id,e.target.value)}>
                <option value="off">Not shared</option><option value="names">Names only</option><option value="full">Amounts & P&L</option>
              </select>
            : <span className="muted small">—</span>}</td>
        <td onClick={e=>e.stopPropagation()}>
          {c.status==="pending"&&c.direction==="received" && (
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-pri btn-sm" disabled={busy[c.connection_id]} onClick={()=>doAccept(c)}><Check size={13}/> Accept</button>
              <button className="btn btn-ghost btn-sm" disabled={busy[c.connection_id]} onClick={()=>doReject(c)}><X size={13}/> Decline</button>
            </div>)}
          {(c.status==="pending"&&c.direction==="sent"||c.status==="rejected") && (
            <button className="iconbtn danger" title="Remove" onClick={()=>doRemove(c)}><Trash2 size={14}/></button>)}
          {c.status==="accepted" && (
            <button className="iconbtn danger" title="Remove from network" onClick={()=>doRemove(c)}><Trash2 size={14}/></button>)}
        </td>
      </tr>
      {open && c.status==="accepted" && <tr className="expand-row"><td colSpan={7}><div className="expand-inner" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <b style={{fontSize:14}}>{c.name}&apos;s recommendations to you</b>
          <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)"}} onClick={()=>doRemove(c)}><Trash2 size={13}/> Remove</button>
        </div>
        <RecoBreakdown stats={statsOf(c)} pnlLabel="My P&L" onPnl={()=>onOpenRecos({by:c.name})}/>
      </div></td></tr>}
    </React.Fragment>);
  };

  return (<>
    {pendingInvites.length>0 && <div className="note info" style={{marginBottom:14}}><Mail size={16}/><div>Pending email invitations: {pendingInvites.map(p=>p.email).join(", ")}.</div></div>}
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or email…"/></div>
      <button className="btn btn-pri btn-sm" onClick={()=>setShowAdd(true)}><UserPlus size={15}/> Add connection</button>
    </div>

    {/* Pending incoming requests */}
    {pendingReceived.length>0 && (
      <div className="card" style={{marginBottom:16,border:"2px solid var(--accent)"}}>
        <div className="card-head" style={{color:"var(--accent)"}}><Bell size={15}/> {pendingReceived.length} pending connection request{pendingReceived.length>1?"s":""}</div>
        <div className="card-body" style={{padding:"8px 0"}}><table className="grid" style={{minWidth:800}}>
          <tbody>{pendingReceived.map(c=><ContactRow key={c.connection_id} c={c}/>)}</tbody>
        </table></div>
      </div>
    )}

    {/* Accepted contacts */}
    {connections.length===0
      ? <div className="card"><div className="empty">No connections yet. Use &ldquo;Add connection&rdquo; to invite people.</div></div>
      : <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid" style={{minWidth:900}}>
          <thead><tr>
            <SortTh label="Name"            k="name"   sort={sort} setSort={setSort}/>
            <th>Email</th>
            <th>Common groups</th>
            <SortTh label="Recos to me"     k="recos"  sort={sort} setSort={setSort}/>
            <SortTh label="My P&amp;L"      k="pnl"    sort={sort} setSort={setSort} align="right"/>
            <th>I share</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            {accepted.map(c=><ContactRow key={c.connection_id} c={c}/>)}
            {pendingSent.map(c=><ContactRow key={c.connection_id} c={c}/>)}
            {rejected.map(c=><ContactRow key={c.connection_id} c={c}/>)}
          </tbody>
        </table></div></div></div>}

    {showAdd && <AddConnectionModal existing={connections} me={me} onClose={()=>setShowAdd(false)}
        onAddExisting={async(uid,info)=>{
          const res = await sendConnectionRequest(myId, uid);
          if (res.error==="already_exists") return;
          const conns = await getMyConnections(myId);
          setConnections(conns);
        }}
        onInvite={(email)=>setPendingInvites(p=>p.some(x=>x.email===email)?p:[...p,{email,date:TODAY}])}/>}
    {openContact && <PortfolioModal contact={openContact} onClose={()=>setOpenContact(null)}/>}
  </>);
}

/* ── Add connection modal ──────────────────────────────────────────────────── */
function AddConnectionModal({ existing, me, onClose, onAddExisting, onInvite }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const myName = me?.name || "your admin";
  const submit = async () => {
    const e = email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(e)){ setResult({type:"warn",msg:"Please enter a valid email address."}); return; }
    if(existing.some(c=>c.email===e)){ setResult({type:"warn",msg:"You already have a connection with this person."}); return; }
    setBusy(true);
    try {
      if (!sql){ setResult({type:"warn",msg:"Database not configured."}); setBusy(false); return; }
      const rows = await sql`SELECT id, email, full_name FROM user_profiles WHERE email=${e} LIMIT 1`;
      if (rows[0]) {
        if (rows[0].id === me?.id){ setResult({type:"warn",msg:"That is your own email address."}); setBusy(false); return; }
        await onAddExisting(rows[0].id, {name:rows[0].full_name,email:rows[0].email});
        setResult({type:"ok",msg:`Connection request sent to ${rows[0].full_name}. They will see it in their notifications.`});
      } else {
        onInvite(e);
        setResult({type:"info",msg:`${e} is not on InvestorCircle yet. An invitation note from ${myName} will be shared with them.`});
      }
    } catch(err) { setResult({type:"warn",msg:"Could not reach database: "+err.message}); }
    setBusy(false);
  };
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><UserPlus size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Add connection</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="field"><label>Email address</label>
        <input value={email} onChange={e=>{setEmail(e.target.value);setResult(null);}} placeholder="name@example.com" onKeyDown={e=>e.key==="Enter"&&!busy&&submit()} autoFocus/></div>
      <div className="muted small" style={{marginBottom:result?14:0}}>If they have an InvestorCircle account a connection request is sent. They must accept before you can share recommendations.</div>
      {result && <div className={"note "+result.type}>{result.type==="ok"?<Check size={16}/>:<Mail size={16}/>}<div>{result.msg}</div></div>}
    </div>
    <div className="modal-foot"><span/>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" onClick={onClose}>{result?"Done":"Cancel"}</button>
        <button className="btn btn-pri" disabled={!email||busy} onClick={submit}>
          {busy?<><Loader size={14} className="spin"/> Checking…</>:<><Send size={15}/> Send request</>}
        </button>
      </div>
    </div>
  </div></div>);
}


function PortfolioModal({ contact, onClose }) {
  const full = contact.shared.level==="full";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><div style={{ display:"flex", gap:12, alignItems:"center" }}><Avatar f={contact} size={42}/>
          <div><h3>{contact.name}</h3><div className="muted small">{contact.title}</div></div></div>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
        <div className="modal-body">
          <div className="muted small" style={{ marginBottom:14, display:"flex", gap:6, alignItems:"center" }}>
            {contact.shared.level==="names" ? <><Lock size={13}/> Amounts and P&L are hidden — only names are shared.</> : <>Showing everything {contact.name.split(" ")[0]} shared with you.</>}</div>
          <table className="grid">
            <thead><tr><th>Asset</th><th>Type</th>{full && <><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>P&L</th></>}</tr></thead>
            <tbody>{contact.shared.holdings.map((h,i)=>(
              <tr key={i} className="hoverable"><td><span className="sym">{h.sym}</span><div className="muted small">{h.name}</div></td>
                <td>{h.type?<TypeTag t={h.type}/>:<span className="muted">—</span>}</td>
                {full && <><td style={{textAlign:"right"}} className="tnum">{fmt(h.value)}</td>
                  <td style={{textAlign:"right"}} className={"tnum "+(h.pnlPct>=0?"pos":"neg")}>{fmtPct(h.pnlPct)}</td></>}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- groups ---------- */
function GroupsSection({ groups, setGroups, contacts, configs, canCreateGroups, recsReceived, onOpenRecos, me }) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [editGroup, setEditGroup] = useState(null);
  const [busy, setBusy] = useState({});
  const myId = me?.id || "me";

  const nameOf = (id) => {
    if(id===myId||id==="me") return me?.name||"You";
    return contacts.find(c=>c.id===id)?.name || id;
  };
  const avOf = (id) => {
    if(id===myId||id==="me") return {name:me?.name||"You",initials:me?.initials||"ME",color:"#6d5df5"};
    const c = contacts.find(x=>x.id===id);
    return c || {name:id,initials:initialsOf(id),color:"#8d90ad"};
  };
  const statsOf = (g) => recoStats(recsReceived, r=>r.shareType==="group"&&r.groupId===g.id);

  const rows = useMemo(()=>{
    let r = [...groups];
    if(q.trim()){ const s=q.toLowerCase(); r=r.filter(g=>g.name.toLowerCase().includes(s)); }
    return r;
  },[groups,q]);

  const doCreateGroup = async (name, memberIds, color) => {
    if(groups.some(g=>g.my_role==="admin"&&g.name.toLowerCase()===name.toLowerCase())){
      alert(`You already have a group named "${name}".`); return;
    }
    setBusy(b=>({...b,create:true}));
    const g = await dbCreateGroup(name, color||"#6d5df5", myId, memberIds);
    setGroups(await getMyGroups(myId));
    setBusy(b=>({...b,create:false}));
    setShowNew(false);
    return g;
  };
  const doRenameGroup = async (gid, newName) => {
    await dbRenameGroup(gid, newName, myId);
    setGroups(gs=>gs.map(g=>g.id===gid?{...g,name:newName}:g));
    setEditGroup(null);
  };
  const doDeleteGroup = async (g) => {
    if(!confirm(`Delete "${g.name}"?`)) return;
    await dbDeleteGroup(g.id, myId);
    setGroups(gs=>gs.filter(x=>x.id!==g.id));
  };
  const doExitGroup = async (g) => {
    if(!confirm(`Exit "${g.name}"? You will stop receiving recommendations shared in this group.`)) return;
    await dbExitGroup(g.id, myId);
    setGroups(gs=>gs.filter(x=>x.id!==g.id));
  };
  const doAddMembers = async (gid, ids) => {
    await dbAddGroupMembers(gid, ids, myId);
    setGroups(await getMyGroups(myId));
    setAddTo(null);
  };
  const doRemoveMember = async (gid, uid) => {
    await dbRemoveGroupMember(gid, uid);
    setGroups(gs=>gs.map(g=>g.id===gid?{...g,members:g.members.filter(m=>m.user_id!==uid)}:g));
  };

  return (<>
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search groups…"/></div>
      <button className="btn btn-pri btn-sm" disabled={!canCreateGroups||!sql} onClick={()=>setShowNew(true)}><Plus size={15}/> New group</button>
    </div>
    {rows.length===0 ? <div className="card"><div className="empty">No groups yet. Create one to start sharing recommendations with multiple people at once.</div></div> :
    <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid" style={{minWidth:820}}>
      <thead><tr>
        <th>Group name</th><th>Created on</th><th>Members</th><th>My role</th><th>Recos</th><th style={{textAlign:"right"}}>Actions</th>
      </tr></thead>
      <tbody>{rows.map(g=>{ const open=expanded===g.id; const iAmAdmin=g.my_role==="admin";
        return (<React.Fragment key={g.id}>
          <tr className="hoverable" style={{cursor:"pointer"}} onClick={()=>setExpanded(open?null:g.id)}>
            <td><span className="nowrap"><span className="av" style={{width:28,height:28,background:g.color,fontSize:12,marginRight:8,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:8}}><Layers size={13}/></span>
              <b>{g.name}</b><ChevronDown size={14} style={{transform:open?"rotate(180deg)":"none",transition:".15s",marginLeft:6}}/></span></td>
            <td className="muted small">{fmtDate(g.created_at?.toString?.()?.slice(0,10)||"")}</td>
            <td><span className="pill">{(g.members||[]).filter(m=>m.status==="active").length} members</span></td>
            <td>{iAmAdmin ? <span className="pill accent">Admin</span> : <span className="pill">Member</span>}</td>
            <td className="tnum">{statsOf(g).count}</td>
            <td onClick={e=>e.stopPropagation()}>
              <div className="actions" style={{justifyContent:"flex-end",gap:6}}>
                {iAmAdmin && <><button className="iconbtn" title="Rename" onClick={()=>setEditGroup(g)}><Pencil size={14}/></button>
                <button className="iconbtn danger" title="Delete group" onClick={()=>doDeleteGroup(g)}><Trash2 size={14}/></button></>}
                {!iAmAdmin && <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)"}} onClick={()=>doExitGroup(g)}>Exit group</button>}
              </div>
            </td>
          </tr>
          {open && <tr className="expand-row"><td colSpan={6}><div className="expand-inner" onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <b style={{fontSize:14}}>Members of {g.name}</b>
              {iAmAdmin && <button className="btn btn-soft btn-sm" onClick={()=>setAddTo(g)}><UserPlus size={14}/> Add members</button>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:12}}>
              {(g.members||[]).filter(m=>m.status==="active").map(m=>(
                <div key={m.user_id} style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:10,padding:"6px 12px"}}>
                  <Avatar f={avOf(m.user_id)} size={28}/>
                  <div><div style={{fontWeight:600,fontSize:13}}>{m.name||nameOf(m.user_id)}</div>
                    <div className="muted" style={{fontSize:11}}>{m.role==="admin"?"Admin":"Member"}</div></div>
                  {iAmAdmin && m.user_id!==myId && <button className="iconbtn danger" style={{marginLeft:4}} onClick={()=>doRemoveMember(g.id,m.user_id)}><X size={13}/></button>}
                  {!iAmAdmin && m.user_id===myId && <button className="btn btn-ghost btn-sm" style={{color:"var(--loss)",marginLeft:4}} onClick={()=>doExitGroup(g)}>Exit</button>}
                </div>
              ))}
            </div>
          </div></td></tr>}
        </React.Fragment>);
      })}</tbody>
    </table></div></div></div>}
    {showNew && <GroupModal title="New group" contacts={contacts} max={configs.maxGroupMembers} alreadyIn={[myId,"me"]}
        onClose={()=>setShowNew(false)} onSave={(name,ids)=>doCreateGroup(name,ids)}/>}
    {addTo && <GroupModal title="Add members" addOnly contacts={contacts} max={configs.maxGroupMembers}
        alreadyIn={(addTo.members||[]).filter(m=>m.status==="active").map(m=>m.user_id)}
        onClose={()=>setAddTo(null)} onSave={(_,ids)=>doAddMembers(addTo.id,ids)}/>}
    {editGroup && <EditGroupModal group={editGroup} groups={groups} myId={myId}
        onClose={()=>setEditGroup(null)} onSave={(name)=>doRenameGroup(editGroup.id,name)}/>}
  </>);
}

function MemberPanel({ group, nameOf, avOf, canManage, max, onAdd, onRemove }) {
  const active = (group.members||[]).filter(m=>m.status==="active");
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <b style={{fontSize:13}}>Members ({active.length}/{max})</b>
        {canManage && active.length<max && <button className="btn btn-soft btn-sm" onClick={onAdd}><UserPlus size={14}/> Add members</button>}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {active.map(m=>(
          <div key={m.user_id} style={{display:"flex",alignItems:"center",gap:7,background:"var(--surface-2)",borderRadius:10,padding:"5px 10px",border:"1px solid var(--line)"}}>
            <Avatar f={avOf(m.user_id)} size={26}/>
            <span style={{fontSize:13,fontWeight:600}}>{m.name||nameOf(m.user_id)}</span>
            {m.role==="admin" && <Crown size={12} color="#f59e0b"/>}
            {canManage && m.role!=="admin" && <X size={13} style={{cursor:"pointer",color:"var(--muted)"}} onClick={()=>onRemove(m.user_id)}/>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupModal({ title, contacts, max, alreadyIn, onClose, onSave, addOnly }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const available = contacts.filter(c=>!alreadyIn.includes(c.id));
  const toggle = (id) => setMembers(m=>m.includes(id)?m.filter(x=>x!==id):[...m,id]);
  const valid = (addOnly||name.trim()) && (addOnly ? members.length>0 : true);
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      {!addOnly && <div className="field"><label>Group name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Value Hunters" autoFocus/></div>}
      <div className="field"><label>Add from confirmed contacts {members.length>0&&`(${members.length} selected)`}</label>
        {available.length===0
          ? <div className="muted small">No confirmed contacts available to add. Only accepted connections can join groups.</div>
          : <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {available.map(c=><span key={c.id} className={"chip"+(members.includes(c.id)?" sel":"")} onClick={()=>toggle(c.id)}>{members.includes(c.id)&&<Check size={13}/>}{c.name}</span>)}
            </div>}
      </div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onSave(name.trim(),members)}>{addOnly?"Add members":"Create group"}</button>
    </div></div>
  </div></div>);
}


function useDerivedHoldings(holdings, includeCrypto = true) {
  return useMemo(()=>{
    const rows = holdings.filter(h=>includeCrypto || h.type!=="Crypto").map(h=>{
      const value=h.sh*h.price, costTot=h.sh*h.cost, pnl=value-costTot;
      return { ...h, value, costTot, pnl, pnlPct: pnl/costTot, acctName: ACCOUNTS.find(a=>a.id===h.acct)?.name || h.acctName || "—" };
    });
    const total=rows.reduce((s,r)=>s+r.value,0), cost=rows.reduce((s,r)=>s+r.costTot,0);
    return { rows, total, cost, pnl: total-cost, pnlPct:(total-cost)/cost };
  },[holdings,includeCrypto]);
}
function Sparkline({ data, w=150, h=44, color="var(--accent)" }) {
  const min=Math.min(...data), max=Math.max(...data), pad=4;
  const pts = data.map((v,i)=>[ pad+(i/(data.length-1))*(w-2*pad), pad+(1-(v-min)/(max-min))*(h-2*pad) ]);
  const line = pts.map(p=>p.join(",")).join(" "); const id="sg"+Math.round(w);
  return (<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <polygon points={`${pad},${h-pad} ${line} ${w-pad},${h-pad}`} fill={`url(#${id})`}/>
    <polyline points={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3.5" fill={color}/></svg>);
}
function Ring({ data, size=176 }) {
  const total=data.reduce((s,d)=>s+d.value,0), r=size/2-14, c=2*Math.PI*r; let off=0;
  return (<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <g transform={`rotate(-90 ${size/2} ${size/2})`}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={20}/>
      {data.map((d,i)=>{ const dash=(d.value/total)*c; const el=<circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={d.color} strokeWidth={20} strokeLinecap="round" strokeDasharray={`${Math.max(dash-3,0)} ${c-Math.max(dash-3,0)}`} strokeDashoffset={-off}/>; off+=dash; return el; })}</g>
    <text x="50%" y="46%" textAnchor="middle" fontSize="12" fill="var(--muted)" fontWeight="600">Total value</text>
    <text x="50%" y="58%" textAnchor="middle" fontFamily="var(--serif)" fontSize="21" fontWeight="600" fill="var(--ink)">{fmt(total)}</text></svg>);
}
function Portfolio({ configs, holdings, setHoldings, refreshPrices, priceRefresh }) {
  const [acct, setAcct] = useState("all"); const [hide, setHide] = useState(false);
  const [importRes, setImportRes] = useState(null); const [importBusy, setImportBusy] = useState(false);
  const [showPan, setShowPan] = useState(false); const [menu, setMenu] = useState(false);
  const fileRef = useRef(null);
  const { rows } = useDerivedHoldings(holdings, configs.allowCryptoAccounts);
  const shown = acct==="all" ? rows : rows.filter(r=>r.acct===acct);
  const onPickFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value=""; if(!file) return;
    setImportBusy(true);
    try { const res = await parsePortfolioFile(file); setImportRes({ ...res, fileName:file.name }); }
    catch(err){ setImportRes({ holdings:[], warnings:["Could not read this file: "+err.message], fileName:file.name }); }
    setImportBusy(false);
  };
  const applyImport = (newHoldings, mode) => {
    setHoldings(prev => mode==="replace" ? newHoldings : [...prev, ...newHoldings]);
    setImportRes(null);
  };
  const sTotal=shown.reduce((s,r)=>s+r.value,0), sCost=shown.reduce((s,r)=>s+r.costTot,0), sPnl=sTotal-sCost;
  const byType = useMemo(()=>{ const m={}; shown.forEach(r=>m[r.type]=(m[r.type]||0)+r.value); return Object.entries(m).map(([k,v])=>({label:k,value:v,color:TYPE_COLORS[k]||"#999"})); },[shown]);
  const top=[...shown].sort((a,b)=>b.value-a.value)[0]; const mask=(s)=>hide?"••••••":s;
  const fmtTime=(d)=>d?d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"";
  return (<>
    <div className="page-head"><div><div className="eyebrow">My Portfolio</div><div className="page-title">Everything in one place</div>
      <div className="page-sub">{ACCOUNTS.length} accounts aggregated · {rows.length} holdings</div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{display:"none"}} onChange={onPickFile}/>
        <div style={{position:"relative"}}>
          <button className="btn btn-soft btn-sm" onClick={()=>setMenu(m=>!m)}><Download size={15}/> Export <ChevronDown size={13}/></button>
          {menu && <div className="menu" onMouseLeave={()=>setMenu(false)}>
            <div className="menu-item" onClick={()=>{ exportPortfolioExcel(shown); setMenu(false); }}><FileSpreadsheet size={15}/> Excel (.xlsx)</div>
            <div className="menu-item" onClick={()=>{ exportPortfolioPDF(shown); setMenu(false); }}><FileText size={15}/> PDF (.pdf)</div>
          </div>}
        </div>
        <button className="btn btn-soft btn-sm" disabled={importBusy} onClick={()=>fileRef.current?.click()}>
          {importBusy ? <><Loader size={15} className="spin"/> Reading…</> : <><Upload size={15}/> Import</>}</button>
        <button className="btn btn-soft btn-sm" onClick={()=>setShowPan(true)}><CreditCard size={15}/> Link via PAN</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>setHide(v=>!v)}>{hide?<Eye size={15}/>:<EyeOff size={15}/>} {hide?"Show values":"Hide values"}</button>
      </div></div>

    {/* ── Live price refresh bar ── */}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      {isFinnhubConfigured
        ? <button className="btn btn-pri btn-sm" disabled={priceRefresh.busy} onClick={refreshPrices} style={{gap:7}}>
            {priceRefresh.busy
              ? <><Loader size={14} className="spin"/> Refreshing all prices…</>
              : <><RefreshCw size={14}/> Refresh live prices</>}
          </button>
        : <button className="btn btn-soft btn-sm" disabled title="Add VITE_FINNHUB_KEY to .env to enable live prices" style={{gap:7,opacity:.55}}>
            <RefreshCw size={14}/> Refresh live prices
          </button>}
      {!isFinnhubConfigured &&
        <span className="muted small">Live prices disabled — add <code style={{background:"var(--surface-2,#f0f0f8)",padding:"1px 6px",borderRadius:5,fontFamily:"monospace"}}>VITE_FINNHUB_KEY</code> to <code style={{background:"var(--surface-2,#f0f0f8)",padding:"1px 6px",borderRadius:5,fontFamily:"monospace"}}>.env</code> to enable. See <b>README</b>.</span>}
      {isFinnhubConfigured && priceRefresh.lastAt &&
        <span className="muted small"><span className="hl green" style={{fontSize:12}}>✓ Updated {fmtTime(priceRefresh.lastAt)}</span></span>}
      {isFinnhubConfigured && !priceRefresh.lastAt && !priceRefresh.busy &&
        <span className="muted small">Prices are mock data — click to pull live quotes from Finnhub.</span>}
      {priceRefresh.errors.length>0 &&
        <span className="muted small" style={{color:"var(--loss)"}}>{priceRefresh.errors.length} symbol{priceRefresh.errors.length>1?"s":""} had no data (kept existing price)</span>}
    </div>
    <div className="hero-grad"><div>
      <div className="lbl">Total balance · {acct==="all"?"all accounts":ACCOUNTS.find(a=>a.id===acct)?.name}</div>
      <div className="balance tnum">{mask(fmt(sTotal))}</div>
      <div className="delta-light">{sPnl>=0?<ArrowUpRight size={17}/>:<ArrowDownRight size={17}/>} {mask(fmtSigned(sPnl))} ({fmtPct(sPnl/sCost)}) all time</div></div>
      <Sparkline data={SPARK} w={190} h={58} color="#ffffff"/></div>
    <div className="kpi-row">
      <div className="kpi"><div className="lbl"><Wallet size={14}/> Invested (cost)</div><div className="val tnum">{mask(fmt(sCost))}</div></div>
      <div className="kpi"><div className="lbl">Unrealized P&L</div><div className={"val tnum "+(sPnl>=0?"pos":"neg")}>{mask(fmtSigned(sPnl))}</div><div className={"sub "+(sPnl>=0?"pos":"neg")}>{fmtPct(sPnl/sCost)}</div></div>
      <div className="kpi"><div className="lbl">Holdings</div><div className="val">{shown.length}</div><div className="sub muted">in {new Set(shown.map(r=>r.acct)).size} accounts</div></div>
      <div className="kpi"><div className="lbl">Top position</div><div className="val">{top?.sym}</div><div className="sub muted">{fmt(top?.value||0)}</div></div></div>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:18 }}>
      <div className="card"><div className="card-head">Holdings
        <select className="inline-select" value={acct} onChange={e=>setAcct(e.target.value)}><option value="all">All accounts</option>{ACCOUNTS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="card-body" style={{ padding:"8px 10px" }}><table className="grid">
          <thead><tr><th>Asset</th><th>Account</th><th>Type</th><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>P&L</th></tr></thead>
          <tbody>{shown.map(r=>(<tr key={r.id} className="hoverable">
            <td><div className="sym">{r.sym}</div><div className="muted small">{r.name}</div></td>
            <td className="muted small">{r.acctName}</td><td><TypeTag t={r.type}/></td>
            <td style={{textAlign:"right"}} className="tnum">{mask(fmt(r.value))}</td>
            <td style={{textAlign:"right"}} className={"tnum "+(r.pnl>=0?"pos":"neg")}>{hide?"••••":<>{fmtSigned(r.pnl)}<div className="small">{fmtPct(r.pnlPct)}</div></>}</td></tr>))}</tbody>
        </table></div></div>
      <div className="card" style={{ height:"fit-content" }}><div className="card-head">Allocation</div>
        <div className="card-body" style={{ display:"flex", flexDirection:"column", alignItems:"center" }}><Ring data={byType}/>
          <div style={{ width:"100%", marginTop:18, display:"flex", flexDirection:"column", gap:11 }}>
            {byType.map(d=>(<div key={d.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13 }}>
              <span style={{ display:"flex", alignItems:"center", gap:9 }}><span className="dot" style={{background:d.color, width:10, height:10}}/>{d.label}</span>
              <b className="tnum">{((d.value/sTotal)*100).toFixed(0)}%</b></div>))}</div></div></div>
    </div>
    {importRes && <ImportPreviewModal result={importRes} onClose={()=>setImportRes(null)} onApply={applyImport}/>}
    {showPan && <PanPullModal onClose={()=>setShowPan(false)} onApply={(h,mode)=>{ applyImport(h,mode); setShowPan(false); }}/>}
  </>);
}

/* =================================================================== RECOMMENDATIONS */
const Money = ({ itm }) => <span className={"pill "+(itm?"gain":"loss")}>{itm?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {itm?"In the money":"Out of the money"}</span>;
const ClassTag = ({ c }) => <span className="ttag nowrap"><span className="dot" style={{ background:classColor(c) }}/>{c}</span>;
const ret = (r) => (r.priceAt && r.priceAt !== 0) ? (r.price - r.priceAt) / r.priceAt : 0;

const HORIZONS = ["3m","6m","12m",">2Y"];
const calcTargetDate = (date, horizon) => {
  if (!date || !horizon) return null;
  const d = new Date(date + "T00:00:00");
  if (horizon==="3m")  d.setMonth(d.getMonth()+3);
  else if (horizon==="6m")  d.setMonth(d.getMonth()+6);
  else if (horizon==="12m") d.setMonth(d.getMonth()+12);
  else if (horizon===">2Y") d.setFullYear(d.getFullYear()+2);
  else return null;
  return d.toISOString().slice(0,10);
};
const getTargetDate = (r) => r.targetDate || calcTargetDate(r.date, r.horizon) || null;
const isExpired = (r) => { const td=getTargetDate(r); return td ? td < TODAY : false; };

function Recommendations({ recsReceived, setRecsReceived, recsMade, setRecsMade,
    contacts, groups, assetClasses, setAssetClasses, initFilter, holdings, me, onReload }) {
  const [tab, setTab] = useState("received");
  const myId = me?.id || "me";
  const contactName = (id) => contacts.find(c=>c.id===id)?.name || (id===myId?"You":id);
  const groupName   = (id) => groups.find(g=>g.id===id)?.name || id;
  const recipientName = (id) => groups.find(g=>g.id===id)?.name || contactName(id);
  const reach = (ids) => {
    const s=new Set();
    ids.forEach(id=>{ const g=groups.find(x=>x.id===id);
      if(g) (g.members||[]).filter(m=>m.status==="active"&&m.user_id!==myId).forEach(m=>s.add(m.user_id));
      else if(id!==myId&&id!=="me") s.add(id);
    });
    return s.size;
  };
  const forwardReco = async (r, targetIds, note) => {
    const recipients = targetIds.map(id=>({type:"user",id}));
    await dbForwardReco(r.id, myId, recipients);
    await onReload();
    setTab("made");
  };
  return (<>
    <div className="page-head"><div><div className="eyebrow">Recommendations</div>
      <div className="page-title">Ideas worth tracking</div>
      <div className="page-sub">From your network, and the ones you share</div></div></div>
    <div className="seg" style={{marginBottom:20}}>
      <button className={tab==="received"?"active":""} onClick={()=>setTab("received")}>Received · {recsReceived.filter(r=>!r.hidden).length}</button>
      <button className={tab==="made"?"active":""} onClick={()=>setTab("made")}>Made by me · {recsMade.length}</button>
    </div>
    {tab==="received"
      ? <ReceivedSection recs={recsReceived} setRecs={setRecsReceived} myId={myId}
          contactName={contactName} groupName={groupName} assetClasses={assetClasses}
          contacts={contacts} groups={groups} initBy={initFilter?.by} initGroup={initFilter?.groupId}
          onForward={forwardReco} onReload={onReload}/>
      : <MadeSection recs={recsMade} setRecs={setRecsMade} recipientName={recipientName}
          reach={reach} contacts={contacts} groups={groups} assetClasses={assetClasses}
          setAssetClasses={setAssetClasses} holdings={holdings} me={me} onReload={onReload}/>}
  </>);
}


function ReceivedSection({ recs, setRecs, myId, contactName, groupName, assetClasses, contacts, groups, initBy, initGroup, onForward, onReload }) {
  const [q,setQ]=useState(""); const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [fBy,setFBy]=useState(initBy||"all"),[fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all");
  const [fInv,setFInv]=useState("all"),[fShare,setFShare]=useState("all"),[fGroup,setFGroup]=useState(initGroup||"all"),[fHorizon,setFHorizon]=useState("all");
  const [showHidden,setShowHidden]=useState(false); const [showExpired,setShowExpired]=useState(false);
  const [showAdd,setShowAdd]=useState(false); const [investing,setInvesting]=useState(null);
  const [openRow,setOpenRow]=useState(null); const [fwd,setFwd]=useState(null);

  const recName = (r) => r.byName || contactName(r.from);
  const isForwarded = (r) => r.sharedBy && r.sharedBy!==r.from;
  const sharedByName = (r) => isForwarded(r) ? (r.sharedByName||contactName(r.sharedBy)) : null;
  const byOptions = [...new Set(recs.map(recName))];
  const groupOptions = [...new Set(recs.filter(r=>r.shareType==="group").map(r=>r.groupId).filter(Boolean))];

  // All mutations go through updateDelivery → update local state optimistically
  const patch = async (r, updates) => {
    setRecs(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,...updates}:x));
    if (sql && r.deliveryId) {
      try { await updateDelivery(r.deliveryId, updates, myId); } catch(e) { await onReload(); }
    }
  };
  const doInvest=(r,price)=>patch(r,{isInvested:true,investedPrice:price,invested:true,investedPrice:price});
  const unInvest=(r)=>patch(r,{isInvested:false,investedPrice:null,invested:false});
  const onInvestClick=(r)=>{ if(r.invested) unInvest(r); else setInvesting(r); };
  const react=(r,val)=>{ const next=r.reaction===val?"none":val; patch(r,{reaction:next}); };
  const toggleHide=(r)=>patch(r,{isHidden:!r.hidden,hidden:!r.hidden});
  const toggleExit=(r)=>{ /* Exit signal lives on the recommendation row, only recommender can toggle */ };
  const del=(r)=>{ if(confirm("Remove this recommendation from your received list?")) setRecs(rs=>rs.filter(x=>x.deliveryId!==r.deliveryId)); };

  const rows = useMemo(()=>{
    let r=recs.filter(x=>showHidden||!x.hidden);
    if(!showExpired) r=r.filter(x=>!isExpired(x));
    if(q.trim()){ const s=q.toLowerCase(); r=r.filter(x=>(x.assetName+" "+x.ticker+" "+recName(x)).toLowerCase().includes(s)); }
    if(fBy!=="all") r=r.filter(x=>recName(x)===fBy);
    if(fGroup!=="all") r=r.filter(x=>x.shareType==="group"&&x.groupId===fGroup);
    if(fCls!=="all") r=r.filter(x=>x.assetClass===fCls);
    if(fHorizon!=="all") r=r.filter(x=>x.horizon===fHorizon);
    if(fMoney!=="all") r=r.filter(x=>fMoney==="in"?ret(x)>=0:ret(x)<0);
    if(fInv!=="all") r=r.filter(x=>fInv==="yes"?x.invested:!x.invested);
    if(fShare!=="all") r=r.filter(x=>x.shareType===fShare);
    const dir=sort.dir==="asc"?1:-1; const k=sort.key;
    r=[...r].sort((a,b)=>{let av,bv;
      if(k==="assetName"){av=a.assetName.toLowerCase();bv=b.assetName.toLowerCase();}
      else if(k==="ticker"){av=a.ticker.toLowerCase();bv=b.ticker.toLowerCase();}
      else if(k==="by"){av=recName(a).toLowerCase();bv=recName(b).toLowerCase();}
      else if(k==="date"){av=a.date||"";bv=b.date||"";}
      else if(k==="reco"){av=a.priceAt;bv=b.priceAt;}
      else if(k==="cur"){av=a.price;bv=b.price;}
      else if(k==="ret"){av=ret(a);bv=ret(b);}
      else if(k==="target"){av=a.targetPrice||0;bv=b.targetPrice||0;}
      else if(k==="horizon"){av=HORIZONS.indexOf(a.horizon);bv=HORIZONS.indexOf(b.horizon);}
      else if(k==="tdate"){av=getTargetDate(a)||"";bv=getTargetDate(b)||"";}
      return av<bv?-dir:av>bv?dir:0;});
    return r;
  },[recs,q,fBy,fGroup,fCls,fHorizon,fMoney,fInv,fShare,showHidden,showExpired,sort]);

  const expiredCount = recs.filter(x=>!x.hidden&&isExpired(x)).length;
  const activeFilterNote = fBy!=="all"?`Showing recommendations from ${fBy}.`:fGroup!=="all"?`Showing recommendations shared via ${groupName(fGroup)}.`:null;
  return (<>
    {activeFilterNote && <div className="note info" style={{marginBottom:14}}><Filter size={16}/><div>{activeFilterNote} <span className="clickable" onClick={()=>{setFBy("all");setFGroup("all");}}>Clear filter</span></div></div>}
    {recs.some(r=>r.exitSignal && (showHidden||!r.hidden)) &&
      <div className="note warn" style={{marginBottom:14}}><AlertTriangle size={16}/><div>A recommender has issued an <b>exit signal</b> — affected rows are highlighted below.</div></div>}
    {/* ── Expired toggle banner ── */}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:12,padding:"10px 14px"}}>
      <div className={"sw"+(showExpired?" on":"")} onClick={()=>setShowExpired(v=>!v)}><div className="knob"/></div>
      <span style={{fontSize:13,fontWeight:600,color:"var(--ink-soft)"}}>Show expired recommendations</span>
      {expiredCount>0 && <span className="pill loss" style={{fontSize:12}}>{expiredCount} expired</span>}
      {expiredCount===0 && <span className="muted small">No expired recommendations</span>}
      <span className="muted small" style={{marginLeft:"auto"}}>A recommendation is expired when its target date has passed</span>
    </div>
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by asset or contact…"/></div>
      <div className="fl"><span className="lab">By</span><select className="inline-select sm" value={fBy} onChange={e=>setFBy(e.target.value)}><option value="all">All</option>{byOptions.map(b=><option key={b}>{b}</option>)}</select></div>
      <div className="fl"><span className="lab">Group</span><select className="inline-select sm" value={fGroup} onChange={e=>setFGroup(e.target.value)}><option value="all">All</option>{groupOptions.map(g=><option key={g} value={g}>{groupName(g)}</option>)}</select></div>
      <div className="fl"><span className="lab">Class</span><select className="inline-select sm" value={fCls} onChange={e=>setFCls(e.target.value)}><option value="all">All</option>{assetClasses.map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="fl"><span className="lab">Horizon</span><select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)}><option value="all">All</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}</select></div>
      <div className="fl"><span className="lab">Money</span><select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}><option value="all">All</option><option value="in">In the money</option><option value="out">Out of money</option></select></div>
      <div className="fl"><span className="lab">Invested</span><select className="inline-select sm" value={fInv} onChange={e=>setFInv(e.target.value)}><option value="all">All</option><option value="yes">Yes</option><option value="no">No</option></select></div>
      <div className="fl"><span className="lab">Shared</span><select className="inline-select sm" value={fShare} onChange={e=>setFShare(e.target.value)}><option value="all">All</option><option value="one">One-to-one</option><option value="group">Group</option></select></div>
      <div className="fl"><span className="lab">Show hidden</span><div className={"sw"+(showHidden?" on":"")} onClick={()=>setShowHidden(v=>!v)}><div className="knob"/></div></div>
      <button className="btn btn-pri btn-sm" onClick={()=>setShowAdd(true)}><Plus size={15}/> Add manually</button>
    </div>
    {rows.length===0 ? <div className="card"><div className="empty">No recommendations match your filters.</div></div> :
    <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid" style={{minWidth:1400}}>
      <thead><tr>
        <SortTh label="Asset name" k="assetName" sort={sort} setSort={setSort}/>
        <SortTh label="Ticker" k="ticker" sort={sort} setSort={setSort}/>
        <SortTh label="Recommended by" k="by" sort={sort} setSort={setSort}/>
        <SortTh label="Shared by" k="sharedby" sort={sort} setSort={setSort}/>
        <SortTh label="Class" k="cls" sort={sort} setSort={setSort}/>
        <SortTh label="Date" k="date" sort={sort} setSort={setSort}/>
        <SortTh label="Reco $" k="reco" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Target $" k="target" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Current $" k="cur" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
        <SortTh label="Target date" k="tdate" sort={sort} setSort={setSort}/>
        <th>Status</th>
        <SortTh label="Shared" k="shared" sort={sort} setSort={setSort}/>
        <SortTh label="Invested" k="inv" sort={sort} setSort={setSort}/>
        <th title="Totals the recommender sees">Reactions</th>
        <th style={{textAlign:"right"}}>Actions</th>
      </tr></thead>
      <tbody>{rows.map(r=>{ const itm=ret(r)>=0; const open=openRow===r.id; const exp=isExpired(r); const td=getTargetDate(r);
        return (<React.Fragment key={r.id}>
        <tr className={"hoverable"+(r.exitSignal?" exit":"")+(r.hidden?" hiddenrow":"")+(exp?" expired":"")}>
          <td className="sym nowrap" style={{cursor:"pointer"}} onClick={()=>setOpenRow(open?null:r.id)}>
            <ChevronDown size={14} className="muted" style={{transform:open?"rotate(180deg)":"none",transition:".15s",verticalAlign:-2,marginRight:6}}/>
            {r.assetName}{r.hidden && <span className="pill" style={{marginLeft:8}}>Hidden</span>}{exp && <span className="pill loss" style={{marginLeft:8,fontSize:11}}>Expired</span>}</td>
          <td className="sym">{r.ticker}</td>
          <td className="nowrap">{recName(r)}</td>
          <td className="nowrap">{isForwarded(r)
            ? <span className="pill accent" title={"Forwarded to you by "+sharedByName(r)}><Forward size={11}/> {sharedByName(r)}</span>
            : <span className="muted small">— direct</span>}</td>
          <td><ClassTag c={r.assetClass}/></td>
          <td className="muted small nowrap">{fmtDate(r.date)}</td>
          <td style={{textAlign:"right"}} className="tnum">{r.priceAt ? fmt(r.priceAt) : <span className="muted">—</span>}</td>
          <td style={{textAlign:"right"}} className="tnum">{r.targetPrice ? fmt(r.targetPrice) : <span className="muted">—</span>}</td>
          <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
          <td style={{textAlign:"right"}} className={"tnum nowrap "+(itm?"pos":"neg")}>{fmtPct(ret(r))}</td>
          <td className="nowrap">{r.horizon ? <span className="pill accent" style={{fontSize:11}}>{r.horizon}</span> : <span className="muted">—</span>}</td>
          <td className={"muted small nowrap"+(exp?" neg":"")}>{td ? fmtDate(td) : <span className="muted">—</span>}</td>
          <td className="nowrap"><Money itm={itm}/>{r.exitSignal && <div style={{marginTop:5}}><span className="pill loss"><AlertTriangle size={11}/> EXIT · {fmtDate(r.exitDate)}</span></div>}</td>
          <td>{r.shareType==="group" ? <span className="pill accent nowrap"><Layers size={11}/> {groupName(r.groupId)}</span> : <span className="pill">One-to-one</span>}</td>
          <td className="nowrap">{r.invested
            ? <><button className="btn btn-sm btn-soft" onClick={()=>onInvestClick(r)}><Check size={13}/> Invested</button><div className="muted small" style={{marginTop:4}}>{r.recoActed} acted</div></>
            : <button className="btn btn-sm btn-ghost" onClick={()=>onInvestClick(r)}>Mark invested</button>}</td>
          <td><div className="actions" style={{justifyContent:"flex-start"}} title="Totals the recommender sees">
            <button className={"iconbtn"+(r.reaction==="like"?" on-like":"")} title="Like" onClick={()=>react(r,"like")}><ThumbsUp size={14}/></button>
            <span className="muted small tnum">{r.likes}</span>
            <button className={"iconbtn"+(r.reaction==="dislike"?" on-dislike":"")} title="Dislike" onClick={()=>react(r,"dislike")}><ThumbsDown size={14}/></button>
            <span className="muted small tnum">{r.dislikes}</span></div></td>
          <td><div className="actions">
            <button className="iconbtn" title="Forward to contacts or groups" onClick={()=>setFwd(r)}><Share2 size={14}/></button>
            <button className={"iconbtn"+(r.exitSignal?" on-exit":"")} title="Toggle exit signal" onClick={()=>toggleExit(r)}><LogOut size={14}/></button>
            <button className="iconbtn" title={r.hidden?"Unhide":"Hide"} onClick={()=>toggleHide(r)}>{r.hidden?<Eye size={14}/>:<EyeOff size={14}/>}</button>
            <button className="iconbtn danger" title="Delete permanently" onClick={()=>del(r)}><Trash2 size={14}/></button></div></td>
        </tr>
        {open && <tr className="expand-row"><td colSpan={17}><div className="expand-inner">
          <div style={{maxWidth:820,display:"flex",flexDirection:"column",gap:13}}>
            <div><div className="cap">Thesis from {recName(r)}{isForwarded(r) && <> · forwarded by {sharedByName(r)}</>}</div>
              <div style={{fontSize:14,lineHeight:1.6,color:"var(--ink-soft)"}}>{r.thesis || "No thesis was shared with this recommendation."}</div></div>
            <div style={{display:"flex",gap:28,flexWrap:"wrap"}}>
              <div><div className="cap">Recommended by</div><b>{recName(r)}</b></div>
              {isForwarded(r) && <div><div className="cap">Shared with you by</div><b>{sharedByName(r)}</b></div>}
              <div><div className="cap">Reco → Current</div><b className="tnum">{r.priceAt?fmt(r.priceAt):"—"} → {fmt(r.price)}</b></div>
              {r.targetPrice && <div><div className="cap">Target price</div><b className="tnum">{fmt(r.targetPrice)}</b></div>}
              {r.horizon && <div><div className="cap">Horizon</div><b>{r.horizon}</b></div>}
              {td && <div><div className="cap">Target date</div><b className={exp?"neg":""}>{fmtDate(td)}{exp?" (expired)":""}</b></div>}
              <div><div className="cap">Return</div><b className={"tnum "+(itm?"pos":"neg")}>{fmtPct(ret(r))}</b></div></div>
            <div><button className="btn btn-soft btn-sm" onClick={()=>setFwd(r)}><Share2 size={14}/> Forward this idea</button></div>
          </div></div></td></tr>}
        </React.Fragment>);
      })}</tbody>
    </table></div></div></div>}
    {showAdd && <AddReceivedModal assetClasses={assetClasses} contacts={contacts} groups={groups} onClose={()=>setShowAdd(false)} onAdd={(rec)=>{ setRecs(rs=>[rec,...rs]); setShowAdd(false); }}/>}
    {investing && <InvestPriceModal reco={investing} onClose={()=>setInvesting(null)} onConfirm={(price)=>{ doInvest(investing,price); setInvesting(null); }}/>}
    {fwd && <ShareRecoModal reco={fwd} mode="forward" originName={recName(fwd)} contacts={contacts} groups={groups} onClose={()=>setFwd(null)}
        onShare={(targets,note)=>{ onForward(fwd,targets,note); setFwd(null); }}/>}
  </>);
}
function InvestPriceModal({ reco, onClose, onConfirm }) {
  const [price,setPrice]=useState(String(reco.price));
  const valid = price!=="" && !isNaN(+price) && +price>0;
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:420}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Mark as invested</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:14}}>What price did you invest at for <b style={{color:"var(--ink)"}}>{reco.ticker}</b> — {reco.assetName}?</div>
      <div style={{display:"flex",gap:18,marginBottom:16}}>
        <div><div className="muted small">Reco price</div><div className="tnum" style={{fontWeight:700}}>{fmt(reco.priceAt)}</div></div>
        <div><div className="muted small">Current price</div><div className="tnum" style={{fontWeight:700}}>{fmt(reco.price)}</div></div></div>
      <div className="field"><label>Your entry price</label><input type="number" value={price} autoFocus onChange={e=>setPrice(e.target.value)} onKeyDown={e=>e.key==="Enter"&&valid&&onConfirm(+price)} placeholder="0"/></div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onConfirm(+price)}><Check size={15}/> Confirm invested</button></div></div>
  </div></div>);
}

function ShareRecoModal({ reco, mode, originName, contacts, groups, onClose, onShare }) {
  const [targets,setTargets]=useState([]); const [note,setNote]=useState("");
  const toggle=(id)=>setTargets(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id]);
  const fwd = mode==="forward";
  const valid = targets.length>0;
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>{fwd?<><Forward size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Forward recommendation</>:<><Share2 size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Share recommendation</>}</h3>
      <button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="note info" style={{marginBottom:16}}><Lightbulb size={16}/><div>
        <b>{reco.ticker}</b> — {reco.assetName}{fwd && originName && <> · originally recommended by <b>{originName}</b></>}.
        {fwd && " Forwarding keeps the original recommender credited; you'll appear as the one who shared it."}</div></div>
      <div className="field"><label>Send to contacts</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {contacts.map(c=><span key={c.id} className={"chip"+(targets.includes(c.id)?" sel":"")} onClick={()=>toggle(c.id)}>{targets.includes(c.id)&&<Check size={13}/>}{c.name}</span>)}</div></div>
      <div className="field"><label>Send to groups</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {groups.filter(g=>g.members.includes("me")).map(g=><span key={g.id} className={"chip"+(targets.includes(g.id)?" sel":"")} onClick={()=>toggle(g.id)}>{targets.includes(g.id)&&<Check size={13}/>}<Layers size={13}/>{g.name}</span>)}</div></div>
      <div className="field"><label>Add a note {fwd && <span className="muted small">(optional — replaces the thesis you pass on)</span>}</label>
        <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder={fwd?"Your take when forwarding…":"Anything to add?"}/></div>
    </div>
    <div className="modal-foot"><span className="muted small">{targets.length} selected</span><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={()=>onShare(targets,note)}><Send size={15}/> {fwd?"Forward":"Share"}</button></div></div>
  </div></div>);
}

function HoldPreviewTable({ holdings }) {
  return (<table className="grid"><thead><tr><th>Symbol</th><th>Name</th><th>Type</th><th style={{textAlign:"right"}}>Shares</th><th style={{textAlign:"right"}}>Cost</th><th style={{textAlign:"right"}}>Price</th><th style={{textAlign:"right"}}>Value</th></tr></thead>
    <tbody>{holdings.map(h=>(<tr key={h.id} className="hoverable"><td className="sym">{h.sym}</td><td className="muted small">{h.name}</td><td><TypeTag t={h.type}/></td>
      <td style={{textAlign:"right"}} className="tnum">{h.sh}</td><td style={{textAlign:"right"}} className="tnum">{fmt(h.cost)}</td><td style={{textAlign:"right"}} className="tnum">{fmt(h.price)}</td>
      <td style={{textAlign:"right"}} className="tnum">{fmt(h.sh*h.price)}</td></tr>))}</tbody></table>);
}

function ImportPreviewModal({ result, onClose, onApply }) {
  const [mode,setMode]=useState("append"); const h=result.holdings||[];
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:720}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Upload size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Import portfolio</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:12}}>From <b style={{color:"var(--ink)"}}>{result.fileName}</b> — found <b style={{color:"var(--ink)"}}>{h.length}</b> holding{h.length===1?"":"s"}.</div>
      {(result.warnings||[]).map((w,i)=><div key={i} className="note warn" style={{marginBottom:12}}><AlertTriangle size={16}/><div>{w}</div></div>)}
      {h.length>0 && <>
        <div style={{maxHeight:300,overflow:"auto",border:"1px solid var(--line)",borderRadius:12}}><HoldPreviewTable holdings={h}/></div>
        <div style={{display:"flex",gap:18,marginTop:16}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:600}}><input type="radio" checked={mode==="append"} onChange={()=>setMode("append")} style={{accentColor:"var(--accent)"}}/> Add to my portfolio</label>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:600}}><input type="radio" checked={mode==="replace"} onChange={()=>setMode("replace")} style={{accentColor:"var(--accent)"}}/> Replace everything</label></div>
      </>}
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={h.length===0} onClick={()=>onApply(h,mode)}><Check size={15}/> Import {h.length||""}</button></div></div>
  </div></div>);
}

function PanPullModal({ onClose, onApply }) {
  const [pan,setPan]=useState(""); const [status,setStatus]=useState("idle"); const [err,setErr]=useState(""); const [result,setResult]=useState(null); const [mode,setMode]=useState("append");
  const ok = isValidPAN(pan);
  const pull=async()=>{ setStatus("loading"); setErr(""); try{ const h=await fetchHoldingsByPAN(pan); setResult(h); setStatus("done"); }catch(e){ setErr(e.message); setStatus("idle"); } };
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:result?720:480}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><CreditCard size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Link holdings via PAN</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="note info" style={{marginBottom:16}}><Shield size={16}/><div>Demo only — this calls a mock service. A production build would use a consented aggregator (India's Account Aggregator framework, or a CAS/depository API). Try <b>ABCDE1234F</b> or <b>AAAPZ1234C</b>.</div></div>
      <div className="field"><label>PAN number</label>
        <input autoFocus maxLength={10} style={{textTransform:"uppercase",letterSpacing:1}} value={pan} onChange={e=>{setPan(e.target.value.toUpperCase());setResult(null);setStatus("idle");}} onKeyDown={e=>e.key==="Enter"&&ok&&pull()} placeholder="ABCDE1234F"/>
        {pan && !ok && <div className="neg small" style={{marginTop:6}}>Format: 5 letters, 4 digits, 1 letter.</div>}
        {err && <div className="neg small" style={{marginTop:6}}>{err}</div>}</div>
      {status==="loading" && <div className="muted small" style={{display:"flex",alignItems:"center",gap:8}}><Loader size={15} className="spin"/> Fetching holdings…</div>}
      {result && <>
        <div className="muted small" style={{margin:"4px 0 12px"}}>Found <b style={{color:"var(--ink)"}}>{result.length}</b> holdings linked to this PAN.</div>
        <div style={{maxHeight:280,overflow:"auto",border:"1px solid var(--line)",borderRadius:12}}><HoldPreviewTable holdings={result}/></div>
        <div style={{display:"flex",gap:18,marginTop:16}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:600}}><input type="radio" checked={mode==="append"} onChange={()=>setMode("append")} style={{accentColor:"var(--accent)"}}/> Add to my portfolio</label>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:600}}><input type="radio" checked={mode==="replace"} onChange={()=>setMode("replace")} style={{accentColor:"var(--accent)"}}/> Replace everything</label></div>
      </>}
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      {result ? <button className="btn btn-pri" onClick={()=>onApply(result,mode)}><Check size={15}/> Import {result.length}</button>
              : <button className="btn btn-pri" disabled={!ok||status==="loading"} onClick={pull}><CreditCard size={15}/> Fetch holdings</button>}</div></div>
  </div></div>);
}

function MadeSection({ recs, setRecs, recipientName, reach, contacts, groups, assetClasses, setAssetClasses, holdings, me, onReload }) {
  const [q,setQ]=useState(""); const [fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all"),[fHorizon,setFHorizon]=useState("all");
  const [showExpired,setShowExpired]=useState(false);
  const [sort,setSort]=useState({key:"date",dir:"desc"}); const [expanded,setExpanded]=useState(null); const [showNew,setShowNew]=useState(false); const [share,setShare]=useState(null);
  const del=(r)=>{ if(confirm("Delete this recommendation you made?")) setRecs(rs=>rs.filter(x=>x.id!==r.id)); };
  const toggleExit=async(r)=>{
    setRecs(rs=>rs.map(x=>x.id===r.id?{...x,exit:!x.exit,exitDate:!x.exit?TODAY:null}:x));
    if(sql && me?.id){ try{ await dbToggleExit(r.id,me.id); await onReload(); }catch(_){} }
  };
  const reShare=(r,targets)=>setRecs(rs=>rs.map(x=>x.id===r.id?{...x,recipients:[...new Set([...x.recipients,...targets])]}:x));
  const exp=(id,which)=>setExpanded(e=> e&&e.id===id&&e.which===which?null:{id,which});
  const rows = useMemo(()=>{
    let r=[...recs];
    if(!showExpired) r=r.filter(x=>!isExpired(x));
    if(q.trim()){ const s=q.toLowerCase(); r=r.filter(x=>(x.assetName+" "+x.ticker).toLowerCase().includes(s)); }
    if(fCls!=="all") r=r.filter(x=>x.assetClass===fCls);
    if(fHorizon!=="all") r=r.filter(x=>x.horizon===fHorizon);
    if(fMoney!=="all") r=r.filter(x=> fMoney==="in"?ret(x)>=0:ret(x)<0);
    const dir=sort.dir==="asc"?1:-1; const k=sort.key;
    r.sort((a,b)=>{ let av,bv;
      if(k==="assetName"){av=a.assetName.toLowerCase();bv=b.assetName.toLowerCase();}
      else if(k==="ticker"){av=a.ticker.toLowerCase();bv=b.ticker.toLowerCase();}
      else if(k==="cls"){av=a.assetClass.toLowerCase();bv=b.assetClass.toLowerCase();}
      else if(k==="date"){av=a.date;bv=b.date;}
      else if(k==="reco"){av=a.priceAt;bv=b.priceAt;}
      else if(k==="cur"){av=a.price;bv=b.price;}
      else if(k==="ret"){av=ret(a);bv=ret(b);}
      else if(k==="target"){av=a.targetPrice||0;bv=b.targetPrice||0;}
      else if(k==="horizon"){av=HORIZONS.indexOf(a.horizon);bv=HORIZONS.indexOf(b.horizon);}
      else if(k==="tdate"){av=getTargetDate(a)||"";bv=getTargetDate(b)||"";}
      else if(k==="acted"){av=a.actedList.length;bv=b.actedList.length;}
      else if(k==="likes"){av=a.likes.length;bv=b.likes.length;}
      else if(k==="dislikes"){av=a.dislikes.length;bv=b.dislikes.length;}
      return av<bv?-dir:av>bv?dir:0; });
    return r;
  },[recs,q,fCls,fHorizon,fMoney,showExpired,sort]);
  const expiredCount = recs.filter(x=>isExpired(x)).length;
  const COLS=16;
  return (<>
    {/* ── Expired toggle banner ── */}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:12,padding:"10px 14px"}}>
      <div className={"sw"+(showExpired?" on":"")} onClick={()=>setShowExpired(v=>!v)}><div className="knob"/></div>
      <span style={{fontSize:13,fontWeight:600,color:"var(--ink-soft)"}}>Show expired recommendations</span>
      {expiredCount>0 && <span className="pill loss" style={{fontSize:12}}>{expiredCount} expired</span>}
      {expiredCount===0 && <span className="muted small">No expired recommendations</span>}
      <span className="muted small" style={{marginLeft:"auto"}}>A recommendation is expired when its target date has passed</span>
    </div>
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by asset…"/></div>
      <div className="fl"><span className="lab">Class</span><select className="inline-select sm" value={fCls} onChange={e=>setFCls(e.target.value)}><option value="all">All</option>{assetClasses.map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="fl"><span className="lab">Horizon</span><select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)}><option value="all">All</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}</select></div>
      <div className="fl"><span className="lab">Money</span><select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}><option value="all">All</option><option value="in">In the money</option><option value="out">Out of money</option></select></div>
      <button className="btn btn-pri btn-sm" onClick={()=>setShowNew(true)}><Plus size={15}/> New recommendation</button>
    </div>
    {rows.length===0 ? <div className="card"><div className="empty">No recommendations match your filters.</div></div> :
    <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid" style={{minWidth:1400}}>
      <thead><tr>
        <SortTh label="Asset name" k="assetName" sort={sort} setSort={setSort}/>
        <SortTh label="Ticker" k="ticker" sort={sort} setSort={setSort}/>
        <SortTh label="Class" k="cls" sort={sort} setSort={setSort}/>
        <SortTh label="Date" k="date" sort={sort} setSort={setSort}/>
        <th>Shared with</th>
        <SortTh label="Reco $" k="reco" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Target $" k="target" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Current $" k="cur" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
        <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
        <SortTh label="Target date" k="tdate" sort={sort} setSort={setSort}/>
        <th>Status</th>
        <SortTh label="Acted on it" k="acted" sort={sort} setSort={setSort}/>
        <SortTh label="Likes" k="likes" sort={sort} setSort={setSort}/>
        <SortTh label="Dislikes" k="dislikes" sort={sort} setSort={setSort}/>
        <th style={{textAlign:"right"}}>Actions</th>
      </tr></thead>
      <tbody>{rows.map(r=>{ const itm=ret(r)>=0; const isExp=expanded&&expanded.id===r.id; const expired=isExpired(r); const td=getTargetDate(r);
        return (<React.Fragment key={r.id}>
          <tr className={"hoverable"+(r.exit?" exit":"")+(expired?" expired":"")}>
            <td className="sym nowrap">{r.assetName}{r.forwardedFrom && <span className="pill accent" style={{marginLeft:8}} title={"Forwarded from "+r.forwardedFrom}><Forward size={11}/> via {r.forwardedFrom}</span>}{expired && <span className="pill loss" style={{marginLeft:8,fontSize:11}}>Expired</span>}</td>
            <td className="sym">{r.ticker}</td>
            <td><ClassTag c={r.assetClass}/></td>
            <td className="muted small nowrap">{fmtDate(r.date)}</td>
            <td><div style={{display:"flex",flexWrap:"wrap",gap:5,maxWidth:210}}>{r.recipients.map(id=><span key={id} className="chip mini">{recipientName(id)}</span>)}</div></td>
            <td style={{textAlign:"right"}} className="tnum">{r.priceAt?fmt(r.priceAt):<span className="muted">—</span>}</td>
            <td style={{textAlign:"right"}} className="tnum">{r.targetPrice?fmt(r.targetPrice):<span className="muted">—</span>}</td>
            <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
            <td style={{textAlign:"right"}} className={"tnum nowrap "+(itm?"pos":"neg")}>{fmtPct(ret(r))}</td>
            <td className="nowrap">{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
            <td className={"muted small nowrap"+(expired?" neg":"")}>{td?fmtDate(td):<span className="muted">—</span>}</td>
            <td className="nowrap"><Money itm={itm}/>{r.exit && <div style={{marginTop:5}}><span className="pill loss"><LogOut size={11}/> Exit · {fmtDate(r.exitDate)}</span></div>}</td>
            <td><span className="clickable nowrap" onClick={()=>exp(r.id,"acted")}>{r.actedList.length} of {reach(r.recipients)} <ChevronDown size={13} style={{transform:isExp&&expanded.which==="acted"?"rotate(180deg)":"none"}}/></span></td>
            <td><span className="clickable" onClick={()=>exp(r.id,"likes")}><ThumbsUp size={13}/> {r.likes.length}</span></td>
            <td><span className="clickable" onClick={()=>exp(r.id,"dislikes")}><ThumbsDown size={13}/> {r.dislikes.length}</span></td>
            <td><div className="actions">
              <button className="iconbtn" title="Share with more contacts or groups" onClick={()=>setShare(r)}><Share2 size={14}/></button>
              <button className={"btn btn-sm "+(r.exit?"btn-ghost":"btn-soft")} onClick={()=>toggleExit(r)}><LogOut size={13}/> {r.exit?"Cancel exit":"Send exit"}</button>
              <button className="iconbtn danger" title="Delete" onClick={()=>del(r)}><Trash2 size={14}/></button></div></td>
          </tr>
          {isExp && <tr className="expand-row"><td colSpan={COLS}><div className="expand-sub">
            {expanded.which==="acted" && <><b style={{fontSize:13}}>Acted on it ({r.actedList.length})</b>
              {r.actedList.length===0?<div className="muted small" style={{marginTop:8}}>No one yet.</div>:
              <div className="namelist" style={{marginTop:10}}>{r.actedList.map((a,i)=><span key={i} className="nl-item"><span className="av" style={{width:26,height:26,background:CONTACT_COLORS[i%CONTACT_COLORS.length],fontSize:10}}>{initialsOf(a.name)}</span>{a.name} <span className="muted small">· {fmtDate(a.date)}</span></span>)}</div>}</>}
            {expanded.which==="likes" && <><b style={{fontSize:13}}>Liked by ({r.likes.length})</b>
              {r.likes.length===0?<div className="muted small" style={{marginTop:8}}>No likes yet.</div>:
              <div className="namelist" style={{marginTop:10}}>{r.likes.map((n,i)=><span key={i} className="nl-item"><span className="av" style={{width:26,height:26,background:CONTACT_COLORS[i%CONTACT_COLORS.length],fontSize:10}}>{initialsOf(n)}</span>{n}</span>)}</div>}</>}
            {expanded.which==="dislikes" && <><b style={{fontSize:13}}>Disliked by ({r.dislikes.length})</b>
              {r.dislikes.length===0?<div className="muted small" style={{marginTop:8}}>No dislikes.</div>:
              <div className="namelist" style={{marginTop:10}}>{r.dislikes.map((n,i)=><span key={i} className="nl-item"><span className="av" style={{width:26,height:26,background:"#8d90ad",fontSize:10}}>{initialsOf(n)}</span>{n}</span>)}</div>}</>}
          </div></td></tr>}
        </React.Fragment>);
      })}</tbody>
    </table></div></div></div>}
    {showNew && <MakeRecoModal assetClasses={assetClasses} setAssetClasses={setAssetClasses} contacts={contacts} groups={groups} holdings={holdings} me={me} onClose={()=>setShowNew(false)} onCreate={(rec)=>{ setRecs(rs=>[rec,...rs]); setShowNew(false); }}/>}
    {share && <ShareRecoModal reco={share} mode="share" contacts={contacts} groups={groups} onClose={()=>setShare(null)}
        onShare={(targets)=>{ reShare(share,targets); setShare(null); }}/>}
  </>);
}

function AddReceivedModal({ assetClasses, contacts, groups, onClose, onAdd }) {
  const [f,setF]=useState({ assetName:"", ticker:"", by:"", assetClass:assetClasses[0], date:TODAY, recoPrice:"", curPrice:"", targetPrice:"", horizon:"12m", shareType:"one", groupId:groups[0]?.id||"", invested:false, investedPrice:"", thesis:"" });
  const up=(k,v)=>setF(s=>({...s,[k]:v}));
  const valid = f.assetName.trim() && f.by.trim() && f.recoPrice && f.curPrice && (!f.invested || f.investedPrice);
  const save=()=>onAdd({ id:"r"+Date.now(), from:null, byName:f.by.trim(), assetName:f.assetName.trim(), ticker:(f.ticker||"—").toUpperCase(), assetClass:f.assetClass, date:f.date||TODAY,
    priceAt:+f.recoPrice, price:+f.curPrice, targetPrice:f.targetPrice?+f.targetPrice:null, horizon:f.horizon||null, targetDate:calcTargetDate(f.date||TODAY,f.horizon),
    invested:f.invested, investedPrice:f.invested?(+f.investedPrice):null, recoActed:f.invested?1:0, shareType:f.shareType, groupId:f.shareType==="group"?f.groupId:null,
    reaction:"none", likes:0, dislikes:0, exitSignal:false, exitDate:null, hidden:false, thesis:f.thesis.trim()||null });
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Plus size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Add a recommendation</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="muted small" style={{marginBottom:14}}>Log a tip someone shared with you offline — fill in the details yourself.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,columnGap:14}}>
        <div className="field"><label>Asset name</label><input value={f.assetName} onChange={e=>up("assetName",e.target.value)} placeholder="e.g. Apple Inc."/></div>
        <div className="field"><label>Ticker</label><input value={f.ticker} onChange={e=>up("ticker",e.target.value)} placeholder="AAPL"/></div>
        <div className="field"><label>Recommended by</label><input value={f.by} onChange={e=>up("by",e.target.value)} placeholder="Name" list="cnames"/>
          <datalist id="cnames">{contacts.map(c=><option key={c.id} value={c.name}/>)}</datalist></div>
        <div className="field"><label>Asset class</label><select value={f.assetClass} onChange={e=>up("assetClass",e.target.value)}>{assetClasses.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Date</label><input type="date" value={f.date} onChange={e=>up("date",e.target.value)}/></div>
        <div className="field"><label>Shared as</label><select value={f.shareType} onChange={e=>up("shareType",e.target.value)}><option value="one">One-to-one</option><option value="group">Group</option></select></div>
        <div className="field"><label>Reco price</label><input type="number" value={f.recoPrice} onChange={e=>up("recoPrice",e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Current price</label><input type="number" value={f.curPrice} onChange={e=>up("curPrice",e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Target price <span className="muted small">(optional)</span></label><input type="number" value={f.targetPrice} onChange={e=>up("targetPrice",e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Target horizon</label><select value={f.horizon} onChange={e=>up("horizon",e.target.value)}>{HORIZONS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
        {f.shareType==="group" && <div className="field" style={{gridColumn:"1 / span 2"}}><label>Group</label><select value={f.groupId} onChange={e=>up("groupId",e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>}
      </div>
      <div className="field"><label>Thesis <span className="muted small">(optional — shown when the row is expanded)</span></label>
        <textarea rows={2} value={f.thesis} onChange={e=>up("thesis",e.target.value)} placeholder="What was their reasoning?"/></div>
      <label style={{display:"flex",alignItems:"center",gap:9,fontSize:14,fontWeight:600,cursor:"pointer"}}><input type="checkbox" checked={f.invested} onChange={e=>up("invested",e.target.checked)} style={{width:17,height:17,accentColor:"var(--accent)"}}/> I've already invested on this</label>
      {f.invested && <div className="field" style={{marginTop:12,maxWidth:220}}><label>My entry price</label><input type="number" value={f.investedPrice} onChange={e=>up("investedPrice",e.target.value)} placeholder="0"/></div>}
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid} onClick={save}>Add recommendation</button></div></div>
  </div></div>);
}

function MakeRecoModal({ assetClasses, setAssetClasses, contacts, groups, holdings, me, onClose, onCreate }) {
  const myId = me?.id || "me";
  const myGroups = groups.filter(g=>g.my_role==="admin"||g.members?.some(m=>m.user_id===myId&&m.status==="active"));
  const [selectedInstr, setSelectedInstr] = useState(null); // from InstrumentSearch
  const [assetName,   setAssetName]   = useState("");
  const [ticker,      setTicker]      = useState("");
  const [cls,         setCls]         = useState(assetClasses[0]);
  const [currency,    setCurrency]    = useState("INR");
  const [recoPrice,   setRecoPrice]   = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [horizon,     setHorizon]     = useState("12m");
  const [thesis,      setThesis]      = useState("");
  const [targets,     setTargets]     = useState([]);
  const [adding,      setAdding]      = useState(false);
  const [newCat,      setNewCat]      = useState("");

  const CURRENCY_SYMBOL = { INR:"₹", USD:"$", GBP:"£", EUR:"€" };

  // When user picks an instrument from search — auto-fill all fields
  const onInstrSelect = (inst) => {
    if (!inst) return; // cleared
    setSelectedInstr(inst);
    setTicker(inst.symbol);
    setAssetName(inst.name);
    setCls(inst.assetClass || assetClasses[0]);
    setCurrency(inst.currency || "INR");
  };

  const toggle  = (id) => setTargets(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id]);
  const addCat  = () => { const c=newCat.trim(); if(c&&!assetClasses.includes(c)){setAssetClasses(a=>[...a,c]);setCls(c);} setNewCat(""); setAdding(false); };
  const known   = holdings.find(x=>x.sym===ticker.toUpperCase());
  const suggestedPrice   = known?.price;
  const effectiveRecoPrice = recoPrice || (suggestedPrice||"");

  const create = async () => {
    const rp = +effectiveRecoPrice;
    const td = calcTargetDate(TODAY, horizon);
    const recoData = {
      assetName: assetName.trim()||(known?known.name:ticker.toUpperCase()),
      ticker:(ticker||"—").toUpperCase(), assetClass:cls, currency,
      priceAt:rp, price:known?known.price:rp,
      targetPrice:targetPrice?+targetPrice:null, horizon, targetDate:td, thesis:thesis||"—",
    };
    const recipients = targets.map(id=>({ type:groups.some(g=>g.id===id)?"group":"user", id }));
    if (sql && me?.id) {
      try { await dbCreateReco(recoData, me.id, recipients); await onCreate?.reload?.(); }
      catch(e) { console.error("create reco:", e); }
    }
    onCreate({ id:"m"+Date.now(), ...recoData, date:TODAY, recipients:targets, actedList:[], likes:[], dislikes:[], exit:false, exitDate:null });
  };

  const valid = (assetName.trim()||ticker.trim()) && targets.length>0 && effectiveRecoPrice;

  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Sparkles size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> New recommendation</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">

      {/* Instrument search — primary entry point */}
      <div className="field"><label>Search instrument <span className="muted small">(type symbol or company name)</span></label>
        <InstrumentSearch onSelect={onInstrSelect} placeholder="e.g. RELIANCE or Reliance Industries…"/>
      </div>

      {/* Manual override if instrument not in list */}
      <details style={{marginBottom:14}}>
        <summary style={{fontSize:12,fontWeight:600,color:"var(--muted)",cursor:"pointer",userSelect:"none",marginBottom:8}}>Not in the list? Enter manually</summary>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:14,paddingTop:8}}>
          <div className="field"><label>Ticker / Symbol</label>
            <input value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="e.g. AAPL" list="myh"/>
            <datalist id="myh">{holdings.map(h=><option key={h.id} value={h.sym}>{h.name}</option>)}</datalist></div>
          <div className="field"><label>Asset name</label>
            <input value={assetName} onChange={e=>setAssetName(e.target.value)} placeholder="e.g. Apple Inc."/></div>
        </div>
      </details>

      {/* Show selected instrument summary */}
      {selectedInstr && (
        <div style={{display:"flex",gap:8,marginBottom:14,padding:"10px 12px",background:"var(--accent-soft)",borderRadius:10,alignItems:"center"}}>
          <Check size={15} color="var(--accent-ink)"/>
          <span style={{fontSize:13,fontWeight:600,color:"var(--accent-ink)"}}>{selectedInstr.symbol} — {selectedInstr.name}</span>
          <span className="chip mini" style={{marginLeft:"auto"}}>{selectedInstr.exchange}</span>
          <span className="chip mini">{selectedInstr.assetClass}</span>
          <span className="chip mini">{CURRENCY_SYMBOL[selectedInstr.currency]||selectedInstr.currency} {selectedInstr.currency}</span>
        </div>
      )}

      <div className="field"><label style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>Asset class</span>
        <span className="clickable" style={{fontSize:12}} onClick={()=>setAdding(a=>!a)}><Plus size={13}/> Add category</span></label>
        {adding
          ? <div style={{display:"flex",gap:8}}><input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="New category name" onKeyDown={e=>e.key==="Enter"&&addCat()}/><button className="btn btn-pri btn-sm" onClick={addCat}>Add</button></div>
          : <select value={cls} onChange={e=>setCls(e.target.value)}>{assetClasses.map(c=><option key={c}>{c}</option>)}</select>}</div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",columnGap:14}}>
        <div className="field"><label>Currency</label>
          <select value={currency} onChange={e=>setCurrency(e.target.value)}>
            {["INR","USD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
          </select></div>
        <div className="field">
          <label>Reco price ({CURRENCY_SYMBOL[currency]||currency}) {known && <span className="muted small">portfolio: {fmt(known.price)}</span>}</label>
          <input type="number" value={recoPrice} onChange={e=>setRecoPrice(e.target.value)} placeholder={suggestedPrice?String(suggestedPrice):"0"}/>
        </div>
        <div className="field"><label>Target price <span className="muted small">(opt.)</span></label>
          <input type="number" value={targetPrice} onChange={e=>setTargetPrice(e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Horizon</label>
          <select value={horizon} onChange={e=>setHorizon(e.target.value)}>{HORIZONS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
      </div>

      <div className="field"><label>Your thesis</label><textarea rows={3} value={thesis} onChange={e=>setThesis(e.target.value)} placeholder="Why should they look at this?"/></div>
      <div className="field"><label>Send to contacts</label>
        {contacts.length===0 ? <div className="muted small">No contacts yet.</div> :
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{contacts.map(c=><span key={c.id} className={"chip"+(targets.includes(c.id)?" sel":"")} onClick={()=>toggle(c.id)}>{targets.includes(c.id)&&<Check size={13}/>}{c.name}</span>)}</div>}</div>
      <div className="field"><label>Send to groups</label>
        {myGroups.length===0 ? <div className="muted small">No groups yet.</div> :
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{myGroups.map(g=><span key={g.id} className={"chip"+(targets.includes(g.id)?" sel":"")} onClick={()=>toggle(g.id)}>{targets.includes(g.id)&&<Check size={13}/>}<Layers size={13}/>{g.name}</span>)}</div>}</div>
    </div>
    <div className="modal-foot">
      <span className="muted small">Target date: {calcTargetDate(TODAY,horizon)?fmtDate(calcTargetDate(TODAY,horizon)):"—"}</span>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" disabled={!valid} onClick={create}><Send size={15}/> Send</button></div>
    </div>
  </div></div>);
}

/* =================================================================== SHARING */
function Sharing({ sharing, setSharing, configs, holdings, contacts, groups }) {
  const [previewId, setPreviewId] = useState(null); const [pickFor, setPickFor] = useState(null);
  const nameOfLive = (id) => contacts.find(c=>c.id===id)?.name ?? groups.find(g=>g.id===id)?.name ?? id;
  const set=(id,patch)=>setSharing(s=>({...s,[id]:{...s[id],...patch}}));
  const Row = ({ id, name, sub, color, isGroup }) => {
    const cfg = sharing[id] || { visibility:"off", level:"names", selected:[] }; const off = cfg.visibility==="off";
    return (<tr className="hoverable">
      <td><div style={{ display:"flex", gap:11, alignItems:"center" }}>
        <div className="av" style={{ width:36, height:36, background:color, fontSize:13 }}>{isGroup?<Layers size={16}/>:initialsOf(name)}</div>
        <div><div style={{fontWeight:600}}>{name}</div><div className="muted small">{sub}</div></div></div></td>
      <td><select className="inline-select" value={cfg.visibility} onChange={e=>set(id,{visibility:e.target.value})}>
          <option value="off">Nothing</option><option value="all">Whole portfolio</option><option value="selected">Selected holdings</option></select>
        {cfg.visibility==="selected" && <div style={{marginTop:7}}><button className="btn btn-soft btn-sm" onClick={()=>setPickFor(id)}>{cfg.selected.length} chosen · edit</button></div>}</td>
      <td><div className="seg tiny" style={{ opacity:off?.45:1, pointerEvents:off?"none":"auto" }}>
          <button className={cfg.level==="names"?"active":""} onClick={()=>set(id,{level:"names"})}>Names</button>
          <button className={cfg.level==="full"?"active":""} disabled={!configs.allowAmountSharing} onClick={()=>set(id,{level:"full"})}>+ Amounts & P&L</button></div></td>
      <td style={{ textAlign:"right" }}><button className="btn btn-ghost btn-sm" disabled={off} onClick={()=>setPreviewId(id)}><Eye size={14}/> Preview</button></td>
    </tr>);
  };
  return (<>
    <div className="page-head"><div><div className="eyebrow">Sharing & Privacy</div><div className="page-title">Who sees what</div>
      <div className="page-sub">Set visibility per person or group, and how much detail.</div></div></div>
    {!configs.allowAmountSharing && <div className="card" style={{ marginBottom:16, borderLeft:"3px solid var(--accent)" }}><div className="card-body" style={{padding:"13px 16px", fontSize:13, display:"flex", gap:8, alignItems:"center"}}>
      <Lock size={15}/> Amount & P&L sharing is turned off by the administrator — only holding names can be shared right now.</div></div>}
    <div className="card" style={{ marginBottom:18 }}><div className="card-head"><span style={{display:"flex",gap:8,alignItems:"center"}}><Users size={16}/> Friends</span></div>
      <div className="card-body" style={{padding:"8px 10px"}}><table className="grid"><thead><tr><th>Connection</th><th>Can see</th><th>Detail level</th><th></th></tr></thead>
        <tbody>{contacts.map(f=><Row key={f.id} id={f.id} name={f.name} sub={f.title} color={f.color}/>)}</tbody></table></div></div>
    <div className="card"><div className="card-head"><span style={{display:"flex",gap:8,alignItems:"center"}}><Layers size={16}/> Groups</span></div>
      <div className="card-body" style={{padding:"8px 10px"}}><table className="grid"><thead><tr><th>Group</th><th>Can see</th><th>Detail level</th><th></th></tr></thead>
        <tbody>{groups.filter(g=>g.members.includes("me")).map(g=><Row key={g.id} id={g.id} name={g.name} sub={`${g.members.length} members`} color={g.color} isGroup/>)}</tbody></table></div></div>
    {pickFor && <HoldingsPicker entityName={nameOfLive(pickFor)} holdings={holdings} selected={sharing[pickFor].selected} onClose={()=>setPickFor(null)} onSave={(sel)=>{ set(pickFor,{selected:sel}); setPickFor(null); }}/>}
    {previewId && <SharePreview id={previewId} name={nameOfLive(previewId)} cfg={sharing[previewId]} holdings={holdings} onClose={()=>setPreviewId(null)}/>}
  </>);
}
function HoldingsPicker({ entityName, holdings, selected, onClose, onSave }) {
  const [sel, setSel] = useState(selected); const toggle=(id)=>setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Holdings shared with {entityName}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">{holdings.map(h=>(
      <label key={h.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 4px", borderBottom:"1px solid var(--line)", cursor:"pointer" }}>
        <input type="checkbox" checked={sel.includes(h.id)} onChange={()=>toggle(h.id)} style={{ width:17, height:17, accentColor:"var(--accent)" }}/>
        <span className="sym" style={{width:62}}>{h.sym}</span><span className="muted small" style={{flex:1}}>{h.name}</span><TypeTag t={h.type}/></label>))}</div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={()=>onSave(sel)}>Save · {sel.length}</button></div></div>
  </div></div>);
}
function SharePreview({ id, name, cfg, holdings, onClose }) {
  const rows = holdings.filter(h=> cfg.visibility==="all"?true:cfg.selected.includes(h.id)).map(h=>({...h,value:h.sh*h.price,pnlPct:(h.price-h.cost)/h.cost}));
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>As seen by {name}</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body"><div className="muted small" style={{ marginBottom:14, display:"flex", gap:6, alignItems:"center" }}>
      {cfg.level==="full" ? "They see names, amounts and P&L for these holdings." : <><Lock size={13}/> They see names only — amounts and P&L stay private.</>}</div>
      <table className="grid"><thead><tr><th>Asset</th><th>Type</th>{cfg.level==="full" && <><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>P&L</th></>}</tr></thead>
        <tbody>{rows.map(r=>(<tr key={r.id} className="hoverable"><td><span className="sym">{r.sym}</span><div className="muted small">{r.name}</div></td><td><TypeTag t={r.type}/></td>
          {cfg.level==="full" && <><td style={{textAlign:"right"}} className="tnum">{fmt(r.value)}</td><td style={{textAlign:"right"}} className={"tnum "+(r.pnlPct>=0?"pos":"neg")}>{fmtPct(r.pnlPct)}</td></>}</tr>))}</tbody></table></div>
  </div></div>);
}

/* =================================================================== PROFILE */
function ProfileModal({ me, updateProfile, onClose }) {
  const [editing,   setEditing]   = useState(false);
  const [firstName, setFirstName] = useState(me.firstName || "");
  const [lastName,  setLastName]  = useState(me.lastName  || "");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");
  const [saved,     setSaved]     = useState(false);

  const startEdit = () => { setFirstName(me.firstName||""); setLastName(me.lastName||""); setEditing(true); setErr(""); setSaved(false); };
  const cancel    = () => { setEditing(false); setErr(""); };

  const save = async () => {
    if (!firstName.trim()) { setErr("First name is required."); return; }
    setSaving(true); setErr("");
    const result = await updateProfile(firstName, lastName);
    if (result?.error) { setErr(result.error); setSaving(false); return; }
    setSaving(false);
    setEditing(false);
    setSaved(true);
  };

  return (
    <div style={{
      position:"absolute", top:50, right:0, width:360,
      background:"var(--surface)", border:"1px solid var(--line)",
      borderRadius:18, boxShadow:"0 8px 32px rgba(0,0,0,.13)",
      zIndex:200, overflow:"hidden",
    }} onClick={e=>e.stopPropagation()}>

      {/* Header */}
      <div style={{background:"var(--grad)",padding:"24px 22px 20px",display:"flex",gap:14,alignItems:"center"}}>
        <div style={{width:52,height:52,borderRadius:16,background:"rgba(255,255,255,.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#fff",flexShrink:0}}>
          {me.initials}
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:17,color:"#fff",lineHeight:1.2}}>{me.name}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:3}}>Investor</div>
        </div>
        <button className="icon-btn" style={{background:"rgba(255,255,255,.18)",border:"none",color:"#fff"}} onClick={onClose}><X size={18}/></button>
      </div>

      {/* Body */}
      <div style={{padding:"20px 22px"}}>
        {saved && <div className="note ok" style={{marginBottom:14}}><Check size={15}/><div>Profile updated successfully.</div></div>}
        {err   && <div className="note warn" style={{marginBottom:14}}><AlertTriangle size={15}/><div>{err}</div></div>}

        {/* First name */}
        <div className="field">
          <label>First name <span style={{color:"var(--loss)"}}>*</span></label>
          {editing
            ? <input value={firstName} onChange={e=>setFirstName(e.target.value)} autoFocus placeholder="First name"/>
            : <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,fontSize:14,background:"var(--surface-2)"}}>{me.firstName || <span className="muted">—</span>}</div>}
        </div>

        {/* Last name */}
        <div className="field">
          <label>Last name <span className="muted small">(optional)</span></label>
          {editing
            ? <input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Last name" onKeyDown={e=>e.key==="Enter"&&save()}/>
            : <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,fontSize:14,background:"var(--surface-2)"}}>{me.lastName || <span className="muted">—</span>}</div>}
        </div>

        {/* Email — read-only */}
        <div className="field" style={{marginBottom:0}}>
          <label>Email address <span className="muted small">(cannot be changed)</span></label>
          <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,fontSize:14,color:"var(--muted)",background:"var(--surface-2)"}}>{me.email}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{padding:"14px 22px",borderTop:"1px solid var(--line)",display:"flex",justifyContent:"flex-end",gap:10}}>
        {!editing && <button className="btn btn-pri btn-sm" onClick={startEdit}><Pencil size={14}/> Edit profile</button>}
        {editing  && <>
          <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>
          <button className="btn btn-pri btn-sm" disabled={saving||!firstName.trim()} onClick={save}>
            {saving ? <><Loader size={14} className="spin"/> Saving…</> : <><Check size={14}/> Save</>}
          </button>
        </>}
      </div>
    </div>
  );
}

/* =================================================================== HOME */
function HomeFeed({ setPage, recsReceived, configs, holdings, contacts }) {
  const { total, pnl, pnlPct } = useDerivedHoldings(holdings, configs.allowCryptoAccounts);
  // Build feed from real received recommendations (most recent 5, not hidden)
  const feedRecs = recsReceived.filter(r=>!r.hidden).slice(0,5);

  const contactFor = (r) => {
    const found = contacts.find(x=>x.id===r.from);
    if (found) return found;
    const name = r.byName || "Someone";
    return { name, initials: initialsOf(name), color:"#8d90ad" };
  };

  return (<div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:22 }}>
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Welcome back</div><div className="page-title">Recent activity</div>
          <div className="page-sub">{recsReceived.length} recommendations received · {contacts.length} connections</div></div>
        <button className="btn btn-pri btn-sm" onClick={()=>setPage("recs")}><Lightbulb size={15}/> Recommend an idea</button>
      </div>

      {feedRecs.length===0
        ? <div className="card"><div className="card-body" style={{padding:"48px 32px",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>👋</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Your feed is empty</div>
            <div className="muted small" style={{marginBottom:20,maxWidth:340,margin:"0 auto 20px"}}>
              Add people to your network and start receiving investment recommendations — they'll show up here.
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button className="btn btn-pri btn-sm" onClick={()=>setPage("network")}><Users size={15}/> Add connections</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setPage("recs")}><Plus size={15}/> Add a recommendation</button>
            </div>
          </div></div>
        : feedRecs.map(r=>{
            const cf = contactFor(r);
            const itm = r.price > r.priceAt;
            return (<div key={r.id} className="feed-card">
              <div className="feed-head">
                <Avatar f={cf} size={42}/>
                <div style={{flex:1}}>
                  <div><b>{cf.name}</b> <span className="muted">recommended {r.ticker} — {r.assetName}</span></div>
                  <div className="muted small">{fmtDate(r.date)}</div>
                </div>
                <span className={"pill "+(itm?"gain":"loss")}>{r.ticker} {fmtPct((r.price-r.priceAt)/r.priceAt)}</span>
              </div>
              {r.thesis && <div style={{fontSize:14,color:"var(--ink-soft)",lineHeight:1.6,marginBottom:10}}>{r.thesis}</div>}
              {r.horizon && <div style={{display:"flex",gap:8,marginBottom:10}}>
                <span className="pill accent" style={{fontSize:11}}>Horizon: {r.horizon}</span>
                {r.targetPrice && <span className="pill" style={{fontSize:11}}>Target: {fmt(r.targetPrice)}</span>}
              </div>}
              <div style={{display:"flex",gap:20,marginTop:4}}>
                <span className="feed-act"><MessageSquare size={15}/> Comment</span>
                <span className="feed-act"><Bookmark size={15}/> Save</span>
                <span className="feed-act" style={{color:"var(--accent-ink)"}} onClick={()=>setPage("recs")}>Track this <ChevronRight size={14}/></span>
              </div>
            </div>);
          })
      }
    </div>

    <div>
      <div className="card" style={{marginBottom:16}}><div className="card-head">Your portfolio</div><div className="card-body">
        {holdings.length===0
          ? <div style={{textAlign:"center",padding:"20px 0"}}>
              <div className="muted small" style={{marginBottom:12}}>No holdings yet</div>
              <button className="btn btn-soft btn-sm" onClick={()=>setPage("portfolio")}><Plus size={14}/> Add holdings</button>
            </div>
          : <>
              <div className="balance tnum" style={{fontSize:30}}>{fmt(total)}</div>
              <div className={"delta "+(pnl>=0?"pos":"neg")} style={{marginTop:8,marginBottom:14}}>
                {pnl>=0?<ArrowUpRight size={16}/>:<ArrowDownRight size={16}/>} {fmtSigned(pnl)} ({fmtPct(pnlPct)})</div>
              <Sparkline data={SPARK} w={252} h={48}/>
            </>}
        <button className="btn btn-ghost btn-sm" style={{width:"100%",justifyContent:"center",marginTop:14}} onClick={()=>setPage("portfolio")}>Open portfolio</button>
      </div></div>

      <div className="card"><div className="card-head">New for you</div><div className="card-body" style={{fontSize:13.5}}>
        {recsReceived.filter(r=>!r.invested&&!r.hidden).length===0
          ? <div className="muted small" style={{padding:"8px 0"}}>No pending recommendations.</div>
          : recsReceived.filter(r=>!r.invested&&!r.hidden).slice(0,3).map(r=>{
              const cf = contactFor(r);
              const perf = r.priceAt ? (r.price-r.priceAt)/r.priceAt : 0;
              return <div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid var(--line)"}}>
                <span><b>{r.ticker}</b> <span className="muted">from {cf.name.split(" ")[0]}</span></span>
                <span className={"tnum "+(perf>=0?"pos":"neg")}>{fmtPct(perf)}</span>
              </div>;
            })
        }
        <button className="btn btn-soft btn-sm" style={{width:"100%",justifyContent:"center",marginTop:12}} onClick={()=>setPage("recs")}>
          See all recommendations
        </button>
      </div></div>
    </div>
  </div>);
}

/* =================================================================== INSTRUMENTS */
// Module-level cache — loaded once per browser session from Neon
let _instrCache = null;
let _instrLoadPromise = null;
async function loadInstruments() {
  if (_instrCache) return _instrCache;
  if (_instrLoadPromise) return _instrLoadPromise;
  if (!sql) return [];
  _instrLoadPromise = sql`SELECT symbol, name, exchange, type, asset_class, currency FROM instruments WHERE is_active = true ORDER BY symbol`
    .then(rows => { _instrCache = rows; return rows; })
    .catch(() => { _instrCache = []; return []; });
  return _instrLoadPromise;
}
function clearInstrCache() { _instrCache = null; _instrLoadPromise = null; }

function InstrumentSearch({ onSelect, placeholder, initialValue }) {
  const [q, setQ] = useState(initialValue || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  // Pre-warm cache on mount
  useEffect(() => { loadInstruments(); }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const doSearch = async (term) => {
    if (!term || term.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const all = await loadInstruments();
    const t = term.toLowerCase();
    const hits = all.filter(i =>
      i.symbol.toLowerCase().startsWith(t) ||
      i.name.toLowerCase().includes(t)
    ).slice(0, 18);
    setResults(hits);
    setOpen(hits.length > 0);
    setLoading(false);
  };

  const select = (inst) => {
    setQ(`${inst.symbol} — ${inst.name}`);
    setOpen(false);
    onSelect({
      symbol:     inst.symbol,
      name:       inst.name,
      exchange:   inst.exchange,
      assetClass: inst.asset_class,
      currency:   inst.currency,
    });
  };

  const CURRENCY_SYMBOL = { INR:"₹", USD:"$", GBP:"£", EUR:"€" };

  return (
    <div style={{position:"relative"}} ref={ref}>
      <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:11,padding:"10px 13px",transition:".12s"}}
           onFocus={()=>q.length>=2&&setOpen(results.length>0)}>
        <Search size={15} color="var(--muted)"/>
        <input
          value={q}
          onChange={e=>{ setQ(e.target.value); doSearch(e.target.value); }}
          placeholder={placeholder || "Search by symbol or name…"}
          style={{border:"none",outline:"none",background:"transparent",fontSize:14,flex:1}}
        />
        {loading && <Loader size={14} className="spin" color="var(--muted)"/>}
        {q && !loading && <X size={14} style={{cursor:"pointer",color:"var(--muted)"}} onClick={()=>{setQ("");setResults([]);setOpen(false);onSelect(null);}}/>}
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,boxShadow:"0 8px 28px rgba(0,0,0,.13)",zIndex:200,maxHeight:300,overflowY:"auto"}}>
          {results.map(inst=>(
            <div key={inst.symbol+inst.exchange}
                 style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid var(--line)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}
                 onMouseDown={()=>select(inst)}
                 onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                 onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{minWidth:0}}>
                <span style={{fontWeight:700,fontSize:13}}>{inst.symbol}</span>
                <span className="muted" style={{marginLeft:8,fontSize:12,display:"inline-block",maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inst.name}</span>
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0}}>
                <span className="chip mini">{inst.exchange}</span>
                <span className="chip mini">{inst.asset_class}</span>
                <span className="chip mini">{CURRENCY_SYMBOL[inst.currency]||inst.currency}</span>
              </div>
            </div>
          ))}
          {results.length===0 && <div className="empty" style={{padding:20,fontSize:13}}>No instruments found</div>}
        </div>
      )}
    </div>
  );
}

/* ── Admin: Instruments ──────────────────────────────────────────────────── */
function AdminInstruments() {
  const [tab, setTab] = useState("browse");
  return (<>
    <div className="page-head"><div><div className="eyebrow">Admin</div>
      <div className="page-title">Instruments</div>
      <div className="page-sub">Reference data for trading symbols — used in recommendations and portfolio search</div></div></div>
    <div className="seg" style={{marginBottom:20}}>
      <button className={tab==="browse"?"active":""} onClick={()=>setTab("browse")}><Database size={14}/> Browse</button>
      <button className={tab==="upload"?"active":""} onClick={()=>setTab("upload")}><Upload size={14}/> Upload</button>
      <button className={tab==="add"?"active":""} onClick={()=>setTab("add")}><Plus size={14}/> Add manual</button>
    </div>
    {tab==="browse" && <InstrumentBrowser/>}
    {tab==="upload" && <InstrumentUploader/>}
    {tab==="add"    && <InstrumentAddForm onAdded={()=>setTab("browse")}/>}
  </>);
}

function InstrumentBrowser() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = async (search, pg=0) => {
    if (!sql) return;
    setLoading(true);
    try {
      const offset = pg * PAGE_SIZE;
      const data = search
        ? await sql`SELECT * FROM instruments WHERE is_active=true AND (symbol ILIKE ${'%'+search+'%'} OR name ILIKE ${'%'+search+'%'}) ORDER BY symbol LIMIT ${PAGE_SIZE} OFFSET ${offset}`
        : await sql`SELECT * FROM instruments WHERE is_active=true ORDER BY symbol LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
      setRows(data);
      if (pg===0) {
        const ct = search
          ? await sql`SELECT COUNT(*) FROM instruments WHERE is_active=true AND (symbol ILIKE ${'%'+search+'%'} OR name ILIKE ${'%'+search+'%'})`
          : await sql`SELECT COUNT(*) FROM instruments WHERE is_active=true`;
        setTotal(Number(ct[0].count));
      }
    } catch(e) { console.warn(e); }
    setLoading(false);
  };

  useEffect(() => { load("", 0); }, []);

  const search = (v) => { setQ(v); setPage(0); load(v, 0); };
  const goPage = (p) => { setPage(p); load(q, p); };

  const downloadAll = async () => {
    if (!sql) return;
    const all = await sql`SELECT symbol, name, exchange, type, asset_class as "Asset Class", currency FROM instruments WHERE is_active=true ORDER BY symbol`;
    const ws = XLSX.utils.json_to_sheet(all);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Instruments");
    XLSX.writeFile(wb, "investorcircle_instruments.xlsx");
  };

  const del = async (id) => {
    if (!confirm("Remove this instrument from the reference list?")) return;
    await sql`UPDATE instruments SET is_active=false WHERE id=${id}`;
    setRows(r=>r.filter(x=>x.id!==id));
    setTotal(t=>t-1);
    clearInstrCache();
  };

  return (<>
    <div className="toolbar">
      <div className="searchbox grow"><Search size={16} color="var(--muted)"/>
        <input value={q} onChange={e=>search(e.target.value)} placeholder="Search symbol or name…"/>
      </div>
      <button className="btn btn-soft btn-sm" onClick={downloadAll}><Download size={14}/> Download Excel</button>
    </div>
    {total!==null && <div className="muted small" style={{marginBottom:12}}>{total.toLocaleString()} instruments{q&&` matching "${q}"`}</div>}
    {loading && <div className="muted small" style={{padding:20,textAlign:"center"}}><Loader size={18} className="spin"/></div>}
    {!loading && rows.length>0 && (<>
      <div className="card"><div className="card-body" style={{padding:"8px 0"}}><div className="tscroll"><table className="grid">
        <thead><tr><th>Symbol</th><th>Name</th><th>Exchange</th><th>Type</th><th>Asset Class</th><th>Currency</th><th></th></tr></thead>
        <tbody>{rows.map(r=>(<tr key={r.id} className="hoverable">
          <td className="sym">{r.symbol}</td>
          <td>{r.name}</td>
          <td><span className="pill">{r.exchange}</span></td>
          <td><span className="pill accent">{r.type}</span></td>
          <td>{r.asset_class}</td>
          <td>{r.currency}</td>
          <td><button className="iconbtn danger" onClick={()=>del(r.id)}><Trash2 size={13}/></button></td>
        </tr>))}</tbody>
      </table></div></div></div>
      {total > PAGE_SIZE && (
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"center",alignItems:"center"}}>
          <button className="btn btn-ghost btn-sm" disabled={page===0} onClick={()=>goPage(page-1)}>← Prev</button>
          <span className="muted small">Page {page+1} of {Math.ceil(total/PAGE_SIZE)}</span>
          <button className="btn btn-ghost btn-sm" disabled={(page+1)*PAGE_SIZE>=total} onClick={()=>goPage(page+1)}>Next →</button>
        </div>
      )}
    </>)}
  </>);
}

function InstrumentUploader() {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileRef = useRef(null);
  const REQUIRED_COLS = ["tradingsymbol","name","exchange","instrument_type"];
  const TYPE_TO_CLASS = { EQ:"Equity", ETF:"ETF", MF:"Mutual Funds", FUT:"Others", CE:"Others", PE:"Others" };

  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value=""; if(!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, {defval:""});
    if (!data.length) { alert("Empty file"); return; }
    const cols = Object.keys(data[0]).map(c=>c.toLowerCase());
    const hasZerodha = cols.includes("tradingsymbol") && cols.includes("instrument_type");
    const hasCustom  = cols.includes("symbol") && cols.includes("name");
    if (!hasZerodha && !hasCustom) { alert("File must have either:\n• Zerodha format: tradingsymbol, name, exchange, instrument_type, Currency\n• Custom format: symbol, name, exchange, asset_class, currency"); return; }
    const mapped = data.map(r=>{
      if (hasZerodha) {
        const type = (r['instrument_type']||r['Instrument_type']||'EQ').toString().toUpperCase();
        return { symbol:(r['tradingsymbol']||'').toString().trim(), name:(r['name']||'').toString().trim(), exchange:(r['exchange']||'NSE').toString().trim(), type, assetClass:TYPE_TO_CLASS[type]||'Others', currency:(r['Currency']||r['currency']||'INR').toString().trim() };
      } else {
        return { symbol:(r['symbol']||'').toString().trim(), name:(r['name']||'').toString().trim(), exchange:(r['exchange']||'NSE').toString().trim(), type:(r['type']||'EQ').toString().trim(), assetClass:(r['asset_class']||'Equity').toString().trim(), currency:(r['currency']||'INR').toString().trim() };
      }
    }).filter(r=>r.symbol && r.name);
    setPreview(mapped); setDone(false); setProgress(0);
  };

  const doImport = async () => {
    if (!sql || !preview) return;
    setUploading(true); setProgress(0);
    let inserted = 0;
    for (let i=0; i<preview.length; i++) {
      const r = preview[i];
      try {
        await sql`INSERT INTO instruments (symbol,name,exchange,type,asset_class,currency) VALUES (${r.symbol},${r.name},${r.exchange},${r.type},${r.assetClass},${r.currency}) ON CONFLICT (symbol,exchange) DO UPDATE SET name=EXCLUDED.name, asset_class=EXCLUDED.asset_class`;
        inserted++;
      } catch(_) {}
      if (i%50===0) setProgress(Math.round((i/preview.length)*100));
    }
    clearInstrCache();
    setProgress(100); setUploading(false); setDone(true);
    alert(`Import complete: ${inserted} of ${preview.length} instruments saved.`);
  };

  return (<div style={{maxWidth:680}}>
    <div className="note info" style={{marginBottom:16}}><Database size={16}/><div>
      Accepts <b>Zerodha instruments CSV</b> (tradingsymbol, name, exchange, instrument_type, Currency) or a <b>custom Excel/CSV</b> (symbol, name, exchange, asset_class, currency).
      Duplicate (symbol + exchange) pairs are updated in place.
    </div></div>
    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={onFile}/>
    <button className="btn btn-pri" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Choose file (CSV or Excel)</button>
    {preview && !done && (<>
      <div className="muted small" style={{margin:"14px 0 10px"}}><b>{preview.length}</b> instruments ready to import. First 5 rows:</div>
      <div className="card" style={{marginBottom:14}}><div className="card-body" style={{padding:"8px 0"}}><table className="grid">
        <thead><tr><th>Symbol</th><th>Name</th><th>Exchange</th><th>Asset Class</th><th>Currency</th></tr></thead>
        <tbody>{preview.slice(0,5).map((r,i)=><tr key={i}><td className="sym">{r.symbol}</td><td>{r.name}</td><td>{r.exchange}</td><td>{r.assetClass}</td><td>{r.currency}</td></tr>)}</tbody>
      </table></div></div>
      {uploading ? (<>
        <div style={{background:"var(--surface-2)",borderRadius:999,height:8,overflow:"hidden",marginBottom:8}}>
          <div style={{width:progress+"%",height:"100%",background:"var(--grad)",transition:"width .2s"}}/>
        </div>
        <div className="muted small">{progress}% — importing {preview.length} instruments…</div>
      </>) : (
        <button className="btn btn-pri" onClick={doImport}><Check size={15}/> Import {preview.length} instruments</button>
      )}
    </>)}
    {done && <div className="note ok" style={{marginTop:14}}><Check size={16}/><div>Import complete! Instruments are now available in the search.</div></div>}
  </div>);
}

function InstrumentAddForm({ onAdded }) {
  const [f, setF] = useState({ symbol:"", name:"", exchange:"NSE", type:"EQ", assetClass:"Equity", currency:"INR" });
  const up = (k,v) => setF(s=>({...s,[k]:v}));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const valid = f.symbol.trim() && f.name.trim();
  const save = async () => {
    setSaving(true); setErr("");
    try {
      await sql`INSERT INTO instruments (symbol,name,exchange,type,asset_class,currency) VALUES (${f.symbol.trim().toUpperCase()},${f.name.trim()},${f.exchange},${f.type},${f.assetClass},${f.currency}) ON CONFLICT (symbol,exchange) DO UPDATE SET name=EXCLUDED.name, asset_class=EXCLUDED.asset_class`;
      clearInstrCache();
      setSaving(false);
      onAdded();
    } catch(e) { setErr(e.message); setSaving(false); }
  };
  return (<div style={{maxWidth:560}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:14}}>
      <div className="field"><label>Symbol <span style={{color:"var(--loss)"}}>*</span></label><input value={f.symbol} onChange={e=>up("symbol",e.target.value.toUpperCase())} placeholder="e.g. RELIANCE"/></div>
      <div className="field"><label>Name <span style={{color:"var(--loss)"}}>*</span></label><input value={f.name} onChange={e=>up("name",e.target.value)} placeholder="e.g. Reliance Industries"/></div>
      <div className="field"><label>Exchange</label><select value={f.exchange} onChange={e=>up("exchange",e.target.value)}><option>NSE</option><option>BSE</option><option>MCX</option></select></div>
      <div className="field"><label>Type</label><select value={f.type} onChange={e=>up("type",e.target.value)}><option>EQ</option><option>ETF</option><option>MF</option><option>Others</option></select></div>
      <div className="field"><label>Asset Class</label><select value={f.assetClass} onChange={e=>up("assetClass",e.target.value)}><option>Equity</option><option>ETF</option><option>Mutual Funds</option><option>Crypto</option><option>Bonds</option><option>Metals</option><option>Others</option></select></div>
      <div className="field"><label>Currency</label><select value={f.currency} onChange={e=>up("currency",e.target.value)}><option>INR</option><option>USD</option><option>GBP</option><option>EUR</option></select></div>
    </div>
    {err && <div className="note warn" style={{marginBottom:14}}><AlertTriangle size={15}/><div>{err}</div></div>}
    <button className="btn btn-pri" disabled={!valid||saving} onClick={save}>{saving?<><Loader size={14} className="spin"/> Saving…</>:<><Plus size={14}/> Add instrument</>}</button>
  </div>);
}

/* =================================================================== ADMIN */
function AdminUsers({ users, setUsers, contacts, setContacts }) {
  const [q, setQ] = useState(""); const [showAdd, setShowAdd] = useState(false);
  const filtered = users.filter(u=>(u.name+u.email).toLowerCase().includes(q.toLowerCase()));
  const setStatus=(id,status)=>setUsers(us=>us.map(u=>u.id===id?{...u,status}:u));
  const setRole=(id,role)=>setUsers(us=>us.map(u=>u.id===id?{...u,role}:u));
  const sp=(s)=>s==="Active"?"gain":s==="Suspended"?"loss":"";

  const hardDelete = async (u) => {
    const confirmed = window.confirm(
      `PERMANENTLY DELETE "${u.name}" (${u.email})?\n\n` +
      `This will:\n` +
      `  • Remove all their Neon data (recommendations, connections, groups)\n` +
      `  • Block them from logging in again\n` +
      `  • Their Firebase login credential remains but they will be signed out immediately on next attempt\n\n` +
      `This CANNOT be undone. Click OK to confirm.`
    );
    if (!confirmed) return;
    if (!sql) { alert("Neon not configured — cannot delete."); return; }
    try {
      // Add to blacklist so they're force-signed-out on next login
      await sql`INSERT INTO deleted_users (id, email) VALUES (${u.id}, ${u.email}) ON CONFLICT DO NOTHING`;
      // Delete from user_profiles — CASCADE removes all their v2 table data
      await sql`DELETE FROM user_profiles WHERE id = ${u.id}`;
      // Remove from local state
      setUsers(us => us.filter(x => x.id !== u.id));
      alert(`${u.name} has been permanently deleted. Their data has been removed from the database. Note: their Firebase login credential still exists technically — they will be blocked from accessing the app if they attempt to sign in.`);
    } catch(e) {
      alert("Delete failed: " + e.message);
    }
  };
  return (<>
    <div className="page-head"><div><div className="eyebrow">Admin</div><div className="page-title">Users</div><div className="page-sub">{users.length} accounts · manage roles, status and access</div></div>
      <button className="btn btn-pri" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add user</button></div>
    <div className="card"><div className="card-head"><span>All users</span>
      <div style={{ display:"flex", alignItems:"center", gap:8, background:"var(--surface-2)", borderRadius:10, padding:"7px 12px" }}>
        <Search size={15} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" style={{border:"none",outline:"none",background:"transparent",fontSize:13}}/></div></div>
      <div className="card-body" style={{padding:"8px 10px"}}><table className="grid">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th style={{textAlign:"center"}}>Accounts</th><th>Joined</th><th style={{textAlign:"right"}}>Actions</th></tr></thead>
        <tbody>{filtered.map(u=>(<tr key={u.id} className="hoverable">
          <td><div style={{fontWeight:600}}>{u.name}</div><div className="muted small">{u.email}</div></td>
          <td><select className="inline-select" value={u.role} onChange={e=>setRole(u.id,e.target.value)}>{["Investor","Moderator","Admin"].map(r=><option key={r}>{r}</option>)}</select></td>
          <td><span className={"pill "+sp(u.status)}>{u.status}</span></td>
          <td style={{textAlign:"center"}}>{u.accounts}</td><td className="muted small">{u.joined}</td>
          <td style={{textAlign:"right"}}>
            <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
              {u.status==="Active"
                ? <button className="btn btn-ghost btn-sm" onClick={()=>setStatus(u.id,"Suspended")}>Suspend</button>
                : <button className="btn btn-ghost btn-sm" onClick={()=>setStatus(u.id,"Active")}>Activate</button>}
              <button className="iconbtn danger" title={`Permanently delete ${u.name}`} onClick={()=>hardDelete(u)}><Trash2 size={14}/></button>
            </div>
          </td>
        </tr>))}</tbody></table></div></div>
    {showAdd && <AddUserModal onClose={()=>setShowAdd(false)} onAdd={(u)=>{
      const newUser = {...u, id:"u"+Date.now()};
      setUsers(us=>[newUser,...us]);
      setContacts(cs=>[...cs, {
        id: u.email, name:u.name, initials:initialsOf(u.name),
        color: CONTACT_COLORS[cs.length % CONTACT_COLORS.length],
        title: u.role, shared:{ level:"none", holdings:[] }
      }]);
      setShowAdd(false);
    }}/>}
  </>);
}
function AddUserModal({ onClose, onAdd }) {
  const [name,setName]=useState(""); const [email,setEmail]=useState("");
  const [password,setPassword]=useState(""); const [role,setRole]=useState("Investor");
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const valid = name.trim() && email.trim() && password.length>=6;
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
      await secondaryAuth.signOut();
      if (sql) { try { await sql`INSERT INTO user_profiles (id, email, full_name, is_admin) VALUES (${cred.user.uid}, ${email.trim()}, ${name.trim()}, false) ON CONFLICT (id) DO NOTHING`; } catch(e) { console.warn("user_profiles insert failed:", e.message); } }
      onAdd({ id:cred.user.uid, name:name.trim(), email:email.trim(), role, status:"Active", accounts:0, joined:new Date().toLocaleDateString("en-US",{month:"short",year:"numeric"}) });
    } catch(e) {
      if (e.code === "auth/email-already-in-use") {
        // User exists in Firebase but may not be in Neon user_profiles yet.
        // Try to look them up and surface them in the admin list.
        if (sql) {
          try {
            const rows = await sql`SELECT * FROM user_profiles WHERE email = ${email.trim().toLowerCase()} LIMIT 1`;
            if (rows[0]) {
              onAdd({ id:rows[0].id, name:rows[0].full_name, email:rows[0].email, role:rows[0].is_admin?"Admin":"Investor", status:"Active", accounts:0, joined:new Date(rows[0].created_at).toLocaleDateString("en-US",{month:"short",year:"numeric"}) });
              setBusy(false); return; // successfully recovered
            }
          } catch(_) {}
        }
        setErr("An account with this email already exists in Firebase. If they are not showing in the list they have not logged in yet — ask them to sign in and they will appear automatically.");
      } else {
        const msg = e.code==="auth/invalid-email" ? "Please enter a valid email address."
          : e.code==="auth/weak-password" ? "Password must be at least 6 characters."
          : "Could not create user: " + (e.message || "unknown error");
        setErr(msg);
      }
      setBusy(false);
    }
  };
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Add user</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="note info" style={{marginBottom:14}}><Shield size={16}/><div>Creates a real login account. The user will be able to sign in immediately with the password you set.</div></div>
      <div className="field"><label>Full name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Doe" autoFocus/></div>
      <div className="field"><label>Email address</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jane@example.com"/></div>
      <div className="field"><label>Temporary password <span className="muted small">(min 6 characters)</span></label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="They can change it after logging in"/></div>
      <div className="field"><label>Role</label><select value={role} onChange={e=>setRole(e.target.value)}>{["Investor","Moderator","Admin"].map(r=><option key={r}>{r}</option>)}</select></div>
      {err && <div className="note warn"><AlertTriangle size={15}/><div>{err}</div></div>}
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid||busy} onClick={save}>{busy?<><Loader size={14} className="spin"/> Creating…</>:<><Plus size={14}/> Create account</>}</button></div></div>
  </div></div>);
}
function AdminGroups({ groups, setGroups, contacts, me }) {
  const [showNew, setShowNew] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const myId = me?.id || "me";
  const nameOfM = (id) => (id==="me"||id===me?.id) ? (me?.name||"You") : (contacts.find(c=>c.id===id)?.name)||(id==="admin"?"Admin Root":id);
  const removeMember=(gid,mid)=>setGroups(gs=>gs.map(g=>g.id===gid?{...g,members:g.members.filter(m=>m!==mid)}:g));
  const renameGroup=(gid,newName)=>setGroups(gs=>gs.map(g=>g.id===gid?{...g,name:newName}:g));
  const deleteGroup=(g)=>{ if(confirm(`Delete "${g.name}"? All members will lose access. This cannot be undone.`)) setGroups(gs=>gs.filter(x=>x.id!==g.id)); };
  return (<>
    <div className="page-head"><div><div className="eyebrow">Admin</div><div className="page-title">Groups</div><div className="page-sub">All groups on the platform · used for sharing and recommendations</div></div>
      <button className="btn btn-pri" onClick={()=>setShowNew(true)}><Plus size={16}/> Create group</button></div>
    {groups.length===0 && <div className="card"><div className="empty">No groups yet. Create one to get started.</div></div>}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(330px,1fr))", gap:16 }}>
      {groups.map(g=>{
        const iAmAdmin=g.admins.includes("me")||g.admins.includes(myId);
        return (<div key={g.id} className="card"><div className="card-body">
          <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:13 }}>
            <div className="av" style={{ width:44, height:44, background:g.color }}><Layers size={19}/></div>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{g.name}</div><div className="muted small">{g.members.length} members · created {fmtDate(g.created)}</div></div>
            {iAmAdmin && <div style={{display:"flex",gap:6}}>
              <button className="iconbtn" title="Rename group" onClick={()=>setEditGroup(g)}><Pencil size={14}/></button>
              <button className="iconbtn danger" title="Delete group" onClick={()=>deleteGroup(g)}><Trash2 size={14}/></button>
            </div>}
          </div>
          <div className="small muted" style={{marginBottom:8}}>Admins: {g.admins.map(nameOfM).join(", ")||"—"}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {g.members.map(mid=><span key={mid} className="pill">{nameOfM(mid)} <X size={13} style={{cursor:"pointer"}} onClick={()=>removeMember(g.id,mid)}/></span>)}
            {g.members.length===0 && <span className="muted small">No members yet</span>}</div>
        </div></div>);})}
    </div>
    {showNew && <CreateGroupModal contacts={contacts} groups={groups} myId={myId} onClose={()=>setShowNew(false)} onCreate={(g)=>{ setGroups(gs=>[...gs,{...g,id:"g"+Date.now(),created:TODAY,admins:[myId],color:CONTACT_COLORS[gs.length%CONTACT_COLORS.length]}]); setShowNew(false); }}/>}
    {editGroup && <EditGroupModal group={editGroup} groups={groups} myId={myId} onClose={()=>setEditGroup(null)} onSave={(newName)=>{ renameGroup(editGroup.id,newName); setEditGroup(null); }}/>}
  </>);
}
function EditGroupModal({ group, groups, myId, onClose, onSave }) {
  const [name, setName] = useState(group.name);
  const trimmed = name.trim();
  const isSame = trimmed.toLowerCase() === group.name.toLowerCase();
  const isDuplicate = !isSame && groups.some(g =>
    g.id !== group.id &&
    (g.admins.includes("me")||g.admins.includes(myId)) &&
    g.name.toLowerCase() === trimmed.toLowerCase()
  );
  const valid = trimmed && !isDuplicate;
  return (<div className="overlay" onClick={onClose}><div className="modal" style={{width:420}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Rename group</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="field"><label>Group name</label>
        <input value={name} autoFocus onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&valid&&onSave(trimmed)} placeholder="Group name"/>
        {isDuplicate && <div className="neg small" style={{marginTop:6}}>You already have a group with this name. Please choose a different name.</div>}
      </div>
    </div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!valid||isSame} onClick={()=>onSave(trimmed)}><Check size={14}/> Save</button>
    </div></div>
  </div></div>);
}
function CreateGroupModal({ contacts, groups, myId, onClose, onCreate }) {
  const [name,setName]=useState(""); const [members,setMembers]=useState([]);
  const trimmed = name.trim();
  const isDuplicate = trimmed && groups.some(g=>(g.admins.includes("me")||g.admins.includes(myId)) && g.name.toLowerCase()===trimmed.toLowerCase());
  const toggle=(id)=>setMembers(m=>m.includes(id)?m.filter(x=>x!==id):[...m,id]);
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>Create group</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">
      <div className="field"><label>Group name</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Value Hunters" autoFocus/>
        {isDuplicate && <div className="neg small" style={{marginTop:6}}>You already have a group with this name.</div>}
      </div>
      <div className="field"><label>Members</label><div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {contacts.length===0 ? <span className="muted small">Add contacts first, then you can add them to groups.</span> :
        contacts.map(f=><span key={f.id} className={"chip"+(members.includes(f.id)?" sel":"")} onClick={()=>toggle(f.id)}>{members.includes(f.id)&&<Check size={13}/>}{f.name}</span>)}</div></div></div>
    <div className="modal-foot"><span/><div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-pri" disabled={!trimmed||isDuplicate} onClick={()=>onCreate({name:trimmed,members})}>Create group</button></div></div>
  </div></div>);
}
function AdminConfigs({ configs, setConfigs, providers, setProviders }) {
  const [newProv, setNewProv] = useState("");
  const toggle=(k)=>setConfigs(c=>({...c,[k]:!c[k]}));
  const Switch=({k,title,desc,last})=>(<div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"15px 0", borderBottom:last?"none":"1px solid var(--line)" }}>
    <div style={{ paddingRight:20 }}><div style={{fontWeight:700,fontSize:14}}>{title}</div><div className="muted small" style={{marginTop:2}}>{desc}</div></div>
    <div className={"sw"+(configs[k]?" on":"")} onClick={()=>toggle(k)}><div className="knob"/></div></div>);
  return (<>
    <div className="page-head"><div><div className="eyebrow">Admin</div><div className="page-title">App Configuration</div><div className="page-sub">Platform-wide settings — these affect every user in real time</div></div></div>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, alignItems:"start" }}>
      <div className="card"><div className="card-head">Features</div><div className="card-body" style={{paddingTop:2,paddingBottom:2}}>
        <Switch k="enableRecommendations" title="Recommendations" desc="Let users send and track investment ideas"/>
        <Switch k="allowCryptoAccounts" title="Crypto accounts" desc="Permit linking crypto exchange accounts"/>
        <Switch k="publicFeed" title="Public activity feed" desc="Show network activity on the home feed" last/></div></div>
      <div className="card"><div className="card-head">Privacy defaults</div><div className="card-body" style={{paddingTop:2,paddingBottom:2}}>
        <Switch k="requireAccountApproval" title="Account-link approval" desc="Require admin approval before a linked account goes live"/>
        <Switch k="allowAmountSharing" title="Amount & P&L sharing" desc="Let users share amounts and P&L, not just names"/>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"15px 0" }}>
          <div><div style={{fontWeight:700,fontSize:14}}>Default disclosure for new connections</div><div className="muted small" style={{marginTop:2}}>Applied when a user adds a new friend</div></div>
          <select className="inline-select" value={configs.defaultDisclosure} onChange={e=>setConfigs(c=>({...c,defaultDisclosure:e.target.value}))}>
            <option value="none">Nothing</option><option value="names">Names only</option><option value="full">Names + P&L</option></select></div></div></div>
    </div>
    <div className="card" style={{ marginTop:18 }}><div className="card-head"><span style={{display:"flex",gap:8,alignItems:"center"}}><Layers size={16}/> Groups</span></div>
      <div className="card-body" style={{paddingTop:2,paddingBottom:2}}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"15px 0", borderBottom:"1px solid var(--line)" }}>
          <div style={{paddingRight:20}}><div style={{fontWeight:700,fontSize:14}}>Maximum members per group</div><div className="muted small" style={{marginTop:2}}>Caps how many people any single group can contain</div></div>
          <input type="number" min={2} max={500} value={configs.maxGroupMembers} onChange={e=>setConfigs(c=>({...c,maxGroupMembers:Math.max(2,parseInt(e.target.value||"2",10))}))}
            style={{width:90,border:"1px solid var(--line-2)",borderRadius:10,padding:"8px 11px",fontSize:14,fontWeight:700,textAlign:"center",outline:"none"}}/></div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"15px 0" }}>
          <div style={{paddingRight:20}}><div style={{fontWeight:700,fontSize:14}}>Who can create groups</div><div className="muted small" style={{marginTop:2}}>Controls the “New group” action across the app</div></div>
          <select className="inline-select" value={configs.groupCreationPolicy} onChange={e=>setConfigs(c=>({...c,groupCreationPolicy:e.target.value}))}>
            <option value="all">Everyone</option><option value="mods">Moderators &amp; Admins</option><option value="admins">Admins only</option></select></div>
      </div></div>
    <div className="card" style={{ marginTop:18 }}><div className="card-head">Supported account providers</div><div className="card-body">
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:15 }}>
        {providers.map(p=><span key={p} className="pill accent">{p} <X size={13} style={{cursor:"pointer"}} onClick={()=>setProviders(ps=>ps.filter(x=>x!==p))}/></span>)}</div>
      <div style={{ display:"flex", gap:10 }}>
        <input value={newProv} onChange={e=>setNewProv(e.target.value)} placeholder="Add a provider (e.g. Interactive Brokers)" style={{ flex:1, border:"1px solid var(--line-2)", borderRadius:11, padding:"10px 13px", fontSize:14, outline:"none" }}/>
        <button className="btn btn-pri" disabled={!newProv} onClick={()=>{ setProviders(ps=>[...ps,newProv]); setNewProv(""); }}><Plus size={15}/> Add</button></div>
    </div></div>
  </>);
}
