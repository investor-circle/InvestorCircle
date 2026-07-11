import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Home, PieChart, Users, Lightbulb, Shield, Search, Bell, Settings,
  Lock, Eye, EyeOff, TrendingUp, TrendingDown, Plus, X, Check, Send,
  UserCog, Layers, Wallet, ArrowUpRight, ArrowDownRight, MessageSquare,
  Bookmark, ChevronRight, ChevronDown, ChevronsUpDown, Sparkles, ArrowUpDown,
  List, Table as TableIcon, Mail, UserPlus, Calendar, Crown,
  ThumbsUp, ThumbsDown, Trash2, LogOut, AlertTriangle, Filter,
  Download, Upload, CreditCard, Share2, Forward, FileSpreadsheet, FileText, Loader, RefreshCw, Pencil, Database,
  Globe, Trophy, Copy, ExternalLink, ArrowLeft, Link
} from "lucide-react";
import { exportPortfolioExcel, exportPortfolioPDF } from "./exporters";
import { parsePortfolioFile } from "./importers";
import * as XLSX from "xlsx";
import { getPreviousClose, getTodayClose, sourceName, isPriceServiceConfigured } from "./services/marketData";
import {
  setExitSignal as dbSetExit, cancelExitSignal as dbCancelExit,
} from "./db";
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
  deleteRecommendation as dbDeleteReco, deleteDelivery as dbDeleteDelivery,
  checkUsername as dbCheckUsername, saveUsername as dbSaveUsername,
  getPublicProfile as dbGetPublicProfile, computeIci,
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
  const { user, role, setRole, userIsAdmin, logout, authLoading, profile, updateProfile, patchProfile } = useAuth();
  const ME = useMemo(() => {
    if (!user) return { id:"", name:"", firstName:"", lastName:"", username:"", initials:"", email:"" };
    const firstName = profile?.first_name || user.email?.split("@")[0] || "User";
    const lastName  = profile?.last_name  || "";
    const name = `${firstName} ${lastName}`.trim();
    return { id:user.uid, name, firstName, lastName, username:profile?.username||"", initials:initialsOf(name), email:user.email||"" };
  }, [user?.uid, profile?.first_name, profile?.last_name, profile?.username]);

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
  const [connectConfirm, setConnectConfirm] = useState(null); // { name, username } after auto-connect

  // ── Hash routing — for public profile URLs (#/investor/username) ─────────────
  const [pageHash, setPageHash] = useState(window.location.hash);
  useEffect(() => {
    const h = () => setPageHash(window.location.hash);
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  // ── Post-login/signup: auto-send connection request if user came from a public profile ─
  useEffect(() => {
    if (!user || !sql) return;
    const pending = sessionStorage.getItem("pending_connect_username");
    if (!pending) return;
    sessionStorage.removeItem("pending_connect_username");
    sql`SELECT id, full_name, first_name, last_name FROM user_profiles WHERE username = ${pending} LIMIT 1`
      .then(rows => {
        if (!rows[0] || rows[0].id === user.uid) return;
        const targetId = rows[0].id;
        const targetName = rows[0].first_name
          ? `${rows[0].first_name} ${rows[0].last_name || ""}`.trim()
          : rows[0].full_name || `@${pending}`;
        return sendConnectionRequest(user.uid, targetId).then(() => {
          setConnectConfirm({ name: targetName, username: pending });
          setTimeout(() => setConnectConfirm(null), 10000); // auto-dismiss after 10s
        });
      })
      .catch(console.warn);
  }, [user?.uid]);
  const [holdings,      setHoldings]      = useState(HOLDINGS);
  const [assetClasses,  setAssetClasses]  = useState(DEFAULT_CLASSES);
  const [users,         setUsers]         = useState([]);
  const [configs,       setConfigs]       = useState({
    enableRecommendations:true, allowCryptoAccounts:true, publicFeed:true,
    requireAccountApproval:true, allowAmountSharing:true, defaultDisclosure:"names",
    maxGroupMembers:8, groupCreationPolicy:"all",
  });
  const [providers, setProviders] = useState(["Fidelity","Vanguard","Robinhood","Coinbase","Schwab","E*TRADE"]);
  const [priceRefresh, setPriceRefresh] = useState({ busy:false, lastAt:null, errors:[] });
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
    if (!isFinnhubConfigured) return;                          // boolean, not a function
    setPriceRefresh({ busy:true, lastAt:null, errors:[] });
    try {
      const { results, errors } = await fetchLivePrices(holdings); // takes full holdings array
      setHoldings(hs => hs.map(h =>
        results[h.sym]?.price != null ? {...h, price:results[h.sym].price} : h
      ));
      setPriceRefresh({ busy:false, lastAt:new Date(), errors });
    } catch(e) {
      setPriceRefresh({ busy:false, lastAt:null, errors:[e.message] });
    }
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

  // ── Public profile route — no auth required ────────────────────────────────
  // Matches: #/investor/username  OR  #/investor/username/reco/recoId
  const publicMatch = pageHash.match(/^#\/investor\/([a-z0-9_]+)(?:\/reco\/([a-zA-Z0-9-]+))?/i);
  if (publicMatch && !authLoading) {
    const pubUsername = publicMatch[1];
    const pubRecoId   = publicMatch[2] || null;
    return (
      <div className="app"><style>{STYLES}</style>
        <PublicProfilePage
          username={pubUsername}
          recoId={pubRecoId}
          viewerUser={user}
          viewerConnections={connections}
          mode="standalone"
          onBack={()=>{ window.location.hash=""; }}
          onRequestConnect={async(targetId)=>{
            if (!user) {
              sessionStorage.setItem("pending_connect_username", pubUsername);
              window.location.hash="";
              return;
            }
            await sendConnectionRequest(user.uid, targetId);
            const c = await getMyConnections(user.uid);
            setConnections(c);
          }}
        />
      </div>
    );
  }

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
    { id:"home",        label:"Home",             icon:Home },
    { id:"portfolio",   label:"My Portfolio",      icon:PieChart },
    { id:"network",     label:"Network",           icon:Users },
    ...(configs.enableRecommendations ? [{ id:"recs", label:"Recommendations", icon:Lightbulb, badge:newRecs }] : []),
    { id:"sharing",     label:"Sharing & Privacy", icon:Shield },
    { id:"trackrecord", label:"Track Record",       icon:Globe },
  ] : [
    { id:"users",       label:"Users",             icon:UserCog },
    { id:"groups",      label:"Groups",            icon:Layers },
    { id:"instruments", label:"Instruments",        icon:Database },
    { id:"sebi",        label:"SEBI Approvals",    icon:Shield },
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
                    me={ME} profile={profile} updateProfile={updateProfile} patchProfile={patchProfile}
                    onClose={()=>setProfileOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="content">
            {/* Connection-request confirmation banner — shown after signup from a public profile */}
            {connectConfirm && isInv && (
              <div style={{
                display:"flex",alignItems:"flex-start",gap:12,
                background:"var(--gain-soft)",border:"1px solid var(--gain)",
                borderRadius:14,padding:"14px 16px",marginBottom:20,
              }}>
                <div style={{width:36,height:36,borderRadius:10,background:"var(--gain)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <Check size={18} color="#fff"/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>
                    Connection request sent to {connectConfirm.name}!
                  </div>
                  <div className="muted small">
                    They'll receive a notification and can accept your request. Once accepted, you can share recommendations with each other.
                  </div>
                </div>
                <button className="icon-btn" onClick={()=>setConnectConfirm(null)} title="Dismiss"><X size={16}/></button>
              </div>
            )}
            {isInv && page==="home"      && <HomeFeed setPage={setPage} recsReceived={recsReceived} setRecsReceived={setRecsReceived} configs={configs} holdings={holdings} contacts={contacts} me={ME} assetClasses={assetClasses} setAssetClasses={setAssetClasses} groups={groups} setRecsMade={setRecsMade}/>}
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
            {isInv && page==="sharing"     && <Sharing sharing={sharing} setSharing={setSharing} configs={configs} holdings={holdings} contacts={contacts} groups={groups} myId={ME.id}/>}
            {isInv && page==="trackrecord" && (
              ME.username
                ? <PublicProfilePage
                    username={ME.username}
                    viewerUser={user}
                    viewerConnections={connections}
                    mode="embedded"
                    isOwnProfile
                    patchProfile={patchProfile}
                    onRequestConnect={()=>{}}
                    onBack={()=>setPage("home")}
                  />
                : <div style={{maxWidth:520}}>
                    <div className="page-head"><div>
                      <div className="eyebrow">Track Record</div>
                      <div className="page-title">Your public profile</div>
                    </div></div>
                    <div className="card"><div className="card-body" style={{textAlign:"center",padding:"40px 32px"}}>
                      <Globe size={36} color="var(--muted)" style={{marginBottom:14}}/>
                      <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Set a username first</div>
                      <div className="muted small" style={{marginBottom:20}}>
                        Your public profile URL uses your username (e.g. app/#/investor/yourname).
                        Set one in your profile to enable the Track Record page.
                      </div>
                      <button className="btn btn-pri" onClick={()=>setProfileOpen(true)}>
                        <Pencil size={15}/> Set username in profile
                      </button>
                    </div></div>
                  </div>
            )}
            {!isInv && page==="users"       && <AdminUsers users={users} setUsers={setUsers} contacts={contacts} setContacts={()=>{}}/>}
            {!isInv && page==="groups"      && <AdminGroups groups={groups} setGroups={setGroups} contacts={contacts} me={ME}/>}
            {!isInv && page==="instruments" && <AdminInstruments/>}
            {!isInv && page==="sebi"        && <AdminSebi/>}
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
  const [showAddHolding, setShowAddHolding] = useState(false);
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
        <button className="btn btn-pri btn-sm" onClick={()=>setShowAddHolding(true)}><Plus size={15}/> Add holding</button>
        <div style={{position:"relative"}}>
          <button className="btn btn-soft btn-sm" onClick={()=>setMenu(m=>!m)}><Download size={15}/> Export <ChevronDown size={13}/></button>
          {menu && <div className="menu" onMouseLeave={()=>setMenu(false)}>
            <div className="menu-item" onClick={()=>{ exportPortfolioExcel(shown); setMenu(false); }}><FileSpreadsheet size={15}/> {shown.length===0?"Download template (.xlsx)":"Excel (.xlsx)"}</div>
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
        <div className="card-body" style={{ padding:"8px 10px" }}>
          {shown.length===0
            ? <div className="empty" style={{padding:"32px 16px"}}>
                <div style={{marginBottom:12}}>No holdings yet.</div>
                <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                  <button className="btn btn-pri btn-sm" onClick={()=>setShowAddHolding(true)}><Plus size={14}/> Add holding</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current?.click()}><Upload size={14}/> Import Excel</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{ exportPortfolioExcel([]); }}><Download size={14}/> Download template</button>
                </div>
              </div>
            : <table className="grid">
                <thead><tr><th>Asset</th><th>Account</th><th>Type</th><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>P&L</th><th></th></tr></thead>
                <tbody>{shown.map(r=>(<tr key={r.id} className="hoverable">
                  <td><div className="sym">{r.sym}</div><div className="muted small">{r.name}</div></td>
                  <td className="muted small">{r.acctName}</td><td><TypeTag t={r.type}/></td>
                  <td style={{textAlign:"right"}} className="tnum">{mask(fmt(r.value))}</td>
                  <td style={{textAlign:"right"}} className={"tnum "+(r.pnl>=0?"pos":"neg")}>{hide?"••••":<>{fmtSigned(r.pnl)}<div className="small">{fmtPct(r.pnlPct)}</div></>}</td>
                  <td><button className="iconbtn danger" title="Remove holding" onClick={()=>setHoldings(hs=>hs.filter(h=>h.id!==r.id))}><Trash2 size={13}/></button></td>
                </tr>))}</tbody>
              </table>}
        </div></div>
      <div className="card" style={{ height:"fit-content" }}><div className="card-head">Allocation</div>
        <div className="card-body" style={{ display:"flex", flexDirection:"column", alignItems:"center" }}><Ring data={byType}/>
          <div style={{ width:"100%", marginTop:18, display:"flex", flexDirection:"column", gap:11 }}>
            {byType.map(d=>(<div key={d.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13 }}>
              <span style={{ display:"flex", alignItems:"center", gap:9 }}><span className="dot" style={{background:d.color, width:10, height:10}}/>{d.label}</span>
              <b className="tnum">{((d.value/sTotal)*100).toFixed(0)}%</b></div>))}</div></div></div>
    </div>
    {importRes && <ImportPreviewModal result={importRes} onClose={()=>setImportRes(null)} onApply={applyImport}/>}
    {showPan && <PanPullModal onClose={()=>setShowPan(false)} onApply={(h,mode)=>{ applyImport(h,mode); setShowPan(false); }}/>}
    {showAddHolding && <AddHoldingModal onClose={()=>setShowAddHolding(false)} onAdd={(h)=>{ setHoldings(hs=>[...hs,h]); setShowAddHolding(false); }}/>}
  </>);
}

function AddHoldingModal({ onClose, onAdd }) {
  const [instr,    setInstr]    = useState(null);   // from InstrumentSearch
  const [sym,      setSym]      = useState("");
  const [name,     setName]     = useState("");
  const [type,     setType]     = useState("Stock");
  const [account,  setAccount]  = useState("");
  const [shares,   setShares]   = useState("");
  const [costPer,  setCostPer]  = useState("");     // cost per share
  const [pricePer, setPricePer] = useState("");     // current price per share (optional)

  const onInstrSelect = (inst) => {
    if (!inst) { setSym(""); setName(""); setType("Stock"); return; }
    setInstr(inst);
    setSym(inst.symbol);
    setName(inst.name);
    setType(inst.type==="ETF" ? "ETF" : inst.type==="MF" ? "Fund" : "Stock");
  };

  const valid = (sym.trim()||name.trim()) && +shares > 0 && +costPer > 0;

  const save = () => {
    const sh   = +shares;
    const cost = +costPer;
    const price = +pricePer || cost;   // default current price to cost if not given
    onAdd({
      id:       "h" + Date.now(),
      sym:      sym.trim().toUpperCase() || name.trim().toUpperCase().slice(0,6),
      name:     name.trim() || sym.trim(),
      type,
      acct:     "manual",
      acctName: account.trim() || "Manual entry",
      sh,
      cost,
      price,
    });
  };

  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head">
      <h3><Plus size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> Add holding</h3>
      <button className="icon-btn" onClick={onClose}><X size={20}/></button>
    </div>
    <div className="modal-body">

      {/* Instrument search */}
      <div className="field">
        <label>Search instrument <span className="muted small">(type symbol or company name)</span></label>
        <InstrumentSearch onSelect={onInstrSelect} placeholder="e.g. RELIANCE or Reliance Industries…"/>
      </div>

      {/* Show selected badge */}
      {instr && (
        <div style={{display:"flex",gap:8,marginBottom:14,padding:"9px 12px",background:"var(--accent-soft)",borderRadius:10,alignItems:"center"}}>
          <Check size={15} color="var(--accent-ink)"/>
          <span style={{fontSize:13,fontWeight:600,color:"var(--accent-ink)"}}>{instr.symbol} — {instr.name}</span>
          <span className="chip mini" style={{marginLeft:"auto"}}>{instr.exchange}</span>
          <span className="chip mini">{instr.assetClass}</span>
        </div>
      )}

      {/* Manual override */}
      <details style={{marginBottom:14}}>
        <summary style={{fontSize:12,fontWeight:600,color:"var(--muted)",cursor:"pointer",userSelect:"none"}}>Not in the list? Enter manually</summary>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:14,paddingTop:10}}>
          <div className="field"><label>Symbol / Ticker</label><input value={sym} onChange={e=>setSym(e.target.value.toUpperCase())} placeholder="RELIANCE"/></div>
          <div className="field"><label>Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Reliance Industries"/></div>
        </div>
      </details>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:14}}>
        <div className="field"><label>Type</label>
          <select value={type} onChange={e=>setType(e.target.value)}>
            {["Stock","ETF","Fund","Crypto","Bonds","Other"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field"><label>Account / Broker <span className="muted small">(optional)</span></label>
          <input value={account} onChange={e=>setAccount(e.target.value)} placeholder="e.g. Zerodha"/>
        </div>
        <div className="field"><label>Number of shares / units <span style={{color:"var(--loss)"}}>*</span></label>
          <input type="number" min="0" value={shares} onChange={e=>setShares(e.target.value)} placeholder="e.g. 10"/>
        </div>
        <div className="field"><label>Average cost per share <span style={{color:"var(--loss)"}}>*</span></label>
          <input type="number" min="0" value={costPer} onChange={e=>setCostPer(e.target.value)} placeholder="e.g. 2400"/>
        </div>
        <div className="field" style={{gridColumn:"1 / span 2"}}>
          <label>Current price per share <span className="muted small">(optional — defaults to cost if blank)</span></label>
          <input type="number" min="0" value={pricePer} onChange={e=>setPricePer(e.target.value)} placeholder="e.g. 2550"/>
        </div>
      </div>

      {/* Live summary */}
      {valid && (
        <div style={{background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:12,padding:"12px 14px",display:"flex",gap:20,flexWrap:"wrap"}}>
          <div><div className="cap">Cost basis</div><b className="tnum">{fmt(+shares * +costPer)}</b></div>
          <div><div className="cap">Market value</div><b className="tnum">{fmt(+shares * (+pricePer||+costPer))}</b></div>
          <div><div className="cap">Unrealised P&L</div>
            <b className={"tnum "+(+pricePer>=+costPer?"pos":"neg")}>
              {pricePer ? fmtSigned(+shares*(+pricePer-+costPer)) : "—"}
            </b>
          </div>
        </div>
      )}
    </div>
    <div className="modal-foot"><span/>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" disabled={!valid} onClick={save}><Check size={14}/> Add to portfolio</button>
      </div>
    </div>
  </div></div>);
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
  const receivedCount = recsReceived.filter(r=>!r.hidden).length;
  const madeCount = recsMade.length;
  return (<>
    {/* ── Compact page header with tabs inline ── */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
      <div className="eyebrow" style={{marginBottom:0}}>Recommendations</div>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px',marginTop:2}}>Ideas worth tracking</div>
      {/* Big prominent tabs */}
      <div style={{display:"flex",gap:6,background:"var(--surface-2)",borderRadius:14,padding:4}}>
        {[
          {id:"received", label:"Received", count:receivedCount, icon:Lightbulb},
          {id:"made",     label:"Made by me", count:madeCount,    icon:Send},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderRadius:11,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontWeight:700,fontSize:14,transition:".15s",
            background: tab===t.id ? "var(--surface)" : "transparent",
            color:      tab===t.id ? "var(--accent-ink)" : "var(--ink)",
            boxShadow:  tab===t.id ? "0 1px 6px rgba(20,20,50,.1)" : "none",
          }}>
            <t.icon size={15}/>
            {t.label}
            <span style={{
              fontSize:12, fontWeight:800, padding:"2px 9px", borderRadius:999,
              background: tab===t.id ? "var(--grad)" : "var(--surface-2)",
              color:      tab===t.id ? "#fff" : "var(--ink-soft)",
            }}>{t.count}</span>
          </button>
        ))}
      </div>
    </div>

    {tab==="received"
      ? <ReceivedSection recs={recsReceived} setRecs={setRecsReceived} myId={myId}
          contactName={contactName} groupName={groupName} assetClasses={assetClasses}
          contacts={contacts} groups={groups} initBy={initFilter?.by} initGroup={initFilter?.groupId}
          onForward={forwardReco} onReload={onReload} me={me}/>
      : <MadeSection recs={recsMade} setRecs={setRecsMade} recipientName={recipientName}
          reach={reach} contacts={contacts} groups={groups} assetClasses={assetClasses}
          setAssetClasses={setAssetClasses} holdings={holdings} me={me} onReload={onReload}/>}
  </>);
}


