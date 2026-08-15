export const TODAY = new Date().toISOString().slice(0, 10); // always today

export const ACCOUNTS = []; // populated when user links accounts

export const HOLDINGS = []; // starts empty — user adds holdings or imports

export const TYPE_COLORS = { Stock:"#6d5df5", ETF:"#9a55ee", Fund:"#cf52d8", Crypto:"#2b2b40" };

export const CONTACT_COLORS = ["#6d5df5","#15924e","#cf52d8","#9a55ee","#5a49e6","#0ea5b7","#d97706","#be185d"];

export const DEFAULT_CLASSES = ["Equity","Bonds","ETF","Mutual Funds","Crypto","Metals","F&P","Others"];

export const CLASS_COLOR = { Equity:"#6d5df5", Bonds:"#0ea5b7", ETF:"#9a55ee", "Mutual Funds":"#cf52d8", Crypto:"#d97706", Metals:"#64748b", "F&P":"#15924e", Others:"#8d90ad" };

export const SPARK = [62,61,64,63,67,66,69,72,70,74,77,76,80,84,83,88,92,90,95,100];

/* ── About MIC — default page content (stored/overridden via app_settings) ── */

export const ABOUT_DEFAULT_HTML = `
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

export const CURRENCY_SYM = { INR:'₹', USD:'$', GBP:'£', EUR:'€' };

export const NOTIONAL = 1000; // assumed notional per acted recommendation, for demo P&L

export const PERM_ORDER = { off:0, names:1, full:2 };

export const HORIZONS = ["<3m","6m","12m",">2Y"];

export const THESIS_MAX_CHARS  = 500;

export const THESIS_MAX_IMAGES = 2;

export const THESIS_MAX_MB     = 2;      // original upload limit

export const THESIS_TARGET_KB  = 100;    // compressed target per image

export const THESIS_EMOJIS = [
  '😊','😄','😂','🤔','💡','✅','❌','⚠️','🔥','💯',
  '📈','📉','📊','💰','💎','🏆','🚀','⬆️','⬇️','↗️',
  '🎯','📌','⏰','🔔','💬','👀','🙌','💪','🤝','👍',
  '🟢','🔴','🟡','🔵','⚡','🌟','📝','🔍','💼','🏦',
];

export const FALLBACK_SECTORS = [
  "Banking & Finance","Technology","Pharmaceuticals","Energy","FMCG","Automobiles",
  "Defence","Capital Goods","Real Estate","Chemicals","Telecom","Metals & Mining",
  "PSU","Healthcare","Infrastructure","Media","Retail","Others",
];

export const SECTOR_EMOJI = {
  "Banking & Finance":"🏦","Technology":"💻","Pharmaceuticals":"💊","Energy":"⚡",
  "FMCG":"🛒","Automobiles":"🚗","Defence":"🛡","Capital Goods":"⚙️",
  "Real Estate":"🏗","Chemicals":"🧪","Telecom":"📡","Metals & Mining":"⛏",
  "PSU":"🏛","Healthcare":"🏥","Infrastructure":"🌉","Media":"📺","Retail":"🏪",
  "Others":"•••","Uncategorised":"•••",
};

/* ─── SVG Social Icons ──────────────────────────────────────────────────────── */

export const SOCIAL_PATHS = {
  twitter:   "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  linkedin:  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  telegram:  "M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  instagram: "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12c0 3.259.014 3.668.072 4.948.058 1.278.262 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24c3.259 0 3.668-.014 4.948-.072 1.277-.058 2.148-.262 2.913-.558.788-.306 1.459-.717 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.635.558-2.913.06-1.28.072-1.689.072-4.948 0-3.259-.013-3.667-.072-4.947-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 10-2.88 0 1.44 1.44 0 002.88 0z",
};

export const SOCIAL_BRAND = {
  twitter:   { active:'rgba(29,161,242,.18)',  icon:'#1DA1F2', border:'rgba(29,161,242,.45)' },
  linkedin:  { active:'rgba(10,102,194,.2)',   icon:'#0A66C2', border:'rgba(10,102,194,.45)' },
  telegram:  { active:'rgba(38,165,228,.18)',  icon:'#26A5E4', border:'rgba(38,165,228,.45)' },
  instagram: { active:'rgba(225,48,108,.18)',  icon:'#E1306C', border:'rgba(225,48,108,.45)' },
};

export const ADMIN_SEBI_API = (import.meta.env.VITE_CAS_API_URL || "https://investor-circle.vercel.app") + "/api/data?resource=admin-sebi";

export const contactInputSt = {
  width:'100%', border:'1px solid var(--line-2)', borderRadius:10,
  padding:'11px 14px', fontSize:14, outline:'none', fontFamily:'var(--font)',
  background:'var(--surface)', color:'var(--ink)', transition:'.12s',
};

export const PRIVACY_HTML = `
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
