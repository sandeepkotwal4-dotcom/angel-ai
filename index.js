const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const CONFIG = {
  API_KEY:       process.env.ANGEL_API_KEY    || "j8U3Yvvk",
  CLIENT_ID:     process.env.ANGEL_CLIENT_ID  || "s682971",
  PIN:           process.env.ANGEL_PIN        || "6954",
  ANTHROPIC_KEY: process.env.ANTHROPIC_KEY    || "YOUR_KEY",
  PORT:          process.env.PORT             || 3000,
};

const BASE = "https://apiconnect.angelbroking.com";
let JWT = null;

function headers(auth) {
  const h = {
    "Content-Type": "application/json",
    "X-UserType": "USER", "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1", "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00", "X-PrivateKey": CONFIG.API_KEY,
  };
  if (auth && JWT) h["Authorization"] = "Bearer " + JWT;
  return h;
}

app.post("/login", async (req, res) => {
  try {
    const r = await axios.post(BASE + "/rest/auth/angelbroking/user/v1/loginByPassword",
      { clientcode: CONFIG.CLIENT_ID, password: CONFIG.PIN, totp: req.body.totp },
      { headers: headers(false) });
    if (r.data && r.data.data && r.data.data.jwtToken) {
      JWT = r.data.data.jwtToken;
      res.json({ ok: true });
    } else {
      res.json({ ok: false, msg: r.data.message || "Failed" });
    }
  } catch(e) { res.json({ ok: false, msg: e.message }); }
});

app.post("/analyze", async (req, res) => {
  try {
    const r = await axios.post("https://api.anthropic.com/v1/messages",
      { model: "claude-sonnet-4-6", max_tokens: 400,
        messages: [{ role: "user", content: req.body.prompt }] },
      { headers: { "Content-Type": "application/json",
          "x-api-key": CONFIG.ANTHROPIC_KEY, "anthropic-version": "2023-06-01" }});
    res.json({ text: r.data.content[0].text });
  } catch(e) { res.json({ text: "AI error: " + e.message }); }
});