function ReceivedSection({ recs, setRecs, myId, contactName, groupName, assetClasses, contacts, groups, initBy, initGroup, onForward, onReload, me }) {
  const [q,setQ]=useState(""); const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [fBy,setFBy]=useState(initBy||"all"),[fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all");
  const [fInv,setFInv]=useState("all"),[fGroup,setFGroup]=useState(initGroup||"all"),[fHorizon,setFHorizon]=useState("all");
  const [showHidden,setShowHidden]=useState(false); const [showExpired,setShowExpired]=useState(false);
  const [investing,setInvesting]=useState(null);
  const [openRow,setOpenRow]=useState(null); const [fwd,setFwd]=useState(null);
  const [sharePopId,setSharePopId]=useState(null);
  const [shareAnchor,setShareAnchor]=useState(null);
  const [shareUsername,setShareUsername]=useState(null);

  const handleReceivedShare = async (e, r) => {
    if (sharePopId===r.id) { setSharePopId(null); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget);
    setSharePopId(r.id);
    setShareUsername(null);
    // Async fetch recommender username for public link
    if (r.from && sql) {
      try {
        const rows = await sql`SELECT username FROM user_profiles WHERE id=${r.from} AND username IS NOT NULL LIMIT 1`;
        if (rows[0]?.username) setShareUsername(rows[0].username);
      } catch(_) {}
    }
  };

  const recName = (r) => r.byName || contactName(r.from);
  const isForwarded = (r) => r.sharedBy && r.sharedBy!==r.from;
  const sharedByName = (r) => isForwarded(r) ? (r.sharedByName||contactName(r.sharedBy)) : null;
  const byOptions = [...new Set(recs.map(recName))];
  const groupOptions = [...new Set(recs.filter(r=>r.shareType==="group").map(r=>r.groupId).filter(Boolean))];

  const patch = async (r, updates) => {
    setRecs(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,...updates}:x));
    if (sql && r.deliveryId) {
      try { await updateDelivery(r.deliveryId, updates, myId); } catch(e) { await onReload(); }
    }
  };
  const doInvest=(r,price)=>patch(r,{isInvested:true,investedPrice:price,invested:true});
  const unInvest=(r)=>patch(r,{isInvested:false,investedPrice:null,invested:false});
  const onInvestClick=(r)=>{ if(r.invested) unInvest(r); else setInvesting(r); };
  const react=(r,val)=>{ const next=r.reaction===val?"none":val; patch(r,{reaction:next}); };
  const toggleHide=(r)=>patch(r,{isHidden:!r.hidden,hidden:!r.hidden});
  const del=async(r)=>{
    if(!confirm("Remove this recommendation from your received list?")) return;
    setRecs(rs=>rs.filter(x=>x.deliveryId!==r.deliveryId));
    await dbDeleteDelivery(r.deliveryId, myId);
  };

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
    const dir=sort.dir==="asc"?1:-1; const k=sort.key;
    r=[...r].sort((a,b)=>{let av,bv;
      if(k==="assetName"){av=a.assetName.toLowerCase();bv=b.assetName.toLowerCase();}
      else if(k==="by"){av=recName(a).toLowerCase();bv=recName(b).toLowerCase();}
      else if(k==="date"){av=a.date||"";bv=b.date||"";}
      else if(k==="reco"){av=a.priceAt;bv=b.priceAt;}
      else if(k==="cur"){av=a.price;bv=b.price;}
      else if(k==="ret"){av=ret(a);bv=ret(b);}
      else if(k==="horizon"){av=HORIZONS.indexOf(a.horizon);bv=HORIZONS.indexOf(b.horizon);}
      return av<bv?-dir:av>bv?dir:0;});
    return r;
  },[recs,q,fBy,fGroup,fCls,fHorizon,fMoney,fInv,showHidden,showExpired,sort]);

  const expiredCount = recs.filter(x=>!x.hidden&&isExpired(x)).length;
  const activeFilterNote = fBy!=="all"?`From ${fBy}`:fGroup!=="all"?`Via ${groupName(fGroup)}`:null;

  return (<>
    {/* ── Compact top bar: search + filters + expired toggle all in one row ── */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div className="searchbox" style={{flex:"1 1 200px",minWidth:160}}>
        <Search size={15} color="var(--muted)"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search asset or contact…"/>
      </div>
      <select className="inline-select sm" value={fBy} onChange={e=>setFBy(e.target.value)} title="Filter by recommender">
        <option value="all">All people</option>{byOptions.map(b=><option key={b}>{b}</option>)}
      </select>
      <select className="inline-select sm" value={fCls} onChange={e=>setFCls(e.target.value)} title="Filter by class">
        <option value="all">All classes</option>{assetClasses.map(c=><option key={c}>{c}</option>)}
      </select>
      <select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)} title="Filter by horizon">
        <option value="all">All horizons</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}
      </select>
      <select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}>
        <option value="all">All returns</option><option value="in">In the money</option><option value="out">Out of money</option>
      </select>
      <select className="inline-select sm" value={fInv} onChange={e=>setFInv(e.target.value)}>
        <option value="all">All</option><option value="yes">Invested</option><option value="no">Not invested</option>
      </select>
      {/* Expired toggle — inline, compact */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:9,cursor:"pointer",flexShrink:0,userSelect:"none"}} onClick={()=>setShowExpired(v=>!v)}>
        <div className={"sw"+(showExpired?" on":"")} style={{width:32,height:18}} onClick={e=>{e.stopPropagation();setShowExpired(v=>!v)}}><div className="knob" style={{width:14,height:14,top:2}}/></div>
        <span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>Expired</span>
        {expiredCount>0 && <span className="pill loss" style={{fontSize:11,padding:"1px 6px"}}>{expiredCount}</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:9,cursor:"pointer",flexShrink:0}} onClick={()=>setShowHidden(v=>!v)}>
        <div className={"sw"+(showHidden?" on":"")} style={{width:32,height:18}}><div className="knob" style={{width:14,height:14,top:2}}/></div>
        <span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>Hidden</span>
      </div>
    </div>

    {/* Active filter badge */}
    {activeFilterNote && (
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:12}}>
        <span className="pill accent">{activeFilterNote}</span>
        <button onClick={()=>{setFBy("all");setFGroup("all");}} style={{fontSize:11,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",padding:0}}>✕ Clear</button>
      </div>
    )}
    {recs.some(r=>r.exitSignal&&(showHidden||!r.hidden)) && (
      <div className="note warn" style={{marginBottom:10,padding:"8px 12px",fontSize:12}}><AlertTriangle size={14}/><div>A recommender has issued an <b>exit signal</b> on a recommendation below.</div></div>
    )}

    {rows.length===0
      ? <div className="card"><div className="empty">No recommendations match your filters.</div></div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <table className="grid" style={{width:"100%"}}>
              <thead><tr>
                <SortTh label="Asset" k="assetName" sort={sort} setSort={setSort}/>
                <SortTh label="By" k="by" sort={sort} setSort={setSort}/>
                <SortTh label="Date" k="date" sort={sort} setSort={setSort}/>
                <SortTh label="Reco ₹" k="reco" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current ₹" k="cur" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
                <th>Status</th>
                <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
                <th title="Your reaction">React</th>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{rows.map(r=>{
                const itm=ret(r)>=0; const open=openRow===r.id; const exp=isExpired(r); const td=getTargetDate(r);
                return (<React.Fragment key={r.id}>
                  <tr className={"hoverable"+(r.exitSignal?" exit":"")+(r.hidden?" hiddenrow":"")+(exp?" expired":"")}>
                    {/* Asset — expand on click */}
                    <td style={{cursor:"pointer",maxWidth:200}} onClick={()=>setOpenRow(open?null:r.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{transform:open?"rotate(180deg)":"none",transition:".15s",flexShrink:0}}/>
                        <div>
                          <div className="sym" style={{fontSize:13}}>{r.assetName}</div>
                          <div style={{fontSize:11,color:"var(--muted)"}}>{r.assetClass&&<ClassTag c={r.assetClass}/>}</div>
                        </div>
                      </div>
                      {r.hidden && <span className="pill" style={{marginLeft:8,fontSize:10}}>Hidden</span>}
                      {exp && <span className="pill loss" style={{marginLeft:8,fontSize:10}}>Expired</span>}
                    </td>
                    {/* Recommended by */}
                    <td style={{maxWidth:130}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recName(r)}</div>
                      {isForwarded(r) && <div style={{fontSize:11,color:"var(--muted)",display:"flex",alignItems:"center",gap:3}}><Forward size={10}/> via {sharedByName(r)}</div>}
                    </td>
                    <td className="muted small nowrap">{fmtDate(r.date)}</td>
                    <td style={{textAlign:"right"}} className="tnum">{r.priceAt?fmt(r.priceAt):<span className="muted">—</span>}</td>
                    <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
                    <td style={{textAlign:"right"}} className={"tnum nowrap "+(itm?"pos":"neg")} style={{fontWeight:700,textAlign:"right"}}>{fmtPct(ret(r))}</td>
                    <td>
                      <Money itm={itm}/>
                      {r.exitSignal && <div style={{marginTop:3}}><span className="pill loss" style={{fontSize:10}}><AlertTriangle size={10}/> EXIT</span></div>}
                    </td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    {/* Reactions */}
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <button className={"iconbtn"+(r.reaction==="like"?" on-like":"")} title="Like" onClick={()=>react(r,"like")}><ThumbsUp size={13}/></button>
                        <span className="muted small tnum" style={{fontSize:11}}>{r.likes}</span>
                        <button className={"iconbtn"+(r.reaction==="dislike"?" on-dislike":"")} title="Dislike" onClick={()=>react(r,"dislike")}><ThumbsDown size={13}/></button>
                        <span className="muted small tnum" style={{fontSize:11}}>{r.dislikes}</span>
                      </div>
                    </td>
                    {/* Actions */}
                    <td>
                      <div className="actions" style={{gap:4}}>
                        {r.invested
                          ? <button className="btn btn-sm btn-soft" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>onInvestClick(r)}><Check size={12}/> Invested</button>
                          : <button className="btn btn-sm btn-ghost" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>onInvestClick(r)}>Invest</button>}
                        {/* Share — external public link + forward within platform */}
                        <div style={{position:"relative"}}>
                          <button className="iconbtn" title="Share / forward" onClick={(e)=>handleReceivedShare(e,r)}><Share2 size={13}/></button>
                          {sharePopId===r.id && (
                            <ReceivedSharePopover
                              reco={r}
                              fromUsername={shareUsername}
                              anchorEl={shareAnchor}
                              onForward={()=>{ setFwd(r); setSharePopId(null); }}
                              onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                            />
                          )}
                        </div>
                        <button className="iconbtn" title={r.hidden?"Unhide":"Hide"} onClick={()=>toggleHide(r)}>{r.hidden?<Eye size={13}/>:<EyeOff size={13}/>}</button>
                        <button className="iconbtn danger" title="Remove" onClick={()=>del(r)}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                  {/* ── Expanded detail row ── */}
                  {open && (
                    <tr className="expand-row"><td colSpan={10}><div className="expand-inner">
                      <div style={{display:"flex",gap:32,flexWrap:"wrap",marginBottom:12}}>
                        <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
                        <div><div className="cap">Asset class</div><ClassTag c={r.assetClass}/></div>
                        <div><div className="cap">Shared as</div><b>{r.shareType==="group"?`Group · ${groupName(r.groupId)}`:"Direct"}</b></div>
                        {isForwarded(r)&&<div><div className="cap">Forwarded by</div><b>{sharedByName(r)}</b></div>}
                        {r.targetPrice&&<div><div className="cap">Target price</div><b className="tnum">{fmt(r.targetPrice)}</b></div>}
                        {r.stopLoss&&<div><div className="cap">Stop loss</div><b className="tnum neg">{fmt(r.stopLoss)}</b></div>}
                        {td&&<div><div className="cap">Target date</div><b className={exp?"neg":""}>{fmtDate(td)}{exp?" · Expired":""}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.invested&&<div><div className="cap">My entry</div><b className="tnum pos">{r.investedPrice?fmt(r.investedPrice):"—"}</b></div>}
                      </div>
                      <div className="cap">Thesis from {recName(r)}{isForwarded(r)?` · forwarded by ${sharedByName(r)}`:""}</div>
                      <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink-soft)",marginTop:4,marginBottom:12,maxWidth:720}}>
                        {r.thesis || <span className="muted">No thesis shared.</span>}
                      </div>
                      <button className="btn btn-soft btn-sm" onClick={()=>setFwd(r)}><Forward size={13}/> Forward this idea</button>
                      <div style={{marginTop:18,borderTop:'1px solid var(--line)',paddingTop:14}}>
                        <div className="cap" style={{marginBottom:10}}>Comments</div>
                        <RecoComments recoId={r.id} me={me}/>
                      </div>
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
          </div>
        </div>}

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
  const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [openRow,setOpenRow]=useState(null);
  const [showNew,setShowNew]=useState(false); const [share,setShare]=useState(null);
  const [sharePopId, setSharePopId] = useState(null);
  const [shareAnchor, setShareAnchor] = useState(null);
  const [exitingId,  setExitingId]  = useState(null);

  const del=async(r)=>{
    if(!confirm("Delete this recommendation? This will remove it from all recipients\' lists too.")) return;
    setRecs(rs=>rs.filter(x=>x.id!==r.id));
    await dbDeleteReco(r.id, me?.id);
  };

  const toggleExit=async(r)=>{
    if (r.exit) {
      if(!confirm("Cancel the exit signal for this recommendation?")) return;
      setRecs(rs=>rs.map(x=>x.id===r.id?{...x,exit:false,exitDate:null,exitPrice:null}:x));
      if(sql && me?.id) { try { await dbCancelExit(r.id,me.id); await onReload(); } catch(_){} }
    } else {
      setExitingId(r.id);
      let exitPriceData = null;
      try { exitPriceData = await getTodayClose(r.ticker, r.exchange || "NSE"); }
      catch(e) { console.warn("Exit price fetch failed:", e.message); }
      const priceLabel = exitPriceData
        ? `₹${Number(exitPriceData.price).toLocaleString("en-IN")} (${sourceName(exitPriceData.source)} · ${exitPriceData.date})`
        : "Price unavailable — will not be stamped (flagged on profile)";
      const confirmed = confirm(`Exit "${r.ticker}"?\n\nExit price: ${priceLabel}\n\nThis records your exit and closes the recommendation.`);
      setExitingId(null);
      if (!confirmed) return;
      setRecs(rs=>rs.map(x=>x.id===r.id?{...x,exit:true,exitDate:TODAY,exitPrice:exitPriceData?.price||null}:x));
      if(sql && me?.id) {
        try { await dbSetExit(r.id, me.id, exitPriceData?.price||null, exitPriceData?.source||"unavailable"); await onReload(); } catch(_){}
      }
    }
  };
  const reShare=(r,targets)=>setRecs(rs=>rs.map(x=>x.id===r.id?{...x,recipients:[...new Set([...x.recipients,...targets])]}:x));

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
      else if(k==="date"){av=a.date;bv=b.date;}
      else if(k==="reco"){av=a.priceAt;bv=b.priceAt;}
      else if(k==="cur"){av=a.price;bv=b.price;}
      else if(k==="ret"){av=ret(a);bv=ret(b);}
      else if(k==="target"){av=a.targetPrice||0;bv=b.targetPrice||0;}
      else if(k==="horizon"){av=HORIZONS.indexOf(a.horizon);bv=HORIZONS.indexOf(b.horizon);}
      return av<bv?-dir:av>bv?dir:0; });
    return r;
  },[recs,q,fCls,fHorizon,fMoney,showExpired,sort]);

  const expiredCount = recs.filter(x=>isExpired(x)).length;

  return (<>
    {/* ── Compact toolbar ── */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div className="searchbox" style={{flex:"1 1 200px",minWidth:160}}>
        <Search size={15} color="var(--muted)"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by asset or ticker…"/>
      </div>
      <select className="inline-select sm" value={fCls} onChange={e=>setFCls(e.target.value)}>
        <option value="all">All classes</option>{assetClasses.map(c=><option key={c}>{c}</option>)}
      </select>
      <select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)}>
        <option value="all">All horizons</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}
      </select>
      <select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}>
        <option value="all">All returns</option><option value="in">In the money</option><option value="out">Out of money</option>
      </select>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:9,cursor:"pointer",flexShrink:0}} onClick={()=>setShowExpired(v=>!v)}>
        <div className={"sw"+(showExpired?" on":"")} style={{width:32,height:18}}><div className="knob" style={{width:14,height:14,top:2}}/></div>
        <span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>Expired</span>
        {expiredCount>0 && <span className="pill loss" style={{fontSize:11,padding:"1px 6px"}}>{expiredCount}</span>}
      </div>
      <button className="btn btn-pri btn-sm" onClick={()=>setShowNew(true)}><Plus size={15}/> New recommendation</button>
    </div>

    {rows.length===0
      ? <div className="card"><div className="empty">No recommendations match your filters.</div></div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <table className="grid" style={{width:"100%"}}>
              <thead><tr>
                <SortTh label="Asset" k="assetName" sort={sort} setSort={setSort}/>
                <SortTh label="Date" k="date" sort={sort} setSort={setSort}/>
                <SortTh label="Reco ₹" k="reco" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Target ₹" k="target" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current ₹" k="cur" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
                <th>Status</th>
                <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{rows.map(r=>{
                const itm=ret(r)>=0; const open=openRow===r.id; const expired=isExpired(r); const td=getTargetDate(r);
                return (<React.Fragment key={r.id}>
                  <tr className={"hoverable"+(r.exit?" exit":"")+(expired?" expired":"")}>
                    {/* Asset — click to expand */}
                    <td style={{cursor:"pointer",maxWidth:220}} onClick={()=>setOpenRow(open?null:r.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{transform:open?"rotate(180deg)":"none",transition:".15s",flexShrink:0}}/>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span className="sym" style={{fontSize:13}}>{r.assetName}</span>
                            <span className={r.isPublic?"pill gain":"pill"} style={{fontSize:10,padding:"1px 6px"}}>{r.isPublic?"Public":"Private"}</span>
                          </div>
                          <div style={{fontSize:11,color:"var(--muted)"}}><ClassTag c={r.assetClass}/></div>
                        </div>
                      </div>
                      {expired && <span className="pill loss" style={{fontSize:10,marginLeft:4}}>Expired</span>}
                      {r.exit && <div style={{marginTop:2}}><span className="pill loss" style={{fontSize:10}}><LogOut size={10}/> Exited {r.exitDate?fmtDate(r.exitDate):""}</span></div>}
                    </td>
                    <td className="muted small nowrap">{fmtDate(r.date)}</td>
                    <td style={{textAlign:"right"}} className="tnum">{r.priceAt?fmt(r.priceAt):<span className="muted">—</span>}</td>
                    <td style={{textAlign:"right"}} className="tnum">{r.targetPrice?fmt(r.targetPrice):<span className="muted">—</span>}</td>
                    <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
                    <td style={{textAlign:"right",fontWeight:700}} className={"tnum nowrap "+(itm?"pos":"neg")}>{fmtPct(ret(r))}</td>
                    <td><Money itm={itm}/></td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    <td>
                      <div className="actions" style={{gap:4}}>
                        {r.isPublic && (
                          <div style={{position:"relative"}}>
                            <button className="iconbtn" title="Copy public link" onClick={(e)=>setSharePopId(sharePopId===r.id?(setShareAnchor(null),null):(setShareAnchor(e.currentTarget),r.id))}><Link size={13}/></button>
                            {sharePopId===r.id && <SharePublicPopover reco={r} username={me.username} anchorEl={shareAnchor} onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}/>}
                          </div>
                        )}
                        <button className="iconbtn" title="Share with contacts / groups" onClick={()=>setShare(r)}><Share2 size={13}/></button>
                        <button className={"btn btn-sm "+(r.exit?"btn-ghost":"btn-soft")} style={{fontSize:11,padding:"4px 8px"}} disabled={exitingId===r.id} onClick={()=>toggleExit(r)}>
                          {exitingId===r.id?<><Loader size={12} className="spin"/> …</>:<><LogOut size={12}/> {r.exit?"Cancel exit":"Send exit"}</>}
                        </button>
                        <button className="iconbtn danger" title="Delete" onClick={()=>del(r)}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                  {/* ── Expanded detail row ── */}
                  {open && (
                    <tr className="expand-row"><td colSpan={9}><div className="expand-inner">
                      {/* Meta info strip */}
                      <div style={{display:"flex",gap:28,flexWrap:"wrap",marginBottom:12}}>
                        <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
                        <div><div className="cap">Class</div><ClassTag c={r.assetClass}/></div>
                        <div><div className="cap">Shared with</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:2}}>{r.recipients.map(id=><span key={id} className="chip mini">{recipientName(id)}</span>)}</div>
                        </div>
                        {r.stopLoss&&<div><div className="cap">Stop loss</div><b className="tnum neg">{fmt(r.stopLoss)}</b></div>}
                        {td&&<div><div className="cap">Target date</div><b className={expired?"neg":""}>{fmtDate(td)}{expired?" · Expired":""}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.sector&&<div><div className="cap">Sector</div><b>{r.sector}</b></div>}
                        <div><div className="cap">Acted on it</div><b>{r.actedList.length} of {reach(r.recipients)}</b></div>
                        <div><div className="cap">Reactions</div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <ThumbsUp size={13} color="var(--gain)"/><b>{r.likes.length}</b>
                            <ThumbsDown size={13} color="var(--loss)" style={{marginLeft:6}}/><b>{r.dislikes.length}</b>
                          </div>
                        </div>
                      </div>
                      {/* Thesis */}
                      <div className="cap">Your thesis</div>
                      <div style={{fontSize:13,lineHeight:1.7,color:"var(--ink-soft)",marginTop:4,marginBottom:12,maxWidth:720}}>
                        {r.thesis && r.thesis!=="—"?r.thesis:<span className="muted">No thesis recorded.</span>}
                      </div>
                      {/* Acted on list */}
                      {r.actedList.length>0&&(
                        <><div className="cap" style={{marginBottom:6}}>Who acted on it</div>
                        <div className="namelist" style={{marginBottom:12}}>{r.actedList.map((a,i)=>(
                          <span key={i} className="nl-item"><span className="av" style={{width:24,height:24,background:CONTACT_COLORS[i%CONTACT_COLORS.length],fontSize:9}}>{initialsOf(a.name)}</span>{a.name}<span className="muted small"> · {fmtDate(a.date)}</span></span>
                        ))}</div></>
                      )}
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
          </div>
        </div>}

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
  const [selectedInstr, setSelectedInstr] = useState(null);
  const [assetName,   setAssetName]   = useState("");
  const [ticker,      setTicker]      = useState("");
  const [cls,         setCls]         = useState(assetClasses[0]);
  const [currency,    setCurrency]    = useState("INR");
  const [recType,     setRecType]     = useState("Buy");
  const [conviction,  setConviction]  = useState("");
  const [sector,      setSector]      = useState("");
  // Auto-stamped entry price
  const [priceData,   setPriceData]   = useState(null);  // { price, source, date }
  const [priceLoading,setPriceLoading]= useState(false);
  const [priceError,  setPriceError]  = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [stopLoss,    setStopLoss]    = useState("");
  const [horizon,     setHorizon]     = useState("12m");
  const [thesis,      setThesis]      = useState("");
  const [targets,     setTargets]     = useState([]);
  const [isPublic,    setIsPublic]    = useState(true);
  const [adding,      setAdding]      = useState(false);
  const [newCat,      setNewCat]      = useState("");

  // Auto-fetch price whenever instrument changes
  useEffect(() => {
    if (!selectedInstr) return;
    setPriceData(null); setPriceError(""); setPriceLoading(true);
    getPreviousClose(selectedInstr.symbol, selectedInstr.exchange || "NSE")
      .then(d => { setPriceData(d); setPriceLoading(false); })
      .catch(e => {
        setPriceError(e.message || "Could not fetch price");
        setPriceLoading(false);
      });
  }, [selectedInstr?.symbol, selectedInstr?.exchange]);

  const CURRENCY_SYMBOL = { INR:"₹", USD:"$", GBP:"£", EUR:"€" };

  const onInstrSelect = (inst) => {
    if (!inst) {
      setSelectedInstr(null);
      setSector("");
      return;
    }
    setSelectedInstr(inst);
    setTicker(inst.symbol);
    setAssetName(inst.name);
    setCls(inst.assetClass || assetClasses[0]);
    setCurrency(inst.currency || "INR");
    setSector(inst.sector || "");   // auto-fill if available in master
  };

  const toggle  = (id) => setTargets(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id]);
  const addCat  = () => { const c=newCat.trim(); if(c&&!assetClasses.includes(c)){setAssetClasses(a=>[...a,c]);setCls(c);} setNewCat(""); setAdding(false); };

  const create = async () => {
    const rp = priceData?.price || 0;
    const td = calcTargetDate(TODAY, horizon);
    const recoData = {
      assetName: assetName.trim() || ticker.toUpperCase(),
      ticker: (ticker||"—").toUpperCase(), assetClass:cls, currency,
      priceAt: rp, price: rp,
      targetPrice: targetPrice ? +targetPrice : null,
      stopLoss:    stopLoss    ? +stopLoss    : null,
      horizon, targetDate: td, thesis: thesis||"—",
      isPublic, recType,
      conviction:  conviction  || null,
      sector:      sector      || null,
      exchange:    selectedInstr?.exchange || "NSE",
      priceSource: priceData?.source || null,
    };
    const recipients = targets.map(id=>({ type:groups.some(g=>g.id===id)?"group":"user", id }));
    if (sql && me?.id) {
      try { await dbCreateReco(recoData, me.id, recipients); await onCreate?.reload?.(); }
      catch(e) { console.error("create reco:", e); }
    }
    onCreate({ id:"m"+Date.now(), ...recoData, date:TODAY, recipients:targets, actedList:[], likes:[], dislikes:[], exit:false, exitDate:null });
  };

  const valid = (assetName.trim()||ticker.trim()) && (isPublic || targets.length>0) && (priceData?.price > 0 || !!priceError);

  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h3><Sparkles size={18} style={{verticalAlign:-3,color:"var(--accent)"}}/> New recommendation</h3><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">

      {/* Recommendation type — Buy / Sell */}
      <div className="field"><label>Recommendation type</label>
        <div style={{display:"flex",gap:8}}>
          {["Buy","Sell"].map(t=>(
            <button key={t} onClick={()=>setRecType(t)}
              style={{flex:1,padding:"10px 0",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",border:"1.5px solid",
                background: recType===t ? (t==="Buy"?"var(--gain-soft)":"var(--loss-soft)") : "var(--surface)",
                color:      recType===t ? (t==="Buy"?"var(--gain)":"var(--loss)") : "var(--muted)",
                borderColor:recType===t ? (t==="Buy"?"var(--gain)":"var(--loss)") : "var(--line)",
              }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Instrument search */}
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

      {/* Sector — locked from master, editable only when manual */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",columnGap:14}}>
        <div className="field">
          <label style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Sector</span>
            {selectedInstr?.sector
              ? <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:"var(--gain-soft)",color:"var(--gain)"}}>From security master</span>
              : <span className="muted small">{selectedInstr ? "Not in master — select below" : "Optional"}</span>}
          </label>
          {selectedInstr?.sector
            ? <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,background:"var(--surface-2)",fontSize:14,color:"var(--ink-soft)",display:"flex",alignItems:"center",gap:8}}>
                <Lock size={13} color="var(--muted)"/>
                {selectedInstr.sector}
              </div>
            : <select value={sector} onChange={e=>setSector(e.target.value)}>
                <option value="">— Select sector —</option>
                {["Banking & Finance","Technology","Pharmaceuticals","Energy","FMCG","Automobiles","Defence","Capital Goods","Real Estate","Chemicals","Telecom","Metals & Mining","PSU","Healthcare","Infrastructure","Media","Retail","Others"].map(s=><option key={s}>{s}</option>)}
              </select>}
        </div>
        <div className="field"><label>Conviction <span className="muted small">(optional)</span></label>
          <select value={conviction} onChange={e=>setConviction(e.target.value)}>
            <option value="">— Not specified —</option>
            <option>Low</option><option>Medium</option><option>High</option>
          </select></div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",columnGap:14}}>
        {/* Currency — locked from master, editable only when manual */}
        <div className="field">
          <label style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Currency</span>
            {selectedInstr && <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:"var(--gain-soft)",color:"var(--gain)"}}>Master</span>}
          </label>
          {selectedInstr
            ? <div style={{padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,background:"var(--surface-2)",fontSize:14,color:"var(--ink-soft)",display:"flex",alignItems:"center",gap:8}}>
                <Lock size={13} color="var(--muted)"/>
                {CURRENCY_SYMBOL[currency]||currency} {currency}
              </div>
            : <select value={currency} onChange={e=>setCurrency(e.target.value)}>
                {["INR","USD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
              </select>}
        </div>
        {/* Auto-stamped entry price — non-editable for platform integrity */}
        <div className="field" style={{gridColumn:"span 2"}}>
          <label style={{display:"flex",justifyContent:"space-between"}}>
            <span>Entry price ({CURRENCY_SYMBOL[currency]||currency})</span>
            <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:priceData?"var(--gain-soft)":"var(--surface-2)",color:priceData?"var(--gain)":"var(--muted)"}}>
              {priceData?"Auto-stamped":"Awaiting instrument"}
            </span>
          </label>
          {priceLoading && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 13px",border:"1px solid var(--line)",borderRadius:11,background:"var(--surface-2)",fontSize:13,color:"var(--muted)"}}>
              <Loader size={14} className="spin"/> Fetching previous close…
            </div>
          )}
          {!priceLoading && priceData && (
            <div style={{padding:"11px 13px",border:"1px solid var(--gain)",borderRadius:11,background:"var(--gain-soft)",fontSize:14,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>
              {CURRENCY_SYMBOL[currency]||currency}{Number(priceData.price).toLocaleString("en-IN")}
              <div style={{fontSize:10,fontWeight:400,color:"var(--gain)",marginTop:3}}>{sourceName(priceData.source)} · {priceData.date}</div>
            </div>
          )}
          {!priceLoading && !priceData && !priceError && (
            <div style={{padding:"11px 13px",border:"1px dashed var(--line-2)",borderRadius:11,background:"var(--surface-2)",fontSize:13,color:"var(--muted)"}}>
              — Select an instrument above
            </div>
          )}
          {priceError && (
            <div style={{padding:"11px 13px",border:"1px solid var(--amber)",borderRadius:11,background:"var(--amber-soft)",fontSize:12,color:"var(--amber)"}}>
              <AlertTriangle size={13}/> Price will be auto-stamped tonight by the nightly batch using closing price.
              <div style={{marginTop:3,opacity:.8}}>Entry price is stamped using closing price of recommendation date — not manual entry.</div>
            </div>
          )}
        </div>
        <div className="field"><label>Target price <span className="muted small">(opt.)</span></label>
          <input type="number" value={targetPrice} onChange={e=>setTargetPrice(e.target.value)} placeholder="0"/></div>
        <div className="field"><label>Stop loss <span className="muted small">(opt.)</span></label>
          <input type="number" value={stopLoss} onChange={e=>setStopLoss(e.target.value)} placeholder="0"/></div>
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
      <label style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:13,fontWeight:600,cursor:"pointer",padding:"12px 0 0",borderTop:"1px solid var(--line)",marginTop:8}}>
        <input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)} style={{width:16,height:16,accentColor:"var(--accent)",marginTop:1,flexShrink:0}}/>
        <div>
          Make this recommendation public
          <div style={{fontWeight:400,color:"var(--muted)",fontSize:12,marginTop:2}}>
            Visible to anyone who visits your public profile page, not just your network.
          </div>
        </div>
      </label>
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

