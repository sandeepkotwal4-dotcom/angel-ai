const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const CONFIG = {
  API_KEY:       process.env.ANGEL_API_KEY    || "j8U3Yvvk",
  CLIENT_ID:     process.env.ANGEL_CLIENT_ID  || "s682971",
  PIN:           process.env.ANGEL_PIN        || "6954",
  TOTP_SECRET:   process.env.ANGEL_TOTP_TOKEN || "PL4GZ26WU6TGO4YEMYR7OT3B7Q",
  ANTHROPIC_KEY: process.env.ANTHROPIC_KEY    || "YOUR_ANTHROPIC_KEY",
  PORT:          process.env.PORT             || 3000,
};

const BASE = "https://apiconnect.angelbroking.com";
let SESSION = { jwtToken: null, expiresAt: 0 };

function base32Decode(s) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = s.toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0;
  const out = [];
  for (const c of s) {
    value = (value << 5) | alpha.indexOf(c);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateTOTP(secret) {
  const crypto = require("crypto");
  const key  = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / 30);
  const buf  = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  buf.writeUInt32BE(time >>> 0, 4);
  const hash = crypto.createHmac("sha1", key).update(buf).digest();
  const off  = hash[hash.length - 1] & 0xf;
  const code = ((hash[off] & 0x7f) << 24) | ((hash[off+1] & 0xff) << 16) |
               ((hash[off+2] & 0xff) << 8) | (hash[off+3] & 0xff);
  return String(code % 1000000).padStart(6, "0");
}

function aH(auth = false) {
  const h = {
    "Content-Type": "application/json", "Accept": "application/json",
    "X-UserType": "USER", "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1", "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00", "X-PrivateKey": CONFIG.API_KEY,
  };
  if (auth && SESSION.jwtToken) h["Authorization"] = "Bearer " + SESSION.jwtToken;
  return h;
}

async function ensureSession() {
  if (SESSION.jwtToken && Date.now() < SESSION.expiresAt) return true;
  try {
    const totp = generateTOTP(CONFIG.TOTP_SECRET);
    const res = await axios.post(
      BASE + "/rest/auth/angelbroking/user/v1/loginByPassword",
      { clientcode: CONFIG.CLIENT_ID, password: CONFIG.PIN, totp },
      { headers: aH() }
    );
    if (res.data && res.data.status && res.data.data && res.data.data.jwtToken) {
      SESSION.jwtToken  = res.data.data.jwtToken;
      SESSION.expiresAt = Date.now() + 8 * 3600 * 1000;
      console.log("Angel One logged in OK");
      return true;
    }
    console.error("Login failed:", res.data && res.data.message);
    return false;
  } catch (e) {
    console.error("Login error:", e.message);
    return false;
  }
}

app.get("/health", (req, res) => res.json({ status: "ok", session: !!SESSION.jwtToken }));

app.post("/api/login", async (req, res) => {
  SESSION = { jwtToken: null, expiresAt: 0 };
  const ok = await ensureSession();
  ok ? res.json({ status: true }) : res.status(401).json({ status: false, message: "Login failed" });
});

