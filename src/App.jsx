import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Home, PieChart, Users, Lightbulb, Shield, Search, Bell, Settings, Menu,
  Lock, Eye, EyeOff, TrendingUp, TrendingDown, Plus, X, Check, Send,
  UserCog, Layers, Wallet, ArrowUpRight, ArrowDownRight, MessageSquare,
  Bookmark, ChevronRight, ChevronDown, ChevronsUpDown, Sparkles, ArrowUpDown,
  List, Table as TableIcon, Mail, UserPlus, Calendar, Crown,
  ThumbsUp, ThumbsDown, Trash2, LogOut, AlertTriangle, Filter,
  Download, Upload, CreditCard, Share2, Forward, FileSpreadsheet, FileText, Loader, RefreshCw, Pencil, Database,
  Globe, Trophy, Copy, ExternalLink, ArrowLeft, Link, Flame, Info,
  BarChart2, Activity, Zap, Target, Clock
} from "lucide-react";
import { exportPortfolioExcel, exportPortfolioPDF } from "./exporters";
import { parsePortfolioFile } from "./importers";
import * as XLSX from "xlsx";
import { getPreviousClose, getTodayClose, sourceName, isPriceServiceConfigured } from "./services/marketData";
import {
  setExitSignal as dbSetExit, cancelExitSignal as dbCancelExit,
} from "./db";
import { fetchLivePrices, isFinnhubConfigured } from "./services/priceService";
import { useAuth } from "./AuthContext";
import { sql } from "./supabaseClient";
import { createUserWithEmailAndPassword, updateProfile as fbUpdateProfile } from "firebase/auth";
import { secondaryAuth, auth as primaryAuth } from "./firebase";
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

/* ── CAS PDF upload helper (calls Vercel /api/cas) ─── */
const _CAS_API = import.meta.env.VITE_CAS_API_URL
  ? `${import.meta.env.VITE_CAS_API_URL}/api/cas`
  : '/api/cas';

const _CAS_CONFIGURED = !!import.meta.env.VITE_CAS_API_URL;

async function parseCasPdf(file, password = '') {
  const form = new FormData();
  form.append('file', file, file.name || 'cas.pdf');
  form.append('password', (password || '').trim());
  let res;
  try {
    res = await fetch(_CAS_API, { method: 'POST', body: form });
  } catch (networkErr) {
    throw new Error('Network error — could not reach the CAS API. Check your internet connection.');
  }
  if (!res.ok) {
    const t = await res.text().catch(()=>'');
    // 405 from GitHub Pages means VITE_CAS_API_URL is not set
    if (res.status === 405 || t.includes('<html') || t.includes('Not Allowed')) {
      throw new Error(
        'CAS API not configured. Add VITE_CAS_API_URL=https://your-project.vercel.app ' +
        'to your GitHub repository → Settings → Secrets → Actions, then re-deploy.'
      );
    }
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

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

.shell{display:flex;height:100vh;overflow:hidden;}
.sidebar{width:256px;flex-shrink:0;background:var(--side);color:#fff;display:flex;flex-direction:column;padding:18px 14px;height:100vh;overflow:hidden;box-sizing:border-box;}
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

.main{flex:1;display:flex;flex-direction:column;min-width:0;height:100vh;overflow:visible;}
.topbar{height:64px;background:rgba(245,245,251,.8);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 26px;position:sticky;top:0;z-index:200;}
.searchbox{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:9px 14px;}
.searchbox input{border:none;outline:none;background:transparent;font-size:13.5px;width:100%;}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.icon-btn{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);display:flex;align-items:center;justify-content:center;cursor:pointer;}
.icon-btn:hover{background:var(--surface-2);}
.avatar-pill{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:5px 8px 5px 6px;}
.avatar-pill .gava{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px;}

.content{padding:28px 30px;overflow-y:auto;flex:1;min-height:0;}
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

/* ─── About page content renderer ─────────────────────────────────────────── */
.ql-content h1{font-size:26px;font-weight:800;letter-spacing:-.5px;color:var(--ink);margin:0 0 20px;}
.ql-content h2{font-size:20px;font-weight:700;letter-spacing:-.3px;color:var(--ink);margin:0 0 16px;}
.ql-content h3{font-size:16px;font-weight:700;color:var(--ink);margin:0 0 12px;}
.ql-content p{font-size:15px;line-height:1.85;color:var(--ink-soft);margin:0 0 14px;}
.ql-content ul,.ql-content ol{padding-left:22px;margin:0 0 14px;}
.ql-content li{font-size:15px;line-height:1.85;color:var(--ink-soft);margin-bottom:6px;}
.ql-content blockquote{border-left:4px solid var(--accent);padding:14px 20px;margin:16px 0;background:var(--accent-soft);border-radius:0 10px 10px 0;font-style:italic;}
.ql-content strong{font-weight:700;}
.ql-content a{color:var(--accent-ink);text-decoration:underline;}

/* ─── Rich text editor toolbar ─────────────────────────────────────────────── */
.rte-toolbar{background:var(--surface-2);border-bottom:1px solid var(--line);padding:8px 12px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
.rte-btn{height:30px;min-width:30px;border:1px solid var(--line-2);border-radius:6px;background:var(--surface);color:var(--ink);cursor:pointer;font-family:var(--font);font-size:13px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;transition:.1s;}
.rte-btn:hover{background:var(--surface-2);border-color:var(--accent);}
.rte-btn.active{background:var(--accent-soft);color:var(--accent-ink);border-color:var(--accent);}
.rte-sep{width:1px;height:22px;background:var(--line-2);margin:0 3px;flex-shrink:0;}
.rte-select{height:30px;border:1px solid var(--line-2);border-radius:6px;padding:0 8px;font-size:12px;cursor:pointer;background:var(--surface);color:var(--ink);font-family:var(--font);}
.rte-area{min-height:420px;padding:22px 26px;outline:none;font-size:15px;line-height:1.85;color:var(--ink);font-family:var(--font);overflow-y:auto;}
.rte-area:empty:before{content:attr(data-placeholder);color:var(--muted);pointer-events:none;}

/* ─── MOBILE RESPONSIVE (investors only — admin panel stays desktop) ─── */

/* Hamburger button: hidden on desktop, shown on mobile */
.hamburger{display:none;align-items:center;justify-content:center;width:40px;height:40px;background:none;border:none;cursor:pointer;color:var(--ink);border-radius:10px;flex-shrink:0;padding:0;}
.hamburger:hover{background:var(--surface-2);}

/* Nav drawer backdrop: transparent on desktop */
.nav-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:498;opacity:0;pointer-events:none;transition:opacity .28s;}
.nav-backdrop.open{opacity:1;pointer-events:auto;}

/* Feed/Pulse tab bar: hidden on desktop */
.mobile-tabs{display:none;}
.mobile-tab{flex:1;position:relative;background:none;border:none;border-bottom:3px solid transparent;padding:11px 8px;font-family:var(--font);font-size:14px;font-weight:700;color:var(--muted);cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px;}
.mobile-tab.active{color:var(--accent-ink);border-bottom-color:var(--accent);}
.tab-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 6px rgba(109,93,245,.8);flex-shrink:0;animation:pulse-dot 2.2s ease-in-out infinite;}
@keyframes pulse-dot{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.35);opacity:.7;}}

/* Utility: hides an element on mobile only (no-op on desktop) */
.mob-hidden{}

/* Layout hooks — styled in media queries below */
.feed-right-sidebar{}
.ici-panel{}
.ici-body{}
.ici-donut-wrapper{}
.ici-donut-svg{}
.ici-panel{}
.portfolio-layout{}
.search-hide-mobile{}
.tb-name-role{}

@media(max-width:768px){
  /* Shell: allow fixed sidebar to escape overflow clipping */
  .shell{overflow:visible!important;}

  /* Sidebar: off-screen via transform (more reliable than left:-Npx in all mobile browsers) */
  .sidebar{
    position:fixed!important;
    left:0!important;
    top:0!important;
    z-index:500!important;
    width:256px!important;
    height:100vh!important;
    overflow-y:auto!important;
    overflow-x:hidden!important;
    transform:translateX(-100%);
    transition:transform .28s cubic-bezier(.4,0,.2,1)!important;
    box-shadow:none!important;
  }
  .sidebar.nav-open{
    transform:translateX(0)!important;
    box-shadow:16px 0 48px rgba(0,0,0,.55)!important;
  }

  /* Topbar: tighter, hamburger visible */
  .topbar{padding:0 12px 0 4px;gap:6px;}
  .hamburger{display:inline-flex;}
  .search-hide-mobile{display:none!important;}
  .tb-name-role{display:none!important;}

  /* Content area */
  .content{padding:16px 14px;}
  .page-title{font-size:20px!important;}
  .page-head{margin-bottom:14px;}

  /* KPI row: 4 cols → 2 cols */
  .kpi-row{grid-template-columns:repeat(2,1fr);}

  /* Feed/Pulse tab bar: sticky, full-bleed, NO negative top margin */
  .mobile-tabs{
    display:flex;
    position:sticky;top:0;z-index:190;
    background:rgba(245,245,251,.97);
    backdrop-filter:blur(12px);
    -webkit-backdrop-filter:blur(12px);
    border-bottom:1px solid var(--line);
    margin:0 -14px 16px;
    padding:0 14px;
    gap:4px;
  }

  /* Feed/Pulse column switching */
  .mob-hidden{display:none!important;}
  .feed-right-sidebar{width:100%!important;flex-shrink:1!important;}

  /* ICI panel: flex:0 0 100% forces it to its OWN row below the bio (flex-shrink:0 is key) */
  .ici-panel{flex:0 0 100%!important;min-width:0!important;}
  .ici-donut-wrapper{width:140px!important;height:140px!important;}
  .ici-donut-svg{width:140px!important;height:140px!important;}

  /* Stat strip: 6 cols → 3 cols (two rows) */


  /* Portfolio: side-by-side → stacked */
  .portfolio-layout{grid-template-columns:1fr!important;}

  /* Modals: floating dialog → bottom sheet */
  .overlay{align-items:flex-end!important;padding:0!important;}
  .modal{border-radius:20px 20px 0 0!important;width:100%!important;max-height:88vh!important;}
}

@media(max-width:480px){
  /* Small phones */
  .content{padding:12px 10px;}
  .mobile-tabs{margin:0 -10px 14px;padding:0 10px;}
  .topbar{padding:0 8px 0 2px;}

  /* ICI body: donut above, metrics below */
  .ici-body{flex-direction:column!important;align-items:center!important;}
  .ici-body > div:last-child{width:100%!important;}

  /* Stat strip: 3 cols → 2 cols on very small screens */


  /* KPI: tighter */
  .kpi-row{gap:8px;}
  .kpi{padding:12px 12px;}
  .kpi .val{font-size:19px;}
}
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

/* ── About MIC — default page content (stored/overridden via app_settings) ── */
const ABOUT_DEFAULT_HTML = `
<h2 style="font-size:24px;font-weight:800;letter-spacing:-.5px;color:#13142b;margin:0 0 24px;">About My Investor Circle (MIC)</h2>

<p style="font-size:15px;line-height:1.85;color:#565a78;margin:0 0 18px;">If you've ever come across a stock recommendation on X, Instagram, Telegram or YouTube and wondered, <strong style="color:#13142b;">"Can I really trust this?"</strong> — you're not alone. We asked ourselves the same question. In a world overflowing with market opinions, it's surprisingly difficult to find one simple thing: a transparent, accountable history. What calls has this person made in the past? How did they perform? Were the bad ones still visible, or only the winning calls? We realised there was no easy way to find out.</p>

<p style="font-size:15px;line-height:1.85;color:#565a78;margin:0 0 18px;">That's exactly why we built My Investor Circle. We wanted a place where every investment <em>idea leaves a permanent record — no disappearing posts, no cherry-picked success stories.</em> Just a transparent history of recommendations, their outcomes, and the data that helps you decide who has genuinely earned your trust. Whether someone has 500 followers or 5 million shouldn't matter — what matters is their track record.</p>

<div style="background:#f5f3ff;border-left:4px solid #6d5df5;border-radius:0 12px 12px 0;padding:20px 24px;margin:24px 0;">
  <p style="font-size:15px;line-height:1.85;color:#13142b;margin:0 0 12px;"><strong>MIC is a community</strong> built for investors and market enthusiasts to share investment ideas, learn from each other, and build a transparent public track record over time. We don't tell you what to buy or sell, and we don't endorse or certify any individual, investment idea, or strategy. Our goal is simply to make it easier for everyone to see the complete picture — so you can evaluate ideas based on history, consistency, and transparency, not just popularity or follower count.</p>
  <p style="font-size:14px;line-height:1.8;color:#8d90ad;margin:0;">Use the information responsibly, do your own research, and invest according to your own financial goals and risk appetite.</p>
</div>

<div style="text-align:center;background:linear-gradient(135deg,#6d5df5 0%,#9a55ee 55%,#cf52d8 100%);border-radius:16px;padding:36px 28px;margin:28px 0 0;">
  <p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.65);margin:0 0 14px;font-weight:700;">Our philosophy</p>
  <p style="font-size:30px;font-weight:900;letter-spacing:-1.5px;color:#fff;margin:0 0 4px;line-height:1.1;">SCOREKEEPER</p>
  <p style="font-size:14px;color:rgba(255,255,255,.6);margin:0 0 4px;">not the</p>
  <p style="font-size:30px;font-weight:900;letter-spacing:-1.5px;color:rgba(255,255,255,.55);margin:0 0 20px;line-height:1.1;">COACH</p>
  <p style="font-size:16px;color:rgba(255,255,255,.88);margin:0;line-height:1.65;">You decide who to trust — we simply make it easier to see the full picture.</p>
</div>
`.trim();

/* ── Public-profile navigation helpers ─────────────────────────────────────
   fetchPublicProfileInfo(userId) queries username + SEBI status once per
   session and caches the result so FeedCards/Contacts/Groups never fire N+1
   requests.  openProfile / gotoUserProfile are the call-sites.
   ─────────────────────────────────────────────────────────────────────────── */
const _profileInfoCache = new Map(); // userId → { username, isSebiApproved }

async function fetchPublicProfileInfo(userId) {
  if (!sql || !userId) return null;
  if (_profileInfoCache.has(userId)) return _profileInfoCache.get(userId);
  try {
    const rows = await sql`
      SELECT username, registration_status, sebi_approval_status
      FROM user_profiles WHERE id=${userId} LIMIT 1`;
    if (rows[0]) {
      const info = {
        username:      rows[0].username || null,
        isSebiApproved:
          ['sebi_ra','sebi_ria'].includes(rows[0].registration_status) &&
          rows[0].sebi_approval_status === 'approved',
      };
      _profileInfoCache.set(userId, info);
      return info;
    }
  } catch(_) {}
  return null;
}

/** Navigate to a public profile by username (hash-based routing). */
function openProfile(username) {
  if (username) window.location.hash = `#/investor/${username}`;
}

/** Look up username from userId then navigate — used for click handlers. */
async function gotoUserProfile(userId) {
  const info = await fetchPublicProfileInfo(userId);
  if (info?.username) openProfile(info.username);
}

const CURRENCY_SYM = { INR:'₹', USD:'$', GBP:'£', EUR:'€' };
const fmt     = (n, cur='INR') => (CURRENCY_SYM[cur]||cur) + Math.round(n).toLocaleString('en-IN');
const fmtSigned = (n, cur='INR') => (n>=0?'+':'-') + fmt(Math.abs(n), cur);
const fmtPct  = (p) => (p >= 0 ? '+' : '') + (p * 100).toFixed(1) + '%';
// Robust date formatter: handles Date objects, ISO strings, timestamps — never shows "Invalid Date"
const fmtDate = (d) => {
  if (!d) return '—';
  // If it's already a Date object (Neon returns these), use directly
  const dt = d instanceof Date ? d
    : typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00:00')  // bare date "2024-05-10"
    : new Date(d);  // ISO timestamp, epoch ms, etc.
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric' });
};
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

/* ── useIsMobile — JS-driven responsive control (bypasses CSS media query issues) ── */
function useIsMobile() {
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
  const [tracked,       setTracked]       = useState(new Set()); // Set of reco IDs the user has tracked
  // Feed configuration
  const [feedConfigOptions,       setFeedConfigOptions]       = useState([]); // admin-defined options
  const [userFeedPrefs,           setUserFeedPrefs]           = useState({}); // {key: boolean} user overrides
  const [effectiveFeedConfig,     setEffectiveFeedConfig]     = useState({}); // merged effective config
  const [networkEngagementRecos,  setNetworkEngagementRecos]  = useState([]); // extended feed recos
  const [publicFeedRecos,         setPublicFeedRecos]         = useState([]); // public recommendations from all users
  // Global search — shared across all pages via top nav bar
  const [globalSearch, setGlobalSearch] = useState('');
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [navOpen,         setNavOpen]         = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false); // auto-opens edit modal on Track Record page
  const isMobile = useIsMobile();
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

  // PRIVACY CRITICAL: clear holdings whenever the authenticated user changes.
  // Without this, if User A's holdings are in state and User B signs in
  // (same browser tab), User B would see User A's portfolio data.
  useEffect(() => {
    setHoldings([]);
  }, [user?.uid]); // runs on every user change, including logout → login switches
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

  // Clear global search when navigating to a different page
  useEffect(() => { setGlobalSearch(''); }, [investorPage, adminPage]);

  // Profile dropdown: close on click outside using native mousedown
  const profileRef = useRef(null);
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    // Use mousedown so it fires before React's onClick
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const close = (e) => {
      if (!e.target.closest('.avatar-pill') && !e.target.closest('[data-profile-dropdown]')) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [profileOpen]);

  // Toggle tracking (bookmark) for a recommendation
  const toggleTrack = async (recoId) => {
    if (tracked.has(recoId)) {
      setTracked(s => { const n = new Set(s); n.delete(recoId); return n; });
      if (sql && user?.uid) sql`DELETE FROM recommendation_tracking WHERE reco_id=${recoId} AND user_id=${user.uid}`.catch(console.warn);
    } else {
      setTracked(s => new Set([...s, recoId]));
      if (sql && user?.uid) sql`INSERT INTO recommendation_tracking (reco_id, user_id) VALUES (${recoId}, ${user.uid}) ON CONFLICT DO NOTHING`.catch(console.warn);
    }
  };

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

  // ── Capture referral + claim tokens from URL on first load ──────────────────
  // claim_token is read synchronously in the useState initializer below so
  // ClaimProfilePage renders on the first paint without a LoginPage flash.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    // claim_token already read synchronously — just clean the URL
    if (ref) localStorage.setItem('mic_ref', ref.toLowerCase().trim());
    if (ref || params.get('claim_token')) {
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  // ── Claim state: token + profile for unclaimed-creator claim flow ─────────────
  // Reads URL params synchronously so the token is available on first render —
  // avoids the race where the useEffect fires after the initial render shows LoginPage.
  const [claimToken, setClaimToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const ct = params.get('claim_token');
    if (ct) { localStorage.setItem('mic_claim_token', ct); return ct; }
    return localStorage.getItem('mic_claim_token') || null;
  });
  const [claimProfile,  setClaimProfile]  = useState(null);
  const [claimRequests, setClaimRequests] = useState([]);
  const [hasPendingClaim, setHasPendingClaim] = useState(false); // creator claimed but not yet approved

  // Resolve claimToken → profile from DB
  useEffect(() => {
    if (!claimToken || !sql) return;
    sql`SELECT id, full_name, first_name, last_name, username, bio,
               registration_status, sebi_approval_status, claim_status
        FROM user_profiles
        WHERE claim_token = ${claimToken} AND claim_status = 'unclaimed'
        LIMIT 1`
      .then(rows => {
        if (rows[0]) setClaimProfile(rows[0]);
        else { localStorage.removeItem('mic_claim_token'); setClaimToken(null); }
      })
      .catch(() => {});
  }, [claimToken]);

  // ── Admin: load pending claim requests ───────────────────────────────────────
  const loadClaimRequests = async () => {
    if (!sql) return;
    try {
      const rows = await sql`
        SELECT cr.*, up.full_name AS profile_name, up.username AS profile_username
        FROM claim_requests cr
        LEFT JOIN user_profiles up ON cr.profile_id = up.id
        WHERE cr.status = 'pending'
        ORDER BY cr.created_at DESC`;
      setClaimRequests(rows);
    } catch(e) { console.warn('loadClaimRequests:', e?.message); }
  };

  // ── Process referral after a new user signs up ───────────────────────────────
  // Called once from the login effect when we detect a stored referral code.
  const processReferral = async (newUserId) => {
    const refUsername = localStorage.getItem('mic_ref');
    if (!refUsername || !sql) return;
    try {
      // Look up the referrer by their username
      const refs = await sql`
        SELECT id, full_name FROM user_profiles
        WHERE LOWER(username) = ${refUsername.toLowerCase()} AND id != ${newUserId}
        LIMIT 1`;
      if (!refs.length) { localStorage.removeItem('mic_ref'); return; }

      const referrer = refs[0];

      // Record the referral on the new user's profile (idempotent)
      await sql`UPDATE user_profiles SET referred_by = ${referrer.id}
                WHERE id = ${newUserId} AND referred_by IS NULL`;

      // Auto-connect: insert directly as 'accepted' — no approval step needed for referrals.
      // Both users agreed implicitly: the referrer shared their link, the new user accepted.
      // ON CONFLICT DO NOTHING makes this safe to re-run.
      await sql`
        INSERT INTO connections (requester_id, addressee_id, status)
        VALUES (${newUserId}, ${referrer.id}, 'accepted')
        ON CONFLICT DO NOTHING
      `;

      // Notify the referrer that their invite converted
      await sql`
        INSERT INTO notifications (user_id, type, from_user_id)
        VALUES (${referrer.id}, 'connection_accepted', ${newUserId})
      `.catch(() => {}); // non-fatal

      // Refresh connection list so the new user immediately sees the referrer in their circle
      const conns = await getMyConnections(newUserId);
      setConnections(conns);

      localStorage.removeItem('mic_ref');
    } catch(e) { console.warn('processReferral:', e?.message||e); }
  };

  // ── People Connect — used by PeopleSearch ────────────────────────────────────
  const handlePeopleConnect = async (targetId) => {
    if (!user) return;
    try {
      await sendConnectionRequest(user.uid, targetId);
      const conns = await getMyConnections(user.uid);
      setConnections(conns);
    } catch(e) { console.warn('handlePeopleConnect:', e?.message||e); }
  };

  // ── Invite modal state ────────────────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [searchPeople,     setSearchPeople]     = useState([]);

  // Debounced people search — drives both topbar dropdown and mobile search overlay
  useEffect(() => {
    const q = globalSearch.trim();
    if (!q || q.length < 2 || !sql) { setSearchPeople([]); return; }
    const timer = setTimeout(async () => {
      try {
        const rows = await sql`
          SELECT id, username, full_name, first_name, last_name,
                 registration_status, sebi_approval_status
          FROM user_profiles
          WHERE (full_name   ILIKE ${'%'+q+'%'}
              OR username    ILIKE ${'%'+q+'%'}
              OR first_name  ILIKE ${'%'+q+'%'}
              OR last_name   ILIKE ${'%'+q+'%'})
            AND id != ${ME?.id||'none'}
            AND (is_unclaimed IS NULL OR is_unclaimed = FALSE)
          ORDER BY
            CASE WHEN LOWER(username)  = LOWER(${q})         THEN 0
                 WHEN LOWER(username)  LIKE LOWER(${q})||'%' THEN 1
                 WHEN LOWER(full_name) LIKE LOWER(${q})||'%' THEN 2
                 ELSE 3 END,
            full_name
          LIMIT 6`;
        setSearchPeople(rows);
      } catch(e) { console.warn('topbar people search:', e?.message||e); }
    }, 280);
    return () => clearTimeout(timer);
  }, [globalSearch, ME?.id]);
  const referralCount = useMemo(()=>
    connections.filter(c=>c.referred_by_me || c.source==='referral').length
  ,[connections]);

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
        // Process any stored referral code (fires only when localStorage has one)
        processReferral(user.uid);
        // Load pending creator claim requests (admin feature — silently no-ops for non-admins)
        loadClaimRequests();
        // Check if this user is a creator awaiting admin approval for their claimed profile
        if (sql) sql`SELECT id FROM claim_requests WHERE claimer_uid=${user.uid} AND status='pending' LIMIT 1`
          .then(rows=>setHasPendingClaim(rows.length > 0)).catch(()=>{});
        // Load tracked recommendation IDs
        try {
          const tr = await sql`SELECT reco_id FROM recommendation_tracking WHERE user_id=${user.uid}`;
          setTracked(new Set(tr.map(r=>r.reco_id)));
        } catch(_) {}

        // Load feed config options + user prefs, compute effective config
        let effective = {};
        try {
          const [opts, prefs] = await Promise.all([
            sql`SELECT * FROM feed_config_options ORDER BY sort_order`,
            sql`SELECT config_key, enabled FROM user_feed_preferences WHERE user_id=${user.uid}`,
          ]);
          setFeedConfigOptions(opts);
          const userPrefsMap = Object.fromEntries(prefs.map(p=>[p.config_key, p.enabled]));
          setUserFeedPrefs(userPrefsMap);
          opts.forEach(o => {
            if (!o.admin_enabled)  { effective[o.key] = false; return; }
            if (o.always_on)       { effective[o.key] = true;  return; }
            effective[o.key] = (o.config_key in userPrefsMap) ? userPrefsMap[o.config_key]
                             : (o.key in userPrefsMap)         ? userPrefsMap[o.key]
                             : o.default_on;
          });
          setEffectiveFeedConfig(effective);
        } catch(_) {
          // table may not exist pre-migration — use safe defaults
          effective = { src_direct:true, src_group:true, src_network_engagement:true, src_public:true,
                        rank_engagement:true, rank_price_movement:true, rank_untracked_first:true };
          setEffectiveFeedConfig(effective);
        }

        // Load network-engaged recos (recos liked/commented by connections not in my direct feed)
        if (effective.src_network_engagement) {
          try {
            const activeConns = conns.filter(c=>c.status==='active').map(c=>c.id);
            if (activeConns.length > 0) {
              const engRecos = await sql`
                SELECT DISTINCT ir.id, ir.asset_name, ir.ticker, ir.asset_class,
                       ir.recommendation_type, ir.reco_price, ir.current_price,
                       ir.target_price, ir.stop_loss, ir.horizon, ir.thesis,
                       ir.sector, ir.conviction, ir.created_at as date, ir.is_public,
                       up.full_name as by_name, up.id as from_id,
                       0 as likes, 0 as dislikes
                FROM recommendation_deliveries rd
                JOIN ic_recommendations ir ON ir.id = rd.recommendation_id
                JOIN user_profiles up ON up.id = ir.recommender_id
                WHERE rd.recipient_id = ANY(${activeConns})
                  AND (rd.reaction IN ('like','dislike')
                    OR EXISTS (SELECT 1 FROM recommendation_comments rc
                               WHERE rc.reco_id=ir.id AND rc.user_id=ANY(${activeConns})))
                  AND ir.id NOT IN (
                    SELECT recommendation_id FROM recommendation_deliveries WHERE recipient_id=${user.uid}
                  )
                ORDER BY ir.created_at DESC
                LIMIT 50`;
              setNetworkEngagementRecos(engRecos.map(r=>({
                ...r, assetName:r.asset_name, priceAt:r.reco_price, price:r.current_price,
                byName:r.by_name, from:r.from_id, feedSource:'network_engagement',
                reaction:'none', hidden:false, invested:false, deliveryId:null,
              })));
            }
          } catch(_) {}
        }

        // Load public recommendations — visible to all users when is_public = true.
        // Excludes the user's own recos and ones already in their direct feed.
        try {
          const pubRows = await sql`
            SELECT ir.id, ir.asset_name, ir.ticker, ir.asset_class,
                   ir.recommendation_type, ir.reco_price, ir.current_price,
                   ir.target_price, ir.stop_loss, ir.horizon, ir.thesis,
                   ir.sector, ir.conviction, ir.created_at as date, ir.is_public,
                   up.full_name as by_name, up.id as from_id, up.username as from_username
            FROM ic_recommendations ir
            JOIN user_profiles up ON up.id = ir.recommender_id
            WHERE ir.is_public = true
              AND ir.recommender_id != ${user.uid}
              AND (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)
            ORDER BY ir.created_at DESC
            LIMIT 100`;
          setPublicFeedRecos(pubRows.map(r => ({
            ...r,
            assetName:    r.asset_name,
            priceAt:      r.reco_price,
            price:        r.current_price,
            targetPrice:  r.target_price,
            stopLoss:     r.stop_loss,
            byName:       r.by_name,
            from:         r.from_id,
            feedSource:   'public',
            reaction:     'none',
            hidden:       false,
            invested:     false,
            deliveryId:   null,
            isPublic:     true,
          })));
        } catch(e) { console.warn('Public feed load failed:', e?.message||e); }
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

  // securityTicker must be here — before ANY conditional return — Rules of Hooks
  const [securityTicker, setSecurityTicker] = useState(null);

  // ── Public profile route — no auth required ────────────────────────────────
  // Matches: #/investor/username  OR  #/investor/username/reco/recoId
  const publicMatch = pageHash.match(/^#\/investor\/([a-z0-9_]+)(?:\/reco\/([a-zA-Z0-9-]+))?/i);
  if (publicMatch && !authLoading) {
    const pubUsername = publicMatch[1];
    const pubRecoId   = publicMatch[2] || null;
    return (
      <div className="app"><style>{STYLES}</style>
        <ProfileErrorBoundary>
          <PublicProfilePage
            username={pubUsername}
            recoId={pubRecoId}
            viewerUser={user}
            viewerConnections={connections}
            viewerIsAdmin={ME?.is_admin === true}
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
        </ProfileErrorBoundary>
      </div>
    );
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{minHeight:"100vh",background:"#0a0b18",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#8a8daa",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15}}>Loading…</div>
    </div>
  );
  // ── Creator claim flow: show claim page before login ─────────────────────────
  if (!user && claimToken && claimProfile) {
    return (
      <div className="app">
        <style>{STYLES}</style>
        <ClaimProfilePage
          profile={claimProfile}
          token={claimToken}
          onBack={() => { setClaimToken(null); setClaimProfile(null); localStorage.removeItem('mic_claim_token'); }}
        />
      </div>
    );
  }

  if (!user) return <LoginPage />;


  // Non-admin users are ALWAYS investors, regardless of role state.
  // Admin users can toggle between "investor" and "admin" views via the sidebar button.
  const isInv = !userIsAdmin || role === "investor";
  const newRecs = recsReceived.filter(r=>!r.invested && !r.hidden).length;
  // page + setPage — setPage also closes the mobile nav drawer for investors
  const openSecurity = (ticker, name) => { setSecurityTicker({ ticker, name }); setPage('sec_intel'); };
  const page    = isInv ? investorPage : adminPage;
  const setPage = isInv
    ? (p) => { setInvestorPage(p); setNavOpen(false); }
    : (p) => { setAdminPage(p); };
  const canCreateGroups = configs.groupCreationPolicy==="all";

  const nav = isInv ? [
    { id:"home",        label:"Home",             icon:Home },
    ...(configs.enableRecommendations ? [{ id:"recs", label:"Recommendations", icon:Lightbulb, badge:newRecs }] : []),
    { id:"portfolio",    label:"Portfolio Intelligence", icon:BarChart2 },
    { id:"market_intel", label:"Market Intelligence",    icon:TrendingUp },
    { id:"sec_intel",    label:"Security Intelligence",  icon:Activity },
    { id:"network",     label:"Network",           icon:Users },
    { id:"trackrecord", label:"Track Record",       icon:Globe },
    { id:"sharing",     label:"Sharing & Privacy", icon:Shield },
    { id:"about",       label:"About MIC",          icon:Info },
    { id:"contact",     label:"Contact Us",          icon:MessageSquare },
  ] : [
    { id:"users",       label:"Users",             icon:UserCog },
    { id:"creators",    label:"Creators",           icon:UserPlus },
    { id:"groups",      label:"Groups",            icon:Layers },
    { id:"instruments", label:"Instruments",        icon:Database },
    { id:"sebi",        label:"SEBI Approvals",    icon:Shield },
    { id:"feed",        label:"Feed Settings",     icon:Flame },
    { id:"configs",     label:"App Configuration", icon:Settings },
    { id:"seed",        label:"Seed Data",         icon:Sparkles },
    { id:"about",       label:"About Us Content",  icon:Info },
  ];

  // Stats for sidebar footer — no Accounts for investors
  const stats = isInv
    ? [["Connections", contacts.length], ["Groups", groups.length]]
    : [["Users", users.length], ["Active", users.filter(u=>u.status==="Active").length], ["Groups", groups.length]];

  return (
    <div className="app">
      <style>{STYLES}</style>
      <div className="shell">
        {/* Mobile nav backdrop — click to close drawer */}
        <div className={"nav-backdrop"+(navOpen?" open":"")} onClick={()=>setNavOpen(false)}/>
        <div
          className={"sidebar"+(navOpen?" nav-open":"")}
          style={isMobile ? {
            position:'fixed', top:0, left:0, zIndex:500,
            width:'256px', height:'100vh',
            overflowY:'auto', overflowX:'hidden',
            transform: navOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: navOpen ? '16px 0 48px rgba(0,0,0,.55)' : 'none',
          } : {}}
        >
          {/* Brand */}
          <div className="brand"><div className="mark" style={{fontSize:14,letterSpacing:'-.5px'}}>mic</div>
            <div><div className="nm">myInvestorCircle</div><div className="tag">Social Investing</div></div></div>

          <div className="side-label">{isInv?"Menu":"Admin"}</div>

          {/* Nav items — fill remaining space */}
          <div style={{flex:1,minHeight:0,overflowY:'auto',marginRight:-4,paddingRight:4}}>
            {nav.map(n=>(
              <div key={n.id} className={"nav-item"+(page===n.id?" active":"")} onClick={()=>setPage(n.id)}>
                <n.icon size={19}/> {n.label}{n.badge>0 && <span className="nav-badge">{n.badge}</span>}
              </div>
            ))}
          </div>

          {/* Footer stats — always visible at bottom */}
          <div className="side-foot">
            {stats.map(([l,v])=><div key={l} className="side-stat"><span>{l}</span><b>{v}</b></div>)}
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            {/* Hamburger — mobile only, opens nav drawer */}
            {isInv && (
              <button
                className="hamburger"
                style={{display: isMobile ? 'inline-flex' : 'none'}}
                onClick={()=>setNavOpen(v=>!v)}
                aria-label="Toggle menu"
              >
                {navOpen ? <X size={20}/> : <Menu size={20}/>}
              </button>
            )}

            {/* ── Desktop search with live people dropdown ── */}
            <div className="searchbox search-hide-mobile" style={{width:300,maxWidth:'40vw',position:'relative',flexShrink:0}}>
              <Search size={16} color="var(--muted)"/>
              <input
                value={globalSearch}
                onChange={e=>setGlobalSearch(e.target.value)}
                onFocus={()=>{}}
                placeholder="Search investors, tickers…"
              />
              {globalSearch && (
                <button onClick={()=>{setGlobalSearch('');setSearchPeople([]);}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',padding:0,display:'flex'}}>
                  <X size={14}/>
                </button>
              )}
              {/* People search results dropdown */}
              {globalSearch.trim().length >= 2 && searchPeople.length > 0 && (
                <div style={{position:'absolute',top:'calc(100% + 8px)',left:0,right:0,zIndex:400,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.14)',overflow:'hidden'}}>
                  <div style={{padding:'7px 14px 3px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--muted)'}}>Investors</div>
                  {searchPeople.map((u,i)=>{
                    const isConn = connections.some(c=>c.id===u.id&&c.status==='active');
                    const isPend = connections.some(c=>c.id===u.id&&c.status!=='active');
                    const isSebi = u.sebi_approval_status==='approved'||['sebi_ra','sebi_ria'].includes(u.registration_status||'');
                    return (
                      <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',cursor:'pointer',borderTop:i>0?'1px solid var(--line)':'none',transition:'background .1s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}
                        onClick={()=>{ if(u.username){ window.location.hash=`#/investor/${u.username}`; setGlobalSearch(''); setSearchPeople([]); } }}>
                        <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(u.full_name||u.username||'?')}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.full_name||u.username}</div>
                          {u.username&&<div style={{fontSize:11,color:'var(--muted)'}}>@{u.username}</div>}
                        </div>
                        {isSebi&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'var(--gain-soft)',color:'var(--gain)',flexShrink:0}}>SEBI</span>}
                        {isConn ? <span style={{fontSize:11,fontWeight:700,color:'var(--gain)',flexShrink:0}}>Connected</span>
                         : isPend ? <span style={{fontSize:11,color:'var(--muted)',flexShrink:0}}>Pending</span>
                         : <button className="btn btn-pri btn-sm" style={{fontSize:11,padding:'3px 10px',flexShrink:0}}
                             onClick={e=>{e.stopPropagation();handlePeopleConnect(u.id);}}>
                             Connect
                           </button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="tb-right">
              {/* ── Mobile search icon ── */}
              {isInv && (
                <button
                  className="icon-btn"
                  style={{display: isMobile ? 'inline-flex' : 'none'}}
                  onClick={()=>{ setShowMobileSearch(v=>!v); if(showMobileSearch) { setGlobalSearch(''); setSearchPeople([]); } }}
                  aria-label="Search"
                  title="Search"
                >
                  {showMobileSearch ? <X size={18}/> : <Search size={18}/>}
                </button>
              )}

              {/* ── Invite button (desktop: text+icon; mobile: icon only) ── */}
              {isInv && (
                isMobile
                  ? <button className="icon-btn" onClick={()=>setShowInvite(true)} title="Invite friends" aria-label="Invite friends">
                      <UserPlus size={18}/>
                    </button>
                  : <button
                      className="btn btn-pri btn-sm"
                      onClick={()=>setShowInvite(true)}
                      style={{marginRight:4,padding:'6px 14px',fontSize:13}}
                    >
                      <UserPlus size={14}/> Invite
                    </button>
              )}

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
              <div ref={profileRef} style={{position:"relative"}}>
                <button
                  onClick={()=>{ setProfileOpen(v=>!v); setNotifOpen(false); }}
                  style={{background:"none",border:"none",padding:0,cursor:"pointer"}}
                  title="Profile & settings"
                >
                  <div className="avatar-pill">
                    <div className="gava">{isInv ? ME.initials : "AD"}</div>
                    <div className="tb-name-role" style={{paddingRight:6}}>
                      <div style={{fontSize:13,fontWeight:700,lineHeight:1.2}}>
                        {isInv ? ME.name : "Admin"}
                      </div>
                      <div style={{fontSize:11,color:"var(--muted)"}}>
                        {isInv ? "Investor" : "Administrator"}
                      </div>
                    </div>
                  </div>
                </button>

                {profileOpen && (
                  <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,width:"min(260px,calc(100vw - 24px))",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:16,boxShadow:"0 12px 40px rgba(0,0,0,.18)",zIndex:600,overflow:"hidden"}}>
                    {/* Profile header */}
                    <div style={{padding:"16px 16px 12px",borderBottom:"1px solid var(--line)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div className="av" style={{width:40,height:40,background:"var(--grad)",fontSize:15,flexShrink:0}}>{ME.initials}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ME.name}</div>
                          <div style={{fontSize:11,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ME.email}</div>
                        </div>
                      </div>
                    </div>
                    {/* Role switch — only for admin users */}
                    {userIsAdmin && (
                      <div style={{padding:"10px 14px",borderBottom:"1px solid var(--line)"}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Switch role</div>
                        {["investor","admin"].map(r=>(
                          <button key={r}
                            onMouseDown={e=>{ e.preventDefault(); e.stopPropagation(); setRole(r); setProfileOpen(false); }}
                            style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,fontFamily:"var(--font)",fontSize:13,fontWeight:600,textAlign:"left",
                              background: (r==="investor"&&isInv)||(r==="admin"&&!isInv) ? "var(--accent-soft)" : "transparent",
                              color:      (r==="investor"&&isInv)||(r==="admin"&&!isInv) ? "var(--accent-ink)" : "var(--ink)",
                            }}>
                            {r==="investor" ? <Users size={15}/> : <Settings size={15}/>}
                            {r==="investor" ? "Investor view" : "Admin view"}
                            {((r==="investor"&&isInv)||(r==="admin"&&!isInv)) && <Check size={13} style={{marginLeft:"auto"}}/>}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Edit profile — investors only */}
                    {isInv && (
                      <div style={{padding:"8px 14px",borderBottom:"1px solid var(--line)"}}>
                        <button
                          onMouseDown={e=>{ e.preventDefault(); e.stopPropagation(); setProfileOpen(false); setProfileEditOpen(true); }}
                          style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontSize:13,fontWeight:600,background:"transparent",color:"var(--ink)",textAlign:"left"}}>
                          <UserCog size={15}/> Edit profile
                        </button>
                      </div>
                    )}
                    {/* Sign out */}
                    <div style={{padding:"8px 14px"}}>
                      <button
                        onMouseDown={e=>{ e.preventDefault(); e.stopPropagation(); setProfileOpen(false); logout(); }}
                        style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontSize:13,fontWeight:600,background:"transparent",color:"var(--loss)",textAlign:"left"}}>
                        <LogOut size={15}/> Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Mobile search overlay — fixed below topbar, toggled by search icon ── */}
          {isInv && isMobile && showMobileSearch && (
            <div style={{position:'fixed',top:64,left:0,right:0,zIndex:300,background:'var(--surface)',borderBottom:'1px solid var(--line)',boxShadow:'0 4px 20px rgba(0,0,0,.1)',padding:'10px 14px'}}>
              {/* Search input */}
              <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:12,padding:'9px 14px'}}>
                <Search size={15} color="var(--muted)" style={{flexShrink:0}}/>
                <input
                  autoFocus
                  value={globalSearch}
                  onChange={e=>setGlobalSearch(e.target.value)}
                  placeholder="Search investors, tickers…"
                  style={{flex:1,border:'none',background:'none',fontSize:14,fontFamily:'var(--font)',color:'var(--ink)',outline:'none'}}
                />
                {globalSearch && (
                  <button onClick={()=>{setGlobalSearch('');setSearchPeople([]);}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',padding:0,display:'flex'}}>
                    <X size={14}/>
                  </button>
                )}
              </div>
              {/* People results */}
              {searchPeople.length > 0 && (
                <div style={{marginTop:8,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,overflow:'hidden'}}>
                  <div style={{padding:'6px 14px 2px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--muted)'}}>Investors</div>
                  {searchPeople.map((u,i)=>{
                    const isConn = connections.some(c=>c.id===u.id&&c.status==='active');
                    const isPend = connections.some(c=>c.id===u.id&&c.status!=='active');
                    return (
                      <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderTop:i>0?'1px solid var(--line)':'none'}}
                        onClick={()=>{ if(u.username){ window.location.hash=`#/investor/${u.username}`; setGlobalSearch(''); setSearchPeople([]); setShowMobileSearch(false); } }}>
                        <div className="av" style={{width:32,height:32,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(u.full_name||u.username||'?')}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13}}>{u.full_name||u.username}</div>
                          {u.username&&<div style={{fontSize:11,color:'var(--muted)'}}>@{u.username}</div>}
                        </div>
                        {isConn ? <span style={{fontSize:11,fontWeight:700,color:'var(--gain)',flexShrink:0}}>Connected</span>
                         : isPend ? <span style={{fontSize:11,color:'var(--muted)',flexShrink:0}}>Pending</span>
                         : <button className="btn btn-pri btn-sm" style={{fontSize:11,padding:'3px 10px',flexShrink:0}}
                             onClick={e=>{e.stopPropagation();handlePeopleConnect(u.id);}}>
                             Connect
                           </button>}
                      </div>
                    );
                  })}
                </div>
              )}
              {globalSearch.trim().length >= 2 && searchPeople.length === 0 && (
                <div style={{padding:'12px 14px',textAlign:'center',fontSize:13,color:'var(--muted)'}}>No investors found for "{globalSearch.trim()}"</div>
              )}
            </div>
          )}

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
            {isInv && page==="home"      && <HomeFeed isMobile={isMobile} setPage={setPage} setRecoInit={setRecoInit} recsReceived={recsReceived} setRecsReceived={setRecsReceived} configs={configs} holdings={holdings} contacts={contacts} me={ME} assetClasses={assetClasses} setAssetClasses={setAssetClasses} groups={groups} setRecsMade={setRecsMade} tracked={tracked} toggleTrack={toggleTrack} effectiveFeedConfig={effectiveFeedConfig} networkEngagementRecos={networkEngagementRecos} publicFeedRecos={publicFeedRecos} feedConfigOptions={feedConfigOptions} userFeedPrefs={userFeedPrefs} setUserFeedPrefs={setUserFeedPrefs} globalSearch={globalSearch} connections={connections} onPeopleConnect={handlePeopleConnect} onShowInvite={()=>setShowInvite(true)}/>}
            {isInv && showInvite && <InviteModal username={ME?.username} referralCount={referralCount} onClose={()=>setShowInvite(false)}/>}
            {isInv && page==="portfolio"    && <PortfolioIntelligencePage holdings={holdings} setHoldings={setHoldings} contacts={contacts} me={ME} refreshPrices={refreshPrices} priceRefresh={priceRefresh} onOpenSecurity={openSecurity} setPage={setPage}/>}
            {isInv && page==="market_intel" && <MarketIntelligencePage contacts={contacts} me={ME} onOpenSecurity={openSecurity}/>}
            {isInv && page==="sec_intel"    && <SecurityIntelligencePage securityTicker={securityTicker} contacts={contacts} me={ME} onOpenSecurity={openSecurity}/>}
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
                tracked={tracked} toggleTrack={toggleTrack}
                globalSearch={globalSearch}
                onReload={async()=>{ setRecsReceived(await getMyReceivedRecos(ME.id)); setRecsMade(await getMyMadeRecos(ME.id)); }}/>}
            {isInv && page==="sharing"     && <Sharing sharing={sharing} setSharing={setSharing} configs={configs} holdings={holdings} contacts={contacts} groups={groups} myId={ME.id} feedConfigOptions={feedConfigOptions} userFeedPrefs={userFeedPrefs} setUserFeedPrefs={setUserFeedPrefs} effectiveFeedConfig={effectiveFeedConfig} setEffectiveFeedConfig={setEffectiveFeedConfig}/>}
            {isInv && page==="about"        && <AboutPage/>}
            {isInv && page==="contact"      && <ContactPage setPage={setPage}/>}
            {isInv && page==="privacy"      && <PrivacyPolicyPage/>}
            {isInv && page==="trackrecord" && (
              ME.username
                ? <ProfileErrorBoundary key={ME.username}>
                    <PublicProfilePage
                      username={ME.username}
                      viewerUser={user}
                      viewerConnections={connections}
                      viewerIsAdmin={ME?.is_admin === true}
                      mode="embedded"
                      isOwnProfile
                      patchProfile={patchProfile}
                      onRequestConnect={()=>{}}
                      onBack={()=>setPage("home")}
                    />
                  </ProfileErrorBoundary>
                : hasPendingClaim
                  ? <div style={{maxWidth:520}}>
                      <div className="page-head"><div>
                        <div className="eyebrow">Track Record</div>
                        <div className="page-title">Your public profile</div>
                      </div></div>
                      <div className="card" style={{borderColor:'rgba(109,93,245,.3)',background:'rgba(109,93,245,.04)'}}>
                        <div className="card-body" style={{textAlign:'center',padding:'36px 28px'}}>
                          <div style={{fontSize:36,marginBottom:14}}>⏳</div>
                          <div style={{fontWeight:800,fontSize:17,marginBottom:10,color:'var(--accent-ink)'}}>Awaiting admin approval</div>
                          <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.7,marginBottom:20}}>
                            You've claimed your profile and your request is with the myInvestorCircle team.
                            Once approved, your full track record and ICI score — including all your historical recommendations — will appear here.
                          </div>
                          <div className="note" style={{fontSize:12,textAlign:'left',background:'var(--surface-2)'}}>
                            You'll receive a confirmation email at your registered address as soon as the admin approves your profile. This usually happens within 24 hours.
                          </div>
                        </div>
                      </div>
                    </div>
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
                      <button className="btn btn-pri" onClick={()=>setProfileEditOpen(true)}>
                        <Pencil size={15}/> Set username in profile
                      </button>
                    </div></div>
                  </div>
            )}
            {!isInv && page==="users"       && <AdminUsers users={users} setUsers={setUsers} contacts={contacts} setContacts={()=>{}}/>}
            {!isInv && page==="creators"    && <AdminCreators ME={ME} claimRequests={claimRequests} onClaimAction={loadClaimRequests}/>}
            {!isInv && page==="groups"      && <AdminGroups groups={groups} setGroups={setGroups} contacts={contacts} me={ME}/>}
            {!isInv && page==="instruments" && <AdminInstruments/>}
            {!isInv && page==="sebi"        && <AdminSebi/>}
            {!isInv && page==="feed"        && <AdminFeedConfig feedConfigOptions={feedConfigOptions} setFeedConfigOptions={setFeedConfigOptions} setEffectiveFeedConfig={setEffectiveFeedConfig} userFeedPrefs={userFeedPrefs}/>}
            {!isInv && page==="configs"     && <AdminConfigs configs={configs} setConfigs={setConfigs} providers={providers} setProviders={setProviders}/>}
            {!isInv && page==="seed"        && <AdminSeedData/>}
            {!isInv && page==="about"       && <AdminAboutEditor/>}
            {/* ── Site-wide footer — investors only ── */}
            {isInv && <SiteFooter page={page} setPage={setPage}/>}
          </div>
        </div>
      </div>
      {/* ── Edit profile modal — rendered as a portal, accessible from any page ── */}
      {profileEditOpen && isInv && (
        <ProfileEditModal
          profile={profile}
          userId={user?.uid}
          username={ME.username}
          patchProfile={patchProfile}
          onClose={()=>setProfileEditOpen(false)}
        />
      )}
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
  const isMobile = useIsMobile();
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
  // On mobile: fixed to viewport (prevents overflow beyond screen edges)
  // On desktop: absolute, anchored to the bell button
  const panelStyle = isMobile
    ? { position:'fixed', top:68, left:8, right:8, width:'auto',
        background:'var(--surface)', border:'1px solid var(--line)',
        borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.18)', zIndex:300,
        maxHeight:'70vh', display:'flex', flexDirection:'column' }
    : { position:'absolute', top:44, right:0, width:380,
        background:'var(--surface)', border:'1px solid var(--line)',
        borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.12)', zIndex:200,
        maxHeight:520, display:'flex', flexDirection:'column' };
  return (
    <div style={panelStyle} onClick={e=>e.stopPropagation()}>
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
              <div className="muted small">{fmtDate(n.created_at)}</div>
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
          {/* Avatar + name: click opens public profile; rest of row click expands */}
          <div style={{display:"flex",gap:11,alignItems:"center",cursor:"pointer"}}
            title={`View ${c.name}'s public profile`}
            onClick={e=>{e.stopPropagation(); gotoUserProfile(c.user_id);}}>
            <Avatar f={av} size={36}/>
            <div className="sym" style={{color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{c.name}</div>
          </div>
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
            <td className="muted small">{fmtDate(g.created_at)}</td>
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
                  {/* Avatar + name: click opens public profile */}
                  <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                    title={`View ${m.name||nameOf(m.user_id)}'s public profile`}
                    onClick={()=>gotoUserProfile(m.user_id)}>
                    <Avatar f={avOf(m.user_id)} size={28}/>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:"var(--accent-ink)",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:3}}>{m.name||nameOf(m.user_id)}</div>
                      <div className="muted" style={{fontSize:11}}>{m.role==="admin"?"Admin":"Member"}</div>
                    </div>
                  </div>
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
        <button className="btn btn-soft btn-sm" onClick={()=>setShowPan(true)}><Upload size={15}/> Upload CAS</button>
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
    <div className="portfolio-layout" style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:18 }}>
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
/* =================================================================== RECOMMENDATIONS */
const Money = ({ itm }) => <span className={"pill "+(itm?"gain":"loss")}>{itm?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {itm?"In the money":"Out of the money"}</span>;
const ClassTag = ({ c }) => <span className="ttag nowrap"><span className="dot" style={{ background:classColor(c) }}/>{c}</span>;
const ret = (r) => (r.priceAt && r.priceAt !== 0) ? (r.price - r.priceAt) / r.priceAt : 0;

const HORIZONS = ["<3m","6m","12m",">2Y"];
const calcTargetDate = (date, horizon) => {
  if (!date || !horizon) return null;
  const d = new Date(date + "T00:00:00");
  if (horizon==="<3m") d.setMonth(d.getMonth()+3);
  else if (horizon==="6m")  d.setMonth(d.getMonth()+6);
  else if (horizon==="12m") d.setMonth(d.getMonth()+12);
  else if (horizon===">2Y") d.setFullYear(d.getFullYear()+2);
  else return null;
  return d.toISOString().slice(0,10);
};
const getTargetDate = (r) => r.targetDate || calcTargetDate(r.date, r.horizon) || null;
const isExpired = (r) => { const td=getTargetDate(r); return td ? td < TODAY : false; };

function Recommendations({ recsReceived, setRecsReceived, recsMade, setRecsMade,
    contacts, groups, assetClasses, setAssetClasses, initFilter, holdings, me, onReload, tracked, toggleTrack, globalSearch }) {
  const [tab, setTab] = useState(initFilter?.tab || "tracked");
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
  const trackedCount = tracked.size;

  return (<>
    {/* ── Header + tabs ── */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:12}}>
      <div>
        <div className="eyebrow" style={{marginBottom:0}}>Recommendations</div>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px',marginTop:2}}>Ideas worth tracking</div>
      </div>
      {/* Tabs — Tracked first */}
      <div style={{display:"flex",gap:6,background:"var(--surface-2)",borderRadius:14,padding:4,flexWrap:"wrap"}}>
        {[
          {id:"tracked",  label:"My Tracked",  count:trackedCount,  icon:Bookmark},
          {id:"received", label:"Received",     count:receivedCount, icon:Lightbulb},
          {id:"made",     label:"Made by me",   count:madeCount,     icon:Send},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            display:"flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:11,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontWeight:700,fontSize:14,transition:".15s",
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

    {tab==="tracked"  && <TrackedSection tracked={tracked} toggleTrack={toggleTrack} me={me} contacts={contacts} initMoneyFilter={initFilter?.moneyFilter} globalSearch={globalSearch}/>}
    {tab==="received" && <ReceivedSection recs={recsReceived} setRecs={setRecsReceived} myId={myId}
        contactName={contactName} groupName={groupName} assetClasses={assetClasses}
        contacts={contacts} groups={groups} initBy={initFilter?.by} initGroup={initFilter?.groupId}
        onForward={forwardReco} onReload={onReload} me={me} tracked={tracked} toggleTrack={toggleTrack} globalSearch={globalSearch}/>}
    {tab==="made"     && <MadeSection recs={recsMade} setRecs={setRecsMade} recipientName={recipientName}
        reach={reach} contacts={contacts} groups={groups} assetClasses={assetClasses}
        setAssetClasses={setAssetClasses} holdings={holdings} me={me} onReload={onReload} globalSearch={globalSearch}/>}
  </>);
}


/* ─── TrackedSection — My Tracked / Saved list ─────────────────────────────── */
function TrackedSection({ tracked, toggleTrack, me, contacts, initMoneyFilter, globalSearch }) {
  const isMobile = useIsMobile();
  const [recos,         setRecos]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [openRow,       setOpenRow]       = useState(null);
  const [sort,          setSort]          = useState({key:"tracked",dir:"desc"});
  const [sharePopId,    setSharePopId]    = useState(null);
  const [shareAnchor,   setShareAnchor]   = useState(null);
  const [shareUsername, setShareUsername] = useState(null);
  const [q,       setQ]       = useState(globalSearch||"");
  const [fHorizon,setFHorizon]= useState("all");
  const [fMoney,  setFMoney]  = useState(initMoneyFilter||"all");
  const [fInv,    setFInv]    = useState("all");

  // Sync global search into local filter
  useEffect(()=>{ setQ(globalSearch||""); },[globalSearch]);

  useEffect(()=>{
    if(!me?.id||!sql){ setLoading(false); return; }
    setLoading(true);

    // Try with is_invested columns (requires migration_v9 ALTER TABLE)
    sql`SELECT ir.id, ir.asset_name, ir.ticker, ir.asset_class, ir.recommendation_type,
               ir.reco_price, ir.current_price, ir.target_price, ir.stop_loss,
               ir.horizon, ir.thesis, ir.sector, ir.conviction, ir.exchange,
               ir.exit_signal, ir.exit_date, ir.is_public, ir.created_at,
               up.full_name as recommender_name, up.first_name, up.last_name, up.username as recommender_username,
               rt.tracked_at, rt.is_invested, rt.invested_price
        FROM recommendation_tracking rt
        JOIN ic_recommendations ir ON rt.reco_id = ir.id
        JOIN user_profiles up ON ir.recommender_id = up.id
        WHERE rt.user_id = ${me.id}
        ORDER BY rt.tracked_at DESC`
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(()=>{
        // Fallback: without is_invested (pre-migration or column missing)
        sql`SELECT ir.id, ir.asset_name, ir.ticker, ir.asset_class, ir.recommendation_type,
                   ir.reco_price, ir.current_price, ir.target_price, ir.stop_loss,
                   ir.horizon, ir.thesis, ir.sector, ir.conviction, ir.exchange,
                   ir.exit_signal, ir.exit_date, ir.is_public, ir.created_at,
                   up.full_name as recommender_name, up.first_name, up.last_name, up.username as recommender_username,
                   rt.tracked_at
            FROM recommendation_tracking rt
            JOIN ic_recommendations ir ON rt.reco_id = ir.id
            JOIN user_profiles up ON ir.recommender_id = up.id
            WHERE rt.user_id = ${me.id}
            ORDER BY rt.tracked_at DESC`
          .then(rows=>{ setRecos(rows.map(r=>({...r, is_invested:false, invested_price:null}))); setLoading(false); })
          .catch(e=>{ console.error('TrackedSection load failed:', e); setLoading(false); });
      });
  },[me?.id, tracked.size]);

  // Patch invested status locally + persist to recommendation_tracking
  const patchInvested=(r, updates)=>{
    setRecos(rs=>rs.map(x=>x.id===r.id?{...x,...updates}:x));
    if(sql&&me?.id) {
      if(updates.is_invested) {
        sql`UPDATE recommendation_tracking SET is_invested=true, invested_price=${updates.invested_price||null}, invested_at=now() WHERE reco_id=${r.id} AND user_id=${me.id}`.catch(console.warn);
      } else {
        sql`UPDATE recommendation_tracking SET is_invested=false, invested_price=null, invested_at=null WHERE reco_id=${r.id} AND user_id=${me.id}`.catch(console.warn);
      }
    }
  };

  const handleShare = async (e, r) => {
    if(sharePopId===r.id){ setSharePopId(null); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget); setSharePopId(r.id); setShareUsername(null);
    if(r.recommender_username){ setShareUsername(r.recommender_username); return; }
    if(sql) {
      try {
        const rows = await sql`SELECT username FROM user_profiles WHERE id = (SELECT recommender_id FROM ic_recommendations WHERE id = ${r.id}) LIMIT 1`;
        if(rows[0]?.username) setShareUsername(rows[0].username);
      }catch(_){}
    }
  };

  if(loading) return <div className="muted small" style={{padding:32,textAlign:'center'}}><Loader size={20} className="spin"/></div>;

  if(recos.length===0) return (
    <div className="card"><div className="card-body" style={{textAlign:'center',padding:'48px 32px'}}>
      <Bookmark size={36} color="var(--muted)" style={{marginBottom:14}}/>
      <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Nothing tracked yet</div>
      <div className="muted small">Click the bookmark icon on any recommendation to save it here for easy reference.</div>
    </div></div>
  );

  // Filter + sort
  const filtered = recos.filter(r=>{
    if(q.trim()){ const s=q.toLowerCase(); if(!(r.asset_name+r.ticker).toLowerCase().includes(s)) return false; }
    if(fHorizon!=="all" && r.horizon!==fHorizon) return false;
    const recoRet=r.reco_price?(r.current_price-r.reco_price)/r.reco_price:0;
    if(fMoney==="in"  && recoRet<0)  return false;
    if(fMoney==="out" && recoRet>=0) return false;
    if(fInv==="yes" && !r.is_invested) return false;
    if(fInv==="no"  &&  r.is_invested) return false;
    return true;
  });

  const sorted = [...filtered].sort((a,b)=>{
    const dir=sort.dir==="asc"?1:-1;
    if(sort.key==="asset")   return a.asset_name.localeCompare(b.asset_name)*dir;
    if(sort.key==="tracked") return (a.tracked_at>b.tracked_at?1:-1)*dir;
    if(sort.key==="reco")    return ((a.reco_price||0)-(b.reco_price||0))*dir;
    if(sort.key==="cur")     return ((a.current_price||0)-(b.current_price||0))*dir;
    if(sort.key==="entry")   return ((a.invested_price||0)-(b.invested_price||0))*dir;
    if(sort.key==="recret"){
      const ra=a.reco_price?(a.current_price-a.reco_price)/a.reco_price:0;
      const rb=b.reco_price?(b.current_price-b.reco_price)/b.reco_price:0;
      return (ra-rb)*dir;
    }
    if(sort.key==="myret"){
      const ra=a.invested_price?(a.current_price-a.invested_price)/a.invested_price:0;
      const rb=b.invested_price?(b.current_price-b.invested_price)/b.invested_price:0;
      return (ra-rb)*dir;
    }
    if(sort.key==="horizon") return (HORIZONS.indexOf(a.horizon)-HORIZONS.indexOf(b.horizon))*dir;
    return 0;
  });

  return (<>
    {/* ── Filters ── */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div className="searchbox" style={{flex:"1 1 200px",minWidth:160}}>
        <Search size={15} color="var(--muted)"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search asset or ticker…"/>
      </div>
      <select className="inline-select sm" value={fHorizon} onChange={e=>setFHorizon(e.target.value)} title="Filter by horizon">
        <option value="all">All horizons</option>{HORIZONS.map(h=><option key={h}>{h}</option>)}
      </select>
      <select className="inline-select sm" value={fMoney} onChange={e=>setFMoney(e.target.value)}>
        <option value="all">All returns</option><option value="in">In the money</option><option value="out">Out of money</option>
      </select>
      <select className="inline-select sm" value={fInv} onChange={e=>setFInv(e.target.value)}>
        <option value="all">All</option><option value="yes">Invested</option><option value="no">Not invested</option>
      </select>
    </div>

    {sorted.length===0
      ? <div className="card"><div className="empty">No tracked recommendations match your filters.</div></div>
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {sorted.map(r=>{
            const recoRet=r.reco_price?(r.current_price-r.reco_price)/r.reco_price:0;
            const myRet=r.is_invested&&r.invested_price?(r.current_price-r.invested_price)/r.invested_price:null;
            const isBuy=(r.recommendation_type||'Buy')==='Buy';
            const isInv=r.is_invested||false;
            const cur=r.currency||'INR';
            const fn=r.first_name||''; const ln=r.last_name||'';
            const rName=fn&&ln&&fn!==ln?`${fn} ${ln}`:(fn||r.recommender_name||'Unknown');
            return (
              <div key={r.id} className="card" style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.asset_name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · By {rName}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Reco Price',r.reco_price?fmt(r.reco_price,cur):'—'],['Current',r.current_price?fmt(r.current_price,cur):'—'],['Return',r.reco_price?fmtPct(recoRet):'—']].map(([label,val],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:i===2?(recoRet>=0?'var(--gain)':'var(--loss)'):'var(--ink)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {isInv&&<span className="pill gain" style={{fontSize:10}}>Invested</span>}
                    <span style={{fontSize:10,color:'var(--muted)'}}>Tracked {new Date(r.tracked_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <InvestedToggle invested={isInv} investedPrice={r.invested_price}
                      reco={{id:r.id,price:r.current_price,ticker:r.ticker,assetName:r.asset_name,priceAt:r.reco_price}}
                      onMark={(price)=>{patchInvested(r,{is_invested:true,invested_price:price});if(!tracked?.has(r.id))toggleTrack?.(r.id);}}
                      onUnmark={()=>patchInvested(r,{is_invested:false,invested_price:null})}/>
                    <button className="iconbtn" title="Remove from tracked" onClick={()=>toggleTrack(r.id)} style={{background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}}><Bookmark size={13}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <div className="tscroll">
            <table className="grid" style={{width:"100%"}}>
              <thead><tr>
                <SortTh label="Asset"        k="asset"   sort={sort} setSort={setSort}/>
                <th style={{whiteSpace:"normal",lineHeight:1.3,minWidth:60}}>Reco By</th>
                <th style={{textAlign:"left",whiteSpace:"normal",lineHeight:1.3,minWidth:60,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"tracked",dir:s.key==="tracked"&&s.dir==="asc"?"desc":"asc"}))}>Tracked<br/>On<span className="si">{sort.key==="tracked"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <SortTh label="Reco Price"   k="reco"    sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Entry Price"  k="entry"   sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current"      k="cur"     sort={sort} setSort={setSort} align="right"/>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:72,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"recret",dir:s.key==="recret"&&s.dir==="asc"?"desc":"asc"}))}>Reco<br/>Return<span className="si">{sort.key==="recret"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th style={{textAlign:"right",whiteSpace:"normal",lineHeight:1.3,minWidth:64,cursor:"pointer"}} onClick={()=>setSort(s=>({key:"myret",dir:s.key==="myret"&&s.dir==="asc"?"desc":"asc"}))}>My<br/>Return<span className="si">{sort.key==="myret"?sort.dir==="asc"?<ChevronDown size={13} style={{transform:"rotate(180deg)"}}/>:<ChevronDown size={13}/>:<ArrowUpDown size={12}/>}</span></th>
                <th>Status</th>
                <SortTh label="Horizon"      k="horizon" sort={sort} setSort={setSort}/>
                <th style={{textAlign:"right"}}>Actions</th>
              </tr></thead>
              <tbody>{sorted.map(r=>{
                const recoRet = r.reco_price ? (r.current_price-r.reco_price)/r.reco_price : 0;
                const myRet   = r.is_invested && r.invested_price ? (r.current_price-r.invested_price)/r.invested_price : null;
                const itm = recoRet >= 0;
                const open = openRow===r.id;
                // Fix duplicate name: if first_name and last_name are identical, show only one
                const fn = r.first_name||''; const ln = r.last_name||'';
                const rName = fn && ln && fn!==ln ? `${fn} ${ln}` : (fn || r.recommender_name || 'Unknown');
                const isBuy = (r.recommendation_type||'Buy')==='Buy';
                const isInv = r.is_invested || false;

                return (<React.Fragment key={r.id}>
                  <tr className="hoverable">
                    {/* Asset — no ticker in collapsed */}
                    <td style={{cursor:'pointer',maxWidth:200}} onClick={()=>setOpenRow(open?null:r.id)}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <ChevronDown size={13} color="var(--muted)" style={{transform:open?'rotate(180deg)':'none',transition:'.15s',flexShrink:0}}/>
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span className="sym" style={{fontSize:13}}>{r.asset_name}</span>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                          </div>
                          <div style={{fontSize:11,color:'var(--muted)'}}><ClassTag c={r.asset_class}/></div>
                        </div>
                      </div>
                    </td>
                    <td style={{fontSize:13}}>
                      {r.recommender_username
                        ? <span style={{cursor:'pointer',color:'var(--accent-ink)',fontWeight:600,textDecoration:'underline',textDecorationStyle:'dotted',textUnderlineOffset:3}}
                            title={`View ${rName}'s public profile`}
                            onClick={()=>openProfile(r.recommender_username)}>{rName}</span>
                        : <span style={{fontWeight:600}}>{rName}</span>}
                    </td>
                    <td className="muted small nowrap">{new Date(r.tracked_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})}</td>
                    <td style={{textAlign:'right'}} className="tnum">{r.reco_price?fmt(r.reco_price,r.currency||'INR'):' —'}</td>
                    <td style={{textAlign:'right'}} className="tnum">
                      {isInv && r.invested_price
                        ? <span style={{fontWeight:600,color:'var(--accent-ink)'}}>{fmt(r.invested_price,r.currency||'INR')}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{textAlign:'right'}} className="tnum">{r.current_price?fmt(r.current_price,r.currency||'INR'):' —'}</td>
                    <td style={{textAlign:'right',fontWeight:700}} className={"tnum "+(itm?"pos":"neg")}>{r.reco_price?`${itm?'+':''}${(recoRet*100).toFixed(1)}%`:'—'}</td>
                    <td style={{textAlign:'right',fontWeight:700}}>
                      {myRet!==null
                        ? <span className={myRet>=0?"pos":"neg"}>{myRet>=0?'+':''}{(myRet*100).toFixed(1)}%</span>
                        : <span className="muted" style={{fontSize:11}}>—</span>}
                    </td>
                    <td><Money itm={itm}/></td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    <td>
                      <div className="actions" style={{gap:6,justifyContent:'flex-end',flexWrap:'nowrap'}}>
                        {/* Share */}
                        <div style={{position:"relative"}}>
                          <button className="iconbtn" title="Share" onClick={e=>handleShare(e,r)}><Share2 size={13}/></button>
                          {sharePopId===r.id && (
                            <ReceivedSharePopover
                              reco={{id:r.id,ticker:r.ticker,assetName:r.asset_name}}
                              fromUsername={shareUsername}
                              anchorEl={shareAnchor}
                              onForward={()=>setSharePopId(null)}
                              onClose={()=>{ setSharePopId(null); setShareAnchor(null); }}
                            />
                          )}
                        </div>
                        {/* Mark Invested toggle */}
                        <InvestedToggle
                          invested={isInv}
                          investedPrice={r.invested_price}
                          reco={{id:r.id, price:r.current_price, ticker:r.ticker, assetName:r.asset_name, priceAt:r.reco_price}}
                          onMark={(price)=>{
                            patchInvested(r,{is_invested:true,invested_price:price});
                            if(!tracked?.has(r.id)) toggleTrack?.(r.id);
                          }}
                          onUnmark={()=>patchInvested(r,{is_invested:false,invested_price:null})}
                        />
                        {/* Untrack */}
                        <button className="iconbtn" title="Remove from tracked"
                          onClick={()=>toggleTrack(r.id)}
                          style={{background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}}>
                          <Bookmark size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="expand-row"><td colSpan={11}><div className="expand-inner">
                      <div style={{display:'flex',gap:24,flexWrap:'wrap',marginBottom:12}}>
                        <div><div className="cap">Ticker</div><b>{r.ticker}</b></div>
                        {isInv && r.invested_price&&<div><div className="cap">My entry price</div><b className="tnum" style={{color:'var(--accent-ink)'}}>{fmt(r.invested_price,r.currency||'INR')}</b></div>}
                        {r.target_price&&<div><div className="cap">Target</div><b className="tnum">{fmt(r.target_price,r.currency||'INR')}</b></div>}
                        {r.stop_loss&&<div><div className="cap">Stop loss</div><b className="tnum neg">{fmt(r.stop_loss,r.currency||'INR')}</b></div>}
                        {r.conviction&&<div><div className="cap">Conviction</div><ConvBadge level={r.conviction}/></div>}
                        {r.sector&&<div><div className="cap">Sector</div><b>{r.sector}</b></div>}
                        <div><div className="cap">Reco Return</div><b className={"tnum "+(itm?"pos":"neg")}>{itm?'+':''}{(recoRet*100).toFixed(1)}%</b></div>
                        {myRet!==null&&<div><div className="cap">My Return</div><b className={"tnum "+(myRet>=0?"pos":"neg")}>{myRet>=0?'+':''}{(myRet*100).toFixed(1)}%</b></div>}
                      </div>
                      {r.thesis&&r.thesis!=='—'&&(
                        <><div className="cap" style={{marginBottom:4}}>Thesis</div>
                        <div style={{fontSize:13,lineHeight:1.7,color:'var(--ink-soft)',marginBottom:14}}>{r.thesis}</div></>
                      )}
                      <div style={{borderTop:'1px solid var(--line)',paddingTop:12}}>
                        <div className="cap" style={{marginBottom:10}}>Comments</div>
                        <RecoComments recoId={r.id} me={me}/>
                      </div>
                    </div></td></tr>
                  )}
                </React.Fragment>);
              })}</tbody>
            </table>
            </div>
          </div>
        </div>}
  </>);
}
function ReceivedSection({ recs, setRecs, myId, contactName, groupName, assetClasses, contacts, groups, initBy, initGroup, onForward, onReload, me, tracked, toggleTrack, globalSearch }) {
  const isMobile = useIsMobile();
  const [q,setQ]=useState(globalSearch||""); const [sort,setSort]=useState({key:"date",dir:"desc"});
  const [fBy,setFBy]=useState(initBy||"all"),[fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all");
  const [fInv,setFInv]=useState("all"),[fGroup,setFGroup]=useState(initGroup||"all"),[fHorizon,setFHorizon]=useState("all");
  const [showHidden,setShowHidden]=useState(false); const [showExpired,setShowExpired]=useState(false);
  const [openRow,setOpenRow]=useState(null); const [fwd,setFwd]=useState(null);
  const [sharePopId,setSharePopId]=useState(null);
  const [shareAnchor,setShareAnchor]=useState(null);
  // Sync global search into local filter
  useEffect(()=>{ setQ(globalSearch||""); },[globalSearch]);
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
  const unInvest=(r)=>{
    patch(r,{isInvested:false,investedPrice:null,invested:false});
    if(sql&&myId) sql`UPDATE recommendation_tracking SET is_invested=false, invested_price=null, invested_at=null WHERE reco_id=${r.id} AND user_id=${myId}`.catch(console.warn);
  };
  const onInvestClick=(r)=>{ if(r.invested) unInvest(r); else setInvesting(r); };
  const react=(r,val)=>{
    const next=r.reaction===val?'none':val;
    // Optimistically update local state (counts + reaction) without touching DB aggregates
    let likes=(r.likes||0), dislikes=(r.dislikes||0);
    if(r.reaction==='like')    likes    = Math.max(0, likes-1);
    if(r.reaction==='dislike') dislikes = Math.max(0, dislikes-1);
    if(next==='like')    likes++;
    if(next==='dislike') dislikes++;
    setRecs(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,reaction:next,likes,dislikes}:x));
    // Persist reaction to DB — use null (not 'none') to avoid constraint violations
    if(sql&&r.deliveryId) updateDelivery(r.deliveryId,{reaction:next==='none'?null:next},myId).catch(console.warn);
  };
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
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(r=>{
            const isBuy=(r.recommendation_type||r.recType||'Buy')==='Buy';
            const recoRet=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
            const cur=r.currency||'INR';
            const fromName=r.byName||(typeof contactName==='function'?contactName(r.from):'Someone');
            return (
              <div key={r.id} className="card" style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.assetName||r.asset_name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · From {fromName}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Reco Price',r.priceAt?fmt(r.priceAt,cur):'—'],['Current',r.price?fmt(r.price,cur):'—'],['Return',r.priceAt?fmtPct(recoRet):'—']].map(([label,val],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:i===2?(recoRet>=0?'var(--gain)':'var(--loss)'):'var(--ink)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {r.conviction&&<ConvBadge level={r.conviction}/>}
                    <span style={{fontSize:10,color:'var(--muted)'}}>{fmtDate(r.date)}</span>
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <button className="iconbtn" title={tracked?.has(r.id)?'Tracked':'Track'} onClick={()=>toggleTrack?.(r.id)} style={tracked?.has(r.id)?{background:'var(--accent-soft)',color:'var(--accent-ink)'}:{}}><Bookmark size={13}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <div className="tscroll">
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
                      <div
                        style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                          cursor:r.from?'pointer':'default',
                          color:r.from?'var(--accent-ink)':'var(--ink)',
                          textDecoration:r.from?'underline':'none',
                          textDecorationStyle:'dotted',textUnderlineOffset:3}}
                        title={r.from?`View ${recName(r)}'s public profile`:''}
                        onClick={()=>r.from&&gotoUserProfile(r.from)}
                      >{recName(r)}</div>
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
                        {/* Mark Invested toggle */}
                        <InvestedToggle
                          invested={r.invested}
                          investedPrice={r.investedPrice||r.invested_price}
                          reco={r}
                          onMark={(price)=>{
                            doInvest(r, price);
                            // Upsert into tracking with invested data (auto-tracks + marks invested)
                            if(sql && myId) {
                              sql`INSERT INTO recommendation_tracking (reco_id, user_id, is_invested, invested_price, invested_at)
                                  VALUES (${r.id}, ${myId}, true, ${price}, now())
                                  ON CONFLICT (reco_id, user_id) DO UPDATE SET
                                    is_invested=true, invested_price=${price}, invested_at=now()`
                                .then(()=>{ if(toggleTrack && tracked && !tracked.has(r.id)) toggleTrack(r.id); })
                                .catch(()=>{ if(toggleTrack && tracked && !tracked.has(r.id)) toggleTrack(r.id); });
                            } else if(toggleTrack && tracked && !tracked.has(r.id)) toggleTrack(r.id);
                          }}
                          onUnmark={()=>unInvest(r)}
                          stopProp={false}
                        />
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
                        {/* Track / bookmark button */}
                        <button
                          className={"iconbtn"+(tracked?.has(r.id)?" on-like":"")}
                          title={tracked?.has(r.id)?"Remove from tracked":"Track this recommendation"}
                          onClick={()=>toggleTrack?.(r.id)}
                          style={tracked?.has(r.id)?{background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}:{}}>
                          <Bookmark size={13}/>
                        </button>
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
            </div>{/* /tscroll */}
          </div>
        </div>}

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

/* ── CAS PDF Upload Modal ────────────────────────────────────────────────────
   Replaces the old mock "Link via PAN" modal.
   Step 1: drop / browse PDF + enter password → Parse
   Step 2: preview MF & equity holdings + choose append/replace → Import
   ─────────────────────────────────────────────────────────────────────────── */
function PanPullModal({ onClose, onApply }) {
  const [file,     setFile]     = useState(null);
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [drag,     setDrag]     = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [parsed,   setParsed]   = useState(null);   // { mf, equity, investor, warnings }
  const [mode,     setMode]     = useState('append');
  const [err,      setErr]      = useState('');
  const dropRef = useRef(null);

  const allHoldings = parsed ? [...(parsed.mf||[]), ...(parsed.equity||[])] : [];

  const pickFile = f => {
    if (!f || f.type !== 'application/pdf') { setErr('Please select a PDF file.'); return; }
    setFile(f); setErr(''); setParsed(null);
  };

  const onDrop = e => {
    e.preventDefault(); setDrag(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const parse = async () => {
    if (!file) return;
    setParsing(true); setErr('');
    try {
      const result = await parseCasPdf(file, password);
      setParsed(result);
      if (!result.mf.length && !result.equity.length) {
        setErr('No holdings found. Check your password and try again.');
        setParsed(null);
      }
    } catch(e) { setErr(e.message); }
    setParsing(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{width: parsed ? 760 : 500, maxWidth:'95vw'}}
           onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="modal-head">
          <h3><CreditCard size={18} style={{verticalAlign:-3,color:'var(--accent)'}}/>
            {' '}Import portfolio via CAS
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="modal-body">
          {!parsed ? (
            <>
              {/* API not configured warning */}
              {!_CAS_CONFIGURED&&(
                <div className="note" style={{marginBottom:12,background:'#fef3c7',border:'1px solid #fbbf24',borderRadius:10,padding:'10px 14px',display:'flex',gap:8,alignItems:'flex-start'}}>
                  <AlertTriangle size={15} style={{color:'#92400e',flexShrink:0,marginTop:1}}/>
                  <div style={{fontSize:12,color:'#78350f'}}>
                    <strong>CAS API not configured.</strong> Add{' '}
                    <code style={{background:'rgba(0,0,0,.08)',padding:'1px 5px',borderRadius:3}}>VITE_CAS_API_URL=https://your-project.vercel.app</code>{' '}
                    to GitHub → Settings → Secrets → Actions, then redeploy. Until then, CAS import will fail with a 405 error.
                  </div>
                </div>
              )}

              {/* What is CAS */}
              <div className="note info" style={{marginBottom:16}}>
                <Shield size={15}/>
                <div>
                  A <strong>Consolidated Account Statement (CAS)</strong> contains
                  all your mutual fund and demat (equity) holdings in one PDF.
                  {' '}<a href="https://www.camsonline.com/Investors/Statements/ConsolidatedAccountStatement"
                     target="_blank" rel="noopener noreferrer"
                     style={{color:'var(--accent-ink)',fontWeight:600}}>Get your CAS from CAMS →</a>
                </div>
              </div>

              {/* Drop zone */}
              <div ref={dropRef}
                   onDragOver={e=>{e.preventDefault();setDrag(true);}}
                   onDragLeave={()=>setDrag(false)}
                   onDrop={onDrop}
                   onClick={()=>dropRef.current.querySelector('input').click()}
                   style={{
                     border:`2px dashed ${drag?'var(--accent)':'var(--line-2)'}`,
                     borderRadius:14, padding:'28px 20px', textAlign:'center',
                     cursor:'pointer', transition:'.15s',
                     background:drag?'var(--accent-soft)':'var(--surface-2)',
                   }}>
                <input type="file" accept=".pdf" style={{display:'none'}}
                  onChange={e=>pickFile(e.target.files[0])}/>
                {file
                  ? <div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--ink)',marginBottom:4}}>
                        📄 {file.name}
                      </div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>
                        {(file.size/1024/1024).toFixed(2)} MB · Click to change
                      </div>
                    </div>
                  : <>
                      <Upload size={28} color="var(--muted)" style={{marginBottom:10}}/>
                      <div style={{fontSize:14,fontWeight:600,color:'var(--ink)',marginBottom:4}}>
                        Drop your CAS PDF here
                      </div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>or click to browse</div>
                    </>}
              </div>

              {/* Password */}
              <div className="field" style={{marginTop:14}}>
                <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span>PDF Password</span>
                  <button onClick={()=>setShowPwd(v=>!v)}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:12,
                      color:'var(--accent-ink)',fontWeight:600,fontFamily:'var(--font)',padding:0}}>
                    {showPwd?'Hide':'Show hint'}
                  </button>
                </label>
                <div style={{position:'relative'}}>
                  <input type="text" value={password} placeholder="Leave blank if no password"
                    onChange={e=>{setPassword(e.target.value);setErr('');}}
                    onKeyDown={e=>e.key==='Enter'&&file&&parse()}
                    style={{width:'100%',paddingRight:36}}/>
                </div>
                {showPwd && (
                  <div style={{marginTop:8,padding:'10px 14px',background:'var(--surface-2)',
                    border:'1px solid var(--line)',borderRadius:10,fontSize:12,lineHeight:1.8,color:'var(--muted)'}}>
                    <strong style={{color:'var(--ink)'}}>Typical passwords:</strong><br/>
                    <span style={{display:'block',marginTop:4}}>
                      CDSL / NSDL CAS:&nbsp;
                      <code style={{color:'var(--accent-ink)'}}>your PAN in lowercase</code>
                      &nbsp;(e.g. <code>abcde1234f</code>)
                    </span>
                    <span style={{display:'block'}}>
                      CAMS CAS:&nbsp;
                      <code style={{color:'var(--accent-ink)'}}>first 4 chars of email + date of birth</code>
                      &nbsp;(e.g. <code>ankuDDMMYYYY</code>)
                    </span>
                    <span style={{display:'block'}}>
                      No password?&nbsp; Leave the field blank.
                    </span>
                  </div>
                )}
              </div>

              {err && (
                <div style={{display:'flex',gap:7,alignItems:'flex-start',color:'var(--loss)',fontSize:13,marginTop:6}}>
                  <AlertTriangle size={14} style={{flexShrink:0,marginTop:2}}/>{err}
                </div>
              )}
            </>
          ) : (
            /* ── Preview ── */
            <>
              {/* Investor info */}
              {parsed.investor?.name && (
                <div style={{display:'flex',gap:16,alignItems:'center',padding:'10px 14px',
                  background:'var(--surface-2)',border:'1px solid var(--line)',
                  borderRadius:12,marginBottom:14,fontSize:13}}>
                  <div style={{fontWeight:700,color:'var(--ink)'}}>{parsed.investor.name}</div>
                  {parsed.investor.pan && <div style={{color:'var(--muted)',fontFamily:'monospace'}}>{parsed.investor.pan}</div>}
                  {parsed.investor.email && <div style={{color:'var(--muted)'}}>{parsed.investor.email}</div>}
                </div>
              )}

              {/* Holdings split */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                {[
                  {label:'Mutual Funds', count:parsed.mf.length,    icon:'📈', col:'var(--accent-ink)'},
                  {label:'Equity / ETF', count:parsed.equity.length, icon:'🏦', col:'var(--gain)'},
                ].map(s=>(
                  <div key={s.label} style={{padding:'12px 16px',background:'var(--surface-2)',
                    border:'1px solid var(--line)',borderRadius:12,textAlign:'center'}}>
                    <div style={{fontSize:24,marginBottom:4}}>{s.icon}</div>
                    <div style={{fontSize:22,fontWeight:900,color:s.col}}>{s.count}</div>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em'}}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {parsed.warnings?.filter(w=>w).map((w,i)=>(
                <div key={i} className="note" style={{marginBottom:8,fontSize:12,padding:'8px 12px'}}>
                  <AlertTriangle size={13}/><div>{w}</div>
                </div>
              ))}

              {/* Holdings table */}
              <div style={{maxHeight:260,overflow:'auto',border:'1px solid var(--line)',borderRadius:12,marginBottom:14}}>
                <HoldPreviewTable holdings={allHoldings}/>
              </div>

              {/* Mode selector */}
              <div style={{display:'flex',gap:20}}>
                {[['append','Add to my portfolio'],['replace','Replace everything']].map(([v,label])=>(
                  <label key={v} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontWeight:600,fontSize:14}}>
                    <input type="radio" checked={mode===v} onChange={()=>setMode(v)} style={{accentColor:'var(--accent)'}}/>
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={parsed ? ()=>setParsed(null) : onClose}>
            {parsed ? '← Back' : 'Cancel'}
          </button>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            {parsing && <span style={{fontSize:12,color:'var(--muted)',display:'flex',alignItems:'center',gap:6}}><Loader size={14} className="spin"/>Parsing…</span>}
            {!parsed
              ? <button className="btn btn-pri" disabled={!file||parsing} onClick={parse}>
                  <Upload size={14}/> Parse CAS
                </button>
              : <button className="btn btn-pri" disabled={allHoldings.length===0}
                  onClick={()=>onApply(allHoldings, mode)}>
                  <Check size={14}/> Import {allHoldings.length} holding{allHoldings.length!==1?'s':''}
                </button>}
          </div>
        </div>

      </div>
    </div>
  );
}

function MadeSection({ recs, setRecs, recipientName, reach, contacts, groups, assetClasses, setAssetClasses, holdings, me, onReload, globalSearch }) {
  const isMobile = useIsMobile();
  const [q,setQ]=useState(""); const [fCls,setFCls]=useState("all"),[fMoney,setFMoney]=useState("all"),[fHorizon,setFHorizon]=useState("all");
  useEffect(()=>{ setQ(globalSearch||""); },[globalSearch]);
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
      : isMobile
      ? <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.map(r=>{
            const isBuy=(r.recType||'Buy')==='Buy';
            const recoRet=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
            const cur=r.currency||'INR';
            return (
              <div key={r.id} className="card" style={{padding:'14px 16px',borderLeft:'3px solid '+(isBuy?'var(--gain)':'var(--loss)')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{r.assetName}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{r.ticker} · {fmtDate(r.date)}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,flexShrink:0,background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>{isBuy?'Buy':'Sell'}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Reco Price',r.priceAt?fmt(r.priceAt,cur):'—'],['Current',r.price?fmt(r.price,cur):'—'],['Return',r.priceAt?fmtPct(recoRet):'—']].map(([label,val],i)=>(
                    <div key={i} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:i===2?(recoRet>=0?'var(--gain)':'var(--loss)'):'var(--ink)'}}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {r.horizon&&<span className="pill accent" style={{fontSize:10}}>{r.horizon}</span>}
                    {r.conviction&&<ConvBadge level={r.conviction}/>}
                    {(r.recipients?.length||0)>0&&<span style={{fontSize:10,color:'var(--muted)'}}>Sent to {reach(r.recipients)} people</span>}
                    {r.exit&&<span className="pill loss" style={{fontSize:10}}><LogOut size={10}/> Exited</span>}
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <button className="iconbtn" title="Share" onClick={()=>setShare(r)}><Share2 size={13}/></button>
                    {!r.exit&&<button className="iconbtn" title="Mark exit" onClick={()=>toggleExit(r)} style={{color:'var(--muted)'}}><LogOut size={13}/></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      : <div className="card">
          <div className="card-body" style={{padding:"6px 0"}}>
            <div className="tscroll">
            <table className="grid" style={{width:"100%"}}>
              <thead><tr>
                <SortTh label="Asset" k="assetName" sort={sort} setSort={setSort}/>
                <SortTh label="Date" k="date" sort={sort} setSort={setSort}/>
                <SortTh label="Reco Price" k="reco" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Current" k="cur" sort={sort} setSort={setSort} align="right"/>
                <SortTh label="Return" k="ret" sort={sort} setSort={setSort} align="right"/>
                <th>Status</th>
                <SortTh label="Horizon" k="horizon" sort={sort} setSort={setSort}/>
                <th title="Likes · Dislikes from recipients">React</th>
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
                    <td style={{textAlign:"right"}} className="tnum">{fmt(r.price)}</td>
                    <td style={{textAlign:"right",fontWeight:700}} className={"tnum nowrap "+(itm?"pos":"neg")}>{fmtPct(ret(r))}</td>
                    <td><Money itm={itm}/></td>
                    <td>{r.horizon?<span className="pill accent" style={{fontSize:11}}>{r.horizon}</span>:<span className="muted">—</span>}</td>
                    {/* Reactions — likes.length / dislikes.length are arrays from getMyMadeRecos */}
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <ThumbsUp size={13} color="var(--gain)"/>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--gain)",minWidth:14}}>{r.likes?.length||0}</span>
                        <ThumbsDown size={13} color="var(--loss)" style={{marginLeft:2}}/>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--loss)",minWidth:14}}>{r.dislikes?.length||0}</span>
                      </div>
                    </td>
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
            </div>{/* /tscroll */}
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

      <div className="field"><label><span>Asset class</span></label>
        <select value={cls} onChange={e=>setCls(e.target.value)}>{assetClasses.map(c=><option key={c}>{c}</option>)}</select></div>

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

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",columnGap:14,rowGap:0}}>
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
function Sharing({ sharing, setSharing, configs, holdings, contacts, groups, feedConfigOptions, userFeedPrefs, setUserFeedPrefs, effectiveFeedConfig, setEffectiveFeedConfig, myId }) {
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

    {/* ── Feed Settings ── */}
    {feedConfigOptions.filter(o=>o.admin_enabled).length > 0 && (
      <div className="card" style={{marginTop:18}}>
        <div className="card-head"><span style={{display:'flex',gap:8,alignItems:'center'}}><Flame size={16}/> Feed Settings</span></div>
        <div className="card-body">
          <p style={{fontSize:13,color:'var(--ink-soft)',marginBottom:16,lineHeight:1.6}}>
            Personalise what appears in your recommendation feed. Options marked 🔒 are required by the platform and cannot be turned off.
          </p>
          {['sources','ranking','filters'].map(cat=>{
            const opts = feedConfigOptions.filter(o=>o.admin_enabled && o.category===cat);
            if(!opts.length) return null;
            const catLabel={sources:'Feed Sources',ranking:'Ranking',filters:'Filters'};
            return (
              <div key={cat} style={{marginBottom:18}}>
                <div className="cap" style={{marginBottom:10}}>{catLabel[cat]}</div>
                {opts.map(o=>{
                  const isLocked = o.always_on;
                  const currentVal = isLocked ? true
                    : (o.key in userFeedPrefs ? userFeedPrefs[o.key] : o.default_on);
                  const togglePref = async () => {
                    if(isLocked) return;
                    const next = !currentVal;
                    const newPrefs = {...userFeedPrefs,[o.key]:next};
                    setUserFeedPrefs(newPrefs);
                    // Recompute effective
                    const eff = {};
                    feedConfigOptions.forEach(x=>{
                      if(!x.admin_enabled){eff[x.key]=false;return;}
                      if(x.always_on){eff[x.key]=true;return;}
                      eff[x.key]=(x.key in newPrefs)?newPrefs[x.key]:x.default_on;
                    });
                    setEffectiveFeedConfig(eff);
                    if(sql&&myId){
                      sql`INSERT INTO user_feed_preferences (user_id, config_key, enabled)
                          VALUES (${myId}, ${o.key}, ${next})
                          ON CONFLICT (user_id, config_key) DO UPDATE SET enabled=${next}, updated_at=now()`
                        .catch(console.warn);
                    }
                  };
                  return (
                    <div key={o.key} style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:14,padding:'10px 0',borderBottom:'1px solid var(--line)'}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                          {o.label}
                          {isLocked && <span title="Required by platform" style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)'}}>🔒 Required</span>}
                        </div>
                        <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{o.description}</div>
                      </div>
                      <div className={"sw"+(currentVal?" on":"")}
                        style={{width:36,height:20,flexShrink:0,marginTop:2,opacity:isLocked?.5:1,cursor:isLocked?'not-allowed':'pointer'}}
                        onClick={togglePref}>
                        <div className="knob" style={{width:14,height:14,top:3}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    )}
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

const SOCIAL_BRAND = {
  twitter:   { active:'rgba(29,161,242,.18)',  icon:'#1DA1F2', border:'rgba(29,161,242,.45)' },
  linkedin:  { active:'rgba(10,102,194,.2)',   icon:'#0A66C2', border:'rgba(10,102,194,.45)' },
  telegram:  { active:'rgba(38,165,228,.18)',  icon:'#26A5E4', border:'rgba(38,165,228,.45)' },
  instagram: { active:'rgba(225,48,108,.18)',  icon:'#E1306C', border:'rgba(225,48,108,.45)' },
};

function SocialIconBtn({ platform, url }) {
  const brand = SOCIAL_BRAND[platform] || {};
  const hasBrand = url && brand.icon;
  const inner = (
    <div style={{
      width:34, height:34, borderRadius:9,
      background: hasBrand ? brand.active : url ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)',
      border: `1px solid ${hasBrand ? brand.border : 'rgba(255,255,255,.1)'}`,
      display:'flex', alignItems:'center', justifyContent:'center',
      cursor: url ? 'pointer' : 'default',
      transition:'all .15s',
    }}
    onMouseEnter={e=>{ if(url) e.currentTarget.style.background = hasBrand ? brand.active.replace('.18','.32').replace('.2','.32') : 'rgba(255,255,255,.18)'; }}
    onMouseLeave={e=>{ e.currentTarget.style.background = hasBrand ? brand.active : url ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)'; }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill={hasBrand ? brand.icon : url ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.2)'}>
        <path d={SOCIAL_PATHS[platform]}/>
      </svg>
    </div>
  );
  if (!url) return inner;
  return <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:'none'}}>{inner}</a>;
}

/* ─── ICI Donut ─────────────────────────────────────────────────────────────── */
function IciDonut({ score, band }) {
  const SIZE = 200;
  const cx = SIZE / 2, cy = SIZE / 2;
  const r = 82;
  const circ    = 2 * Math.PI * r;
  const pct     = Math.max(0, Math.min(100, score || 0));
  const filled  = (pct / 100) * circ;          // exact score% of circumference
  const col  = pct >= 70 ? '#4ade80' : pct >= 50 ? '#a78bfa' : pct >= 30 ? '#fbbf24' : '#f87171';
  const dark = pct >= 70 ? '#052e16' : pct >= 50 ? '#2e1065' : pct >= 30 ? '#451a03' : '#3b0a14';
  const glow = pct >= 70 ? 'rgba(74,222,128,.6)' : pct >= 50 ? 'rgba(167,139,250,.6)' : pct >= 30 ? 'rgba(251,191,36,.6)' : 'rgba(248,113,113,.6)';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,flexShrink:0}}>
      <div style={{position:'relative',width:SIZE,height:SIZE}}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Outer halo ring */}
          <circle cx={cx} cy={cy} r={r+15} fill="none" stroke={col} strokeWidth={1} opacity={.12}/>
          {/* Inner dark fill of donut hole */}
          <circle cx={cx} cy={cy} r={r} fill={dark} opacity={.55}/>
          {/* Track — full grey ring */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={16}/>
          {/* Score arc — starts at 12 o'clock via rotate(-90), fills exactly score% clockwise */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={16}
              strokeDasharray={`${filled} ${circ - filled}`}
              strokeLinecap="round"
              style={{filter:`drop-shadow(0 0 10px ${glow})`}}/>
          </g>
          {/* Centre text */}
          <text x={cx} y={cy - 11} textAnchor="middle" dominantBaseline="middle"
            fontSize={46} fontWeight={900} fill="#fff"
            fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
            letterSpacing="-2">{score}</text>
          <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle"
            fontSize={13} fill="rgba(255,255,255,.35)"
            fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">/100</text>
        </svg>
      </div>
      <div style={{fontSize:13,fontWeight:800,color:col,letterSpacing:'.1em',textTransform:'uppercase',textShadow:`0 0 16px ${glow}`}}>{band}</div>
    </div>
  );
}

/* ─── Small helpers ─────────────────────────────────────────────────────────── */
function ScoreBox({ val, label, big, col, mobile }) {
  return (
    <div style={{
      textAlign:'center',
      padding: mobile ? '9px 6px' : '13px 10px',
      background:'var(--surface-2)',
      border:'1px solid var(--line)',
      borderRadius:12,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      minWidth:0,overflow:'hidden',
    }}>
      <div style={{
        fontSize: big ? (mobile?19:24) : (mobile?14:18),
        fontWeight:800,
        color:col||'var(--ink)',
        fontFamily:'var(--font)',
        letterSpacing: big?'-.5px':'-.2px',
        lineHeight:1,
        maxWidth:'100%',
        overflow:'hidden',
        textOverflow:'ellipsis',
        whiteSpace:'nowrap',
      }}>{val}</div>
      <div style={{
        fontSize: mobile ? 9.5 : 11,
        color:'var(--muted)',
        marginTop:mobile?3:5,
        fontWeight:600,
        textTransform:'uppercase',
        letterSpacing:'.04em',
        lineHeight:1.2,
        wordBreak:'break-word',
      }}>{label}</div>
    </div>
  );
}

function RetBadge({ pct, size=13 }) {
  const n=Number(pct||0), pos=n>=0;
  return <span style={{fontWeight:800,fontSize:size,color:pos?'var(--gain)':'var(--loss)',letterSpacing:'-.2px'}}>{pos?'+':''}{n.toFixed(1)}%</span>;
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
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!isMobile && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target) && e.target !== anchorEl) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const url = fromUsername
    ? `${window.location.origin}${window.location.pathname}#/investor/${fromUsername}/reco/${reco.id}`
    : null;
  const waMsg = url ? encodeURIComponent(`Check out ${reco.ticker} (${reco.assetName}) on InvestorCircle:\n${url}`) : null;
  const copyLink = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => { setCopied(false); onClose(); }, 1600); });
  };

  const content = (
    <>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Share2 size={15} color="var(--accent)" /> Share this idea
      </div>
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 8 }}
        onClick={() => { onForward(); onClose(); }}>
        <Forward size={14} /> Forward to your contacts
      </button>
      {url ? (<>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4, marginBottom: 10 }}>
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
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={onClose}>Cancel</button>
    </>
  );

  // ── Mobile: full-screen bottom sheet ──────────────────────────────────
  if (isMobile) return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }}/>
      <div ref={popRef} style={{ position: 'relative', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', boxShadow: '0 -8px 40px rgba(0,0,0,.28)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 18px' }}/>
        {content}
      </div>
    </div>,
    document.body
  );

  // ── Desktop: floating popover ─────────────────────────────────────────
  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '16px 18px', minWidth: 290, maxWidth: 340, fontFamily: 'var(--font)' }} onClick={e => e.stopPropagation()}>
      {content}
    </div>,
    document.body
  );
}


function SharePublicPopover({ reco, username, onClose, anchorEl }) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!isMobile && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    const h = (e) => { if (popRef.current && !popRef.current.contains(e.target) && e.target !== anchorEl) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const url = username
    ? `${window.location.origin}${window.location.pathname}#/investor/${username}/reco/${reco.id}`
    : null;
  const waMsg = url ? encodeURIComponent(`Check out ${reco.ticker} (${reco.assetName}) by @${username} on InvestorCircle:\n${url}`) : null;
  const copyLink = () => { if (!url) return; navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => { setCopied(false); onClose(); }, 1600); }); };

  const noUsername = (
    <div ref={popRef}>
      <div className="note warn" style={{ fontSize: 12 }}><AlertTriangle size={13} /><div>Set a username in your profile first.</div></div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={onClose}>Close</button>
    </div>
  );

  const content = username ? (
    <>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={15} color="var(--accent)" /> Share publicly</div>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px', fontSize: 11, color: 'var(--muted)', marginBottom: 12, wordBreak: 'break-all', lineHeight: 1.5 }}>{url}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-pri btn-sm" style={{ justifyContent: 'center' }} onClick={copyLink}>{copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}</button>
        <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm" style={{ justifyContent: 'center', textDecoration: 'none' }} onClick={onClose}><span style={{ fontSize: 15, lineHeight: 1 }}>💬</span> Share on WhatsApp</a>
      </div>
      <div className="muted small" style={{ marginTop: 10, fontSize: 11 }}>Anyone with this link can view — no login needed.</div>
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={onClose}>Cancel</button>
    </>
  ) : noUsername;

  // ── Mobile: full-screen bottom sheet ──────────────────────────────────
  if (isMobile) return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }}/>
      <div ref={popRef} style={{ position: 'relative', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', boxShadow: '0 -8px 40px rgba(0,0,0,.28)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 18px' }}/>
        {content}
      </div>
    </div>,
    document.body
  );

  // ── Desktop: floating popover ─────────────────────────────────────────
  if (!pos) return null;
  return createPortal(
    <div ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '16px 18px', minWidth: 290, maxWidth: 340, fontFamily: 'var(--font)' }} onClick={e => e.stopPropagation()}>
      {content}
    </div>,
    document.body
  );
}

/* ─── Main PublicProfilePage ─────────────────────────────────────────────────── */
/* ── ProfileErrorBoundary — catches render errors so the page never goes blank ── */
class ProfileErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error('PublicProfile render error:', err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:'40px 24px',textAlign:'center'}}>
          <AlertTriangle size={32} color="var(--loss)" style={{marginBottom:14}}/>
          <div style={{fontWeight:700,fontSize:16,marginBottom:8,color:'var(--ink)'}}>Profile failed to render</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:16,maxWidth:440,margin:'0 auto 16px'}}>
            Something went wrong building the profile view. The error below may help diagnose the issue.
          </div>
          <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,
              padding:'12px 16px',fontSize:12,fontFamily:'monospace',color:'var(--loss)',textAlign:'left',
              maxWidth:560,margin:'0 auto',wordBreak:'break-all'}}>
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PublicProfilePage({ username, recoId, viewerUser, viewerConnections, viewerIsAdmin=false, viewerForClaim=false, onClaimClick=null, mode, isOwnProfile, patchProfile, onBack, onRequestConnect }) {
  const isMobile = useIsMobile();
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);
  const [recTab,      setRecTab]      = useState('All');
  const [connecting,  setConnecting]  = useState(false);
  const [connected,   setConnected]   = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [expandedId,  setExpandedId]  = useState(recoId||null);
  const expandedRef = useRef(null);

  // Public URL — defined early so it's always in scope for both shells
  const profileUrl = `${window.location.origin}${window.location.pathname}#/investor/${username}`;
  const copyLink   = () => navigator.clipboard.writeText(profileUrl)
    .then(()=>{ setCopied(true); setTimeout(()=>setCopied(false), 2000); });

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

  const [claimInfo,       setClaimInfo]       = useState(null); // { is_unclaimed, claim_status, claim_token }
  const [adminLinkCopied, setAdminLinkCopied] = useState(false);
  // Fetch viewer's admin status independently — avoids race condition where ME
  // (loaded from Neon after Firebase auth) isn't available yet when this page renders.
  const [isViewerAdmin,   setIsViewerAdmin]   = useState(false);

  useEffect(()=>{
    setLoading(true); setNotFound(false); setData(null); setClaimInfo(null);
    dbGetPublicProfile(username).then(d=>{
      if(!d) setNotFound(true); else setData(d);
      setLoading(false);
    }).catch(()=>{ setNotFound(true); setLoading(false); });
    // Separately fetch claim meta so public profile works without modifying db.js
    if (sql) sql`SELECT is_unclaimed, claim_status, claim_token FROM user_profiles WHERE username=${username} LIMIT 1`
      .then(rows=>{ if(rows[0]) setClaimInfo(rows[0]); }).catch(()=>{});

  // Fetch viewer's own admin flag directly — don't wait for ME in App.jsx parent
  // (ME loads async from Neon after Firebase auth; this page may render before it's ready)
    if (sql && viewerUser?.uid) sql`SELECT is_admin FROM user_profiles WHERE id=${viewerUser.uid} LIMIT 1`
      .then(rows=>{ if(rows[0]?.is_admin) setIsViewerAdmin(true); }).catch(()=>{});
  },[username, viewerUser?.uid]);

  useEffect(()=>{
    if(recoId&&data&&expandedRef.current)
      setTimeout(()=>expandedRef.current?.scrollIntoView({behavior:'smooth',block:'center'}),200);
  },[recoId,data]);

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

  // Connection status relative to the viewer
  const profileUserId = data?.profile?.id;
  const connStatus = useMemo(()=>{
    if(!profileUserId||!viewerConnections?.length) return 'none';
    const c = viewerConnections.find(c=>c.user_id===profileUserId);
    return c?.status||'none';
  },[profileUserId, viewerConnections]);
  useEffect(()=>{ if(connStatus==='accepted') setConnected(true); },[connStatus]);

  const handleConnect = async()=>{
    setConnecting(true);
    await onRequestConnect(data.profile.id);
    setConnected(true);
    setConnecting(false);
  };

  // ── Content renderer ──────────────────────────────────────────────────────
  const renderContent=()=>{
    if(loading) return <div style={{textAlign:'center',padding:'60px 0',color:'var(--muted)'}}><Loader size={28} className="spin" style={{marginBottom:14}}/><div>Loading public investment record…</div></div>;
    if(notFound) return <div style={{textAlign:'center',padding:'60px 0'}}><Globe size={36} color="var(--muted)" style={{marginBottom:14}}/><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Record not found</div><div className="muted small">@{username} hasn't set up a public profile yet.</div></div>;
    if(!data) return null;
    try {

    // ── ClaimBanner — shown for unclaimed profiles ──────────────────────────
    const isUnclaimed  = claimInfo?.is_unclaimed === true;
    const claimStatus  = claimInfo?.claim_status;

    if (isUnclaimed) {
      const isClaimer = claimStatus === 'pending_approval';
      const hasToken  = !!localStorage.getItem('mic_claim_token');

      // ── ADMIN: bypass restricted view — show full profile with preview banner ──
      // Admin needs to see all seeded recommendations before sharing the claim link.
      // A sticky banner at the top makes the admin context explicit.
      if (isViewerAdmin || viewerForClaim) {
        // fall through to full profile render below — respective banner injected there
      } else {
        // ── Non-admin: restricted "unclaimed" page ────────────────────────────
        return (
          <div>
            <div style={{background: isClaimer ? 'rgba(109,93,245,.08)' : 'rgba(251,191,36,.08)', border:`1px solid ${isClaimer?'rgba(109,93,245,.35)':'rgba(251,191,36,.5)'}`, borderRadius:14, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'flex-start', gap:12}}>
              <div style={{fontSize:20, flexShrink:0}}>{isClaimer ? '⏳' : '👤'}</div>
              <div style={{flex:1}}>
                {isClaimer
                  ? <><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>Claim pending admin approval</div><div style={{fontSize:13,color:'var(--muted)',lineHeight:1.5}}>Your claim for @{username} is under review. You'll receive an email once approved.</div></>
                  : hasToken
                    ? <><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>This is your unclaimed profile</div><div style={{fontSize:13,color:'var(--muted)',lineHeight:1.5}}>You have a claim link for this profile. To claim it, <strong>sign out first</strong> then open your claim link again.</div></>
                    : <><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>This profile is unclaimed</div><div style={{fontSize:13,color:'var(--muted)',lineHeight:1.5}}>This profile was created by the myInvestorCircle team. If you're {data?.profile?.full_name||username}, claim it using your personal invite link.</div></>
                }
              </div>
            </div>
            <div className="card" style={{padding:'20px 24px',marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <div className="av" style={{width:56,height:56,fontSize:20,flexShrink:0,background:'var(--grad)'}}>{initialsOf(data?.profile?.full_name||username)}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:20}}>{data?.profile?.full_name}</div>
                  <div style={{fontSize:13,color:'var(--muted)'}}>@{username}</div>
                </div>
              </div>
              {data?.profile?.bio && <div style={{fontSize:13,marginTop:14,color:'var(--ink)',lineHeight:1.6,paddingTop:14,borderTop:'1px solid var(--line)'}}>{data.profile.bio}</div>}
            </div>
            <div style={{fontSize:12,color:'var(--muted)',textAlign:'center'}}>The full track record and recommendations will be visible once the profile is claimed and approved.</div>
          </div>
        );
      }
    }
    // Spread-merge ({ ...defaults, ...(data.x||{}) }) fails because DB null values
    // overwrite the defaults; ?? correctly treats null/undefined as "use default".
    const d_p = data.profile  || {};
    const d_s = data.summary  || {};
    const d_l = data.live     || {};
    const d_r = data.realized || {};

    const profile = {
      id: d_p.id ?? '', first_name: d_p.first_name ?? '', last_name: d_p.last_name ?? '',
      full_name: d_p.full_name ?? '', email: d_p.email ?? '', bio: d_p.bio ?? '',
      avatar_color: d_p.avatar_color ?? '', username: d_p.username ?? '',
      connection_count: d_p.connection_count ?? 0, group_count: d_p.group_count ?? 0,
      created_at: d_p.created_at ?? null,
      registration_status: d_p.registration_status ?? 'self_directed',
      sebi_approval_status: d_p.sebi_approval_status ?? 'not_applied',
      sebi_reg_number: d_p.sebi_reg_number ?? null,
      twitter_url: d_p.twitter_url ?? '', linkedin_url: d_p.linkedin_url ?? '',
      telegram_url: d_p.telegram_url ?? '', instagram_url: d_p.instagram_url ?? '',
    };
    const summary = {
      total:         d_s.total         ?? 0,
      closed:        d_s.closed        ?? 0,
      active:        d_s.active        ?? 0,
      years_history: d_s.years_history ?? 0,
    };
    const live = {
      count:            d_l.count            ?? 0,
      in_profit:        d_l.in_profit        ?? 0,
      in_loss:          d_l.in_loss          ?? 0,
      avg_return:       d_l.avg_return       ?? 0,
      avg_holding_days: d_l.avg_holding_days ?? 0,
      best:             d_l.best             ?? null,
      worst:            d_l.worst            ?? null,
    };
    const realized = {
      count:            d_r.count            ?? 0,
      hit_rate_pct:     d_r.hit_rate_pct     ?? 0,
      median_return:    d_r.median_return     ?? 0,
      avg_return:       d_r.avg_return        ?? 0,
      avg_holding_days: d_r.avg_holding_days  ?? 0,
      win_count:        d_r.win_count         ?? 0,
      loss_count:       d_r.loss_count        ?? 0,
      risk_adjusted:    d_r.risk_adjusted      ?? 0,
      best:             d_r.best               ?? null,
    };
    const sectors = Array.isArray(data.sectors) ? data.sectors : [];
    const recos   = Array.isArray(data.recos)   ? data.recos   : [];
    const displayName=[profile.first_name,profile.last_name].filter(Boolean).join(' ')||profile.full_name||username;
    const memberSince=profile.created_at?new Date(profile.created_at).toLocaleDateString('en-IN',{month:'short',year:'numeric'}):null;

    // Guard computeIci — it may throw or return without components on edge cases
    let ici = { score:0, band:'New', components:[] };
    try {
      const result = computeIci({
        years_history:       Number(summary.years_history)  || 0,
        total:               Number(summary.total)          || 0,
        hit_rate_pct:        Number(realized.hit_rate_pct)  || 0,
        median_return:       Number(realized.median_return)  || 0,
        risk_adjusted_return:Number(realized.risk_adjusted) || 0,
      });
      if (result) ici = { ...ici, ...result, components: Array.isArray(result.components) ? result.components : [] };
    } catch(_) {}

    const filteredRecos=recTab==='All'?recos:recos.filter(r=>r.status===recTab);
    const recoIdNotPublic=recoId&&data&&!recos.find(r=>r.id===recoId);

    const showAddBtn=!isOwnProfile&&viewerUser&&!connected&&connStatus!=='pending';
    const showPending=!isOwnProfile&&viewerUser&&connStatus==='pending';
    const showConnected=!isOwnProfile&&viewerUser&&connected;
    const showJoinBtn=!isOwnProfile&&!viewerUser;

    // Admin preview helpers — computed inside renderContent from component-level claimInfo state.
    // adminLinkCopied state lives at component level (above) to comply with React rules of hooks.
    const adminClaimLink = claimInfo?.claim_token
      ? `${window.location.origin}${window.location.pathname}?claim_token=${claimInfo.claim_token}`
      : null;
    const copyAdminLink = () => {
      if (!adminClaimLink) return;
      navigator.clipboard.writeText(adminClaimLink)
        .then(()=>{ setAdminLinkCopied(true); setTimeout(()=>setAdminLinkCopied(false),2000); })
        .catch(()=>{});
    };

    return (
      <>
        {/* ── Claim invitation banner — for creator visiting via claim link ── */}
        {isUnclaimed && viewerForClaim && (
          <div style={{
            background:'linear-gradient(135deg,#6d5df5 0%,#a855f7 100%)',
            borderRadius:14, padding:'18px 20px', marginBottom:20,
          }}>
            <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontWeight:800,fontSize:16,color:'#fff',marginBottom:4}}>
                  🎉 Your investor profile is ready to claim
                </div>
                <div style={{fontSize:13,color:'rgba(255,255,255,.8)',lineHeight:1.5}}>
                  This is exactly how your profile will look once live.
                  All seeded recommendations are linked — claim it to go live.
                </div>
              </div>
              <button
                onClick={onClaimClick}
                style={{
                  background:'#fff', color:'#6d5df5', fontWeight:800,
                  fontSize:13, padding:'10px 22px', borderRadius:10,
                  border:'none', cursor:'pointer',
                  boxShadow:'0 4px 12px rgba(0,0,0,.2)', whiteSpace:'nowrap',
                  width: '100%', maxWidth: 280,  // full-width on mobile, capped on desktop
                }}
              >
                <UserPlus size={14} style={{verticalAlign:-2,marginRight:7}}/>Claim this profile
              </button>
            </div>
          </div>
        )}

        {/* ── Admin-only preview banner for unclaimed profiles ── */}
        {isUnclaimed && isViewerAdmin && (
          <div style={{
            background:'rgba(251,146,60,.08)',
            border:'1.5px solid rgba(251,146,60,.45)',
            borderRadius:14, padding:'14px 18px', marginBottom:20,
          }}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontSize:13,fontWeight:800,color:'#ea580c'}}>
                    🔧 Admin preview
                  </span>
                  <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                    background: claimStatus==='pending_approval'?'rgba(109,93,245,.15)':'rgba(251,191,36,.15)',
                    color:      claimStatus==='pending_approval'?'var(--accent)':'#92400e',
                  }}>
                    {claimStatus==='pending_approval' ? '⏳ Claim pending approval' : '👤 Unclaimed'}
                  </span>
                </div>
                <div style={{fontSize:12,color:'#92400e',lineHeight:1.55}}>
                  This view is <strong>only visible to admins</strong>. The public sees a restricted version without recommendations. Review all seeded content below before sharing the claim link.
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
                {adminClaimLink ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={copyAdminLink}
                    style={{fontSize:11,borderColor:'rgba(251,146,60,.4)',color:'#ea580c'}}
                  >
                    {adminLinkCopied ? <><Check size={12}/> Copied!</> : <><Copy size={12}/> Copy claim link</>}
                  </button>
                ) : (
                  <span style={{fontSize:11,color:'var(--muted)',fontStyle:'italic'}}>
                    Claim link used / pending
                  </span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={()=>{ window.location.hash=''; setTimeout(()=>{ window.location.hash=''; },50); }}
                  style={{fontSize:11,borderColor:'rgba(251,146,60,.4)',color:'#ea580c'}}
                  title="Go to Admin → Creators to manage this profile"
                >
                  <Database size={12}/> Admin panel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── IDENTITY CARD ── */}
        <div style={{background:'#0f1117',borderRadius:18,overflow:'hidden',marginBottom:16,border:'1px solid rgba(255,255,255,.07)',boxShadow:'0 8px 32px rgba(0,0,0,.4)'}}>

          {/* ── Hero: strict 50-50 layout — left = avatar+bio, right = ICI ── */}
          <div style={{display:'flex', flexWrap:'wrap', padding:'18px 28px 0', gap:24, alignItems:'stretch'}}>

            {/* ── LEFT 50%: avatar + bio ── */}
            <div style={{
              ...(isMobile ? {flex:'0 0 100%'} : {flex:'1 1 0', maxWidth:'calc(50% - 12px)'}),
              minWidth:0, display:'flex', gap:18, alignItems:'flex-start',
            }}>
              {/* Avatar */}
              <div style={{width:76,height:76,borderRadius:20,background:profile.avatar_color||'linear-gradient(135deg,#6d5df5,#cf52d8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:900,color:'#fff',flexShrink:0,boxShadow:'0 4px 20px rgba(109,93,245,.4)',letterSpacing:'-.5px'}}>
                {initialsOf(displayName)}
              </div>

              {/* Bio content */}
              <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:10}}>
                {/* Name + badges */}
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{fontSize:22,fontWeight:900,color:'#fff',letterSpacing:'-.6px',lineHeight:1.1}}>{displayName}</span>
                  {(()=>{
                    const status=profile.registration_status||'self_directed';
                    const approved=profile.sebi_approval_status==='approved';
                    const isSebi=['sebi_ra','sebi_ria'].includes(status);
                    const label=isSebi&&approved?(status==='sebi_ra'?'SEBI RA':'SEBI RIA'):(status==='enthusiast'?'Enthusiast':'Self-directed');
                    return <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:5,background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.75)',border:'1px solid rgba(255,255,255,.14)',textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0}}>{label}</span>;
                  })()}
                  {(()=>{
                    const status=profile.registration_status||'self_directed';
                    const approved=profile.sebi_approval_status==='approved';
                    const isSebi=['sebi_ra','sebi_ria'].includes(status);
                    if(isSebi&&approved) return <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:5,background:'rgba(21,146,78,.2)',color:'#4ade80',border:'1px solid rgba(21,146,78,.35)',textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0}}>✓ SEBI{profile.sebi_reg_number?` · ${profile.sebi_reg_number}`:''}</span>;
                    return <span style={{fontSize:10,fontWeight:800,padding:'3px 8px',borderRadius:5,background:'rgba(244,63,94,.15)',color:'#fb7185',border:'1px solid rgba(244,63,94,.3)',textTransform:'uppercase',letterSpacing:'.06em',flexShrink:0}}>Non-SEBI</span>;
                  })()}
                </div>

                {/* Username + since */}
                <div style={{fontSize:13,color:'rgba(255,255,255,.45)',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontWeight:600}}>@{username}</span>
                  {memberSince&&<><span style={{opacity:.4}}>·</span><span>Member since {memberSince}</span></>}
                </div>

                {/* Bio */}
                {profile.bio
                  ? <p style={{fontSize:14,color:'rgba(255,255,255,.75)',lineHeight:1.7,margin:0}}>{profile.bio}</p>
                  : isOwnProfile&&<p style={{fontSize:13,color:'rgba(255,255,255,.25)',fontStyle:'italic',margin:0}}>No bio yet — click Edit profile to add one.</p>}

                {/* Social icons + action buttons */}
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  {['twitter','linkedin','telegram','instagram'].map(p=>(
                    <SocialIconBtn key={p} platform={p} url={profile[`${p}_url`]}/>
                  ))}
                  {showAddBtn&&<button className="btn btn-pri btn-sm" disabled={connecting} onClick={handleConnect} style={{background:'rgba(109,93,245,.85)',border:'none',marginLeft:4}}>{connecting?<><Loader size={13} className="spin"/>Sending…</>:<><UserPlus size={13}/>Add to network</>}</button>}
                  {showPending&&<span style={{fontSize:12,color:'rgba(255,255,255,.5)',display:'flex',alignItems:'center',gap:5,marginLeft:4}}><Check size={12}/>Request sent</span>}
                  {showConnected&&<span style={{fontSize:12,color:'rgba(255,255,255,.5)',display:'flex',alignItems:'center',gap:5,marginLeft:4}}><Check size={12}/>Connected</span>}
                  {showJoinBtn&&<button className="btn btn-pri btn-sm" onClick={()=>onRequestConnect(data.profile.id)} style={{background:'rgba(109,93,245,.85)',border:'none',marginLeft:4}}><UserPlus size={13}/>Join to connect</button>}
                </div>

                {/* Edit button */}
                {isOwnProfile&&(
                  <div>
                    <button onClick={startEdit} style={{fontSize:12,fontWeight:700,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:'rgba(255,255,255,.7)',cursor:'pointer',padding:'6px 14px',borderRadius:8,display:'inline-flex',alignItems:'center',gap:6,fontFamily:'var(--font)'}}>
                      <Pencil size={12}/>Edit profile
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT 50%: ICI widget ── */}
            <div className="ici-panel" style={{
              ...(isMobile ? {flex:'0 0 100%',minWidth:0} : {flex:'1 1 0',maxWidth:'calc(50% - 12px)',minWidth:0}),
              background:'linear-gradient(145deg,#1c0d4a 0%,#160b3d 50%,#0f1130 100%)',
              border:'1px solid rgba(139,92,246,.6)',
              borderRadius:20,
              padding:'20px 24px 16px',
              boxShadow:'0 0 0 1px rgba(139,92,246,.15),0 4px 24px rgba(109,93,245,.5),0 16px 48px rgba(109,93,245,.3),inset 0 1px 0 rgba(255,255,255,.08)',
            }}>
              <div style={{fontSize:14,fontWeight:800,color:'#fff',letterSpacing:'-.2px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
                <span style={{display:'inline-flex',width:6,height:6,borderRadius:'50%',background:'#a78bfa',boxShadow:'0 0 8px #a78bfa'}}/>
                Investor Circle Credibility Index
              </div>
              <div className="ici-body" style={{display:'flex',gap:24,alignItems:'center'}}>
                <IciDonut score={ici.score} band={ici.band}/>
                <div style={{flex:1,minWidth:0}}>
                  {ici.components.map(c=>{
                    const pct=c.max>0?(c.score/c.max)*100:0;
                    const barCol=pct>=80?'#4ade80':pct>=50?'#a78bfa':pct>0?'#fbbf24':'rgba(255,255,255,.06)';
                    return (
                      <div key={c.label} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:4}}>
                          <span style={{fontSize:11.5,color:'rgba(255,255,255,.85)',fontWeight:600,flex:1,minWidth:0}}>{c.label}</span>
                          <span style={{fontSize:11.5,color:'rgba(255,255,255,.65)',fontWeight:700,flexShrink:0}}>{c.score}/{c.max}</span>
                        </div>
                        <div style={{height:4,background:'rgba(255,255,255,.08)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg,${barCol},${barCol}bb)`,borderRadius:3,transition:'width .5s ease',boxShadow:pct>0?`0 0 6px ${barCol}88`:'none'}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer strip: left 50% = stats (under bio), right 50% = learn more (under ICI) ── */}
          <div style={{display:'flex',flexWrap:'wrap',borderTop:'1px solid rgba(255,255,255,.07)',marginTop:16,background:'rgba(0,0,0,.25)'}}>

            {/* Left 50%: compact stats — visual extension of bio column */}
            <div style={{
              ...(isMobile?{flex:'0 0 100%',borderBottom:'1px solid rgba(255,255,255,.07)'}:{flex:'1 1 0',borderRight:'1px solid rgba(255,255,255,.07)'}),
              display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',padding:'9px 28px',
            }}>
              {[
                {val:profile.connection_count||0, label:'Connections'},
                {val:profile.group_count||0,      label:'Groups'},
                {val:summary.total,               label:'Total Recos'},
                {val:summary.active,              label:'Active'},
                {val:summary.closed,              label:'Closed'},
                {val:`${summary.years_history.toFixed(1)}y`, label:'History'},
              ].map((s,i)=>(
                <React.Fragment key={s.label}>
                  {i>0&&<span style={{color:'rgba(255,255,255,.1)',fontSize:12}}>·</span>}
                  <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                    <span style={{fontSize:14,fontWeight:800,color:'#fff',letterSpacing:'-.4px',fontFamily:'var(--font)'}}>{s.val}</span>
                    <span style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.35)',textTransform:'uppercase',letterSpacing:'.06em'}}>{s.label}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Right 50%: learn more — visual extension of ICI column */}
            <div style={{
              ...(isMobile?{flex:'0 0 100%'}:{flex:'1 1 0'}),
              display:'flex',alignItems:'center',justifyContent:'flex-end',padding:'9px 28px',
            }}>
              <a href="#methodology" style={{fontSize:11.5,color:'#c4b5fd',textDecoration:'none',fontWeight:600,letterSpacing:'.01em'}}>How is the ICI Score calculated? Learn More →</a>
            </div>
          </div>
        </div>

        {/* ── EDIT PROFILE MODAL ── */}
        {editing && createPortal(
          <div className="modal-overlay" style={{position:'fixed',inset:0,background:'rgba(13,14,30,.65)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'20px'}} onClick={()=>setEditing(false)}>
            <div style={{width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',background:'#16182a',borderRadius:20,border:'1px solid rgba(255,255,255,.1)',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}} onClick={e=>e.stopPropagation()}>
              {/* Modal header */}
              <div style={{padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,.08)',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'#16182a',zIndex:1,borderRadius:'20px 20px 0 0'}}>
                <div style={{fontSize:17,fontWeight:800,color:'#fff'}}>Edit Profile</div>
                <button onClick={()=>setEditing(false)} style={{background:'rgba(255,255,255,.08)',border:'none',color:'rgba(255,255,255,.7)',cursor:'pointer',width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontFamily:'inherit'}}>×</button>
              </div>

              <div style={{padding:'24px'}}>
                {/* Avatar color */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Avatar colour</div>
                <div style={{display:'flex',gap:8,marginBottom:22}}>
                  {['#6d5df5','#cf52d8','#15924e','#0ea5b7','#d97706','#e11d48','#2563eb','#64748b'].map(c=>(
                    <div key={c} onClick={()=>setEditAvatarColor(c)} style={{width:32,height:32,borderRadius:9,background:c,cursor:'pointer',border:editAvatarColor===c?'2px solid #fff':'2px solid transparent',boxSizing:'border-box',transition:'.1s',boxShadow:editAvatarColor===c?`0 0 12px ${c}88`:''}}/>
                  ))}
                  <div onClick={()=>setEditAvatarColor('')} style={{width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#6d5df5,#cf52d8)',cursor:'pointer',border:!editAvatarColor?'2px solid #fff':'2px solid transparent',boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:800}}>AUTO</div>
                </div>

                {/* Name */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Name</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                  {[{val:editFirstName,set:setEditFirstName,ph:'First name'},{val:editLastName,set:setEditLastName,ph:'Last name'}].map((f,i)=>(
                    <input key={i} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                      style={{background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'10px 13px',fontSize:14,color:'#fff',fontFamily:'var(--font)',outline:'none',boxSizing:'border-box',width:'100%'}}/>
                  ))}
                </div>

                {/* Read-only username + email — email auto-populated from auth */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                  {[{label:'Username',val:`@${username}`},{label:'Email',val:profile.email||viewerUser?.email||''}].map((f,i)=>(
                    <div key={i}>
                      <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginBottom:6,display:'flex',alignItems:'center',gap:4,fontWeight:600}}><Lock size={10}/>{f.label} <span style={{fontWeight:400,fontSize:10}}>(cannot be changed)</span></div>
                      <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:9,padding:'10px 13px',fontSize:13,color:'rgba(255,255,255,.4)',fontFamily:'inherit'}}>{f.val||<span style={{opacity:.4,fontStyle:'italic'}}>not set</span>}</div>
                    </div>
                  ))}
                </div>

                {/* Bio */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Bio</div>
                <textarea value={editBio} onChange={e=>setEditBio(e.target.value)} rows={3} maxLength={300} placeholder="Describe your investment approach…"
                  style={{width:'100%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'10px 13px',fontSize:14,color:'#fff',fontFamily:'var(--font)',resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
                <div style={{fontSize:11,color:'rgba(255,255,255,.3)',textAlign:'right',marginTop:4,marginBottom:20}}>{editBio.length}/300</div>

                {/* Social links */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Social profile links</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                  {[
                    {key:'twitter',label:'Twitter / X',ph:'https://twitter.com/username'},
                    {key:'linkedin',label:'LinkedIn',ph:'https://linkedin.com/in/username'},
                    {key:'telegram',label:'Telegram',ph:'https://t.me/username'},
                    {key:'instagram',label:'Instagram',ph:'https://instagram.com/username'},
                  ].map(s=>(
                    <div key={s.key}>
                      <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{s.label}</div>
                      <input value={editSocials[s.key]} onChange={e=>setEditSocials(p=>({...p,[s.key]:e.target.value}))} placeholder={s.ph}
                        style={{width:'100%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'9px 12px',fontSize:13,color:'#fff',fontFamily:'var(--font)',outline:'none',boxSizing:'border-box'}}/>
                    </div>
                  ))}
                </div>

                {/* Registration status */}
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Investor type</div>
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
                  {(regOptions.length ? regOptions : [
                    {code:'self_directed',label:'Self-directed Investor',description:'Invests own money independently.',requires_sebi_fields:false},
                    {code:'enthusiast',label:'Market Enthusiast',description:'Passionate about markets, shares ideas informally.',requires_sebi_fields:false},
                    {code:'sebi_ra',label:'SEBI Registered Research Analyst',description:'INH000XXXXXX format.',requires_sebi_fields:true},
                    {code:'sebi_ria',label:'SEBI Registered Investment Adviser',description:'INA000XXXXXX format.',requires_sebi_fields:true},
                  ]).map(opt=>(
                    <label key={opt.code} style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',padding:'11px 14px',borderRadius:10,background:editRegStatus===opt.code?'rgba(109,93,245,.2)':'rgba(255,255,255,.04)',border:`1px solid ${editRegStatus===opt.code?'rgba(109,93,245,.55)':'rgba(255,255,255,.08)'}`,transition:'.15s'}}>
                      <input type="radio" name="regStatus" value={opt.code} checked={editRegStatus===opt.code} onChange={()=>setEditRegStatus(opt.code)} style={{accentColor:'#6d5df5',marginTop:3,flexShrink:0}}/>
                      <div><div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{opt.label}</div><div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:2,lineHeight:1.4}}>{opt.description}</div></div>
                    </label>
                  ))}
                </div>

                {/* SEBI fields */}
                {['sebi_ra','sebi_ria'].includes(editRegStatus) && (<>
                  <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:13,color:'#fbbf24',lineHeight:1.6}}>
                    {sebiVerifyMsg || 'Your SEBI registration details will be reviewed by our team within 2–3 business days.'}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                    {[
                      {label:'SEBI Registration Number',ph:editRegStatus==='sebi_ra'?'INH000XXXXXX':'INA000XXXXXX',val:editSebiNum,set:setEditSebiNum},
                      {label:'Registration Valid Till',ph:'',val:editSebiTill,set:setEditSebiTill,type:'date'},
                      {label:'Firm / Employer Name (optional)',ph:'e.g. XYZ Securities',val:editSebiFirm,set:setEditSebiFirm},
                    ].map((f,i)=>(
                      <div key={i} style={i===2?{gridColumn:'1/span 2'}:{}}>
                        <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{f.label}</div>
                        <input type={f.type||'text'} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                          style={{width:'100%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',borderRadius:9,padding:'10px 13px',fontSize:13,color:'#fff',fontFamily:'var(--font)',outline:'none',boxSizing:'border-box',colorScheme:'dark'}}/>
                      </div>
                    ))}
                  </div>
                </>)}

                {/* Footer buttons */}
                <div style={{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:4,borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:16}}>
                  <button onClick={()=>setEditing(false)} style={{padding:'10px 20px',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:'#fff',fontFamily:'var(--font)'}}>
                    Cancel
                  </button>
                  <button className="btn btn-pri" disabled={savingEdit} onClick={saveEdit} style={{padding:'10px 24px',fontSize:14}}>
                    {savingEdit?<><Loader size={14} className="spin"/> Saving…</>:<><Check size={14}/> Save changes</>}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:14,marginBottom:14}}>

          <div className="card">
            <div className="card-head">
              <span style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--gain)',display:'inline-block',flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700}}>Live Scorecard</span>
                <span className="muted small">Active positions</span>
              </span>
            </div>
            <div className="card-body">
              {live.count===0?<div className="empty" style={{padding:'20px 0'}}>No active recommendations.</div>:(<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={live.count} label="Active" big mobile={isMobile}/>
                  <ScoreBox val={`${live.in_profit} (${live.count?Math.round(live.in_profit/live.count*100):0}%)`} label="In Profit" col="var(--gain)" big mobile={isMobile}/>
                  <ScoreBox val={`${live.in_loss} (${live.count?Math.round(live.in_loss/live.count*100):0}%)`} label="In Loss" col="var(--loss)" big mobile={isMobile}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={<RetBadge pct={live.avg_return}/>} label="Avg Return" mobile={isMobile}/>
                  <ScoreBox val={`${live.avg_holding_days||0}d`} label="Avg Holding" mobile={isMobile}/>
                  <ScoreBox val="—" label="vs NIFTY" mobile={isMobile}/>
                </div>
                {(live.best||live.worst)&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                  {live.best&&<ScoreBox val={<><b>{live.best.ticker}</b> <RetBadge pct={live.best.ret_pct}/></>} label="Best" mobile={isMobile}/>}
                  {live.worst&&<ScoreBox val={<><b>{live.worst.ticker}</b> <RetBadge pct={live.worst.ret_pct}/></>} label="Worst" mobile={isMobile}/>}
                </div>}
              </>)}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--accent)',display:'inline-block',flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700}}>Realized Scorecard</span>
                <span className="muted small">Closed only</span>
              </span>
            </div>
            <div className="card-body">
              {realized.count===0?<div className="empty" style={{padding:'20px 0'}}>No closed recommendations yet.</div>:(<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={realized.count} label="Closed" big mobile={isMobile}/>
                  <ScoreBox val={`${realized.hit_rate_pct.toFixed(1)}%`} label="Hit Rate" col={realized.hit_rate_pct>=50?'var(--gain)':'var(--loss)'} big mobile={isMobile}/>
                  <ScoreBox val={<RetBadge pct={realized.median_return}/>} label="Median Ret." big mobile={isMobile}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)',gap:9,marginBottom:10}}>
                  <ScoreBox val={<RetBadge pct={realized.avg_return}/>} label="Avg Return" mobile={isMobile}/>
                  <ScoreBox val={`${realized.avg_holding_days||0}d`} label="Avg Holding" mobile={isMobile}/>
                  <ScoreBox val={`${realized.win_count}/${realized.loss_count}`} label="Win/Loss" mobile={isMobile}/>
                  <ScoreBox val={(isNaN(realized.risk_adjusted)||!isFinite(realized.risk_adjusted))?'—':Number(realized.risk_adjusted).toFixed(2)} label="Risk-Adj." mobile={isMobile}/>
                </div>
                {realized.best&&<div style={{padding:'9px 12px',background:'var(--gain-soft)',borderRadius:9,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6}}>
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
          <div className="card-head"><span style={{fontSize:13,fontWeight:700}}>How is the ICI Score calculated?</span><a href="#methodology" style={{fontSize:12,fontWeight:700,color:'var(--accent-ink)',textDecoration:'none'}}>Learn More →</a></div>
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
    } catch(renderErr) {
      console.error('PublicProfile renderContent error:', renderErr);
      return (
        <div style={{padding:'40px 24px',textAlign:'center'}}>
          <AlertTriangle size={32} color="var(--loss)" style={{marginBottom:14}}/>
          <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Profile failed to render</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>
            An error occurred while building your profile view.
          </div>
          <div style={{background:'var(--surface-2)',border:'1px solid var(--loss)',borderRadius:10,
              padding:'12px 16px',fontSize:12,fontFamily:'monospace',color:'var(--loss)',
              textAlign:'left',maxWidth:560,margin:'0 auto',wordBreak:'break-all'}}>
            {renderErr.message}
          </div>
        </div>
      );
    }
  };

  // ── Shell wrappers ──────────────────────────────────────────────────────────
  if(mode==='standalone') {
    return(
      <div style={{minHeight:'100vh',background:'var(--bg)',paddingBottom:48}}>
        <div style={{background:'var(--surface)',borderBottom:'1px solid var(--line)',padding:'11px 24px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#6d5df5,#cf52d8)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:11,color:'#fff'}}>mic</div>
            <div><div style={{fontWeight:800,fontSize:13,lineHeight:1.1}}>myInvestorCircle</div><div style={{fontSize:10,color:'var(--muted)'}}>Transparency Platform</div></div>
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

/* ── ProfileEditModal — standalone overlay triggered from the top-nav dropdown ── */
function ProfileEditModal({ profile, userId, username, patchProfile, onClose,
                           claimMode=false, claimToken=null, unclaimedProfile=null, onClaimSuccess=null }) {
  const USERNAME_RE = /^[a-z0-9_]{5,20}$/;
  const [firstName,    setFirstName]    = useState(profile?.first_name || '');
  const [lastName,     setLastName]     = useState(profile?.last_name  || '');
  const [avatarColor,  setAvatarColor]  = useState(profile?.avatar_color || '');
  const [bio,          setBio]          = useState(profile?.bio || '');
  const [socials,      setSocials]      = useState({
    twitter:   profile?.twitter_url   || '',
    linkedin:  profile?.linkedin_url  || '',
    telegram:  profile?.telegram_url  || '',
    instagram: profile?.instagram_url || '',
  });
  const [regStatus,    setRegStatus]    = useState(profile?.registration_status || 'self_directed');
  const [sebiNum,      setSebiNum]      = useState(profile?.sebi_reg_number      || '');
  const [sebiTill,     setSebiTill]     = useState(profile?.sebi_reg_valid_till  || '');
  const [sebiFirm,     setSebiFirm]     = useState(profile?.sebi_firm_name       || '');
  const [regOptions,   setRegOptions]   = useState([]);
  const [sebiMsg,      setSebiMsg]      = useState('');
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState('');
  // Username setting — only relevant when username not yet set
  const [unInput,  setUnInput]  = useState(claimMode ? (unclaimedProfile?.username || '') : '');
  const [unStatus, setUnStatus] = useState('idle'); // idle|checking|available|taken|invalid
  const [unSaving, setUnSaving] = useState(false);
  const [unSaved,  setUnSaved]  = useState(!!username && !claimMode);

  // ── Claim-mode only state ─────────────────────────────────────────────────
  const [claimEmail,    setClaimEmail]    = useState('');
  const [claimPass,     setClaimPass]     = useState('');
  const [claimPass2,    setClaimPass2]    = useState('');
  const [showClaimPass, setShowClaimPass] = useState(false);
  const [consentTerms,  setConsentTerms]  = useState(false);
  const [consentData,   setConsentData]   = useState(false);
  const [consentSebi,   setConsentSebi]   = useState(false);
  const [claimBusy,     setClaimBusy]     = useState(false);

  useEffect(() => {
    if (!sql) return;
    sql`SELECT * FROM registration_status_options WHERE is_active=true ORDER BY sort_order`
      .then(setRegOptions).catch(() => {});
    sql`SELECT value FROM app_settings WHERE key='sebi_verification_message' LIMIT 1`
      .then(rows => { if (rows[0]) setSebiMsg(rows[0].value); }).catch(() => {});
  }, []);

  // Debounced username availability check.
  // In claim mode, the unclaimed profile's username is already reserved for this creator —
  // skip the DB round-trip and mark it available instantly.
  useEffect(() => {
    if (!unInput) { setUnStatus('idle'); return; }
    if (!USERNAME_RE.test(unInput)) { setUnStatus('invalid'); return; }
    if (claimMode && unInput === unclaimedProfile?.username) {
      setUnStatus('available'); return; // reserved for this creator via token
    }
    setUnStatus('checking');
    const t = setTimeout(async () => {
      const ok = await dbCheckUsername(unInput, userId);
      setUnStatus(ok ? 'available' : 'taken');
    }, 500);
    return () => clearTimeout(t);
  }, [unInput]);

  const saveUsername = async () => {
    if (unStatus !== 'available') return;
    setUnSaving(true);
    try {
      await dbSaveUsername(userId, unInput);
      patchProfile?.({ username: unInput });
      setUnSaved(true);
    } catch(e) { setErr('Could not save username: ' + e.message); }
    setUnSaving(false);
  };

  const isSebi = ['sebi_ra', 'sebi_ria'].includes(regStatus);

  // ── Claim submission (claimMode only) ────────────────────────────────────
  const handleClaim = async () => {
    setErr('');
    const fn = firstName.trim(), ln = lastName.trim();
    if (!fn)                                   { setErr('First name is required.'); return; }
    if (unStatus !== 'available')              { setErr('Please set a valid, available username.'); return; }
    if (!claimEmail.trim()||!claimEmail.includes('@')) { setErr('Enter a valid email address.'); return; }
    if (!claimPass||claimPass.length<8)        { setErr('Password must be at least 8 characters.'); return; }
    if (claimPass!==claimPass2)                { setErr('Passwords do not match.'); return; }
    if (!consentTerms||!consentData)           { setErr('Please accept all required terms.'); return; }
    setClaimBusy(true);
    try {
      const fullName = [fn,ln].filter(Boolean).join(' ');
      const cred = await createUserWithEmailAndPassword(primaryAuth, claimEmail.trim(), claimPass);
      const uid  = cred.user.uid;

      // Write creator's real profile (unconditional first_name to beat AuthContext race).
      // username=NULL intentionally — unclaimed profile still holds the reserved username until
      // admin approves. Approval transfers it via COALESCE(user_profiles.username, unclaimed.username).
      await sql`
        INSERT INTO user_profiles (id,email,full_name,first_name,last_name,username,bio,registration_status,is_admin)
        VALUES (${uid},${claimEmail.trim()},${fullName},${fn},${ln||''},NULL,${bio.trim()||null},${regStatus},false)
        ON CONFLICT (id) DO UPDATE SET
          full_name=EXCLUDED.full_name, first_name=EXCLUDED.first_name,
          last_name=EXCLUDED.last_name, updated_at=NOW()`;

      // Link claimer → unclaimed profile (RETURNING prevents double-claim)
      const link = await sql`
        UPDATE user_profiles SET
          claimed_by_uid=${uid}, claim_status='pending_approval',
          claimed_at=NOW(), claim_token=NULL
        WHERE claim_token=${claimToken} AND claim_status='unclaimed' RETURNING id`;
      if (!link?.length) throw new Error('This profile has already been claimed. Contact hello@myinvestorcircle.com.');

      await sql`
        INSERT INTO claim_requests (profile_id,profile_username,profile_full_name,claimer_uid,claimer_email,claimer_full_name,status)
        SELECT id,username,full_name,${uid},${claimEmail.trim()},${fullName},'pending'
        FROM user_profiles WHERE claimed_by_uid=${uid} AND claim_status='pending_approval' LIMIT 1`;

      await fbUpdateProfile(cred.user,{displayName:fullName}).catch(()=>{});

      const api=(import.meta.env.VITE_CAS_API_URL||'https://investor-circle.vercel.app')+'/api/email';
      fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        type:'claim_submitted',to_email:claimEmail.trim(),creator_name:fullName,
        profile_name:unclaimedProfile?.full_name,username:unInput,
      })}).catch(()=>{});
      fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        type:'claim_admin_notify',to_email:'hello@myinvestorcircle.com',creator_name:fullName,
        claimer_email:claimEmail.trim(),profile_name:unclaimedProfile?.full_name,username:unInput,
      })}).catch(()=>{});

      localStorage.removeItem('mic_claim_token');
      onClaimSuccess?.();
    } catch(e) {
      const c=e.code||'';
      if(c==='auth/email-already-in-use') setErr('This email is already registered. Contact hello@myinvestorcircle.com.');
      else if(c==='auth/invalid-email')   setErr('Enter a valid email address.');
      else if(c==='auth/weak-password')   setErr('Password must be at least 8 characters.');
      else setErr(e.message||'Something went wrong. Please try again.');
    }
    setClaimBusy(false);
  };

  const save = async () => {
    if (!sql || !userId) return;
    setSaving(true); setErr('');
    const fn = firstName.trim(), ln = lastName.trim();
    try {
      await sql`UPDATE user_profiles SET
        first_name=${fn||null}, last_name=${ln||null},
        full_name=${[fn,ln].filter(Boolean).join(' ')||null},
        avatar_color=${avatarColor||null},
        bio=${bio||null},
        twitter_url=${socials.twitter||null}, linkedin_url=${socials.linkedin||null},
        telegram_url=${socials.telegram||null}, instagram_url=${socials.instagram||null},
        registration_status=${regStatus},
        sebi_reg_number=${isSebi?(sebiNum||null):null},
        sebi_reg_valid_till=${isSebi?(sebiTill||null):null},
        sebi_firm_name=${isSebi?(sebiFirm||null):null}
      WHERE id=${userId}`;
      patchProfile?.({
        first_name: fn, last_name: ln, full_name: [fn,ln].filter(Boolean).join(' '),
        avatar_color: avatarColor, bio,
        twitter_url: socials.twitter, linkedin_url: socials.linkedin,
        telegram_url: socials.telegram, instagram_url: socials.instagram,
        registration_status: regStatus,
        sebi_reg_number:     isSebi ? sebiNum  : null,
        sebi_reg_valid_till: isSebi ? sebiTill : null,
        sebi_firm_name:      isSebi ? sebiFirm : null,
      });
      onClose();
    } catch(e) { setErr('Could not save: ' + e.message); }
    setSaving(false);
  };

  const darkInput = {
    width:'100%', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)',
    borderRadius:9, padding:'10px 13px', fontSize:13, color:'#fff',
    fontFamily:'var(--font)', outline:'none', boxSizing:'border-box',
  };

  return createPortal(
    <div style={{position:'fixed',inset:0,background:'rgba(13,14,30,.65)',backdropFilter:'blur(4px)',
        display:'flex',alignItems:'center',justifyContent:'center',zIndex:9000,padding:'20px'}}
      onClick={onClose}>
      <div style={{width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',background:'#16182a',
          borderRadius:20,border:'1px solid rgba(255,255,255,.1)',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,.08)',
            display:'flex',alignItems:'center',justifyContent:'space-between',
            position:'sticky',top:0,background:'#16182a',zIndex:1,borderRadius:'20px 20px 0 0'}}>
          <div style={{fontSize:17,fontWeight:800,color:'#fff'}}>{claimMode?'Claim your profile':'Edit Profile'}</div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,.08)',border:'none',
              color:'rgba(255,255,255,.7)',cursor:'pointer',width:32,height:32,borderRadius:8,
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            <X size={16}/>
          </button>
        </div>

        <div style={{padding:'24px'}}>

          {/* ── Claim-mode only: account credentials ─────────────────── */}
          {claimMode && (<>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>
              Username
            </div>
            <div style={{marginBottom:20}}>
              <input value={unInput} onChange={e=>setUnInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                placeholder="Choose a username" style={{...darkInput,borderColor:
                  unStatus==='available'?'#4ade80':unStatus==='taken'||unStatus==='invalid'?'#f87171':'rgba(255,255,255,.12)'}}/>
              <div style={{marginTop:6,fontSize:11,color:
                unStatus==='available'?'#4ade80':unStatus==='taken'||unStatus==='invalid'?'#f87171':'rgba(255,255,255,.4)'}}>
                {unStatus==='checking'?'Checking…':unStatus==='available'?`✓ @${unInput} is available`
                 :unStatus==='taken'?'Username already taken — try another'
                 :unStatus==='invalid'?'5–20 lowercase letters, numbers or _'
                 :`Your profile will be at /#/investor/${unInput||'username'}`}
              </div>
            </div>

            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>
              Account credentials
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
              <input type="email" value={claimEmail} onChange={e=>setClaimEmail(e.target.value)}
                placeholder="Your real email address" style={darkInput}/>
              <div style={{position:'relative'}}>
                <input type={showClaimPass?'text':'password'} value={claimPass} onChange={e=>setClaimPass(e.target.value)}
                  placeholder="Create a password (min. 8 characters)"
                  style={{...darkInput,paddingRight:38}}/>
                <button onClick={()=>setShowClaimPass(v=>!v)}
                  style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.5)',padding:0}}>
                  {showClaimPass?<EyeOff size={14}/>:<Eye size={14}/>}
                </button>
              </div>
              <input type={showClaimPass?'text':'password'} value={claimPass2} onChange={e=>setClaimPass2(e.target.value)}
                placeholder="Confirm password" style={darkInput}/>
            </div>

            <div style={{height:1,background:'rgba(255,255,255,.08)',marginBottom:20}}/>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>
              Profile details
            </div>
          </>)}

          {/* Avatar colour */}
          {!claimMode && <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Avatar colour</div>}
          {!claimMode && <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:22}}>
            {['#6d5df5','#cf52d8','#15924e','#0ea5b7','#d97706','#e11d48','#2563eb','#64748b'].map(c=>(
              <div key={c} onClick={()=>setAvatarColor(c)} style={{width:32,height:32,borderRadius:9,
                  background:c,cursor:'pointer',boxSizing:'border-box',transition:'.1s',
                  border:avatarColor===c?'2px solid #fff':'2px solid transparent',
                  boxShadow:avatarColor===c?`0 0 12px ${c}88`:''}}/>
            ))}
            <div onClick={()=>setAvatarColor('')} style={{width:32,height:32,borderRadius:9,cursor:'pointer',
                background:'linear-gradient(135deg,#6d5df5,#cf52d8)',boxSizing:'border-box',
                display:'flex',alignItems:'center',justifyContent:'center',
                border:!avatarColor?'2px solid #fff':'2px solid transparent',
                fontSize:9,color:'#fff',fontWeight:800}}>AUTO</div>
          </div>}

          {/* Name */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Name</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
            <input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="First name" style={darkInput}/>
            <input value={lastName}  onChange={e=>setLastName(e.target.value)}  placeholder="Last name"  style={darkInput}/>
          </div>

          {/* Username — shown in non-claim mode only; claim mode has its own above */}
          {!claimMode && <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
                textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Username</div>
            {(username || unSaved) ? (
              <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.04)',
                  border:'1px solid rgba(255,255,255,.07)',borderRadius:9,padding:'10px 13px'}}>
                <Lock size={13} color="rgba(255,255,255,.35)"/>
                <span style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,.7)'}}>@{unSaved&&!username?unInput:username}</span>
                <span style={{fontSize:11,color:'rgba(255,255,255,.3)',marginLeft:4}}>(cannot be changed)</span>
              </div>
            ) : (
              <>
                <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',
                    borderRadius:9,padding:'10px 13px',fontSize:12,color:'#fbbf24',marginBottom:10,lineHeight:1.5}}>
                  ⚠ Choose carefully — username cannot be changed once set.
                  It becomes part of your permanent public profile URL.
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{flex:1,position:'relative'}}>
                    <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',
                        color:'rgba(255,255,255,.4)',pointerEvents:'none',fontSize:14}}>@</span>
                    <input value={unInput}
                      onChange={e=>setUnInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                      maxLength={20} placeholder="your_username"
                      style={{...darkInput,paddingLeft:28}}/>
                  </div>
                  <button className="btn btn-pri btn-sm" disabled={unStatus!=='available'||unSaving}
                    onClick={saveUsername} style={{flexShrink:0,padding:'10px 16px'}}>
                    {unSaving?<Loader size={13} className="spin"/>:<><Check size={13}/> Set</>}
                  </button>
                </div>
                <div style={{marginTop:6,fontSize:12,minHeight:16}}>
                  {unStatus==='checking'  && <span style={{color:'rgba(255,255,255,.4)',display:'flex',alignItems:'center',gap:5}}><Loader size={11} className="spin"/> Checking…</span>}
                  {unStatus==='available' && <span style={{color:'#4ade80',display:'flex',alignItems:'center',gap:5}}><Check size={11}/> Available</span>}
                  {unStatus==='taken'     && <span style={{color:'#f87171',display:'flex',alignItems:'center',gap:5}}><X size={11}/> Already taken — try another</span>}
                  {unStatus==='invalid'   && <span style={{color:'#f87171',fontSize:11}}>5–20 chars, lowercase letters, numbers and underscores only</span>}
                </div>
              </>
            )}
          </div>}  {/* end !claimMode username block */}

          {/* Read-only email — hidden in claim mode (creator enters their own email above) */}
          {!claimMode && <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginBottom:6,
                display:'flex',alignItems:'center',gap:4,fontWeight:600}}>
              <Lock size={10}/> Email <span style={{fontWeight:400,fontSize:10}}>(cannot be changed)</span>
            </div>
            <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',
                borderRadius:9,padding:'10px 13px',fontSize:13,color:'rgba(255,255,255,.4)',fontFamily:'inherit'}}>
              {profile?.email || <span style={{opacity:.4,fontStyle:'italic'}}>not set</span>}
            </div>
          </div>}  {/* end !claimMode email block */}

          {/* Bio */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Bio</div>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3} maxLength={300}
            placeholder="Describe your investment approach…"
            style={{...darkInput,resize:'vertical'}}/>
          <div style={{fontSize:11,color:'rgba(255,255,255,.3)',textAlign:'right',
              marginTop:4,marginBottom:20}}>{bio.length}/300</div>

          {/* Social links */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Social links</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
            {[
              {key:'twitter',  label:'Twitter / X', ph:'https://twitter.com/username'},
              {key:'linkedin', label:'LinkedIn',     ph:'https://linkedin.com/in/username'},
              {key:'telegram', label:'Telegram',     ph:'https://t.me/username'},
              {key:'instagram',label:'Instagram',    ph:'https://instagram.com/username'},
            ].map(s=>(
              <div key={s.key}>
                <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{s.label}</div>
                <input value={socials[s.key]} onChange={e=>setSocials(p=>({...p,[s.key]:e.target.value}))}
                  placeholder={s.ph} style={darkInput}/>
              </div>
            ))}
          </div>

          {/* Investor type */}
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.5)',
              textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Investor type</div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
            {(regOptions.length ? regOptions : [
              {code:'self_directed',label:'Self-directed Investor',           description:'Invests own money independently.'},
              {code:'enthusiast',  label:'Market Enthusiast',                 description:'Passionate about markets, shares ideas informally.'},
              {code:'sebi_ra',     label:'SEBI Registered Research Analyst',  description:'INH000XXXXXX format.'},
              {code:'sebi_ria',    label:'SEBI Registered Investment Adviser',description:'INA000XXXXXX format.'},
            ]).map(opt=>(
              <label key={opt.code} style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',
                  padding:'11px 14px',borderRadius:10,transition:'.15s',
                  background:regStatus===opt.code?'rgba(109,93,245,.2)':'rgba(255,255,255,.04)',
                  border:`1px solid ${regStatus===opt.code?'rgba(109,93,245,.55)':'rgba(255,255,255,.08)'}`}}>
                <input type="radio" name="pemRegStatus" value={opt.code}
                  checked={regStatus===opt.code} onChange={()=>setRegStatus(opt.code)}
                  style={{accentColor:'#6d5df5',marginTop:3,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{opt.label}</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:2,lineHeight:1.4}}>{opt.description}</div>
                </div>
              </label>
            ))}
          </div>

          {/* SEBI fields */}
          {isSebi && (<>
            <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.2)',
                borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:13,color:'#fbbf24',lineHeight:1.6}}>
              {sebiMsg || 'Your SEBI registration details will be reviewed by our team within 2–3 business days.'}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
              {[
                {label:'SEBI Reg. Number',       ph:regStatus==='sebi_ra'?'INH000XXXXXX':'INA000XXXXXX',val:sebiNum, set:setSebiNum},
                {label:'Valid Till',              ph:'',val:sebiTill,set:setSebiTill,type:'date'},
                {label:'Firm / Employer (opt.)', ph:'e.g. XYZ Securities',val:sebiFirm,set:setSebiFirm,span:true},
              ].map((f,i)=>(
                <div key={i} style={f.span?{gridColumn:'1/span 2'}:{}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:6,fontWeight:600}}>{f.label}</div>
                  <input type={f.type||'text'} value={f.val} onChange={e=>f.set(e.target.value)}
                    placeholder={f.ph} style={{...darkInput,colorScheme:'dark'}}/>
                </div>
              ))}
            </div>
          </>)}

          {err && <div style={{color:'#f87171',fontSize:12,marginBottom:14,padding:'8px 12px',
              background:'rgba(248,113,113,.1)',borderRadius:8,border:'1px solid rgba(248,113,113,.2)'}}>{err}</div>}

          {/* Footer */}
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',
              borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:16}}>

            {/* Claim-mode: consent checkboxes above the submit button */}
            {claimMode && (
              <div style={{marginBottom:16,display:'flex',flexDirection:'column',gap:10,
                padding:'12px 0',borderTop:'1px solid rgba(255,255,255,.08)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.4)',letterSpacing:'.04em',marginBottom:2}}>
                  CONSENT & AGREEMENTS
                </div>
                {[
                  [consentTerms,setConsentTerms,'I agree to the Terms of Service and Privacy Policy *'],
                  [consentData, setConsentData, 'I consent to myInvestorCircle storing and publicly displaying my investment recommendations *'],
                  [consentSebi, setConsentSebi, 'My recommendations comply with SEBI regulations (if registered) or are for educational purposes only'],
                ].map(([val,set,label],i)=>(
                  <label key={i} style={{display:'flex',gap:12,alignItems:'flex-start',cursor:'pointer',
                    fontSize:12,color:'rgba(255,255,255,.7)',lineHeight:1.55,padding:'0 0 0 4px'}}>
                    <input type="checkbox" checked={val} onChange={e=>set(e.target.checked)}
                      style={{marginTop:2,flexShrink:0,width:16,height:16,accentColor:'#a78bfa',cursor:'pointer'}}/>
                    <span style={{flex:1}}>{label}</span>
                  </label>
                ))}
              </div>
            )}

            <button onClick={onClose} style={{padding:'10px 18px',borderRadius:10,fontWeight:700,
                fontSize:14,cursor:'pointer',background:'rgba(255,255,255,.08)',
                border:'1px solid rgba(255,255,255,.15)',color:'#fff',fontFamily:'var(--font)',flexShrink:0}}>
              Cancel
            </button>
            <button className="btn btn-pri"
              disabled={claimMode ? claimBusy : saving}
              onClick={claimMode ? handleClaim : save}
              style={{padding:'10px 18px',fontSize:14,flex:1,justifyContent:'center',
                minHeight:0,lineHeight:1.3}}>
              {claimMode
                ? (claimBusy ? <><Loader size={14} className="spin"/> Claiming…</> : <><UserPlus size={14}/> Claim @{unInput||'profile'}</>)
                : (saving    ? <><Loader size={14} className="spin"/> Saving…</>   : <><Check size={14}/> Save changes</>)
              }
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
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
/* ─── InvestedToggle — shared across FeedCard, ReceivedSection, TrackedSection ──── */
function InvestedToggle({ invested, investedPrice, reco, onMark, onUnmark, stopProp=false }) {
  const [showModal, setShowModal] = useState(false);

  const handleClick = (e) => {
    if (stopProp) e.stopPropagation();
    if (invested) onUnmark();
    else setShowModal(true);
  };

  const tooltip = invested
    ? (investedPrice ? `Entry: ₹${Number(investedPrice).toLocaleString('en-IN')} · Click to unmark` : 'Invested · Click to unmark')
    : 'Click to mark as invested';

  return (
    <>
      <div
        style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',userSelect:'none'}}
        onClick={handleClick}
        title={tooltip}
      >
        <div className={"sw"+(invested?" on":"")}
          style={{width:34,height:19,background:invested?'var(--gain)':undefined}}>
          <div className="knob" style={{width:13,height:13,top:3,left:invested?18:3}}/>
        </div>
        <span style={{fontSize:12,fontWeight:700,color:invested?'var(--gain)':'var(--muted)',transition:'color .15s'}}>
          {invested?'Invested':'Mark Invested'}
        </span>
      </div>
      {showModal && (
        <InvestPriceModal
          reco={{...reco, price: reco.current_price||reco.price}}
          onClose={()=>setShowModal(false)}
          onConfirm={(price)=>{ onMark(price); setShowModal(false); }}
        />
      )}
    </>
  );
}

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
function FeedCard({ r, me, contacts, groups, setRecsReceived, onReload, tracked, toggleTrack, initExpanded=false }) {
  const [expanded,  setExpanded]  = useState(initExpanded);
  const [recommenderInfo, setRecommenderInfo] = useState(null); // { username, isSebiApproved }
  const [shareAnchor, setShareAnchor] = useState(null);
  const [shareUsername, setShareUsername] = useState(null);
  const [showShare, setShowShare] = useState(false);

  // Fetch recommender's username + SEBI status once (cached globally)
  useEffect(()=>{
    if(r.from) fetchPublicProfileInfo(r.from).then(setRecommenderInfo);
  },[r.from]);

  const cf = useMemo(()=>{
    const found = contacts.find(x=>x.id===r.from);
    if(found) return found;
    const name=r.byName||'Someone';
    return { name, initials:initialsOf(name), color:'#8d90ad' };
  },[r.from, contacts]);

  const retPct = (r.priceAt&&r.priceAt!==0) ? (r.price-r.priceAt)/r.priceAt : 0;
  const itm = retPct >= 0;
  const isTracked = tracked?.has(r.id);
  const interactionCount = (r.likes||0)+(r.dislikes||0)+(r.invested?1:0)+(isTracked?1:0);
  const canOpenProfile = !!recommenderInfo?.username;

  const patch=(updates)=>{
    setRecsReceived(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,...updates}:x));
    if(sql&&r.deliveryId){ try{ updateDelivery(r.deliveryId,updates,me?.id); }catch(_){} }
  };

  const react=(val)=>{
    if(!me?.id) return;
    const next=r.reaction===val?'none':val;
    let likes=(r.likes||0), dislikes=(r.dislikes||0);
    if(r.reaction==='like')    likes    = Math.max(0,likes-1);
    if(r.reaction==='dislike') dislikes = Math.max(0,dislikes-1);
    if(next==='like')    likes++;
    if(next==='dislike') dislikes++;
    setRecsReceived(rs=>rs.map(x=>x.deliveryId===r.deliveryId?{...x,reaction:next,likes,dislikes}:x));
    if(sql&&r.deliveryId) updateDelivery(r.deliveryId,{reaction:next==='none'?null:next},me.id).catch(console.warn);
  };

  const handleShareClick=async(e)=>{
    if(showShare){ setShowShare(false); setShareAnchor(null); return; }
    setShareAnchor(e.currentTarget); setShowShare(true);
    const cached=recommenderInfo?.username||null;
    if(cached){ setShareUsername(cached); return; }
    if(r.from&&sql){
      try{
        const rows=await sql`SELECT username FROM user_profiles WHERE id=${r.from} AND username IS NOT NULL LIMIT 1`;
        if(rows[0]?.username) setShareUsername(rows[0].username);
      }catch(_){}
    }
  };

  const isBuy=(r.recommendation_type||r.recType||'Buy')==='Buy';

  // SEBI regulatory badge — shown after recommender info loads
  const SebiBadge=()=>{
    if(!recommenderInfo) return null;
    return recommenderInfo.isSebiApproved
      ? <span title="SEBI Registered Research Analyst or Investment Adviser — platform-verified"
          style={{fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:4,background:'rgba(21,146,78,.12)',color:'var(--gain)',border:'1px solid rgba(21,146,78,.3)',textTransform:'uppercase',letterSpacing:'.05em',whiteSpace:'nowrap',flexShrink:0}}>
          ✓ SEBI Reg.
        </span>
      : <span title="Not SEBI Registered — investing on own account"
          style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'rgba(141,144,173,.08)',color:'var(--muted)',border:'1px solid rgba(141,144,173,.2)',textTransform:'uppercase',letterSpacing:'.05em',whiteSpace:'nowrap',flexShrink:0}}>
          Non-SEBI
        </span>;
  };

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,boxShadow:'var(--shadow)',marginBottom:12,overflow:'visible',transition:'box-shadow .15s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(20,20,50,.1)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='var(--shadow)'}>
      <div style={{padding:'16px 18px'}}>

        {/* ── Header row ── */}
        <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:11}}>

          {/* Avatar — click → profile */}
          <div className="av"
            style={{width:42,height:42,background:cf.color||'var(--grad)',fontSize:15,flexShrink:0,cursor:canOpenProfile?'pointer':'default'}}
            title={canOpenProfile?`View ${cf.name}'s profile`:''}
            onClick={()=>canOpenProfile&&openProfile(recommenderInfo.username)}>
            {cf.initials||initialsOf(cf.name)}
          </div>

          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,lineHeight:1.35,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              {/* Name — click → profile */}
              <b style={{color:canOpenProfile?'var(--accent-ink)':'var(--ink)',cursor:canOpenProfile?'pointer':'default',
                  textDecoration:canOpenProfile?'underline':'none',textDecorationStyle:'dotted',textUnderlineOffset:3}}
                title={canOpenProfile?`View ${cf.name}'s public profile`:''}
                onClick={()=>canOpenProfile&&openProfile(recommenderInfo.username)}>{cf.name}</b>
              <span style={{color:'var(--muted)',fontWeight:400}}>recommended</span>
              <b style={{color:'var(--ink)'}}>{r.assetName}</b>
              <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,
                background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                {isBuy?'Buy':'Sell'}
              </span>
              {/* Regulatory badge */}
              <SebiBadge/>
            </div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:3,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span>{fmtDate(r.date)}</span>
              {r.assetClass&&<span style={{display:'flex',alignItems:'center',gap:4}}><span className="dot" style={{background:classColor(r.assetClass),width:7,height:7}}/>{r.assetClass}</span>}
              {r.priceAt>0&&<span>Reco ₹{Number(r.priceAt).toLocaleString('en-IN')}</span>}
              {r.feedSource==='public'
                ? <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(99,102,241,.1)',color:'rgb(99,102,241)',border:'1px solid rgba(99,102,241,.25)',display:'flex',alignItems:'center',gap:3}}><Globe size={9}/> Platform</span>
                : r.isPublic
                ? <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--gain-soft)',color:'var(--gain)',border:'1px solid rgba(21,146,78,.2)'}}>Public</span>
                : r.shareType==='group'
                  ? <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',border:'1px solid var(--accent-line)',display:'flex',alignItems:'center',gap:3}}><Layers size={10}/>{r.groupId?(groups?.find?.(g=>g.id===r.groupId)?.name||'Group'):'Group'}</span>
                  : <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--surface-2)',color:'var(--muted)',border:'1px solid var(--line)'}}>Direct</span>}
            </div>
          </div>

          {/* Return badge — click to expand */}
          <div style={{textAlign:'right',flexShrink:0,cursor:'pointer'}} onClick={()=>setExpanded(v=>!v)} title="Expand card">
            <div style={{fontSize:16,fontWeight:800,letterSpacing:'-.3px',color:itm?'var(--gain)':'var(--loss)'}}>
              {itm?'+':''}{(retPct*100).toFixed(1)}%
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>₹{Number(r.price).toLocaleString('en-IN')} now</div>
            <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{expanded?'▲':'▼'}</div>
          </div>
        </div>

        {/* ── Thesis — click to expand ── */}
        {r.thesis&&r.thesis!=='—'&&(
          <div onClick={()=>setExpanded(v=>!v)} style={{fontSize:13.5,color:'var(--ink-soft)',lineHeight:1.65,marginBottom:10,cursor:'pointer',
            display:expanded?'block':'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:expanded?'visible':'hidden'}}>
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
          <button className={"iconbtn"+(r.reaction==='like'?' on-like':'')} title="Like" onClick={e=>{e.stopPropagation();react('like');}} style={{width:32,height:32}}><ThumbsUp size={14}/></button>
          <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.likes||0}</span>
          <button className={"iconbtn"+(r.reaction==='dislike'?' on-dislike':'')} title="Dislike" onClick={e=>{e.stopPropagation();react('dislike');}} style={{width:32,height:32}}><ThumbsDown size={14}/></button>
          <span style={{fontSize:12,fontWeight:700,color:'var(--muted)',minWidth:16}}>{r.dislikes||0}</span>
          <button className="iconbtn" title="Comment" onClick={()=>setExpanded(v=>!v)} style={{width:32,height:32}}><MessageSquare size={14}/></button>
          <div style={{position:'relative'}}>
            <button className="iconbtn" title="Share" onClick={e=>{e.stopPropagation();handleShareClick(e);}} style={{width:32,height:32}}><Share2 size={14}/></button>
            {showShare&&<ReceivedSharePopover reco={r} fromUsername={shareUsername} anchorEl={shareAnchor}
              onForward={()=>setShowShare(false)}
              onClose={()=>{ setShowShare(false); setShareAnchor(null); }}/>}
          </div>
          <button className={"iconbtn"+(isTracked?' on-like':'')} title={isTracked?'Remove from tracked':'Track'}
            onClick={()=>toggleTrack?.(r.id)}
            style={isTracked?{width:32,height:32,background:'var(--accent-soft)',color:'var(--accent-ink)',borderColor:'var(--accent-line)'}:{width:32,height:32}}>
            <Bookmark size={14}/>
          </button>
          {interactionCount>0&&<span style={{fontSize:11,color:'var(--muted)',marginLeft:2}}>✦ {interactionCount}</span>}
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            <InvestedToggle
              invested={r.invested} investedPrice={r.investedPrice||r.invested_price}
              reco={{...r,price:r.price,ticker:r.ticker,assetName:r.assetName,priceAt:r.priceAt}}
              onMark={(price)=>{
                patch({isInvested:true,investedPrice:price,invested:true});
                if(sql&&me?.id){
                  sql`INSERT INTO recommendation_tracking(reco_id,user_id,is_invested,invested_price,invested_at)
                      VALUES(${r.id},${me.id},true,${price},now())
                      ON CONFLICT(reco_id,user_id) DO UPDATE SET is_invested=true,invested_price=${price},invested_at=now()`
                    .then(()=>{ if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id); })
                    .catch(()=>{ if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id); });
                } else if(toggleTrack&&tracked&&!tracked.has(r.id)) toggleTrack(r.id);
              }}
              onUnmark={()=>{
                patch({isInvested:false,investedPrice:null,invested:false});
                if(sql&&me?.id) sql`UPDATE recommendation_tracking SET is_invested=false,invested_price=null,invested_at=null WHERE reco_id=${r.id} AND user_id=${me.id}`.catch(console.warn);
              }}
              stopProp={true}
            />
            <button onClick={()=>setExpanded(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:12,color:'var(--accent-ink)',fontWeight:700,fontFamily:'var(--font)',padding:'4px 8px',borderRadius:8}}>
              {expanded?'Less':'More'}<ChevronDown size={14} style={{transform:expanded?'rotate(180deg)':'none',transition:'.15s'}}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── Expanded detail + comments ── */}
      {expanded&&(
        <div style={{borderTop:'1px solid var(--line)',padding:'16px 18px',background:'var(--surface-2)',borderRadius:'0 0 18px 18px'}}>
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
          {r.thesis&&r.thesis!=='—'&&(
            <div style={{marginBottom:16}}>
              <div className="cap" style={{marginBottom:5}}>Thesis</div>
              <div style={{fontSize:13,lineHeight:1.7,color:'var(--ink-soft)'}}>{r.thesis}</div>
            </div>
          )}
          <div style={{borderTop:'1px solid var(--line)',paddingTop:14}}>
            <div className="cap" style={{marginBottom:10}}>Comments</div>
            <RecoComments recoId={r.id} me={me}/>
          </div>
        </div>
      )}
    </div>
  );
}
function scoreFeedRec(r, tracked, cfg) {
  let score = 0;
  // Source base score
  const src = r.feedSource;
  if (!src || src === 'direct') score += 100;
  else if (src === 'group')     score += 80;
  else if (src === 'network_engagement') score += 40;
  else score += 20; // public

  // Recency (0–50 pts, decays over 30 days)
  const daysSince = (Date.now() - new Date(r.date)) / 86400000;
  score += Math.max(0, 50 - daysSince * 1.8);

  // Engagement boost
  if (cfg.rank_engagement) {
    score += (r.likes || 0) * 6 + (r.dislikes || 0) * 2;
  }

  // Price movement boost (|return| > 5% adds up to 40 pts)
  if (cfg.rank_price_movement && r.priceAt > 0) {
    const absRet = Math.abs((r.price - r.priceAt) / r.priceAt);
    if (absRet > 0.05) score += Math.min(40, absRet * 200);
  }

  // Already tracked/invested → push down (untracked first)
  if (cfg.rank_untracked_first && (tracked.has(r.id) || r.invested)) score -= 35;

  return score;
}

/* ─── Reco Card Modal ─── */
function RecoCardModal({ r, me, contacts, groups, setRecsReceived, tracked, toggleTrack, onClose }) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{zIndex:9999}}>
      <div style={{maxWidth:640,width:'92vw',margin:'60px auto',position:'relative'}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:'absolute',top:-36,right:0,background:'rgba(255,255,255,.15)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,padding:'4px 12px',borderRadius:8}}>✕ Close</button>
        <FeedCard r={r} me={me} contacts={contacts} groups={groups}
          setRecsReceived={setRecsReceived} tracked={tracked} toggleTrack={toggleTrack}
          initExpanded={true}/>
      </div>
    </div>,
    document.body
  );
}

/* ─── Shared widget header style ─── */
function WidgetHeader({ icon: Icon, emoji, label, action, onAction }) {
  return (
    <div style={{background:'var(--grad)',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{fontWeight:700,fontSize:11,color:'#fff',display:'flex',alignItems:'center',gap:5,textTransform:'uppercase',letterSpacing:'.5px'}}>
        {Icon && <Icon size={12} color="rgba(255,255,255,.85)"/>}
        {emoji && <span style={{fontSize:13}}>{emoji}</span>}
        {label}
      </span>
      {action && (
        <button onClick={onAction} style={{background:'rgba(255,255,255,.15)',border:'none',color:'#fff',cursor:'pointer',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:6,letterSpacing:'.3px'}}>
          {action}
        </button>
      )}
    </div>
  );
}

/* ─── Sidebar Widget: Fresh from Network (#7) ─── */
function FreshWidget({ recsReceived, contacts, setPage }) {
  const fresh = [...recsReceived].filter(r=>!r.hidden)
    .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  const [modal, setModal] = useState(null);
  const cf = (r) => { const f=contacts.find(x=>x.id===r.from); return f||(r.byName?{name:r.byName,color:'#8d90ad'}:{name:'?',color:'#8d90ad'}); };
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Bell} label="Fresh Ideas" action="View all" onAction={()=>setPage('recs')}/>
      {fresh.length===0
        ? <div className="muted small" style={{padding:'10px 14px 12px',fontStyle:'italic'}}>No new recommendations yet.</div>
        : fresh.map(r=>{
          const perf=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
          const c=cf(r);
          return (
            <div key={r.id} onClick={()=>setModal(r)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
              onMouseLeave={e=>e.currentTarget.style.background=''}>
              <div className="av" style={{width:30,height:30,background:c.color||'var(--grad)',fontSize:10,flexShrink:0}}>{initialsOf(c.name)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.assetName}</div>
                <div style={{fontSize:10,color:'var(--muted)'}}>{c.name.split(' ')[0]} · {fmtDate(r.date)}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontSize:12,fontWeight:700,color:perf>=0?'var(--gain)':'var(--loss)'}}>{perf>=0?'+':''}{(perf*100).toFixed(1)}%</div>
                <div style={{fontSize:10,color:'var(--muted)'}}>{r.horizon||''}</div>
              </div>
            </div>
          );
        })}
      {modal && <RecoCardModal r={modal} me={null} contacts={contacts} groups={[]} setRecsReceived={()=>{}} tracked={new Set()} toggleTrack={()=>{}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ─── Sidebar Widget: Tracked Summary Donut (#6) ─── */
function TrackedSummaryWidget({ recsReceived, tracked, setPage, setRecoInit }) {
  const trackedList = recsReceived.filter(r=>tracked.has(r.id));
  const total = trackedList.length;
  const inM = trackedList.filter(r=>r.priceAt&&r.price>r.priceAt).length;
  const outM = total - inM;
  if(total===0) return null;

  // SVG donut
  const R=32, cx=40, cy=40, stroke=9, circum=2*Math.PI*R;
  const inDash=circum*(inM/total), outDash=circum*(outM/total);
  const navTo=(filter)=>{ setRecoInit({tab:'tracked',moneyFilter:filter}); setPage('recs'); };

  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={TrendingUp} label="My Tracked"/>
      <div style={{padding:'12px 14px'}}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <svg width={80} height={80} style={{flexShrink:0}}>
          {/* background */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line-2)" strokeWidth={stroke}/>
          {/* out of money — red */}
          {outM>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--loss)" strokeWidth={stroke}
            strokeDasharray={`${outDash} ${circum-outDash}`}
            strokeDashoffset={-(circum*(inM/total))}
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
          {/* in the money — green */}
          {inM>0&&<circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--gain)" strokeWidth={stroke}
            strokeDasharray={`${inDash} ${circum-inDash}`}
            strokeDashoffset={0}
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
          <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" style={{fontSize:16,fontWeight:800,fill:'var(--ink)'}}>{total}</text>
          <text x={cx} y={cy+14} textAnchor="middle" dominantBaseline="middle" style={{fontSize:8,fill:'var(--muted)'}}>tracked</text>
        </svg>
        <div style={{flex:1}}>
          <div onClick={()=>navTo('in')} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,marginBottom:5,background:'var(--gain-soft)',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <span style={{fontSize:12,fontWeight:600,color:'var(--gain)'}}>In the money</span>
            <span style={{fontSize:15,fontWeight:800,color:'var(--gain)'}}>{inM}</span>
          </div>
          <div onClick={()=>navTo('out')} style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:8,background:'var(--loss-soft)',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <span style={{fontSize:12,fontWeight:600,color:'var(--loss)'}}>Out of money</span>
            <span style={{fontSize:15,fontWeight:800,color:'var(--loss)'}}>{outM}</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ─── Sidebar Widget: Missed Opportunities (#5) ─── */
function MissedOppsWidget({ recsReceived, tracked, contacts }) {
  const [modal, setModal] = useState(null);
  const missed = recsReceived
    .filter(r=>!tracked.has(r.id)&&!r.hidden&&r.priceAt>0)
    .map(r=>({...r, ret:(r.price-r.priceAt)/r.priceAt}))
    .filter(r=>r.ret>0.03)
    .sort((a,b)=>b.ret-a.ret)
    .slice(0,3);
  if(!missed.length) return null;
  const cf=(r)=>{ const f=contacts.find(x=>x.id===r.from); return f||(r.byName?{name:r.byName}:{name:'?'}); };
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader emoji="💸" label="Missed Opportunities"/>
      {missed.map(r=>(
        <div key={r.id} onClick={()=>setModal(r)} style={{padding:'9px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
          onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
          onMouseLeave={e=>e.currentTarget.style.background=''}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontWeight:700,fontSize:12}}>{r.assetName}</div>
              <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>from {cf(r).name.split(' ')[0]} · Reco ₹{Number(r.priceAt).toLocaleString('en-IN')}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:13,fontWeight:800,color:'var(--gain)'}}>+{(r.ret*100).toFixed(1)}%</div>
              <div style={{fontSize:10,color:'var(--muted)'}}>₹{Number(r.price).toLocaleString('en-IN')} now</div>
            </div>
          </div>
        </div>
      ))}
      {modal && <RecoCardModal r={modal} me={null} contacts={contacts} groups={[]} setRecsReceived={()=>{}} tracked={new Set()} toggleTrack={()=>{}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ─── Sidebar Widget: Trending in Network (#4) ─── */
function TrendingWidget({ recsReceived, tracked, contacts }) {
  const [modal, setModal] = useState(null);
  const trending = [...recsReceived].filter(r=>!r.hidden)
    .map(r=>({...r, score:(r.likes||0)+(r.dislikes||0)+(tracked.has(r.id)?2:0)}))
    .filter(r=>r.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,3);
  if(!trending.length) return null;
  const cf=(r)=>{ const f=contacts.find(x=>x.id===r.from); return f||(r.byName?{name:r.byName,color:'#8d90ad'}:{name:'?',color:'#8d90ad'}); };
  return (
    <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,boxShadow:'var(--shadow)',overflow:'hidden',marginBottom:12}}>
      <WidgetHeader icon={Flame} label="Trending on Platform"/>
      {trending.map((r,i)=>{
        const perf=r.priceAt?(r.price-r.priceAt)/r.priceAt:0;
        const c=cf(r);
        return (
          <div key={r.id} onClick={()=>setModal(r)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderTop:'1px solid var(--line)',cursor:'pointer',transition:'.12s'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
            onMouseLeave={e=>e.currentTarget.style.background=''}>
            <div style={{width:22,height:22,borderRadius:'50%',background:i===0?'var(--grad)':i===1?'var(--accent-soft)':'var(--surface-2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:i===0?'#fff':'var(--accent-ink)',flexShrink:0}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.assetName}</div>
              <div style={{fontSize:10,color:'var(--muted)',display:'flex',gap:8}}>
                <span><ThumbsUp size={10}/> {r.likes||0}</span>
                <span><Bookmark size={10}/> {tracked.has(r.id)?'tracked':''}</span>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:perf>=0?'var(--gain)':'var(--loss)',flexShrink:0}}>{perf>=0?'+':''}{(perf*100).toFixed(1)}%</div>
          </div>
        );
      })}
      {modal && <RecoCardModal r={modal} me={null} contacts={contacts} groups={[]} setRecsReceived={()=>{}} tracked={new Set()} toggleTrack={()=>{}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ─── HomeFeed — redesigned hero page ──────────────────────────────────────────── */
function HomeFeed({ isMobile, setPage, setRecoInit, recsReceived, setRecsReceived, configs, holdings, contacts, me, assetClasses, setAssetClasses, groups, setRecsMade, tracked, toggleTrack, effectiveFeedConfig, networkEngagementRecos, publicFeedRecos=[], feedConfigOptions, userFeedPrefs, setUserFeedPrefs, globalSearch, connections=[], onPeopleConnect, onShowInvite }) {
  const { total, pnl, pnlPct } = useDerivedHoldings(holdings, configs.allowCryptoAccounts);
  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'there';
  const [showNewReco,    setShowNewReco]    = useState(false);
  const [mobileFeedTab,  setMobileFeedTab]  = useState('feed'); // 'feed' | 'pulse'
  // Merged pool for Pulse widgets: direct deliveries + public platform recommendations
  // Deduped so items already in recsReceived don't appear twice.
  const allFeedRecos = useMemo(() => {
    const seenIds = new Set(recsReceived.map(r => r.id));
    return [
      ...recsReceived,
      ...publicFeedRecos.filter(r => !seenIds.has(r.id)),
    ];
  }, [recsReceived, publicFeedRecos]);

  // Show Pulse notification dot when there's any activity — direct or public
  const hasPulseActivity = contacts.length > 0
    || recsReceived.some(r => !r.hidden)
    || publicFeedRecos.length > 0;
  const [loadedCount,  setLoadedCount]  = useState(20);
  const sentinelRef = useRef(null);

  const feedRecs = useMemo(() => {
    const cfg = effectiveFeedConfig;
    const directIds = new Set(recsReceived.map(r=>r.id));
    let items = recsReceived.filter(r=>!r.hidden).map(r=>({...r, feedSource: r.feedSource||'direct'}));

    // Source 2: recommendations liked/commented on by connections
    if (cfg.src_network_engagement) {
      const extra = networkEngagementRecos.filter(r=>!directIds.has(r.id));
      items = [...items, ...extra];
    }

    // Source 3: public recommendations from all users across the platform
    // cfg.src_public defaults to true (undefined = enabled)
    if (cfg.src_public !== false) {
      const seenIds = new Set(items.map(r=>r.id));
      const pubExtra = publicFeedRecos.filter(r => !seenIds.has(r.id));
      items = [...items, ...pubExtra];
    }

    if (cfg.filter_hide_invested) items = items.filter(r=>!r.invested);
    return items
      .map(r=>({...r, _score: scoreFeedRec(r, tracked, cfg)}))
      .sort((a,b)=>b._score-a._score);
  }, [recsReceived, networkEngagementRecos, publicFeedRecos, tracked, effectiveFeedConfig]);

  // Search filter applied to all currently loaded items
  const visibleFeed = useMemo(() => {
    const q = (globalSearch||'').trim().toLowerCase();
    const base = feedRecs.slice(0, loadedCount);
    if (!q) return base;
    return base.filter(r =>
      r.assetName?.toLowerCase().includes(q) ||
      r.ticker?.toLowerCase().includes(q) ||
      r.byName?.toLowerCase().includes(q) ||
      contacts.find(c=>c.id===r.from)?.name?.toLowerCase().includes(q) ||
      contacts.find(c=>c.id===r.from)?.username?.toLowerCase().includes(q)
    );
  }, [feedRecs, loadedCount, globalSearch, contacts]);

  // Infinite scroll — Intersection Observer on sentinel div
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !globalSearch) setLoadedCount(n => n + 20); },
      { rootMargin: '300px' }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [globalSearch]);

  // Reset page when search changes
  useEffect(() => { setLoadedCount(20); }, [globalSearch]);

  return (
    <>
    {/* ── Mobile: header + tabs merged into one fixed block ──────────────
         Keeps Welcome, Recommend an idea, and Feed/Pulse tabs pinned
         below the topbar at ALL scroll depths. Nothing overlaps content
         because the 104px spacer below reserves the exact same height
         in the flow.                                                 ── */}
    {isMobile && !showNewReco && (
      <div style={{
        position:'fixed', top:64, left:0, right:0, zIndex:185,
        background:'var(--surface)',
        borderBottom:'2px solid var(--line)',
        boxShadow:'0 2px 8px rgba(0,0,0,.07)',
      }}>
        {/* Row 1 — Welcome greeting + Recommend button */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px 0', gap:10,
        }}>
          <span style={{fontSize:17,fontWeight:800,letterSpacing:'-.3px',lineHeight:1.2}}>
            Welcome back, {firstName}! 👋
          </span>
          <button
            className="btn btn-pri btn-sm"
            onClick={()=>setShowNewReco(true)}
            style={{flexShrink:0}}
          >
            <Lightbulb size={14}/> Recommend
          </button>
        </div>
        {/* Row 2 — Feed / Pulse tab switcher */}
        <div role="tablist" style={{display:'flex', gap:8, padding:'8px 16px 8px'}}>
        {[['feed','Feed',null],['pulse','Pulse',hasPulseActivity && mobileFeedTab!=='pulse']].map(([id,label,dot])=>(
          <button key={id} role="tab" aria-selected={mobileFeedTab===id}
            onClick={()=>setMobileFeedTab(id)}
            style={{
              flex:1, height:40, border:'none', borderRadius:10,
              fontFamily:'var(--font)', fontSize:15, fontWeight:800,
              cursor:'pointer', transition:'.15s',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              background: mobileFeedTab===id ? 'var(--accent)' : 'transparent',
              color:       mobileFeedTab===id ? '#fff' : 'var(--muted)',
            }}
          >
            {label}
            {dot && <span style={{width:7,height:7,borderRadius:'50%',
              background:mobileFeedTab===id?'rgba(255,255,255,.7)':'var(--accent)',
              boxShadow:'0 0 6px rgba(109,93,245,.8)',flexShrink:0,
              animation:'pulse-dot 2.2s ease-in-out infinite'}}/>}
          </button>
        ))}
        </div>
      </div>
    )}
    {/* Spacer = fixed header height (10+32+8+40+8+2 = 100px, +4 buffer = 104px).
        Prevents the first feed card from hiding underneath the fixed header. */}
    {isMobile && !showNewReco && <div aria-hidden="true" style={{height:104,flexShrink:0}}/>}

    {/* ── Desktop: normal in-flow header ── */}
    {!isMobile && (
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <span style={{fontSize:22,fontWeight:800,letterSpacing:'-.4px'}}>Welcome back, {firstName}! 👋</span>
        <button className="btn btn-pri btn-sm" onClick={()=>setShowNewReco(true)} style={{marginLeft:'auto'}}>
          <Lightbulb size={14}/> Recommend an idea
        </button>
      </div>
    )}
    <div style={{display:'flex',gap:22,alignItems:'flex-start'}}>

      {/* ── Feed column: JS-controlled visibility on mobile ── */}
      <div style={{
        flex:1, minWidth:0,
        display: isMobile && mobileFeedTab==='pulse' ? 'none' : undefined,
      }}>

        {/* Feed cards */}

        {/* Feed cards — searched via top nav bar */}
        {visibleFeed.length===0
          ? <div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,padding:'48px 32px',textAlign:'center',boxShadow:'var(--shadow)'}}>
              <div style={{fontSize:40,marginBottom:14}}>{globalSearch?'🔍':'🌱'}</div>
              <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>
                {globalSearch?`No results for "${globalSearch}"`:'Your feed is empty'}
              </div>
              <div className="muted small" style={{marginBottom:22,maxWidth:340,margin:'0 auto 22px',lineHeight:1.6}}>
                {globalSearch?'Try a different search term.':'Add people to your network — their recommendations will appear here.'}
              </div>
              {!globalSearch&&<div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-pri btn-sm" onClick={()=>setPage('network')}><Users size={14}/> Add connections</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowNewReco(true)}><Lightbulb size={14}/> Recommend an idea</button>
              </div>}
            </div>
          : (<>
              {visibleFeed.map(r=>(
                <FeedCard key={r.id} r={r} me={me} contacts={contacts} groups={groups}
                  setRecsReceived={setRecsReceived} tracked={tracked} toggleTrack={toggleTrack}/>
              ))}
              {!globalSearch && loadedCount < feedRecs.length && (
                <div ref={sentinelRef} style={{height:8,textAlign:'center',padding:'12px 0',color:'var(--muted)',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  <Loader size={13} className="spin"/> Loading more…
                </div>
              )}
              {(globalSearch || loadedCount >= feedRecs.length) && feedRecs.length > 0 && (
                <div style={{textAlign:'center',padding:'14px 0',color:'var(--muted)',fontSize:12}}>
                  {globalSearch
                    ? `${visibleFeed.length} result${visibleFeed.length!==1?'s':''} in feed`
                    : `✓ All ${feedRecs.length} idea${feedRecs.length!==1?'s':''} loaded`}
                </div>
              )}
            </>)}
      </div>

      {/* ── Pulse column: desktop = fixed 252px aside; mobile = full-width, shown only on Pulse tab ── */}
      <div style={{
        width: isMobile ? '100%' : 252,
        flexShrink: isMobile ? 1 : 0,
        display: isMobile && mobileFeedTab==='feed' ? 'none' : undefined,
      }}>
        {/* Widget #7 — Fresh Ideas (network + public platform) */}
        <FreshWidget recsReceived={allFeedRecos} contacts={contacts} setPage={setPage}/>

        {/* Widget #6 — Tracked Summary Donut */}
        <TrackedSummaryWidget recsReceived={allFeedRecos} tracked={tracked} setPage={setPage} setRecoInit={setRecoInit}/>

        {/* Widget #5 — Missed Opportunities */}
        <MissedOppsWidget recsReceived={allFeedRecos} tracked={tracked} contacts={contacts}/>

        {/* Widget #4 — Trending on Platform */}
        <TrendingWidget recsReceived={allFeedRecos} tracked={tracked} contacts={contacts}/>

        {/* ── Market Intelligence CTA — bottom of Pulse, both mobile + desktop ── */}
        <div style={{
          background:'var(--surface)', border:'1px solid var(--line)',
          borderRadius:16, boxShadow:'var(--shadow)', padding:'16px 18px',
          marginBottom:12,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <TrendingUp size={16} color="var(--accent-ink)"/>
            <span style={{fontWeight:800,fontSize:13}}>Market Intelligence</span>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.55,marginBottom:14}}>
            Explore community consensus, trending stocks and sentiment across all sectors.
          </div>
          <button
            className="btn btn-pri btn-sm"
            style={{width:'100%',justifyContent:'center'}}
            onClick={()=>setPage('market_intel')}
          >
            <TrendingUp size={14}/> Explore Market Intelligence →
          </button>
        </div>

        {/* ── Invite Friends CTA ── */}
        <div style={{
          background:'var(--surface)', border:'1px solid var(--line)',
          borderRadius:16, boxShadow:'var(--shadow)', padding:'16px 18px',
          marginBottom:12,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <UserPlus size={16} color="var(--accent-ink)"/>
            <span style={{fontWeight:800,fontSize:13}}>Invite Friends</span>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.55,marginBottom:14}}>
            Share your personal invite link. Friends who join are auto-added to your circle.
          </div>
          <button
            className="btn btn-soft btn-sm"
            style={{width:'100%',justifyContent:'center'}}
            onClick={onShowInvite}
          >
            <Link size={14}/> Get My Invite Link
          </button>
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
  </>
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

/* ── Admin: Seed Data ────────────────────────────────────────────────────────── */
function AdminSeedData() {
  const VALID_CLASSES    = ['Equity','ETF','Crypto','Bond','Commodity','Other'];
  const VALID_EXCHANGES  = ['NSE','BSE','NYSE','NASDAQ','OTHER'];
  const VALID_HORIZONS   = ['<3m','6m','12m','>2Y'];
  const VALID_CONVICTIONS= ['Low','Medium','High'];
  const VALID_TYPES      = ['Buy','Sell','Hold'];
  const VALID_REG_STATUS = ['self_directed','enthusiast','sebi_ra','sebi_ria'];

  const [file,       setFile]       = useState(null);
  const [parsed,     setParsed]     = useState(null);
  const [parseErrs,  setParseErrs]  = useState([]);
  const [seeding,    setSeeding]    = useState(false);
  const [seedLog,    setSeedLog]    = useState([]);
  const [seedDone,   setSeedDone]   = useState(false);
  const [seedMode,   setSeedMode]   = useState('skip'); // 'skip' | 'replace'

  /* ── Template download ── */
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    /* Sheet 1: Instructions */
    const instr = [
      ['InvestorCircle — Historical Data Seed Template'],[''],
      ['OVERVIEW'],
      ['  1. Fill the Profiles sheet to update user info (matched by email).'],
      ['  2. Fill the Recommendations sheet with historical trade ideas.'],
      ['  3. Upload in Admin → Seed Data, choose a conflict mode, and run.'],[''],
      ['RECOMMENDATIONS — Field Reference'],
      ['Field','Type','Required','Valid Values / Notes'],
      ['username','text','Yes','Must match an existing platform username (set via Admin → Users)'],
      ['asset_name','text','Yes','Full name, e.g. "Reliance Industries Ltd"'],
      ['ticker','text','Yes','Exchange symbol, e.g. RELIANCE, AAPL'],
      ['asset_class','text','Yes','Equity | ETF | Crypto | Bond | Commodity | Other'],
      ['exchange','text','Yes','NSE | BSE | NYSE | NASDAQ | OTHER'],
      ['currency','text','Yes','INR (for NSE/BSE) | USD (for NYSE/NASDAQ)'],
      ['recommendation_type','text','Yes','Buy | Sell | Hold'],
      ['reco_price','number','Yes','Price at time of recommendation'],
      ['target_price','number','No','Price target (leave blank if none)'],
      ['stop_loss','number','No','Stop-loss price (leave blank if none)'],
      ['horizon','text','Yes','<3m | 6m | 12m | >2Y'],
      ['thesis','text','No','Investment rationale (max 500 chars)'],
      ['sector','text','No','e.g. Technology, Financials, Energy'],
      ['conviction','text','Yes','Low | Medium | High'],
      ['created_date','date','Yes','YYYY-MM-DD — date recommendation was made'],
      ['status','text','Yes','active | closed'],
      ['exit_price','number','If closed','Price at exit — sets the return calculation'],
      ['exit_date','date','If closed','YYYY-MM-DD — date the position was closed'],
      ['is_public','text','Yes','Yes | No — whether this appears on the public profile'],
      [''],
      ['HITTING A HIGH ICI SCORE (target 75+/100)'],
      ['Component','Weight','What to do'],
      ['Track record length','15%','Backdate oldest recos 3+ years (e.g. 2022)'],
      ['Recommendation volume','15%','Add 15+ recommendations per user'],
      ['Hit rate','20%','≥80% of closed Buy recos should have exit_price > reco_price'],
      ['Median return','15%','Aim for 20%+ median return across closed Buy recos'],
      ['Risk-adjusted return','15%','High average returns with few large losses helps'],
      ['Transparency','10%','Set is_public = Yes for all recommendations'],
      ['Profile verification','10%','Fill bio + at least 2 social links in Profiles sheet'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Instructions');

    /* Sheet 2: Profiles */
    const profHdr = ['email','first_name','last_name','bio','avatar_color','registration_status','twitter_url','linkedin_url','telegram_url','instagram_url'];
    const profRows = [
      ['rahul@example.com','Rahul','Sharma','Long-term equity investor focused on quality compounders and secular growth themes','#6d5df5','self_directed','https://twitter.com/rahulsharma','https://linkedin.com/in/rahulsharma','',''],
      ['priya@example.com','Priya','Mehta','Thematic investor with conviction in India\'s infrastructure and domestic consumption story','#15924e','self_directed','','https://linkedin.com/in/priyamehta','https://t.me/priyamehta','https://instagram.com/priyamehta'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([profHdr,...profRows]), 'Profiles');

    /* Sheet 3: Recommendations (pre-seeded for HIGH ICI) */
    const recoHdr = ['username','asset_name','ticker','asset_class','exchange','currency','recommendation_type','reco_price','target_price','stop_loss','horizon','thesis','sector','conviction','created_date','status','exit_price','exit_date','is_public'];
    const recoRows = [
      /* ── rahul — closed wins (10) ── */
      ['rahul','Reliance Industries Ltd','RELIANCE','Equity','NSE','INR','Buy',2280,3200,2000,'>2Y','Refinery-to-retail + Jio 5G + Reliance Retail — three growth engines firing together','Energy','High','2022-01-10','closed',3200,'2023-03-15','Yes'],
      ['rahul','Tata Consultancy Services','TCS','Equity','NSE','INR','Buy',3500,4500,3100,'12m','AI adoption driving deal wins; margin recovery underway','Technology','Medium','2022-03-15','closed',4200,'2023-04-20','Yes'],
      ['rahul','HDFC Bank','HDFCBANK','Equity','NSE','INR','Buy',1350,1800,1180,'>2Y','Merger synergies and CASA franchise make this the safest large-cap bank','Financials','High','2022-05-10','closed',1680,'2023-07-15','Yes'],
      ['rahul','Infosys','INFY','Equity','NSE','INR','Buy',1250,1900,1050,'>2Y','Cheap versus TCS with an improving margin trajectory and cloud pipeline','Technology','High','2022-07-20','closed',1850,'2024-01-10','Yes'],
      ['rahul','Asian Paints','ASIANPAINT','Equity','NSE','INR','Buy',2800,3800,2400,'12m','Pricing power + volume recovery post-raw-material peak','Consumer','Medium','2022-10-05','closed',3500,'2023-10-20','Yes'],
      ['rahul','Bajaj Finance','BAJFINANCE','Equity','NSE','INR','Buy',5900,8000,5100,'>2Y','Best-in-class NBFC: consistent 22%+ ROE, strong AUM growth','Financials','High','2023-01-15','closed',7400,'2024-02-10','Yes'],
      ['rahul','Sun Pharmaceutical','SUNPHARMA','Equity','NSE','INR','Buy',950,1600,820,'12m','Specialty US business de-risked; India branded generics growing 15%+ YoY','Healthcare','High','2023-03-20','closed',1480,'2024-07-15','Yes'],
      ['rahul','State Bank of India','SBIN','Equity','NSE','INR','Buy',500,850,420,'>2Y','Credit cost normalisation + NIM expansion = ROE rerating story','Financials','High','2023-05-10','closed',780,'2024-08-20','Yes'],
      ['rahul','Titan Company','TITAN','Equity','NSE','INR','Buy',3200,4200,2700,'>2Y','Jewellery demand structural; CaratLane + Tanishq gaining market share','Consumer','Medium','2023-08-05','closed',3850,'2025-01-15','Yes'],
      ['rahul','Hindustan Unilever','HINDUNILVR','Equity','NSE','INR','Buy',2500,3200,2100,'>2Y','Rural recovery thesis; HPC segment pricing stabilises','Consumer','Medium','2023-10-15','closed',3000,'2025-02-20','Yes'],
      /* ── rahul — closed losses (2 — keeps it real) ── */
      ['rahul','Paytm (One97 Comm.)','PAYTM','Equity','NSE','INR','Buy',600,900,480,'12m','Payment volume growth; path to profitability in sight','Technology','Low','2022-11-20','closed',450,'2023-06-15','Yes'],
      ['rahul','FSN E-Commerce (Nykaa)','NYKAA','Equity','NSE','INR','Buy',140,220,110,'12m','BPC category growing at 25%+ online; Nykaa brand moat','Consumer','Low','2023-02-10','closed',115,'2023-09-15','Yes'],
      /* ── rahul — active (5) ── */
      ['rahul','Tata Motors','TATAMOTORS','Equity','NSE','INR','Buy',800,1200,680,'>2Y','EV transition + JLR order book; cyclical re-rating in progress','Automobiles','High','2024-01-15','active','','','Yes'],
      ['rahul','Adani Enterprises','ADANIENT','Equity','NSE','INR','Buy',2800,4000,2300,'>2Y','Airport + green hydrogen + data centre capex cycle beneficiary','Infrastructure','Medium','2024-06-20','active','','','Yes'],
      ['rahul','Wipro','WIPRO','Equity','NSE','INR','Buy',290,420,245,'12m','New management driving deal ramp; margin guidance conservative','Technology','Medium','2025-01-10','active','','','Yes'],
      ['rahul','LTIMindtree','LTIM','Equity','NSE','INR','Buy',5200,7000,4400,'>2Y','Best mid-cap IT compounder; merger integration complete','Technology','High','2025-03-15','active','','','Yes'],
      ['rahul','Zomato','ZOMATO','Equity','NSE','INR','Buy',230,340,185,'12m','Quick commerce TAM expansion; Blinkit turning profitable','Consumer','Medium','2025-05-10','active','','','Yes'],
      /* ── priya — closed wins (10) ── */
      ['priya','Larsen & Toubro','LT','Equity','NSE','INR','Buy',1800,3800,1550,'>2Y','Infra supercycle: defence + data centres + metro rail + semiconductor fabs','Infrastructure','High','2022-02-10','closed',3500,'2024-01-20','Yes'],
      ['priya','Kotak Mahindra Bank','KOTAKBANK','Equity','NSE','INR','Buy',1750,2400,1500,'>2Y','Best-in-class private bank; liability franchise sets up for long-term NIMs','Financials','High','2022-04-15','closed',2100,'2023-07-10','Yes'],
      ['priya','Dr. Reddy\'s Laboratories','DRREDDY','Equity','NSE','INR','Buy',4500,7000,3900,'>2Y','US generic launches accelerating; GLP-1 + biosimilar pipeline visible','Healthcare','High','2022-08-20','closed',6200,'2024-08-10','Yes'],
      ['priya','Tech Mahindra','TECHM','Equity','NSE','INR','Buy',1050,1700,880,'12m','Telecom spend recovery; new CEO restructuring cost base','Technology','Medium','2022-10-05','closed',1580,'2024-03-15','Yes'],
      ['priya','UltraTech Cement','ULTRACEMCO','Equity','NSE','INR','Buy',7800,12000,6700,'>2Y','Capacity additions + housing demand + infra boost = strong volume visibility','Materials','High','2023-02-15','closed',11000,'2024-10-20','Yes'],
      ['priya','Maruti Suzuki','MARUTI','Equity','NSE','INR','Buy',9500,13500,8200,'>2Y','EV-laggard rerating; SUV mix shift; rural demand recovery','Automobiles','High','2023-05-20','closed',12500,'2025-01-10','Yes'],
      ['priya','Muthoot Finance','MUTHOOTFIN','Equity','NSE','INR','Buy',1200,2500,1000,'>2Y','Gold loan AUM compounding at 20%+; rural credit demand resilient','Financials','Medium','2023-08-10','closed',2200,'2025-03-15','Yes'],
      ['priya','ONGC','ONGC','Equity','NSE','INR','Buy',210,320,175,'12m','Government capex + high crude realisation; cheap on P/B','Energy','Medium','2024-01-15','closed',310,'2025-02-20','Yes'],
      ['priya','Bharat Electronics','BEL','Equity','NSE','INR','Buy',170,310,140,'12m','Defence order book doubling; import substitution policy tailwind','Defence','High','2024-03-10','closed',290,'2025-04-15','Yes'],
      ['priya','Nestle India','NESTLEIND','Equity','NSE','INR','Buy',21000,28000,18500,'>2Y','Premiumisation + distribution deepening; pricing power in staples','Consumer','Medium','2024-06-20','closed',26500,'2025-06-10','Yes'],
      /* ── priya — closed losses (2) ── */
      ['priya','IndiaMART InterMesh','INDIAMART','Equity','NSE','INR','Buy',5000,7000,4200,'12m','SME digital adoption + premium subscriber growth story','Technology','Low','2022-11-10','closed',3800,'2023-09-15','Yes'],
      ['priya','Avenue Supermarts (DMart)','DMART','Equity','NSE','INR','Buy',4200,5500,3600,'>2Y','EDLC model + store expansion; quick commerce threat overstated','Consumer','Low','2023-03-20','closed',3600,'2024-02-10','Yes'],
      /* ── priya — active (3) ── */
      ['priya','Coal India','COALINDIA','Equity','NSE','INR','Buy',480,680,390,'12m','Volume growth + e-auction premium; underowned by FIIs','Energy','Medium','2024-08-15','active','','','Yes'],
      ['priya','Power Finance Corp.','PFC','Equity','NSE','INR','Buy',430,650,360,'>2Y','RE lending growth + dividends; government backing reduces credit risk','Financials','Medium','2025-01-20','active','','','Yes'],
      ['priya','Hindustan Copper','HINDCOPPER','Equity','NSE','INR','Buy',290,480,230,'>2Y','Copper supply deficit global + domestic capex in EV + renewables','Materials','Medium','2025-04-10','active','','','Yes'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([recoHdr,...recoRows]), 'Recommendations');

    XLSX.writeFile(wb, 'InvestorCircle_Seed_Template.xlsx');
  };

  /* ── Parse uploaded file ── */
  const parseDate = (v) => {
    if(!v) return null;
    if(v instanceof Date) return v.toISOString().slice(0,10);
    const s = String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0,10);
  };

  const handleFile = (f) => {
    setFile(f); setParsed(null); setParseErrs([]); setSeedLog([]); setSeedDone(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type:'binary', cellDates:true });
        const errs = [];

        /* Profiles */
        let profiles = [];
        if(wb.SheetNames.includes('Profiles')) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['Profiles'], { defval:'' });
          profiles = rows.filter(r=>r.email).map((r,i)=>{
            if(!r.email) errs.push(`Profiles row ${i+2}: email required`);
            return {
              email: String(r.email||'').trim().toLowerCase(),
              first_name: String(r.first_name||'').trim(),
              last_name:  String(r.last_name||'').trim(),
              bio:        String(r.bio||'').trim().slice(0,300) || null,
              avatar_color:        String(r.avatar_color||'').trim() || null,
              registration_status: String(r.registration_status||'self_directed').trim(),
              twitter_url:   String(r.twitter_url||'').trim()   || null,
              linkedin_url:  String(r.linkedin_url||'').trim()  || null,
              telegram_url:  String(r.telegram_url||'').trim()  || null,
              instagram_url: String(r.instagram_url||'').trim() || null,
            };
          });
        }

        /* Recommendations */
        let recos = [];
        if(wb.SheetNames.includes('Recommendations')) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['Recommendations'], { defval:'' });
          recos = rows.filter(r=>r.username&&r.ticker).map((r,i)=>{
            const row = i+2; const rowErrs = [];
            if(!r.asset_name)    rowErrs.push('asset_name');
            if(!r.reco_price)    rowErrs.push('reco_price');
            if(!r.created_date)  rowErrs.push('created_date');
            const isClosed = String(r.status||'').trim().toLowerCase()==='closed';
            if(isClosed && !r.exit_price) rowErrs.push('exit_price (closed)');
            if(isClosed && !r.exit_date)  rowErrs.push('exit_date (closed)');
            if(rowErrs.length) errs.push(`Recos row ${row} (@${r.username} ${r.ticker}): missing ${rowErrs.join(', ')}`);
            const recoPrice = Number(r.reco_price)||0;
            const exitPrice = r.exit_price ? Number(r.exit_price) : null;
            return {
              username:            String(r.username||'').trim().toLowerCase(),
              asset_name:          String(r.asset_name||'').trim(),
              ticker:              String(r.ticker||'').trim().toUpperCase(),
              asset_class:         String(r.asset_class||'Equity').trim(),
              exchange:            String(r.exchange||'NSE').trim().toUpperCase(),
              currency:            String(r.currency||'INR').trim().toUpperCase(),
              recommendation_type: String(r.recommendation_type||'Buy').trim(),
              reco_price:    recoPrice,
              current_price: isClosed ? (exitPrice||recoPrice) : recoPrice,
              target_price:  r.target_price ? Number(r.target_price) : null,
              stop_loss:     r.stop_loss    ? Number(r.stop_loss)    : null,
              horizon:    String(r.horizon||'12m').trim(),
              thesis:     String(r.thesis||'').trim().slice(0,500) || null,
              sector:     String(r.sector||'').trim() || null,
              conviction: String(r.conviction||'Medium').trim(),
              is_public:  String(r.is_public||'Yes').trim().toLowerCase() !== 'no',
              created_date: parseDate(r.created_date),
              status:    isClosed ? 'closed' : 'active',
              exit_price: exitPrice,
              exit_date:  isClosed ? parseDate(r.exit_date) : null,
              _rowErrs: rowErrs,
            };
          });
        }

        setParseErrs(errs);
        setParsed({ profiles, recos });
      } catch(err) {
        setParseErrs([`Could not parse file: ${err.message}`]);
      }
    };
    reader.readAsBinaryString(f);
  };

  /* ── Seed ── */
  const handleSeed = async () => {
    if(!parsed||!sql) return;
    setSeeding(true); setSeedLog([]); setSeedDone(false);
    const log = (msg, type='info') => setSeedLog(l=>[...l,{msg,type,t:new Date().toLocaleTimeString()}]);

    /* 1 — Profiles */
    if(parsed.profiles.length) {
      log(`── Profiles (${parsed.profiles.length} rows) ──`);
      let ok=0, fail=0;
      for(const p of parsed.profiles) {
        try {
          const res = await sql`
            UPDATE user_profiles SET
              first_name=${p.first_name||null}, last_name=${p.last_name||null},
              full_name=${[p.first_name,p.last_name].filter(Boolean).join(' ')||null},
              bio=${p.bio}, avatar_color=${p.avatar_color},
              registration_status=${p.registration_status||'self_directed'},
              twitter_url=${p.twitter_url}, linkedin_url=${p.linkedin_url},
              telegram_url=${p.telegram_url}, instagram_url=${p.instagram_url}
            WHERE email=${p.email} RETURNING id`;
          if(res.length){ ok++; log(`✓ ${p.email} — profile updated`,'success'); }
          else { fail++; log(`⚠ ${p.email} — no user found (create account first)`,'warn'); }
        } catch(e){ fail++; log(`✗ ${p.email} — ${e.message}`,'error'); }
      }
      log(`Profiles done: ${ok} updated, ${fail} failed`);
    }

    /* 2 — Recommendations: build username→id map */
    if(parsed.recos.length) {
      log(`── Recommendations (${parsed.recos.length} rows) ──`);
      const usernames = [...new Set(parsed.recos.map(r=>r.username))];
      const userMap = {};
      for(const uname of usernames) {
        try {
          const rows = await sql`SELECT id FROM user_profiles WHERE username=${uname} LIMIT 1`;
          if(rows.length){ userMap[uname]=rows[0].id; log(`Found user: @${uname}`); }
          else log(`⚠ @${uname} not found — create account and set username first`,'warn');
        } catch(e){ log(`✗ Lookup @${uname}: ${e.message}`,'error'); }
      }

      /* Replace mode: delete all existing recos for found users */
      if(seedMode==='replace') {
        for(const [uname,uid] of Object.entries(userMap)) {
          try {
            const del = await sql`DELETE FROM ic_recommendations WHERE recommender_id=${uid} RETURNING id`;
            log(`🗑 Deleted ${del.length} existing recos for @${uname}`,'warn');
          } catch(e){ log(`✗ Delete @${uname}: ${e.message}`,'error'); }
        }
      }

      let ok=0, skipped=0, fail=0;
      for(const r of parsed.recos) {
        const uid = userMap[r.username];
        if(!uid){ skipped++; log(`↷ Skip (no user): ${r.ticker} @${r.username}`,'warn'); continue; }
        if(r._rowErrs.length){ skipped++; log(`↷ Skip (errors): ${r.ticker} — ${r._rowErrs.join(', ')}`,'warn'); continue; }

        /* Skip-mode dedup: (recommender_id, ticker, created_date) */
        if(seedMode==='skip') {
          try {
            const ex = await sql`SELECT id FROM ic_recommendations WHERE recommender_id=${uid} AND ticker=${r.ticker} AND created_at::date=${r.created_date} LIMIT 1`;
            if(ex.length){ skipped++; log(`↷ Skip (exists): ${r.ticker} on ${r.created_date}`); continue; }
          } catch(_){}
        }

        try {
          await sql`
            INSERT INTO ic_recommendations (
              recommender_id, asset_name, ticker, asset_class, exchange,
              recommendation_type, reco_price, current_price, target_price, stop_loss,
              horizon, thesis, sector, conviction, is_public,
              created_at, exit_signal, exit_date
            ) VALUES (
              ${uid}, ${r.asset_name}, ${r.ticker}, ${r.asset_class}, ${r.exchange},
              ${r.recommendation_type}, ${r.reco_price}, ${r.current_price},
              ${r.target_price}, ${r.stop_loss},
              ${r.horizon}, ${r.thesis}, ${r.sector}, ${r.conviction}, ${r.is_public},
              ${r.created_date + 'T09:00:00.000Z'},
              ${r.status==='closed'}, ${r.exit_date}
            )`;
          ok++; log(`✓ ${r.ticker} by @${r.username} — ${r.status}${r.exit_price?` @ exit ₹${r.exit_price}`:''}`,'success');
        } catch(e){ fail++; log(`✗ ${r.ticker}: ${e.message}`,'error'); }
      }
      log(`Recommendations done: ${ok} inserted, ${skipped} skipped, ${fail} failed`);
    }

    log(`── All done ──`,'success');
    setSeeding(false); setSeedDone(true);
  };

  /* ── Computed preview stats ── */
  const stats = parsed ? (() => {
    const closed = parsed.recos.filter(r=>r.status==='closed');
    const wins   = closed.filter(r=>r.recommendation_type==='Buy'&&r.exit_price>r.reco_price);
    const hitRate = closed.length ? Math.round(wins.length/closed.length*100) : 0;
    const returns = wins.map(r=>((r.exit_price-r.reco_price)/r.reco_price*100));
    const sorted  = [...returns].sort((a,b)=>a-b);
    const median  = sorted.length ? (sorted.length%2===0 ? (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2 : sorted[Math.floor(sorted.length/2)]) : 0;
    return { hitRate, closedCount:closed.length, median: median.toFixed(1) };
  })() : null;

  /* ── Render ── */
  const inputStyle = {display:'none'};
  const labelStyle = {display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer',padding:'10px 18px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,fontSize:13,fontWeight:600,color:'var(--ink)',transition:'.12s'};

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <div className="page-title">Seed Historical Data</div>
          <div className="page-sub">Bootstrap the platform with realistic track records and recommendations for launch</div>
        </div>
      </div>

      {/* Step 1 — Download template */}
      <div className="card" style={{marginBottom:14}}>
        <div className="card-head"><span style={{display:'flex',alignItems:'center',gap:7}}><span style={{fontSize:16}}>①</span> Download Template</span></div>
        <div className="card-body">
          <p style={{margin:'0 0 14px',fontSize:13,color:'var(--muted)',lineHeight:1.6}}>
            Download the Excel template. It includes an Instructions sheet, a Profiles sheet (to update user bios/socials), and a Recommendations sheet pre-populated with sample data for two users designed to produce an ICI score of <strong>≥80/100</strong>. Replace the sample usernames/emails with your friends' actual accounts.
          </p>
          <button className="btn btn-soft" onClick={downloadTemplate}><Download size={14}/> Download Excel Template</button>
          <div style={{marginTop:10,fontSize:12,color:'var(--muted)'}}>Tip: User accounts must be created first via Admin → Users. Then set their username via Edit Profile before seeding.</div>
        </div>
      </div>

      {/* Step 2 — Upload */}
      <div className="card" style={{marginBottom:14}}>
        <div className="card-head"><span style={{display:'flex',alignItems:'center',gap:7}}><span style={{fontSize:16}}>②</span> Upload Filled Template</span></div>
        <div className="card-body">
          <input type="file" accept=".xlsx,.xls" id="seed-upload" style={inputStyle} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>
          <label htmlFor="seed-upload" style={labelStyle}>
            <Upload size={14}/> {file ? file.name : 'Choose Excel file (.xlsx)…'}
          </label>
          {parseErrs.length>0 && (
            <div style={{marginTop:12,background:'rgba(244,63,94,.07)',border:'1px solid rgba(244,63,94,.2)',borderRadius:9,padding:'12px 14px'}}>
              <div style={{fontWeight:700,fontSize:12,color:'#f43f5e',marginBottom:6,textTransform:'uppercase',letterSpacing:'.04em'}}>Validation Issues</div>
              {parseErrs.slice(0,12).map((e,i)=><div key={i} style={{fontSize:12,color:'#f43f5e',marginBottom:3}}>• {e}</div>)}
              {parseErrs.length>12&&<div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>…and {parseErrs.length-12} more</div>}
            </div>
          )}
        </div>
      </div>

      {/* Step 3 — Preview & seed */}
      {parsed && (
        <div className="card" style={{marginBottom:14}}>
          <div className="card-head"><span style={{display:'flex',alignItems:'center',gap:7}}><span style={{fontSize:16}}>③</span> Preview & Run Seed</span></div>
          <div className="card-body">

            {/* Summary stats */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:20}}>
              {[
                {label:'Profiles',       val:parsed.profiles.length,                                       col:'var(--accent)'},
                {label:'Total Recos',    val:parsed.recos.length,                                          col:'var(--ink)'},
                {label:'Closed',         val:parsed.recos.filter(r=>r.status==='closed').length,           col:'var(--muted)'},
                {label:'Hit Rate (est.)',val:stats?`${stats.hitRate}%`:'—',                                col:stats?.hitRate>=70?'var(--gain)':'var(--loss)'},
                {label:'Median Return',  val:stats?.closedCount>0?`+${stats.median}%`:'—',                 col:'var(--gain)'},
              ].map(s=>(
                <div key={s.label} style={{background:'var(--surface-2)',borderRadius:10,padding:'12px 14px',border:'1px solid var(--line)',textAlign:'center'}}>
                  <div style={{fontSize:20,fontWeight:900,color:s.col,letterSpacing:'-1px',lineHeight:1}}>{s.val}</div>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginTop:5,lineHeight:1.3}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Conflict mode */}
            <div style={{marginBottom:18}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Conflict mode</div>
              <div style={{display:'flex',gap:10}}>
                {[
                  {val:'skip',    label:'Skip existing',  desc:'Insert only; skip if (user + ticker + date) already in DB — safe to re-run'},
                  {val:'replace', label:'Replace all',    desc:'Delete ALL existing recos for each seeded user, then re-insert — use to correct data'},
                ].map(o=>(
                  <label key={o.val} style={{display:'flex',gap:8,cursor:'pointer',padding:'10px 14px',borderRadius:10,background:seedMode===o.val?'rgba(109,93,245,.1)':'var(--surface-2)',border:`1px solid ${seedMode===o.val?'rgba(109,93,245,.45)':'var(--line)'}`,flex:1,transition:'.15s'}}>
                    <input type="radio" name="seedMode" value={o.val} checked={seedMode===o.val} onChange={()=>setSeedMode(o.val)} style={{accentColor:'var(--accent)',marginTop:2,flexShrink:0}}/>
                    <div><div style={{fontSize:13,fontWeight:700,color:'var(--ink)'}}>{o.label}</div><div style={{fontSize:11,color:'var(--muted)',marginTop:2,lineHeight:1.4}}>{o.desc}</div></div>
                  </label>
                ))}
              </div>
              {seedMode==='replace'&&<div style={{marginTop:8,fontSize:12,color:'#f59e0b',display:'flex',alignItems:'center',gap:6}}><AlertTriangle size={13}/> Replace mode permanently deletes all recommendations for the seeded users before re-inserting. Confirm before running.</div>}
            </div>

            {/* Profiles preview */}
            {parsed.profiles.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Profiles ({parsed.profiles.length})</div>
                <div className="tscroll">
                  <table className="grid">
                    <thead><tr><th>Email</th><th>Name</th><th>Reg Status</th><th>Bio (preview)</th><th>Socials</th></tr></thead>
                    <tbody>{parsed.profiles.map((p,i)=>(
                      <tr key={i}>
                        <td style={{fontWeight:600}}>{p.email}</td>
                        <td>{[p.first_name,p.last_name].filter(Boolean).join(' ')||'—'}</td>
                        <td><span className="pill">{p.registration_status}</span></td>
                        <td style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--muted)',fontSize:12}}>{p.bio||'—'}</td>
                        <td style={{fontSize:12,color:'var(--muted)'}}>{[p.twitter_url&&'𝕏',p.linkedin_url&&'LinkedIn',p.telegram_url&&'Telegram',p.instagram_url&&'Instagram'].filter(Boolean).join(' · ')||'—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recos preview */}
            {parsed.recos.length>0&&(
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Recommendations ({parsed.recos.length})</div>
                <div className="tscroll">
                  <table className="grid">
                    <thead><tr><th>User</th><th>Ticker</th><th>Asset</th><th>Type</th><th>Reco ₹</th><th>Horizon</th><th>Status</th><th>Exit ₹</th><th>Return</th><th>Date</th><th>Public</th></tr></thead>
                    <tbody>{parsed.recos.map((r,i)=>{
                      const ret = r.status==='closed'&&r.exit_price&&r.reco_price
                        ? ((r.exit_price-r.reco_price)/r.reco_price*100).toFixed(1) : null;
                      const win = ret!==null ? Number(ret)>0 : null;
                      return (
                        <tr key={i} style={r._rowErrs.length?{background:'rgba(244,63,94,.05)'}:{}}>
                          <td style={{fontWeight:600,color:'var(--accent)'}}>@{r.username}</td>
                          <td style={{fontWeight:800}}>{r.ticker}</td>
                          <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}}>{r.asset_name}</td>
                          <td><span style={{fontWeight:700,color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>{r.recommendation_type}</span></td>
                          <td>{Number(r.reco_price).toLocaleString('en-IN')}</td>
                          <td style={{fontSize:12,color:'var(--muted)'}}>{r.horizon}</td>
                          <td><span className="pill" style={{color:r.status==='closed'?'var(--muted)':'var(--gain)'}}>{r.status}</span></td>
                          <td style={{fontSize:12}}>{r.exit_price?Number(r.exit_price).toLocaleString('en-IN'):'—'}</td>
                          <td style={{fontWeight:700,color:win===null?'var(--muted)':win?'var(--gain)':'var(--loss)'}}>{ret!==null?`${Number(ret)>0?'+':''}${ret}%`:'—'}</td>
                          <td style={{fontSize:12,color:'var(--muted)',whiteSpace:'nowrap'}}>{r.created_date}</td>
                          <td style={{textAlign:'center'}}>{r.is_public?<Check size={13} color="var(--gain)"/>:'—'}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Run button */}
            <div style={{borderTop:'1px solid var(--line)',paddingTop:16}}>
              <button className="btn btn-pri" disabled={seeding||!sql} onClick={handleSeed} style={{minWidth:140}}>
                {seeding?<><Loader size={14} className="spin"/> Seeding…</>:<><Sparkles size={14}/> Run Seed</>}
              </button>
              {!sql&&<span style={{marginLeft:12,fontSize:12,color:'var(--loss)'}}>Database not connected</span>}
            </div>
          </div>
        </div>
      )}

      {/* Seed log */}
      {seedLog.length>0&&(
        <div className="card">
          <div className="card-head">
            <span>Seed Log</span>
            {seedDone&&<span className="pill" style={{background:'rgba(74,222,128,.15)',color:'var(--gain)',border:'1px solid rgba(74,222,128,.3)'}}>Complete</span>}
            {seeding&&<Loader size={14} className="spin" color="var(--muted)"/>}
          </div>
          <div className="card-body">
            <div style={{background:'#0d0e1a',borderRadius:10,padding:'14px 16px',fontFamily:'monospace',fontSize:12,lineHeight:1.7,maxHeight:380,overflowY:'auto',color:'#c8c8d8',border:'1px solid rgba(255,255,255,.05)'}}>
              {seedLog.map((l,i)=>(
                <div key={i} style={{color:l.type==='error'?'#f87171':l.type==='warn'?'#fbbf24':l.type==='success'?'#4ade80':'#c8c8d8'}}>
                  <span style={{opacity:.4,marginRight:10,userSelect:'none'}}>{l.t}</span>{l.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Admin: Feed Config ──────────────────────────────────────────────────────── */
function AdminFeedConfig({ feedConfigOptions, setFeedConfigOptions, setEffectiveFeedConfig, userFeedPrefs }) {
  const [saving, setSaving] = useState(null);
  const categories = ['sources','ranking','filters'];
  const catLabel = {sources:'Feed Sources',ranking:'Ranking & Boosting',filters:'Filters'};

  const toggle = async (opt, field, value) => {
    if (field==='admin_enabled' && opt.always_on && !value) {
      alert('Uncheck "Always On" first before disabling this option.');
      return;
    }
    setSaving(opt.key+'.'+field);
    const updated = {...opt,[field]:value};
    const newOpts = feedConfigOptions.map(o=>o.key===opt.key?updated:o);
    setFeedConfigOptions(newOpts);
    const effective = {};
    newOpts.forEach(o=>{
      if(!o.admin_enabled){effective[o.key]=false;return;}
      if(o.always_on){effective[o.key]=true;return;}
      effective[o.key]=(o.key in userFeedPrefs)?userFeedPrefs[o.key]:o.default_on;
    });
    setEffectiveFeedConfig(effective);
    if(sql){
      try{
        if(field==='admin_enabled') await sql`UPDATE feed_config_options SET admin_enabled=${value} WHERE key=${opt.key}`;
        if(field==='always_on')     await sql`UPDATE feed_config_options SET always_on=${value} WHERE key=${opt.key}`;
        if(field==='default_on')    await sql`UPDATE feed_config_options SET default_on=${value} WHERE key=${opt.key}`;
      }catch(e){console.warn('Feed config update:',e);}
    }
    setSaving(null);
  };

  return (<div>
    <div className="page-head"><div>
      <div className="eyebrow">Admin</div>
      <div className="page-title">Feed Settings</div>
      <div className="page-sub">Control what appears in all users' recommendation feeds — changes take effect immediately</div>
    </div></div>
    <div className="note info" style={{marginBottom:20}}>
      <Flame size={15}/>
      <div><b>Two-level config:</b> Admin controls which options exist and their defaults. Users can personalise non-locked options in Sharing &amp; Privacy. <b>Always On 🔒</b> options cannot be changed by users.</div>
    </div>
    {categories.map(cat=>(
      <div key={cat} className="card" style={{marginBottom:16}}>
        <div className="card-head">{catLabel[cat]}</div>
        <div className="card-body" style={{padding:0}}>
          <table className="grid" style={{width:'100%'}}>
            <thead><tr>
              <th style={{width:'30%'}}>Option</th>
              <th>Description</th>
              <th style={{width:120,textAlign:'center'}}>Admin Enabled</th>
              <th style={{width:120,textAlign:'center'}} title="Users cannot override — always active">Always On 🔒</th>
              <th style={{width:120,textAlign:'center'}} title="Default state for users who haven't customised">Default On</th>
            </tr></thead>
            <tbody>{feedConfigOptions.filter(o=>o.category===cat).map(o=>(
              <tr key={o.key} className={!o.admin_enabled?'dimmed':''}>
                <td><b style={{fontSize:13}}>{o.label}</b></td>
                <td style={{fontSize:12,color:'var(--ink-soft)'}}>{o.description}</td>
                <td style={{textAlign:'center'}}>
                  <div className={"sw"+(o.admin_enabled?" on":"")} style={{margin:'0 auto',width:36,height:20}}
                    onClick={()=>toggle(o,'admin_enabled',!o.admin_enabled)}>
                    <div className="knob" style={{width:14,height:14,top:3}}/>
                  </div>
                </td>
                <td style={{textAlign:'center'}}>
                  {o.admin_enabled
                    ? <div className={"sw"+(o.always_on?" on":"")} style={{margin:'0 auto',width:36,height:20,background:o.always_on?'#7c3aed':undefined}}
                        onClick={()=>toggle(o,'always_on',!o.always_on)}>
                        <div className="knob" style={{width:14,height:14,top:3}}/>
                      </div>
                    : <span className="muted small">—</span>}
                </td>
                <td style={{textAlign:'center'}}>
                  {o.admin_enabled&&!o.always_on
                    ? <div className={"sw"+(o.default_on?" on":"")} style={{margin:'0 auto',width:36,height:20}}
                        onClick={()=>toggle(o,'default_on',!o.default_on)}>
                        <div className="knob" style={{width:14,height:14,top:3}}/>
                      </div>
                    : <span className="muted small">—</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    ))}
  </div>);
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
  const removeMember=(gid,mid)=>setGroups(gs=>gs.map(g=>g.id===gid?{...g,members:(g.members||[]).filter(m=>m!==mid)}:g));
  const renameGroup=(gid,newName)=>setGroups(gs=>gs.map(g=>g.id===gid?{...g,name:newName}:g));
  const deleteGroup=(g)=>{ if(confirm(`Delete "${g.name}"? All members will lose access. This cannot be undone.`)) setGroups(gs=>gs.filter(x=>x.id!==g.id)); };
  return (<>
    <div className="page-head"><div><div className="eyebrow">Admin</div><div className="page-title">Groups</div><div className="page-sub">All groups on the platform · used for sharing and recommendations</div></div>
      <button className="btn btn-pri" onClick={()=>setShowNew(true)}><Plus size={16}/> Create group</button></div>
    {groups.length===0 && <div className="card"><div className="empty">No groups yet. Create one to get started.</div></div>}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(330px,1fr))", gap:16 }}>
      {groups.map(g=>{
        const admins = Array.isArray(g.admins) ? g.admins : [];
        const members = Array.isArray(g.members) ? g.members : [];
        const iAmAdmin=admins.includes("me")||admins.includes(myId);
        return (<div key={g.id} className="card"><div className="card-body">
          <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:13 }}>
            <div className="av" style={{ width:44, height:44, background:g.color }}><Layers size={19}/></div>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{g.name}</div><div className="muted small">{members.length} members · created {fmtDate(g.created)}</div></div>
            {iAmAdmin && <div style={{display:"flex",gap:6}}>
              <button className="iconbtn" title="Rename group" onClick={()=>setEditGroup(g)}><Pencil size={14}/></button>
              <button className="iconbtn danger" title="Delete group" onClick={()=>deleteGroup(g)}><Trash2 size={14}/></button>
            </div>}
          </div>
          <div className="small muted" style={{marginBottom:8}}>Admins: {admins.map(nameOfM).join(", ")||"—"}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {members.map(mid=><span key={typeof mid==='object'?mid.user_id:mid} className="pill">{nameOfM(typeof mid==='object'?mid.user_id:mid)} <X size={13} style={{cursor:"pointer"}} onClick={()=>removeMember(g.id,mid)}/></span>)}
            {members.length===0 && <span className="muted small">No members yet</span>}</div>
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

/* =================================================================== ABOUT PAGE */

/* ── RichTextEditor — contentEditable-based with toolbar ─────────────────────── */
function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const [fmts, setFmts] = useState({});

  // Set initial content once on mount
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = value || '';
  }, []); // eslint-disable-line

  const refreshFmts = () => setFmts({
    bold:          document.queryCommandState('bold'),
    italic:        document.queryCommandState('italic'),
    underline:     document.queryCommandState('underline'),
    strikeThrough: document.queryCommandState('strikeThrough'),
    justifyLeft:   document.queryCommandState('justifyLeft'),
    justifyCenter: document.queryCommandState('justifyCenter'),
    justifyRight:  document.queryCommandState('justifyRight'),
  });

  // Execute a command (use onMouseDown + preventDefault to keep selection)
  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    onChange(editorRef.current?.innerHTML || '');
    setTimeout(refreshFmts, 10);
  };

  const handleInput  = () => onChange(editorRef.current?.innerHTML || '');
  const handleKeyUp  = refreshFmts;
  const handleMouseUp = refreshFmts;

  const Btn = ({ cmd, val, children, title }) => (
    <button
      className={'rte-btn' + (fmts[cmd] ? ' active' : '')}
      title={title || cmd}
      onMouseDown={e => { e.preventDefault(); exec(cmd, val); }}
    >{children}</button>
  );

  return (
    <div style={{border:'1px solid var(--line)',borderRadius:12,overflow:'hidden'}}>
      {/* ── Toolbar ── */}
      <div className="rte-toolbar">

        {/* Block format */}
        <select className="rte-select" style={{width:120}}
          onChange={e=>{ exec('formatBlock', e.target.value); e.target.value=''; }}>
          <option value="" disabled>¶ Block</option>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Blockquote</option>
          <option value="pre">Code block</option>
        </select>

        {/* Font size (execCommand sizes 1–7) */}
        <select className="rte-select" style={{width:96}}
          onChange={e=>{ exec('fontSize', e.target.value); e.target.value=''; }}>
          <option value="" disabled>Aa Size</option>
          <option value="1">Tiny</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Medium</option>
          <option value="5">Large</option>
          <option value="6">X-Large</option>
          <option value="7">Huge</option>
        </select>

        <div className="rte-sep"/>

        {/* Inline styles */}
        <Btn cmd="bold"          title="Bold (Ctrl+B)">          <b>B</b></Btn>
        <Btn cmd="italic"        title="Italic (Ctrl+I)">        <i>I</i></Btn>
        <Btn cmd="underline"     title="Underline (Ctrl+U)">     <u>U</u></Btn>
        <Btn cmd="strikeThrough" title="Strikethrough">          <s>S</s></Btn>

        <div className="rte-sep"/>

        {/* Text colour */}
        <label className="rte-btn" title="Text colour" style={{gap:5,cursor:'pointer'}}>
          <span style={{fontSize:13,fontWeight:700}}>A</span>
          <input type="color" defaultValue="#13142b"
            onChange={e=>exec('foreColor', e.target.value)}
            style={{width:16,height:16,border:'none',padding:0,cursor:'pointer',borderRadius:3,flexShrink:0}}/>
        </label>

        {/* Highlight colour */}
        <label className="rte-btn" title="Highlight colour" style={{gap:5,cursor:'pointer'}}>
          <span style={{fontSize:13}}>🖊</span>
          <input type="color" defaultValue="#fffde7"
            onChange={e=>exec('hiliteColor', e.target.value)}
            style={{width:16,height:16,border:'none',padding:0,cursor:'pointer',borderRadius:3,flexShrink:0}}/>
        </label>

        <div className="rte-sep"/>

        {/* Alignment */}
        <Btn cmd="justifyLeft"   title="Align left">   ≡←</Btn>
        <Btn cmd="justifyCenter" title="Centre">       ≡↔</Btn>
        <Btn cmd="justifyRight"  title="Align right">  ≡→</Btn>

        <div className="rte-sep"/>

        {/* Lists */}
        <Btn cmd="insertUnorderedList" title="Bullet list">• —</Btn>
        <Btn cmd="insertOrderedList"   title="Numbered list">1. —</Btn>

        {/* Indent / Outdent */}
        <Btn cmd="indent"  title="Increase indent">→</Btn>
        <Btn cmd="outdent" title="Decrease indent">←</Btn>

        <div className="rte-sep"/>

        {/* Undo / Redo */}
        <Btn cmd="undo" title="Undo (Ctrl+Z)">↩</Btn>
        <Btn cmd="redo" title="Redo (Ctrl+Y)">↪</Btn>

        {/* Clear formatting */}
        <button className="rte-btn" title="Remove formatting"
          onMouseDown={e=>{ e.preventDefault(); exec('removeFormat'); }}>
          ✕ fmt
        </button>

        {/* Horizontal rule */}
        <button className="rte-btn" title="Insert divider"
          onMouseDown={e=>{ e.preventDefault(); exec('insertHorizontalRule'); }}>
          ───
        </button>
      </div>

      {/* ── Editable area ── */}
      <div
        ref={editorRef}
        className="rte-area ql-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Start writing your About Us content here…"
        onInput={handleInput}
        onKeyUp={handleKeyUp}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}

/* ── AboutPage — investor-facing view ───────────────────────────────────────── */
function AboutPage() {
  const [html,    setHtml]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sql) { setLoading(false); return; }
    sql`SELECT value FROM app_settings WHERE key='about_us_content' LIMIT 1`
      .then(rows => { setHtml(rows[0]?.value || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">About</div>
          <div className="page-title">My Investor Circle</div>
        </div>
      </div>

      {loading
        ? <div style={{textAlign:'center',padding:'60px 0',color:'var(--muted)'}}>
            <Loader size={24} className="spin" style={{marginBottom:12}}/>
            <div>Loading…</div>
          </div>
        : <div>
            <div className="card">
              <div className="card-body" style={{padding:'32px 36px'}}>
                <div
                  className="ql-content"
                  dangerouslySetInnerHTML={{ __html: html || ABOUT_DEFAULT_HTML }}
                />
              </div>
            </div>
          </div>
      }
    </>
  );
}

/* ── AdminAboutEditor — admin rich-text editor for About Us content ─────────── */
function AdminAboutEditor() {
  const [html,    setHtml]    = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [tab,     setTab]     = useState('edit'); // 'edit' | 'preview'

  useEffect(() => {
    if (!sql) { setHtml(ABOUT_DEFAULT_HTML); setLoading(false); return; }
    sql`SELECT value FROM app_settings WHERE key='about_us_content' LIMIT 1`
      .then(rows => { setHtml(rows[0]?.value || ABOUT_DEFAULT_HTML); setLoading(false); })
      .catch(() => { setHtml(ABOUT_DEFAULT_HTML); setLoading(false); });
  }, []);

  const save = async () => {
    if (!sql) return;
    setSaving(true);
    try {
      await sql`INSERT INTO app_settings(key,value) VALUES('about_us_content',${html})
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch(e) { console.warn('Save about content:', e); }
    setSaving(false);
  };

  const resetDefault = () => {
    if (!confirm('Reset to the built-in default content? This will discard any saved edits.')) return;
    setHtml(ABOUT_DEFAULT_HTML);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <div className="page-title">About Us Content</div>
          <div className="page-sub">Edits here update the About MIC page that all investors see — no code changes needed.</div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {saved && (
            <span className="pill gain" style={{padding:'6px 12px',fontSize:12,display:'flex',alignItems:'center',gap:5}}>
              <Check size={13}/> Saved
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={resetDefault}>Reset to default</button>
          <button className="btn btn-pri" disabled={saving||loading} onClick={save}>
            {saving ? <><Loader size={14} className="spin"/> Saving…</> : <><Check size={14}/> Save & publish</>}
          </button>
        </div>
      </div>

      {/* Edit / Preview tabs */}
      <div className="seg" style={{marginBottom:18}}>
        <button className={tab==='edit'?'active':''} onClick={()=>setTab('edit')}>
          <Pencil size={14}/> Edit
        </button>
        <button className={tab==='preview'?'active':''} onClick={()=>setTab('preview')}>
          <Eye size={14}/> Preview
        </button>
      </div>

      {loading
        ? <div style={{textAlign:'center',padding:'60px 0',color:'var(--muted)'}}><Loader size={22} className="spin"/></div>
        : tab === 'edit'
          ? <>
              <div className="note info" style={{marginBottom:14}}>
                <Info size={15}/>
                <div>Use the toolbar to format text. Changes are only published when you click <strong>Save &amp; publish</strong>. Switch to the Preview tab to see how the page will look.</div>
              </div>
              <div className="card">
                <div className="card-body" style={{padding:0}}>
                  <RichTextEditor key={loading?'loading':'ready'} value={html} onChange={setHtml}/>
                </div>
              </div>
            </>
          : <div>
              <div className="note ok" style={{marginBottom:14}}>
                <Eye size={15}/>
                <div>This is a live preview of how the About MIC page will look to investors after you save.</div>
              </div>
              <div className="card">
                <div className="card-body" style={{padding:'32px 36px'}}>
                  <div className="ql-content" dangerouslySetInnerHTML={{ __html: html }}/>
                </div>
              </div>
            </div>
      }
    </>
  );
}

/* =================================================================== CONTACT PAGE */
/* Module-level style + sub-component so React never recreates them on re-render.
   Defining components INSIDE a render function causes React to unmount+remount
   them every state change, which is why typing caused focus to jump out. */
const contactInputSt = {
  width:'100%', border:'1px solid var(--line-2)', borderRadius:10,
  padding:'11px 14px', fontSize:14, outline:'none', fontFamily:'var(--font)',
  background:'var(--surface)', color:'var(--ink)', transition:'.12s',
};

function ContactFormField({ label, req, children }) {
  return (
    <div>
      <label style={{fontSize:11,fontWeight:800,letterSpacing:'.6px',color:'var(--muted)',
        display:'block',marginBottom:6,textTransform:'uppercase'}}>
        {label}{req && <span style={{color:'var(--accent)',marginLeft:3}}>*</span>}
      </label>
      {children}
    </div>
  );
}

function ContactPage({ setPage }) {
  const isMobile = useIsMobile();
  const categoryRef = useRef(null); // used by "Share an idea" button to scroll + auto-select

  /* ── form state ── */
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [subject,  setSubject]  = useState('');
  const [message,  setMessage]  = useState('');
  const [category, setCategory] = useState('');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [formErr,  setFormErr]  = useState('');

  /* ── FAQ state ── */
  const [openFaq, setOpenFaq] = useState(null);

  /* ── feature-vote state (localStorage so vote persists per browser) ── */
  const [voted,     setVoted]     = useState(() => { try { return JSON.parse(localStorage.getItem('mic_feat_votes')||'[]'); } catch{return[];} });
  const [votesDone, setVotesDone] = useState(() => localStorage.getItem('mic_vote_done')==='1');
  const [votingNow, setVotingNow] = useState(false);
  const [voteOk,    setVoteOk]    = useState(false);

  const CATEGORIES = [
    { key:'bug',        label:'Report a Bug',                  emoji:'🐛', color:'#c2453d', bg:'#fef2f2' },
    { key:'feature',    label:'Suggest a Feature or Idea',     emoji:'💡', color:'#6d5df5', bg:'#eeecff' },
    { key:'question',   label:'Ask a Question',                emoji:'❓', color:'#0284c7', bg:'#e0f2fe' },
    { key:'partner',    label:'Partnerships',                  emoji:'🤝', color:'#15924e', bg:'#ecfdf5' },
    { key:'media',      label:'Media & Press',                 emoji:'📰', color:'#b45309', bg:'#fffbeb' },
    { key:'misleading', label:'Report Misleading Content',     emoji:'⚠️', color:'#b45309', bg:'#fffbeb' },
    { key:'abuse',      label:'Report Abuse / Fake Profile',   emoji:'🚫', color:'#c2453d', bg:'#fef2f2' },
    { key:'other',      label:'Others',                        emoji:'✍️', color:'#8d90ad', bg:'var(--surface-2)' },
  ];

  const SUBJECT_MAP = {
    bug:'Bug Report', feature:'Feature / Idea Suggestion', question:'Question',
    partner:'Partnership Inquiry', media:'Media & Press',
    misleading:'Report: Misleading Content', abuse:'Report: Abuse / Fake Profile',
    other:'General Enquiry',
  };

  const FEATURES = [
    { key:'portfolio_import',  label:'Portfolio Import' },
    { key:'ai_summaries',      label:'AI Recommendation Summaries' },
    { key:'mutual_fund',       label:'Mutual Fund Ideas Sharing' },
    { key:'leaderboards',      label:'Investor Leaderboards' },
    { key:'overlap',           label:'Portfolio Overlap with Your Network' },
    { key:'mobile_app',        label:'Mobile App' },
  ];

  const FAQS = [
    { q:'Can I edit my recommendation after publishing?',
      a:'No. Recommendations are immutable to maintain transparency. You can publish follow-up updates or formally close a recommendation — but the original call stays on record.' },
    { q:'Can I delete my recommendations?',
      a:'No. My Investor Circle is designed to maintain a permanent, transparent historical record. Once a recommendation is published it becomes part of your public track record.' },
    { q:'Are users on My Investor Circle verified?',
      a:'Some profiles display SEBI registration status. Unless explicitly shown on a user\'s profile, My Investor Circle does not verify that a user is registered with SEBI or any other regulatory authority.' },
    { q:'Do you provide investment advice?',
      a:'No. My Investor Circle is a technology platform where users share their own investment ideas and build public track records. We do not provide personalised investment advice or recommend any securities.' },
    { q:'How is my data used?',
      a:'We only use your data to operate the platform and never sell it to third parties. Recommendations you mark as Public are visible to anyone. Private recommendations are visible only to the people you share them with.' },
    { q:'How do I set up my public profile?',
      a:'Go to Track Record in the left nav. If you haven\'t set a username yet, you\'ll be prompted to do so. Once set, your recommendations and ICI score are publicly viewable at your profile URL.' },
  ];

  const pickCategory = (key) => {
    setCategory(key);
    setSubject(SUBJECT_MAP[key] || '');
  };

  const toggleVote = (key) => {
    if (votesDone) return;
    setVoted(prev => prev.includes(key) ? prev.filter(k=>k!==key) : [...prev, key]);
  };

  const submitVotes = async () => {
    if (!voted.length || votesDone) return;
    setVotingNow(true);
    try {
      if (sql) {
        for (const key of voted) {
          await sql`INSERT INTO feature_votes(feature_key,vote_count) VALUES(${key},1)
            ON CONFLICT(feature_key) DO UPDATE SET vote_count=feature_votes.vote_count+1,updated_at=now()`;
        }
      }
    } catch(_) {}
    localStorage.setItem('mic_feat_votes', JSON.stringify(voted));
    localStorage.setItem('mic_vote_done', '1');
    setVotesDone(true); setVoteOk(true); setVotingNow(false);
  };

  const sendForm = async () => {
    if (!email.trim() || !subject.trim() || !message.trim()) {
      setFormErr('Please fill in Email, Subject and Message.'); return;
    }
    setFormErr(''); setSending(true);
    let saved = false;
    try {
      if (sql) {
        await sql`INSERT INTO contact_submissions(name,email,subject,category,message)
          VALUES(${name||null},${email.trim()},${subject.trim()},${category||null},${message.trim()})`;
        saved = true;
      }
    } catch(_) {}
    if (!saved) {
      // Graceful fallback: open mailto
      const bod = encodeURIComponent(`Name: ${name||'—'}\n\n${message}`);
      window.open(`mailto:hello@myinvestorcircle.com?subject=${encodeURIComponent(subject)}&body=${bod}`);
    }
    setSent(true); setSending(false);
  };

  /* ── small inline components ── */
  // ContactFormField and contactInputSt are defined at module level above ContactPage
  // to prevent React remounting them on every state change (which caused focus loss)

  const formSection = (
    <div className="card" id="contact-form">
      <div className="card-head" style={{justifyContent:'flex-start',gap:8}}><Send size={15}/> Send us a message</div>
      <div className="card-body" style={{display:'flex',flexDirection:'column',gap:16}}>
        {sent
          ? <div style={{textAlign:'center',padding:'28px 12px'}}>
              <div style={{fontSize:40,marginBottom:14}}>🎉</div>
              <div style={{fontSize:18,fontWeight:800,marginBottom:6}}>Message sent!</div>
              <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.75}}>Thanks for reaching out. We'll get back to you within 1–2 business days.</div>
              <button className="btn btn-ghost btn-sm" style={{marginTop:18}}
                onClick={()=>{setSent(false);setName('');setEmail('');setSubject('');setMessage('');setCategory('');}}>
                Send another
              </button>
            </div>
          : <>
              <ContactFormField label="Name" req={false}>
                <input style={contactInputSt} value={name} placeholder="Your name" onChange={e=>setName(e.target.value)}/>
              </ContactFormField>
              <ContactFormField label="Email Address" req>
                <input style={contactInputSt} type="email" value={email} placeholder="you@example.com" onChange={e=>setEmail(e.target.value)}/>
              </ContactFormField>
              <ContactFormField label="Subject" req>
                <input style={contactInputSt} value={subject} placeholder="What's this about?" onChange={e=>setSubject(e.target.value)}/>
              </ContactFormField>
              <ContactFormField label="Message" req>
                <textarea style={{...contactInputSt,resize:'vertical',lineHeight:1.7}} rows={5} value={message}
                  placeholder="Tell us what's on your mind…" onChange={e=>setMessage(e.target.value)}/>
              </ContactFormField>
              {formErr && <div style={{fontSize:13,color:'var(--loss)',display:'flex',alignItems:'center',gap:6}}><AlertTriangle size={13}/>{formErr}</div>}
              <button className="btn btn-pri" disabled={sending} onClick={sendForm} style={{alignSelf:'flex-start',gap:7}}>
                {sending?<><Loader size={14} className="spin"/>Sending…</>:<><Send size={14}/>Send Message</>}
              </button>
            </>}
      </div>
    </div>
  );

  /* ── feature-vote card ── */
  const voteCard = (
    <div className="card">
      <div className="card-head" style={{alignItems:'flex-start',flexDirection:'column',gap:2,paddingBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%'}}>
          <span style={{fontWeight:800,fontSize:15}}>Feature Voting 🗳️</span>
        </div>
        <span style={{fontSize:12,color:'var(--muted)',fontWeight:400}}>What should we build next? Pick as many as you like.</span>
      </div>
      <div className="card-body" style={{paddingTop:0}}>
        {voteOk
          ? <div style={{textAlign:'center',padding:'18px 8px'}}>
              <div style={{fontSize:32,marginBottom:8}}>✅</div>
              <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>Vote recorded!</div>
              <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.7}}>Thanks for helping us prioritise. Your votes are in.</div>
            </div>
          : <>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                {FEATURES.map(f => {
                  const on = voted.includes(f.key);
                  return (
                    <button key={f.key} disabled={votesDone} onClick={()=>toggleVote(f.key)}
                      style={{display:'flex',alignItems:'center',gap:12,background:on?'var(--accent-soft)':'var(--surface-2)',
                        border:`1.5px solid ${on?'var(--accent-line)':'var(--line)'}`,borderRadius:10,
                        padding:'10px 14px',cursor:votesDone?'not-allowed':'pointer',
                        textAlign:'left',width:'100%',fontFamily:'var(--font)',transition:'.12s'}}>
                      <div style={{width:20,height:20,borderRadius:5,flexShrink:0,transition:'.12s',
                          border:`2px solid ${on?'var(--accent)':'var(--line-2)'}`,
                          background:on?'var(--accent)':'transparent',
                          display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {on && <Check size={12} color="#fff" strokeWidth={3}/>}
                      </div>
                      <span style={{fontSize:13,fontWeight:600,color:on?'var(--accent-ink)':'var(--ink)'}}>{f.label}</span>
                    </button>
                  );
                })}
              </div>
              {votesDone
                ? <div style={{fontSize:12,color:'var(--muted)',textAlign:'center',padding:'4px 0'}}>You've already voted — thank you!</div>
                : <button className="btn btn-pri" style={{width:'100%'}} disabled={!voted.length||votingNow} onClick={submitVotes}>
                    {votingNow?<><Loader size={14} className="spin"/>Submitting…</>:`Submit Vote (${voted.length} selected)`}
                  </button>}
            </>}
      </div>
    </div>
  );

  /* ── FAQ card ── */
  const faqCard = (
    <div className="card">
      <div className="card-head">Frequently Asked Questions</div>
      <div>
        {FAQS.map((faq,i) => {
          const open = openFaq===i;
          return (
            <div key={i} style={{borderBottom:i<FAQS.length-1?'1px solid var(--line)':'none'}}>
              <button onClick={()=>setOpenFaq(open?null:i)}
                style={{width:'100%',background:'none',border:'none',cursor:'pointer',
                  padding:'15px 18px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',
                  gap:10,fontFamily:'var(--font)',textAlign:'left'}}>
                <span style={{fontSize:14,fontWeight:700,color:'var(--ink)',lineHeight:1.45,flex:1}}>{faq.q}</span>
                <ChevronDown size={15} color="var(--muted)"
                  style={{flexShrink:0,marginTop:2,transform:open?'rotate(180deg)':'none',transition:'.2s'}}/>
              </button>
              {open && (
                <div style={{padding:'0 18px 16px',fontSize:14,lineHeight:1.8,color:'var(--ink-soft)'}}>
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Page header ── */}
      <div className="page-head">
        <div>
          <div className="eyebrow">Connect</div>
          <div className="page-title">Contact Us</div>
          <div className="page-sub">We'd love to hear from you</div>
        </div>
      </div>

      {/* ── Intro banner ── */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-body" style={{padding:'22px 26px'}}>
          <p style={{fontSize:15,lineHeight:1.85,color:'var(--ink-soft)',margin:0}}>
            Whether you've found a bug, have a feature idea, want to collaborate, or simply want to say hello — we're always happy to hear from fellow investors and market enthusiasts. My Investor Circle is still in its early days, and many of the features you're seeing today were inspired by conversations with people like you.{' '}
            <strong style={{color:'var(--ink)'}}>Your feedback genuinely helps shape what we build next.</strong>
          </p>
        </div>
      </div>

      {/* ── Main two-column grid ── */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 370px',gap:20,alignItems:'start'}}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Get in touch */}
          <div className="card">
            <div className="card-head" style={{justifyContent:'flex-start',gap:8}}><Mail size={15}/> Get in touch</div>
            <div className="card-body">
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <div style={{width:44,height:44,borderRadius:12,background:'var(--accent-soft)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <Mail size={20} color="var(--accent-ink)"/>
                </div>
                <div>
                  <div style={{fontSize:12,color:'var(--muted)',fontWeight:600,marginBottom:3,textTransform:'uppercase',letterSpacing:'.5px'}}>Email</div>
                  <a href="mailto:hello@myinvestorcircle.com"
                    style={{fontSize:15,fontWeight:700,color:'var(--accent-ink)',textDecoration:'none'}}>
                    hello@myinvestorcircle.com
                  </a>
                </div>
              </div>
              <div style={{marginTop:14,padding:'11px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,fontSize:13,color:'var(--ink-soft)'}}>
                📬 We aim to respond within <strong style={{color:'var(--ink)'}}>1–2 business days</strong>.
              </div>
            </div>
          </div>

          {/* Category picker */}
          <div className="card" ref={categoryRef}>
            <div className="card-head" style={{justifyContent:'flex-start'}}>What can we help with?</div>
            <div className="card-body">
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:9}}>
                {CATEGORIES.map(cat => {
                  const active = category===cat.key;
                  return (
                    <button key={cat.key} onClick={()=>pickCategory(cat.key)}
                      style={{border:`2px solid ${active?cat.color:'var(--line)'}`,borderRadius:12,
                        padding:'12px 14px',background:active?cat.bg:'var(--surface)',cursor:'pointer',
                        textAlign:'left',display:'flex',alignItems:'center',gap:10,transition:'.15s',
                        fontFamily:'var(--font)'}}>
                      <span style={{fontSize:18,flexShrink:0}}>{cat.emoji}</span>
                      <span style={{fontSize:13,fontWeight:600,color:active?cat.color:'var(--ink)',lineHeight:1.35}}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
              {category && (
                <div style={{marginTop:10,fontSize:12,color:'var(--muted)',display:'flex',alignItems:'center',gap:5}}>
                  <Check size={12} color="var(--gain)"/> Category selected — the subject below has been pre-filled.
                </div>
              )}
            </div>
          </div>

          {/* Contact form */}
          {formSection}

          {/* On mobile, insert right-column content here */}
          {isMobile && <>{voteCard}{faqCard}</>}
        </div>

        {/* ═══ RIGHT COLUMN (desktop only) ═══ */}
        {!isMobile && (
          <div style={{display:'flex',flexDirection:'column',gap:20}}>
            {voteCard}
            {faqCard}
          </div>
        )}
      </div>

      {/* ── Community First banner ── */}
      <div style={{marginTop:22,background:'var(--grad)',borderRadius:18,padding:'26px 30px',color:'#fff',
          display:'flex',alignItems:'center',justifyContent:'space-between',gap:20,flexWrap:'wrap',
          boxShadow:'0 12px 32px rgba(109,93,245,.32)'}}>
        <div style={{maxWidth:520}}>
          <div style={{fontSize:17,fontWeight:800,letterSpacing:'-.3px',marginBottom:7}}>
            Community First 🤝
          </div>
          <div style={{fontSize:14,lineHeight:1.8,color:'rgba(255,255,255,.88)'}}>
            My Investor Circle is being built in public. We're constantly improving based on community feedback. If you have an idea that would make My Investor Circle more useful for investors, we'd genuinely love to hear it.
          </div>
        </div>
        <button onClick={()=>{
            pickCategory('feature');
            setTimeout(()=>{ categoryRef.current?.scrollIntoView({behavior:'smooth',block:'start'}); }, 50);
          }}
          style={{background:'rgba(255,255,255,.18)',color:'#fff',border:'2px solid rgba(255,255,255,.35)',
            borderRadius:12,padding:'11px 22px',fontWeight:700,fontSize:14,cursor:'pointer',
            fontFamily:'var(--font)',backdropFilter:'blur(6px)',whiteSpace:'nowrap',flexShrink:0,
            transition:'.15s'}}>
          Share an idea →
        </button>
      </div>

      {/* ── Page footer links ── */}
      <div style={{marginTop:28,paddingTop:18,borderTop:'1px solid var(--line)',display:'flex',gap:24,
          flexWrap:'wrap',justifyContent:'center',alignItems:'center'}}>
        <button onClick={()=>setPage?.('about')} style={{background:'none',border:'none',cursor:'pointer',
          fontSize:13,color:'var(--muted)',fontWeight:500,fontFamily:'var(--font)',padding:0}}>
          About MIC
        </button>
        <span style={{color:'var(--line-2)'}}>·</span>
        <span style={{fontSize:13,color:'var(--line-2)'}}>Privacy Policy</span>
      </div>
    </>
  );
}

/* =================================================================== SITE FOOTER */
function SiteFooter({ page, setPage }) {
  const links = [
    { id:'about',   label:'About MIC'      },
    { id:'privacy', label:'Privacy Policy'  },
    { id:'contact', label:'Contact Us'      },
  ];
  return (
    <div style={{
      marginTop:48, paddingTop:18, borderTop:'1px solid var(--line)',
      display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center',
      alignItems:'center', fontSize:12,
    }}>
      <span style={{color:'var(--muted)'}}>© {new Date().getFullYear()} My Investor Circle</span>
      {links.map(link => (
        <React.Fragment key={link.id}>
          <span style={{color:'var(--line-2)'}}>·</span>
          <button onClick={()=>setPage(link.id)} style={{
            background:'none', border:'none', cursor:'pointer', fontSize:12,
            fontWeight: page===link.id ? 700 : 400,
            color: page===link.id ? 'var(--accent-ink)' : 'var(--muted)',
            fontFamily:'var(--font)', padding:0,
            textDecoration: page===link.id ? 'underline' : 'none',
            textUnderlineOffset: 3,
          }}>
            {link.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

/* =================================================================== PRIVACY POLICY PAGE */
const PRIVACY_HTML = `
<div style="max-width:720px;margin:0 auto;">

<div style="background:linear-gradient(135deg,#f5f3ff,#fdf1ff);border:1px solid #e0dcff;border-radius:14px;padding:20px 24px;margin-bottom:32px;">
  <p style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6d5df5;margin:0 0 6px;">Important Regulatory Notice</p>
  <p style="font-size:14px;line-height:1.75;color:#13142b;margin:0;">My Investor Circle is a <strong>technology platform and information intermediary</strong>. It is <strong>not a SEBI-registered Research Analyst</strong> under the SEBI (Research Analysts) Regulations 2014, <strong>not a SEBI-registered Investment Adviser</strong> under the SEBI (Investment Advisers) Regulations 2013, and <strong>not regulated by the Reserve Bank of India (RBI)</strong>. Content published on this platform represents the personal views of individual users. <strong>Investments in securities markets are subject to market risks. Please read all related documents carefully before investing.</strong></p>
</div>

<h2 style="font-size:22px;font-weight:800;letter-spacing:-.4px;color:#13142b;margin:0 0 6px;">Privacy Policy</h2>
<p style="font-size:13px;color:#8d90ad;margin:0 0 28px;"><strong>Effective Date:</strong> July 2025 &nbsp;·&nbsp; <strong>Last Updated:</strong> July 2025 &nbsp;·&nbsp; <strong>Governing Law:</strong> Laws of India</p>

<p style="font-size:15px;line-height:1.85;color:#565a78;margin:0 0 28px;">Welcome to <strong style="color:#13142b;">My Investor Circle</strong>. Your privacy matters to us. This Privacy Policy explains what information we collect, why we collect it, how we use it, and the choices you have. Our goal is to build a transparent investing community while protecting your personal information. By using My Investor Circle, you agree to this Privacy Policy.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">1. Information We Collect</h3>

<p style="font-size:14px;font-weight:700;color:#13142b;margin:0 0 8px;">Information you provide</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 14px;padding-left:20px;">
  <li>Name, username, email address</li>
  <li>Profile photo, biography, social media links</li>
  <li>Country and investment preferences (if voluntarily provided)</li>
  <li>Correspondence with our support team</li>
</ul>

<p style="font-size:14px;font-weight:700;color:#13142b;margin:0 0 8px;">Content you publish</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 14px;padding-left:20px;">
  <li>Investment ideas, comments, and replies</li>
  <li>Public recommendations and associated metadata</li>
  <li>Public profile information</li>
</ul>
<p style="font-size:13px;line-height:1.75;color:#8d90ad;margin:0 0 14px;">Content you intentionally publish may be visible to other users based on your privacy settings.</p>

<p style="font-size:14px;font-weight:700;color:#13142b;margin:0 0 8px;">Portfolio information (optional)</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 14px;padding-left:20px;">
  <li>Holdings, transactions, mutual fund investments, demat holdings, asset allocation</li>
</ul>
<p style="font-size:13px;line-height:1.75;color:#8d90ad;margin:0 0 14px;">Portfolio imports occur only after your explicit consent and are never publicly shared without your authorisation.</p>

<p style="font-size:14px;font-weight:700;color:#13142b;margin:0 0 8px;">Technical information</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;padding-left:20px;">
  <li>Device type, browser, operating system, IP address</li>
  <li>Session logs, crash reports, cookies and similar technologies</li>
</ul>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">2. How We Use Information</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;">Under the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong>, we process your personal data only for lawful purposes with your consent or as otherwise permitted by law. We use information to:</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;padding-left:20px;">
  <li>Create and maintain your account</li>
  <li>Display your public profile and recommendation history</li>
  <li>Calculate investment analytics and credibility metrics (ICI Score)</li>
  <li>Improve platform performance and develop new features</li>
  <li>Detect and prevent abuse, fraud, or manipulation</li>
  <li>Respond to support and grievance requests</li>
  <li>Comply with applicable law, including orders from competent authorities</li>
</ul>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;"><strong>We do not sell, rent, or trade your personal information to third parties.</strong></p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">3. Public Information</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;">The following may be publicly visible if you choose to publish it:</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;padding-left:20px;">
  <li>Username and public profile</li>
  <li>Investment ideas and recommendation history</li>
  <li>Performance analytics and credibility score</li>
  <li>Public comments and replies</li>
</ul>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">Your email address, mobile number, imported portfolio data, and authentication credentials are <strong>never publicly displayed</strong>.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">4. Recommendation Record Integrity</h3>
<div style="background:#f5f3ff;border-left:4px solid #6d5df5;border-radius:0 10px 10px 0;padding:16px 20px;margin:0 0 14px;">
  <p style="font-size:14px;line-height:1.8;color:#13142b;margin:0;">My Investor Circle is designed to maintain a <strong>transparent, tamper-resistant historical record</strong> of investment ideas. Once published, recommendations, timestamps, and associated performance metrics may be retained to preserve the integrity of the platform's analytics and public record. Users may update or close recommendations, but historical records may continue to be displayed as part of the platform's transparency features, subject to applicable law.</p>
</div>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">Requests to remove or alter historical records will be considered in accordance with legal requirements, privacy obligations, and the platform's legitimate interest in maintaining accurate historical information. Where a user establishes that a published idea infringes their rights under applicable law, we will act in accordance with our obligations as an intermediary under the <strong>Information Technology Act, 2000</strong> and the <strong>IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">5. Data Sharing</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;">We may share limited information with trusted service providers for purposes such as:</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;padding-left:20px;">
  <li>Cloud hosting and infrastructure</li>
  <li>Authentication services (e.g. Firebase / Google)</li>
  <li>Email delivery</li>
  <li>Analytics and error monitoring</li>
  <li>Market data providers</li>
  <li>Portfolio import providers</li>
</ul>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 14px;">These providers process data only on our behalf and under appropriate contractual safeguards. Some of these providers may be located outside India. Where required by the DPDP Act, 2023 or other applicable law, we will implement appropriate safeguards for cross-border data transfers.</p>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">We may also disclose information where required by law, court order, or a competent government or regulatory authority, including SEBI, RBI, or law enforcement agencies.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">6. Your Rights Under the DPDP Act, 2023</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;">As a <strong>Data Principal</strong> under the Digital Personal Data Protection Act, 2023, you have the following rights, subject to applicable conditions and exceptions:</p>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;padding-left:20px;">
  <li><strong>Right to access</strong> — obtain a summary of personal data we hold about you</li>
  <li><strong>Right to correction and erasure</strong> — request correction of inaccurate data or erasure of data no longer required</li>
  <li><strong>Right to grievance redressal</strong> — raise a complaint through our Grievance Officer</li>
  <li><strong>Right to nominate</strong> — nominate another individual to exercise rights on your behalf in the event of your death or incapacity</li>
  <li><strong>Right to withdraw consent</strong> — where processing is based on your consent, you may withdraw it at any time (this will not affect prior processing)</li>
</ul>
<p style="font-size:13px;line-height:1.75;color:#8d90ad;margin:0 0 24px;">Note: Certain data may be retained where required by law or where necessary to preserve the integrity of the platform's historical analytics. Erasure of account data will not automatically erase publicly-published recommendation history, which may be retained in anonymised or de-identified form.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">7. Grievance Redressal</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;">In compliance with the <strong>Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong> and the <strong>DPDP Act, 2023</strong>, we have appointed a <strong>Grievance Officer</strong>. If you have any concerns regarding the use of your personal data or any content published on the platform, you may contact:</p>
<div style="background:#f5f5fb;border:1px solid #e8e8ef;border-radius:12px;padding:18px 22px;margin:0 0 14px;">
  <p style="font-size:14px;font-weight:700;color:#13142b;margin:0 0 4px;">Grievance Officer — My Investor Circle</p>
  <p style="font-size:14px;color:#565a78;margin:0 0 2px;">Email: <a href="mailto:hello@myinvestorcircle.com" style="color:#6d5df5;">hello@myinvestorcircle.com</a></p>
  <p style="font-size:13px;color:#8d90ad;margin:0;">We will acknowledge your complaint within <strong>24 hours</strong> and endeavour to resolve it within <strong>15 days</strong> of receipt.</p>
</div>
<p style="font-size:13px;line-height:1.75;color:#8d90ad;margin:0 0 24px;">If your grievance is not resolved to your satisfaction, you may approach the Data Protection Board of India once it is constituted under the DPDP Act, 2023.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">8. Investment Risk Disclosure</h3>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;margin:0 0 14px;">
  <p style="font-size:14px;font-weight:700;color:#92400e;margin:0 0 6px;">Standard Risk Disclosure</p>
  <p style="font-size:14px;line-height:1.8;color:#78350f;margin:0 0 8px;"><strong>Investments in securities markets are subject to market risks. Please read all related documents carefully before investing.</strong></p>
  <p style="font-size:14px;line-height:1.8;color:#92400e;margin:0;">Past performance of any investment idea or user on My Investor Circle is not indicative of future results. My Investor Circle does not guarantee the accuracy of any investment idea. Users are solely responsible for their own investment decisions.</p>
</div>
<ul style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;padding-left:20px;">
  <li>My Investor Circle is <strong>not a SEBI-registered Research Analyst</strong> (SEBI RA Regulations, 2014)</li>
  <li>My Investor Circle is <strong>not a SEBI-registered Investment Adviser</strong> (SEBI IA Regulations, 2013)</li>
  <li>My Investor Circle is <strong>not a stock exchange, broker, or sub-broker</strong> and does not execute trades</li>
  <li>My Investor Circle is <strong>not regulated by the RBI</strong> and does not deal in regulated payment or banking products</li>
  <li>Users who independently qualify as Research Analysts or Investment Advisers under SEBI regulations are responsible for their own compliance</li>
</ul>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">9. Cookies</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;">We use cookies and similar technologies to keep you signed in, remember preferences, improve performance, measure usage, and detect fraud. You may disable cookies in your browser settings, although some platform functionality may not work correctly.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">10. Data Retention</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">We retain personal data only for as long as reasonably necessary to operate the platform, preserve recommendation history, resolve disputes, meet legal obligations, and protect against fraud. Certain records may be retained longer where required by Indian law or to preserve the integrity of historical analytics.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">11. Security</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">We use reasonable technical and organisational measures to protect your information, including encryption where appropriate, access controls, and secure infrastructure. No online system can guarantee absolute security, and users should also protect their own credentials and not share passwords or OTPs with anyone.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">12. Market Data</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">Market prices displayed on My Investor Circle may be obtained from third-party market data providers and may be delayed. My Investor Circle does not warrant the accuracy or completeness of market data. All trademarks and market data remain the property of their respective owners.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">13. Children's Privacy</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">My Investor Circle is intended for users who are legally permitted to use investment-related services in their jurisdiction. The platform is not directed at children. We do not knowingly collect personal data from minors. If we become aware that a minor has provided personal data, we will take steps to delete it.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">14. Governing Law &amp; Jurisdiction</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">This Privacy Policy is governed by and construed in accordance with the laws of India, including the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and other applicable regulations. Any disputes arising out of or in connection with this Privacy Policy shall be subject to the exclusive jurisdiction of the courts of India.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">15. Changes to This Policy</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 24px;">We may update this Privacy Policy from time to time. Material changes will be communicated through the platform or by email where appropriate. Continued use of the platform after such changes constitutes your acceptance of the updated policy.</p>

<hr style="border:none;border-top:1px solid #e8e8ef;margin:28px 0;"/>

<h3 style="font-size:16px;font-weight:800;color:#13142b;margin:0 0 14px;">16. Contact</h3>
<p style="font-size:14px;line-height:1.8;color:#565a78;margin:0 0 10px;">For privacy-related questions or to exercise your data rights:</p>
<p style="font-size:14px;color:#565a78;margin:0;"><strong>Email:</strong> <a href="mailto:hello@myinvestorcircle.com" style="color:#6d5df5;">hello@myinvestorcircle.com</a></p>

</div>
`.trim();

function PrivacyPolicyPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Legal</div>
          <div className="page-title">Privacy Policy</div>
          <div className="page-sub">Effective July 2025 · Governing Law: India · DPDP Act 2023 compliant</div>
        </div>
      </div>
      <div className="card">
        <div className="card-body" style={{padding:'32px 36px'}}>
          <div dangerouslySetInnerHTML={{__html: PRIVACY_HTML}}/>
        </div>
      </div>
    </>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   INTELLIGENCE LAYER — shared helpers + three page components
   ═══════════════════════════════════════════════════════════════════ */

/* ── consensus computation ────────────────────────────────────────── */
function computeConsensus(recos=[]) {
  if (!recos.length) return {bull:0,bear:0,neutral:0,bullPct:0,bearPct:0,neutralPct:0,strength:0,label:'No Data',total:0};
  const bull = recos.filter(r=>r.recommendation_type==='Buy').length;
  const bear = recos.filter(r=>r.recommendation_type==='Sell').length;
  const total = recos.length;
  const bullPct = Math.round(bull/total*100);
  const bearPct = Math.round(bear/total*100);
  const neutralPct = 100-bullPct-bearPct;
  const strength = Math.abs(bullPct-bearPct);
  const label = bullPct>=70?'Strong Bullish':bullPct>=55?'Bullish':bearPct>=70?'Strong Bearish':bearPct>=55?'Bearish':total>0?'Neutral':'No Data';
  return {bull,bear,neutral:total-bull-bear,bullPct,bearPct,neutralPct,strength,label,total};
}

function ConsensusBar({cons={},width=110,mini=false}) {
  if (!cons.total) return <span style={{color:'var(--muted)',fontSize:12}}>—</span>;
  const col = cons.bullPct>=55?'var(--gain)':cons.bearPct>=55?'var(--loss)':'var(--muted)';
  return (
    <div>
      <div style={{fontSize:mini?10:12,fontWeight:700,color:col,marginBottom:2}}>{cons.label}</div>
      <div style={{display:'flex',height:4,borderRadius:3,overflow:'hidden',width,background:'rgba(141,144,173,.15)'}}>
        <div style={{width:`${cons.bullPct}%`,background:'var(--gain)',transition:'width .4s'}}/>
        <div style={{width:`${cons.neutralPct}%`,background:'rgba(141,144,173,.35)'}}/>
        <div style={{width:`${cons.bearPct}%`,background:'var(--loss)',transition:'width .4s'}}/>
      </div>
      {!mini&&<div style={{fontSize:10,color:'var(--muted)',marginTop:3,display:'flex',gap:10}}>
        <span style={{color:'var(--gain)'}}>{cons.bullPct}% B</span>
        <span style={{color:'var(--loss)'}}>{cons.bearPct}% S</span>
        <span>{cons.total} investor{cons.total!==1?'s':''}</span>
      </div>}
    </div>
  );
}

function StrengthDot({strength=0}) {
  const col = strength>=65?'var(--gain)':strength>=40?'#fbbf24':'var(--muted)';
  const label = strength>=65?'Strong':strength>=40?'Moderate':'Weak';
  return (
    <div style={{textAlign:'center'}}>
      <div style={{fontSize:22,fontWeight:900,color:col,lineHeight:1}}>{strength}</div>
      <div style={{fontSize:10,color:col,fontWeight:700}}>{label}</div>
    </div>
  );
}

/* ── SparkLine — simple SVG trend line ─────────────────────────── */
/* ─── PeopleSearch — search users by name or username ──────────────────────── */
function PeopleSearch({ me, connections=[], onConnect }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Derive connection status sets from current connections
  const activeIds  = useMemo(()=>new Set(connections.filter(c=>c.status==='active').map(c=>c.id)),[connections]);
  const pendingIds = useMemo(()=>new Set(connections.filter(c=>c.status&&c.status!=='active').map(c=>c.id)),[connections]);

  // Debounced search — fires 300ms after the user stops typing
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      if (!sql) return;
      setLoading(true);
      try {
        const rows = await sql`
          SELECT id, username, full_name, first_name, last_name,
                 registration_status, sebi_approval_status
          FROM user_profiles
          WHERE (full_name   ILIKE ${'%'+q+'%'}
              OR username    ILIKE ${'%'+q+'%'}
              OR first_name  ILIKE ${'%'+q+'%'}
              OR last_name   ILIKE ${'%'+q+'%'})
            AND id != ${me?.id||'none'}
            AND (is_unclaimed IS NULL OR is_unclaimed = FALSE)
          ORDER BY
            CASE WHEN LOWER(username)  = LOWER(${q})         THEN 0
                 WHEN LOWER(username)  LIKE LOWER(${q})||'%' THEN 1
                 WHEN LOWER(full_name) LIKE LOWER(${q})||'%' THEN 2
                 ELSE 3 END,
            full_name
          LIMIT 15`;
        setResults(rows);
      } catch(e) { console.warn('People search:', e?.message||e); }
      finally    { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, me?.id]);

  const clear = () => { setQuery(''); setResults([]); };

  const isSebi = u => u.sebi_approval_status==='approved'||['sebi_ra','sebi_ria'].includes(u.registration_status||'');

  return (
    <div style={{marginBottom:16}}>
      {/* Search input */}
      <div style={{position:'relative'}}>
        <Search size={15} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',pointerEvents:'none'}}/>
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Search investors by name or @username…"
          style={{width:'100%',boxSizing:'border-box',padding:'10px 36px',border:'1px solid var(--line)',borderRadius:12,fontFamily:'var(--font)',fontSize:14,background:'var(--surface)',color:'var(--ink)',outline:'none'}}
        />
        {query && (
          <button onClick={clear} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',border:'none',background:'none',cursor:'pointer',color:'var(--muted)',padding:4}}>
            <X size={14}/>
          </button>
        )}
      </div>

      {/* Results */}
      {(results.length>0||loading||(query.trim().length>=2&&!loading)) && (
        <div className="card" style={{marginTop:6,padding:0,overflow:'hidden'}}>
          {loading && <div style={{padding:'14px',textAlign:'center',color:'var(--muted)',fontSize:13}}>Searching…</div>}

          {!loading && results.length===0 && query.trim().length>=2 && (
            <div style={{padding:'14px 16px',fontSize:13,color:'var(--muted)',textAlign:'center'}}>
              No investors found for "{query.trim()}"
            </div>
          )}

          {results.map((u,i) => {
            const connected = activeIds.has(u.id);
            const pending   = pendingIds.has(u.id);
            const name      = u.full_name || u.username || 'Investor';
            return (
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                borderBottom:i<results.length-1?'1px solid var(--line)':'none'}}>
                {/* Avatar */}
                <div className="av" style={{width:38,height:38,fontSize:13,flexShrink:0,background:'var(--grad)'}}>
                  {initialsOf(name)}
                </div>

                {/* Name + meta */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {name}
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',marginTop:2,flexWrap:'wrap'}}>
                    {u.username && <span style={{fontSize:12,color:'var(--muted)'}}>@{u.username}</span>}
                    {isSebi(u) && (
                      <span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'var(--gain-soft)',color:'var(--gain)'}}>
                        SEBI
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                  {u.username && (
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}}
                      onClick={()=>{ window.location.hash=`#/investor/${u.username}`; clear(); }}>
                      View
                    </button>
                  )}
                  {connected  && <span style={{fontSize:11,fontWeight:700,color:'var(--gain)'}}>Connected</span>}
                  {pending    && <span style={{fontSize:11,color:'var(--muted)'}}>Pending</span>}
                  {!connected && !pending && (
                    <button className="btn btn-pri btn-sm" style={{fontSize:11}}
                      onClick={()=>{ onConnect(u.id); setResults(rs=>rs.map(r=>r.id===u.id?{...r,_pendingLocal:true}:r)); }}>
                      <UserPlus size={12}/> Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── InviteModal — personal referral link sharing ──────────────────────────── */
function InviteModal({ username, referralCount=0, onClose }) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}?ref=${username||''}`;
  const waText = encodeURIComponent(
    `Hey! I track and share stock ideas on myInvestorCircle — a trusted network for serious investors. Join me here:\n${link}`
  );
  const copy = () => {
    navigator.clipboard.writeText(link)
      .then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); })
      .catch(()=>{});
  };

  const content = (
    <div style={{padding: isMobile?'20px 20px 36px':'28px 28px 24px'}}>
      {!isMobile && <div style={{fontWeight:900,fontSize:20,marginBottom:4}}>Invite Friends to myInvestorCircle</div>}
      <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.55,marginBottom:20}}>
        Share your personal invite link. Anyone who signs up through it is automatically added to your investment circle — you can see each other's recommendations right away.
      </div>

      {/* Referral stats */}
      {referralCount > 0 && (
        <div style={{background:'var(--gain-soft)',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,fontWeight:700,color:'var(--gain)',display:'flex',alignItems:'center',gap:8}}>
          🎉 {referralCount} friend{referralCount!==1?'s':''} joined through your invite!
        </div>
      )}

      {/* Link box */}
      <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,padding:'10px 14px',fontSize:12,color:'var(--muted)',wordBreak:'break-all',marginBottom:14,lineHeight:1.5}}>
        {link}
      </div>

      {/* Actions */}
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <button className="btn btn-pri" style={{justifyContent:'center'}} onClick={copy}>
          {copied ? <><Check size={15}/> Copied!</> : <><Copy size={15}/> Copy Invite Link</>}
        </button>
        <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer"
          className="btn btn-soft" style={{justifyContent:'center',textDecoration:'none'}} onClick={onClose}>
          <span style={{fontSize:17,lineHeight:1}}>💬</span> Share on WhatsApp
        </a>
      </div>

      <div style={{fontSize:11,color:'var(--muted)',marginTop:14,textAlign:'center',lineHeight:1.5}}>
        They get added to your circle as soon as they sign up — no extra steps needed.
      </div>

      <button className="btn btn-ghost" style={{width:'100%',justifyContent:'center',marginTop:12}} onClick={onClose}>
        Close
      </button>
    </div>
  );

  if (isMobile) return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.45)'}}/>
      <div style={{position:'relative',background:'var(--surface)',borderRadius:'20px 20px 0 0',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 -8px 40px rgba(0,0,0,.28)'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line)',borderRadius:2,margin:'12px auto 0'}}/>
        <div style={{fontWeight:900,fontSize:18,padding:'16px 20px 0'}}>Invite Friends</div>
        {content}
      </div>
    </div>,
    document.body
  );

  return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'var(--surface)',borderRadius:18,width:440,maxWidth:'calc(100vw - 32px)',boxShadow:'0 16px 48px rgba(0,0,0,.2)',position:'relative'}} onClick={e=>e.stopPropagation()}>
        <button style={{position:'absolute',top:14,right:14,border:'none',background:'none',cursor:'pointer',color:'var(--muted)'}} onClick={onClose}><X size={18}/></button>
        {content}
      </div>
    </div>,
    document.body
  );
}

/* ─── CreateCreatorModal ─────────────────────────────────────────────────────── */
function CreateCreatorModal({ onClose, onCreated }) {
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [username,    setUsername]    = useState('');
  const [bio,         setBio]         = useState('');
  const [regStatus,   setRegStatus]   = useState('self_directed');
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState('');
  const [created,     setCreated]     = useState(null); // { claimLink, profileId, username }
  const isMobile = useIsMobile();

  const handle = async () => {
    setErr('');
    if (!firstName.trim()) { setErr('First name is required'); return; }
    if (!username.trim())  { setErr('Username is required'); return; }
    setBusy(true);
    try {
      const token      = crypto.randomUUID().replace(/-/g,'');
      const profileId  = `unc_${token.slice(0,16)}`;
      const fullName   = `${firstName.trim()} ${lastName.trim()}`.trim();
      const uname      = username.trim().toLowerCase();
      const placeholder= `creator-${uname}@myinvestorcircle.com`;

      // Check username uniqueness
      const existing = await sql`SELECT id FROM user_profiles WHERE username=${uname} LIMIT 1`;
      if (existing.length) { setErr('Username already taken. Choose another.'); setBusy(false); return; }

      await sql`
        INSERT INTO user_profiles (
          id, email, full_name, first_name, last_name, username, bio,
          registration_status, is_admin,
          is_unclaimed, claim_token, claim_status
        ) VALUES (
          ${profileId}, ${placeholder}, ${fullName},
          ${firstName.trim()}, ${lastName.trim()||''}, ${uname}, ${bio.trim()||null},
          ${regStatus}, false,
          true, ${token}, 'unclaimed'
        )
      `;

      const claimLink = `${window.location.origin}${window.location.pathname}?claim_token=${token}`;
      setCreated({ claimLink, profileId, username: uname, fullName });
      if (onCreated) onCreated();
    } catch(e) { setErr(e?.message || 'Failed to create profile'); }
    setBusy(false);
  };

  const copy = () => navigator.clipboard.writeText(created.claimLink).catch(()=>{});

  const content = created ? (
    <div>
      <div className="note" style={{background:'var(--gain-soft)',border:'1px solid var(--gain)',color:'var(--gain)',fontWeight:700,marginBottom:16,display:'flex',gap:8,alignItems:'center'}}>
        <Check size={16}/> Profile created for <strong>{created.fullName}</strong>
      </div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:'var(--ink)'}}>Claim link — share this with the creator:</div>
      <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:9,padding:'9px 12px',fontSize:11,color:'var(--muted)',wordBreak:'break-all',lineHeight:1.5,marginBottom:10}}>{created.claimLink}</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <button className="btn btn-pri" style={{justifyContent:'center'}} onClick={copy}><Copy size={14}/> Copy Claim Link</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`Hi! I've set up your investor profile on myInvestorCircle. Claim it here:\n${created.claimLink}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft" style={{justifyContent:'center',textDecoration:'none'}}><span style={{fontSize:16,lineHeight:1}}>💬</span> Share on WhatsApp</a>
        <button className="btn btn-ghost" onClick={onClose} style={{justifyContent:'center'}}>Done</button>
      </div>
      <div style={{fontSize:11,color:'var(--muted)',marginTop:12,lineHeight:1.5}}>
        The creator will see their profile preview and be prompted to sign up and claim it. You'll get a notification once they submit — then you can approve to make the profile public.
      </div>
    </div>
  ) : (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div><label style={{fontSize:12,fontWeight:700,color:'var(--muted)'}}>First name *</label><input className="inp" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Varun" style={{width:'100%',marginTop:4,boxSizing:'border-box'}}/></div>
        <div><label style={{fontSize:12,fontWeight:700,color:'var(--muted)'}}>Last name</label><input className="inp" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Rawat" style={{width:'100%',marginTop:4,boxSizing:'border-box'}}/></div>
      </div>
      <div><label style={{fontSize:12,fontWeight:700,color:'var(--muted)'}}>Username * (used in profile URL)</label><input className="inp" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-z0-9_]/gi,'').toLowerCase())} placeholder="varunrawat" style={{width:'100%',marginTop:4,boxSizing:'border-box'}}/><div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Profile will be at /#/investor/{username||'username'}</div></div>
      <div><label style={{fontSize:12,fontWeight:700,color:'var(--muted)'}}>Bio (optional)</label><textarea className="inp" value={bio} onChange={e=>setBio(e.target.value)} placeholder="Brief description of the creator's investment style…" rows={3} style={{width:'100%',marginTop:4,resize:'vertical',boxSizing:'border-box'}}/></div>
      <div><label style={{fontSize:12,fontWeight:700,color:'var(--muted)'}}>Registration type</label>
        <select className="inp" value={regStatus} onChange={e=>setRegStatus(e.target.value)} style={{width:'100%',marginTop:4}}>
          <option value="self_directed">Self-directed / Non-SEBI</option>
          <option value="sebi_ra">SEBI Registered Analyst</option>
          <option value="sebi_ria">SEBI Registered Investment Advisor</option>
        </select>
      </div>
      {err && <div className="note warn" style={{fontSize:12}}>{err}</div>}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri btn-sm" onClick={handle} disabled={busy}>{busy ? 'Creating…' : 'Create profile'}</button>
      </div>
    </div>
  );

  if (isMobile) return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.45)'}}/>
      <div style={{position:'relative',background:'var(--surface)',borderRadius:'20px 20px 0 0',padding:'20px',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line)',borderRadius:2,margin:'0 auto 16px'}}/>
        <div style={{fontWeight:800,fontSize:17,marginBottom:16}}>Create creator profile</div>
        {content}
      </div>
    </div>, document.body);

  return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'var(--surface)',borderRadius:18,width:480,maxWidth:'calc(100vw - 32px)',boxShadow:'0 16px 48px rgba(0,0,0,.2)',position:'relative',padding:'28px'}} onClick={e=>e.stopPropagation()}>
        <button style={{position:'absolute',top:14,right:14,border:'none',background:'none',cursor:'pointer',color:'var(--muted)'}} onClick={onClose}><X size={18}/></button>
        <div style={{fontWeight:800,fontSize:18,marginBottom:20}}>Create creator profile</div>
        {content}
      </div>
    </div>, document.body);
}

/* ─── AdminRecoSeedModal ─────────────────────────────────────────────────────── *
 * Mirrors MakeRecoModal exactly — same InstrumentSearch, same HORIZONS constant, *
 * same conviction/sector dropdowns, same is_public toggle — but adds:            *
 *   · Historical reco date  (unique to seeding)                                  *
 *   · Manual reco price     (no live fetch for past dates)                       *
 *   · Batch queue           (seed multiple recos before committing)              *
 * ─────────────────────────────────────────────────────────────────────────────── */
function AdminRecoSeedModal({ creatorId, creatorName, username, onClose, onDone }) {
  // Instrument (mirrors MakeRecoModal pattern exactly)
  const [selectedInstr, setSelectedInstr] = useState(null);
  const [ticker,       setTicker]       = useState('');
  const [assetName,    setAssetName]    = useState('');
  const [cls,          setCls]          = useState('Equity');
  const [currency,     setCurrency]     = useState('INR');
  const [sector,       setSector]       = useState('');
  const [exchange,     setExchange]     = useState('NSE');

  // Reco fields — same defaults as MakeRecoModal
  const [recoDate,     setRecoDate]     = useState(new Date().toISOString().split('T')[0]);
  const [recType,      setRecType]      = useState('Buy');
  const [recoPrice,    setRecoPrice]    = useState('');
  const [targetPrice,  setTargetPrice]  = useState('');
  const [stopLoss,     setStopLoss]     = useState('');
  const [horizon,      setHorizon]      = useState('12m');
  const [thesis,       setThesis]       = useState('');
  const [conviction,   setConviction]   = useState('');
  const [isPublic,     setIsPublic]     = useState(true);
  // Closed-position fields — for historical recos where the horizon already expired
  const [exitSignal,   setExitSignal]   = useState(false);
  const [exitDate,     setExitDate]     = useState('');
  const [exitPrice,    setExitPrice]    = useState('');

  // Queue + status
  const [queue,   setQueue]   = useState([]);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState('');
  const [inserted,setInserted]= useState(0);

  const CURRENCY_SYMBOL = { INR:'₹', USD:'$', GBP:'£', EUR:'€' };
  const ASSET_CLASSES   = ['Equity','MF','ETF','Debt','Commodity','Crypto','Other'];
  const SECTORS = [
    '— Select sector —',
    'Banking & Finance','Technology','Pharmaceuticals','Energy','FMCG','Automobiles',
    'Defence','Capital Goods','Real Estate','Chemicals','Telecom','Metals & Mining',
    'PSU','Healthcare','Infrastructure','Media','Retail','Others',
  ];

  // Mirror MakeRecoModal's onInstrSelect exactly
  const onInstrSelect = (inst) => {
    if (!inst) { setSelectedInstr(null); return; }
    setSelectedInstr(inst);
    setTicker(inst.symbol);
    setAssetName(inst.name);
    setCls(inst.assetClass || 'Equity');
    setCurrency(inst.currency || 'INR');
    setSector(inst.sector || '');
    setExchange(inst.exchange || 'NSE');
  };

  const addToQueue = () => {
    setErr('');
    const t = (ticker.trim() || selectedInstr?.symbol || '').toUpperCase();
    const n =  assetName.trim() || selectedInstr?.name || '';
    if (!t)  { setErr('Ticker / symbol is required.'); return; }
    if (!n)  { setErr('Asset / company name is required.'); return; }
    if (!recoPrice || isNaN(+recoPrice) || +recoPrice <= 0) {
      setErr('Enter a valid reco price.'); return;
    }
    if (exitSignal) {
      if (!exitDate) { setErr('Exit date is required for closed positions.'); return; }
      if (!exitPrice || isNaN(+exitPrice) || +exitPrice <= 0) { setErr('Exit / close price is required for closed positions.'); return; }
    }
    setQueue(q => [...q, {
      _key:       Date.now() + Math.random(),
      ticker: t,  assetName: n,
      assetClass: cls,
      exchange:   selectedInstr?.exchange || exchange,
      recType,
      recoPrice:  parseFloat(recoPrice),
      targetPrice:targetPrice ? parseFloat(targetPrice) : null,
      stopLoss:   stopLoss    ? parseFloat(stopLoss)    : null,
      horizon,    thesis: thesis.trim() || null,
      sector:     (sector && sector !== '— Select sector —') ? sector : null,
      conviction: conviction || null,
      currency,   recoDate,  isPublic,
      exitSignal,
      exitDate:   exitSignal ? exitDate : null,
      exitPrice:  exitSignal ? parseFloat(exitPrice) : null,
    }]);
    // Clear entry-specific fields; retain contextual ones (date, type, horizon, sector, conviction, currency, exitSignal)
    setSelectedInstr(null);
    setTicker('');   setAssetName('');
    setRecoPrice(''); setTargetPrice(''); setStopLoss(''); setThesis('');
    setExitDate(''); setExitPrice('');
  };

  const removeFromQueue = key => setQueue(q => q.filter(r => r._key !== key));

  const submitAll = async () => {
    if (!queue.length) { setErr('Add at least one recommendation first.'); return; }
    setBusy(true); setErr('');
    let count = 0;
    try {
      for (const r of queue) {
        const ts = new Date(r.recoDate + 'T12:00:00').toISOString();
        const exitTs = r.exitDate ? new Date(r.exitDate + 'T12:00:00').toISOString() : null;
        await sql`
          INSERT INTO ic_recommendations (
            recommender_id, asset_name, ticker, asset_class, exchange,
            recommendation_type, reco_price, target_price, stop_loss,
            horizon, thesis, sector, conviction, is_public, currency, created_at,
            exit_signal, exit_date, current_price
          ) VALUES (
            ${creatorId},    ${r.assetName},  ${r.ticker},    ${r.assetClass}, ${r.exchange},
            ${r.recType},    ${r.recoPrice},  ${r.targetPrice}, ${r.stopLoss},
            ${r.horizon},    ${r.thesis},      ${r.sector},    ${r.conviction},
            ${r.isPublic},   ${r.currency},    ${ts},
            ${r.exitSignal || false}, ${exitTs}, ${r.exitSignal ? r.exitPrice : null}
          )
        `;
        count++;
      }
      setQueue([]);
      setInserted(n => n + count);
      if (onDone) onDone(count);
    } catch(e) { setErr(`Insert failed after ${count} recos: ${e?.message || e}`); }
    setBusy(false);
  };

  const fmtQueueDate = iso =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' });

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:560,maxHeight:'calc(100vh - 40px)',display:'flex',flexDirection:'column'}}>

        {/* ── Header ── */}
        <div className="modal-head">
          <h3><Database size={17} style={{verticalAlign:-3,color:'var(--accent)',marginRight:6}}/>
            Seed recommendations
            <span style={{fontSize:12,fontWeight:400,color:'var(--muted)',marginLeft:8}}>
              for <strong style={{color:'var(--ink)'}}>{creatorName}</strong> @{username}
            </span>
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="modal-body" style={{overflowY:'auto',flex:1}}>

          {/* Success banner */}
          {inserted > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--gain-soft)',border:'1px solid var(--gain)',borderRadius:10,padding:'10px 14px',marginBottom:14,color:'var(--gain)',fontWeight:700,fontSize:13}}>
              <Check size={15}/> {inserted} recommendation{inserted!==1?'s':''} seeded.
              <span style={{fontWeight:400,color:'var(--muted)',marginLeft:4,fontSize:12}}>Add more or close when done.</span>
            </div>
          )}

          {/* Historical date (unique to seeding) */}
          <div className="field">
            <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>Recommendation date <span style={{color:'var(--loss)'}}>*</span></span>
              <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)'}}>Historical — set the original date</span>
            </label>
            <input type="date" value={recoDate} onChange={e=>setRecoDate(e.target.value)} style={{width:'100%',boxSizing:'border-box'}}/>
          </div>

          {/* Reco type — Buy / Sell (same as regular modal) */}
          <div className="field"><label>Recommendation type</label>
            <div style={{display:'flex',gap:8}}>
              {['Buy','Sell'].map(t=>(
                <button key={t} onClick={()=>setRecType(t)}
                  style={{flex:1,padding:'10px 0',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer',border:'1.5px solid',
                    background: recType===t ? (t==='Buy'?'var(--gain-soft)':'var(--loss-soft)') : 'var(--surface)',
                    color:      recType===t ? (t==='Buy'?'var(--gain)':'var(--loss)')           : 'var(--muted)',
                    borderColor:recType===t ? (t==='Buy'?'var(--gain)':'var(--loss)')           : 'var(--line)',
                  }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Instrument search — same component as regular modal */}
          <div className="field">
            <label>Search instrument <span className="muted small">(type symbol or company name)</span></label>
            <InstrumentSearch onSelect={onInstrSelect} placeholder="e.g. SHILPAMED or Shilpa Medicare…"/>
          </div>

          {/* Manual fallback — exact same pattern as regular modal */}
          <details style={{marginBottom:14}}>
            <summary style={{fontSize:12,fontWeight:600,color:'var(--muted)',cursor:'pointer',userSelect:'none',marginBottom:8}}>
              Not in the list? Enter manually
            </summary>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:14,paddingTop:8}}>
              <div className="field">
                <label>Ticker / Symbol</label>
                <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase().replace(/\s/g,''))} placeholder="e.g. CDSL"/>
              </div>
              <div className="field">
                <label>Asset name</label>
                <input value={assetName} onChange={e=>setAssetName(e.target.value)} placeholder="e.g. CDSL Ltd"/>
              </div>
            </div>
          </details>

          {/* Selected instrument summary chip */}
          {selectedInstr && (
            <div style={{display:'flex',gap:8,marginBottom:14,padding:'10px 12px',background:'var(--accent-soft)',borderRadius:10,alignItems:'center'}}>
              <Check size={15} color="var(--accent-ink)"/>
              <span style={{fontSize:13,fontWeight:600,color:'var(--accent-ink)'}}>{selectedInstr.symbol} — {selectedInstr.name}</span>
              <span className="chip mini" style={{marginLeft:'auto'}}>{selectedInstr.exchange}</span>
              <span className="chip mini">{selectedInstr.assetClass}</span>
              <span className="chip mini">{CURRENCY_SYMBOL[selectedInstr.currency]||selectedInstr.currency} {selectedInstr.currency}</span>
            </div>
          )}

          {/* Asset class */}
          <div className="field"><label>Asset class</label>
            <select value={cls} onChange={e=>setCls(e.target.value)}>
              {ASSET_CLASSES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Sector + Conviction row — exact same layout as regular modal */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:14}}>
            <div className="field">
              <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Sector</span>
                {selectedInstr?.sector
                  ? <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--gain-soft)',color:'var(--gain)'}}>From security master</span>
                  : <span className="muted small">{selectedInstr ? 'Not in master — select below' : 'Optional'}</span>}
              </label>
              {selectedInstr?.sector
                ? <div style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:11,background:'var(--surface-2)',fontSize:14,color:'var(--ink-soft)',display:'flex',alignItems:'center',gap:8}}>
                    <Lock size={13} color="var(--muted)"/>{selectedInstr.sector}
                  </div>
                : <select value={sector} onChange={e=>setSector(e.target.value)}>
                    {SECTORS.map(s=><option key={s}>{s}</option>)}
                  </select>}
            </div>
            <div className="field">
              <label>Conviction <span className="muted small">(optional)</span></label>
              <select value={conviction} onChange={e=>setConviction(e.target.value)}>
                <option value="">— Not specified —</option>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
            </div>
          </div>

          {/* Currency + Reco price + Target + Stop loss + Horizon */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',columnGap:14,rowGap:0}}>

            {/* Currency — locked from master exactly like regular modal */}
            <div className="field">
              <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Currency</span>
                {selectedInstr && <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--gain-soft)',color:'var(--gain)'}}>Master</span>}
              </label>
              {selectedInstr
                ? <div style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:11,background:'var(--surface-2)',fontSize:14,color:'var(--ink-soft)',display:'flex',alignItems:'center',gap:8}}>
                    <Lock size={13} color="var(--muted)"/>{CURRENCY_SYMBOL[currency]||currency} {currency}
                  </div>
                : <select value={currency} onChange={e=>setCurrency(e.target.value)}>
                    {['INR','USD','GBP','EUR'].map(c=><option key={c}>{c}</option>)}
                  </select>}
            </div>

            {/* Reco price — MANUAL for historical seeding (no auto-fetch) */}
            <div className="field" style={{gridColumn:'span 2'}}>
              <label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Reco price ({CURRENCY_SYMBOL[currency]||currency}) <span style={{color:'var(--loss)'}}>*</span></span>
                <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'var(--amber-soft)',color:'var(--amber)'}}>Enter manually — historical</span>
              </label>
              <input type="number" min="0" step="0.01" value={recoPrice}
                onChange={e=>setRecoPrice(e.target.value)}
                placeholder={`${CURRENCY_SYMBOL[currency]||''}0.00`}/>
            </div>

            <div className="field"><label>Target price <span className="muted small">(opt.)</span></label>
              <input type="number" min="0" step="0.01" value={targetPrice} onChange={e=>setTargetPrice(e.target.value)} placeholder="0"/>
            </div>
            <div className="field"><label>Stop loss <span className="muted small">(opt.)</span></label>
              <input type="number" min="0" step="0.01" value={stopLoss} onChange={e=>setStopLoss(e.target.value)} placeholder="0"/>
            </div>

            {/* Horizon — uses exact same HORIZONS constant as the regular modal */}
            <div className="field"><label>Horizon</label>
              <select value={horizon} onChange={e=>setHorizon(e.target.value)}>
                {HORIZONS.map(h=><option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Thesis */}
          <div className="field"><label>Thesis / rationale <span className="muted small">(optional)</span></label>
            <textarea rows={3} value={thesis} onChange={e=>setThesis(e.target.value)} placeholder="Why should they look at this?"/>
          </div>

          {/* is_public toggle — same as regular modal, ticked by default */}
          <label style={{display:'flex',alignItems:'flex-start',gap:10,fontSize:13,fontWeight:600,cursor:'pointer',padding:'12px 0 0',borderTop:'1px solid var(--line)',marginTop:8}}>
            <input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)} style={{width:16,height:16,accentColor:'var(--accent)',marginTop:1,flexShrink:0}}/>
            <div>
              Make this recommendation public
              <div style={{fontWeight:400,color:'var(--muted)',fontSize:12,marginTop:2}}>
                Visible on the creator's public profile page and track record. Leave ticked for seeded historical data.
              </div>
            </div>
          </label>

          {/* Closed position toggle — for historical recos where the horizon has already expired */}
          <label style={{display:'flex',alignItems:'flex-start',gap:10,fontSize:13,fontWeight:600,cursor:'pointer',padding:'12px 0 0',borderTop:'1px solid var(--line)',marginTop:4}}>
            <input type="checkbox" checked={exitSignal} onChange={e=>{ setExitSignal(e.target.checked); if(!e.target.checked){setExitDate('');setExitPrice('');} }} style={{width:16,height:16,accentColor:'var(--loss)',marginTop:1,flexShrink:0}}/>
            <div>
              This position is already closed
              <div style={{fontWeight:400,color:'var(--muted)',fontSize:12,marginTop:2}}>
                For historical recos where the horizon has already expired. The exit price is used to calculate actual returns in the ICI score — without it, return stays at 0 permanently.
              </div>
            </div>
          </label>

          {/* Exit date + exit price — shown only when position is closed */}
          {exitSignal && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:14,marginTop:2,padding:'12px',background:'var(--surface-2)',borderRadius:10,border:'1px solid var(--line)'}}>
              <div className="field">
                <label>Exit / close date <span style={{color:'var(--loss)'}}>*</span></label>
                <input type="date" value={exitDate} onChange={e=>setExitDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}/>
              </div>
              <div className="field">
                <label>Exit / close price ({CURRENCY_SYMBOL[currency]||currency}) <span style={{color:'var(--loss)'}}>*</span></label>
                <input type="number" min="0" step="0.01" value={exitPrice}
                  onChange={e=>setExitPrice(e.target.value)}
                  placeholder="0.00"/>
              </div>
              <div style={{gridColumn:'1 / -1',fontSize:11,color:'var(--muted)',marginTop:4}}>
                Return = (exit price − reco price) ÷ reco price × 100. This feeds directly into Hit rate and Median return in the ICI score.
              </div>
            </div>
          )}

          {/* Error */}
          {err && <div className="note warn" style={{fontSize:12,marginTop:12}}>{err}</div>}

          {/* Add to queue */}
          <button className="btn btn-pri" style={{width:'100%',justifyContent:'center',marginTop:14}}
            onClick={addToQueue}>
            <Plus size={15}/> Add to queue{queue.length > 0 && ` (${queue.length} queued)`}
          </button>

          {/* ── Queue table ── */}
          {queue.length > 0 && (
            <div style={{marginTop:16}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>QUEUED — READY TO INSERT ({queue.length})</span>
                <button style={{border:'none',background:'none',fontSize:11,cursor:'pointer',color:'var(--loss)'}} onClick={()=>setQueue([])}>Clear all</button>
              </div>
              <div style={{border:'1px solid var(--line)',borderRadius:10,overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:'var(--surface-2)',textAlign:'left'}}>
                      {['Date','Ticker','Type','Price','Target','Stop','[×]'].map((h,i)=>(
                        <th key={h} style={{padding:'7px 10px',fontWeight:700,color:'var(--muted)',borderBottom:'1px solid var(--line)',whiteSpace:'nowrap',textAlign:i>=3?'right':'left'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((r,i)=>(
                      <tr key={r._key} style={{borderBottom:i<queue.length-1?'1px solid var(--line)':'none'}}>
                        <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>{fmtQueueDate(r.recoDate)}</td>
                        <td style={{padding:'7px 10px',fontWeight:700}}>{r.ticker}{r.exitSignal && <span style={{marginLeft:5,fontSize:10,fontWeight:700,padding:'1px 5px',borderRadius:4,background:'var(--loss-soft)',color:'var(--loss)'}}>Closed</span>}</td>
                        <td style={{padding:'7px 10px',color:r.recType==='Buy'?'var(--gain)':'var(--loss)'}}>{r.recType}</td>
                        <td style={{padding:'7px 10px',textAlign:'right'}}>{CURRENCY_SYMBOL[r.currency]||''}{r.recoPrice.toLocaleString('en-IN')}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',color:'var(--muted)'}}>{r.targetPrice?`${CURRENCY_SYMBOL[r.currency]||''}${r.targetPrice.toLocaleString('en-IN')}`:'—'}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',color:'var(--muted)'}}>{r.stopLoss?`${CURRENCY_SYMBOL[r.currency]||''}${r.stopLoss.toLocaleString('en-IN')}`:'—'}</td>
                        <td style={{padding:'7px 10px',textAlign:'right'}}>
                          <button onClick={()=>removeFromQueue(r._key)} style={{border:'none',background:'none',cursor:'pointer',color:'var(--loss)',padding:2}}><X size={13}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer with batch submit ── */}
        <div className="modal-foot">
          <span className="muted small">
            All recos seeded as {isPublic ? 'public ✓' : 'private'} · {queue.length} in queue
          </span>
          <div style={{display:'flex',gap:10}}>
            <button className="btn btn-ghost" onClick={onClose}>Done</button>
            <button
              className="btn btn-pri"
              style={{background:queue.length?'var(--gain)':'',borderColor:queue.length?'var(--gain)':'',opacity:queue.length?1:.45}}
              onClick={submitAll}
              disabled={busy || !queue.length}
            >
              {busy ? `Inserting ${queue.length}…` : <><Check size={15}/> Insert {queue.length} reco{queue.length!==1?'s':''}</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


function AdminCreators({ ME, claimRequests=[], onClaimAction }) {
  const [unclaimed,    setUnclaimed]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,   setShowCreate]   = useState(false);
  const [copiedId,     setCopiedId]     = useState(null);
  const [reviewNote,   setReviewNote]   = useState('');
  const [reviewingId,  setReviewingId]  = useState(null);
  const [seedingCreator, setSeedingCreator] = useState(null); // { id, name, username }
  const [recoCounts,   setRecoCounts]   = useState({}); // { [profileId]: count }

  const load = async () => {
    setLoading(true);
    try {
      const rows = await sql`
        SELECT id, full_name, username, claim_token, claim_status, claimed_by_uid, claimed_at, created_at, bio
        FROM user_profiles
        WHERE is_unclaimed = true
        ORDER BY created_at DESC`;
      setUnclaimed(rows);

      // Fetch reco counts for each unclaimed profile in one query
      if (rows.length) {
        const ids = rows.map(r => r.id);
        // Neon supports IN (unnest(array)) pattern for variable-length lists
        const counts = await sql`
          SELECT recommender_id, COUNT(*)::int AS n
          FROM ic_recommendations
          WHERE recommender_id = ANY(${ids})
          GROUP BY recommender_id`;
        const countMap = {};
        counts.forEach(c => { countMap[c.recommender_id] = c.n; });
        setRecoCounts(countMap);
      }
    } catch(e) { console.warn('AdminCreators load:', e?.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyLink = (token, id) => {
    const link = `${window.location.origin}${window.location.pathname}?claim_token=${token}`;
    navigator.clipboard.writeText(link).then(()=>{ setCopiedId(id); setTimeout(()=>setCopiedId(null),2000); }).catch(()=>{});
  };

  const deleteProfile = async (id) => {
    if (!window.confirm('Delete this unclaimed profile and all its seeded data? This cannot be undone.')) return;
    try {
      await sql`DELETE FROM ic_recommendations WHERE recommender_id = ${id}`;
      await sql`DELETE FROM user_profiles WHERE id = ${id} AND is_unclaimed = true`;
      load();
    } catch(e) { alert('Delete failed: ' + (e?.message||e)); }
  };

  const approveOrReject = async (reqId, action) => {
    const req = claimRequests.find(r=>r.id===reqId);
    if (!req) return;
    setReviewingId(reqId);
    try {
      if (action === 'approve') {
        const oldId = req.profile_id;
        const newId = req.claimer_uid;
        // Fetch unclaimed profile fields to copy over
        const unc = await sql`SELECT * FROM user_profiles WHERE id=${oldId} LIMIT 1`;
        if (!unc[0]) throw new Error('Unclaimed profile not found');
        const u = unc[0];

        // Atomic migration — update all FK tables then the PK row
        await sql`UPDATE ic_recommendations  SET recommender_id = ${newId} WHERE recommender_id = ${oldId}`;
        await sql`UPDATE connections          SET requester_id = ${newId}  WHERE requester_id = ${oldId}`;
        await sql`UPDATE connections          SET addressee_id = ${newId}  WHERE addressee_id = ${oldId}`;
        await sql`UPDATE group_members        SET user_id = ${newId}       WHERE user_id = ${oldId}`;
        await sql`UPDATE notifications        SET user_id = ${newId}       WHERE user_id = ${oldId}`;
        await sql`UPDATE notifications        SET from_user_id = ${newId}  WHERE from_user_id = ${oldId}`;
        await sql`UPDATE portfolio_holdings   SET owner_id = ${newId}      WHERE owner_id = ${oldId}`;

        // ── Step A: Free the username by nulling it on the unclaimed profile first.
        // This MUST happen before we set it on the creator's profile because
        // user_profiles.username has a UNIQUE index — setting it on the creator
        // while the unclaimed profile still holds it causes a constraint violation.
        await sql`
          UPDATE user_profiles SET
            username = NULL, claim_status = 'claimed', is_unclaimed = FALSE, claim_token = NULL
          WHERE id = ${oldId}
        `;

        // ── Step B: Transfer username + copy profile details to creator's real account.
        // COALESCE: respect any username the creator may have set themselves after logging in.
        await sql`
          UPDATE user_profiles SET
            username            = COALESCE(user_profiles.username, ${u.username}),
            bio                 = COALESCE(NULLIF(user_profiles.bio,''), ${u.bio||null}),
            registration_status = CASE WHEN user_profiles.registration_status IS NULL
                                       OR user_profiles.registration_status = 'self_directed'
                                  THEN ${u.registration_status||'self_directed'}
                                  ELSE user_profiles.registration_status END,
            sebi_approval_status = CASE WHEN user_profiles.sebi_approval_status IS NULL
                                        OR user_profiles.sebi_approval_status = 'not_applied'
                                   THEN ${u.sebi_approval_status||'not_applied'}
                                   ELSE user_profiles.sebi_approval_status END
          WHERE id = ${newId}
        `;

        // Mark claim request as approved
        await sql`UPDATE claim_requests SET status='approved', reviewed_at=NOW(), reviewed_by=${ME?.id||''}, admin_note=${reviewNote||null} WHERE id=${reqId}`;

        // Send approval email (fire and forget)
        const emailApi = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/email';
        fetch(emailApi, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'claim_approved',to_email:req.claimer_email,creator_name:req.claimer_full_name,username:req.profile_username})}).catch(()=>{});

      } else {
        // Reject: clear claim fields + regenerate token so admin can re-share a fresh link
        await sql`UPDATE user_profiles SET
          claim_status='unclaimed', claimed_by_uid=NULL, claimed_at=NULL,
          claim_token=${crypto.randomUUID().replace(/-/g,'')}
          WHERE id=${req.profile_id}`;
        await sql`UPDATE claim_requests SET status='rejected', reviewed_at=NOW(), reviewed_by=${ME?.id||''}, admin_note=${reviewNote||null} WHERE id=${reqId}`;
        const emailApi = (import.meta.env.VITE_CAS_API_URL || 'https://investor-circle.vercel.app') + '/api/email';
        fetch(emailApi, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'claim_rejected',to_email:req.claimer_email,creator_name:req.claimer_full_name,admin_note:reviewNote||''})}).catch(()=>{});
      }
      setReviewNote('');
      if (onClaimAction) onClaimAction();
      load();
    } catch(e) { alert('Action failed: ' + (e?.message||e)); }
    setReviewingId(null);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <div className="page-title">Creator Onboarding</div>
          <div className="page-sub">Create unclaimed profiles, seed data, and approve creator claims</div>
        </div>
        <button className="btn btn-pri" onClick={()=>setShowCreate(true)}><UserPlus size={15}/> Create Profile</button>
      </div>

      {showCreate && <CreateCreatorModal onClose={()=>setShowCreate(false)} onCreated={()=>{ setShowCreate(false); load(); }}/>}
      {seedingCreator && <AdminRecoSeedModal
        creatorId={seedingCreator.id}
        creatorName={seedingCreator.name}
        username={seedingCreator.username}
        onClose={()=>setSeedingCreator(null)}
        onDone={()=>{ load(); /* refresh counts after seeding */ }}
      />}

      {/* ── Pending claim approvals ── */}
      {claimRequests.length > 0 && (
        <div className="card" style={{marginBottom:24}}>
          <div className="card-head" style={{background:'rgba(109,93,245,.06)',color:'var(--accent)',fontWeight:800,fontSize:14,display:'flex',alignItems:'center',gap:8}}>
            <Bell size={15}/> Pending claim approvals ({claimRequests.length})
          </div>
          <div className="card-body" style={{padding:0}}>
            {claimRequests.map((req,i)=>(
              <div key={req.id} style={{padding:'14px 18px',borderBottom:i<claimRequests.length-1?'1px solid var(--line)':'none'}}>
                <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'flex-start',marginBottom:10}}>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{fontWeight:700,fontSize:14}}>{req.claimer_full_name || req.claimer_email}</div>
                    <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>wants to claim <strong>@{req.profile_username}</strong> · {req.claimer_email}</div>
                    <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Submitted {new Date(req.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>window.open(`/#/investor/${req.profile_username}`,'_blank')} title="View profile"><Globe size={13}/> View</button>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  <input className="inp" placeholder="Admin note (optional)…" value={reviewNote} onChange={e=>setReviewNote(e.target.value)} style={{flex:1,minWidth:160,fontSize:12}}/>
                  <button className="btn btn-pri btn-sm" onClick={()=>approveOrReject(req.id,'approve')} disabled={reviewingId===req.id} style={{background:'var(--gain)',borderColor:'var(--gain)'}}><Check size={13}/> Approve</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>approveOrReject(req.id,'reject')} disabled={reviewingId===req.id} style={{color:'var(--loss)'}}><X size={13}/> Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unclaimed profiles list ── */}
      <div className="card">
        <div className="card-head" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:800,fontSize:14}}>Unclaimed profiles ({unclaimed.length})</span>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13}/> Refresh</button>
        </div>
        <div className="card-body" style={{padding:0}}>
          {loading ? <div style={{padding:24,textAlign:'center',color:'var(--muted)'}}>Loading…</div>
          : unclaimed.length === 0 ? <div style={{padding:24,textAlign:'center',color:'var(--muted)',fontSize:13}}>No unclaimed profiles yet. Click "Create Profile" to start.</div>
          : unclaimed.map((p,i)=>(
            <div key={p.id} style={{padding:'13px 18px',borderBottom:i<unclaimed.length-1?'1px solid var(--line)':'none',display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
              <div className="av" style={{width:36,height:36,fontSize:13,flexShrink:0,background:'var(--grad)'}}>{initialsOf(p.full_name||'?')}</div>
              <div style={{flex:1,minWidth:160}}>
                <div style={{fontWeight:700,fontSize:14}}>{p.full_name}</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>@{p.username} · {p.claim_status==='pending_approval'?<span style={{color:'var(--accent)',fontWeight:600}}>Claim pending review</span>:p.claim_status==='unclaimed'?<span style={{color:'var(--muted)'}}>Awaiting claim</span>:<span>{p.claim_status}</span>}</div>
                <div style={{display:'flex',gap:8,marginTop:4,alignItems:'center'}}>
                  <div style={{fontSize:11,color:'var(--muted)'}}>Created {new Date(p.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
                  <span style={{
                    fontSize:11,fontWeight:700,padding:'1px 8px',borderRadius:10,
                    background: (recoCounts[p.id]||0) > 0 ? 'var(--gain-soft)' : 'var(--surface-2)',
                    color:      (recoCounts[p.id]||0) > 0 ? 'var(--gain)'      : 'var(--muted)',
                    border:     `1px solid ${(recoCounts[p.id]||0) > 0 ? 'var(--gain)' : 'var(--line)'}`,
                  }}>
                    {(recoCounts[p.id]||0) === 0 ? '0 recos seeded' : `${recoCounts[p.id]} reco${recoCounts[p.id]===1?'':'s'} seeded`}
                  </span>
                </div>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',flexShrink:0}}>
                {p.claim_token && (
                  <button className="btn btn-ghost btn-sm" onClick={()=>copyLink(p.claim_token,p.id)} title="Copy claim link">
                    {copiedId===p.id ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Claim link</>}
                  </button>
                )}
                <button
                  className="btn btn-pri btn-sm"
                  onClick={()=>setSeedingCreator({ id:p.id, name:p.full_name, username:p.username })}
                  title="Seed recommendations for this creator"
                  style={{fontSize:11}}
                >
                  <Plus size={12}/> Seed recos
                </button>
                <button className="btn btn-ghost btn-sm" onClick={()=>window.open(`/#/investor/${p.username}`,'_blank')} title="View profile"><Globe size={12}/> View</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>deleteProfile(p.id)} style={{color:'var(--loss)'}} title="Delete"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="note" style={{marginTop:20,fontSize:12,color:'var(--muted)'}}>
        <strong>Workflow:</strong> 1. Create profile → 2. Seed recommendations via <strong>Seed Data</strong> tab (use the creator's username) → 3. Share claim link → 4. Creator signs up → 5. Approve claim here.
      </div>
    </div>
  );
}

/* ─── ClaimProfilePage ───────────────────────────────────────────────────────── */
function ClaimProfilePage({ profile, token, onBack }) {
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimDone,      setClaimDone]      = useState(false);

  // ── Success state (shown until Firebase auth re-render takes over) ────────
  if (claimDone) return (
    <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div className="card" style={{maxWidth:480,width:'100%',padding:'36px 28px',textAlign:'center'}}>
        <div style={{fontSize:44,marginBottom:12}}>⏳</div>
        <div style={{fontWeight:800,fontSize:21,marginBottom:8}}>Your request is sent for approval</div>
        <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.7,marginBottom:16}}>
          Your claim for <strong>@{profile.username}</strong> has been submitted to the myInvestorCircle admin for review.
        </div>
        <div className="note" style={{fontSize:13,textAlign:'left',marginBottom:14,lineHeight:1.65}}>
          <strong>What happens next:</strong><br/>
          Once the admin approves your profile, you will see your historical recommendations and full ICI score on your Track Record page. You'll receive a confirmation email as soon as it's approved — usually within 24 hours.
        </div>
        <div style={{fontSize:12,color:'var(--muted)'}}>
          You're now logged in. Visit the <strong>Track Record</strong> tab to check your approval status.
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Full public profile page — same UI the creator will see once live */}
      <PublicProfilePage
        username={profile.username}
        viewerUser={null}
        viewerConnections={[]}
        viewerIsAdmin={false}
        viewerForClaim={true}
        onClaimClick={()=>setShowClaimModal(true)}
        mode="standalone"
        onBack={onBack}
        onRequestConnect={()=>{}}
      />

      {/* Claim modal — same EditProfile modal extended with credentials + consent */}
      {showClaimModal && (
        <ProfileEditModal
          profile={{
            first_name:           profile.first_name,
            last_name:            profile.last_name,
            bio:                  profile.bio,
            registration_status:  profile.registration_status,
            avatar_color:         '',
            email:                '',
          }}
          userId={null}
          username={null}
          patchProfile={null}
          claimMode={true}
          claimToken={token}
          unclaimedProfile={profile}
          onClaimSuccess={()=>{ setShowClaimModal(false); setClaimDone(true); }}
          onClose={()=>setShowClaimModal(false)}
        />
      )}
    </>
  );
}


function SparkLine({data=[], color='var(--gain)', height=50}) {
  if (data.length < 2) return null;
  const max=Math.max(...data,1), min=Math.min(...data,0), range=max-min||1;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*100},${100-((v-min)/range)*80-10}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height,display:'block'}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

/* ── computeTrend — monthly bullish% from recommendation dates ──── */
function computeTrend(recos=[], months=6) {
  if (!recos.length) return [];
  const now=new Date(), result=[];
  for (let i=months-1; i>=0; i--) {
    const from=new Date(now.getFullYear(),now.getMonth()-i,1);
    const to  =new Date(now.getFullYear(),now.getMonth()-i+1,0);
    const mo  =recos.filter(r=>{ const d=new Date(r.created_at); return d>=from&&d<=to; });
    if (mo.length) {
      result.push(Math.round((mo.filter(r=>r.recommendation_type==='Buy').length/mo.length)*100));
    } else if (result.length) result.push(result[result.length-1]);
  }
  return result;
}

/* ── SecurityQuickPanel — redesigned to match BRD wireframe ────── */
function SecurityQuickPanel({ticker,name,allRecos=[],circleRecos=[],onOpenFull,onClose,modal=false}) {
  const community  = computeConsensus(allRecos);
  const circle     = computeConsensus(circleRecos);
  const trend      = computeTrend(circleRecos.length>=2 ? circleRecos : allRecos);
  const recent     = (circleRecos.length ? circleRecos : allRecos).slice(0,3);
  const circleUniq = [...new Map(circleRecos.map(r=>[r.from,r])).values()].slice(0,5);
  const latestPrice= allRecos.find(r=>r.current_price||r.reco_price)?.current_price || allRecos.find(r=>r.reco_price)?.reco_price;

  const content = (
    <div style={{background:'var(--surface)',overflow:'hidden'}}>

      {/* Header */}
      <div style={{padding:'14px 18px',borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontWeight:900,fontSize:17,lineHeight:1.2}}>{ticker}</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>{name}</div>
          {latestPrice&&<div style={{fontSize:13,fontWeight:700,marginTop:4}}>₹{Number(latestPrice).toLocaleString('en-IN')}</div>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
          <button className="btn btn-ghost btn-sm" style={{fontSize:11,whiteSpace:'nowrap'}} onClick={onOpenFull}>Full Page →</button>
          <button className="iconbtn" onClick={onClose}><X size={15}/></button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{maxHeight:modal?'72vh':'calc(100vh - 180px)',overflowY:'auto',padding:'14px 18px',display:'flex',flexDirection:'column',gap:14}}>

        {/* Consensus bar */}
        {community.total>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:8}}>
              Consensus Overview <span style={{fontWeight:400}}>(All Investors)</span>
            </div>
            <div style={{display:'flex',height:10,borderRadius:6,overflow:'hidden',marginBottom:8}}>
              <div style={{width:`${community.bullPct}%`,background:'var(--gain)',transition:'width .4s'}}/>
              <div style={{width:`${community.neutralPct}%`,background:'rgba(141,144,173,.3)'}}/>
              <div style={{width:`${community.bearPct}%`,background:'var(--loss)',transition:'width .4s'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
              <span style={{color:'var(--gain)',fontWeight:700}}>{community.bullPct}% Bullish</span>
              <span style={{color:'var(--muted)'}}>{community.neutralPct}% Neutral</span>
              <span style={{color:'var(--loss)',fontWeight:700}}>{community.bearPct}% Bearish</span>
            </div>
          </div>
        )}

        {/* My Circle vs Community comparison */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[['My Circle',circle,circleRecos.length],['Community',community,allRecos.length]].map(([label,c,count])=>(
            <div key={label} style={{background:'var(--surface-2)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:6}}>{label}</div>
              {c.total>0?(
                <>
                  <div style={{fontSize:24,fontWeight:900,lineHeight:1,color:c.bullPct>=55?'var(--gain)':c.bearPct>=55?'var(--loss)':'var(--muted)'}}>{c.bullPct}%</div>
                  <div style={{fontSize:11,fontWeight:700,color:c.bullPct>=55?'var(--gain)':c.bearPct>=55?'var(--loss)':'var(--muted)',marginTop:2}}>{c.label}</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{count} investor{count!==1?'s':''}</div>
                </>
              ):<div style={{fontSize:12,color:'var(--muted)',paddingTop:4}}>No data</div>}
            </div>
          ))}
        </div>

        {/* Avatar stack of circle investors */}
        {circleUniq.length>0&&(
          <div style={{display:'flex',alignItems:'center',gap:2}}>
            {circleUniq.map((r,i)=>(
              <div key={i} className="av" style={{width:28,height:28,fontSize:10,flexShrink:0,
                marginLeft:i?-8:0,border:'2px solid var(--surface)',background:'var(--grad)',zIndex:5-i}}>
                {initialsOf(r.full_name||r.username||'?')}
              </div>
            ))}
            {circleRecos.length>5&&<span style={{fontSize:11,color:'var(--muted)',marginLeft:12}}>+{circleRecos.length-5}</span>}
          </div>
        )}

        {/* Recommended by */}
        {recent.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>Recommended by {circleRecos.length?'(My Circle)':'(Community)'}</span>
              {(circleRecos.length||allRecos.length)>3&&(
                <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px'}} onClick={onOpenFull}>
                  View All {circleRecos.length||allRecos.length}
                </button>
              )}
            </div>
            {recent.map((r,i)=>{
              const isBuy=r.recommendation_type==='Buy';
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:i<recent.length-1?'1px solid var(--line)':'none'}}>
                  <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(r.full_name||r.username||'?')}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.full_name||r.username||'Investor'}</div>
                    {r.conviction&&<div style={{fontSize:10,color:'var(--muted)'}}>{r.conviction}</div>}
                  </div>
                  <span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>
                    {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):''}
                  </span>
                  <span style={{fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:4,flexShrink:0,
                    background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                    {isBuy?'BUY':'SELL'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Consensus trend chart */}
        {trend.length>=2&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:4,display:'flex',justifyContent:'space-between'}}>
              <span>Consensus Trend {circleRecos.length>=2?'(My Circle)':'(Community)'}</span>
              <span style={{fontWeight:900,color:circle.bullPct>=55?'var(--gain)':circle.bearPct>=55?'var(--loss)':'var(--muted)'}}>{trend[trend.length-1]}%</span>
            </div>
            <SparkLine data={trend} color={circle.bullPct>=55?'var(--gain)':circle.bearPct>=55?'var(--loss)':'#8d90ad'} height={55}/>
          </div>
        )}

        {/* AI Insight summary */}
        {allRecos.length>=2&&(
          <div style={{padding:'12px 14px',background:'var(--accent-soft)',borderRadius:10,borderLeft:'3px solid var(--accent-ink)'}}>
            <div style={{fontSize:11,fontWeight:800,color:'var(--accent-ink)',marginBottom:5,display:'flex',alignItems:'center',gap:6}}>
              <Lightbulb size={13}/> AI Insight Summary
            </div>
            <div style={{fontSize:12,color:'var(--ink-soft)',lineHeight:1.55}}>
              {ticker} is seeing <strong>{community.label.toLowerCase()}</strong> sentiment from {community.total} investor{community.total!==1?'s':''}.
              {community.bullPct>=60?' Strong buy conviction from the community.' :
               community.bearPct>=60?' Investors are flagging caution on this stock.' :
               ' Community opinion is mixed — review individual theses below.'}
            </div>
          </div>
        )}

        <button className="btn btn-pri" style={{width:'100%',justifyContent:'center'}} onClick={onOpenFull}>
          View Security Intelligence →
        </button>

        {allRecos.length===0&&(
          <div style={{textAlign:'center',padding:'8px 0',color:'var(--muted)',fontSize:13}}>No recommendations for {ticker} yet.</div>
        )}
      </div>
    </div>
  );

  if (modal) return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{background:'var(--surface)',borderRadius:'20px 20px 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.35)',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:'var(--line-2)',borderRadius:2,margin:'12px auto 4px'}}/>
        {content}
      </div>
    </div>
  );

  return (
    <div style={{position:'sticky',top:80,background:'var(--surface)',borderRadius:12,border:'1px solid var(--line-2)',overflow:'hidden',boxShadow:'0 4px 24px rgba(0,0,0,.08)'}}>
      {content}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PORTFOLIO INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */
function PortfolioIntelligencePage({ holdings, setHoldings, contacts, me, refreshPrices, priceRefresh, onOpenSecurity, setPage }) {
  const isMobile = useIsMobile();
  const [recoMap, setRecoMap] = useState({}); // { ticker: [reco,...] }
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [tab, setTab] = useState('all'); // all | bullish | neutral | bearish

  // Declare ownerId BEFORE any hooks that reference it in dependency arrays (prevents TDZ crash)
  const ownerId   = me?.id || '';
  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  // ── DB helpers ───────────────────────────────────────────────
  /** Convert a DB row → app holding object */
  const dbRow2Holding = r => ({
    id:           r.id,
    sym:          r.sym   || '',
    name:         r.name  || '',
    type:         r.type  || 'Stock',
    acct:         r.acct  || 'manual',
    acctName:     r.acct_name || 'Manual Portfolio',
    sh:           Number(r.sh)   || 0,
    cost:         Number(r.cost) || 0,
    price:        Number(r.price)|| 0,
    isin:         r.isin  || '',
    sector:       r.sector|| '',
    currency:     r.currency || 'INR',
    purchaseDate: r.purchase_date || null,
    source:       r.source || 'manual',
  });

  // Load holdings from DB whenever owner changes.
  // [ownerId] dependency ensures this re-runs on account switch — no dbLoaded flag needed.
  useEffect(()=>{
    if (!sql || !ownerId) return;
    sql`SELECT * FROM portfolio_holdings WHERE owner_id=${ownerId} ORDER BY created_at ASC`
      .then(rows => {
        // Always replace state even with []. Removing this guard was the privacy fix:
        // a user with 0 holdings must not see a previous user's stale state.
        setHoldings((rows||[]).map(dbRow2Holding));
      })
      .catch(e => console.warn('load holdings:', e?.message||e));
  },[ownerId]);

  /** Upsert a single holding to DB */
  const saveHolding = async (h) => {
    // PRIVACY: never write a holding without a validated, non-empty owner id
    if (!sql || !ownerId || ownerId.length < 4) {
      console.error('saveHolding blocked — invalid ownerId:', ownerId);
      return;
    }
    try {
      await sql`
        INSERT INTO portfolio_holdings
          (id, owner_id, sym, name, type, acct, acct_name, sh, cost, price, isin, sector, currency, purchase_date, source)
        VALUES
          (${h.id}, ${ownerId}, ${h.sym}, ${h.name||''}, ${h.type||'Stock'},
           ${h.acct||'manual'}, ${h.acctName||'Manual Portfolio'},
           ${h.sh||0}, ${h.cost||0}, ${h.price||0},
           ${h.isin||''}, ${h.sector||''}, ${h.currency||'INR'},
           ${h.purchaseDate||null}, ${h.source||'manual'})
        ON CONFLICT (id) DO UPDATE SET
          sym=EXCLUDED.sym, name=EXCLUDED.name, type=EXCLUDED.type,
          sh=EXCLUDED.sh, cost=EXCLUDED.cost, price=EXCLUDED.price,
          isin=EXCLUDED.isin, sector=EXCLUDED.sector, currency=EXCLUDED.currency,
          purchase_date=EXCLUDED.purchase_date, source=EXCLUDED.source,
          updated_at=NOW()
      `;
    } catch(e) { console.warn('saveHolding:', e?.message||e); }
  };

  /** Delete a holding from DB */
  const deleteHolding = async (id) => {
    if (!sql || !ownerId || ownerId.length < 4) return;
    try {
      await sql`DELETE FROM portfolio_holdings WHERE id=${id} AND owner_id=${ownerId}`;
    } catch(e) { console.warn('deleteHolding:', e?.message||e); }
  };

  /** Bulk-replace all holdings in DB (used by CAS import replace mode) */
  const replaceAllHoldings = async (newHoldings) => {
    if (!sql || !ownerId || ownerId.length < 4) {
      console.error('replaceAllHoldings blocked — invalid ownerId:', ownerId);
      return;
    }
    try {
      await sql`DELETE FROM portfolio_holdings WHERE owner_id=${ownerId}`;
      for (const h of newHoldings) await saveHolding(h);
    } catch(e) { console.warn('replaceAllHoldings:', e?.message||e); }
  };

  // Load ALL active recommendations — re-runs whenever holding count changes
  // so consensus overlay stays fresh after CAS imports and manual additions
  useEffect(()=>{
    if (!sql) { setLoading(false); return; }
    setLoading(true);
    // Column is recommender_id (confirmed from INSERT at line 5904), NOT "from".
    // Alias as "from" so JS filtering (circleIds.includes(r.from)) continues to work.
    sql`SELECT r.ticker, r.asset_name, r.recommendation_type,
               r.recommender_id as "from", r.conviction, r.created_at,
               up.full_name, up.username
        FROM ic_recommendations r
        LEFT JOIN user_profiles up ON r.recommender_id = up.id
        WHERE (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)`
      .then(rows=>{
        const map={};
        rows.forEach(r=>{
          const key=(r.ticker||'').toUpperCase().trim();
          if(key)(map[key]=map[key]||[]).push(r);
        });
        setRecoMap(map); setLoading(false);
      })
      .catch(e=>{ console.warn('recoMap SQL error:',e?.message||e); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[holdings.length]); // re-runs on holding add/remove; covers CAS upload + manual add

  const holdingsData = useMemo(()=>holdings.map(h=>{
    // Uppercase both sides so 'KPL' matches 'kpl' in recoMap
    const key    = (h.sym||'').toUpperCase().trim();
    const allR   = recoMap[key]||[];
    const circleR= allR.filter(r=>circleIds.includes(r.from));
    const community = computeConsensus(allR);
    const circle    = computeConsensus(circleR);
    const value = (h.sh||0)*(h.price||0);
    const gain  = h.cost>0?((h.price-h.cost)/h.cost*100):0;
    return {...h, community, circle, value, gain, allR, circleR};
  }),[holdings,recoMap,circleIds]);

  const filtered = holdingsData.filter(h=>
    tab==='all'||
    (tab==='bullish'&&h.community.bullPct>=55)||
    (tab==='bearish'&&h.community.bearPct>=55)||
    (tab==='neutral'&&h.community.bullPct<55&&h.community.bearPct<55)
  );

  const totalValue = holdingsData.reduce((s,h)=>s+(h.value||0),0);
  const avgBull = holdingsData.filter(h=>h.community.total>0).reduce((s,h,_,a)=>s+h.community.bullPct/a.length,0)||0;
  const highConv = holdingsData.filter(h=>h.community.strength>=60).length;
  const selected = holdingsData.find(h=>h.sym===selectedTicker);

  // ── Opportunity Signals ──────────────────────────────────────────
  const now = Date.now();
  const signals = useMemo(()=>{
    const thirtyDays = 30*24*60*60*1000;
    const strongConv = [...holdingsData]
      .filter(h=>h.community.strength>=65&&h.community.bullPct>=60)
      .sort((a,b)=>b.community.strength-a.community.strength).slice(0,3);
    const weakening = holdingsData.filter(h=>
      h.community.total>=3 && h.circle.total>=2 &&
      h.circle.bullPct < h.community.bullPct - 15
    ).sort((a,b)=>(a.circle.bullPct-a.community.bullPct)-(b.circle.bullPct-b.community.bullPct)).slice(0,3);
    const emerging = holdingsData.filter(h=>{
      const recent = (h.allR||[]).filter(r => r.created_at && (now - new Date(r.created_at)) < thirtyDays);
      return recent.length>=2 && h.community.total<=6;
    }).sort((a,b)=>b.community.bullPct-a.community.bullPct).slice(0,3);
    return { strongConv, weakening, emerging };
  },[holdingsData]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <div className="page-title">Portfolio Intelligence</div>
          <div className="page-sub">See what the market and your circle think about the stocks you hold</div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)',marginRight:4}}/>}
          <button className="btn btn-ghost btn-sm" title="Reload consensus data from latest recommendations"
            onClick={()=>{ setRecoMap({}); setLoading(true); /* holdings.length dep triggers reload */ setHoldings(h=>[...h]); }}>
            <RefreshCw size={13}/> Refresh Intelligence
          </button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowAddHolding(true)}><Plus size={13}/> Add Holding</button>
          <button className="btn btn-soft btn-sm" onClick={()=>setShowManage(true)}><Upload size={13}/> Upload CAS</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
        {[
          {icon:<BarChart2 size={18}/>,label:'Total Holdings',val:holdings.length,sub:holdings.length?`${holdingsData.filter(h=>h.community.total>0).length} tracked by community`:'Upload CAS to begin'},
          {icon:<Globe size={18}/>,label:'Total Value',val:`₹${Math.round(totalValue).toLocaleString('en-IN')}`,accent:true},
          {icon:<TrendingUp size={18}/>,label:'Avg Market Sentiment',val:`${Math.round(avgBull)}% Bullish`,bar:true,pct:avgBull},
          {icon:<Zap size={18}/>,label:'High Conviction',val:highConv,sub:`holdings with strong consensus`},
        ].map((s,i)=>(
          <div key={i} className="card" style={{padding:'16px 18px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,color:'var(--accent-ink)',opacity:.7}}>{s.icon}</div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:4}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:900,color:s.accent?'var(--accent-ink)':'var(--ink)'}}>{s.val}</div>
            {s.sub&&<div style={{fontSize:11,color:'var(--muted)',marginTop:3}}>{s.sub}</div>}
            {s.bar&&<div style={{height:3,borderRadius:2,overflow:'hidden',marginTop:8,background:'var(--line)'}}>
              <div style={{width:`${s.pct}%`,background:'var(--gain)',height:'100%',transition:'width .6s'}}/>
            </div>}
          </div>
        ))}
      </div>

      {/* Opportunity Signals — only shown when there are holdings with consensus data */}
      {holdingsData.some(h=>h.community.total>0)&&(signals.strongConv.length>0||signals.weakening.length>0||signals.emerging.length>0)&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--muted)',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
            <Zap size={13}/> Opportunity Signals
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10}}>
            {/* Strongest Conviction */}
            {signals.strongConv.length>0&&signals.strongConv.map(h=>(
              <div key={'sc'+h.sym} className="card" style={{padding:'12px 14px',cursor:'pointer',border:'1px solid var(--gain)',borderRadius:12}}
                onClick={()=>{setSelectedTicker(h.sym);}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <span style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--gain)',background:'var(--gain-soft)',padding:'2px 7px',borderRadius:4}}>Strong Conviction</span>
                  <span style={{fontSize:10,color:'var(--muted)'}}>{h.community.strength}/100</span>
                </div>
                <div style={{fontWeight:900,fontSize:15}}>{h.sym}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                <ConsensusBar cons={h.community} width={'100%'} mini/>
              </div>
            ))}
            {/* Diverging — circle less bullish than community */}
            {signals.weakening.length>0&&signals.weakening.map(h=>(
              <div key={'wk'+h.sym} className="card" style={{padding:'12px 14px',cursor:'pointer',border:'1px solid #fbbf24',borderRadius:12}}
                onClick={()=>{setSelectedTicker(h.sym);}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <span style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'#92400e',background:'#fef3c7',padding:'2px 7px',borderRadius:4}}>Circle Diverging</span>
                  <span style={{fontSize:10,color:'var(--muted)'}}>↓{Math.round(h.community.bullPct-h.circle.bullPct)}%</span>
                </div>
                <div style={{fontWeight:900,fontSize:15}}>{h.sym}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                <div style={{fontSize:11,color:'var(--muted)'}}>Community {h.community.bullPct}% bull · Circle {h.circle.bullPct}% bull</div>
              </div>
            ))}
            {/* Emerging — few but growing recos */}
            {signals.emerging.length>0&&signals.emerging.map(h=>(
              <div key={'em'+h.sym} className="card" style={{padding:'12px 14px',cursor:'pointer',border:'1px solid var(--accent)',borderRadius:12}}
                onClick={()=>{setSelectedTicker(h.sym);}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <span style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--accent-ink)',background:'var(--accent-soft)',padding:'2px 7px',borderRadius:4}}>Emerging Idea</span>
                  <span style={{fontSize:10,color:'var(--muted)'}}>+Recent</span>
                </div>
                <div style={{fontWeight:900,fontSize:15}}>{h.sym}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                <ConsensusBar cons={h.community} width={'100%'} mini/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="seg" style={{marginBottom:16}}>
        {[['all','All Holdings'],['bullish','Bullish'],['neutral','Neutral'],['bearish','Bearish']].map(([v,l])=>(
          <button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>
        ))}
      </div>

      {/* Main grid: table + quick panel — stacks on mobile */}
      <div style={{display:'grid',gridTemplateColumns:selected&&!isMobile?'1fr 340px':'1fr',gap:16,alignItems:'start'}}>
        <div className="card">
          <div className="card-head"><BarChart2 size={15}/> My Holdings — Market Consensus Overlay</div>
          {holdings.length===0?(
            <div style={{padding:'48px 24px',textAlign:'center'}}>
              <BarChart2 size={32} style={{color:'var(--muted)',marginBottom:12,opacity:.4}}/>
              <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>No holdings yet</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Add holdings manually or import your entire portfolio from a CAS PDF</div>
              <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                <button className="btn btn-pri" onClick={()=>setShowAddHolding(true)}><Plus size={14}/> Add Holding</button>
                <button className="btn btn-ghost" onClick={()=>setShowManage(true)}><Upload size={14}/> Upload CAS PDF</button>
              </div>
            </div>
          ):( isMobile ? (
            /* ── Mobile: asset card list (keeps scroll, search, filters at top) ── */
            <div style={{display:'flex',flexDirection:'column',gap:10,padding:'14px 16px'}}>
              {filtered.map(h=>(
                <div key={h.id} onClick={()=>setSelectedTicker(prev=>prev===h.sym?null:h.sym)}
                  style={{background:'var(--surface)',border:`1px solid ${selectedTicker===h.sym?'var(--accent)':'var(--line)'}`,borderRadius:12,padding:'13px 15px',cursor:'pointer',transition:'border-color .15s'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:800,fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.sym}</div>
                      <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0,marginLeft:10}}>
                      <div style={{fontWeight:700,fontSize:14}}>₹{h.value.toLocaleString('en-IN')}</div>
                      <div style={{fontSize:11,color:h.gain>=0?'var(--gain)':'var(--loss)',fontWeight:600}}>{h.gain>=0?'+':''}{h.gain.toFixed(1)}%</div>
                    </div>
                  </div>
                  {h.community.total>0&&(<div style={{marginBottom:6}}><div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>Community</div><ConsensusBar cons={h.community} width={'100%'} mini/></div>)}
                  {h.circle.total>0&&(<div style={{marginBottom:6}}><div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>My circle</div><ConsensusBar cons={h.circle} width={'100%'} mini/></div>)}
                  {h.community.total===0&&h.circle.total===0&&(<div style={{fontSize:11,color:'var(--muted)',fontStyle:'italic',marginBottom:4}}>No recommendations yet</div>)}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,paddingTop:8,borderTop:'1px solid var(--line)'}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();onOpenSecurity(h.sym,h.name);}}><ChevronRight size={13}/> Security Intel</button>
                    <button style={{border:'none',background:'none',cursor:'pointer',color:'var(--loss)',opacity:.5,padding:4}}
                      onClick={e=>{e.stopPropagation();setHoldings(p=>p.filter(x=>x.id!==h.id));deleteHolding(h.id);}}
                      onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.5}><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
              {filtered.length===0&&(<div style={{padding:'32px 16px',textAlign:'center',color:'var(--muted)',fontSize:13}}>No holdings match the current filter.</div>)}
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--line)'}}>
                    {['Stock','Current Value','Overall Gain','Market Consensus (All Investors)','Consensus in My Circle','Strength','',''].map((h,i)=>(
                      <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h=>{
                    const sel = h.sym===selectedTicker;
                    return (
                      <tr key={h.id} onClick={()=>setSelectedTicker(sel?null:h.sym)}
                        style={{borderBottom:'1px solid var(--line)',cursor:'pointer',background:sel?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                        <td style={{padding:'13px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div className="av" style={{width:34,height:34,fontSize:12,flexShrink:0,background:'var(--grad)'}}>{h.sym?.slice(0,2)||'—'}</div>
                            <div>
                              <div style={{fontWeight:800,fontSize:14}}>{h.sym}</div>
                              <div style={{fontSize:11,color:'var(--muted)',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</div>
                              <div style={{fontSize:10,color:'var(--muted)'}}>{h.sh} shares · ₹{Number(h.cost).toLocaleString('en-IN')} avg</div>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:14}}>₹{Math.round(h.value).toLocaleString('en-IN')}</div>
                          <div style={{fontSize:11,color:'var(--muted)'}}>₹{Number(h.price).toLocaleString('en-IN')} now</div>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center'}}>
                          <span style={{fontWeight:800,color:h.gain>=0?'var(--gain)':'var(--loss)',fontSize:15}}>{h.gain>=0?'+':''}{h.gain.toFixed(1)}%</span>
                          <div style={{fontSize:10,color:'var(--muted)'}}>₹{Math.round((h.price-h.cost)*h.sh).toLocaleString('en-IN')}</div>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center',minWidth:140}}>
                          <ConsensusBar cons={h.community} width={120}/>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center',minWidth:140}}>
                          <ConsensusBar cons={h.circle} width={120}/>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center',minWidth:70}}>
                          <StrengthDot strength={h.community.strength}/>
                        </td>
                        <td style={{padding:'13px 14px',textAlign:'center'}}>
                          <button className="iconbtn" title="Security Intelligence"
                            onClick={e=>{e.stopPropagation();onOpenSecurity(h.sym,h.name);}}>
                            <ChevronRight size={16}/>
                          </button>
                        </td>
                        <td style={{padding:'13px 6px',textAlign:'center'}}>
                          <button className="iconbtn" title="Remove holding"
                            onClick={e=>{e.stopPropagation();setHoldings(p=>p.filter(x=>x.id!==h.id));deleteHolding(h.id);}}
                            style={{opacity:.4,color:'var(--loss)'}}
                            onMouseEnter={e=>e.currentTarget.style.opacity=1}
                            onMouseLeave={e=>e.currentTarget.style.opacity=.4}>
                            <Trash2 size={14}/>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) /* end isMobile ternary */ )}
        </div>

        {selected&&(
          isMobile
            ? <SecurityQuickPanel ticker={selected.sym} name={selected.name} allRecos={selected.allR} circleRecos={selected.circleR} onOpenFull={()=>onOpenSecurity(selected.sym,selected.name)} onClose={()=>setSelectedTicker(null)} modal/>
            : <SecurityQuickPanel ticker={selected.sym} name={selected.name} allRecos={selected.allR} circleRecos={selected.circleR} onOpenFull={()=>onOpenSecurity(selected.sym,selected.name)} onClose={()=>setSelectedTicker(null)}/>
        )}
      </div>

      {/* Modals */}
      {showManage&&<PanPullModal onClose={()=>setShowManage(false)} onApply={async (h,mode)=>{
          if (mode==='replace') { setHoldings(h); await replaceAllHoldings(h); }
          else {
            const toAdd = h.filter(nh=>!holdings.find(x=>x.sym===nh.sym));
            setHoldings(p=>[...p,...toAdd]);
            for (const nh of toAdd) await saveHolding(nh);
          }
          setShowManage(false);
        }}/>}
      {showAddHolding&&<AddHoldingModal onClose={()=>setShowAddHolding(false)} onAdd={async h=>{ setHoldings(p=>[...p,h]); await saveHolding(h); setShowAddHolding(false); }}/>}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ADD HOLDING MODAL
   ═══════════════════════════════════════════════════════════════════ */
function AddHoldingModal({ onClose, onAdd }) {
  const [mode,        setMode]        = useState('search');   // 'search' | 'manual'
  const [selected,    setSelected]    = useState(null);        // instrument from search
  const [ticker,      setTicker]      = useState('');
  const [name,        setName]        = useState('');
  const [assetType,   setAssetType]   = useState('Stock');
  const [sector,      setSector]      = useState('');
  const [currency,    setCurrency]    = useState('INR');
  // Optional financial fields
  const [qty,         setQty]         = useState('');
  const [purchPrice,  setPurchPrice]  = useState('');
  const [purchDate,   setPurchDate]   = useState('');
  const [err,         setErr]         = useState('');

  const TYPE_OPTS = ['Stock','ETF','Fund','Crypto','Bond','REIT','Others'];
  const CCY_OPTS  = ['INR','USD','EUR','GBP','JPY','SGD','AED'];

  const handleSelect = instr => {
    setSelected(instr);
    setTicker((instr.symbol||instr.ticker||'').toUpperCase());
    setName(instr.name||'');
    setSector(instr.sector||'');
    setCurrency(instr.currency||'INR');
    // Map asset_class → holding type
    const ac = (instr.asset_class||instr.type||'').toLowerCase();
    setAssetType(ac.includes('etf')?'ETF':ac.includes('fund')||ac.includes('mf')?'Fund':ac.includes('crypto')?'Crypto':'Stock');
  };

  const canAdd = ticker.trim() && name.trim();

  const handleAdd = () => {
    if (!ticker.trim()) { setErr('Ticker / symbol is required.'); return; }
    if (!name.trim())   { setErr('Asset name is required.'); return; }
    const sh   = parseFloat(qty)        || 0;
    const cost = parseFloat(purchPrice) || 0;
    onAdd({
      id:        `hold_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      sym:       ticker.trim().toUpperCase(),
      name:      name.trim(),
      type:      assetType,
      acct:      'manual',
      acctName:  'Manual Portfolio',
      sh,
      cost,
      price:     cost,   // use purchase price as proxy until live price refreshes
      isin:      selected?.isin || '',
      sector:    sector.trim(),
      currency,
      purchaseDate: purchDate || new Date().toISOString().slice(0,10),
      source:    'manual',
    });
  };

  const FieldLabel = ({children,hint}) => (
    <label style={{fontSize:12,fontWeight:700,color:'var(--muted)',display:'block',marginBottom:5}}>
      {children}{hint&&<span style={{fontWeight:400,marginLeft:6,fontSize:11}}>{hint}</span>}
    </label>
  );

  const inputSt = {
    width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--line-2)',
    background:'var(--surface)', color:'var(--ink)', fontSize:13, outline:'none',
    boxSizing:'border-box',
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{width:540, maxHeight:'92vh', overflowY:'auto'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="modal-head">
          <h3 style={{display:'flex',alignItems:'center',gap:8}}>
            <Plus size={18} style={{color:'var(--accent-ink)'}}/> Add Holding
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:18,padding:'20px 24px'}}>

          {/* Mode toggle */}
          <div className="seg">
            <button className={mode==='search'?'active':''} onClick={()=>setMode('search')}>Search Asset</button>
            <button className={mode==='manual'?'active':''} onClick={()=>setMode('manual')}>Add Manually</button>
          </div>

          {/* Search mode */}
          {mode==='search'&&(
            <div>
              <FieldLabel>Search by name or ticker</FieldLabel>
              <InstrumentSearch
                onSelect={handleSelect}
                placeholder="e.g. Reliance, HDFCBANK, Nifty 50 ETF…"
                initialValue={ticker}
              />
              {selected&&(
                <div style={{marginTop:10,padding:'10px 14px',background:'var(--accent-soft)',borderRadius:10,
                  border:'1px solid var(--line-2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>{selected.symbol||selected.ticker}</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>{selected.name}
                      {selected.exchange&&<span> · {selected.exchange}</span>}
                      {(selected.sector)&&<span> · {selected.sector}</span>}
                    </div>
                  </div>
                  <button className="iconbtn" onClick={()=>{setSelected(null);setTicker('');setName('');}} title="Clear"><X size={14}/></button>
                </div>
              )}
            </div>
          )}

          {/* Manual mode — ticker + name */}
          {mode==='manual'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:12}}>
              <div>
                <FieldLabel>Ticker / Symbol *</FieldLabel>
                <input value={ticker} onChange={e=>{setTicker(e.target.value.toUpperCase());setErr('');}}
                  placeholder="e.g. RELIANCE" maxLength={20} style={inputSt} autoFocus/>
              </div>
              <div>
                <FieldLabel>Asset Name *</FieldLabel>
                <input value={name} onChange={e=>{setName(e.target.value);setErr('');}}
                  placeholder="e.g. Reliance Industries Ltd" style={inputSt}/>
              </div>
            </div>
          )}

          {/* Asset details — shown once ticker+name are available */}
          {(mode==='manual'||(mode==='search'&&selected))&&(
            <>
              {/* Separator */}
              <div style={{borderTop:'1px solid var(--line)',margin:'0 -24px'}}/>

              {/* Ticker/name row for search mode (editable override) */}
              {mode==='search'&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:12}}>
                  <div>
                    <FieldLabel hint="editable">Ticker</FieldLabel>
                    <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} maxLength={20} style={inputSt}/>
                  </div>
                  <div>
                    <FieldLabel hint="editable">Name</FieldLabel>
                    <input value={name} onChange={e=>setName(e.target.value)} style={inputSt}/>
                  </div>
                </div>
              )}

              {/* Type / Sector / Currency */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <div>
                  <FieldLabel>Asset Type</FieldLabel>
                  <select value={assetType} onChange={e=>setAssetType(e.target.value)} style={inputSt}>
                    {TYPE_OPTS.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel hint="(optional)">Sector</FieldLabel>
                  <input value={sector} onChange={e=>setSector(e.target.value)} placeholder="e.g. Banking" style={inputSt}/>
                </div>
                <div>
                  <FieldLabel>Currency</FieldLabel>
                  <select value={currency} onChange={e=>setCurrency(e.target.value)} style={inputSt}>
                    {CCY_OPTS.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Optional section */}
              <div style={{background:'var(--surface-2)',borderRadius:12,padding:'16px 18px'}}>
                <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',
                  color:'var(--muted)',marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
                  <span>Track Amounts</span>
                  <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,fontSize:11}}>— optional, leave blank to track without disclosing</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div>
                    <FieldLabel>Quantity / Units</FieldLabel>
                    <input type="number" min="0" step="any" value={qty}
                      onChange={e=>setQty(e.target.value)} placeholder="e.g. 50" style={inputSt}/>
                  </div>
                  <div>
                    <FieldLabel>Purchase Price {currency&&<span style={{color:'var(--muted)',fontWeight:400}}>({currency})</span>}</FieldLabel>
                    <input type="number" min="0" step="any" value={purchPrice}
                      onChange={e=>setPurchPrice(e.target.value)} placeholder="per unit" style={inputSt}/>
                  </div>
                  <div>
                    <FieldLabel>Purchase Date</FieldLabel>
                    <input type="date" value={purchDate} onChange={e=>setPurchDate(e.target.value)}
                      max={new Date().toISOString().slice(0,10)} style={inputSt}/>
                  </div>
                </div>
                {qty&&purchPrice&&(
                  <div style={{marginTop:10,fontSize:12,color:'var(--muted)'}}>
                    Total invested: <strong style={{color:'var(--ink)'}}>{currency} {(parseFloat(qty)*parseFloat(purchPrice)).toLocaleString('en-IN',{maximumFractionDigits:2})}</strong>
                  </div>
                )}
              </div>

              {err&&<div style={{color:'var(--loss)',fontSize:13,fontWeight:600}}>{err}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-foot" style={{justifyContent:'space-between'}}>
          <div style={{fontSize:12,color:'var(--muted)'}}>
            {!canAdd&&<span>* Ticker and name required</span>}
          </div>
          <div style={{display:'flex',gap:10}}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-pri" disabled={!canAdd} onClick={handleAdd}>
              <Plus size={14}/> Add to Portfolio
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MARKET INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */
function MarketIntelligencePage({ contacts, me, onOpenSecurity }) {
  const isMobile = useIsMobile();
  const [recos, setRecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // all | circle | community | verified
  const [sector, setSector] = useState('all');
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [expandedTicker, setExpandedTicker] = useState(null); // inline row expansion

  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  useEffect(()=>{
    if (!sql) { setLoading(false); return; }
    // Only public recommendations contribute to community-wide market intelligence.
    sql`SELECT r.ticker, r.asset_name, r.recommendation_type,
               r.recommender_id as "from", r.conviction, r.created_at, r.sector,
               up.username, up.full_name
        FROM ic_recommendations r
        LEFT JOIN user_profiles up ON r.recommender_id = up.id
        WHERE r.is_public = true
          AND (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)
        ORDER BY r.created_at DESC`
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(e=>{ console.warn('Market Intel SQL error:',e?.message||e); setLoading(false); });
  },[]);

  // Group by ticker
  const tickerMap = useMemo(()=>{
    const byT={};
    recos.forEach(r=>{
      if (!byT[r.ticker]) byT[r.ticker]={ticker:r.ticker,name:r.asset_name||r.ticker,sector:r.sector||'',recos:[]};
      byT[r.ticker].recos.push(r);
    });
    return byT;
  },[recos]);

  const allTickers = useMemo(()=>Object.values(tickerMap).map(t=>{
    const filtered = tab==='circle'    ? t.recos.filter(r=>circleIds.includes(r.from))
                   : tab==='community' ? t.recos
                   : t.recos; // 'all'
    const community  = computeConsensus(t.recos);
    const circle     = computeConsensus(t.recos.filter(r=>circleIds.includes(r.from)));
    const tabCons    = computeConsensus(filtered);
    return {...t, community, circle, tabCons, filteredRecos:filtered};
  }).filter(t=>t.filteredRecos.length>0
    && (sector==='all'||t.sector===sector)
    && (!search||t.ticker.includes(search.toUpperCase())||t.name.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>b.filteredRecos.length-a.filteredRecos.length),[tickerMap,tab,circleIds,sector,search]);

  // Discovery cards
  const strongest   = [...allTickers].sort((a,b)=>b.tabCons.strength-a.tabCons.strength)[0];
  const emerging    = [...allTickers].filter(t=>t.filteredRecos.length>=2&&t.filteredRecos.length<=5).sort((a,b)=>b.tabCons.bullPct-a.tabCons.bullPct)[0];
  const mostDiscussed= [...allTickers].sort((a,b)=>b.filteredRecos.length-a.filteredRecos.length)[0];
  const mostDivided = [...allTickers].filter(t=>t.tabCons.total>=3).sort((a,b)=>Math.abs(50-b.tabCons.bullPct)-Math.abs(50-a.tabCons.bullPct))[0];

  const sectors = ['all',...[...new Set(recos.map(r=>r.sector).filter(Boolean))]];
  const selData  = selectedTicker ? tickerMap[selectedTicker] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <div className="page-title">Market Intelligence</div>
          <div className="page-sub">Track market sentiment and investor conviction across stocks and sectors</div>
        </div>
        {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
      </div>

      {/* Discovery cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:20}}>
        {[
          {label:'Strongest Consensus',   icon:<Target size={16}/>,      item:strongest},
          {label:'Biggest Conviction Increase', icon:<Zap size={16}/>,  item:emerging},
          {label:'Most Discussed',        icon:<MessageSquare size={16}/>,item:mostDiscussed},
          {label:'Most Divided',          icon:<Activity size={16}/>,    item:mostDivided},
        ].map(({label,icon,item},i)=>item?(
          <div key={i} className="card" style={{padding:'14px 16px',cursor:'pointer',minWidth:0}} onClick={()=>setSelectedTicker(item.ticker)}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
              <span style={{color:'var(--accent-ink)',opacity:.7}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)'}}>{label}</span>
            </div>
            <div style={{fontWeight:900,fontSize:18,marginBottom:3}}>{item.ticker}</div>
            <div style={{fontSize:12,color:item.tabCons.bullPct>=55?'var(--gain)':item.tabCons.bearPct>=55?'var(--loss)':'var(--muted)',fontWeight:700,marginBottom:6}}>
              {item.tabCons.bullPct>=55?'+':''}{item.tabCons.bullPct}% {item.tabCons.label}
            </div>
            <SparkLine
              data={computeTrend(item.filteredRecos)}
              color={item.tabCons.bullPct>=55?'var(--gain)':item.tabCons.bearPct>=55?'var(--loss)':'#8d90ad'}
              height={36}
            />
            <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>{item.filteredRecos.length} investor{item.filteredRecos.length!==1?'s':''}</div>
          </div>
        ):null)}
      </div>

      {/* Filters + tabs */}
      <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
        <div className="seg">
          {[['all','All Stocks'],['circle','My Circle'],['community','Community']].map(([v,l])=>(
            <button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>
        <select className="rte-select" value={sector} onChange={e=>setSector(e.target.value)} style={{height:32}}>
          {sectors.map(s=><option key={s} value={s}>{s==='all'?'All Sectors':s}</option>)}
        </select>
        <div style={{position:'relative',flex:1,maxWidth:220}}>
          <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search stocks…"
            style={{width:'100%',paddingLeft:30,height:32,border:'1px solid var(--line-2)',borderRadius:8,fontSize:13,outline:'none',background:'var(--surface)',color:'var(--ink)'}}/>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:selData&&!isMobile?'1fr 340px':'1fr',gap:16,alignItems:'start'}}>
        <div className="card">
          {isMobile ? (
            /* ── Mobile: asset card list ── */
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {allTickers.slice(0,30).map(t=>(
                <div key={t.ticker} onClick={()=>setSelectedTicker(prev=>prev===t.ticker?null:t.ticker)}
                  style={{padding:'13px 16px',borderBottom:'1px solid var(--line)',cursor:'pointer',background:selectedTicker===t.ticker?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:800,fontSize:14}}>{t.ticker}</div>
                      <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</div>
                      {t.sector&&<div style={{fontSize:10,color:'var(--muted)'}}>{t.sector}</div>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0,marginLeft:10}}>
                      <span style={{fontSize:12,color:t.community.bullPct>=55?'var(--gain)':t.community.bearPct>=55?'var(--loss)':'var(--muted)',fontWeight:700}}>
                        {t.community.bullPct>=55?'↑ Bullish':t.community.bearPct>=55?'↓ Bearish':'→ Neutral'}
                      </span>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}</div>
                    </div>
                  </div>
                  {t.community.total>0&&(
                    <div style={{marginBottom:4}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>Community</div>
                      <ConsensusBar cons={t.community} width={'100%'} mini/>
                    </div>
                  )}
                  {t.circle.total>0&&(
                    <div style={{marginBottom:4}}>
                      <div style={{fontSize:10,color:'var(--muted)',marginBottom:3}}>My circle</div>
                      <ConsensusBar cons={t.circle} width={'100%'} mini/>
                    </div>
                  )}
                  {t.community.total===0&&t.circle.total===0&&(<div style={{fontSize:11,color:'var(--muted)',fontStyle:'italic',marginBottom:4}}>No recommendations yet</div>)}
                  <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();onOpenSecurity(t.ticker,t.name);}}>
                      <ChevronRight size={13}/> Security Intel
                    </button>
                  </div>
                </div>
              ))}
              {allTickers.length===0&&(<div style={{padding:'32px 16px',textAlign:'center',color:'var(--muted)',fontSize:13}}>No stocks match current filters.</div>)}
            </div>
          ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--line)'}}>
                  {['Stock','My Circle Consensus','Community Consensus','Trend (7d)','Investors','Avg Credibility','Action'].map((h,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTickers.slice(0,30).map(t=>{
                  const sel      = t.ticker===selectedTicker;
                  const expanded = t.ticker===expandedTicker;
                  const avgIci   = null; // ici_score not a confirmed DB column — show '—'
                  const toggleExpand = e => { e.stopPropagation(); setExpandedTicker(expanded?null:t.ticker); };
                  return (
                    <React.Fragment key={t.ticker}>
                      <tr onClick={()=>setSelectedTicker(sel?null:t.ticker)}
                        style={{borderBottom:expanded?'none':'1px solid var(--line)',cursor:'pointer',background:sel?'var(--accent-soft)':'transparent',transition:'background .12s'}}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div className="av" style={{width:32,height:32,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{t.ticker.slice(0,2)}</div>
                            <div>
                              <div style={{fontWeight:800,fontSize:14}}>{t.ticker}</div>
                              <div style={{fontSize:11,color:'var(--muted)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</div>
                              {t.sector&&<div style={{fontSize:10,color:'var(--muted)'}}>{t.sector}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',minWidth:130}}><ConsensusBar cons={t.circle} width={110}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center',minWidth:130}}><ConsensusBar cons={t.community} width={110}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:12,color:t.community.bullPct>=55?'var(--gain)':t.community.bearPct>=55?'var(--loss)':'var(--muted)',fontWeight:700}}>
                            {t.community.bullPct>=55?'↑':t.community.bearPct>=55?'↓':'→'}
                            {' '}{t.community.bullPct>=55?'Bullish':t.community.bearPct>=55?'Bearish':'Neutral'}
                          </span>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:16}}>{t.filteredRecos.length}</div>
                          <div style={{fontSize:10,color:'var(--muted)'}}>investors</div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{fontWeight:700,fontSize:16,color:'var(--accent-ink)'}}>{avgIci||'—'}</div>
                          <div style={{fontSize:10,color:'var(--muted)'}}>ICI avg</div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                            <button className="iconbtn" title={expanded?'Collapse':'Who recommended'} onClick={toggleExpand}
                              style={{color:expanded?'var(--accent-ink)':'var(--muted)'}}>
                              <ChevronDown size={15} style={{transform:expanded?'rotate(180deg)':'none',transition:'transform .2s'}}/>
                            </button>
                            <button className="iconbtn" title="Security Intelligence" onClick={e=>{e.stopPropagation();onOpenSecurity(t.ticker,t.name);}}><ChevronRight size={16}/></button>
                          </div>
                        </td>
                      </tr>
                      {expanded&&(
                        <tr style={{borderBottom:'1px solid var(--line)',background:'var(--surface-2)'}}>
                          <td colSpan={7} style={{padding:'0 14px 14px 60px'}}>
                            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',margin:'10px 0 8px'}}>
                              Who recommended — {t.filteredRecos.length} investor{t.filteredRecos.length!==1?'s':''}
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                              {t.filteredRecos.map((r,i)=>{
                                const inCircle = circleIds.includes(r.from);
                                const isBuy    = r.recommendation_type==='Buy';
                                return (
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',
                                    background:'var(--surface)',borderRadius:8,border:'1px solid var(--line-2)',fontSize:12}}>
                                    <div className="av" style={{width:22,height:22,fontSize:9,flexShrink:0,background:'var(--grad)'}}>
                                      {initialsOf(r.full_name||r.username||'?')}
                                    </div>
                                    <span style={{fontWeight:600,maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                      {r.full_name||r.username||'Investor'}
                                    </span>
                                    {inCircle&&<span style={{fontSize:9,background:'var(--accent-soft)',color:'var(--accent-ink)',borderRadius:3,padding:'1px 4px',fontWeight:700}}>Circle</span>}
                                    <span style={{fontSize:10,fontWeight:800,padding:'2px 6px',borderRadius:4,
                                      background:isBuy?'var(--gain-soft)':'var(--loss-soft)',color:isBuy?'var(--gain)':'var(--loss)'}}>
                                      {isBuy?'BUY':'SELL'}
                                    </span>
                                    {r.conviction&&<span style={{fontSize:10,color:'var(--muted)'}}>{r.conviction}</span>}
                                    <span style={{fontSize:10,color:'var(--muted)'}}>
                                      {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):''}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {allTickers.length===0&&!loading&&<tr><td colSpan={7} style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>{recos.length===0?'No recommendations on the platform yet.':'No results match your filters.'}</td></tr>}
              </tbody>
            </table>
          </div>
          ) /* end isMobile ternary */}
        </div>

        {selData&&(
          isMobile
            ? <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onClose={()=>setSelectedTicker(null)} modal/>
            : <SecurityQuickPanel ticker={selData.ticker} name={selData.name} allRecos={selData.recos} circleRecos={selData.recos.filter(r=>circleIds.includes(r.from))} onOpenFull={()=>onOpenSecurity(selData.ticker,selData.name)} onClose={()=>setSelectedTicker(null)}/>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECURITY INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════ */
function SecurityIntelligencePage({ securityTicker, contacts, me, onOpenSecurity }) {
  const isMobile = useIsMobile();
  const { ticker, name } = securityTicker || {};
  const [recos, setRecos]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('consensus'); // consensus | timeline | investors | stats | ai
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [investorIcis, setInvestorIcis] = useState({}); // uid → {score,band}

  const circleIds = useMemo(()=>contacts.map(c=>c.id),[contacts]);

  // Fetch real ICI scores for all investors when recos loads
  useEffect(()=>{
    if (!recos.length || !sql) return;
    const uids = [...new Set(recos.map(r=>r.from).filter(Boolean))];
    if (!uids.length) return;
    sql`
      SELECT
        r.recommender_id                                               AS uid,
        COUNT(*)::int                                                  AS total,
        EXTRACT(EPOCH FROM (NOW()-MIN(r.created_at)))/(365.25*86400)   AS years_history,
        COUNT(*) FILTER (WHERE r.exit_signal=true)::int                AS closed,
        COUNT(*) FILTER (
          WHERE r.exit_signal=true AND r.current_price > r.reco_price
            AND r.reco_price > 0
        )::int                                                         AS wins,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
          CASE WHEN r.exit_signal=true AND r.reco_price > 0
               THEN (r.current_price - r.reco_price) / r.reco_price * 100
          END
        ), 0)                                                          AS median_ret,
        COALESCE(STDDEV(
          CASE WHEN r.exit_signal=true AND r.reco_price > 0
               THEN (r.current_price - r.reco_price) / r.reco_price * 100
          END
        ), 0)                                                          AS ret_stddev
      FROM ic_recommendations r
      WHERE r.recommender_id = ANY(${uids})
      GROUP BY r.recommender_id`
      .then(rows=>{
        const scores = {};
        rows.forEach(row=>{
          const hitPct  = row.closed > 0 ? (row.wins / row.closed * 100) : 0;
          const riskAdj = Number(row.ret_stddev) > 0 ? Math.max(Number(row.median_ret) / Number(row.ret_stddev), 0) : 0;
          scores[row.uid] = computeIci({
            years_history:        Number(row.years_history) || 0,
            total:                row.total,
            hit_rate_pct:         hitPct,
            median_return:        Number(row.median_ret)  || 0,
            risk_adjusted_return: riskAdj,
            deleted_count:        0,
          });
        });
        setInvestorIcis(scores);
      })
      .catch(()=>{});
  },[recos]);

  useEffect(()=>{
    if (!ticker||!sql) return;
    setLoading(true); setRecos([]);
    sql`SELECT r.id, r.ticker, r.asset_name, r.recommendation_type,
               r.recommender_id as "from", r.conviction, r.created_at,
               r.thesis, r.reco_price, r.current_price, r.sector, r.exchange,
               up.username, up.full_name, up.registration_status
        FROM ic_recommendations r
        LEFT JOIN user_profiles up ON r.recommender_id = up.id
        WHERE r.ticker = ${ticker}
          AND (up.is_unclaimed IS NULL OR up.is_unclaimed = FALSE)
        ORDER BY r.created_at DESC`
      .then(rows=>{ setRecos(rows); setLoading(false); })
      .catch(()=>setLoading(false));
  },[ticker]);


  // stats useMemo hoisted above early return to comply with React Rules of Hooks.
  // (hooks must be called in the same order on every render; early returns violate this)
  const stats = useMemo(()=>{
    if (!recos.length) return null;
    const byMonth = {};
    // Neon returns timestamp columns as Date objects — must stringify before .slice()
    const toIso = v => v instanceof Date ? v.toISOString() : String(v||'');
    recos.forEach(r=>{
      const mo = toIso(r.created_at).slice(0,7);
      if (!mo) return;
      if (!byMonth[mo]) byMonth[mo]={mo,buy:0,sell:0};
      if (r.recommendation_type==='Buy') byMonth[mo].buy++; else byMonth[mo].sell++;
    });
    const months = Object.values(byMonth).sort((a,b)=>a.mo.localeCompare(b.mo));
    const convMap = {};
    recos.forEach(r=>{ if(r.conviction) convMap[r.conviction]=(convMap[r.conviction]||0)+1; });
    const firstDate = recos[recos.length-1]?.created_at;
    const activeR  = recos;
    const exitedR  = [];  // status column not in schema
    return { months, convMap, firstDate, total:recos.length, active:activeR.length, exited:exitedR.length };
  },[recos]);

  if (!ticker) return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <div className="page-title">Security Intelligence</div>
        </div>
      </div>

      {/* ── Discovery landing ── */}
      <div style={{maxWidth:540,margin:'0 auto',padding:'40px 16px 0'}}>
        {/* Search box — large and prominent */}
        <div style={{background:'var(--surface)',border:'2px solid var(--accent)',borderRadius:16,padding:'4px 8px 4px 16px',display:'flex',alignItems:'center',gap:10,marginBottom:24,boxShadow:'0 4px 24px rgba(109,93,245,.12)'}}>
          <Search size={20} color="var(--accent)" style={{flexShrink:0}}/>
          <div style={{flex:1}}>
            <InstrumentSearch
              onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
              placeholder="Search any stock or ETF — e.g. RELIANCE, HDFC Bank…"
            />
          </div>
        </div>

        {/* Instructional copy */}
        <div style={{textAlign:'center',padding:'0 8px'}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:10,color:'var(--ink)'}}>Discover any security's community intelligence</div>
          <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.7}}>
            Type any stock name or ticker above to instantly explore community consensus,
            investor conviction trends, and who on myInvestorCircle is tracking it —
            and whether they're bullish or bearish.
          </div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:16,padding:'10px 14px',background:'var(--surface-2)',borderRadius:10,lineHeight:1.6}}>
            💡 You can also arrive here by clicking the <strong>ChevronRight →</strong> or
            <strong> Full Page</strong> button on any security in
            <strong> Portfolio Intelligence</strong> or <strong>Market Intelligence</strong>.
            Once a security is open, use the search bar above to switch to any other asset.
          </div>
        </div>
      </div>
    </>
  );

  // No status filter - column not confirmed in schema; show all recommendations
  const activeRecos  = recos;  // all fetched recos are current (no status column)
  const circleRecos  = recos.filter(r=>circleIds.includes(r.from));
  const community    = computeConsensus(activeRecos);
  const circle       = computeConsensus(circleRecos);

  // Stats computation
  // AI summary — deterministic analysis from recommendation data
  const buildAiSummary = () => {
    if (aiSummary || aiLoading || !recos.length) return;
    setAiLoading(true);
    const activeR = recos;
    const bullR   = activeR.filter(r=>r.recommendation_type==='Buy');
    const bearR   = activeR.filter(r=>r.recommendation_type==='Sell');
    const theses  = activeR.filter(r=>r.thesis).map(r=>r.thesis);
    // Simulate a brief async "analysis" then show structured summary
    setTimeout(()=>{
      const bullThemes = bullR.slice(0,3).map(r=>r.thesis||null).filter(Boolean);
      const bearThemes = bearR.slice(0,3).map(r=>r.thesis||null).filter(Boolean);
      const community  = computeConsensus(activeR);
      const sentiment  = community.bullPct>=70?'strongly bullish':community.bullPct>=55?'moderately bullish':community.bearPct>=70?'strongly bearish':community.bearPct>=55?'cautious':'divided';
      setAiSummary({
        sentiment, community,
        bullThemes: bullThemes.length ? bullThemes : (bullR.length ? [`${bullR.length} investor${bullR.length>1?'s':''} tracking as a Buy opportunity`] : []),
        bearThemes: bearThemes.length ? bearThemes : (bearR.length ? [`${bearR.length} investor${bearR.length>1?'s':''} flagging caution`] : ['No bearish recommendations on record']),
        highConv:  activeR.filter(r=>r.conviction==='High Conviction'||r.conviction==='Very High').length,
        uniqueInv: new Set(activeR.map(r=>r.from)).size,
      });
      setAiLoading(false);
    }, 800);
  };
  const investorMap = {};  // keyed by recommender uid — populated below
  recos.forEach(r=>{
    if (!investorMap[r.from]) investorMap[r.from] = {...r};
  });
  const investors = Object.values(investorMap);
  const inCircle  = investors.filter(r=>circleIds.includes(r.from));
  const notCircle = investors.filter(r=>!circleIds.includes(r.from));

  return (
    <>
      <div className="page-head" style={{alignItems:'flex-start'}}>
        <div style={{flex:1}}>
          <div className="eyebrow">Security Intelligence</div>
          <div style={{display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
            <div className="page-title">{ticker}</div>
            <div style={{fontSize:16,color:'var(--muted)',fontWeight:400}}>{name}</div>
          </div>
          <div className="page-sub">{activeRecos.length} active recommendation{activeRecos.length!==1?'s':''} · {investors.length} investor{investors.length!==1?'s':''} tracking</div>
        </div>
        {loading&&<Loader size={16} className="spin" style={{color:'var(--muted)'}}/>}
      </div>

      {/* ── Switch-security search — compact bar for navigating to another asset ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:10,
        background:'var(--surface-2)', border:'1px solid var(--line)',
        borderRadius:12, padding:'4px 8px 4px 12px', marginBottom:20,
        maxWidth: isMobile ? '100%' : 420,
      }}>
        <Search size={14} color="var(--muted)" style={{flexShrink:0}}/>
        <div style={{flex:1,fontSize:13}}>
          <InstrumentSearch
            onSelect={inst=>{ if(inst&&onOpenSecurity) onOpenSecurity(inst.symbol,inst.name); }}
            placeholder={`Switch security — type any stock or ETF…`}
          />
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12,marginBottom:20}}>
        {[['Community Consensus',community,'All Investors on MIC'],['My Circle Consensus',circle,`${circleIds.length} connections`]].map(([label,cons,sub])=>(
          <div key={label} className="card" style={{padding:'20px 22px'}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:12}}>{label}</div>
            {cons.total>0?(
              <>
                <div style={{fontSize:32,fontWeight:900,color:cons.bullPct>=55?'var(--gain)':cons.bearPct>=55?'var(--loss)':'var(--muted)',marginBottom:4}}>{cons.bullPct}%<span style={{fontSize:16,fontWeight:400,color:'var(--muted)'}}> Bullish</span></div>
                <ConsensusBar cons={cons} width={'100%'}/>
                <div style={{fontSize:12,color:'var(--muted)',marginTop:8}}>{sub}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:12}}>
                  {[['Buy',cons.bull,'var(--gain)'],['Neutral',cons.neutral,'var(--muted)'],['Sell',cons.bear,'var(--loss)']].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:'center',padding:'8px',background:'var(--surface-2)',borderRadius:8}}>
                      <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:'var(--muted)',fontWeight:700}}>{l}</div>
                    </div>
                  ))}
                </div>
              </>
            ):<div style={{fontSize:13,color:'var(--muted)',paddingTop:8}}>{sub==='All Investors on MIC'?'No recommendations on platform yet':'None of your connections have recommended this'}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      {/* ── Tabs — prominent pill bar with icons ── */}
      <div style={{display:'flex',gap:6,marginBottom:20,overflowX:'auto',padding:'2px 0',WebkitOverflowScrolling:'touch'}}>
        {[
          ['consensus', 'Consensus',    <Activity size={14}/> ],
          ['timeline',  'Rec. History', <Clock size={14}/>    ],
          ['investors', 'Investors',    <Users size={14}/>    ],
          ['stats',     'Statistics',   <BarChart2 size={14}/>],
          ['ai',        'AI Summary',   <Sparkles size={14}/>],
        ].map(([v,l,icon])=>(
          <button key={v}
            onClick={()=>{ setTab(v); if(v==='ai') buildAiSummary(); }}
            style={{
              display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
              padding:'8px 14px', borderRadius:10, border:'none', cursor:'pointer',
              fontSize:13, fontWeight:tab===v?700:500,
              background: tab===v ? 'var(--accent)' : 'var(--surface-2)',
              color:       tab===v ? '#fff'          : 'var(--muted)',
              boxShadow:   tab===v ? '0 2px 8px rgba(109,93,245,.3)' : 'none',
              transition:'background .15s,color .15s,box-shadow .15s',
              flexShrink: 0,
            }}
          >{icon}{l}</button>
        ))}
      </div>

      {/* Tab: Consensus */}
      {tab==='consensus'&&(
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16}}>
          {/* Strength gauge */}
          <div className="card">
            <div className="card-head"><Target size={15}/> Consensus Strength</div>
            <div className="card-body" style={{textAlign:'center',padding:'24px'}}>
              <div style={{fontSize:64,fontWeight:900,color:community.strength>=65?'var(--gain)':community.strength>=40?'#fbbf24':'var(--muted)',lineHeight:1,marginBottom:8}}>
                {community.strength}
              </div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--ink)',marginBottom:4}}>{community.label}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:20}}>out of 100 — based on {community.total} active recommendations</div>
              <div style={{height:8,borderRadius:6,overflow:'hidden',background:'var(--line)',position:'relative'}}>
                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${community.strength}%`,
                  background:`linear-gradient(90deg,var(--gain),${community.strength>=65?'var(--gain)':'#fbbf24'})`,transition:'width .6s'}}/>
              </div>
            </div>
          </div>
          {/* Circle vs Community */}
          <div className="card">
            <div className="card-head"><Globe size={15}/> Circle vs Community</div>
            <div className="card-body" style={{display:'flex',flexDirection:'column',gap:16,padding:'16px 18px'}}>
              {[['My Circle',circle],['Community',community]].map(([l,c])=>(
                <div key={l}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:13,fontWeight:600}}>{l}</span>
                    <span style={{fontSize:13,fontWeight:700,color:c.bullPct>=55?'var(--gain)':c.bearPct>=55?'var(--loss)':'var(--muted)'}}>{c.label}</span>
                  </div>
                  <ConsensusBar cons={c} width={'100%'}/>
                  <div style={{fontSize:12,color:'var(--muted)',marginTop:6}}>{c.total} investor{c.total!==1?'s':''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Recommendation History */}
      {tab==='timeline'&&(
        <div className="card">
          <div className="card-head"><Clock size={15}/> Recommendation History <span style={{fontSize:11,color:'var(--muted)',fontWeight:400,marginLeft:4}}>(immutable — all calls are permanent)</span></div>
          {recos.length===0&&!loading?(
            <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>No recommendations for {ticker} yet.</div>
          ):(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--line)'}}>
                    {['Investor','Type','Date','Entry Price','Conviction','Status'].map((h,i)=>(
                      <th key={i} style={{padding:'10px 14px',textAlign:i===0?'left':'center',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--muted)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recos.map(r=>{
                    const inMyCircle = circleIds.includes(r.from);
                    return (
                      <tr key={r.id} style={{borderBottom:'1px solid var(--line)'}}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(r.full_name||r.username||'?')}</div>
                            <div>
                              <div style={{fontWeight:700,fontSize:13}}>{r.full_name||r.username||'Anonymous'}</div>
                              {inMyCircle&&<span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:4,background:'var(--accent-soft)',color:'var(--accent-ink)',textTransform:'uppercase',letterSpacing:'.05em'}}>My Circle</span>}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:5,
                            background:r.recommendation_type==='Buy'?'var(--gain-soft)':'var(--loss-soft)',
                            color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>
                            {r.recommendation_type==='Buy'?'BUY':'SELL'}
                          </span>
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',fontSize:13,color:'var(--muted)'}}>
                          {r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center',fontSize:13,fontWeight:600}}>
                          {r.reco_price?`₹${Number(r.reco_price).toLocaleString('en-IN')}`:'—'}
                        </td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}><ConvBadge level={r.conviction}/></td>
                        <td style={{padding:'12px 14px',textAlign:'center'}}>
                          <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,
                            background:'var(--gain-soft)',color:'var(--gain)'}}>
                            Active
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Investors */}
      {tab==='investors'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[['In My Circle', inCircle, true], ['Community', notCircle, false]].map(([label, list, isCircle])=>(
            list.length > 0 && (
              <div key={label} className="card">
                <div className="card-head">
                  {isCircle ? <Users size={15}/> : <Globe size={15}/>} {label} ({list.length})
                </div>
                <div className="card-body" style={{display:'flex',flexDirection:'column',gap:0,padding:0}}>
                  {list.map((r,i)=>{
                    const ici = investorIcis[r.from];
                    const iciScore = ici?.score;
                    const iciBand  = ici?.band;
                    const bandColor = iciBand==='Strong'?'var(--gain)':iciBand==='Good'?'var(--accent)':iciBand==='Building'?'#f59e0b':'var(--muted)';
                    const profileUrl = r.username ? `/#/investor/${r.username}` : null;
                    return (
                      <div key={r.from} style={{
                        display:'flex', alignItems:'center', gap:12, padding:'12px 18px',
                        borderBottom: i < list.length-1 ? '1px solid var(--line)' : 'none',
                      }}>
                        {/* Avatar */}
                        <div className="av" style={{width:40,height:40,fontSize:14,flexShrink:0,background:'var(--grad)',cursor:profileUrl?'pointer':'default'}}
                          onClick={()=>profileUrl&&(window.location.hash=profileUrl)}>
                          {initialsOf(r.full_name||r.username||'?')}
                        </div>

                        {/* Name + handle */}
                        <div style={{flex:1,minWidth:0}}>
                          <div
                            style={{fontWeight:700,fontSize:14,cursor:profileUrl?'pointer':'default',
                              color:profileUrl?'var(--accent-ink)':'var(--ink)',
                              textDecoration:profileUrl?'underline':'none',textDecorationColor:'rgba(109,93,245,.3)'}}
                            onClick={()=>profileUrl&&(window.location.hash=profileUrl)}
                            title={profileUrl?`View ${r.full_name||r.username}'s profile`:undefined}
                          >
                            {r.full_name||r.username||'Anonymous'}
                          </div>
                          {r.username&&<div style={{fontSize:11,color:'var(--muted)'}}>@{r.username}</div>}
                        </div>

                        {/* ICI Score */}
                        <div style={{textAlign:'center',flexShrink:0,minWidth:44}}>
                          {iciScore !== undefined ? (
                            <>
                              <div style={{fontSize:18,fontWeight:900,color:bandColor,lineHeight:1}}>{iciScore}</div>
                              <div style={{fontSize:9,color:bandColor,fontWeight:700,marginTop:2}}>{iciBand}</div>
                            </>
                          ) : (
                            <>
                              <div style={{fontSize:18,fontWeight:900,color:'var(--muted)',lineHeight:1}}>—</div>
                              <div style={{fontSize:9,color:'var(--muted)',marginTop:2}}>ICI</div>
                            </>
                          )}
                        </div>

                        {/* Conviction + direction */}
                        <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                          <ConvBadge level={r.conviction}/>
                          <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:5,whiteSpace:'nowrap',
                            background:r.recommendation_type==='Buy'?'var(--gain-soft)':'var(--loss-soft)',
                            color:r.recommendation_type==='Buy'?'var(--gain)':'var(--loss)'}}>
                            {r.recommendation_type==='Buy'?'BUY':'SELL'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ))}
          {investors.length===0&&!loading&&(
            <div className="card"><div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:14}}>
              No investor recommendations for {ticker} yet.
            </div></div>
          )}
        </div>
      )}

      {/* ── Statistics Tab ─────────────────────────────────────────── */}
      {tab==='stats'&&(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {!stats?(
            <div className="card"><div style={{padding:'32px',textAlign:'center',color:'var(--muted)'}}>No recommendation history for {ticker} yet.</div></div>
          ):(
            <>
              {/* Overview stat cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}}>
                {[
                  {label:'Total Recommendations', val:stats.total, icon:<Activity size={16}/>},
                  {label:'Currently Active',       val:stats.active, icon:<TrendingUp size={16}/>, color:'var(--gain)'},
                  {label:'Exited / Closed',        val:stats.exited, icon:<TrendingDown size={16}/>, color:'var(--muted)'},
                  {label:'Unique Investors',        val:new Set(recos.map(r=>r.from)).size, icon:<Users size={16}/>},
                ].map((s,i)=>(
                  <div key={i} className="card" style={{padding:'16px 18px'}}>
                    <div style={{color:s.color||'var(--accent-ink)',opacity:.7,marginBottom:8}}>{s.icon}</div>
                    <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:24,fontWeight:900,color:s.color||'var(--ink)'}}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Monthly recommendation trend — SVG sparkline */}
              {stats.months.length>0&&(
                <div className="card">
                  <div className="card-head"><Target size={15}/> Recommendation Activity by Month</div>
                  <div className="card-body" style={{padding:'16px 20px'}}>
                    {(()=>{
                      const maxVal = Math.max(...stats.months.map(m=>m.buy+m.sell), 1);
                      const W = 560, H = 90, pad = 32, barW = Math.min(28, (W-2*pad)/Math.max(stats.months.length,1)-4);
                      const xStep = (W-2*pad) / Math.max(stats.months.length, 1);
                      return (
                        <svg viewBox={`0 0 ${W} ${H+40}`} style={{width:'100%',maxWidth:W,display:'block'}}>
                          {stats.months.map((m,i)=>{
                            const x  = pad + i*xStep;
                            const bH = (m.buy/maxVal)*(H-10);
                            const sH = (m.sell/maxVal)*(H-10);
                            return (
                              <g key={m.mo}>
                                <rect x={x} y={H-bH} width={barW} height={bH} rx={3} fill="var(--gain)" opacity={.8}/>
                                <rect x={x} y={H-bH-sH} width={barW} height={sH} rx={3} fill="var(--loss)" opacity={.8}/>
                                <text x={x+barW/2} y={H+14} textAnchor="middle" fontSize={8} fill="var(--muted)">
                                  {m.mo.slice(5)}
                                </text>
                                {(m.buy+m.sell)>0&&<text x={x+barW/2} y={H-bH-sH-4} textAnchor="middle" fontSize={9} fill="var(--ink)" fontWeight={700}>{m.buy+m.sell}</text>}
                              </g>
                            );
                          })}
                          {/* Legend */}
                          <rect x={W-90} y={2} width={10} height={10} rx={2} fill="var(--gain)" opacity={.8}/>
                          <text x={W-76} y={11} fontSize={9} fill="var(--muted)">Buy</text>
                          <rect x={W-50} y={2} width={10} height={10} rx={2} fill="var(--loss)" opacity={.8}/>
                          <text x={W-36} y={11} fontSize={9} fill="var(--muted)">Sell</text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Conviction breakdown */}
              {Object.keys(stats.convMap).length>0&&(
                <div className="card">
                  <div className="card-head"><Zap size={15}/> Conviction Breakdown</div>
                  <div className="card-body" style={{display:'flex',flexWrap:'wrap',gap:10,padding:'12px 16px'}}>
                    {Object.entries(stats.convMap).sort((a,b)=>b[1]-a[1]).map(([label,count])=>(
                      <div key={label} style={{display:'flex',flexDirection:'column',alignItems:'center',
                        padding:'10px 16px',background:'var(--surface-2)',borderRadius:10,minWidth:80}}>
                        <div style={{fontSize:22,fontWeight:900,color:'var(--accent-ink)'}}>{count}</div>
                        <div style={{fontSize:11,color:'var(--muted)',marginTop:3,textAlign:'center'}}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── AI Summary Tab ─────────────────────────────────────────── */}
      {tab==='ai'&&(
        <div>
          {aiLoading&&(
            <div className="card" style={{padding:'48px',textAlign:'center'}}>
              <Loader size={28} className="spin" style={{color:'var(--accent-ink)',marginBottom:12}}/>
              <div style={{fontWeight:700,marginBottom:4}}>Analysing recommendations…</div>
              <div style={{fontSize:13,color:'var(--muted)'}}>Reading {recos.length} recommendations for {ticker}</div>
            </div>
          )}
          {!aiLoading&&!aiSummary&&(
            <div className="card" style={{padding:'48px',textAlign:'center'}}>
              <Lightbulb size={32} style={{color:'var(--accent-ink)',marginBottom:12,opacity:.6}}/>
              <div style={{fontWeight:700,marginBottom:8}}>AI Investment Summary</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>
                Synthesise bullish and bearish themes from {activeRecos.length} active recommendation{activeRecos.length!==1?'s':''} on {ticker}
              </div>
              <button className="btn btn-pri" onClick={buildAiSummary} disabled={!activeRecos.length}>
                <Lightbulb size={14}/> Generate Summary
              </button>
            </div>
          )}
          {!aiLoading&&aiSummary&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Sentiment header */}
              <div className="card" style={{padding:'20px 24px'}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                  <Lightbulb size={20} style={{color:'var(--accent-ink)'}}/>
                  <div>
                    <div style={{fontWeight:900,fontSize:16}}>AI Insight Summary</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>Based on {aiSummary.uniqueInv} investor{aiSummary.uniqueInv!==1?'s':''} · {aiSummary.highConv} high conviction call{aiSummary.highConv!==1?'s':''}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>{setAiSummary(null);buildAiSummary();}}>
                    <RefreshCw size={12}/> Refresh
                  </button>
                </div>
                <div style={{padding:'12px 16px',background: aiSummary.community.bullPct>=55?'var(--gain-soft)':aiSummary.community.bearPct>=55?'var(--loss-soft)':'var(--surface-2)',
                  borderRadius:10,borderLeft:`3px solid ${aiSummary.community.bullPct>=55?'var(--gain)':aiSummary.community.bearPct>=55?'var(--loss)':'var(--muted)'}`}}>
                  <div style={{fontWeight:700,fontSize:15,textTransform:'capitalize',marginBottom:4}}>
                    {aiSummary.sentiment}
                  </div>
                  <div style={{fontSize:13,color:'var(--ink-soft)'}}>
                    {aiSummary.community.bullPct}% of investors bullish · {aiSummary.community.bearPct}% bearish · {aiSummary.community.total} total active recommendations
                  </div>
                </div>
              </div>

              {/* Bullish themes */}
              {aiSummary.bullThemes.length>0&&(
                <div className="card">
                  <div className="card-head" style={{color:'var(--gain)'}}><TrendingUp size={15}/> Bullish Themes</div>
                  <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10,padding:'12px 16px'}}>
                    {aiSummary.bullThemes.map((t,i)=>(
                      <div key={i} style={{display:'flex',gap:10,padding:'10px 12px',background:'var(--gain-soft)',borderRadius:8}}>
                        <div style={{color:'var(--gain)',marginTop:1,flexShrink:0}}>↑</div>
                        <div style={{fontSize:13,lineHeight:1.5}}>{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bearish / risk themes */}
              <div className="card">
                <div className="card-head" style={{color:'var(--loss)'}}><TrendingDown size={15}/> Risks &amp; Bearish Views</div>
                <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10,padding:'12px 16px'}}>
                  {aiSummary.bearThemes.map((t,i)=>(
                    <div key={i} style={{display:'flex',gap:10,padding:'10px 12px',background:'var(--loss-soft)',borderRadius:8}}>
                      <div style={{color:'var(--loss)',marginTop:1,flexShrink:0}}>↓</div>
                      <div style={{fontSize:13,lineHeight:1.5}}>{t}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{fontSize:11,color:'var(--muted)',textAlign:'center',padding:'4px 0'}}>
                Summary is generated from investor recommendations on myInvestorCircle and reflects community opinion, not financial advice.
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