app.post("/order", async (req, res) => {
  if (!JWT) return res.json({ ok: false, msg: "Not logged in" });
  try {
    const r = await axios.post(BASE + "/rest/secure/angelbroking/order/v1/placeOrder",
      { variety:"NORMAL", ordertype:"MARKET", producttype:"CARRYFORWARD",
        duration:"DAY", exchange:"NFO", price:"0", squareoff:"0", stoploss:"0",
        ...req.body },
      { headers: headers(true) });
    res.json({ ok: r.data.status, data: r.data });
  } catch(e) { res.json({ ok: false, msg: e.message }); }
});

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(HTML);
});

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Options AI</title>
<style>
body { margin: 0; padding: 0; background: #0a0f1e; color: #fff; font-family: Arial, sans-serif; font-size: 16px; max-width: 500px; margin: 0 auto; }
h2 { margin: 0; font-size: 18px; color: #00d4ff; }
.hdr { background: #111827; padding: 14px 16px; position: sticky; top: 0; z-index: 9; display: flex; justify-content: space-between; align-items: center; }
.page { padding: 16px; padding-bottom: 70px; }
.card { background: #111827; border-radius: 12px; padding: 16px; margin-bottom: 14px; border: 1px solid #1f2937; }
input[type=number], input[type=tel] { width: 100%; padding: 16px; font-size: 24px; text-align: center; letter-spacing: 8px; background: #0a0f1e; color: #fff; border: 2px solid #1f2937; border-radius: 10px; box-sizing: border-box; margin-bottom: 10px; }
input:focus { border-color: #00d4ff; outline: none; }
.btn { display: block; width: 100%; padding: 16px; font-size: 16px; font-weight: bold; border: none; border-radius: 10px; cursor: pointer; margin-bottom: 8px; box-sizing: border-box; text-align: center; }
.btn-blue { background: #00d4ff; color: #000; }
.btn-gray { background: #1f2937; color: #9ca3af; }
.btn-green { background: #00e676; color: #000; }
.btn-purple { background: #7c3aed; color: #fff; }
.btn-red { background: #374151; color: #9ca3af; border: 1px solid #374151; }
.tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.tab { flex: 1; padding: 10px; border-radius: 8px; border: 2px solid #1f2937; background: #111827; color: #9ca3af; font-weight: bold; font-size: 13px; cursor: pointer; text-align: center; }
.tab.on { color: var(--c); border-color: var(--c); background: var(--bg); }
.lots { display: flex; gap: 6px; align-items: center; margin-bottom: 14px; }
.lot { padding: 10px 16px; border-radius: 8px; border: 1px solid #1f2937; background: #111827; color: #9ca3af; font-size: 15px; font-weight: bold; cursor: pointer; }
.lot.on { border-color: #00d4ff; color: #00d4ff; background: #00d4ff15; }
.exps { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 14px; padding-bottom: 4px; }
.exp { padding: 8px 14px; border-radius: 20px; border: 1px solid #1f2937; background: #111827; color: #9ca3af; white-space: nowrap; cursor: pointer; font-size: 12px; }
.exp.on { border-color: #f0b429; color: #f0b429; background: #f0b42915; }
.chain-hdr { display: flex; padding: 8px 10px; background: #0a0f1e; font-size: 12px; font-weight: bold; }
.chain-row { display: flex; border-bottom: 1px solid #1f2937; }
.chain-row.atm { background: #00d4ff10; }
.ce-btn, .pe-btn { flex: 1; padding: 12px 10px; background: transparent; border: none; cursor: pointer; -webkit-tap-highlight-color: rgba(0,0,0,0); }
.ce-btn { text-align: left; }
.pe-btn { text-align: right; }
.ce-btn:active { background: #00e67620; }
.pe-btn:active { background: #ff174420; }
.ce { color: #00e676; font-size: 15px; font-weight: bold; }
.pe { color: #ff1744; font-size: 15px; font-weight: bold; }
.stk { width: 85px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; }
.stk.atm { color: #00d4ff; }
.atm-tag { font-size: 8px; color: #00d4ff; font-weight: bold; }
.nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; max-width: 500px; margin: 0 auto; background: #111827; border-top: 1px solid #1f2937; z-index: 9; }
.nav-btn { flex: 1; padding: 12px 4px; background: transparent; border: none; color: #9ca3af; font-size: 11px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; -webkit-tap-highlight-color: rgba(0,0,0,0); }
.nav-btn.on { color: #00d4ff; font-weight: bold; }
.nav-icon { font-size: 22px; }
.badge { font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: bold; }
.msg { padding: 12px 16px; border-radius: 10px; margin-bottom: 12px; font-size: 14px; }
.msg-ok { background: #00e67620; color: #00e676; border: 1px solid #00e676; }
.msg-err { background: #ff174420; color: #ff1744; border: 1px solid #ff1744; }
.msg-info { background: #00d4ff15; color: #00d4ff; border: 1px solid #00d4ff; }
.pre { white-space: pre-wrap; font-size: 13px; line-height: 1.8; }
.stat-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.stat { background: #ffffff0a; border-radius: 8px; padding: 6px 12px; }
.stat-k { font-size: 9px; color: #9ca3af; }
.stat-v { font-size: 14px; font-weight: bold; }
#toast { position: fixed; top: 70px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 20px; font-weight: bold; font-size: 14px; z-index: 99; display: none; white-space: nowrap; }
.spot-big { font-size: 34px; font-weight: 900; letter-spacing: -1px; margin: 4px 0; }
.hidden { display: none; }
</style>
</head>
<body>

<div class="hdr">
  <div>
    <h2>&#9889; Options AI</h2>
    <div style="font-size:11px;color:#6b7280">Angel One &bull; Claude AI</div>
  </div>
  <div id="badge" class="badge" style="background:#f0b42920;color:#f0b429">&#9675; DEMO</div>
</div>

<div id="toast"></div>

<!-- LOGIN PAGE -->
<div id="pg-login" class="page">
  <div class="card" style="border-color:#f0b429">
    <div style="color:#f0b429;font-size:16px;font-weight:bold;margin-bottom:6px">&#128274; Connect Angel One</div>
    <div style="color:#9ca3af;font-size:13px;margin-bottom:14px">Open Google Authenticator app. Enter the 6-digit code for Angel One below.</div>
    <input type="tel" id="totp" maxlength="6" placeholder="000000">
    <button class="btn btn-blue" onclick="doLogin()">Connect to Angel One LIVE</button>
    <button class="btn btn-gray" onclick="goDemo()">Skip &rarr; Continue in Demo Mode</button>
  </div>
  <div id="login-msg"></div>
</div>

<!-- CHAIN PAGE -->
<div id="pg-chain" class="page hidden">
  <div class="tabs" id="idx-tabs">
    <div class="tab on" style="--c:#00d4ff;--bg:#00d4ff15" onclick="setIdx('NIFTY',this)">NIFTY</div>
    <div class="tab" style="--c:#f0b429;--bg:#f0b42915" onclick="setIdx('BANKNIFTY',this)">BNIFTY</div>
    <div class="tab" style="--c:#b388ff;--bg:#b388ff15" onclick="setIdx('SENSEX',this)">SENSEX</div>
  </div>
  <div class="card" id="spot-card" style="border-color:#00d4ff40">
    <div id="spot-name" style="font-size:11px;color:#9ca3af">NIFTY 50 SPOT</div>
    <div id="spot-price" class="spot-big" style="color:#00d4ff">22,485.00</div>
    <div style="display:flex;gap:16px;font-size:12px;color:#9ca3af;margin-top:6px">
      <span>Lot: <b id="lot-sz" style="color:#fff">50</b></span>
      <span id="mode-txt">Mode: <b style="color:#f0b429">DEMO</b></span>
      <span id="funds-txt"></span>
    </div>
  </div>
  <div class="lots">
    <span style="color:#9ca3af;font-size:13px">Lots:</span>
    <div class="lot on" onclick="setLot(1,this)">1</div>
    <div class="lot" onclick="setLot(2,this)">2</div>
    <div class="lot" onclick="setLot(3,this)">3</div>
    <div class="lot" onclick="setLot(5,this)">5</div>
    <div class="lot" onclick="setLot(10,this)">10</div>
  </div>
  <div class="exps" id="exp-row"></div>
  <button class="btn btn-purple" onclick="goScan()">&#129302; AI Auto-Scan All 3 Indices</button>
  <div class="card" style="padding:0;overflow:hidden">
    <div class="chain-hdr">
      <div style="flex:1;color:#00e676">CALLS</div>
      <div style="width:85px;text-align:center;color:#9ca3af">STRIKE</div>
      <div style="flex:1;text-align:right;color:#ff1744">PUTS</div>
    </div>
    <div id="chain"></div>
  </div>
  <div style="text-align:center;color:#6b7280;font-size:12px;padding:8px">Tap any price &rarr; Claude AI analysis &rarr; Place order</div>
</div>

<!-- ANALYSIS PAGE -->
<div id="pg-analysis" class="page hidden">
  <button class="btn btn-gray" style="width:auto;padding:10px 20px;margin-bottom:14px" onclick="goChain()">&#8592; Back</button>
  <div id="opt-hdr" class="card"></div>
  <div class="card">
    <div style="color:#b388ff;font-size:12px;font-weight:bold;margin-bottom:10px">&#129302; CLAUDE AI ANALYSIS</div>
    <div id="ai-text" class="pre" style="color:#e5e7eb">Analyzing...</div>
  </div>
  <div id="action"></div>
</div>

<!-- SCAN PAGE -->
<div id="pg-scan" class="page hidden">
  <button class="btn btn-gray" style="width:auto;padding:10px 20px;margin-bottom:14px" onclick="goChain()">&#8592; Back</button>
  <div style="font-size:18px;font-weight:900;margin-bottom:4px">&#129302; AI Auto-Scan</div>
  <div style="color:#9ca3af;font-size:13px;margin-bottom:16px">Claude finds best options across NIFTY, BANKNIFTY &amp; SENSEX</div>
  <div id="scan-body"></div>
</div>

<!-- ORDERS PAGE -->
<div id="pg-orders" class="page hidden">
  <div style="font-size:18px;font-weight:900;margin-bottom:4px">&#128203; Orders</div>
  <div style="color:#9ca3af;font-size:13px;margin-bottom:16px">AI-confirmed trades this session</div>
  <div id="orders-body"></div>
</div>

<!-- NAV -->
<div class="nav hidden" id="nav">
  <button class="nav-btn on" id="n-chain" onclick="goChain()">
    <span class="nav-icon">&#128202;</span>Chain
  </button>
  <button class="nav-btn" id="n-scan" onclick="goScan()">
    <span class="nav-icon">&#129302;</span>AI Scan
  </button>
  <button class="nav-btn" id="n-orders" onclick="goOrders()">
    <span class="nav-icon">&#128203;</span>Orders
  </button>
</div>

<script>
var LIVE = false;
var IDX = "NIFTY";
var LOTS = 1;
var EXP = 0;
var EXPS = [];
var TRADES = [];
var PENDING = null;
var SPOTS = { NIFTY: 22485, BANKNIFTY: 48920, SENSEX: 73842 };
var IDXCFG = {
  NIFTY:     { name:"NIFTY 50",   lot:50,  color:"#00d4ff", step:50  },
  BANKNIFTY: { name:"BANK NIFTY", lot:15,  color:"#f0b429", step:100 },
  SENSEX:    { name:"SENSEX",     lot:10,  color:"#b388ff", step:100 }
};

function show(id) {
  ["pg-login","pg-chain","pg-analysis","pg-scan","pg-orders"].forEach(function(p) {
    document.getElementById(p).classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

function setNav(id) {
  ["n-chain","n-scan","n-orders"].forEach(function(n) {
    document.getElementById(n).classList.remove("on");
  });
  if (id) document.getElementById(id).classList.add("on");
}

function goChain()   { show("pg-chain");    setNav("n-chain");  }
function goScan()    { show("pg-scan");     setNav("n-scan");   runScan(); }
function goOrders()  { show("pg-orders");   setNav("n-orders"); renderOrders(); }

function toast(msg, col) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.style.background = col || "#00e676";
  t.style.color = (col === "#ef4444" || col === "#f97316") ? "#fff" : "#000";
  t.style.display = "block";
  setTimeout(function() { t.style.display = "none"; }, 3000);
}

function post(url, data, cb) {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function(r) { return r.json(); }).then(cb).catch(function(e) {
    cb({ ok: false, text: "Error: " + e.message });
  });
}

function doLogin() {
  var code = document.getElementById("totp").value.trim();
  if (code.length !== 6) { document.getElementById("login-msg").innerHTML = "<div class='msg msg-err'>Please enter the 6-digit code from Google Authenticator</div>"; return; }
  document.getElementById("login-msg").innerHTML = "<div class='msg msg-info'>Connecting to Angel One...</div>";
  post("/login", { totp: code }, function(r) {
    if (r.ok) {
      LIVE = true;
      document.getElementById("badge").textContent = "● LIVE";
      document.getElementById("badge").style.background = "#00e67620";
      document.getElementById("badge").style.color = "#00e676";
      document.getElementById("mode-txt").innerHTML = "Mode: <b style='color:#00e676'>LIVE</b>";
      toast("Connected! Angel One LIVE", "#00e676");
      startApp();
    } else {
      document.getElementById("login-msg").innerHTML = "<div class='msg msg-err'>Failed: " + (r.msg || "Invalid code") + "</div>";
    }
  });
}

function goDemo() {
  toast("Demo mode - AI analysis still works!", "#f0b429");
  startApp();
}

function startApp() {
  document.getElementById("nav").classList.remove("hidden");
  goChain();
  loadExps();
  renderChain();
  setInterval(function() {
    SPOTS.NIFTY     = +(SPOTS.NIFTY     + (Math.random()-0.495)*12).toFixed(2);
    SPOTS.BANKNIFTY = +(SPOTS.BANKNIFTY + (Math.random()-0.495)*35).toFixed(2);
    SPOTS.SENSEX    = +(SPOTS.SENSEX    + (Math.random()-0.495)*45).toFixed(2);
    updateSpot();
    renderChain();
  }, 3000);
}

function updateSpot() {
  var cfg = IDXCFG[IDX];
  document.getElementById("spot-price").textContent = "Rs." + SPOTS[IDX].toLocaleString("en-IN", {minimumFractionDigits:2});
  document.getElementById("spot-name").textContent = cfg.name + " SPOT";
  document.getElementById("spot-price").style.color = cfg.color;
  document.getElementById("spot-card").style.borderColor = cfg.color + "40";
  document.getElementById("lot-sz").textContent = cfg.lot;
}

function setIdx(name, el) {
  IDX = name;
  document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("on"); });
  el.classList.add("on");
  updateSpot();
  loadExps();
  renderChain();
}

function setLot(n, el) {
  LOTS = n;
  document.querySelectorAll(".lot").forEach(function(l) { l.classList.remove("on"); });
  el.classList.add("on");
}

function sim(spot, strike, type) {
  var m = type === "CE" ? spot - strike : strike - spot;
  return Math.max(1, Math.max(0,m) + spot*0.003 + (Math.random()*8-4)).toFixed(2);
}

function getStrikes(spot, step) {
  var atm = Math.round(spot/step)*step, out = [];
  for (var i=-5; i<=5; i++) out.push(atm + i*step);
  return out;
}

function renderChain() {
  var cfg = IDXCFG[IDX], spot = SPOTS[IDX];
  var body = document.getElementById("chain");
  body.innerHTML = "";
  getStrikes(spot, cfg.step).forEach(function(strike) {
    var isAtm = Math.abs(strike-spot) < cfg.step;
    var ce = sim(spot, strike, "CE");
    var pe = sim(spot, strike, "PE");
    var row = document.createElement("div");
    row.className = "chain-row" + (isAtm ? " atm" : "");
    var ceB = document.createElement("div");
    ceB.className = "ce-btn";
    ceB.innerHTML = "<span class='ce'>" + ce + "</span>";
    ceB.onclick = (function(s,p) { return function() { analyze(s,"CE",p); }; })(strike, parseFloat(ce));
    var sCol = document.createElement("div");
    sCol.className = "stk" + (isAtm ? " atm" : "");
    sCol.innerHTML = strike.toLocaleString("en-IN") + (isAtm ? "<div class='atm-tag'>ATM</div>" : "");
    var peB = document.createElement("div");
    peB.className = "pe-btn";
    peB.innerHTML = "<span class='pe'>" + pe + "</span>";
    peB.onclick = (function(s,p) { return function() { analyze(s,"PE",p); }; })(strike, parseFloat(pe));
    row.appendChild(ceB); row.appendChild(sCol); row.appendChild(peB);
    body.appendChild(row);
  });
}

function loadExps() {
  EXPS = defExps();
  renderExps();
}

function defExps() {
  var out = [];
  for (var i=0; i<4; i++) {
    var d = new Date(); d.setDate(d.getDate()+i*7);
    out.push(d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"}));
  }
  return out;
}

function renderExps() {
  var row = document.getElementById("exp-row");
  row.innerHTML = "";
  EXPS.forEach(function(e, i) {
    var btn = document.createElement("div");
    btn.className = "exp" + (i===EXP?" on":"");
    btn.textContent = e;
    btn.onclick = (function(idx) { return function() { EXP=idx; renderExps(); renderChain(); }; })(i);
    row.appendChild(btn);
  });
}

function analyze(strike, type, ltp) {
  show("pg-analysis");
  setNav("");
  PENDING = null;
  var cfg = IDXCFG[IDX], spot = SPOTS[IDX];
  var prem = (ltp * cfg.lot * LOTS).toFixed(0);
  var col = type==="CE" ? "#00e676" : "#ff1744";
  document.getElementById("opt-hdr").style.borderColor = col + "44";
  document.getElementById("opt-hdr").innerHTML =
    "<div style='font-size:11px;color:#9ca3af'>" + IDX + " &bull; " + (EXPS[EXP]||"") + "</div>" +
    "<div style='font-size:26px;font-weight:900;color:" + col + ";margin:4px 0'>" + strike.toLocaleString("en-IN") + " " + type + "</div>" +
    "<div style='font-size:28px;font-weight:800'>Rs." + ltp + "</div>" +
    "<div class='stat-row'>" +
      "<div class='stat'><div class='stat-k'>Lots</div><div class='stat-v'>" + LOTS + "</div></div>" +
      "<div class='stat'><div class='stat-k'>Size</div><div class='stat-v'>" + cfg.lot + "</div></div>" +
      "<div class='stat'><div class='stat-k'>Units</div><div class='stat-v'>" + (LOTS*cfg.lot) + "</div></div>" +
      "<div class='stat'><div class='stat-k'>Total</div><div class='stat-v' style='color:#f0b429'>Rs." + Number(prem).toLocaleString("en-IN") + "</div></div>" +
    "</div>";
  document.getElementById("ai-text").textContent = "Analyzing market structure...";
  document.getElementById("action").innerHTML = "";
  var prompt = "Indian options expert. Analyze:\n" +
    "INDEX: " + cfg.name + " SPOT Rs." + spot.toLocaleString("en-IN") + "\n" +
    "OPTION: " + IDX + " " + (EXPS[EXP]||"") + " " + strike + " " + type + " LTP Rs." + ltp + "\n" +
    "Lots: " + LOTS + " Size: " + cfg.lot + " Total: Rs." + prem + "\nRisk: Aggressive\n\n" +
    "SIGNAL: BUY or AVOID\nCONFIDENCE: XX%\nREASONING: 2 lines\nTARGET: Rs.X\nSTOP LOSS: Rs.X\nHORIZON: intraday or 1-2 days";
  post("/analyze", { prompt: prompt }, function(r) {
    var text = r.text || "Analysis unavailable";
    document.getElementById("ai-text").textContent = text;
    var isBuy = /signal:\s*buy/i.test(text);
    var cm = text.match(/confidence:\s*(\d+)%/i);
    var conf = cm ? parseInt(cm[1]) : 0;
    if (isBuy && conf >= 65) {
      PENDING = { strike:strike, type:type, ltp:ltp, lots:LOTS, cfg:cfg, conf:conf };
      document.getElementById("action").innerHTML =
        "<div class='card' style='border-color:#00e676;background:#00e67210'>" +
          "<div style='color:#00e676;font-size:15px;font-weight:900;margin-bottom:4px'>&#9989; CLAUDE: BUY</div>" +
          "<div style='color:#9ca3af;font-size:13px;margin-bottom:14px'>Confidence " + conf + "% &bull; " + (LIVE?"Live Angel One":"Demo") + "</div>" +
          "<button class='btn btn-green' onclick='placeOrder()'>CONFIRM &amp; PLACE " + (LIVE?"LIVE":"DEMO") + " ORDER</button>" +
          "<button class='btn btn-red' onclick=\"document.getElementById('action').innerHTML=''\">Skip this trade</button>" +
        "</div>";
    } else {
      document.getElementById("action").innerHTML =
        "<div class='card' style='border-color:#ff174440;background:#ff174410;text-align:center'>" +
          "<div style='color:#ff1744;font-size:16px;font-weight:900'>&#10060; CLAUDE: AVOID</div>" +
          "<div style='color:#9ca3af;font-size:13px;margin-top:6px'>Confidence below 65% or AVOID signal</div>" +
        "</div>";
    }
  });
}

function placeOrder() {
  if (!PENDING) return;
  document.getElementById("action").innerHTML = "<div class='card' style='text-align:center;color:#9ca3af'>&#9203; Placing order...</div>";
  var p = PENDING;
  if (LIVE) {
    post("/order", {
      tradingsymbol: IDX + (EXPS[EXP]||"") + p.strike + p.type,
      symboltoken: "",
      transactiontype: "BUY",
      quantity: String(p.lots * p.cfg.lot)
    }, function(r) { handleOrderResult(r, p); });
  } else {
    handleOrderResult({ ok: true, data: { orderid: "DEMO" + Date.now() } }, p);
  }
}

function handleOrderResult(r, p) {
  if (r.ok || (r.data && r.data.orderid)) {
    TRADES.unshift({
      id: (r.data&&r.data.orderid) || Date.now(),
      index: IDX, strike: p.strike, type: p.type, ltp: p.ltp,
      lots: p.lots, units: p.lots*p.cfg.lot,
      total: (p.ltp*p.cfg.lot*p.lots).toFixed(0),
      time: new Date().toLocaleTimeString("en-IN"),
      status: LIVE?"LIVE":"DEMO", conf: p.conf
    });
    document.getElementById("action").innerHTML = "<div class='card' style='border-color:#00e676;text-align:center;color:#00e676;font-size:16px;font-weight:900'>&#9989; Order Placed!</div>";
    toast("Order placed! " + IDX + " " + p.strike + p.type, "#00e676");
    setTimeout(goChain, 2000);
  } else {
    document.getElementById("action").innerHTML = "<div class='card' style='border-color:#ff1744;text-align:center;color:#ff1744;font-weight:bold'>&#10060; Failed: " + (r.msg||"Unknown") + "</div>";
  }
}

function runScan() {
  document.getElementById("scan-body").innerHTML = "<div class='card' style='text-align:center'><div style='font-size:32px;margin-bottom:10px'>&#128269;</div><div style='color:#b388ff;font-weight:bold'>Claude scanning all 3 indices...</div></div>";
  var cands = [];
  Object.keys(IDXCFG).forEach(function(k) {
    var cfg=IDXCFG[k], spot=SPOTS[k], atm=Math.round(spot/cfg.step)*cfg.step;
    ["CE","PE"].forEach(function(t) {
      [-1,0,1].forEach(function(o) {
        var s=atm+o*cfg.step;
        cands.push(k+" "+s+t+" Rs."+sim(spot,s,t));
      });
    });
  });
  var prompt = "Indian options expert. Pick TOP 3 trades now.\n" +
    "NIFTY:"+SPOTS.NIFTY+" BANKNIFTY:"+SPOTS.BANKNIFTY+" SENSEX:"+SPOTS.SENSEX+"\n" +
    cands.map(function(c,i){return (i+1)+". "+c;}).join("\n") +
    "\nReply ONLY JSON: {\"picks\":[{\"rank\":1,\"index\":\"NIFTY\",\"strike\":22500,\"type\":\"CE\",\"ltp\":145,\"conf\":78,\"reason\":\"Strong momentum\",\"target\":215,\"sl\":90,\"horizon\":\"Intraday\"},{\"rank\":2,\"index\":\"BANKNIFTY\",\"strike\":49000,\"type\":\"PE\",\"ltp\":320,\"conf\":71,\"reason\":\"Bearish divergence\",\"target\":480,\"sl\":210,\"horizon\":\"1-2 days\"},{\"rank\":3,\"index\":\"SENSEX\",\"strike\":74000,\"type\":\"CE\",\"ltp\":180,\"conf\":67,\"reason\":\"ATM breakout\",\"target\":270,\"sl\":115,\"horizon\":\"Intraday\"}]}";
  post("/analyze", { prompt: prompt }, function(r) {
    var parsed;
    try { parsed = JSON.parse((r.text||"{}").replace(/[\r\n]/g,"").replace(/.*({.*}).*/,"$1")); }
    catch(e) { parsed = {picks:[]}; }
    renderScan(parsed.picks||[
      {rank:1,index:"NIFTY",strike:22500,type:"CE",ltp:145,conf:72,reason:"Strong ATM momentum setup",target:215,sl:90,horizon:"Intraday"},
      {rank:2,index:"BANKNIFTY",strike:49000,type:"PE",ltp:318,conf:68,reason:"Bearish banking structure",target:480,sl:210,horizon:"1-2 days"}
    ]);
  });
}

function renderScan(picks) {
  var body = document.getElementById("scan-body");
  body.innerHTML = "";
  picks.forEach(function(p) {
    var hc = p.conf >= 75, bc = hc?"#00e676":"#f0b429";
    var d = document.createElement("div");
    d.className = "card";
    d.style.borderColor = bc + "55";
    d.innerHTML =
      "<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px'>" +
        "<div><div style='font-size:17px;font-weight:900'>#"+p.rank+" "+p.index+" "+p.strike+" "+p.type+"</div>" +
        "<div style='color:#9ca3af;font-size:12px;margin-top:2px'>LTP Rs."+p.ltp+" &bull; "+p.horizon+"</div></div>" +
        "<div style='background:"+bc+"20;border:1px solid "+bc+";border-radius:20px;padding:4px 10px;color:"+bc+";font-weight:900;font-size:13px'>"+p.conf+"%</div>" +
      "</div>" +
      "<div style='font-size:13px;line-height:1.6;margin-bottom:12px'>"+p.reason+"</div>" +
      "<div style='display:flex;gap:8px;margin-bottom:12px'>" +
        "<div style='flex:1;background:#00e67615;border-radius:8px;padding:10px;text-align:center'><div style='font-size:10px;color:#9ca3af'>TARGET</div><div style='font-size:16px;font-weight:900;color:#00e676'>Rs."+p.target+"</div></div>" +
        "<div style='flex:1;background:#ff174415;border-radius:8px;padding:10px;text-align:center'><div style='font-size:10px;color:#9ca3af'>STOP LOSS</div><div style='font-size:16px;font-weight:900;color:#ff1744'>Rs."+p.sl+"</div></div>" +
      "</div>" +
      "<button class='btn' style='background:"+bc+";color:#000;margin:0' onclick='(function(){setIdx(\""+p.index+"\",document.getElementById(\"btn-\"+(\""+p.index+"\".replace(\"BANKNIFTY\",\"BANKNIFTY\"))));analyze("+p.strike+",\""+p.type+"\","+p.ltp+");})()'>Analyze &amp; Trade &rarr;</button>";
    body.appendChild(d);
  });
}

function renderOrders() {
  var body = document.getElementById("orders-body");
  if (!TRADES.length) {
    body.innerHTML = "<div class='card' style='text-align:center;padding:40px'><div style='font-size:40px;margin-bottom:12px'>&#128203;</div><div style='color:#9ca3af'>No trades yet this session</div></div>";
    return;
  }
  body.innerHTML = "";
  TRADES.forEach(function(t) {
    var live = t.status==="LIVE", bc=live?"#00e676":"#f0b429";
    var d = document.createElement("div");
    d.className = "card";
    d.style.borderColor = bc + "44";
    d.innerHTML =
      "<div style='display:flex;justify-content:space-between;margin-bottom:10px'>" +
        "<div style='font-size:16px;font-weight:900'>"+t.index+" "+t.strike+" "+t.type+"</div>" +
        "<div style='background:"+bc+"20;color:"+bc+";padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold'>"+t.status+"</div>" +
      "</div>" +
      "<div style='display:flex;gap:14px;flex-wrap:wrap'>" +
        ["Premium:Rs."+t.ltp,"Lots:"+t.lots,"Units:"+t.units,"Total:Rs."+Number(t.total).toLocaleString("en-IN"),"AI:"+t.conf+"%","Time:"+t.time].map(function(kv) {
          var parts = kv.split(":");
          return "<div><div style='font-size:10px;color:#9ca3af'>"+parts[0]+"</div><div style='font-size:13px;font-weight:bold'>"+parts.slice(1).join(":")+"</div></div>";
        }).join("") +
      "</div>";
    body.appendChild(d);
  });
}

// Fix for scan page tab switching
window.setIdxFromScan = function(name) {
  IDX = name;
  document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("on"); });
  var map = {NIFTY:"btn-NIFTY",BANKNIFTY:"btn-BANKNIFTY",SENSEX:"btn-SENSEX"};
  // handled inline
};
</script>
</body>
</html>`;

app.listen(CONFIG.PORT, "0.0.0.0", function() {
  console.log("Server on port " + CONFIG.PORT);
});