/* =================================================================== PUBLIC PROFILE */

const SECTOR_EMOJI = {
  "Banking & Finance":"🏦","Technology":"💻","Pharmaceuticals":"💊","Energy":"⚡",
  "FMCG":"🛒","Automobiles":"🚗","Defence":"🛡","Capital Goods":"⚙️",
  "Real Estate":"🏗","Chemicals":"🧪","Telecom":"📡","Metals & Mining":"⛏",
  "PSU":"🏛","Healthcare":"🏥","Infrastructure":"🌉","Media":"📺","Retail":"🏪",
  "Others":"•••","Uncategorised":"•••",
};

/* ─── SVG Social Icons ──────────────────────────────────────────────────────── */
const SOCIAL_PATHS = {
  twitter:   "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  linkedin:  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  telegram:  "M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  instagram: "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12c0 3.259.014 3.668.072 4.948.058 1.278.262 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24c3.259 0 3.668-.014 4.948-.072 1.277-.058 2.148-.262 2.913-.558.788-.306 1.459-.717 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.635.558-2.913.06-1.28.072-1.689.072-4.948 0-3.259-.013-3.667-.072-4.947-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 10-2.88 0 1.44 1.44 0 002.88 0z",
};

function SocialIconBtn({ platform, url }) {
  const inner = (
    <div style={{
      width:34, height:34, borderRadius:9,
      background: url ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)',
      border: '1px solid rgba(255,255,255,.12)',
      display:'flex', alignItems:'center', justifyContent:'center',
      cursor: url ? 'pointer' : 'default',
      transition:'background .15s',
    }}
    onMouseEnter={e=>{ if(url) e.currentTarget.style.background='rgba(255,255,255,.24)'; }}
    onMouseLeave={e=>{ e.currentTarget.style.background = url ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)'; }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill={url ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.25)'}>
        <path d={SOCIAL_PATHS[platform]}/>
      </svg>
    </div>
  );
  if (!url) return inner;
  return <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:'none'}}>{inner}</a>;
}

