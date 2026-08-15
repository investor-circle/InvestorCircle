import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Shield,
  Search,
  Bell,
  Settings,
  Lock,
  Eye,
  Plus,
  X,
  Check,
  Layers,
  Sparkles,
  UserPlus,
  Trash2,
  AlertTriangle,
  Download,
  Upload,
  Loader,
  RefreshCw,
  Pencil,
  Database,
  Globe,
  Copy,
  Link,
  Flame,
  Info,
  Target
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "../../AuthContext";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { secondaryAuth, track } from "../../firebase";
import {
  adminCreateUserProfile as dbAdminCreateUserProfile,
  adminDeleteUser as dbAdminDeleteUser,
  adminGetUserByEmail as dbAdminGetUserByEmail,
  bulkSeedProfiles as dbBulkSeedProfiles,
  bulkSeedRecos as dbBulkSeedRecos,
  deactivateInstrument as dbDeactivateInstrument,
  getAdminInstruments as dbGetAdminInstruments,
  getInstrumentsExport as dbGetInstrumentsExport,
  seedCreatorRecos as dbSeedCreatorRecos,
  toggleFeedConfig as dbToggleFeedConfig,
  upsertInstrument as dbUpsertInstrument
} from "../../services/api/adminApi";
import {
  createUnclaimedProfile as dbCreateUnclaimedProfile,
  deleteUnclaimedProfile as dbDeleteUnclaimedProfile,
  getUnclaimedProfiles as dbGetUnclaimedProfiles,
  reviewClaimRequest as dbReviewClaimRequest
} from "../../services/api/claimApi";
import {
  getAboutUsContent as dbGetAboutUsContent,
  getSectors as dbGetSectors,
  saveAboutUsContent as dbSaveAboutUsContent
} from "../../services/api/lookupsApi";
import {
  checkUsername as dbCheckUsername
} from "../../services/api/profileApi";
import { InstrumentSearch } from "../../components/common";
import { EditGroupModal } from "../groups/Groups";
import { ABOUT_DEFAULT_HTML, CONTACT_COLORS, FALLBACK_SECTORS, HORIZONS, TODAY } from "../../constants/app";
import { ThesisEditor } from "../recommendations/Recommendations";
import { useIsMobile } from "../../hooks/index";
import { sendEmail } from "../../services/notify";
import { adminSebiApi, fmt, fmtDate, initialsOf } from "../../utils/format";
import { clearInstrCache } from "../../utils/instruments";

