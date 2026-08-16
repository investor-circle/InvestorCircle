export const STYLES = `
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
.brand .nm{font-weight:800;font-size:18px;letter-spacing:-.4px;line-height:1.1;}
.brand .tag{font-size:10px;letter-spacing:1.4px;color:var(--side-dim);text-transform:uppercase;margin-top:2px;}
.viewing{background:var(--grad);border-radius:15px;padding:13px 14px;display:flex;align-items:center;gap:11px;cursor:pointer;box-shadow:0 8px 22px rgba(124,92,252,.4);margin-bottom:18px;transition:.15s;}
.viewing:hover{filter:brightness(1.06);}
.viewing .ava{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;}
.viewing .vs{font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:rgba(255,255,255,.78);}
.viewing .role{font-size:16px;font-weight:700;line-height:1.1;}
.side-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--side-dim);padding:4px 12px 8px;}
.side-section{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--side-dim);padding:12px 10px 5px;opacity:.75;}
.nav-item{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:11px;cursor:pointer;margin-bottom:2px;border:1px solid transparent;transition:.12s;color:var(--side-text);}
.nav-item .nav-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:.12s;}
.nav-item .nav-txt{display:flex;flex-direction:column;min-width:0;flex:1;}
.nav-item .nav-lbl{font-size:13.5px;font-weight:600;line-height:1.2;}
.nav-item .nav-sub{font-size:10.5px;color:var(--side-dim);font-weight:400;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nav-item svg{color:var(--side-dim);}
.nav-item:hover{background:rgba(255,255,255,.045);color:#fff;}
.nav-item:hover .nav-icon{filter:brightness(1.18);}
.nav-item:hover svg{color:#cfd2ee;}
.nav-item.active{background:rgba(124,92,252,.16);border-color:rgba(124,92,252,.35);color:#fff;box-shadow:0 4px 14px rgba(124,92,252,.1);}
.nav-item.active svg{color:#b6a9ff;}
.nav-item.active .nav-sub{color:rgba(255,255,255,.5);}
.nav-badge{margin-left:auto;background:var(--grad);color:#fff;font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px;flex-shrink:0;}
.side-foot{padding-top:12px;border-top:1px solid var(--side-line);}
.side-stat{display:flex;justify-content:space-between;padding:7px 12px;font-size:13px;color:var(--side-dim);}
.side-stat b{color:#fff;font-weight:700;}
.side-conn{padding:10px 0 0;border-top:1px solid var(--side-line);}
.side-conn-row{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:11px;cursor:pointer;transition:.12s;color:var(--side-text);}
.side-conn-row:hover{background:rgba(255,255,255,.045);color:#fff;}
.side-conn-badge{background:var(--grad);color:#fff;font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px;}

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
@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(16px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
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

/* ─── Home feed "brewing" loading state — shown only while the feed's first
   load is genuinely in flight, never once it's known to be empty ─── */
.feed-brewing{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:44px 28px 36px;text-align:center;}
.feed-brewing-art{position:relative;width:120px;height:88px;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;}
.feed-brewing-cup{overflow:visible;}
.feed-brewing-cupbody{fill:var(--ink);}
.feed-brewing-handle{stroke:var(--ink);stroke-width:6;fill:none;}
.feed-brewing-saucer{fill:var(--surface-2);}
.feed-brewing-liquid{fill:var(--accent);}
.feed-brewing-steam{stroke:var(--accent);stroke-width:3;opacity:0;}
.feed-brewing-badge{position:absolute;width:28px;height:28px;border-radius:50%;background:var(--accent-soft);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);}
.feed-brewing-badge-1{top:2px;left:2px;}
.feed-brewing-badge-2{top:6px;right:0;}
.feed-brewing-badge-3{bottom:2px;left:14px;}
.feed-brewing-title{font-family:var(--serif);font-size:20px;font-weight:600;color:var(--ink);letter-spacing:-.2px;margin:14px auto 8px;max-width:360px;}
.feed-brewing-sub{max-width:340px;margin:0 auto 20px;line-height:1.6;}
.feed-brewing-bar{width:180px;height:5px;border-radius:999px;background:var(--surface-2);margin:0 auto 10px;overflow:hidden;}
.feed-brewing-bar-fill{width:40%;height:100%;border-radius:999px;background:var(--grad);}
.feed-brewing-caption{letter-spacing:.2px;}
@media (prefers-reduced-motion: no-preference){
  .feed-brewing-steam{animation:feed-brewing-steam-rise 2.6s ease-in-out infinite;}
  .feed-brewing-steam-1{animation-delay:0s;}
  .feed-brewing-steam-2{animation-delay:.5s;}
  .feed-brewing-steam-3{animation-delay:1s;}
  .feed-brewing-badge{animation:feed-brewing-float 3.6s ease-in-out infinite;}
  .feed-brewing-badge-2{animation-delay:.5s;}
  .feed-brewing-badge-3{animation-delay:1.1s;}
  .feed-brewing-bar-fill{animation:feed-brewing-shimmer 1.6s ease-in-out infinite;}
}
@keyframes feed-brewing-steam-rise{
  0%{opacity:0;transform:translateY(4px) scaleY(.8);}
  30%{opacity:.5;}
  100%{opacity:0;transform:translateY(-14px) scaleY(1.05);}
}
@keyframes feed-brewing-float{
  0%,100%{transform:translateY(0);}
  50%{transform:translateY(-4px);}
}
@keyframes feed-brewing-shimmer{
  0%{transform:translateX(-100%);}
  100%{transform:translateX(340%);}
}

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

/* Discover-people top-nav icon — deliberately stands out (lavender, glowing ring) to draw the eye and invite a click */
.discover-icon-btn{background:linear-gradient(135deg,#6d5df5,#cf52d8);border:none;color:#fff;box-shadow:0 0 0 0 rgba(139,92,246,.55);animation:discover-glow 2.4s ease-in-out infinite;}
.discover-icon-btn:hover{background:linear-gradient(135deg,#7a6bff,#dd63e8);}
@keyframes discover-glow{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.5);}50%{box-shadow:0 0 0 7px rgba(139,92,246,0);}}

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
