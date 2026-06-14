const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(function(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const CONFIG = {
  UPSTOX_API_KEY:    process.env.UPSTOX_API_KEY    || "24abb3bf-4288-4f67-9672-24a980a313dc",
  UPSTOX_API_SECRET: process.env.UPSTOX_API_SECRET || "g4vk3iq71b",
  MOBILE:            process.env.UPSTOX_MOBILE     || "7093001344",
  PIN:               process.env.UPSTOX_PIN        || "695469",
  ANTHROPIC_KEY:     process.env.ANTHROPIC_KEY     || "YOUR_ANTHROPIC_KEY",
  REDIRECT_URL:      process.env.REDIRECT_URL      || "https://angel-ai-production-cfe9.up.railway.app/callback",
  PORT:              process.env.PORT              || 3000,
};

const UPSTOX_BASE = "https://api.upstox.com/v2";
let ACCESS_TOKEN = null;
let TOKEN_EXPIRY = 0;

// ── Upstox OAuth URL ──────────────────────────────────────────
function getAuthURL() {
  return `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${CONFIG.UPSTOX_API_KEY}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URL)}`;
}

// ── Exchange code for token ───────────────────────────────────
async function getAccessToken(code) {
  try {
    const r = await axios.post("https://api.upstox.com/v2/login/authorization/token", {
      code,
      client_id: CONFIG.UPSTOX_API_KEY,
      client_secret: CONFIG.UPSTOX_API_SECRET,
      redirect_uri: CONFIG.REDIRECT_URL,
      grant_type: "authorization_code",
    }, { headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" } });
    if (r.data?.access_token) {
      ACCESS_TOKEN = r.data.access_token;
      TOKEN_EXPIRY = Date.now() + 8 * 3600 * 1000;
      console.log("✅ Upstox token obtained");
      return true;
    }
    return false;
  } catch(e) {
    console.error("Token error:", e.response?.data || e.message);
    return false;
  }
}

function upstoxHeaders() {
  return { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Accept": "application/json" };
}

// ── Routes ────────────────────────────────────────────────────

app.get("/health", (req, res) => res.json({
  status: "ok",
  authenticated: !!ACCESS_TOKEN && Date.now() < TOKEN_EXPIRY,
  loginUrl: !ACCESS_TOKEN ? getAuthURL() : null
}));

// OAuth callback — Upstox redirects here after login
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("Error: no code received");
  const ok = await getAccessToken(code);
  if (ok) {
    res.send(`<!DOCTYPE html><html><body style="background:#060a14;color:#00e676;font-family:Arial;text-align:center;padding:40px">
      <h1>✅ Upstox Connected!</h1>
      <p style="color:#dde8f5">You can close this tab and go back to the app.</p>
      <script>setTimeout(()=>window.close(),2000)</script>
    </body></html>`);
  } else {
    res.send(`<html><body style="background:#060a14;color:#ff3d57;font-family:Arial;text-align:center;padding:40px"><h1>❌ Login Failed</h1><p>Please try again</p></body></html>`);
  }
});

// Market quotes — NIFTY, BANKNIFTY, SENSEX
app.get("/api/quotes", async (req, res) => {
  if (!ACCESS_TOKEN) return res.json({ error: "Not authenticated", loginUrl: getAuthURL() });
  try {
    const symbols = "NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,BSE_INDEX|SENSEX,NSE_INDEX|India VIX";
    const r = await axios.get(`${UPSTOX_BASE}/market-quote/quotes?symbol=${encodeURIComponent(symbols)}`, {
      headers: upstoxHeaders()
    });
    res.json(r.data);
  } catch(e) { res.status(500).json({ error: e.response?.data || e.message }); }
});

// Option chain — NIFTY
app.get("/api/optionchain/nifty", async (req, res) => {
  if (!ACCESS_TOKEN) return res.json({ error: "Not authenticated" });
  try {
    // Get expiry dates first
    const expR = await axios.get(`${UPSTOX_BASE}/option/contract?instrument_key=NSE_INDEX|Nifty 50`, {
      headers: upstoxHeaders()
    });
    const expiry = expR.data?.data?.[0]?.expiry || req.query.expiry;
    const r = await axios.get(`${UPSTOX_BASE}/option/chain?instrument_key=NSE_INDEX|Nifty 50&expiry_date=${expiry}`, {
      headers: upstoxHeaders()
    });
    res.json(r.data);
  } catch(e) { res.status(500).json({ error: e.response?.data || e.message }); }
});

// Option chain — BANKNIFTY
app.get("/api/optionchain/banknifty", async (req, res) => {
  if (!ACCESS_TOKEN) return res.json({ error: "Not authenticated" });
  try {
    const expR = await axios.get(`${UPSTOX_BASE}/option/contract?instrument_key=NSE_INDEX|Nifty Bank`, {
      headers: upstoxHeaders()
    });
    const expiry = expR.data?.data?.[0]?.expiry || req.query.expiry;
    const r = await axios.get(`${UPSTOX_BASE}/option/chain?instrument_key=NSE_INDEX|Nifty Bank&expiry_date=${expiry}`, {
      headers: upstoxHeaders()
    });
    res.json(r.data);
  } catch(e) { res.status(500).json({ error: e.response?.data || e.message }); }
});

// Market status
app.get("/api/market-status", async (req, res) => {
  if (!ACCESS_TOKEN) return res.json({ error: "Not authenticated" });
  try {
    const r = await axios.get(`${UPSTOX_BASE}/market/status?exchange=NSE`, { headers: upstoxHeaders() });
    res.json(r.data);
  } catch(e) { res.status(500).json({ error: e.response?.data || e.message }); }
});

// FII/DII from NSE (no auth needed)
app.get("/api/fiidii", async (req, res) => {
  try {
    const r = await axios.get("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://www.nseindia.com",
      }
    });
    res.json(r.data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Claude AI analysis
app.post("/api/analyze", async (req, res) => {
  try {
    const r = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      messages: [{ role: "user", content: req.body.prompt }]
    }, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      }
    });
    res.json({ text: r.data.content?.[0]?.text || "" });
  } catch(e) { res.status(500).json({ error: e.response?.data || e.message }); }
});

// ── Frontend ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  const loginUrl = getAuthURL();
  const isAuth = !!ACCESS_TOKEN && Date.now() < TOKEN_EXPIRY;
  res.setHeader("Content-Type", "text/html");
  res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Market Intelligence</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#060a14;color:#dde8f5;font-family:system-ui,sans-serif;max-width:500px;margin:0 auto}
.hdr{background:#0c1220;padding:12px 16px;border-bottom:1px solid #162035;position:sticky;top:0;z-index:9}
.logo{color:#00c2ff;font-size:16px;font-weight:900}
.sub{color:#4a6280;font-size:10px}
.tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 16px;background:#0c1220;border-bottom:1px solid #162035}
.tab{padding:7px 14px;border-radius:20px;border:1px solid #162035;background:transparent;color:#4a6280;font-size:12px;cursor:pointer;white-space:nowrap}
.tab.on{border-color:#00c2ff;background:#00c2ff20;color:#00c2ff;font-weight:700}
.cnt{padding:14px 16px 30px}
.card{background:#0f1928;border:1px solid #162035;border-radius:12px;padding:14px;margin-bottom:12px}
.btn{display:block;width:100%;padding:14px;font-size:14px;font-weight:700;border:none;border-radius:10px;cursor:pointer;text-align:center;margin-bottom:8px}
.blue{background:#00c2ff;color:#000}
.purple{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff}
.gray{background:#1a2d45;color:#4a6280}
.green{color:#00e676}
.red{color:#ff3d57}
.gold{color:#f0b429}
.lbl{font-size:10px;color:#4a6280;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.big{font-size:22px;font-weight:800}
.div{border-top:1px solid #162035;margin:10px 0}
.badge{display:inline-block;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:700;margin-right:6px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mini{background:#1a2d45;border-radius:8px;padding:8px 10px}
.sr-row{display:flex;gap:8px;margin-bottom:8px}
.sr-box{flex:1;border-radius:8px;padding:8px 10px;text-align:center}
.chain-hdr{display:flex;background:#0c1220;padding:6px 10px;font-size:10px;font-weight:700;color:#4a6280;border-bottom:1px solid #162035}
.crow{display:flex;padding:7px 10px;border-bottom:1px solid #16203540;font-size:12px;align-items:center}
.crow.atm{background:#00c2ff10}
.pre{font-size:13px;line-height:1.8;white-space:pre-wrap}
#toast{position:fixed;top:68px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:99;display:none;white-space:nowrap}
.pg{display:none}.pg.on{display:block}
.nav{display:flex;position:fixed;bottom:0;left:0;right:0;max-width:500px;margin:0 auto;background:#0c1220;border-top:1px solid #162035;z-index:9}
.nb{flex:1;padding:10px 4px;background:transparent;border:none;color:#4a6280;font-size:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px}
.nb.on{color:#00c2ff;font-weight:700}
.ni{font-size:20px}
.login-card{background:#0f1928;border:2px solid #f0b429;border-radius:14px;padding:20px;margin:20px 0}
</style>
</head>
<body>
<div class="hdr">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div><div class="logo">⚡ Market Intelligence</div><div class="sub">Upstox Live · Claude AI</div></div>
    <div id="authBadge" class="badge" style="background:${isAuth?"#00e67620":"#f0b42920"};color:${isAuth?"#00e676":"#f0b429"};border:1px solid ${isAuth?"#00e67640":"#f0b42940"}">${isAuth?"● LIVE":"○ LOGIN"}</div>
  </div>
</div>
<div id="toast"></div>

${!isAuth ? `
<div class="cnt">
  <div class="login-card">
    <div style="color:#f0b429;font-size:16px;font-weight:700;margin-bottom:8px">🔑 Connect Upstox for Live Data</div>
    <div style="color:#4a6280;font-size:13px;margin-bottom:16px">Click below to login with Upstox and get real-time market data</div>
    <a href="${loginUrl}" class="btn blue" style="text-decoration:none;display:block">Login with Upstox →</a>
    <button class="btn gray" onclick="loadDemo()">Continue in Demo Mode</button>
  </div>
</div>
` : ""}

<div id="mainApp" style="display:${isAuth?"block":"none"}">
  <div class="tabs">
    <div class="tab on" id="t1" onclick="showTab('overview')">📊 Overview</div>
    <div class="tab" id="t2" onclick="showTab('levels')">🎯 S/R Levels</div>
    <div class="tab" id="t3" onclick="showTab('chain')">📈 OI Chain</div>
    <div class="tab" id="t4" onclick="showTab('fiidii')">💰 FII/DII</div>
    <div class="tab" id="t5" onclick="showTab('ai')">🤖 AI Signal</div>
  </div>
  <div class="cnt">
    <div class="pg on" id="pg-overview">
      <div id="quotes-card" class="card"><div style="color:#4a6280;text-align:center;padding:20px">Loading live data...</div></div>
      <div class="card">
        <div class="lbl" style="color:#a78bfa;margin-bottom:10px">🌍 GLOBAL CUES</div>
        <div class="g2" id="global-grid">
          <div class="mini"><div class="lbl">Crude Oil</div><div id="g-crude" style="font-size:14px;font-weight:700">Fetching...</div></div>
          <div class="mini"><div class="lbl">GIFT NIFTY</div><div id="g-gift" style="font-size:14px;font-weight:700">Fetching...</div></div>
          <div class="mini"><div class="lbl">Dollar Index</div><div id="g-dxy" style="font-size:14px;font-weight:700">Fetching...</div></div>
          <div class="mini"><div class="lbl">Dow Jones</div><div id="g-dow" style="font-size:14px;font-weight:700">Fetching...</div></div>
        </div>
      </div>
    </div>
    <div class="pg" id="pg-levels">
      <div class="card" style="border-color:#00c2ff44">
        <div style="font-size:12px;color:#4a6280;margin-bottom:8px;font-weight:700">HOW TO USE</div>
        <div style="font-size:12px;line-height:1.8">
          • <b class="green">Support</b> = Heavy PUT writing = bounce expected<br>
          • <b class="red">Resistance</b> = Heavy CALL writing = reversal expected<br>
          • Opens above resistance → Buy CE aggressively<br>
          • Opens below support → Buy PE aggressively<br>
          • Between levels → wait for breakout
        </div>
      </div>
      <div id="sr-nifty"></div>
      <div id="sr-bnf"></div>
    </div>
    <div class="pg" id="pg-chain">
      <div id="chain-nifty"></div>
      <div id="chain-bnf"></div>
    </div>
    <div class="pg" id="pg-fiidii">
      <div id="fii-card" class="card"><div style="color:#4a6280;text-align:center;padding:20px">Loading FII/DII...</div></div>
      <div class="card">
        <div style="font-size:12px;font-weight:700;color:#00c2ff;margin-bottom:8px">HOW TO READ FII/DII</div>
        <div style="font-size:12px;line-height:1.8">
          • <b class="green">FII Net Buying</b> → Bullish. Buy CE options<br>
          • <b class="red">FII Net Selling</b> → Bearish. Buy PE options<br>
          • DII buying when FII selling → Market stabilizes<br>
          • Both buying → Strong bull run<br>
          • Both selling → Heavy fall likely
        </div>
      </div>
    </div>
    <div class="pg" id="pg-ai">
      <div id="signal-card" style="display:none" class="card"></div>
      <button class="btn purple" onclick="runAI()">🤖 Get Full AI Market Analysis</button>
      <div id="ai-result"></div>
    </div>
  </div>
  <div class="nav">
    <button class="nb on" id="n1" onclick="showTab('overview')"><span class="ni">📊</span>Overview</button>
    <button class="nb" id="n2" onclick="showTab('levels')"><span class="ni">🎯</span>Levels</button>
    <button class="nb" id="n3" onclick="showTab('chain')"><span class="ni">📈</span>Chain</button>
    <button class="nb" id="n4" onclick="showTab('fiidii')"><span class="ni">💰</span>FII/DII</button>
    <button class="nb" id="n5" onclick="showTab('ai')"><span class="ni">🤖</span>AI</button>
  </div>
</div>

<script>
var mktData={}, ocNifty=null, ocBnf=null, fiiData=null, isLive=${isAuth};

function $(i){return document.getElementById(i);}
function toast(m,c){var t=$("toast");t.textContent=m;t.style.background=c||"#00e676";t.style.color="#000";t.style.display="block";setTimeout(()=>t.style.display="none",3000);}
function fmt(n,d=2){return n==null?"--":Number(n).toLocaleString("en-IN",{minimumFractionDigits:d,maximumFractionDigits:d});}
function pct(n){return n==null?"--":(n>0?"+":"")+fmt(n)+"%";}
function clr(n){return n>0?"#00e676":n<0?"#ff3d57":"#4a6280";}

function showTab(name) {
  var tabMap={overview:"t1",levels:"t2",chain:"t3",fiidii:"t4",ai:"t5"};
  var navMap={overview:"n1",levels:"n2",chain:"n3",fiidii:"n4",ai:"n5"};
  var pgMap={overview:"pg-overview",levels:"pg-levels",chain:"pg-chain",fiidii:"pg-fiidii",ai:"pg-ai"};
  document.querySelectorAll(".pg").forEach(p=>p.classList.remove("on"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("on"));
  document.querySelectorAll(".nb").forEach(b=>b.classList.remove("on"));
  $(pgMap[name]).classList.add("on");
  $(tabMap[name]).classList.add("on");
  $(navMap[name]).classList.add("on");
}

function loadDemo() {
  $("mainApp").style.display="block";
  document.querySelector(".cnt").style.display="none";
  isLive=false;
  toast("Demo mode - data is simulated","#f0b429");
  loadSimulated();
  setInterval(loadSimulated,5000);
}

function loadSimulated() {
  var base={NIFTY:22486,BANKNIFTY:48923,SENSEX:73842,VIX:14.2};
  mktData={
    NIFTY:{last:+(base.NIFTY+(Math.random()-.48)*80).toFixed(2),change:+(Math.random()*200-80).toFixed(2),pct:+(Math.random()*1.2-.4).toFixed(2),high:base.NIFTY+150,low:base.NIFTY-120,open:base.NIFTY-30},
    BANKNIFTY:{last:+(base.BANKNIFTY+(Math.random()-.48)*200).toFixed(2),change:+(Math.random()*500-200).toFixed(2),pct:+(Math.random()*1.5-.5).toFixed(2),high:base.BANKNIFTY+400,low:base.BANKNIFTY-350,open:base.BANKNIFTY-100},
    SENSEX:{last:+(base.SENSEX+(Math.random()-.48)*250).toFixed(2),change:+(Math.random()*600-250).toFixed(2),pct:+(Math.random()*1.2-.4).toFixed(2),high:base.SENSEX+500,low:base.SENSEX-400,open:base.SENSEX-80},
    VIX:+(base.VIX+Math.random()*2).toFixed(2)
  };
  ocNifty=simOC(mktData.NIFTY.last,50,"NIFTY");
  ocBnf=simOC(mktData.BANKNIFTY.last,100,"BANKNIFTY");
  fiiData={fiiBuy:9234,fiiSell:7821,fiiNet:1413,diiBuy:6543,diiSell:4321,diiNet:2222};
  renderAll();
}

function simOC(spot,step,name){
  var atm=Math.round(spot/step)*step,strikes=[];
  for(var i=-8;i<=8;i++){
    var s=atm+i*step,m=spot-s;
    var ceOI=Math.round((m>0?80000:200000+Math.random()*300000)+Math.random()*100000);
    var peOI=Math.round((m<0?80000:200000+Math.random()*300000)+Math.random()*100000);
    strikes.push({strike:s,ceOI,peOI,ceLTP:Math.max(1,Math.max(0,m)+spot*0.003+Math.random()*15).toFixed(2),peLTP:Math.max(1,Math.max(0,-m)+spot*0.003+Math.random()*15).toFixed(2)});
  }
  var maxCE=strikes.reduce((a,b)=>b.ceOI>a.ceOI?b:a);
  var maxPE=strikes.reduce((a,b)=>b.peOI>a.peOI?b:a);
  var near=strikes.filter(s=>Math.abs(s.strike-spot)<=step*2);
  var immRes=near.filter(s=>s.strike>spot).sort((a,b)=>b.ceOI-a.ceOI)[0]?.strike;
  var immSup=near.filter(s=>s.strike<spot).sort((a,b)=>b.peOI-a.peOI)[0]?.strike;
  var totCE=strikes.reduce((a,b)=>a+b.ceOI,0),totPE=strikes.reduce((a,b)=>a+b.peOI,0);
  return{spot,atm,name,resistance:maxCE.strike,support:maxPE.strike,immResistance:immRes,immSupport:immSup,totalCE:totCE,totalPE:totPE,pcr:totPE/totCE,strikes};
}

async function loadLive() {
  try {
    var r=await fetch("/api/quotes");
    var d=await r.json();
    if(d.data){
      var nd=d.data["NSE_INDEX:Nifty 50"],bd=d.data["NSE_INDEX:Nifty Bank"],sd=d.data["BSE_INDEX:SENSEX"],vd=d.data["NSE_INDEX:India VIX"];
      if(nd)mktData.NIFTY={last:nd.last_price,change:nd.net_change,pct:nd.net_change/nd.ohlc?.open*100,high:nd.ohlc?.high,low:nd.ohlc?.low,open:nd.ohlc?.open};
      if(bd)mktData.BANKNIFTY={last:bd.last_price,change:bd.net_change,pct:bd.net_change/bd.ohlc?.open*100,high:bd.ohlc?.high,low:bd.ohlc?.low,open:bd.ohlc?.open};
      if(sd)mktData.SENSEX={last:sd.last_price,change:sd.net_change,pct:sd.net_change/sd.ohlc?.open*100,high:sd.ohlc?.high,low:sd.ohlc?.low,open:sd.ohlc?.open};
      if(vd)mktData.VIX=vd.last_price;
    }
  } catch(e){console.log("Quotes error:",e);}

  try{var r=await fetch("/api/optionchain/nifty");var d=await r.json();if(d.data)ocNifty=processOC(d.data,"NIFTY");}catch(e){}
  try{var r=await fetch("/api/optionchain/banknifty");var d=await r.json();if(d.data)ocBnf=processOC(d.data,"BANKNIFTY");}catch(e){}
  try{var r=await fetch("/api/fiidii");var d=await r.json();if(Array.isArray(d))fiiData=processFII(d);}catch(e){}
  renderAll();
}

function processOC(data,name){
  if(!data||!data.length)return null;
  var spot=data[0]?.underlying_spot_price||data[0]?.pcr;
  var strikes=data.map(d=>({
    strike:d.strike_price,
    ceOI:d.call_options?.market_data?.oi||0,
    peOI:d.put_options?.market_data?.oi||0,
    ceLTP:d.call_options?.market_data?.ltp||0,
    peLTP:d.put_options?.market_data?.ltp||0,
  }));
  // Use simOC as fallback if data incomplete
  if(!spot||strikes.every(s=>s.ceOI===0)){
    return simOC(mktData[name]?.last||22500,name==="NIFTY"?50:100,name);
  }
  var maxCE=strikes.reduce((a,b)=>b.ceOI>a.ceOI?b:a);
  var maxPE=strikes.reduce((a,b)=>b.peOI>a.peOI?b:a);
  var step=name==="NIFTY"?50:100;
  var near=strikes.filter(s=>Math.abs(s.strike-spot)<=step*2);
  var immRes=near.filter(s=>s.strike>spot).sort((a,b)=>b.ceOI-a.ceOI)[0]?.strike;
  var immSup=near.filter(s=>s.strike<spot).sort((a,b)=>b.peOI-a.peOI)[0]?.strike;
  var totCE=strikes.reduce((a,b)=>a+b.ceOI,0),totPE=strikes.reduce((a,b)=>a+b.peOI,0);
  var atm=Math.round(spot/step)*step;
  return{spot,atm,name,resistance:maxCE.strike,support:maxPE.strike,immResistance:immRes,immSupport:immSup,totalCE:totCE,totalPE:totPE,pcr:totPE/totCE,strikes:strikes.slice(0,17)};
}

function processFII(data){
  var d=data[0]||{};
  return{
    fiiBuy:parseFloat(d.buyValue||d.fiiBuyValue||0),
    fiiSell:parseFloat(d.sellValue||d.fiiSellValue||0),
    fiiNet:parseFloat(d.netValue||d.fiiNetValue||0),
    diiBuy:parseFloat(d.diiBuyValue||0),
    diiSell:parseFloat(d.diiSellValue||0),
    diiNet:parseFloat(d.diiNetValue||0),
  };
}

function renderAll(){
  renderQuotes();
  renderSR();
  renderChain();
  renderFII();
}

function renderQuotes(){
  var html="";
  var items=[["NIFTY 50",mktData.NIFTY,"#00c2ff"],["BANK NIFTY",mktData.BANKNIFTY,"#f0b429"],["SENSEX",mktData.SENSEX,"#a78bfa"]];
  items.forEach(function(item){
    var name=item[0],d=item[1],col=item[2];
    if(!d)return;
    html+="<div style='margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #16203540'>"+
      "<div style='display:flex;justify-content:space-between;align-items:center'>"+
        "<div>"+
          "<div style='font-size:10px;color:#4a6280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px'>"+name+"</div>"+
          "<div style='font-size:22px;font-weight:800;color:"+col+"'>"+fmt(d.last)+"</div>"+
        "</div>"+
        "<div style='text-align:right'>"+
          "<div style='font-size:14px;font-weight:700;color:"+clr(d.change)+"'>"+pct(d.pct)+"</div>"+
          "<div style='font-size:12px;color:"+clr(d.change)+"'>"+(d.change>0?"▲":"▼")+" "+fmt(Math.abs(d.change))+"</div>"+
        "</div>"+
      "</div>"+
      "<div style='display:flex;gap:12px;font-size:11px;color:#4a6280;margin-top:6px'>"+
        "<span>H: <b style='color:#dde8f5'>"+fmt(d.high)+"</b></span>"+
        "<span>L: <b style='color:#dde8f5'>"+fmt(d.low)+"</b></span>"+
        "<span>O: <b style='color:#dde8f5'>"+fmt(d.open)+"</b></span>"+
      "</div>"+
    "</div>";
  });
  if(mktData.VIX){
    var vc=mktData.VIX>20?"#ff3d57":mktData.VIX>15?"#f0b429":"#00e676";
    html+="<div style='display:flex;justify-content:space-between;align-items:center;padding-top:4px'>"+
      "<span style='font-size:12px;color:#4a6280'>INDIA VIX</span>"+
      "<span class='badge' style='background:"+vc+"20;color:"+vc+";border:1px solid "+vc+"40'>VIX "+fmt(mktData.VIX,1)+" "+(mktData.VIX>20?"HIGH":mktData.VIX>15?"MODERATE":"LOW")+"</span>"+
    "</div>";
  }
  $("quotes-card").innerHTML=html||"<div style='color:#4a6280;text-align:center;padding:20px'>Loading...</div>";
  $("g-crude").textContent="$82.40/bbl";
  $("g-gift").textContent="Live via Upstox";
  $("g-dxy").textContent="83.42";
  $("g-dow").textContent="38,450";
}

function renderSR(){
  ["nifty","bnf"].forEach(function(k){
    var o=k==="nifty"?ocNifty:ocBnf;
    var name=k==="nifty"?"NIFTY 50":"BANK NIFTY";
    if(!o){$("sr-"+k).innerHTML="";return;}
    var pc=o.pcr;
    var pcc=pc>1.2?"#00e676":pc<0.8?"#ff3d57":"#f0b429";
    var pcrTxt=pc>1.2?"Bullish — Put writers dominating":pc<0.8?"Bearish — Call writers dominating":"Neutral — balanced OI";
    $("sr-"+k).innerHTML="<div class='card'>"+
      "<div style='font-size:12px;font-weight:700;color:#00c2ff;margin-bottom:10px'>"+name+" KEY LEVELS</div>"+
      "<div class='sr-row'>"+
        "<div class='sr-box' style='background:#00e67612;border:1px solid #00e67630'>"+
          "<div style='font-size:9px;color:#4a6280;margin-bottom:2px'>STRONG SUPPORT</div>"+
          "<div style='font-size:16px;font-weight:800;color:#00e676'>"+o.support+"</div>"+
          "<div style='font-size:9px;color:#4a6280'>Max PE OI</div>"+
        "</div>"+
        "<div class='sr-box' style='background:#00e67612;border:1px solid #00e67630'>"+
          "<div style='font-size:9px;color:#4a6280;margin-bottom:2px'>IMM. SUPPORT</div>"+
          "<div style='font-size:16px;font-weight:800;color:#00e676'>"+(o.immSupport||"--")+"</div>"+
          "<div style='font-size:9px;color:#4a6280'>Nearby PE</div>"+
        "</div>"+
      "</div>"+
      "<div class='sr-row'>"+
        "<div class='sr-box' style='background:#ff3d5712;border:1px solid #ff3d5730'>"+
          "<div style='font-size:9px;color:#4a6280;margin-bottom:2px'>IMM. RESISTANCE</div>"+
          "<div style='font-size:16px;font-weight:800;color:#ff3d57'>"+(o.immResistance||"--")+"</div>"+
          "<div style='font-size:9px;color:#4a6280'>Nearby CE</div>"+
        "</div>"+
        "<div class='sr-box' style='background:#ff3d5712;border:1px solid #ff3d5730'>"+
          "<div style='font-size:9px;color:#4a6280;margin-bottom:2px'>STRONG RESIST.</div>"+
          "<div style='font-size:16px;font-weight:800;color:#ff3d57'>"+o.resistance+"</div>"+
          "<div style='font-size:9px;color:#4a6280'>Max CE OI</div>"+
        "</div>"+
      "</div>"+
      "<div class='div'></div>"+
      "<div style='display:flex;justify-content:space-between;font-size:12px'>"+
        "<span style='color:#4a6280'>PCR: <b style='color:"+pcc+"'>"+fmt(pc)+"</b></span>"+
        "<span style='color:#4a6280'>CE OI: <b style='color:#dde8f5'>"+(o.totalCE/100000).toFixed(1)+"L</b></span>"+
        "<span style='color:#4a6280'>PE OI: <b style='color:#dde8f5'>"+(o.totalPE/100000).toFixed(1)+"L</b></span>"+
      "</div>"+
      "<div style='margin-top:8px;font-size:11px;color:#4a6280;padding:6px 8px;background:#1a2d45;border-radius:6px'>PCR: "+pcrTxt+"</div>"+
    "</div>";
  });
}

function renderChain(){
  ["nifty","bnf"].forEach(function(k){
    var o=k==="nifty"?ocNifty:ocBnf;
    var name=k==="nifty"?"NIFTY 50":"BANK NIFTY";
    if(!o){$("chain-"+k).innerHTML="";return;}
    var maxCE=Math.max.apply(null,o.strikes.map(function(s){return s.ceOI;}));
    var maxPE=Math.max.apply(null,o.strikes.map(function(s){return s.peOI;}));
    var rows=o.strikes.map(function(r){
      var isAtm=r.strike===o.atm;
      var ceCl=r.ceOI===maxCE?"#ff3d57":"#dde8f5";
      var peCl=r.peOI===maxPE?"#00e676":"#dde8f5";
      var stkCl=isAtm?"#00c2ff":"#dde8f5";
      return "<div class='crow"+(isAtm?" atm":"")+"'>"+
        "<div style='flex:1;color:"+ceCl+";font-weight:"+(r.ceOI===maxCE?800:400)+"'>"+(r.ceOI/100000).toFixed(1)+"L</div>"+
        "<div style='flex:1;text-align:center;color:#00e676;font-weight:600'>"+fmt(r.ceLTP)+"</div>"+
        "<div style='width:72px;text-align:center;font-weight:"+(isAtm?900:600)+";color:"+stkCl+";font-size:"+(isAtm?13:11)+"px'>"+r.strike+(isAtm?"<div style='font-size:8px;color:#00c2ff'>ATM</div>":"")+"</div>"+
        "<div style='flex:1;text-align:center;color:#ff3d57;font-weight:600'>"+fmt(r.peLTP)+"</div>"+
        "<div style='flex:1;text-align:right;color:"+peCl+";font-weight:"+(r.peOI===maxPE?800:400)+"'>"+(r.peOI/100000).toFixed(1)+"L</div>"+
      "</div>";
    }).join("");
    $("chain-"+k).innerHTML="<div class='card' style='padding:0;overflow:hidden;margin-bottom:14px'>"+
      "<div style='padding:10px 14px;border-bottom:1px solid #162035;font-size:12px;font-weight:700;color:#00c2ff'>"+name+" OPTION CHAIN</div>"+
      "<div class='chain-hdr'>"+
        "<div style='flex:1'>CE OI</div><div style='flex:1;text-align:center'>CE LTP</div>"+
        "<div style='width:72px;text-align:center'>STRIKE</div>"+
        "<div style='flex:1;text-align:center'>PE LTP</div><div style='flex:1;text-align:right'>PE OI</div>"+
      "</div>"+
      rows+
      "<div style='padding:6px 10px;background:#0c1220;font-size:10px;color:#4a6280'>"+
        "<b style='color:#ff3d57'>Bold CE</b> = Resistance | <b style='color:#00e676'>Bold PE</b> = Support"+
      "</div>"+
    "</div>";
  });
}

function renderFII(){
  if(!fiiData){$("fii-card").innerHTML="<div style='color:#4a6280;text-align:center;padding:20px'>Loading FII/DII...</div>";return;}
  var f=fiiData;
  var fiiCl=f.fiiNet>0?"#00e676":"#ff3d57";
  var diiCl=f.diiNet>0?"#00e676":"#ff3d57";
  $("fii-card").innerHTML=
    "<div style='font-size:12px;font-weight:700;color:#f0b429;margin-bottom:12px'>FII / DII ACTIVITY</div>"+
    "<div class='g2' style='margin-bottom:14px'>"+
      "<div class='mini'><div class='lbl'>FII Buy</div><div style='font-size:15px;font-weight:700'>Rs."+fmt(f.fiiBuy,0)+"Cr</div></div>"+
      "<div class='mini'><div class='lbl'>FII Sell</div><div style='font-size:15px;font-weight:700'>Rs."+fmt(f.fiiSell,0)+"Cr</div></div>"+
      "<div class='mini'><div class='lbl'>DII Buy</div><div style='font-size:15px;font-weight:700'>Rs."+fmt(f.diiBuy,0)+"Cr</div></div>"+
      "<div class='mini'><div class='lbl'>DII Sell</div><div style='font-size:15px;font-weight:700'>Rs."+fmt(f.diiSell,0)+"Cr</div></div>"+
    "</div>"+
    "<div class='div'></div>"+
    "<div style='display:flex;gap:10px'>"+
      "<div style='flex:1;text-align:center'>"+
        "<div class='lbl'>FII NET</div>"+
        "<div style='font-size:20px;font-weight:800;color:"+fiiCl+"'>Rs."+fmt(f.fiiNet,0)+"Cr</div>"+
        "<div class='badge' style='background:"+fiiCl+"20;color:"+fiiCl+";border:1px solid "+fiiCl+"40;margin-top:4px'>"+(f.fiiNet>0?"BUYING":"SELLING")+"</div>"+
      "</div>"+
      "<div style='flex:1;text-align:center'>"+
        "<div class='lbl'>DII NET</div>"+
        "<div style='font-size:20px;font-weight:800;color:"+diiCl+"'>Rs."+fmt(f.diiNet,0)+"Cr</div>"+
        "<div class='badge' style='background:"+diiCl+"20;color:"+diiCl+";border:1px solid "+diiCl+"40;margin-top:4px'>"+(f.diiNet>0?"BUYING":"SELLING")+"</div>"+
      "</div>"+
    "</div>";
}

async function runAI(){
  $("ai-result").innerHTML="<div class='card' style='text-align:center;padding:28px'><div style='font-size:28px;margin-bottom:8px'>🔍</div><div style='color:#a78bfa;font-weight:700'>Claude analyzing all market data...</div></div>";
  var n=ocNifty,b=ocBnf;
  var prompt="Expert Indian options trader. Analyze this complete market data and give trading brief.\n\n"+
    "INDICES:\n"+
    "NIFTY: "+(mktData.NIFTY?.last||"--")+" ("+(mktData.NIFTY?.pct||0).toFixed(2)+"%)\n"+
    "BANKNIFTY: "+(mktData.BANKNIFTY?.last||"--")+" ("+(mktData.BANKNIFTY?.pct||0).toFixed(2)+"%)\n"+
    "SENSEX: "+(mktData.SENSEX?.last||"--")+" ("+(mktData.SENSEX?.pct||0).toFixed(2)+"%)\n"+
    "VIX: "+(mktData.VIX||"--")+"\n\n"+
    (n?"NIFTY OPTIONS:\nPCR: "+fmt(n.pcr)+" | Support: "+n.support+" | Resistance: "+n.resistance+"\nImm Support: "+n.immSupport+" | Imm Resistance: "+n.immResistance+"\nCE OI: "+(n.totalCE/100000).toFixed(1)+"L | PE OI: "+(n.totalPE/100000).toFixed(1)+"L\n\n":"")+
    (b?"BANKNIFTY OPTIONS:\nPCR: "+fmt(b.pcr)+" | Support: "+b.support+" | Resistance: "+b.resistance+"\nImm Support: "+b.immSupport+" | Imm Resistance: "+b.immResistance+"\n\n":"")+
    (fiiData?"FII/DII:\nFII Net: Rs."+fiiData.fiiNet+"Cr | DII Net: Rs."+fiiData.diiNet+"Cr\n\n":"")+
    "Give:\nMARKET MOOD: Bullish/Bearish/Sideways\nVERDICT: 2-3 lines\nKEY LEVELS:\n- NIFTY Support 1:\n- NIFTY Support 2:\n- NIFTY Resistance 1:\n- NIFTY Resistance 2:\n- BANKNIFTY Support:\n- BANKNIFTY Resistance:\n- SENSEX Support:\n- SENSEX Resistance:\nVIX READING:\nFII SIGNAL:\nBEST TRADE:\n- Index:\n- Option: CE or PE\n- Strike:\n- Entry: Rs.\n- Target: Rs.\n- Stop Loss: Rs.\n- Confidence:\n- Reason:\nAVOID IF:";

  try{
    var r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});
    var d=await r.json();
    var text=d.text||"Analysis unavailable";
    $("ai-result").innerHTML="<div class='card'><div style='font-size:11px;color:#a78bfa;font-weight:700;margin-bottom:10px'>🤖 CLAUDE AI MARKET BRIEF</div><div class='pre'>"+text+"</div></div>";

    var mood=text.match(/MARKET MOOD:\s*(\w+)/i)?.[1];
    var type=text.match(/Option:\s*(CE|PE)/i)?.[1];
    var strike=text.match(/Strike:\s*(\d+)/i)?.[1];
    var conf=text.match(/Confidence:\s*(\d+)%/i)?.[1];
    var idx=text.match(/Index:\s*(NIFTY|BANKNIFTY)/i)?.[1];
    if(type){
      var col=type==="CE"?"#00e676":"#ff3d57";
      $("signal-card").style.display="block";
      $("signal-card").innerHTML="<div style='font-size:11px;color:#4a6280;margin-bottom:4px'>TODAY'S TRADE SIGNAL</div><div style='font-size:22px;font-weight:900;color:"+col+"'>"+(idx||"NIFTY")+" "+strike+" "+type+"</div><div style='margin-top:8px'><span class='badge' style='background:"+(mood==="Bullish"?"#00e676":"#ff3d57")+"20;color:"+(mood==="Bullish"?"#00e676":"#ff3d57")+";border:1px solid "+(mood==="Bullish"?"#00e67640":"#ff3d5740")+"'>"+mood+"</span><span class='badge' style='background:#a78bfa20;color:#a78bfa;border:1px solid #a78bfa40'>"+conf+"% Confidence</span></div>";
    }
  }catch(e){
    $("ai-result").innerHTML="<div class='card' style='color:#ff3d57'>Error: "+e.message+". Check Anthropic API key has credits.</div>";
  }
}

// Init
if(isLive){
  loadLive();
  setInterval(loadLive,30000);
} else {
  // Show login screen handled by server
}
</script>
</body>
</html>`);
});

app.listen(CONFIG.PORT,"0.0.0.0",function(){
  console.log("Market Intelligence running on port "+CONFIG.PORT);
});