app.get("/api/funds", async (req, res) => {
  await ensureSession();
  try { const r = await axios.get(BASE + "/rest/secure/angelbroking/user/v1/getRMS", { headers: aH(true) }); res.json(r.data); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/optionchain", async (req, res) => {
  await ensureSession();
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/market/v1/optionchain",
      { params: req.body, headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/expiry/:name", async (req, res) => {
  await ensureSession();
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/market/v1/expiry",
      { params: { name: req.params.name, expirytype: "NEAR" }, headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/order/place", async (req, res) => {
  await ensureSession();
  try {
    const r = await axios.post(BASE + "/rest/secure/angelbroking/order/v1/placeOrder",
      Object.assign({ variety: "NORMAL", ordertype: "MARKET", producttype: "CARRYFORWARD",
        duration: "DAY", exchange: "NFO", price: "0", squareoff: "0", stoploss: "0" }, req.body),
      { headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/positions", async (req, res) => {
  await ensureSession();
  try { const r = await axios.get(BASE + "/rest/secure/angelbroking/order/v1/getPosition", { headers: aH(true) }); res.json(r.data); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ai/analyze", async (req, res) => {
  try {
    const r = await axios.post("https://api.anthropic.com/v1/messages",
      { model: "claude-sonnet-4-6", max_tokens: 600,
        messages: [{ role: "user", content: req.body.prompt }] },
      { headers: { "Content-Type": "application/json",
          "x-api-key": CONFIG.ANTHROPIC_KEY, "anthropic-version": "2023-06-01" } });
    res.json({ text: r.data.content && r.data.content[0] && r.data.content[0].text || "" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── FRONTEND ───────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Options AI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:#070b14;color:#e8f4fd;font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;min-height:100vh}
button{font-family:inherit;cursor:pointer;outline:none;border:none}
.header{background:#0d1424;border-bottom:1px solid #1a2a45;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20}
.logo{font-size:16px;font-weight:900;color:#00d4ff}
.sub{font-size:10px;color:#5a7a99}
.badges{display:flex;gap:6px}
.badge{font-size:10px;padding:3px 8px;border-radius:20px;font-weight:700}
.content{padding:16px;padding-bottom:80px}
.screen{display:none}.screen.active{display:block}
.nav{display:flex;background:#0d1424;border-top:1px solid #1a2a45;position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;z-index:20}
.nav button{flex:1;padding:10px 4px;background:transparent;color:#5a7a99;font-size:10px;display:flex;flex-direction:column;align-items:center;gap:2px}
.nav button.active{color:#00d4ff;font-weight:800}
.nav button span{font-size:20px}
.card{background:#111c30;border:1px solid #1a2a45;border-radius:14px;padding:16px;margin-bottom:14px}
.idx-tabs{display:flex;gap:8px;margin-bottom:14px}
.idx-tab{flex:1;padding:9px 4px;border-radius:10px;border:1.5px solid #1a2a45;background:#111c30;color:#5a7a99;font-weight:800;font-size:11px}
.idx-tab.active-nifty{border-color:#00d4ff;background:#00d4ff22;color:#00d4ff}
.idx-tab.active-banknifty{border-color:#f0b429;background:#f0b42922;color:#f0b429}
.idx-tab.active-sensex{border-color:#b388ff;background:#b388ff22;color:#b388ff}
.spot-card{border-radius:14px;padding:16px;margin-bottom:14px}
.spot-price{font-size:32px;font-weight:900;letter-spacing:-1px}
.lot-row{background:#111c30;border:1px solid #1a2a45;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:10px}
.lot-btn{padding:5px 12px;border-radius:8px;border:1px solid #1a2a45;background:transparent;color:#5a7a99;font-weight:700;font-size:13px}
.lot-btn.active{border-color:#00d4ff;background:#00d4ff22;color:#00d4ff}
.expiry-row{display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px}
.expiry-btn{padding:5px 12px;border-radius:20px;border:1px solid #1a2a45;background:transparent;color:#5a7a99;font-size:11px;font-weight:600;white-space:nowrap}
.expiry-btn.active{border-color:#f0b429;background:#f0b42922;color:#f0b429}
.scan-btn{width:100%;padding:14px;background:linear-gradient(135deg,#b388ff,#7c3aed);border:none;border-radius:12px;color:#fff;font-weight:800;font-size:14px;margin-bottom:14px}
.chain-wrap{background:#111c30;border:1px solid #1a2a45;border-radius:14px;overflow:hidden;margin-bottom:10px}
.chain-head{display:flex;background:#0d1424;padding:8px;border-bottom:1px solid #1a2a45}
.chain-head div{font-size:11px;font-weight:700}
.chain-row{display:flex;border-bottom:1px solid #1a2a45}
.chain-row.atm{background:#00d4ff22}
.chain-ce,.chain-pe{flex:1;padding:9px 8px;background:transparent;border:none;cursor:pointer}
.chain-ce{text-align:left}
.chain-pe{text-align:right}
.ce-price{color:#00e676;font-weight:700;font-size:13px}
.pe-price{color:#ff1744;font-weight:700;font-size:13px}
.strike-col{width:80px;display:flex;align-items:center;justify-content:center;flex-direction:column}
.strike-val{font-size:12px;font-weight:600}
.strike-val.atm{font-weight:900;color:#00d4ff}
.atm-tag{font-size:8px;color:#00d4ff;font-weight:800}
.toast{position:fixed;top:68px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:100;white-space:nowrap;box-shadow:0 4px 20px #0008;display:none}
.back-btn{background:transparent;border:none;color:#5a7a99;margin-bottom:12px;font-size:14px;padding:0}
.analysis-header{border-radius:14px;padding:16px;margin-bottom:14px}
.analysis-body{background:#111c30;border:1px solid #1a2a45;border-radius:14px;padding:16px;margin-bottom:14px}
.analysis-text{font-size:13px;line-height:1.75;color:#e8f4fd;white-space:pre-wrap}
.confirm-box{background:#00e67622;border:1.5px solid #00e676;border-radius:14px;padding:16px;margin-bottom:14px}
.confirm-btn{width:100%;padding:14px;background:#00e676;border:none;border-radius:10px;color:#000;font-weight:900;font-size:15px;margin-bottom:8px}
.skip-btn{width:100%;padding:10px;background:transparent;border:1px solid #1a2a45;border-radius:10px;color:#5a7a99;font-weight:600;font-size:13px}
.avoid-box{background:#ff174422;border:1px solid #ff174422;border-radius:12px;padding:14px;text-align:center}
.stat-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.stat{background:#ffffff08;border-radius:8px;padding:5px 10px}
.stat-k{font-size:9px;color:#5a7a99}
.stat-v{font-size:13px;font-weight:700}
.pick-card{background:#111c30;border-radius:14px;padding:16px;margin-bottom:12px}
.pick-tg{display:flex;gap:8px;margin-bottom:12px}
.tg-box{flex:1;border-radius:8px;padding:6px 10px;text-align:center}
.tg-k{font-size:9px;color:#5a7a99}
.trade-btn{width:100%;padding:11px;border:none;border-radius:10px;color:#000;font-weight:800;font-size:13px}
.pos-card{background:#111c30;border:1px solid #1a2a45;border-radius:12px;padding:14px;margin-bottom:10px}
.empty-box{background:#111c30;border:1px solid #1a2a45;border-radius:14px;padding:32px;text-align:center;color:#5a7a99}
.hint{font-size:11px;color:#5a7a99;text-align:center}
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="logo">⚡ OPTIONS AI</div>
    <div class="sub">Angel One · Claude Powered</div>
  </div>
  <div class="badges">
    <div class="badge" id="liveBadge" style="background:#f0b42922;color:#f0b429">○ DEMO</div>
    <div class="badge" style="background:#b388ff22;color:#b388ff">🤖 AI</div>
  </div>
</div>

<div class="toast" id="toast"></div>

<div class="content">

  <!-- DASHBOARD -->
  <div class="screen active" id="screen-dashboard">
    <div class="idx-tabs">
      <button class="idx-tab active-nifty" onclick="setIndex('NIFTY')">NIFTY</button>
      <button class="idx-tab" onclick="setIndex('BANKNIFTY')">BNIFTY</button>
      <button class="idx-tab" onclick="setIndex('SENSEX')">SENSEX</button>
    </div>
    <div class="spot-card" id="spotCard" style="background:linear-gradient(135deg,#111c30,#0d1424);border:1px solid #00d4ff44">
      <div style="font-size:11px;color:#5a7a99" id="spotName">NIFTY 50 SPOT</div>
      <div class="spot-price" id="spotPrice" style="color:#00d4ff">₹22,485.00</div>
      <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">
        <div style="font-size:11px;color:#5a7a99">Lot: <b id="lotSizeDisplay" style="color:#e8f4fd">50</b></div>
        <div style="font-size:11px;color:#5a7a99">Mode: <b id="modeDisplay" style="color:#ff9800">DEMO</b></div>
        <div style="font-size:11px;color:#5a7a99" id="fundsDisplay"></div>
      </div>
    </div>
    <div class="lot-row">
      <span style="font-size:12px;color:#5a7a99">Lots</span>
      <button class="lot-btn active" onclick="setQty(1)" id="qty1">1</button>
      <button class="lot-btn" onclick="setQty(2)" id="qty2">2</button>
      <button class="lot-btn" onclick="setQty(3)" id="qty3">3</button>
      <button class="lot-btn" onclick="setQty(5)" id="qty5">5</button>
      <button class="lot-btn" onclick="setQty(10)" id="qty10">10</button>
    </div>
    <div class="expiry-row" id="expiryRow"></div>
    <button class="scan-btn" onclick="runScan()">🤖 AI Auto-Scan All 3 Indices</button>
    <div class="chain-wrap">
      <div class="chain-head">
        <div style="flex:1;color:#00e676">CALLS</div>
        <div style="width:80px;text-align:center;color:#5a7a99">STRIKE</div>
        <div style="flex:1;text-align:right;color:#ff1744">PUTS</div>
      </div>
      <div id="chainBody"></div>
    </div>
    <div class="hint">Tap any price → Claude AI → Confirm → Place order</div>
  </div>

  <!-- ANALYSIS -->
  <div class="screen" id="screen-analysis">
    <button class="back-btn" onclick="showScreen('dashboard')">← Back</button>
    <div class="analysis-header" id="analysisHeader"></div>
    <div class="analysis-body">
      <div style="font-size:11px;color:#b388ff;font-weight:700;margin-bottom:10px">🤖 CLAUDE AI ANALYSIS</div>
      <div class="analysis-text" id="analysisText">Analyzing market structure...</div>
    </div>
    <div id="confirmBox"></div>
  </div>

  <!-- SCAN -->
  <div class="screen" id="screen-scan">
    <button class="back-btn" onclick="showScreen('dashboard')">← Back</button>
    <div style="font-size:17px;font-weight:800;margin-bottom:2px">🤖 AI Auto-Scan</div>
    <div style="font-size:12px;color:#5a7a99;margin-bottom:16px">Claude scans NIFTY + BANKNIFTY + SENSEX</div>
    <div id="scanBody"></div>
  </div>

  <!-- ORDERS -->
  <div class="screen" id="screen-orders">
    <div style="font-size:17px;font-weight:800;margin-bottom:2px">📋 Orders & Positions</div>
    <div style="font-size:12px;color:#5a7a99;margin-bottom:16px">AI-confirmed trades</div>
    <div id="ordersBody"></div>
  </div>

</div>

<div class="nav">
  <button class="active" id="nav-dashboard" onclick="showScreen('dashboard')"><span>📊</span>Chain</button>
  <button id="nav-scan" onclick="showScreen('scan')"><span>🤖</span>AI Scan</button>
  <button id="nav-orders" onclick="showScreen('orders')"><span>📋</span>Orders</button>
</div>

<script>
// ── State ──────────────────────────────────────────────────────
var state = {
  activeIdx: "NIFTY",
  qty: 1,
  expiry: 0,
  expiries: [],
  spots: { NIFTY: 22485, BANKNIFTY: 48920, SENSEX: 73842 },
  connected: false,
  trades: [],
  positions: [],
  selectedOpt: null,
  pendingOrder: null,
};

var INDICES = {
  NIFTY:     { name:"NIFTY 50",   lotSize:50,  color:"#00d4ff", step:50  },
  BANKNIFTY: { name:"BANK NIFTY", lotSize:15,  color:"#f0b429", step:100 },
  SENSEX:    { name:"SENSEX",     lotSize:10,  color:"#b388ff", step:100 },
};

// ── API ────────────────────────────────────────────────────────
function api(path, method, body) {
  var opts = { method: method || "GET", headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(path, opts).then(function(r){ return r.json(); });
}

// ── Toast ──────────────────────────────────────────────────────
function toast(msg, color) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.style.background = color || "#00e676";
  el.style.color = (color === "#ff9800" || color === "#ff1744") ? "#fff" : "#000";
  el.style.display = "block";
  setTimeout(function(){ el.style.display = "none"; }, 3500);
}

// ── Screen nav ─────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(function(s){ s.classList.remove("active"); });
  document.querySelectorAll(".nav button").forEach(function(b){ b.classList.remove("active"); });
  document.getElementById("screen-" + name).classList.add("active");
  var nb = document.getElementById("nav-" + name);
  if (nb) nb.classList.add("active");
  if (name === "orders") loadOrders();
}

// ── Init ───────────────────────────────────────────────────────
window.onload = function() {
  toast("Connecting to Angel One...", "#ff9800");
  api("/health").then(function(h) {
    if (h.status === "ok") {
      return api("/api/login", "POST").then(function(l) {
        if (l.status === true) {
          state.connected = true;
          document.getElementById("liveBadge").textContent = "● LIVE";
          document.getElementById("liveBadge").style.background = "#00e67622";
          document.getElementById("liveBadge").style.color = "#00e676";
          document.getElementById("modeDisplay").textContent = "LIVE";
          document.getElementById("modeDisplay").style.color = "#00e676";
          toast("Angel One LIVE!", "#00e676");
          loadFunds();
        } else {
          toast("Login failed - Demo mode", "#ff9800");
        }
      });
    }
  }).catch(function(){ toast("Demo mode", "#ff9800"); });

  loadExpiries();
  renderChain();
  startTicks();
};

function loadFunds() {
  api("/api/funds").then(function(r) {
    if (r.data && r.data.availablecash) {
      var amt = parseFloat(r.data.availablecash).toLocaleString("en-IN", {maximumFractionDigits:0});
      document.getElementById("fundsDisplay").innerHTML = "Avail: <b style='color:#00e676'>₹" + amt + "</b>";
    }
  }).catch(function(){});
}

function loadExpiries() {
  var fallback = [];
  for (var i = 0; i < 4; i++) {
    var d = new Date(); d.setDate(d.getDate() + i * 7);
    fallback.push(d.toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"2-digit"}));
  }
  api("/api/expiry/" + state.activeIdx).then(function(r) {
    state.expiries = (r.data && r.data.length) ? r.data : fallback;
    renderExpiries();
  }).catch(function(){ state.expiries = fallback; renderExpiries(); });
}

function renderExpiries() {
  var row = document.getElementById("expiryRow");
  row.innerHTML = "";
  state.expiries.forEach(function(e, i) {
    var btn = document.createElement("button");
    btn.className = "expiry-btn" + (i === state.expiry ? " active" : "");
    btn.textContent = e;
    btn.onclick = function(){ state.expiry = i; renderExpiries(); renderChain(); };
    row.appendChild(btn);
  });
}

// ── Index switch ───────────────────────────────────────────────
function setIndex(name) {
  state.activeIdx = name;
  var idx = INDICES[name];
  document.querySelectorAll(".idx-tab").forEach(function(t){ t.className = "idx-tab"; });
  var map = {NIFTY:"active-nifty",BANKNIFTY:"active-banknifty",SENSEX:"active-sensex"};
  var tabs = document.querySelectorAll(".idx-tab");
  var names = ["NIFTY","BANKNIFTY","SENSEX"];
  tabs[names.indexOf(name)].classList.add(map[name]);
  document.getElementById("spotCard").style.border = "1px solid " + idx.color + "44";
  document.getElementById("spotName").textContent = idx.name + " SPOT";
  document.getElementById("spotPrice").style.color = idx.color;
  document.getElementById("lotSizeDisplay").textContent = idx.lotSize;
  updateSpotDisplay();
  loadExpiries();
  renderChain();
}

// ── Qty ────────────────────────────────────────────────────────
function setQty(n) {
  state.qty = n;
  [1,2,3,5,10].forEach(function(v){
    document.getElementById("qty"+v).className = "lot-btn" + (v===n?" active":"");
  });
}

// ── Simulate prices ────────────────────────────────────────────
function simPrice(spot, strike, type) {
  var m = type === "CE" ? spot - strike : strike - spot;
  var p = Math.max(0, m) + spot * 0.003 + (Math.random() * 8 - 4);
  return Math.max(1, p).toFixed(2);
}

function getStrikes(spot, step) {
  var atm = Math.round(spot / step) * step;
  var strikes = [];
  for (var i = -5; i <= 5; i++) strikes.push(atm + i * step);
  return strikes;
}

// ── Chain render ───────────────────────────────────────────────
function renderChain() {
  var idx = INDICES[state.activeIdx];
  var spot = state.spots[state.activeIdx];
  var strikes = getStrikes(spot, idx.step);
  var body = document.getElementById("chainBody");
  body.innerHTML = "";
  strikes.forEach(function(strike) {
    var isATM = Math.abs(strike - spot) < idx.step;
    var ceLtp = simPrice(spot, strike, "CE");
    var peLtp = simPrice(spot, strike, "PE");
    var row = document.createElement("div");
    row.className = "chain-row" + (isATM ? " atm" : "");
    row.innerHTML =
      '<button class="chain-ce" onclick="analyzeOption(' + strike + ',\'CE\',' + ceLtp + ')">' +
        '<div class="ce-price">₹' + ceLtp + '</div>' +
      '</button>' +
      '<div class="strike-col">' +
        '<div class="strike-val' + (isATM?" atm":"") + '">' + strike.toLocaleString("en-IN") + '</div>' +
        (isATM ? '<div class="atm-tag">ATM</div>' : '') +
      '</div>' +
      '<button class="chain-pe" onclick="analyzeOption(' + strike + ',\'PE\',' + peLtp + ')">' +
        '<div class="pe-price">₹' + peLtp + '</div>' +
      '</button>';
    body.appendChild(row);
  });
}

// ── Ticks ──────────────────────────────────────────────────────
function startTicks() {
  setInterval(function() {
    state.spots.NIFTY     = +(state.spots.NIFTY     + (Math.random()-0.495)*12).toFixed(2);
    state.spots.BANKNIFTY = +(state.spots.BANKNIFTY + (Math.random()-0.495)*35).toFixed(2);
    state.spots.SENSEX    = +(state.spots.SENSEX    + (Math.random()-0.495)*45).toFixed(2);
    updateSpotDisplay();
    renderChain();
  }, 3000);
}

function updateSpotDisplay() {
  var spot = state.spots[state.activeIdx];
  document.getElementById("spotPrice").textContent = "₹" + spot.toLocaleString("en-IN",{minimumFractionDigits:2});
}

// ── Analyze ────────────────────────────────────────────────────
function analyzeOption(strike, type, ltp) {
  state.selectedOpt = { strike:strike, type:type, ltp:ltp };
  state.pendingOrder = null;
  showScreen("analysis");

  var idx = INDICES[state.activeIdx];
  var spot = state.spots[state.activeIdx];
  var premium = (ltp * idx.lotSize * state.qty).toFixed(0);
  var color = type === "CE" ? "#00e676" : "#ff1744";

  document.getElementById("analysisHeader").innerHTML =
    '<div style="font-size:11px;color:#5a7a99">' + state.activeIdx + ' · ' + (state.expiries[state.expiry]||"") + '</div>' +
    '<div style="font-size:24px;font-weight:900;color:' + color + '">' + strike.toLocaleString("en-IN") + ' ' + type + '</div>' +
    '<div style="font-size:28px;font-weight:800;margin-top:2px">₹' + ltp + '</div>' +
    '<div class="stat-row">' +
      '<div class="stat"><div class="stat-k">Lots</div><div class="stat-v">' + state.qty + '</div></div>' +
      '<div class="stat"><div class="stat-k">Size</div><div class="stat-v">' + idx.lotSize + '</div></div>' +
      '<div class="stat"><div class="stat-k">Units</div><div class="stat-v">' + (state.qty*idx.lotSize) + '</div></div>' +
      '<div class="stat"><div class="stat-k">Total</div><div class="stat-v" style="color:#f0b429">₹' + Number(premium).toLocaleString("en-IN") + '</div></div>' +
    '</div>';
  document.getElementById("analysisHeader").style = "background:linear-gradient(135deg,#111c30,#0d1424);border:1px solid " + color + "55;border-radius:14px;padding:16px;margin-bottom:14px";

  document.getElementById("analysisText").textContent = "Analyzing market structure...";
  document.getElementById("confirmBox").innerHTML = "";

  var prompt = "Expert Indian options trader. Analyze decisively.\n" +
    "INDEX: " + idx.name + " | SPOT: " + spot.toLocaleString("en-IN") + "\n" +
    "OPTION: " + state.activeIdx + " " + (state.expiries[state.expiry]||"") + " " + strike + " " + type + "\n" +
    "LTP: " + ltp + " | Lots: " + state.qty + " | Lot Size: " + idx.lotSize + " | Total Premium: " + premium + "\n" +
    "Risk: Aggressive\n\n" +
    "Reply exactly:\nSIGNAL: BUY or AVOID\nCONFIDENCE: XX%\nREASONING: 2-3 lines\nTARGET: X\nSTOP LOSS: X\nTIME HORIZON: intraday/1-2 days\nRISK: one line";

  api("/api/ai/analyze", "POST", { prompt: prompt }).then(function(r) {
    var text = r.text || "Analysis unavailable.";
    document.getElementById("analysisText").textContent = text;
    var isBuy = /signal:\s*buy/i.test(text);
    var confMatch = text.match(/confidence:\s*(\d+)%/i);
    var conf = confMatch ? parseInt(confMatch[1]) : 0;
    if (isBuy && conf >= 65) {
      state.pendingOrder = { strike:strike, type:type, ltp:ltp, qty:state.qty, idx:idx, confidence:conf };
      document.getElementById("confirmBox").innerHTML =
        '<div class="confirm-box">' +
          '<div style="font-size:13px;color:#00e676;font-weight:800;margin-bottom:4px">✅ CLAUDE RECOMMENDS: BUY</div>' +
          '<div style="font-size:12px;color:#5a7a99;margin-bottom:12px">Confidence: ' + conf + '% · ' + (state.connected?"Live Angel One":"Demo") + '</div>' +
          '<button class="confirm-btn" onclick="confirmOrder()">✅ CONFIRM & PLACE ' + (state.connected?"LIVE":"DEMO") + ' ORDER</button>' +
          '<button class="skip-btn" onclick="document.getElementById(\'confirmBox\').innerHTML=\'\'">Skip</button>' +
        '</div>';
    } else {
      document.getElementById("confirmBox").innerHTML =
        '<div class="avoid-box">' +
          '<div style="color:#ff1744;font-weight:700">Claude does not recommend this trade</div>' +
          '<div style="font-size:11px;color:#5a7a99;margin-top:4px">Confidence below 65% or AVOID signal</div>' +
        '</div>';
    }
  }).catch(function() {
    document.getElementById("analysisText").textContent = "AI analysis failed. Check connection.";
  });
}

// ── Confirm order ──────────────────────────────────────────────
function confirmOrder() {
  if (!state.pendingOrder) return;
  var po = state.pendingOrder;
  document.getElementById("confirmBox").innerHTML = '<div style="background:#111c30;border:1px solid #1a2a45;border-radius:12px;padding:16px;text-align:center;color:#5a7a99">⏳ Placing order...</div>';

  var doPlace = state.connected
    ? api("/api/order/place", "POST", {
        tradingsymbol: state.activeIdx + (state.expiries[state.expiry]||"") + po.strike + po.type,
        symboltoken: "",
        transactiontype: "BUY",
        quantity: String(po.qty * po.idx.lotSize)
      })
    : Promise.resolve({ status: true, data: { orderid: "DEMO" + Date.now() } });

  doPlace.then(function(result) {
    if (result.status || (result.data && result.data.orderid)) {
      var trade = {
        id: (result.data && result.data.orderid) || Date.now(),
        index: state.activeIdx, strike: po.strike, type: po.type,
        ltp: po.ltp, qty: po.qty, units: po.qty * po.idx.lotSize,
        premium: (po.ltp * po.idx.lotSize * po.qty).toFixed(0),
        time: new Date().toLocaleTimeString("en-IN"),
        status: state.connected ? "LIVE" : "DEMO",
        confidence: po.confidence
      };
      state.trades.unshift(trade);
      document.getElementById("confirmBox").innerHTML = '<div style="background:#00e67622;border:1px solid #00e676;border-radius:12px;padding:16px;text-align:center;color:#00e676;font-weight:800">✅ Order Placed!</div>';
      toast((state.connected?"Live":"Demo") + " order! " + state.activeIdx + " " + po.strike + po.type, "#00e676");
      setTimeout(function(){ showScreen("dashboard"); }, 2000);
    } else {
      document.getElementById("confirmBox").innerHTML = '<div style="background:#ff174422;border:1px solid #ff1744;border-radius:12px;padding:16px;text-align:center;color:#ff1744;font-weight:700">❌ Order Failed</div>';
      toast("Order failed", "#ff1744");
    }
  }).catch(function(e) {
    document.getElementById("confirmBox").innerHTML = '<div style="background:#ff174422;border:1px solid #ff1744;border-radius:12px;padding:16px;text-align:center;color:#ff1744;font-weight:700">❌ Error: ' + e.message + '</div>';
  });
}

// ── Auto Scan ──────────────────────────────────────────────────
function runScan() {
  showScreen("scan");
  document.getElementById("scanBody").innerHTML = '<div style="background:#111c30;border:1px solid #1a2a45;border-radius:14px;padding:32px;text-align:center"><div style="font-size:28px;margin-bottom:10px">🔍</div><div style="color:#b388ff;font-weight:700">Scanning all 3 indices...</div></div>';

  var candidates = [];
  Object.keys(INDICES).forEach(function(key) {
    var idx = INDICES[key];
    var spot = state.spots[key];
    var atm = Math.round(spot / idx.step) * idx.step;
    ["CE","PE"].forEach(function(type) {
      [-1,0,1].forEach(function(o) {
        var strike = atm + o * idx.step;
        candidates.push(key + " " + strike + type + " LTP " + simPrice(spot,strike,type));
      });
    });
  });

  var prompt = "Expert Indian options trader. Pick TOP 3 trades right now.\n" +
    "NIFTY: " + state.spots.NIFTY + "\nBANKNIFTY: " + state.spots.BANKNIFTY + "\nSENSEX: " + state.spots.SENSEX + "\n" +
    "Candidates:\n" + candidates.map(function(c,i){return (i+1)+". "+c;}).join("\n") + "\n" +
    'Reply ONLY valid JSON no markdown:\n{"picks":[{"rank":1,"index":"NIFTY","strike":22500,"type":"CE","ltp":"145","confidence":78,"reason":"Strong momentum","target":"215","sl":"90","horizon":"Intraday"},{"rank":2,"index":"BANKNIFTY","strike":49000,"type":"PE","ltp":"320","confidence":71,"reason":"Bearish structure","target":"480","sl":"210","horizon":"1-2 days"},{"rank":3,"index":"SENSEX","strike":74000,"type":"CE","ltp":"180","confidence":67,"reason":"ATM breakout","target":"270","sl":"115","horizon":"Intraday"}]}';

  api("/api/ai/analyze", "POST", { prompt: prompt }).then(function(r) {
    var text = (r.text || "{}").replace(/```json|```/g,"").trim();
    var parsed;
    try { parsed = JSON.parse(text); } catch(e) { parsed = {picks:[]}; }
    renderScanResults(parsed.picks || []);
  }).catch(function() {
    renderScanResults([
      {rank:1,index:"NIFTY",strike:22500,type:"CE",ltp:"145",confidence:72,reason:"Strong ATM call momentum setup",target:"210",sl:"90",horizon:"Intraday"},
      {rank:2,index:"BANKNIFTY",strike:49000,type:"PE",ltp:"318",confidence:68,reason:"Bearish banking index structure",target:"480",sl:"210",horizon:"1-2 days"},
    ]);
  });
}

function renderScanResults(picks) {
  var body = document.getElementById("scanBody");
  if (!picks.length) { body.innerHTML = '<div class="empty-box">No results. Try scanning again.</div>'; return; }
  body.innerHTML = "";
  picks.forEach(function(p) {
    var highConf = p.confidence >= 75;
    var borderColor = highConf ? "#00e676" : "#f0b429";
    var confColor   = highConf ? "#00e676" : "#f0b429";
    var confBg      = highConf ? "#00e67622" : "#f0b42922";
    var div = document.createElement("div");
    div.className = "pick-card";
    div.style.border = "1.5px solid " + borderColor + "55";
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
        '<div>' +
          '<div style="font-weight:900;font-size:16px">#' + p.rank + ' ' + p.index + ' ' + p.strike + ' ' + p.type + '</div>' +
          '<div style="font-size:11px;color:#5a7a99">LTP ₹' + p.ltp + ' · ' + p.horizon + '</div>' +
        '</div>' +
        '<div style="background:' + confBg + ';border:1px solid ' + confColor + ';border-radius:20px;padding:4px 10px;font-size:12px;font-weight:800;color:' + confColor + '">' + p.confidence + '%</div>' +
      '</div>' +
      '<div style="font-size:12px;color:#e8f4fd;line-height:1.5;margin-bottom:10px">' + p.reason + '</div>' +
      '<div class="pick-tg">' +
        '<div class="tg-box" style="background:#00e67622"><div class="tg-k">TARGET</div><div style="font-size:14px;font-weight:800;color:#00e676">₹' + p.target + '</div></div>' +
        '<div class="tg-box" style="background:#ff174422"><div class="tg-k">STOP LOSS</div><div style="font-size:14px;font-weight:800;color:#ff1744">₹' + p.sl + '</div></div>' +
      '</div>' +
      '<button class="trade-btn" style="background:' + confColor + '" onclick="setIndex(\'' + (p.index in INDICES?p.index:"NIFTY") + '\');analyzeOption(' + p.strike + ',\'' + p.type + '\',' + p.ltp + ')">Analyze & Trade →</button>';
    body.appendChild(div);
  });
}

// ── Orders ─────────────────────────────────────────────────────
function loadOrders() {
  var body = document.getElementById("ordersBody");
  if (!state.trades.length && !state.positions.length) {
    body.innerHTML = '<div class="empty-box"><div style="font-size:28px;margin-bottom:8px">📋</div>No trades yet</div>';
    return;
  }
  body.innerHTML = "";
  state.positions.forEach(function(p) {
    var pnl = parseFloat(p.pnl||0);
    var div = document.createElement("div");
    div.className = "pos-card";
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between">' +
        '<div style="font-weight:700">' + p.tradingsymbol + '</div>' +
        '<div style="color:' + (pnl>=0?"#00e676":"#ff1744") + ';font-weight:800">' + (pnl>=0?"+":"") + "₹" + pnl.toFixed(0) + '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:#5a7a99;margin-top:4px">Qty:' + p.netqty + ' Avg:₹' + p.averageprice + ' LTP:₹' + p.ltp + '</div>';
    body.appendChild(div);
  });
  state.trades.forEach(function(t) {
    var isLive = t.status === "LIVE";
    var div = document.createElement("div");
    div.style = "background:#111c30;border:1px solid " + (isLive?"#00e676":"#1a2a45") + "44;border-radius:14px;padding:14px;margin-bottom:10px";
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-weight:800">' + t.index + ' ' + t.strike + ' ' + t.type + '</div>' +
        '<div style="font-size:10px;background:' + (isLive?"#00e67622":"#f0b42922") + ';color:' + (isLive?"#00e676":"#f0b429") + ';padding:2px 8px;border-radius:20px;font-weight:700">' + t.status + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
        [["Prem","₹"+t.ltp],["Lots",t.qty],["Units",t.units],["Total","₹"+Number(t.premium).toLocaleString("en-IN")],["AI",t.confidence+"%"],["Time",t.time]].map(function(kv){
          return '<div><div style="font-size:9px;color:#5a7a99">'+kv[0]+'</div><div style="font-size:12px;font-weight:700">'+kv[1]+'</div></div>';
        }).join("") +
      '</div>';
    body.appendChild(div);
  });
}

// Load positions on init
api("/api/positions").then(function(r){ if(r.data) state.positions = r.data; }).catch(function(){});
</script>
</body>
</html>`);
});

app.listen(CONFIG.PORT, "0.0.0.0", async () => {
  console.log("Server running on port " + CONFIG.PORT);
  await ensureSession();
});