/* ─── ICI Donut ─────────────────────────────────────────────────────────────── */
function IciDonut({ score, band }) {
  const r = 42, circ = 2 * Math.PI * r, filled = (score / 100) * circ;
  const col = score >= 70 ? '#4ade80' : score >= 50 ? '#a99dff' : score >= 30 ? '#fbbf24' : '#f87171';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
      <svg width={104} height={104} viewBox="0 0 104 104">
        <circle cx={52} cy={52} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={9}/>
        <circle cx={52} cy={52} r={r} fill="none" stroke={col} strokeWidth={9}
          strokeDasharray={`${filled} ${circ}`}
          strokeDashoffset={circ/4} strokeLinecap="round"/>
        <text x={52} y={47} textAnchor="middle" fontSize={22} fontWeight={800} fill="#fff" fontFamily="'JetBrains Mono',monospace">{score}</text>
        <text x={52} y={63} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,.45)">/100</text>
      </svg>
      <div style={{fontSize:11,fontWeight:700,color:col,marginTop:-4}}>{band}</div>
    </div>
  );
}

/* ─── Small helpers ─────────────────────────────────────────────────────────── */
function ScoreBox({ val, label, big, col }) {
  return (
    <div style={{textAlign:'center',padding:'11px 8px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10}}>
      <div style={{fontSize:big?22:17,fontWeight:800,color:col||'var(--ink)',fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{val}</div>
      <div style={{fontSize:10.5,color:'var(--muted)',marginTop:4,lineHeight:1.3}}>{label}</div>
    </div>
  );
}

function RetBadge({ pct, size=13 }) {
  const n=Number(pct||0), pos=n>=0;
  return <span style={{fontWeight:700,fontSize:size,color:pos?'var(--gain)':'var(--loss)',fontFamily:"'JetBrains Mono',monospace"}}>{pos?'+':''}{n.toFixed(1)}%</span>;
}

function TypeBadge({ t }) {
  return <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:t==='Sell'?'var(--loss-soft)':'var(--gain-soft)',color:t==='Sell'?'var(--loss)':'var(--gain)'}}>{t||'Buy'}</span>;
}

function ConvBadge({ level }) {
  if(!level) return null;
  const col=level==='High'?'var(--accent)':level==='Medium'?'var(--amber)':'var(--muted)';
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,border:`1px solid ${col}`,color:col}}>{level}</span>;
}

function StatusBadge2({ status }) {
  const cfg={Active:{bg:'#dbeafe',col:'#1d4ed8'},Closed:{bg:'var(--gain-soft)',col:'var(--gain)'},Expired:{bg:'#f3f4f6',col:'var(--muted)'}}[status]||{bg:'#f3f4f6',col:'var(--muted)'};
  return <span style={{fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:5,background:cfg.bg,color:cfg.col}}>{status}</span>;
}

/* ─── SharePublicPopover (unchanged) ────────────────────────────────────────── */
/* ─── ReceivedSharePopover — for received recommendations ─────────────────────── */
function ReceivedSharePopover({ reco, fromUsername, anchorEl, onForward, onClose }) {
  const [copied, setCopied] = useState(false);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target) && e.target !== anchorEl) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!pos) return null;

  const popStyle = {
    position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999,
    background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14,
    boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '16px 18px', minWidth: 290,
    fontFamily: 'var(--font)',
  };

  const url = fromUsername
    ? `${window.location.origin}${window.location.pathname}#/investor/${fromUsername}/reco/${reco.id}`
    : null;
  const waMsg = url ? encodeURIComponent(`Check out ${reco.ticker} (${reco.assetName}) on InvestorCircle:\n${url}`) : null;
  const copyLink = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => { setCopied(false); onClose(); }, 1600); });
  };

  return createPortal(
    <div ref={popRef} style={popStyle} onClick={e => e.stopPropagation()}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Share2 size={14} color="var(--accent)" /> Share this idea
      </div>
      {/* Forward within platform */}
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 8 }}
        onClick={() => { onForward(); onClose(); }}>
        <Forward size={14} /> Forward to your contacts
      </button>
      {/* External share — only if recommender has public profile */}
      {url ? (<>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Share publicly</div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 9px', fontSize: 11, color: 'var(--muted)', marginBottom: 8, wordBreak: 'break-all', lineHeight: 1.4 }}>{url}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-pri btn-sm" style={{ justifyContent: 'center' }} onClick={copyLink}>{copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy link</>}</button>
            <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{ justifyContent: 'center', textDecoration: 'none' }} onClick={onClose}><span style={{ fontSize: 14 }}>💬</span> Share on WhatsApp</a>
          </div>
        </div>
        <div className="muted small" style={{ fontSize: 11 }}>Links to the recommender's public profile.</div>
      </>) : (
        <div className="muted small" style={{ fontSize: 11, paddingTop: 4 }}>Public link unavailable — recommender hasn't set a username yet.</div>
      )}
    </div>,
    document.body
  );
}

function SharePublicPopover({ reco, username, onClose, anchorEl }) {
  const [copied,setCopied]=useState(false);
  const [pos,setPos]=useState(null);
  const popRef=useRef(null);

  useEffect(()=>{
    // Calculate fixed position from the anchor button
    if(anchorEl){
      const rect=anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom+8, right: window.innerWidth-rect.right });
    }
    // Close on outside click
    const h=(e)=>{ if(popRef.current&&!popRef.current.contains(e.target)&&e.target!==anchorEl) onClose(); };
    setTimeout(()=>document.addEventListener('mousedown',h),0);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);

  if(!pos) return null;

  const popStyle={
    position:'fixed', top:pos.top, right:pos.right, zIndex:9999,
    background:'var(--surface)',border:'1px solid var(--line)',borderRadius:14,
    boxShadow:'0 8px 32px rgba(0,0,0,.18)',padding:'16px 18px',minWidth:290,
    fontFamily:'var(--font)',
  };

  const noUser = (
    <div ref={popRef} style={popStyle} onClick={e=>e.stopPropagation()}>
      <div className="note warn" style={{fontSize:12}}><AlertTriangle size={13}/><div>Set a username in your profile first.</div></div>
      <button className="btn btn-ghost btn-sm" style={{marginTop:10,width:'100%'}} onClick={onClose}>Close</button>
    </div>
  );
  if(!username) return createPortal(noUser, document.body);

  const url=`${window.location.origin}${window.location.pathname}#/investor/${username}/reco/${reco.id}`;
  const waMsg=encodeURIComponent(`Check out ${reco.ticker} (${reco.assetName}) by @${username} on InvestorCircle:\n${url}`);
  const waUrl=`https://wa.me/?text=${waMsg}`;
  const copyLink=()=>{ navigator.clipboard.writeText(url).then(()=>{ setCopied(true); setTimeout(()=>{ setCopied(false); onClose(); },1600); }); };

  return createPortal(
    <div ref={popRef} style={popStyle} onClick={e=>e.stopPropagation()}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:12,display:'flex',alignItems:'center',gap:6}}><Globe size={14} color="var(--accent)"/> Share publicly</div>
      <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:9,padding:'8px 10px',fontSize:11,color:'var(--muted)',marginBottom:12,wordBreak:'break-all',lineHeight:1.5}}>{url}</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <button className="btn btn-pri btn-sm" style={{justifyContent:'center'}} onClick={copyLink}>{copied?<><Check size={14}/> Copied!</>:<><Copy size={14}/> Copy link</>}</button>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{justifyContent:'center',textDecoration:'none'}} onClick={onClose}><span style={{fontSize:15,lineHeight:1}}>💬</span> Share on WhatsApp</a>
      </div>
      <div className="muted small" style={{marginTop:10,fontSize:11}}>Anyone with this link can view — no login needed.</div>
    </div>,
    document.body
  );
}