export function AdminSeedData() {
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
    if(!parsed) return;
    setSeeding(true); setSeedLog([]); setSeedDone(false);
    const log = (msg, type='info') => setSeedLog(l=>[...l,{msg,type,t:new Date().toLocaleTimeString()}]);

    /* 1 — Profiles */
    if(parsed.profiles.length) {
      log(`── Profiles (${parsed.profiles.length} rows) ──`);
      let ok=0, fail=0;
      try {
        const results = await dbBulkSeedProfiles(parsed.profiles);
        results.forEach(r => {
          if(r.ok){ ok++; log(`✓ ${r.email} — profile updated`,'success'); }
          else { fail++; log(r.error ? `✗ ${r.email} — ${r.error}` : `⚠ ${r.email} — no user found (create account first)`, r.error?'error':'warn'); }
        });
      } catch(e){ fail = parsed.profiles.length; log(`✗ Bulk profile update failed: ${e.message}`,'error'); }
      log(`Profiles done: ${ok} updated, ${fail} failed`);
    }

    /* 2 — Recommendations */
    if(parsed.recos.length) {
      log(`── Recommendations (${parsed.recos.length} rows) ──`);
      try {
        const results = await dbBulkSeedRecos(parsed.recos, seedMode);
        let ok=0, skipped=0, fail=0;
        results.forEach(r => {
          if(r.kind==='lookup') { log(r.found ? `Found user: @${r.username}` : `⚠ @${r.username} not found — create account and set username first`, r.found?'info':'warn'); return; }
          if(r.kind==='delete') { log(r.error ? `✗ Delete @${r.username}: ${r.error}` : `🗑 Deleted ${r.count} existing recos for @${r.username}`, r.error?'error':'warn'); return; }
          if(r.status==='inserted'){ ok++; log(`✓ ${r.ticker} by @${r.username} — inserted`,'success'); }
          else if(r.status?.startsWith('skipped')){ skipped++; log(`↷ Skip: ${r.ticker} @${r.username}`,'warn'); }
          else { fail++; log(`✗ ${r.ticker}: ${r.error||'failed'}`,'error'); }
        });
        log(`Recommendations done: ${ok} inserted, ${skipped} skipped, ${fail} failed`);
      } catch(e){ log(`✗ Bulk recommendation seed failed: ${e.message}`,'error'); }
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
              <button className="btn btn-pri" disabled={seeding} onClick={handleSeed} style={{minWidth:140}}>
                {seeding?<><Loader size={14} className="spin"/> Seeding…</>:<><Sparkles size={14}/> Run Seed</>}
              </button>
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

export function AdminFeedConfig({ feedConfigOptions, setFeedConfigOptions, setEffectiveFeedConfig, userFeedPrefs }) {
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
    try{
      await dbToggleFeedConfig(opt.key, field, value);
    }catch(e){console.warn('Feed config update:',e);}
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

export function AdminInstruments() {
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

export function InstrumentBrowser() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = async (search, pg=0) => {
    setLoading(true);
    try {
      const { instruments, total: ct } = await dbGetAdminInstruments(search, pg, PAGE_SIZE);
      setRows(instruments);
      if (pg===0) setTotal(ct);
    } catch(e) { console.warn(e); }
    setLoading(false);
  };

  useEffect(() => { load("", 0); }, []);

  const search = (v) => { setQ(v); setPage(0); load(v, 0); };
  const goPage = (p) => { setPage(p); load(q, p); };

  const downloadAll = async () => {
    const all = await dbGetInstrumentsExport();
    const ws = XLSX.utils.json_to_sheet(all);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Instruments");
    XLSX.writeFile(wb, "investorcircle_instruments.xlsx");
  };

  const del = async (id) => {
    if (!confirm("Remove this instrument from the reference list?")) return;
    await dbDeactivateInstrument(id);
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

export function InstrumentUploader() {
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
    if (!preview) return;
    setUploading(true); setProgress(0);
    let inserted = 0;
    for (let i=0; i<preview.length; i++) {
      const r = preview[i];
      try {
        await dbUpsertInstrument(r);
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

export function InstrumentAddForm({ onAdded }) {
  const [f, setF] = useState({ symbol:"", name:"", exchange:"NSE", type:"EQ", assetClass:"Equity", currency:"INR", sector:"" });
  const up = (k,v) => setF(s=>({...s,[k]:v}));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const valid = f.symbol.trim() && f.name.trim();
  const save = async () => {
    setSaving(true); setErr("");
    try {
      await dbUpsertInstrument({ ...f, symbol: f.symbol.trim().toUpperCase(), name: f.name.trim() });
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
// Phase 3: API-first, fallback-to-direct-Neon (mirrors the pattern in src/db.js).
// Admin authorization is enforced server-side in api/admin/sebi.js — never
// trust the client-side userIsAdmin flag as proof, it only gates the UI.

export function AdminSebi() {
  const { user } = useAuth();
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
    setLoading(true);
    const api = await adminSebiApi(user);
    if (api.ok) {
      setPending(api.data.pending || []); setApproved(api.data.approved || []);
      setVerifyMsg(api.data.verifyMessage || '');
      setRegOpts(api.data.regOptions || []); setOptDraft((api.data.regOptions || []).map(o=>({...o})));
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);

  const nameOf = u => [u.first_name,u.last_name].filter(Boolean).join(' ')||u.full_name||u.email;
  const regLabel = code => regOpts.find(o=>o.code===code)?.label||code;

  const doApprove = async (u) => {
    if(!confirm(`Approve SEBI registration for ${nameOf(u)}?`)) return;
    setBusy(b=>({...b,[u.id]:'approving'}));
    await adminSebiApi(user, { method: 'POST', body: { action: 'approve', userId: u.id } });
    await load();
    setBusy(b=>({...b,[u.id]:null}));
  };
  const doReject = async (u) => {
    if(!confirm(`Reject / revoke SEBI status for ${nameOf(u)}? Their profile will revert to "Not SEBI Registered".`)) return;
    setBusy(b=>({...b,[u.id]:'rejecting'}));
    await adminSebiApi(user, { method: 'POST', body: { action: 'reject', userId: u.id } });
    await load();
    setBusy(b=>({...b,[u.id]:null}));
  };

  const saveMsg = async () => {
    await adminSebiApi(user, { method: 'POST', body: { action: 'save-message', message: msgDraft } });
    setVerifyMsg(msgDraft); setEditMsg(false);
  };

  const saveOpts = async () => {
    await adminSebiApi(user, { method: 'POST', body: { action: 'save-reg-options', options: optDraft } });
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

export function AdminUsers({ users, setUsers, contacts, setContacts }) {
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
    try {
      await dbAdminDeleteUser(u.id);
      // Remove from local state
      setUsers(us => us.filter(x => x.id !== u.id));
      alert(`${u.name} has been permanently deleted. Their data has been removed from the database. Note: their Firebase login credential still exists technically — they will be blocked from accessing the app if they attempt to sign in.`);
    } catch(e) {
      alert("Delete failed: " + e.message);
    }
  };
  return (<>
    <div className="page-head"><div><div className="eyebrow">Admin</div><div className="page-title">Users</div>
      <div className="page-sub">
        {users.filter(u=>!u.isUnclaimedCreator).length} accounts
        {users.filter(u=>u.isUnclaimedCreator).length > 0 && ` + ${users.filter(u=>u.isUnclaimedCreator).length} creator profile${users.filter(u=>u.isUnclaimedCreator).length>1?'s':''}`}
        {' · manage roles, status and access'}
      </div></div>
      <button className="btn btn-pri" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add user</button></div>
    <div className="card"><div className="card-head"><span>All users</span>
      <div style={{ display:"flex", alignItems:"center", gap:8, background:"var(--surface-2)", borderRadius:10, padding:"7px 12px" }}>
        <Search size={15} color="var(--muted)"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" style={{border:"none",outline:"none",background:"transparent",fontSize:13}}/></div></div>
      <div className="card-body" style={{padding:"8px 10px"}}><table className="grid">
        <thead><tr>
          <th>User</th>
          <th>Username</th>
          <th>Role</th>
          <th>Status</th>
          <th style={{textAlign:"center"}}>Accounts</th>
          <th>Joined</th>
          <th style={{textAlign:"right"}}>Actions</th>
        </tr></thead>
        <tbody>{filtered.map(u=>(<tr key={u.id} className="hoverable"
          style={{background: u.isUnclaimedCreator ? 'rgba(251,146,60,.04)' : undefined}}>
          <td>
            <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
              <div>
                <div style={{fontWeight:600}}>{u.name}</div>
                <div className="muted small">{u.email}</div>
                {u.isUnclaimedCreator && (
                  <div style={{display:'flex',gap:5,marginTop:4,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,
                      background:'rgba(251,146,60,.12)',color:'#ea580c',whiteSpace:'nowrap'}}>
                      🎯 Creator Profile
                    </span>
                    {u.claimStatus === 'pending_approval' && (
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,
                        background:'rgba(109,93,245,.1)',color:'var(--accent-ink)',whiteSpace:'nowrap'}}>
                        ⏳ Claim pending
                      </span>
                    )}
                    {u.claimStatus === 'unclaimed' && (
                      <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,
                        background:'var(--surface-2)',color:'var(--muted)',whiteSpace:'nowrap'}}>
                        Awaiting claim
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
          <td>
            {u.username
              ? <span style={{fontFamily:'monospace',fontSize:12,color:'var(--accent-ink)'}}>@{u.username}</span>
              : <span className="muted small">—</span>}
          </td>
          <td><select className="inline-select" value={u.role} onChange={e=>setRole(u.id,e.target.value)}>{["Investor","Moderator","Admin"].map(r=><option key={r}>{r}</option>)}</select></td>
          <td><span className={"pill "+sp(u.status)}>{u.status}</span></td>
          <td style={{textAlign:"center"}}>{u.accounts}</td>
          <td className="muted small">{u.joined}</td>
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
      const newUser = {...u, id:"u"+Date.now(), isUnclaimedCreator:false, claimStatus:null};
      setUsers(us=>[newUser,...us]);
      setContacts(cs=>[...cs, {
        id: u.email, name:u.name, initials:initialsOf(u.name),
        color: CONTACT_COLORS[cs.length % CONTACT_COLORS.length],
        title: u.role, shared:{ level:"none", holdings:[] }
      }]);
      setShowAdd(false);
    }}/>}
    {users.some(u=>u.isUnclaimedCreator) && (
      <div className="note" style={{marginTop:14,fontSize:12}}>
        <Info size={13} style={{flexShrink:0}}/>
        <span>
          <strong>🎯 Creator Profile</strong> rows are admin-created staging profiles managed in the <strong>Creators</strong> tab.
          Once a creator claims and you approve their profile, the staging row is automatically removed from this list.
          If a claim is pending, approve it from <strong>Admin → Creators</strong>.
        </span>
      </div>
    )}
  </>);
}

export function AddUserModal({ onClose, onAdd }) {
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
      try {
        const nameParts = name.trim().split(/\s+/);
        const fn = nameParts[0] || "";
        const ln = nameParts.slice(1).join(" ") || "";
        await dbAdminCreateUserProfile({
          id: cred.user.uid, email: email.trim(), fullName: name.trim(),
          firstName: fn, lastName: ln, username: username.trim() || null,
        });
      } catch(e) { console.warn("user_profiles insert failed:", e.message); }
      onAdd({ id:cred.user.uid, name:name.trim(), email:email.trim(), role, status:"Active", accounts:0, joined:new Date().toLocaleDateString("en-US",{month:"short",year:"numeric"}) });
    } catch(e) {
      if (e.code === "auth/email-already-in-use") {
        // User exists in Firebase but may not be in Neon user_profiles yet.
        // Try to look them up and surface them in the admin list.
        try {
          const row = await dbAdminGetUserByEmail(email.trim().toLowerCase());
          if (row) {
            onAdd({ id:row.id, name:row.full_name, email:row.email, role:row.is_admin?"Admin":"Investor", status:"Active", accounts:0, joined:new Date(row.created_at).toLocaleDateString("en-US",{month:"short",year:"numeric"}) });
            setBusy(false); return; // successfully recovered
          }
        } catch(_) {}
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

export function AdminGroups({ groups, setGroups, contacts, me }) {
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

export function CreateGroupModal({ contacts, groups, myId, onClose, onCreate }) {
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

export function AdminConfigs({ configs, setConfigs, providers, setProviders }) {
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

export function RichTextEditor({ value, onChange }) {
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

export function AdminAboutEditor() {
  const [html,    setHtml]    = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [tab,     setTab]     = useState('edit'); // 'edit' | 'preview'

  useEffect(() => {
    dbGetAboutUsContent()
      .then(h => { setHtml(h || ABOUT_DEFAULT_HTML); setLoading(false); })
      .catch(() => { setHtml(ABOUT_DEFAULT_HTML); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await dbSaveAboutUsContent(html);
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

export function CreateCreatorModal({ onClose, onCreated }) {
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
      const uname = username.trim().toLowerCase();
      const result = await dbCreateUnclaimedProfile({
        firstName: firstName.trim(), lastName: lastName.trim(),
        username: uname, bio: bio.trim(), registrationStatus: regStatus,
      });
      const claimLink = `${window.location.origin}${window.location.pathname}?claim_token=${result.claimToken}`;
      setCreated({ claimLink, profileId: result.profileId, username: result.username, fullName: result.fullName });
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

export function AdminRecoSeedModal({ creatorId, creatorName, username, onClose, onDone }) {
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
  const [sectorOpts, setSectorOpts] = useState(FALLBACK_SECTORS);
  useEffect(() => {
    dbGetSectors()
      .then(sectors => { if (sectors?.length) setSectorOpts(sectors); })
      .catch(() => {});
  }, []);

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
      count = await dbSeedCreatorRecos(creatorId, queue);
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
                    <option value="">— Select sector —</option>
                    {sectorOpts.map(s=><option key={s}>{s}</option>)}
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
            <ThesisEditor value={thesis} onChange={setThesis}/>
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

export function AdminCreators({ ME, claimRequests=[], onClaimAction }) {
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
      const { unclaimed: rows, recoCounts: countMap } = await dbGetUnclaimedProfiles();
      setUnclaimed(rows);
      setRecoCounts(countMap || {});
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
      await dbDeleteUnclaimedProfile(id);
      load();
    } catch(e) { alert('Delete failed: ' + (e?.message||e)); }
  };

  const approveOrReject = async (reqId, action) => {
    const req = claimRequests.find(r=>r.id===reqId);
    if (!req) return;
    setReviewingId(reqId);
    try {
      // Server performs the full atomic FK migration + username transfer
      // (see api/_lib/handlers/claim-profile.js) and returns the claimer's
      // email/name for the notification email below.
      const result = await dbReviewClaimRequest(reqId, action, reviewNote);
      if (action === 'approve') {
        sendEmail('claim_approved', { to_email:result.claimerEmail, creator_name:result.claimerFullName, username:result.profileUsername });
      } else {
        sendEmail('claim_rejected', { to_email:result.claimerEmail, creator_name:result.claimerFullName, admin_note:reviewNote||'' });
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