/* ─── Main PublicProfilePage ─────────────────────────────────────────────────── */
function PublicProfilePage({ username, recoId, viewerUser, viewerConnections, mode, isOwnProfile, patchProfile, onBack, onRequestConnect }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);
  const [recTab,      setRecTab]      = useState('All');
  const [connecting,  setConnecting]  = useState(false);
  const [connected,   setConnected]   = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [expandedId,  setExpandedId]  = useState(recoId||null);
  const expandedRef = useRef(null);

  // Profile editing state — covers all editable fields
  const [editing,          setEditing]          = useState(false);
  const [editFirstName,    setEditFirstName]    = useState('');
  const [editLastName,     setEditLastName]     = useState('');
  const [editAvatarColor,  setEditAvatarColor]  = useState('');
  const [editBio,          setEditBio]          = useState('');
  const [editSocials,      setEditSocials]      = useState({ twitter:'', linkedin:'', telegram:'', instagram:'' });
  const [editRegStatus,    setEditRegStatus]    = useState('self_directed');
  const [editSebiNum,      setEditSebiNum]      = useState('');
  const [editSebiTill,     setEditSebiTill]     = useState('');
  const [editSebiFirm,     setEditSebiFirm]     = useState('');
  const [savingEdit,       setSavingEdit]       = useState(false);
  const [regOptions,       setRegOptions]       = useState([]);
  const [sebiVerifyMsg,    setSebiVerifyMsg]    = useState('');

  useEffect(()=>{
    setLoading(true); setNotFound(false); setData(null);
    dbGetPublicProfile(username).then(d=>{
      if(!d) setNotFound(true); else setData(d);
      setLoading(false);
    }).catch(()=>{ setNotFound(true); setLoading(false); });
  },[username]);

  useEffect(()=>{
    if(recoId&&data&&expandedRef.current)
      setTimeout(()=>expandedRef.current?.scrollIntoView({behavior:'smooth',block:'center'}),200);
  },[recoId,data]);

  const profileUserId=data?.profile?.id;
  const connStatus=useMemo(()=>{
    if(!profileUserId||!viewerConnections?.length) return 'none';
    const c=viewerConnections.find(c=>c.user_id===profileUserId);
    return c?.status||'none';
  },[profileUserId,viewerConnections]);
  useEffect(()=>{ if(connStatus==='accepted') setConnected(true); },[connStatus]);

  const handleConnect=async()=>{ setConnecting(true); await onRequestConnect(data.profile.id); setConnected(true); setConnecting(false); };

  const profileUrl=`${window.location.origin}${window.location.pathname}#/investor/${username}`;
  const copyLink=()=>{ navigator.clipboard.writeText(profileUrl).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); }); };

  // Load registration options + verification message when edit opens
  const startEdit=async()=>{
    const p=data?.profile||{};
    setEditFirstName(p.first_name||'');
    setEditLastName(p.last_name||'');
    setEditAvatarColor(p.avatar_color||'');
    setEditBio(p.bio||'');
    setEditSocials({ twitter:p.twitter_url||'', linkedin:p.linkedin_url||'', telegram:p.telegram_url||'', instagram:p.instagram_url||'' });
    setEditRegStatus(p.registration_status||'self_directed');
    setEditSebiNum(p.sebi_reg_number||'');
    setEditSebiTill(p.sebi_reg_valid_till||'');
    setEditSebiFirm(p.sebi_firm_name||'');
    if(sql && !regOptions.length) {
      try {
        const opts = await sql`SELECT * FROM registration_status_options WHERE is_active=true ORDER BY sort_order`;
        setRegOptions(opts);
        const msg = await sql`SELECT value FROM app_settings WHERE key='sebi_verification_message' LIMIT 1`;
        if(msg[0]) setSebiVerifyMsg(msg[0].value);
      } catch(_) {}
    }
    setEditing(true);
  };

  // Save all profile fields
  const saveEdit=async()=>{
    if(!sql||!data?.profile?.id) return;
    setSavingEdit(true);
    const isSebi = ['sebi_ra','sebi_ria'].includes(editRegStatus);
    const sebiChanged = editRegStatus !== (data.profile.registration_status||'self_directed');
    const newApprovalStatus = isSebi
      ? (sebiChanged ? 'pending' : (data.profile.sebi_approval_status||'not_applied'))
      : 'not_applied';
    try {
      const fn = editFirstName.trim(); const ln = editLastName.trim();
      await sql`UPDATE user_profiles SET
        first_name=${fn||null}, last_name=${ln||null},
        full_name=${[fn,ln].filter(Boolean).join(' ')||null},
        avatar_color=${editAvatarColor||null},
        bio=${editBio||null},
        twitter_url=${editSocials.twitter||null}, linkedin_url=${editSocials.linkedin||null},
        telegram_url=${editSocials.telegram||null}, instagram_url=${editSocials.instagram||null},
        registration_status=${editRegStatus},
        sebi_reg_number=${isSebi?(editSebiNum||null):null},
        sebi_reg_valid_till=${isSebi?(editSebiTill||null):null},
        sebi_firm_name=${isSebi?(editSebiFirm||null):null},
        sebi_approval_status=${newApprovalStatus},
        sebi_submitted_at=${isSebi&&sebiChanged?new Date().toISOString():data.profile.sebi_submitted_at||null}
      WHERE id=${data.profile.id}`;
      const updates = {
        first_name:fn, last_name:ln, full_name:[fn,ln].filter(Boolean).join(' '),
        avatar_color:editAvatarColor, bio:editBio,
        twitter_url:editSocials.twitter, linkedin_url:editSocials.linkedin,
        telegram_url:editSocials.telegram, instagram_url:editSocials.instagram,
        registration_status:editRegStatus,
        sebi_reg_number:isSebi?editSebiNum:null,
        sebi_reg_valid_till:isSebi?editSebiTill:null,
        sebi_firm_name:isSebi?editSebiFirm:null,
        sebi_approval_status:newApprovalStatus,
      };
      setData(d=>({...d,profile:{...d.profile,...updates}}));
      if(patchProfile) patchProfile(updates);
    } catch(e){ console.warn('Save failed:',e); }
    setSavingEdit(false);
    setEditing(false);
  };

  // ── Content renderer ──────────────────────────────────────────────────────
  const renderContent=()=>{
    if(loading) return <div style={{textAlign:'center',padding:'60px 0',color:'var(--muted)'}}><Loader size={28} className="spin" style={{marginBottom:14}}/><div>Loading public investment record…</div></div>;
    if(notFound) return <div style={{textAlign:'center',padding:'60px 0'}}><Globe size={36} color="var(--muted)" style={{marginBottom:14}}/><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Record not found</div><div className="muted small">@{username} hasn't set up a public profile yet.</div></div>;

    const { profile, summary, live, realized, sectors, recos } = data;
    const displayName=[profile.first_name,profile.last_name].filter(Boolean).join(' ')||profile.full_name||username;
    const memberSince=profile.created_at?new Date(profile.created_at).toLocaleDateString('en-IN',{month:'short',year:'numeric'}):null;

    const ici=computeIci({
      years_history:summary.years_history,
      total:summary.total,
      hit_rate_pct:realized.hit_rate_pct,
      median_return:realized.median_return,
      risk_adjusted_return:realized.risk_adjusted,
    });

    const filteredRecos=recTab==='All'?recos:recos.filter(r=>r.status===recTab);
    const recoIdNotPublic=recoId&&data&&!recos.find(r=>r.id===recoId);

    const showAddBtn=!isOwnProfile&&viewerUser&&!connected&&connStatus!=='pending';
    const showPending=!isOwnProfile&&viewerUser&&connStatus==='pending';
    const showConnected=!isOwnProfile&&viewerUser&&connected;
    const showJoinBtn=!isOwnProfile&&!viewerUser;

    return (
      <>
        {/* ── IDENTITY CARD ── */}
        <div style={{background:'#0f1117',borderRadius:16,overflow:'hidden',marginBottom:16,border:'1px solid rgba(255,255,255,.06)'}}>

          {/* Header row: avatar + info + ICI */}
          <div style={{padding:'24px 28px 20px',display:'flex',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>

            {/* Avatar */}
            <div style={{width:68,height:68,borderRadius:18,background:'linear-gradient(135deg,#6d5df5,#cf52d8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,fontWeight:800,color:'#fff',flexShrink:0}}>
              {initialsOf(displayName)}
            </div>

            {/* Name + badges + bio + socials */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:4}}>
                <span style={{fontSize:20,fontWeight:800,color:'#fff',letterSpacing:'-.3px'}}>{displayName}</span>
                {/* Registration status badge — dynamic */}
                {(()=>{
                  const status = profile.registration_status||'self_directed';
                  const approved = profile.sebi_approval_status==='approved';
                  const isSebi = ['sebi_ra','sebi_ria'].includes(status);
                  const statusLabel = isSebi&&approved
                    ? (status==='sebi_ra'?'SEBI Registered RA':'SEBI Registered RIA')
                    : (status==='enthusiast'?'Market Enthusiast':'Self-directed Investor');
                  return <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.7)',border:'1px solid rgba(255,255,255,.15)',textTransform:'uppercase',letterSpacing:.05}}>{statusLabel}</span>;
                })()}
                {/* SEBI badge — always defaults to Not SEBI Registered unless explicitly approved */}
                {(()=>{
                  const status = profile.registration_status||'self_directed';
                  const approved = profile.sebi_approval_status==='approved';
                  const isSebi = ['sebi_ra','sebi_ria'].includes(status);
                  if(isSebi && approved) return (
                    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(21,146,78,.2)',color:'#4ade80',border:'1px solid rgba(21,146,78,.4)',textTransform:'uppercase',letterSpacing:.05}}>
                      ✓ SEBI Registered{profile.sebi_reg_number?` · ${profile.sebi_reg_number}`:''}
                    </span>
                  );
                  return <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(244,63,94,.15)',color:'#fb7185',border:'1px solid rgba(244,63,94,.25)',textTransform:'uppercase',letterSpacing:.05}}>Not SEBI Registered</span>;
                })()}
              </div>
              <div style={{fontSize:13,color:'rgba(255,255,255,.5)',fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>@{username}{memberSince&&<span style={{marginLeft:10,fontFamily:'inherit'}}>· Since {memberSince}</span>}</div>

              {/* Bio */}
              {!editing && (
                <div style={{marginBottom:10}}>
                  {profile.bio
                    ? <p style={{fontSize:13,color:'rgba(255,255,255,.7)',lineHeight:1.6,margin:0}}>{profile.bio}</p>
                    : isOwnProfile && <p style={{fontSize:12,color:'rgba(255,255,255,.3)',fontStyle:'italic',margin:0}}>No bio yet — add one to tell visitors about your investment approach.</p>}
                  {isOwnProfile && <button onClick={startEdit} style={{marginTop:6,fontSize:11,fontWeight:600,background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4}}><Pencil size={11}/> Edit profile</button>}
                </div>
              )}

              {/* ── Expanded inline edit form ── */}
              {editing && (
                <div style={{marginBottom:12,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,padding:'16px 18px'}}>

                  {/* Avatar color */}
                  <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:.05,marginBottom:8}}>Avatar colour</div>
                  <div style={{display:'flex',gap:8,marginBottom:16}}>
                    {['#6d5df5','#cf52d8','#15924e','#0ea5b7','#d97706','#e11d48','#2563eb','#64748b'].map(c=>(
                      <div key={c} onClick={()=>setEditAvatarColor(c)} style={{width:28,height:28,borderRadius:8,background:c,cursor:'pointer',border:editAvatarColor===c?'2px solid #fff':'2px solid transparent',boxSizing:'border-box',transition:'.1s'}}/>
                    ))}
                    <div onClick={()=>setEditAvatarColor('')} style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#6d5df5,#cf52d8)',cursor:'pointer',border:!editAvatarColor?'2px solid #fff':'2px solid transparent',boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:700}}>AUTO</div>
                  </div>

                  {/* Name */}
                  <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:.05,marginBottom:8}}>Name</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                    {[{val:editFirstName,set:setEditFirstName,ph:'First name'},{val:editLastName,set:setEditLastName,ph:'Last name'}].map((f,i)=>(
                      <input key={i} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                        style={{background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.12)',borderRadius:7,padding:'8px 11px',fontSize:13,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box',width:'100%'}}/>
                    ))}
                  </div>

                  {/* Read-only username + email */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                    {[{label:'Username',val:`@${username}`},{label:'Email',val:profile.email||''}].map((f,i)=>(
                      <div key={i}>
                        <div style={{fontSize:10,color:'rgba(255,255,255,.35)',marginBottom:4,display:'flex',alignItems:'center',gap:4}}><Lock size={10}/>{f.label} (cannot be changed)</div>
                        <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:7,padding:'8px 11px',fontSize:12,color:'rgba(255,255,255,.35)',fontFamily:'monospace'}}>{f.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Bio */}
                  <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:.05,marginBottom:8}}>Bio</div>
                  <textarea value={editBio} onChange={e=>setEditBio(e.target.value)} rows={3} maxLength={300} placeholder="Describe your investment approach…"
                    style={{width:'100%',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',borderRadius:8,padding:'8px 11px',fontSize:13,color:'#fff',fontFamily:'inherit',resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
                  <div style={{fontSize:10,color:'rgba(255,255,255,.3)',textAlign:'right',marginTop:2,marginBottom:16}}>{editBio.length}/300</div>

                  {/* Social links */}
                  <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:.05,marginBottom:8}}>Social profile links</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                    {[
                      {key:'twitter',label:'Twitter / X',ph:'https://twitter.com/username'},
                      {key:'linkedin',label:'LinkedIn',ph:'https://linkedin.com/in/username'},
                      {key:'telegram',label:'Telegram',ph:'https://t.me/username'},
                      {key:'instagram',label:'Instagram',ph:'https://instagram.com/username'},
                    ].map(s=>(
                      <div key={s.key}>
                        <div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:4,display:'flex',alignItems:'center',gap:5}}>
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="rgba(255,255,255,.5)"><path d={SOCIAL_PATHS[s.key]}/></svg>{s.label}
                        </div>
                        <input value={editSocials[s.key]} onChange={e=>setEditSocials(p=>({...p,[s.key]:e.target.value}))} placeholder={s.ph}
                          style={{width:'100%',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.12)',borderRadius:7,padding:'7px 10px',fontSize:12,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                      </div>
                    ))}
                  </div>

                  {/* Registration status */}
                  <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:.05,marginBottom:8}}>Investor type</div>
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                    {(regOptions.length ? regOptions : [
                      {code:'self_directed',label:'Self-directed Investor',description:'Invests own money independently. No SEBI registration held.',requires_sebi_fields:false},
                      {code:'enthusiast',label:'Market Enthusiast',description:'Passionate about markets, shares ideas informally. No professional accountability.',requires_sebi_fields:false},
                      {code:'sebi_ra',label:'SEBI Registered Research Analyst',description:'SEBI registration under Research Analysts Regulations, 2014. Format: INH000XXXXXX.',requires_sebi_fields:true},
                      {code:'sebi_ria',label:'SEBI Registered Investment Adviser',description:'SEBI registration under Investment Advisers Regulations, 2013. Format: INA000XXXXXX.',requires_sebi_fields:true},
                    ]).map(opt=>(
                      <label key={opt.code} title={opt.description} style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',padding:'10px 12px',borderRadius:9,background:editRegStatus===opt.code?'rgba(109,93,245,.25)':'rgba(255,255,255,.04)',border:`1px solid ${editRegStatus===opt.code?'rgba(109,93,245,.6)':'rgba(255,255,255,.08)'}`,transition:'.15s'}}>
                        <input type="radio" name="regStatus" value={opt.code} checked={editRegStatus===opt.code} onChange={()=>setEditRegStatus(opt.code)}
                          style={{accentColor:'#6d5df5',marginTop:2,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{opt.label}</div>
                          <div style={{fontSize:11,color:'rgba(255,255,255,.45)',marginTop:2,lineHeight:1.4}}>{opt.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* SEBI fields — shown only for RA/RIA */}
                  {['sebi_ra','sebi_ria'].includes(editRegStatus) && (<>
                    <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.25)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                      <div style={{fontSize:12,color:'#fbbf24',lineHeight:1.6}}>
                        {sebiVerifyMsg || 'Your SEBI registration details will be reviewed by our team. Until verified, your profile will show "Not SEBI Registered". Approved profiles receive a green verified badge within 2–3 business days.'}
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                      {[
                        {label:'SEBI Registration Number',ph:editRegStatus==='sebi_ra'?'INH000XXXXXX':'INA000XXXXXX',val:editSebiNum,set:setEditSebiNum},
                        {label:'Registration Valid Till',ph:'',val:editSebiTill,set:setEditSebiTill,type:'date'},
                        {label:'Firm / Employer Name (optional)',ph:'e.g. XYZ Securities',val:editSebiFirm,set:setEditSebiFirm},
                      ].map((f,i)=>(
                        <div key={i} style={i===2?{gridColumn:'1/span 2'}:{}}>
                          <div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:4}}>{f.label}</div>
                          <input type={f.type||'text'} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                            style={{width:'100%',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.12)',borderRadius:7,padding:'8px 11px',fontSize:12,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box',colorScheme:'dark'}}/>
                        </div>
                      ))}
                    </div>
                  </>)}

                  <div style={{display:'flex',gap:8,marginTop:4,justifyContent:'flex-end'}}>
                    <button onClick={()=>setEditing(false)}
                      style={{padding:'8px 16px',borderRadius:10,fontWeight:700,fontSize:13,cursor:'pointer',background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',color:'#fff',fontFamily:'inherit'}}>
                      Cancel
                    </button>
                    <button className="btn btn-pri btn-sm" disabled={savingEdit} onClick={saveEdit}>
                      {savingEdit?<><Loader size={13} className="spin"/> Saving…</>:<><Check size={13}/> Save</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Social icons */}
              {!editing && (
                <div style={{display:'flex',gap:6}}>
                  {['twitter','linkedin','telegram','instagram'].map(p=>(
                    <SocialIconBtn key={p} platform={p} url={profile[`${p}_url`]}/>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
                {showAddBtn && <button className="btn btn-pri btn-sm" disabled={connecting} onClick={handleConnect} style={{background:'rgba(109,93,245,.8)',border:'none'}}>{connecting?<><Loader size={13} className="spin"/> Sending…</>:<><UserPlus size={13}/> Add to network</>}</button>}
                {showPending && <span style={{fontSize:12,color:'rgba(255,255,255,.5)',display:'flex',alignItems:'center',gap:5}}><Check size={12}/> Request sent</span>}
                {showConnected && <span style={{fontSize:12,color:'rgba(255,255,255,.5)',display:'flex',alignItems:'center',gap:5}}><Check size={12}/> Connected</span>}
                {showJoinBtn && <button className="btn btn-pri btn-sm" onClick={()=>onRequestConnect(data.profile.id)} style={{background:'rgba(109,93,245,.8)',border:'none'}}><UserPlus size={13}/> Join to connect</button>}
              </div>
            </div>

            {/* ICI Widget — fixed colors for dark background */}
            <div style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:14,padding:'16px 18px',minWidth:290,flexShrink:0}}>
              <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:.07,marginBottom:12}}>Investor Circle Credibility Index</div>
              <div style={{display:'flex',gap:14,alignItems:'center'}}>
                <IciDonut score={ici.score} band={ici.band}/>
                <div style={{flex:1,display:'flex',flexDirection:'column',gap:5}}>
                  {ici.components.map(c=>(
                    <div key={c.label} style={{display:'flex',alignItems:'center',gap:5}}>
                      <Check size={10} color="rgba(255,255,255,.35)"/>
                      <span style={{fontSize:10.5,color:'rgba(255,255,255,.65)',flex:1,lineHeight:1.2}}>{c.label}</span>
                      <span style={{fontSize:9.5,color:'rgba(255,255,255,.4)',fontFamily:"'JetBrains Mono',monospace",width:28,textAlign:'right'}}>{c.max}%</span>
                      <span style={{fontSize:10.5,color:'rgba(255,255,255,.8)',fontFamily:"'JetBrains Mono',monospace",width:36,textAlign:'right'}}>{c.score}/{c.max}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{marginTop:10,textAlign:'center'}}><a href="#methodology" style={{fontSize:11,color:'#a99dff',textDecoration:'none'}}>Learn more about ICI methodology →</a></div>
            </div>
          </div>

          {/* ── Stat strip ── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',background:'rgba(0,0,0,.25)',borderTop:'1px solid rgba(255,255,255,.06)'}}>
            {[
              {val:profile.connection_count||0, label:'Connections'},
              {val:profile.group_count||0,      label:'Groups'},
              {val:summary.total,               label:'Total Recommendations'},
              {val:summary.closed,              label:'Closed'},
              {val:summary.active,              label:'Active'},
              {val:`${summary.years_history.toFixed(1)} yrs`, label:'Public History'},
            ].map((s,i,arr)=>(
              <div key={s.label} style={{borderRight:i<arr.length-1?'1px solid rgba(255,255,255,.06)':'none',padding:'14px 8px',textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:800,color:'#fff',fontFamily:"'JetBrains Mono',monospace",letterSpacing:-1,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.45)',marginTop:4,textTransform:'uppercase',letterSpacing:.06,lineHeight:1.3}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SCORECARDS ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

          <div className="card">
            <div className="card-head">
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'var(--gain)',display:'inline-block'}}/><span style={{fontSize:13,fontWeight:700}}>Live Scorecard</span><span className="muted small">Active Recommendations</span></span>
            </div>
            <div className="card-body">
              {live.count===0?<div className="empty" style={{padding:'20px 0'}}>No active recommendations.</div>:(<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={live.count} label="Active" big/>
                  <ScoreBox val={`${live.in_profit} (${live.count?Math.round(live.in_profit/live.count*100):0}%)`} label="In Profit" col="var(--gain)" big/>
                  <ScoreBox val={`${live.in_loss} (${live.count?Math.round(live.in_loss/live.count*100):0}%)`} label="In Loss" col="var(--loss)" big/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={<RetBadge pct={live.avg_return}/>} label="Avg Live Return"/>
                  <ScoreBox val={`${live.avg_holding_days||0}d`} label="Avg Holding"/>
                  <ScoreBox val="—" label="Alpha vs NIFTY"/>
                </div>
                {(live.best||live.worst)&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                  {live.best&&<ScoreBox val={<><b>{live.best.ticker}</b> <RetBadge pct={live.best.ret_pct}/></>} label="Best Performer"/>}
                  {live.worst&&<ScoreBox val={<><b>{live.worst.ticker}</b> <RetBadge pct={live.worst.ret_pct}/></>} label="Worst Performer"/>}
                </div>}
              </>)}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}/><span style={{fontSize:13,fontWeight:700}}>Realized Scorecard</span><span className="muted small">Closed only</span></span>
            </div>
            <div className="card-body">
              {realized.count===0?<div className="empty" style={{padding:'20px 0'}}>No closed recommendations yet.</div>:(<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={realized.count} label="Closed" big/>
                  <ScoreBox val={`${realized.hit_rate_pct.toFixed(1)}%`} label="Hit Rate" col={realized.hit_rate_pct>=50?'var(--gain)':'var(--loss)'} big/>
                  <ScoreBox val={<RetBadge pct={realized.median_return}/>} label="Median Return" big/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={<RetBadge pct={realized.avg_return}/>} label="Avg Return"/>
                  <ScoreBox val={`${realized.avg_holding_days||0}d`} label="Avg Holding"/>
                  <ScoreBox val={`${realized.win_count}/${realized.loss_count}`} label="Win/Loss"/>
                  <ScoreBox val={isNaN(realized.risk_adjusted)?'—':Number(realized.risk_adjusted).toFixed(2)} label="Risk-Adj."/>
                </div>
                {realized.best&&<div style={{padding:'9px 12px',background:'var(--gain-soft)',borderRadius:9,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:12,fontWeight:600,color:'var(--gain)'}}>Best Closed Trade</span>
                  <span><b>{realized.best.ticker}</b> <RetBadge pct={realized.best.ret_pct}/></span>
                </div>}
              </>)}
            </div>
          </div>
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',padding:'9px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,marginBottom:14,fontSize:12,color:'var(--muted)'}}>
          <AlertTriangle size={13} style={{flexShrink:0}}/><span>Returns on active positions use current price and may change daily. Only closed recommendations feed the realized scorecard.</span>
        </div>

        {/* ── SECTOR PERFORMANCE ── */}
        {sectors.length>0&&(
          <div className="card" style={{marginBottom:14}}>
            <div className="card-head">
              <span style={{fontSize:13,fontWeight:700}}>Sector Performance</span>
              <div style={{display:'flex',gap:12,fontSize:11,color:'var(--muted)'}}>
                <span><span style={{display:'inline-block',width:10,height:10,borderRadius:3,background:'var(--gain)',marginRight:4}}/> Active Success %</span>
                <span><span style={{display:'inline-block',width:10,height:10,borderRadius:3,background:'var(--accent)',marginRight:4}}/> Closed Hit Rate %</span>
              </div>
            </div>
            <div style={{padding:'16px 20px 12px',overflowX:'auto'}}>
              <div style={{display:'flex',gap:20,minWidth:'max-content'}}>
                {sectors.map(s=>{
                  const ap=s.active_count?Math.round(s.active_in_profit/s.active_count*100):null;
                  const cp=s.closed_count?Math.round(s.closed_wins/s.closed_count*100):null;
                  return(
                    <div key={s.sector} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minWidth:90}}>
                      <div style={{display:'flex',gap:4,alignItems:'flex-end',height:52}}>
                        {ap!=null&&<div style={{width:20,height:`${Math.max(ap,4)}%`,background:'var(--gain)',borderRadius:'4px 4px 0 0'}} title={`Active: ${ap}%`}/>}
                        {cp!=null&&<div style={{width:20,height:`${Math.max(cp,4)}%`,background:'var(--accent)',borderRadius:'4px 4px 0 0'}} title={`Closed: ${cp}%`}/>}
                      </div>
                      <div style={{fontSize:10.5,fontWeight:700,display:'flex',gap:5}}>
                        {ap!=null&&<span style={{color:'var(--gain)'}}>{ap}%</span>}
                        {cp!=null&&<span style={{color:'var(--accent)'}}>{cp}%</span>}
                      </div>
                      <div style={{fontSize:11,fontWeight:700,textAlign:'center',lineHeight:1.3}}>{SECTOR_EMOJI[s.sector]||'•'} {s.sector}</div>
                      <div style={{fontSize:10,color:'var(--muted)'}}>{s.total_recs} rec{s.total_recs!==1?'s':''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── RECOMMENDATION TIMELINE ── */}
        <div className="card" style={{marginBottom:14}}>
          <div className="card-head">
            <span style={{fontSize:13,fontWeight:700}}>Recommendation History</span>
            <span className="muted small">Public record · Permanent &amp; immutable</span>
          </div>
          <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--line)',padding:'0 16px'}}>
            {[
              {key:'All',count:recos.length},
              {key:'Active',count:recos.filter(r=>r.status==='Active').length},
              {key:'Closed',count:recos.filter(r=>r.status==='Closed').length},
              {key:'Expired',count:recos.filter(r=>r.status==='Expired').length},
            ].map(t=>(
              <button key={t.key} onClick={()=>setRecTab(t.key)} style={{background:'none',border:'none',cursor:'pointer',padding:'11px 14px',fontWeight:700,fontSize:13,color:recTab===t.key?'var(--accent)':'var(--muted)',borderBottom:recTab===t.key?'2px solid var(--accent)':'2px solid transparent',marginBottom:-1,fontFamily:'inherit'}}>
                {t.key}{t.count>0&&<span style={{fontSize:11,marginLeft:4,opacity:.7}}>({t.count})</span>}
              </button>
            ))}
          </div>
          {recoIdNotPublic&&(
            <div style={{display:'flex',gap:10,alignItems:'flex-start',margin:'12px 16px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 16px'}}>
              <Lock size={15} color="var(--muted)"/><div><div style={{fontWeight:700,fontSize:13,marginBottom:3}}>Recommendation not publicly visible</div><div className="muted small">This recommendation is only visible to the investor's network.</div></div>
            </div>
          )}
          <div style={{overflowX:'auto'}}>
            {filteredRecos.length===0
              ?<div className="empty" style={{padding:'32px 0'}}>No {recTab.toLowerCase()} recommendations.</div>
              :<table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{background:'#f9fafb',borderBottom:'2px solid var(--line)'}}>
                  {['Date','Instrument','Type','Entry ₹','Current ₹','Target','Stop Loss','Return','Status','Conviction','Holding'].map(h=>(
                    <th key={h} style={{padding:'9px 11px',textAlign:['Return','Entry ₹','Current ₹','Target','Stop Loss'].includes(h)?'right':'left',fontSize:10.5,fontWeight:700,letterSpacing:.06,textTransform:'uppercase',color:'var(--muted)',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{filteredRecos.map(r=>{
                  const isLinked=r.id===recoId, isExpanded=r.id===expandedId;
                  const retPct=Number(r.return_pct||0);
                  return(<React.Fragment key={r.id}>
                    <tr ref={isLinked?expandedRef:null} className="hoverable"
                        style={{cursor:'pointer',background:isLinked?'var(--accent-soft)':undefined,outline:isLinked?'2px solid var(--accent)':undefined,outlineOffset:-2}}
                        onClick={()=>setExpandedId(isExpanded?null:r.id)}>
                      <td style={{padding:'10px 11px',color:'var(--muted)',fontSize:12,whiteSpace:'nowrap'}}>{r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}):'-'}</td>
                      <td style={{padding:'10px 11px'}}><div style={{fontWeight:700}}>{r.ticker}</div><div style={{fontSize:11,color:'var(--muted)',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.asset_name}</div></td>
                      <td style={{padding:'10px 11px'}}><TypeBadge t={r.recommendation_type}/></td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{r.reco_price?`₹${Number(r.reco_price).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{r.current_price?`₹${Number(r.current_price).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'var(--muted)'}}>{r.target_price?`₹${Number(r.target_price).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'var(--loss)'}}>{r.stop_loss?`₹${Number(r.stop_loss).toLocaleString('en-IN')}`:'—'}</td>
                      <td style={{padding:'10px 11px',textAlign:'right'}}><RetBadge pct={retPct}/></td>
                      <td style={{padding:'10px 11px'}}><StatusBadge2 status={r.status}/></td>
                      <td style={{padding:'10px 11px'}}><ConvBadge level={r.conviction}/></td>
                      <td style={{padding:'10px 11px',color:'var(--muted)',fontSize:12,whiteSpace:'nowrap'}}>{r.holding_days?`${r.holding_days}d`:'—'} {isExpanded?'▲':'▼'}</td>
                    </tr>
                    {isExpanded&&r.thesis&&r.thesis!=='—'&&(
                      <tr><td colSpan={11} style={{padding:0}}>
                        <div style={{background:isLinked?'var(--accent-soft)':'var(--surface-2)',padding:'11px 16px',display:'flex',gap:16,flexWrap:'wrap'}}>
                          <div style={{flex:1}}><div style={{fontSize:10.5,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>Thesis</div><div style={{fontSize:13,lineHeight:1.6,color:'var(--ink-soft)'}}>{r.thesis}</div></div>
                          {r.sector&&<div><div style={{fontSize:10.5,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>Sector</div><div style={{fontSize:13}}>{SECTOR_EMOJI[r.sector]} {r.sector}</div></div>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>);
                })}</tbody>
              </table>}
          </div>
          <div style={{padding:'9px 16px',borderTop:'1px solid var(--line)',fontSize:11,color:'var(--muted)'}}>Returns calculated from entry price and current/exit price. Not investment advice.</div>
        </div>
        {/* ── Methodology ── */}
        <div id="methodology" className="card" style={{marginBottom:14}}>
          <div className="card-head"><span style={{fontSize:13,fontWeight:700}}>⚙ How are these metrics calculated?</span><span className="muted small">Methodology v1.0</span></div>
          <div style={{padding:'14px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[
              ['Hit Rate','Percentage of closed recommendations with a positive realized return.'],
              ['Median Return','Median realized return across closed positions. More robust than average.'],
              ['Risk-Adjusted Return','Average return ÷ standard deviation of returns (Sharpe-like, no risk-free rate).'],
              ['ICI Score','Track length (15%), volume (15%), hit rate (20%), median (15%), risk-adj (15%), transparency (10%), profile (10%).'],
              ['Active Positions','Use last known price. Indicative only — excluded from realized scorecard.'],
              ['Sector Attribution','Based on sector set at publication time.'],
            ].map(([h,p])=>(<div key={h}><div style={{fontSize:12,fontWeight:700,color:'var(--ink-soft)',marginBottom:3}}>{h}</div><div style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>{p}</div></div>))}
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:14,padding:'14px 18px',fontSize:12,color:'var(--muted)',lineHeight:1.7}}>
          <strong style={{color:'var(--ink-soft)'}}>Regulatory Disclaimer:</strong> Investor Circle records publicly shared investment opinions and computes historical statistics using a transparent methodology. <strong>Investor Circle does not endorse or recommend any individual or investment.</strong> The individual shown is a self-directed investor and is <strong>not SEBI registered.</strong> Nothing here constitutes investment advice. Past performance does not indicate future results.
        </div>
      </>
    );
  };

  // ── Shell wrappers ──────────────────────────────────────────────────────────
  if(mode==='standalone') {
    return(
      <div style={{minHeight:'100vh',background:'var(--bg)',paddingBottom:48}}>
        <div style={{background:'var(--surface)',borderBottom:'1px solid var(--line)',padding:'11px 24px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#6d5df5,#cf52d8)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:13,color:'#fff'}}>ic</div>
            <div><div style={{fontWeight:800,fontSize:13,lineHeight:1.1}}>InvestorCircle</div><div style={{fontSize:10,color:'var(--muted)'}}>Transparency Platform</div></div>
          </div>
          <div style={{flex:1}}/>
          {viewerUser
            ?<button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14}/> Back to app</button>
            :<a href={window.location.pathname} style={{fontSize:13,fontWeight:600,color:'var(--accent)',textDecoration:'none'}}>Sign in →</a>}
        </div>
        <div style={{padding:'20px 20px 0'}}>{renderContent()}</div>
      </div>
    );
  }

  // Embedded (Track Record nav)
  return(<>
    <div className="page-head">
      <div><div className="eyebrow">Track Record</div><div className="page-title">Public Investment Record</div></div>
      <div style={{display:'flex',gap:8}}>
        {data&&<>
          <button className="btn btn-soft btn-sm" onClick={copyLink}>{copied?<><Check size={14}/> Copied!</>:<><Copy size={14}/> Copy link</>}</button>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm"><ExternalLink size={14}/> Open public URL</a>
        </>}
      </div>
    </div>
    {renderContent()}
  </>);
}


function ProfileModal({ me, profile, updateProfile, patchProfile, onClose }) {
  const USERNAME_RE = /^[a-z0-9_]{5,20}$/;

  // ── Name ──────────────────────────────────────────────────────────────────
  // Initialise from raw DB values (empty string when not yet set) so the user
  // sees a blank field rather than the email-prefix fallback that ME uses for display.
  const rawFirst = profile?.first_name || "";
  const rawLast  = profile?.last_name  || "";

  const [editing,   setEditing]   = useState(false);
  const [firstName, setFirstName] = useState(rawFirst);
  const [lastName,  setLastName]  = useState(rawLast);
  const [saving,    setSaving]    = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameErr,   setNameErr]   = useState("");

  const startEdit  = () => { setFirstName(rawFirst); setLastName(rawLast); setEditing(true); setNameErr(""); setNameSaved(false); };
  const cancelEdit = () => { setEditing(false); setNameErr(""); };
  const saveName   = async () => {
    if (!firstName.trim()) { setNameErr("First name is required."); return; }
    setSaving(true); setNameErr("");
    const result = await updateProfile(firstName, lastName);
    if (result?.error) { setNameErr(result.error); setSaving(false); return; }
    setSaving(false); setEditing(false); setNameSaved(true);
  };

  // ── Username ───────────────────────────────────────────────────────────────
  const hasUsername = !!me.username;
  const [unInput,  setUnInput]  = useState("");
  const [unStatus, setUnStatus] = useState("idle"); // idle|checking|available|taken|invalid
  const [unSaving, setUnSaving] = useState(false);
  const [unSaved,  setUnSaved]  = useState(false);
  const [unErr,    setUnErr]    = useState("");

  useEffect(() => {
    if (!unInput) { setUnStatus("idle"); return; }
    if (!USERNAME_RE.test(unInput)) { setUnStatus("invalid"); return; }
    setUnStatus("checking");
    const t = setTimeout(async () => {
      const ok = await dbCheckUsername(unInput, me.id);
      setUnStatus(ok ? "available" : "taken");
    }, 500);
    return () => clearTimeout(t);
  }, [unInput]);

  const saveUsername = async () => {
    if (unStatus !== "available") return;
    setUnSaving(true); setUnErr("");
    try {
      await dbSaveUsername(me.id, unInput);
      patchProfile({ username: unInput });
      setUnSaved(true);
    } catch(e) { setUnErr("Could not save: " + e.message); }
    setUnSaving(false);
  };

  const UN_UI = {
    idle:      null,
    checking:  <span className="muted small"><Loader size={12} className="spin"/> Checking…</span>,
    available: <span style={{color:"var(--gain)",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}><Check size={12}/> Available</span>,
    taken:     <span style={{color:"var(--loss)",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}><X size={12}/> Already taken — try another</span>,
    invalid:   <span style={{color:"var(--loss)",fontSize:12}}>5–20 characters, lowercase letters, numbers and underscores only</span>,
  };

  return (
    <div style={{position:"absolute",top:50,right:0,width:390,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:18,boxShadow:"0 8px 32px rgba(0,0,0,.14)",zIndex:200,overflow:"hidden"}}
         onClick={e=>e.stopPropagation()}>

      {/* Header */}
      <div style={{background:"var(--grad)",padding:"22px 22px 18px",display:"flex",gap:14,alignItems:"center"}}>
        <div style={{width:50,height:50,borderRadius:15,background:"rgba(255,255,255,.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,fontWeight:800,color:"#fff",flexShrink:0}}>{me.initials}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:16,color:"#fff",lineHeight:1.2}}>{me.name}</div>
          {me.username
            ? <div style={{fontSize:12,color:"rgba(255,255,255,.78)",marginTop:2}}>@{me.username}</div>
            : <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:2}}>No username set yet</div>}
        </div>
        <button className="icon-btn" style={{background:"rgba(255,255,255,.18)",border:"none",color:"#fff"}} onClick={onClose}><X size={18}/></button>
      </div>

      <div style={{padding:"16px 22px 20px",display:"flex",flexDirection:"column",gap:16}}>

        {/* ── NAME ── */}
        <div style={{paddingBottom:16,borderBottom:"1px solid var(--line)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.6}}>Display name</span>
            {!editing && <button className="btn btn-ghost btn-sm" style={{padding:"4px 10px",fontSize:12}} onClick={startEdit}><Pencil size={12}/> Edit</button>}
          </div>
          {nameSaved && <div className="note ok" style={{marginBottom:8,padding:"8px 12px"}}><Check size={14}/><div>Name updated.</div></div>}
          {nameErr   && <div className="note warn" style={{marginBottom:8,padding:"8px 12px"}}><AlertTriangle size={14}/><div>{nameErr}</div></div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",marginBottom:5}}>First name *</div>
              {editing
                ? <input value={firstName} onChange={e=>setFirstName(e.target.value)} autoFocus placeholder="First name" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none"}}/>
                : <div style={{padding:"9px 12px",border:"1px solid var(--line)",borderRadius:10,fontSize:13,background:"var(--surface-2)"}}>{me.firstName||<span className="muted">—</span>}</div>}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",marginBottom:5}}>Last name</div>
              {editing
                ? <input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Last name" onKeyDown={e=>e.key==="Enter"&&saveName()} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none"}}/>
                : <div style={{padding:"9px 12px",border:"1px solid var(--line)",borderRadius:10,fontSize:13,background:"var(--surface-2)"}}>{me.lastName||<span className="muted">—</span>}</div>}
            </div>
          </div>
          {editing && (
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
              <button className="btn btn-pri btn-sm" disabled={saving||!firstName.trim()} onClick={saveName}>
                {saving?<><Loader size={13} className="spin"/> Saving…</>:<><Check size={13}/> Save</>}
              </button>
            </div>
          )}
        </div>

        {/* ── USERNAME ── */}
        <div style={{paddingBottom:16,borderBottom:"1px solid var(--line)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.6}}>Username</span>
            {hasUsername && <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--muted)"}}><Lock size={11}/> Cannot be changed</span>}
          </div>

          {hasUsername ? (
            <div style={{padding:"10px 13px",border:"1px solid var(--line)",borderRadius:11,fontSize:14,background:"var(--surface-2)",display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"var(--muted)",flexShrink:0}}>@</span>
              <span style={{fontWeight:700}}>{me.username}</span>
              <span className="muted small" style={{marginLeft:"auto",fontSize:11}}>investor/{me.username}</span>
            </div>
          ) : unSaved ? (
            <div className="note ok" style={{padding:"10px 12px"}}><Check size={15}/><div>@{unInput} set! This is your permanent username.</div></div>
          ) : (
            <>
              <div className="note warn" style={{marginBottom:10,padding:"9px 12px",fontSize:12}}>
                <AlertTriangle size={14}/>
                <div><b>Choose carefully.</b> Username cannot be changed once set — it becomes part of your permanent public profile URL.</div>
              </div>
              {unErr && <div className="note warn" style={{marginBottom:8,padding:"8px 12px",fontSize:12}}><X size={13}/><div>{unErr}</div></div>}
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{flex:1,position:"relative"}}>
                  <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--muted)",fontSize:14,pointerEvents:"none",userSelect:"none"}}>@</span>
                  <input
                    value={unInput}
                    onChange={e=>setUnInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
                    placeholder="your_username"
                    maxLength={20}
                    style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:11,padding:"10px 13px 10px 28px",fontSize:13,outline:"none"}}
                  />
                </div>
                <button className="btn btn-pri btn-sm" disabled={unStatus!=="available"||unSaving} onClick={saveUsername} style={{flexShrink:0,alignSelf:"center"}}>
                  {unSaving?<><Loader size={13} className="spin"/> Saving…</>:<><Check size={13}/> Set username</>}
                </button>
              </div>
              <div style={{marginTop:5,minHeight:18,display:"flex",alignItems:"center"}}>{UN_UI[unStatus]}</div>
            </>
          )}
        </div>

        {/* ── EMAIL ── */}
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>Email address</div>
          <div style={{padding:"10px 13px",border:"1px solid var(--line)",borderRadius:11,fontSize:14,color:"var(--muted)",background:"var(--surface-2)"}}>{me.email}</div>
          <div className="muted small" style={{marginTop:4}}>Email cannot be changed</div>
        </div>
      </div>
    </div>
  );
}


/* =================================================================== HOME */
/* ─── Shared comments component ─────────────────────────────────────────────────── */
function RecoComments({ recoId, me }) {
  const [comments,  setComments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [text,      setText]      = useState('');
  const [submitting,setSubmitting]= useState(false);

  useEffect(()=>{
    if(!recoId||!sql){ setLoading(false); return; }
    setLoading(true);
    sql`SELECT id, user_id, user_name, comment, created_at FROM recommendation_comments WHERE reco_id=${recoId} ORDER BY created_at ASC`
      .then(rows=>{ setComments(rows); setLoading(false); })
      .catch(()=>setLoading(false));
  },[recoId]);

  const submit=async()=>{
    if(!text.trim()||!me?.id||!sql) return;
    setSubmitting(true);
    const name=[me.firstName,me.lastName].filter(Boolean).join(' ')||me.name||'User';
    try{
      await sql`INSERT INTO recommendation_comments (reco_id,user_id,user_name,comment) VALUES (${recoId},${me.id},${name},${text.trim()})`;
      setComments(prev=>[...prev,{id:Date.now(),user_id:me.id,user_name:name,comment:text.trim(),created_at:new Date().toISOString()}]);
      setText('');
    }catch(e){ console.warn('Comment failed:',e); }
    setSubmitting(false);
  };

  return (
    <div>
      {/* Input */}
      {me?.id && (
        <div style={{display:'flex',gap:9,marginBottom:14,alignItems:'flex-start'}}>
          <div className="av" style={{width:30,height:30,background:'var(--grad)',fontSize:11,flexShrink:0}}>{initialsOf(me.name||'?')}</div>
          <div style={{flex:1,display:'flex',gap:8}}>
            <input value={text} onChange={e=>setText(e.target.value)} placeholder="Add a comment…"
              onKeyDown={e=>e.key==='Enter'&&!submitting&&text.trim()&&submit()}
              style={{flex:1,border:'1px solid var(--line-2)',borderRadius:10,padding:'8px 12px',fontSize:13,outline:'none',background:'var(--surface)',fontFamily:'var(--font)'}}/>
            <button className="btn btn-pri btn-sm" disabled={!text.trim()||submitting} onClick={submit} style={{flexShrink:0}}>
              {submitting?<Loader size={13} className="spin"/>:<Send size={13}/>}
            </button>
          </div>
        </div>
      )}
      {/* List */}
      {loading
        ? <div className="muted small" style={{paddingBottom:8}}><Loader size={13} className="spin" style={{marginRight:6}}/>Loading comments…</div>
        : comments.length===0
          ? <div className="muted small" style={{fontStyle:'italic'}}>No comments yet — be the first!</div>
          : comments.map(c=>(
              <div key={c.id} style={{display:'flex',gap:9,marginBottom:12}}>
                <div className="av" style={{width:28,height:28,background:'var(--accent)',fontSize:10,flexShrink:0}}>{initialsOf(c.user_name||'?')}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:7,marginBottom:2}}>
                    <span style={{fontSize:12,fontWeight:700}}>{c.user_name||'User'}</span>
                    <span className="muted small" style={{fontSize:11}}>{new Date(c.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                  <div style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.6,background:'var(--surface-2)',borderRadius:10,padding:'7px 11px'}}>{c.comment}</div>
                </div>
              </div>
            ))
      }
    </div>
  );
}

/* ─── FeedCard — single recommendation card for the homepage ────────────────────── */
function FeedCard({ r, me, contacts, setRecsReceived, onReload }) {
  const [expanded,  setExpanded]  = useState(false);
  const [shareAnchor, setShareAnchor] = useState(null);
  const [shareUsername, setShareUsername] = useState(null);
  const [showShare, setShowShare] = useState(false);

  const cf = useMemo(()=>{
    const found = contacts.find(x=>x.id===r.from);
    if(found) return found;
    const name=r.byName||'Someone';
    return { name, initials:initialsOf(name), color:'#8d90ad' };
  },[r.from, contacts]);

  const retPct = (r.priceAt&&r.priceAt!==0) ? (r.price-r.priceAt)/r.priceAt : 0;
  const itm = retPct >= 0;
  const interactionCount = (r.likes||0)+(r.dislikes||0)+(r.invested?1:0);

  // Patch a received reco optimistically
  const patch=(updates)=>{
    setRecsReceived(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,...updates}:x));
    if(sql&&r.deliveryId) {
      try{ updateDelivery(r.deliveryId,updates,me?.id); }catch(_){}
    }
  };

  const react=(val)=>{
    if(!me?.id) return;
    const next=r.reaction===val?'none':val;
    patch({reaction:next});
  };

  const handleShareClick=async(e)=>{
    if(showShare){ setShowShare(false); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget);
    setShowShare(true);
    if(r.from&&sql&&!shareUsername){
      try{
        const rows=await sql`SELECT username FROM user_profiles WHERE id=${r.from} AND username IS NOT NULL LIMIT 1`;
        if(rows[0]?.username) setShareUsername(rows[0].username);
      }catch(_){}
    }
  };

  const isBuy = (r.recommendation_type||r.recType||'Buy')==='Buy';

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,boxShadow:'var(--shadow)',marginBottom:12,overflow:'visible',transition:'box-shadow .15s'}}>
      <div style={{padding:'16px 18px'}}>
        {/* ── Header row ── */}
        <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:11}}>
          {/* Avatar */}
          <div className="av" style={{width:42,height:42,background:cf.color||'var(--grad)',fontSize:15,flexShrink:0}}>
            {cf.initials||initialsOf(cf.name)}
          </div>
          {/* Name + meta */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,lineHeight:1.35,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <b style={{color:'var(--ink)'}}>{cf.name}</b>
              <span style={{color:'var(--muted)',fontWeight:400}}>recommended</span>
              <b style={{color:'var(--ink)'}}>{r.assetName}</b>
              <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,
                background:isBuy?'var(--gain-soft)':'var(--loss-soft)',
                color:isBuy?'var(--gain)':'var(--loss)'}}>
                {isBuy?'Buy':'Sell'}
              </span>
            </div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:3,display:'flex',alignItems:'center',gap:8}}>
              <span>{fmtDate(r.date)}</span>
              {r.assetClass&&<span style={{display:'flex',alignItems:'center',gap:4}}><span className="dot" style={{background:classColor(r.assetClass),width:7,height:7}}/>{r.assetClass}</span>}
              {r.priceAt>0&&<span>Entry ₹{Number(r.priceAt).toLocaleString('en-IN')}</span>}
            </div>
          </div>
          {/* Return badge */}
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:'-.3px',color:itm?'var(--gain)':'var(--loss)'}}>
              {itm?'+':''}{(retPct*100).toFixed(1)}%
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>
              ₹{Number(r.price).toLocaleString('en-IN')} now
            </div>
          </div>
        </div>

        {/* ── Thesis ── */}
        {r.thesis&&r.thesis!=='—'&&(
          <div style={{fontSize:13.5,color:'var(--ink-soft)',lineHeight:1.65,marginBottom:10,
            display:expanded?'block':'-webkit-box',
            WebkitLineClamp:2,WebkitBoxOrient:'vertical',
            overflow:expanded?'visible':'hidden',
          }}>
            {r.thesis}
          </div>
        )}

        {/* ── Pills ── */}
        {(r.horizon||r.targetPrice||r.sector||r.conviction||r.stopLoss)&&(
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:11}}>
            {r.horizon&&<span className="pill accent" style={{fontSize:11}}>Horizon: {r.horizon}</span>}
            {r.targetPrice&&<span className="pill" style={{fontSize:11}}>Target ₹{Number(r.targetPrice).toLocaleString('en-IN')}</span>}
            {r.sector&&<span className="pill" style={{fontSize:11}}>{r.sector}</span>}
            {r.conviction&&<ConvBadge level={r.conviction}/>}
          </div>
        )}

        {/* ── Interaction bar ── */}
        <div style={{display:'flex',alignItems:'center',gap:5,paddingTop:10,borderTop:'1px solid var(--line)'}}>
          {/* Like */}
          <button className={"iconbtn"+(r.reaction==='like'?' on-like':'')} title="Like" onClick={()=>react('like')} style={{width:32,height:32}}>
            <ThumbsUp size={14}/>
          </button>
          <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.likes||0}</span>

          {/* Dislike */}
          <button className={"iconbtn"+(r.reaction==='dislike'?' on-dislike':'')} title="Dislike" onClick={()=>react('dislike')} style={{width:32,height:32}}>
            <ThumbsDown size={14}/>
          </button>
          <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.dislikes||0}</span>

          {/* Comment */}
          <button className="iconbtn" title="Comment" onClick={()=>setExpanded(v=>!v)} style={{width:32,height:32}}>
            <MessageSquare size={14}/>
          </button>

          {/* Share */}
          <div style={{position:'relative'}}>
            <button className="iconbtn" title="Share" onClick={handleShareClick} style={{width:32,height:32}}>
              <Share2 size={14}/>
            </button>
            {showShare&&<ReceivedSharePopover reco={r} fromUsername={shareUsername} anchorEl={shareAnchor}
              onForward={()=>setShowShare(false)}
              onClose={()=>{ setShowShare(false); setShareAnchor(null); }}/>}
          </div>

          {/* Interaction count badge */}
          {interactionCount>0&&(
            <span style={{fontSize:11,color:'var(--muted)',marginLeft:2}}>
              ✦ {interactionCount} interaction{interactionCount!==1?'s':''}
            </span>
          )}

          {/* Right: invested + expand */}
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            {r.invested
              ? <span style={{fontSize:12,fontWeight:700,color:'var(--gain)',display:'flex',alignItems:'center',gap:4}}><Check size={13}/> Invested</span>
              : <button className="btn btn-ghost btn-sm" style={{fontSize:12,padding:'5px 11px'}} onClick={()=>setExpanded(v=>!v)}>Track this</button>}
            <button onClick={()=>setExpanded(v=>!v)}
              style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:12,color:'var(--accent-ink)',fontWeight:700,fontFamily:'var(--font)',padding:'4px 8px',borderRadius:8,transition:'.12s'}}>
              {expanded?'Less':'More'}<ChevronDown size={14} style={{transform:expanded?'rotate(180deg)':'none',transition:'.15s'}}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── Expanded detail + comments ── */}
      {expanded&&(
        <div style={{borderTop:'1px solid var(--line)',padding:'16px 18px',background:'var(--surface-2)',borderRadius:'0 0 18px 18px'}}>
          {/* Meta grid */}
          <div style={{display:'flex',gap:22,flexWrap:'wrap',marginBottom:14}}>
            <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
            {r.assetClass&&<div><div className="cap">Class</div><ClassTag c={r.assetClass}/></div>}
            {r.priceAt>0&&<div><div className="cap">Entry price</div><b className="tnum">₹{Number(r.priceAt).toLocaleString('en-IN')}</b></div>}
            {r.targetPrice&&<div><div className="cap">Target</div><b className="tnum pos">₹{Number(r.targetPrice).toLocaleString('en-IN')}</b></div>}
            {r.stopLoss&&<div><div className="cap">Stop loss</div><b className="tnum neg">₹{Number(r.stopLoss).toLocaleString('en-IN')}</b></div>}
            <div><div className="cap">Return</div><b className={"tnum "+(itm?"pos":"neg")}>{itm?'+':''}{(retPct*100).toFixed(1)}%</b></div>
            {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
            {r.sector&&<div><div className="cap">Sector</div><b>{r.sector}</b></div>}
          </div>
          {/* Full thesis */}
          {r.thesis&&r.thesis!=='—'&&(
            <div style={{marginBottom:16}}>
              <div className="cap" style={{marginBottom:5}}>Thesis</div>
              <div style={{fontSize:13,lineHeight:1.7,color:'var(--ink-soft)'}}>{r.thesis}</div>
            </div>
          )}
          {/* Comments */}
          <div style={{borderTop:'1px solid var(--line)',paddingTop:14}}>
            <div className="cap" style={{marginBottom:10}}>Comments</div>
            <RecoComments recoId={r.id} me={me}/>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── HomeFeed — redesigned hero page ──────────────────────────────────────────── */
function HomeFeed({ setPage, recsReceived, setRecsReceived, configs, holdings, contacts, me, assetClasses, setAssetClasses, groups, setRecsMade }) {
  const { total, pnl, pnlPct } = useDerivedHoldings(holdings, configs.allowCryptoAccounts);
  const feedRecs = recsReceived.filter(r=>!r.hidden).slice(0, 15);
  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'there';
  const [showNewReco, setShowNewReco] = useState(false);

  return (
    <div style={{display:'flex',gap:22,alignItems:'flex-start'}}>

      {/* ── Feed column ── */}
      <div style={{flex:1,minWidth:0}}>

        {/* Compact single-line header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
          <div>
            <span style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px'}}>
              Welcome back, {firstName}! 👋
            </span>
            <span className="muted small" style={{marginLeft:12,fontSize:13}}>
              {recsReceived.filter(r=>!r.hidden).length} ideas in your feed · {contacts.length} connections
            </span>
          </div>
          <button className="btn btn-pri btn-sm" onClick={()=>setShowNewReco(true)}><Lightbulb size={14}/> Recommend an idea</button>
        </div>

        {feedRecs.length===0
          ? <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,padding:'48px 32px',textAlign:'center',boxShadow:'var(--shadow)'}}>
              <div style={{fontSize:40,marginBottom:14}}>🌱</div>
              <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Your feed is empty</div>
              <div className="muted small" style={{marginBottom:22,maxWidth:340,margin:'0 auto 22px',lineHeight:1.6}}>
                Add people to your network — their investment recommendations will appear here.
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-pri btn-sm" onClick={()=>setPage('network')}><Users size={14}/> Add connections</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setPage('recs')}><Lightbulb size={14}/> Recommend an idea</button>
              </div>
            </div>
          : (<>
              {feedRecs.map(r=>(
                <FeedCard key={r.id} r={r} me={me} contacts={contacts} setRecsReceived={setRecsReceived}/>
              ))}
              {recsReceived.filter(r=>!r.hidden).length>15&&(
                <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>setPage('recs')}>
                  See all {recsReceived.filter(r=>!r.hidden).length} recommendations →
                </button>
              )}
            </>)}
      </div>

      {/* ── Right sidebar ── */}
      <div style={{width:252,flexShrink:0}}>

        {/* Portfolio widget */}
        <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',marginBottom:14,overflow:'hidden'}}>
          <div style={{background:'var(--grad)',padding:'14px 16px'}}>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.75)',textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>Your portfolio</div>
            {holdings.length===0
              ? <div style={{fontSize:14,color:'rgba(255,255,255,.7)',fontStyle:'italic'}}>No holdings yet</div>
              : <>
                  <div style={{fontSize:26,fontWeight:800,color:'#fff',letterSpacing:'-1px',fontFamily:"var(--serif)"}}>{fmt(total)}</div>
                  <div style={{fontSize:13,fontWeight:700,color:pnl>=0?'#a7f3d0':'#fca5a5',marginTop:4,display:'flex',alignItems:'center',gap:4}}>
                    {pnl>=0?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>}
                    {fmtSigned(pnl)} ({fmtPct(pnlPct)})
                  </div>
                </>}
          </div>
          <div style={{padding:'10px 14px'}}>
            <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center',fontSize:12}} onClick={()=>setPage('portfolio')}>
              {holdings.length===0?<><Plus size={13}/> Add holdings</>:<>Open portfolio</>}
            </button>
          </div>
        </div>

        {/* Pending recos */}
        <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden'}}>
          <div style={{padding:'13px 15px',borderBottom:'1px solid var(--line)',fontWeight:700,fontSize:13}}>
            Not yet tracked
          </div>
          <div style={{padding:'8px 14px'}}>
            {recsReceived.filter(r=>!r.invested&&!r.hidden).length===0
              ? <div className="muted small" style={{padding:'8px 0',fontStyle:'italic'}}>All caught up ✓</div>
              : recsReceived.filter(r=>!r.invested&&!r.hidden).slice(0,5).map(r=>{
                  const perf = r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
                  const cf = contacts.find(x=>x.id===r.from)||{name:r.byName||'?'};
                  return (
                    <div key={r.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--line)',fontSize:13}}>
                      <div>
                        <div style={{fontWeight:600}}>{r.assetName}</div>
                        <div className="muted small" style={{fontSize:11}}>{cf.name.split(' ')[0]}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div className={"tnum "+(perf>=0?"pos":"neg")} style={{fontWeight:700}}>{fmtPct(perf)}</div>
                        {r.horizon&&<div className="muted small" style={{fontSize:10}}>{r.horizon}</div>}
                      </div>
                    </div>
                  );
                })
            }
            <button className="btn btn-soft btn-sm" style={{width:'100%',justifyContent:'center',marginTop:10,fontSize:12}} onClick={()=>setPage('recs')}>
              See all →
            </button>
          </div>
        </div>
      </div>
    </div>

    {showNewReco && (
      <MakeRecoModal
        assetClasses={assetClasses} setAssetClasses={setAssetClasses}
        contacts={contacts} groups={groups} holdings={holdings} me={me}
        onClose={()=>setShowNewReco(false)}
        onCreate={(rec)=>{ setRecsMade(rs=>[rec,...rs]); setShowNewReco(false); }}
      />
    )}
  </div>
  );
}
/* =================================================================== INSTRUMENTS */
// Module-level cache — loaded once per browser session from Neon
let _instrCache = null;
let _instrLoadPromise = null;
async function loadInstruments() {
  if (_instrCache) return _instrCache;
  if (_instrLoadPromise) return _instrLoadPromise;
  if (!sql) return [];
  _instrLoadPromise = sql`SELECT symbol, name, exchange, type, asset_class, currency, sector FROM instruments WHERE is_active = true ORDER BY symbol`
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
      sector:     inst.sector || null,   // ← pass sector from master
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
        return { symbol:(r['tradingsymbol']||'').toString().trim(), name:(r['name']||'').toString().trim(), exchange:(r['exchange']||'NSE').toString().trim(), type, assetClass:TYPE_TO_CLASS[type]||'Others', currency:(r['Currency']||r['currency']||'INR').toString().trim(), sector:(r['sector']||r['Sector']||'').toString().trim()||null };
      } else {
        return { symbol:(r['symbol']||'').toString().trim(), name:(r['name']||'').toString().trim(), exchange:(r['exchange']||'NSE').toString().trim(), type:(r['type']||'EQ').toString().trim(), assetClass:(r['asset_class']||'Equity').toString().trim(), currency:(r['currency']||'INR').toString().trim(), sector:(r['sector']||r['Sector']||'').toString().trim()||null };
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
        await sql`INSERT INTO instruments (symbol,name,exchange,type,asset_class,currency,sector) VALUES (${r.symbol},${r.name},${r.exchange},${r.type},${r.assetClass},${r.currency},${r.sector||null}) ON CONFLICT (symbol,exchange) DO UPDATE SET name=EXCLUDED.name, asset_class=EXCLUDED.asset_class, sector=COALESCE(EXCLUDED.sector, instruments.sector)`;
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
      Accepts <b>Zerodha instruments CSV</b> (tradingsymbol, name, exchange, instrument_type, Currency) or a <b>custom Excel/CSV</b> (symbol, name, exchange, asset_class, currency, sector).
      A <b>sector</b> column is optional but recommended — enables auto-fill in the recommendation modal.
      Duplicate (symbol + exchange) pairs are updated in place.
    </div></div>
    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={onFile}/>
    <button className="btn btn-pri" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Choose file (CSV or Excel)</button>
    {preview && !done && (<>
      <div className="muted small" style={{margin:"14px 0 10px"}}><b>{preview.length}</b> instruments ready to import. First 5 rows:</div>
      <div className="card" style={{marginBottom:14}}><div className="card-body" style={{padding:"8px 0"}}><table className="grid">
        <thead><tr><th>Symbol</th><th>Name</th><th>Exchange</th><th>Asset Class</th><th>Currency</th><th>Sector</th></tr></thead>
        <tbody>{preview.slice(0,5).map((r,i)=><tr key={i}><td className="sym">{r.symbol}</td><td>{r.name}</td><td>{r.exchange}</td><td>{r.assetClass}</td><td>{r.currency}</td><td>{r.sector||<span className="muted">—</span>}</td></tr>)}</tbody>
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
  const [f, setF] = useState({ symbol:"", name:"", exchange:"NSE", type:"EQ", assetClass:"Equity", currency:"INR", sector:"" });
  const up = (k,v) => setF(s=>({...s,[k]:v}));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const valid = f.symbol.trim() && f.name.trim();
  const save = async () => {
    setSaving(true); setErr("");
    try {
      await sql`INSERT INTO instruments (symbol,name,exchange,type,asset_class,currency,sector) VALUES (${f.symbol.trim().toUpperCase()},${f.name.trim()},${f.exchange},${f.type},${f.assetClass},${f.currency},${f.sector||null}) ON CONFLICT (symbol,exchange) DO UPDATE SET name=EXCLUDED.name, asset_class=EXCLUDED.asset_class, sector=COALESCE(EXCLUDED.sector,instruments.sector)`;
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
      <div className="field" style={{gridColumn:"1 / span 2"}}><label>Sector <span className="muted small">(optional — enables auto-fill in recommendation modal)</span></label>
        <select value={f.sector} onChange={e=>up("sector",e.target.value)}>
          <option value="">— Not specified —</option>
          {["Banking & Finance","Technology","Pharmaceuticals","Energy","FMCG","Automobiles","Defence","Capital Goods","Real Estate","Chemicals","Telecom","Metals & Mining","PSU","Healthcare","Infrastructure","Media","Retail","Others"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
    </div>
    {err && <div className="note warn" style={{marginBottom:14}}><AlertTriangle size={15}/><div>{err}</div></div>}
    <button className="btn btn-pri" disabled={!valid||saving} onClick={save}>{saving?<><Loader size={14} className="spin"/> Saving…</>:<><Plus size={14}/> Add instrument</>}</button>
  </div>);
}

/* =================================================================== ADMIN SEBI */
function AdminSebi() {
  const [pending,   setPending]   = useState([]);
  const [approved,  setApproved]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState({});
  const [verifyMsg, setVerifyMsg] = useState('');
  const [editMsg,   setEditMsg]   = useState(false);
  const [msgDraft,  setMsgDraft]  = useState('');
  const [regOpts,   setRegOpts]   = useState([]);
  const [editOpts,  setEditOpts]  = useState(false);
  const [optDraft,  setOptDraft]  = useState([]);

  const load = async () => {
    if(!sql) return;
    setLoading(true);
    try {
      const [pend, appr, msg, opts] = await Promise.all([
        sql`SELECT id,full_name,first_name,last_name,email,registration_status,sebi_reg_number,sebi_reg_valid_till,sebi_firm_name,sebi_submitted_at FROM user_profiles WHERE sebi_approval_status='pending' ORDER BY sebi_submitted_at`,
        sql`SELECT id,full_name,first_name,last_name,email,registration_status,sebi_reg_number,sebi_reg_valid_till,sebi_firm_name,sebi_approved_at FROM user_profiles WHERE sebi_approval_status='approved' ORDER BY sebi_approved_at DESC`,
        sql`SELECT value FROM app_settings WHERE key='sebi_verification_message' LIMIT 1`,
        sql`SELECT * FROM registration_status_options ORDER BY sort_order`,
      ]);
      setPending(pend); setApproved(appr);
      if(msg[0]) setVerifyMsg(msg[0].value);
      setRegOpts(opts); setOptDraft(opts.map(o=>({...o})));
    } catch(e) { console.warn(e); }
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);

  const nameOf = u => [u.first_name,u.last_name].filter(Boolean).join(' ')||u.full_name||u.email;
  const regLabel = code => regOpts.find(o=>o.code===code)?.label||code;

  const doApprove = async (u) => {
    if(!confirm(`Approve SEBI registration for ${nameOf(u)}?`)) return;
    setBusy(b=>({...b,[u.id]:'approving'}));
    await sql`UPDATE user_profiles SET sebi_approval_status='approved', sebi_approved_at=now() WHERE id=${u.id}`;
    await load();
    setBusy(b=>({...b,[u.id]:null}));
  };
  const doReject = async (u) => {
    if(!confirm(`Reject / revoke SEBI status for ${nameOf(u)}? Their profile will revert to "Not SEBI Registered".`)) return;
    setBusy(b=>({...b,[u.id]:'rejecting'}));
    await sql`UPDATE user_profiles SET sebi_approval_status='rejected', sebi_approved_at=null WHERE id=${u.id}`;
    await load();
    setBusy(b=>({...b,[u.id]:null}));
  };

  const saveMsg = async () => {
    await sql`INSERT INTO app_settings(key,value) VALUES('sebi_verification_message',${msgDraft}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
    setVerifyMsg(msgDraft); setEditMsg(false);
  };

  const saveOpts = async () => {
    for(const o of optDraft) {
      await sql`UPDATE registration_status_options SET label=${o.label}, description=${o.description}, is_active=${o.is_active}, sort_order=${o.sort_order} WHERE id=${o.id}`;
    }
    await load(); setEditOpts(false);
  };

  const SebiRow = ({u, canReject, canApprove}) => (
    <tr className="hoverable">
      <td><div style={{fontWeight:600}}>{nameOf(u)}</div><div className="muted small">{u.email}</div></td>
      <td><span className="pill accent" style={{fontSize:11}}>{regLabel(u.registration_status)}</span></td>
      <td className="tnum" style={{fontSize:12}}>{u.sebi_reg_number||'—'}</td>
      <td className="muted small">{u.sebi_reg_valid_till?new Date(u.sebi_reg_valid_till).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
      <td className="muted small">{u.sebi_firm_name||'—'}</td>
      <td className="muted small">{(u.sebi_submitted_at||u.sebi_approved_at)?new Date(u.sebi_submitted_at||u.sebi_approved_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
      <td><div className="actions">
        {canApprove && <button className="btn btn-pri btn-sm" disabled={!!busy[u.id]} onClick={()=>doApprove(u)}>{busy[u.id]==='approving'?<><Loader size={13} className="spin"/> …</>:<><Check size={13}/> Approve</>}</button>}
        {canReject  && <button className="btn btn-ghost btn-sm" style={{color:'var(--loss)',borderColor:'var(--loss)'}} disabled={!!busy[u.id]} onClick={()=>doReject(u)}>{busy[u.id]==='rejecting'?<><Loader size={13} className="spin"/> …</>:<><X size={13}/> {canApprove?'Reject':'Revoke'}</>}</button>}
      </div></td>
    </tr>
  );

  return (<>
    <div className="page-head">
      <div><div className="eyebrow">Admin</div><div className="page-title">SEBI Approvals</div>
        <div className="page-sub">Review and approve user SEBI registration claims</div></div>
    </div>

    {loading && <div className="muted small" style={{padding:20,textAlign:'center'}}><Loader size={18} className="spin"/></div>}

    {/* ── Pending ── */}
    {!loading && (<>
      <div className="card" style={{marginBottom:18,border: pending.length?'2px solid var(--accent)':'1px solid var(--line)'}}>
        <div className="card-head" style={{color:pending.length?'var(--accent)':undefined}}>
          <span><Shield size={15} style={{verticalAlign:-2,marginRight:6}}/> Pending verification ({pending.length})</span>
        </div>
        {pending.length===0
          ? <div className="empty">No pending SEBI verification requests.</div>
          : <div className="tscroll"><table className="grid">
              <thead><tr><th>User</th><th>Registration type</th><th>Reg. number</th><th>Valid till</th><th>Firm</th><th>Submitted</th><th>Actions</th></tr></thead>
              <tbody>{pending.map(u=><SebiRow key={u.id} u={u} canApprove canReject/>)}</tbody>
            </table></div>}
      </div>

      {/* ── Approved ── */}
      <div className="card" style={{marginBottom:18}}>
        <div className="card-head"><span style={{color:'var(--gain)'}}><Check size={15} style={{verticalAlign:-2,marginRight:6}}/> Approved ({approved.length})</span></div>
        {approved.length===0
          ? <div className="empty">No approved SEBI registrations yet.</div>
          : <div className="tscroll"><table className="grid">
              <thead><tr><th>User</th><th>Registration type</th><th>Reg. number</th><th>Valid till</th><th>Firm</th><th>Approved on</th><th>Actions</th></tr></thead>
              <tbody>{approved.map(u=><SebiRow key={u.id} u={u} canReject/>)}</tbody>
            </table></div>}
      </div>

      {/* ── Verification message editor ── */}
      <div className="card" style={{marginBottom:18}}>
        <div className="card-head"><span>Verification notice shown to users</span>
          {!editMsg && <button className="btn btn-soft btn-sm" onClick={()=>{ setMsgDraft(verifyMsg); setEditMsg(true); }}><Pencil size={13}/> Edit</button>}
        </div>
        <div className="card-body">
          {editMsg
            ? <><textarea rows={4} value={msgDraft} onChange={e=>setMsgDraft(e.target.value)} style={{width:'100%',border:'1px solid var(--line-2)',borderRadius:10,padding:'10px 12px',fontSize:13,fontFamily:'inherit',outline:'none',resize:'vertical'}}/>
                <div style={{display:'flex',gap:8,marginTop:10,justifyContent:'flex-end'}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditMsg(false)}>Cancel</button>
                  <button className="btn btn-pri btn-sm" onClick={saveMsg}><Check size={13}/> Save</button>
                </div></>
            : <div style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.6,padding:'4px 0'}}>{verifyMsg||'No message set.'}</div>}
        </div>
      </div>

      {/* ── Registration options editor ── */}
      <div className="card">
        <div className="card-head"><span>Registration status options</span>
          {!editOpts && <button className="btn btn-soft btn-sm" onClick={()=>setEditOpts(true)}><Pencil size={13}/> Edit options</button>}
        </div>
        <div className="card-body">
          {editOpts
            ? <><div style={{display:'flex',flexDirection:'column',gap:12}}>
                {optDraft.map((o,i)=>(
                  <div key={o.id} style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 14px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 80px',gap:10,marginBottom:8}}>
                      <div className="field" style={{margin:0}}><label style={{fontSize:11}}>Label</label>
                        <input value={o.label} onChange={e=>setOptDraft(d=>d.map((x,j)=>j===i?{...x,label:e.target.value}:x))} style={{width:'100%',border:'1px solid var(--line-2)',borderRadius:8,padding:'7px 10px',fontSize:13,outline:'none'}}/></div>
                      <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:20}}>
                        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                          <input type="checkbox" checked={o.is_active} onChange={e=>setOptDraft(d=>d.map((x,j)=>j===i?{...x,is_active:e.target.checked}:x))} style={{accentColor:'var(--accent)'}}/>Active
                        </label>
                      </div>
                    </div>
                    <div className="field" style={{margin:0}}><label style={{fontSize:11}}>Tooltip / Description</label>
                      <textarea rows={2} value={o.description||''} onChange={e=>setOptDraft(d=>d.map((x,j)=>j===i?{...x,description:e.target.value}:x))}
                        style={{width:'100%',border:'1px solid var(--line-2)',borderRadius:8,padding:'7px 10px',fontSize:12,fontFamily:'inherit',outline:'none',resize:'vertical'}}/></div>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setEditOpts(false)}>Cancel</button>
                <button className="btn btn-pri btn-sm" onClick={saveOpts}><Check size={13}/> Save options</button>
              </div></>
            : <table className="grid">
                <thead><tr><th>Code</th><th>Label</th><th>Description</th><th>Requires SEBI fields</th><th>Active</th></tr></thead>
                <tbody>{regOpts.map(o=><tr key={o.id} className="hoverable">
                  <td className="muted small" style={{fontFamily:'monospace'}}>{o.code}</td>
                  <td style={{fontWeight:600}}>{o.label}</td>
                  <td className="muted small" style={{maxWidth:320}}>{o.description}</td>
                  <td>{o.requires_sebi_fields?<span className="pill accent">Yes</span>:<span className="pill">No</span>}</td>
                  <td>{o.is_active?<span className="pill gain">Active</span>:<span className="pill">Inactive</span>}</td>
                </tr>)}</tbody>
              </table>}
        </div>
      </div>
    </>)}
  </>);
}

/* =================================================================== ADMIN USERS */
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
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role,     setRole]     = useState("Investor");
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");
  const [unStatus, setUnStatus] = useState("idle"); // idle|checking|available|taken|invalid

  const USERNAME_RE = /^[a-z0-9_]{5,20}$/;

  useEffect(() => {
    if (!username) { setUnStatus("idle"); return; }
    if (!USERNAME_RE.test(username)) { setUnStatus("invalid"); return; }
    setUnStatus("checking");
    const t = setTimeout(async () => {
      const ok = await dbCheckUsername(username, "admin-new-user");
      setUnStatus(ok ? "available" : "taken");
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  const usernameOk = !username || unStatus === "available"; // username is optional in admin form
  const valid = name.trim() && email.trim() && password.length >= 6 && usernameOk;
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
      await secondaryAuth.signOut();
      if (sql) {
        try {
          const nameParts = name.trim().split(/\s+/);
          const fn = nameParts[0] || "";
          const ln = nameParts.slice(1).join(" ") || "";
          await sql`
            INSERT INTO user_profiles (id, email, full_name, first_name, last_name, is_admin, username)
            VALUES (
              ${cred.user.uid}, ${email.trim()}, ${name.trim()},
              ${fn}, ${ln}, false, ${username.trim() || null}
            )
            ON CONFLICT (id) DO UPDATE SET
              full_name  = EXCLUDED.full_name,
              first_name = COALESCE(NULLIF(user_profiles.first_name, ''), EXCLUDED.first_name),
              last_name  = COALESCE(NULLIF(user_profiles.last_name,  ''), EXCLUDED.last_name),
              username   = COALESCE(user_profiles.username, EXCLUDED.username),
              updated_at = now()
          `;
        } catch(e) { console.warn("user_profiles insert failed:", e.message); }
      }
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
      <div className="field">
        <label>Username <span className="muted small">(optional — 5–20 chars, lowercase, letters/numbers/underscores)</span></label>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{position:"relative",flex:1}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--muted)",pointerEvents:"none"}}>@</span>
            <input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
                   maxLength={20} placeholder="jane_doe"
                   style={{paddingLeft:28,width:"100%",border:"1px solid var(--line-2)",borderRadius:11,padding:"11px 13px 11px 28px",fontSize:14,outline:"none"}}/>
          </div>
          {unStatus==="checking"  && <Loader size={15} className="spin" color="var(--muted)"/>}
          {unStatus==="available" && <Check  size={15} color="var(--gain)"/>}
          {unStatus==="taken"     && <X      size={15} color="var(--loss)"/>}
        </div>
        {unStatus==="invalid" && <div style={{color:"var(--loss)",fontSize:12,marginTop:4}}>5–20 characters, lowercase letters, numbers and underscores only</div>}
        {unStatus==="taken"   && <div style={{color:"var(--loss)",fontSize:12,marginTop:4}}>This username is already taken</div>}
      </div>
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
