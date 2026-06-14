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

function aH(auth) {
  const h = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": CONFIG.API_KEY,
  };
  if (auth && SESSION.jwtToken) h["Authorization"] = "Bearer " + SESSION.jwtToken;
  return h;
}

app.get("/health", function(req, res) {
  res.json({ status: "ok", session: !!SESSION.jwtToken });
});

app.post("/api/login", async function(req, res) {
  const totp = req.body.totp;
  if (!totp) return res.status(400).json({ status: false, message: "TOTP required" });
  try {
    const r = await axios.post(
      BASE + "/rest/auth/angelbroking/user/v1/loginByPassword",
      { clientcode: CONFIG.CLIENT_ID, password: CONFIG.PIN, totp: totp },
      { headers: aH(false) }
    );
    if (r.data && r.data.status && r.data.data && r.data.data.jwtToken) {
      SESSION.jwtToken  = r.data.data.jwtToken;
      SESSION.expiresAt = Date.now() + 8 * 3600 * 1000;
      console.log("Angel One logged in OK");
      res.json({ status: true });
    } else {
      res.json({ status: false, message: r.data && r.data.message || "Login failed" });
    }
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

app.get("/api/funds", async function(req, res) {
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/user/v1/getRMS", { headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/expiry/:name", async function(req, res) {
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/market/v1/expiry",
      { params: { name: req.params.name, expirytype: "NEAR" }, headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/order/place", async function(req, res) {
  try {
    const body = Object.assign({
      variety: "NORMAL", ordertype: "MARKET", producttype: "CARRYFORWARD",
      duration: "DAY", exchange: "NFO", price: "0", squareoff: "0", stoploss: "0"
    }, req.body);
    const r = await axios.post(BASE + "/rest/secure/angelbroking/order/v1/placeOrder", body, { headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ai/analyze", async function(req, res) {
  try {
    const r = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: req.body.prompt }]
    }, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      }
    });
    res.json({ text: r.data.content && r.data.content[0] && r.data.content[0].text || "" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", function(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Options AI</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #070b14; color: #e8f4fd; font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; }
  button { font-family: inherit; }

  /* Header */
  .hdr { background: #0d1424; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1a2a45; position: sticky; top: 0; z-index: 99; }
  .logo { color: #00d4ff; font-size: 16px; font-weight: 900; }
  .sub { color: #5a7a99; font-size: 10px; }
  #statusBadge { font-size: 10px; padding: 4px 10px; border-radius: 20px; font-weight: 700; background: #f0b42922; color: #f0b429; }

  /* Login screen */
  #loginScreen { padding: 20px 16px; }
  .login-card { background: #111c30; border: 1px solid #f0b429; border-radius: 16px; padding: 20px; }
  .login-title { color: #f0b429; font-size: 15px; font-weight: 800; margin-bottom: 6px; }
  .login-sub { color: #5a7a99; font-size: 12px; margin-bottom: 16px; }
  #totpInput { width: 100%; padding: 16px; background: #0d1424; border: 2px solid #1a2a45; border-radius: 12px; color: #e8f4fd; font-size: 28px; text-align: center; letter-spacing: 8px; margin-bottom: 12px; display: block; }
  #totpInput:focus { border-color: #00d4ff; outline: none; }
  #loginBtn { width: 100%; padding: 16px; background: #00d4ff; border: none; border-radius: 12px; color: #000; font-size: 16px; font-weight: 900; cursor: pointer; }

  /* Main app */
  #mainApp { display: none; }
  .content { padding: 16px; padding-bottom: 80px; }

  /* Index tabs */
  .idx-row { display: flex; gap: 8px; margin-bottom: 14px; }
  .idx-btn { flex: 1; padding: 10px 4px; border-radius: 10px; border: 1.5px solid #1a2a45; background: #111c30; color: #5a7a99; font-weight: 800; font-size: 12px; cursor: pointer; }
  .idx-btn.active { border-color: var(--c); background: var(--cb); color: var(--c); }

  /* Spot card */
  .spot-card { border-radius: 14px; padding: 16px; margin-bottom: 14px; border: 1px solid #1a2a45; background: linear-gradient(135deg, #111c30, #0d1424); }
  .spot-name { font-size: 11px; color: #5a7a99; margin-bottom: 4px; }
  .spot-price { font-size: 32px; font-weight: 900; letter-spacing: -1px; }
  .spot-meta { display: flex; gap: 16px; margin-top: 8px; font-size: 11px; color: #5a7a99; }

  /* Lots */
  .lots-row { display: flex; align-items: center; gap: 8px; background: #111c30; border: 1px solid #1a2a45; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; }
  .lot-btn { padding: 6px 14px; border-radius: 8px; border: 1px solid #1a2a45; background: transparent; color: #5a7a99; font-weight: 700; font-size: 14px; cursor: pointer; }
  .lot-btn.active { border-color: #00d4ff; background: #00d4ff22; color: #00d4ff; }

  /* Expiry */
  .exp-row { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 14px; padding-bottom: 4px; }
  .exp-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid #1a2a45; background: transparent; color: #5a7a99; font-size: 11px; font-weight: 600; white-space: nowrap; cursor: pointer; }
  .exp-btn.active { border-color: #f0b429; background: #f0b42922; color: #f0b429; }

  /* Scan button */
  .scan-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #b388ff, #7c3aed); border: none; border-radius: 12px; color: #fff; font-size: 15px; font-weight: 800; cursor: pointer; margin-bottom: 14px; }

  /* Chain */
  .chain { background: #111c30; border: 1px solid #1a2a45; border-radius: 14px; overflow: hidden; margin-bottom: 14px; }
  .chain-head { display: flex; background: #0d1424; padding: 8px 10px; border-bottom: 1px solid #1a2a45; font-size: 11px; font-weight: 700; }
  .chain-row { display: flex; border-bottom: 1px solid #0d1424; }
  .chain-row.atm { background: #00d4ff11; }
  .chain-ce, .chain-pe { flex: 1; padding: 10px 10px; border: none; background: transparent; cursor: pointer; }
  .chain-ce { text-align: left; }
  .chain-pe { text-align: right; }
  .chain-ce:active, .chain-pe:active { background: #ffffff11; }
  .ce-p { color: #00e676; font-weight: 700; font-size: 14px; }
  .pe-p { color: #ff1744; font-weight: 700; font-size: 14px; }
  .strike-col { width: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .strike-v { font-size: 12px; font-weight: 600; }
  .atm-tag { font-size: 8px; color: #00d4ff; font-weight: 800; }

  /* Analysis screen */
  #analysisScreen { display: none; padding: 16px; padding-bottom: 80px; }
  .back-btn { background: transparent; border: none; color: #5a7a99; font-size: 15px; padding: 0; cursor: pointer; margin-bottom: 16px; display: block; }
  .opt-header { border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .opt-name { font-size: 11px; color: #5a7a99; }
  .opt-strike { font-size: 26px; font-weight: 900; }
  .opt-ltp { font-size: 28px; font-weight: 800; margin-top: 2px; }
  .opt-stats { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .stat { background: #ffffff11; border-radius: 8px; padding: 6px 10px; }
  .stat-k { font-size: 9px; color: #5a7a99; }
  .stat-v { font-size: 13px; font-weight: 700; }
  .ai-box { background: #111c30; border: 1px solid #1a2a45; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .ai-label { font-size: 11px; color: #b388ff; font-weight: 700; margin-bottom: 10px; }
  .ai-text { font-size: 13px; line-height: 1.8; white-space: pre-wrap; }
  .confirm-box { background: #00e67222; border: 2px solid #00e676; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .confirm-title { color: #00e676; font-size: 14px; font-weight: 800; margin-bottom: 4px; }
  .confirm-sub { color: #5a7a99; font-size: 12px; margin-bottom: 14px; }
  .confirm-btn { width: 100%; padding: 16px; background: #00e676; border: none; border-radius: 12px; color: #000; font-size: 15px; font-weight: 900; cursor: pointer; margin-bottom: 8px; }
  .skip-btn { width: 100%; padding: 12px; background: transparent; border: 1px solid #1a2a45; border-radius: 12px; color: #5a7a99; font-size: 13px; font-weight: 600; cursor: pointer; }
  .avoid-box { background: #ff174422; border: 1px solid #ff174444; border-radius: 12px; padding: 16px; text-align: center; }

  /* Scan screen */
  #scanScreen { display: none; padding: 16px; padding-bottom: 80px; }
  .pick { background: #111c30; border-radius: 14px; padding: 16px; margin-bottom: 12px; }
  .pick-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .pick-name { font-size: 16px; font-weight: 900; }
  .pick-sub { font-size: 11px; color: #5a7a99; margin-top: 2px; }
  .conf-badge { font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 20px; }
  .pick-reason { font-size: 12px; line-height: 1.6; margin-bottom: 12px; }
  .pick-tg { display: flex; gap: 8px; margin-bottom: 12px; }
  .tg { flex: 1; border-radius: 10px; padding: 8px 12px; text-align: center; }
  .tg-k { font-size: 9px; color: #5a7a99; margin-bottom: 2px; }
  .tg-v { font-size: 15px; font-weight: 800; }
  .pick-btn { width: 100%; padding: 12px; border: none; border-radius: 10px; color: #000; font-size: 14px; font-weight: 800; cursor: pointer; }

  /* Orders screen */
  #ordersScreen { display: none; padding: 16px; padding-bottom: 80px; }
  .order-card { background: #111c30; border-radius: 14px; padding: 14px; margin-bottom: 10px; border: 1px solid #1a2a45; }
  .order-head { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .order-name { font-weight: 800; font-size: 15px; }
  .order-status { font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 700; }
  .order-details { display: flex; gap: 14px; flex-wrap: wrap; }
  .od { }
  .od-k { font-size: 9px; color: #5a7a99; }
  .od-v { font-size: 12px; font-weight: 700; }

  /* Nav */
  .nav { display: flex; background: #0d1424; border-top: 1px solid #1a2a45; position: fixed; bottom: 0; left: 0; right: 0; max-width: 480px; margin: 0 auto; z-index: 99; }
  .nav-btn { flex: 1; padding: 10px 4px; background: transparent; border: none; color: #5a7a99; font-size: 10px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .nav-btn.active { color: #00d4ff; font-weight: 800; }
  .nav-icon { font-size: 22px; }

  /* Toast */
  #toast { position: fixed; top: 70px; left: 50%; transform: translateX(-50%); padding: 10px 20px; border-radius: 20px; font-size: 13px; font-weight: 700; z-index: 999; display: none; white-space: nowrap; }

  /* Empty */
  .empty { background: #111c30; border: 1px solid #1a2a45; border-radius: 14px; padding: 40px 20px; text-align: center; color: #5a7a99; }
  .hint { font-size: 11px; color: #5a7a99; text-align: center; padding: 8px 0; }
</style>
</head>
<body>

<div class="hdr">
  <div>
    <div class="logo">&#9889; Options AI</div>
    <div class="sub">Angel One &middot; Claude AI</div>
  </div>
  <div id="statusBadge">&#9675; DEMO</div>
</div>

<div id="toast"></div>

<!-- LOGIN SCREEN -->
<div id="loginScreen">
  <br>
  <div class="login-card">
    <div class="login-title">&#128274; Connect Angel One</div>
    <div class="login-sub">Open Google Authenticator and enter the 6-digit code for Angel One</div>
    <input type="tel" id="totpInput" maxlength="6" placeholder="000000" autocomplete="one-time-code">
    <button id="loginBtn" onclick="doLogin()">Connect to Angel One</button>
    <br><br>
    <div style="font-size:11px;color:#5a7a99;text-align:center">Or continue in demo mode without connecting</div>
    <br>
    <button onclick="skipLogin()" style="width:100%;padding:12px;background:transparent;border:1px solid #1a2a45;border-radius:12px;color:#5a7a99;font-size:13px;cursor:pointer">Continue in Demo Mode</button>
  </div>
</div>

<!-- MAIN APP -->
<div id="mainApp">
  <!-- DASHBOARD -->
  <div id="dashScreen" class="content">
    <div class="idx-row">
      <button class="idx-btn active" id="btn-NIFTY" style="--c:#00d4ff;--cb:#00d4ff22" onclick="setIdx('NIFTY')">NIFTY</button>
      <button class="idx-btn" id="btn-BANKNIFTY" style="--c:#f0b429;--cb:#f0b42922" onclick="setIdx('BANKNIFTY')">BNIFTY</button>
      <button class="idx-btn" id="btn-SENSEX" style="--c:#b388ff;--cb:#b388ff22" onclick="setIdx('SENSEX')">SENSEX</button>
    </div>
    <div class="spot-card" id="spotCard">
      <div class="spot-name" id="spotName">NIFTY 50 SPOT</div>
      <div class="spot-price" id="spotPrice" style="color:#00d4ff">22,485.00</div>
      <div class="spot-meta">
        <span>Lot: <b id="lotSize" style="color:#e8f4fd">50</b></span>
        <span>Mode: <b id="modeText" style="color:#f0b429">DEMO</b></span>
        <span id="fundsText"></span>
      </div>
    </div>
    <div class="lots-row">
      <span style="color:#5a7a99;font-size:12px">Lots:</span>
      <button class="lot-btn active" id="lot-1" onclick="setLot(1)">1</button>
      <button class="lot-btn" id="lot-2" onclick="setLot(2)">2</button>
      <button class="lot-btn" id="lot-3" onclick="setLot(3)">3</button>
      <button class="lot-btn" id="lot-5" onclick="setLot(5)">5</button>
      <button class="lot-btn" id="lot-10" onclick="setLot(10)">10</button>
    </div>
    <div class="exp-row" id="expRow"></div>
    <button class="scan-btn" onclick="showScan()">&#129302; AI Auto-Scan All 3 Indices</button>
    <div class="chain" id="chainWrap">
      <div class="chain-head">
        <div style="flex:1;color:#00e676">CALLS</div>
        <div style="width:80px;text-align:center;color:#5a7a99">STRIKE</div>
        <div style="flex:1;text-align:right;color:#ff1744">PUTS</div>
      </div>
      <div id="chainBody"></div>
    </div>
    <div class="hint">Tap any price to get Claude AI analysis</div>
  </div>

  <!-- ANALYSIS SCREEN -->
  <div id="analysisScreen">
    <button class="back-btn" onclick="showDash()">&#8592; Back to Chain</button>
    <div class="opt-header" id="optHeader"></div>
    <div class="ai-box">
      <div class="ai-label">&#129302; CLAUDE AI ANALYSIS</div>
      <div class="ai-text" id="aiText">Analyzing market structure...</div>
    </div>
    <div id="actionBox"></div>
  </div>

  <!-- SCAN SCREEN -->
  <div id="scanScreen">
    <button class="back-btn" onclick="showDash()">&#8592; Back to Chain</button>
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">&#129302; AI Auto-Scan</div>
    <div style="font-size:12px;color:#5a7a99;margin-bottom:16px">Claude finds best options across all 3 indices</div>
    <div id="scanBody"></div>
  </div>

  <!-- ORDERS SCREEN -->
  <div id="ordersScreen">
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">&#128203; Orders</div>
    <div style="font-size:12px;color:#5a7a99;margin-bottom:16px">AI-confirmed trades this session</div>
    <div id="ordersBody"></div>
  </div>
</div>

<!-- NAV -->
<div class="nav" id="bottomNav" style="display:none">
  <button class="nav-btn active" id="nav-dash" onclick="showDash()">
    <span class="nav-icon">&#128202;</span>Chain
  </button>
  <button class="nav-btn" id="nav-scan" onclick="showScan()">
    <span class="nav-icon">&#129302;</span>AI Scan
  </button>
  <button class="nav-btn" id="nav-orders" onclick="showOrders()">
    <span class="nav-icon">&#128203;</span>Orders
  </button>
</div>

<script>
var connected = false;
var currentIdx = "NIFTY";
var currentLot = 1;
var currentExp = 0;
var expiries = [];
var trades = [];
var pendingOrder = null;

var INDICES = {
  NIFTY:     { name: "NIFTY 50",   lot: 50,  color: "#00d4ff", step: 50  },
  BANKNIFTY: { name: "BANK NIFTY", lot: 15,  color: "#f0b429", step: 100 },
  SENSEX:    { name: "SENSEX",     lot: 10,  color: "#b388ff", step: 100 }
};

var spots = { NIFTY: 22485, BANKNIFTY: 48920, SENSEX: 73842 };

function toast(msg, col) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.style.background = col || "#00e676";
  t.style.color = (col === "#ff9800" || col === "#ff1744") ? "#fff" : "#000";
  t.style.display = "block";
  setTimeout(function() { t.style.display = "none"; }, 3500);
}

function api(path, method, body) {
  var opts = { method: method || "GET", headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(path, opts).then(function(r) { return r.json(); });
}

function doLogin() {
  var code = document.getElementById("totpInput").value.trim();
  if (code.length !== 6) { toast("Enter 6-digit code", "#ff1744"); return; }
  document.getElementById("loginBtn").textContent = "Connecting...";
  document.getElementById("loginBtn").disabled = true;
  api("/api/login", "POST", { totp: code }).then(function(r) {
    if (r.status) {
      connected = true;
      document.getElementById("statusBadge").textContent = "● LIVE";
      document.getElementById("statusBadge").style.background = "#00e67222";
      document.getElementById("statusBadge").style.color = "#00e676";
      document.getElementById("modeText").textContent = "LIVE";
      document.getElementById("modeText").style.color = "#00e676";
      toast("Angel One Connected! LIVE mode", "#00e676");
      api("/api/funds").then(function(r) {
        if (r.data && r.data.availablecash) {
          document.getElementById("fundsText").innerHTML = "Avail: <b style='color:#00e676'>Rs." + parseFloat(r.data.availablecash).toLocaleString("en-IN", {maximumFractionDigits:0}) + "</b>";
        }
      }).catch(function() {});
      showApp();
    } else {
      toast("Failed: " + (r.message || "Check code"), "#ff1744");
      document.getElementById("loginBtn").textContent = "Connect to Angel One";
      document.getElementById("loginBtn").disabled = false;
    }
  }).catch(function(e) {
    toast("Error: " + e.message, "#ff1744");
    document.getElementById("loginBtn").textContent = "Connect to Angel One";
    document.getElementById("loginBtn").disabled = false;
  });
}

function skipLogin() {
  showApp();
}

function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("mainApp").style.display = "block";
  document.getElementById("bottomNav").style.display = "flex";
  loadExpiries();
  renderChain();
  startTicks();
}

function showDash() {
  document.getElementById("dashScreen").style.display = "block";
  document.getElementById("analysisScreen").style.display = "none";
  document.getElementById("scanScreen").style.display = "none";
  document.getElementById("ordersScreen").style.display = "none";
  setNavActive("nav-dash");
}

function showScan() {
  document.getElementById("dashScreen").style.display = "none";
  document.getElementById("analysisScreen").style.display = "none";
  document.getElementById("scanScreen").style.display = "block";
  document.getElementById("ordersScreen").style.display = "none";
  setNavActive("nav-scan");
  runScan();
}

function showOrders() {
  document.getElementById("dashScreen").style.display = "none";
  document.getElementById("analysisScreen").style.display = "none";
  document.getElementById("scanScreen").style.display = "none";
  document.getElementById("ordersScreen").style.display = "block";
  setNavActive("nav-orders");
  renderOrders();
}

function showAnalysis() {
  document.getElementById("dashScreen").style.display = "none";
  document.getElementById("analysisScreen").style.display = "block";
  document.getElementById("scanScreen").style.display = "none";
  document.getElementById("ordersScreen").style.display = "none";
  setNavActive("");
}

function setNavActive(id) {
  document.querySelectorAll(".nav-btn").forEach(function(b) { b.classList.remove("active"); });
  if (id) document.getElementById(id).classList.add("active");
}

function setIdx(name) {
  currentIdx = name;
  var idx = INDICES[name];
  document.querySelectorAll(".idx-btn").forEach(function(b) { b.classList.remove("active"); });
  document.getElementById("btn-" + name).classList.add("active");
  document.getElementById("spotCard").style.borderColor = idx.color + "44";
  document.getElementById("spotName").textContent = idx.name + " SPOT";
  document.getElementById("spotPrice").style.color = idx.color;
  document.getElementById("lotSize").textContent = idx.lot;
  updateSpotDisplay();
  loadExpiries();
  renderChain();
}

function setLot(n) {
  currentLot = n;
  [1,2,3,5,10].forEach(function(v) {
    var b = document.getElementById("lot-" + v);
    if (b) b.className = "lot-btn" + (v === n ? " active" : "");
  });
}

function simPrice(spot, strike, type) {
  var m = type === "CE" ? spot - strike : strike - spot;
  return Math.max(1, Math.max(0, m) + spot * 0.003 + (Math.random() * 8 - 4)).toFixed(2);
}

function getStrikes(spot, step) {
  var atm = Math.round(spot / step) * step;
  var out = [];
  for (var i = -5; i <= 5; i++) out.push(atm + i * step);
  return out;
}

function renderChain() {
  var idx = INDICES[currentIdx];
  var spot = spots[currentIdx];
  var st = getStrikes(spot, idx.step);
  var body = document.getElementById("chainBody");
  body.innerHTML = "";
  st.forEach(function(strike) {
    var isAtm = Math.abs(strike - spot) < idx.step;
    var ce = simPrice(spot, strike, "CE");
    var pe = simPrice(spot, strike, "PE");
    var row = document.createElement("div");
    row.className = "chain-row" + (isAtm ? " atm" : "");

    var ceBtn = document.createElement("button");
    ceBtn.className = "chain-ce";
    ceBtn.innerHTML = "<div class='ce-p'>" + ce + "</div>";
    ceBtn.setAttribute("data-strike", strike);
    ceBtn.setAttribute("data-type", "CE");
    ceBtn.setAttribute("data-ltp", ce);
    ceBtn.onclick = function() { analyze(strike, "CE", parseFloat(ce)); };

    var sCol = document.createElement("div");
    sCol.className = "strike-col";
    sCol.innerHTML = "<div class='strike-v" + (isAtm ? " atm-tag" : "") + "'>" + strike.toLocaleString("en-IN") + "</div>" + (isAtm ? "<div class='atm-tag'>ATM</div>" : "");

    var peBtn = document.createElement("button");
    peBtn.className = "chain-pe";
    peBtn.innerHTML = "<div class='pe-p'>" + pe + "</div>";
    peBtn.setAttribute("data-strike", strike);
    peBtn.setAttribute("data-type", "PE");
    peBtn.setAttribute("data-ltp", pe);
    peBtn.onclick = function() { analyze(strike, "PE", parseFloat(pe)); };

    row.appendChild(ceBtn);
    row.appendChild(sCol);
    row.appendChild(peBtn);
    body.appendChild(row);
  });
}

function updateSpotDisplay() {
  document.getElementById("spotPrice").textContent = "Rs." + spots[currentIdx].toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function loadExpiries() {
  api("/api/expiry/" + currentIdx).then(function(r) {
    expiries = (r.data && r.data.length) ? r.data : defExpiries();
    renderExpiries();
  }).catch(function() {
    expiries = defExpiries();
    renderExpiries();
  });
}

function defExpiries() {
  var out = [];
  for (var i = 0; i < 4; i++) {
    var d = new Date();
    d.setDate(d.getDate() + i * 7);
    out.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }));
  }
  return out;
}

function renderExpiries() {
  var row = document.getElementById("expRow");
  row.innerHTML = "";
  expiries.forEach(function(e, i) {
    var btn = document.createElement("button");
    btn.className = "exp-btn" + (i === currentExp ? " active" : "");
    btn.textContent = e;
    btn.onclick = function() {
      currentExp = i;
      renderExpiries();
      renderChain();
    };
    row.appendChild(btn);
  });
}

function startTicks() {
  setInterval(function() {
    spots.NIFTY     = +(spots.NIFTY     + (Math.random() - 0.495) * 12).toFixed(2);
    spots.BANKNIFTY = +(spots.BANKNIFTY + (Math.random() - 0.495) * 35).toFixed(2);
    spots.SENSEX    = +(spots.SENSEX    + (Math.random() - 0.495) * 45).toFixed(2);
    updateSpotDisplay();
    renderChain();
  }, 3000);
}

function analyze(strike, type, ltp) {
  showAnalysis();
  pendingOrder = null;
  var idx = INDICES[currentIdx];
  var spot = spots[currentIdx];
  var prem = (ltp * idx.lot * currentLot).toFixed(0);
  var col = type === "CE" ? "#00e676" : "#ff1744";

  document.getElementById("optHeader").style.cssText = "background:linear-gradient(135deg,#111c30,#0d1424);border:1px solid " + col + "44;border-radius:14px;padding:16px;margin-bottom:14px";
  document.getElementById("optHeader").innerHTML =
    "<div class='opt-name'>" + currentIdx + " &middot; " + (expiries[currentExp] || "") + "</div>" +
    "<div class='opt-strike' style='color:" + col + "'>" + strike.toLocaleString("en-IN") + " " + type + "</div>" +
    "<div class='opt-ltp'>Rs." + ltp + "</div>" +
    "<div class='opt-stats'>" +
      "<div class='stat'><div class='stat-k'>Lots</div><div class='stat-v'>" + currentLot + "</div></div>" +
      "<div class='stat'><div class='stat-k'>Size</div><div class='stat-v'>" + idx.lot + "</div></div>" +
      "<div class='stat'><div class='stat-k'>Units</div><div class='stat-v'>" + (currentLot * idx.lot) + "</div></div>" +
      "<div class='stat'><div class='stat-k'>Total</div><div class='stat-v' style='color:#f0b429'>Rs." + Number(prem).toLocaleString("en-IN") + "</div></div>" +
    "</div>";

  document.getElementById("aiText").textContent = "Analyzing market structure, IV and momentum...";
  document.getElementById("actionBox").innerHTML = "";

  var prompt = "Expert Indian options trader. Analyze this trade decisively.\n" +
    "INDEX: " + idx.name + " SPOT: Rs." + spot.toLocaleString("en-IN") + "\n" +
    "OPTION: " + currentIdx + " " + (expiries[currentExp] || "") + " " + strike + " " + type + "\n" +
    "LTP: Rs." + ltp + " | Lots: " + currentLot + " | Lot Size: " + idx.lot + " | Total: Rs." + prem + "\n" +
    "Risk Profile: Aggressive\n\n" +
    "Reply exactly:\nSIGNAL: BUY or AVOID\nCONFIDENCE: XX%\nREASONING: 2-3 lines\nTARGET: Rs.X\nSTOP LOSS: Rs.X\nTIME HORIZON: intraday or 1-2 days\nRISK: one line";

  api("/api/ai/analyze", "POST", { prompt: prompt }).then(function(r) {
    var text = r.text || "Analysis unavailable.";
    document.getElementById("aiText").textContent = text;
    var isBuy = /signal:\s*buy/i.test(text);
    var cm = text.match(/confidence:\s*(\d+)%/i);
    var conf = cm ? parseInt(cm[1]) : 0;
    if (isBuy && conf >= 65) {
      pendingOrder = { strike: strike, type: type, ltp: ltp, lot: currentLot, idx: idx, conf: conf };
      document.getElementById("actionBox").innerHTML =
        "<div class='confirm-box'>" +
          "<div class='confirm-title'>&#9989; CLAUDE RECOMMENDS: BUY</div>" +
          "<div class='confirm-sub'>Confidence: " + conf + "% &middot; " + (connected ? "Live Angel One order" : "Demo order") + "</div>" +
          "<button class='confirm-btn' onclick='placeOrder()'>CONFIRM &amp; PLACE " + (connected ? "LIVE" : "DEMO") + " ORDER</button>" +
          "<button class='skip-btn' onclick=\"document.getElementById('actionBox').innerHTML=''\">Skip this trade</button>" +
        "</div>";
    } else {
      document.getElementById("actionBox").innerHTML =
        "<div class='avoid-box'>" +
          "<div style='color:#ff1744;font-weight:800;font-size:14px'>&#10060; CLAUDE: AVOID</div>" +
          "<div style='color:#5a7a99;font-size:12px;margin-top:6px'>Confidence below 65% or signal is AVOID</div>" +
        "</div>";
    }
  }).catch(function() {
    document.getElementById("aiText").textContent = "AI analysis failed. Check Anthropic API key in Railway Variables.";
  });
}

function placeOrder() {
  if (!pendingOrder) return;
  document.getElementById("actionBox").innerHTML = "<div style='background:#111c30;border:1px solid #1a2a45;border-radius:12px;padding:20px;text-align:center;color:#5a7a99;font-size:14px'>&#9203; Placing order...</div>";
  var po = pendingOrder;
  var doPlace = connected
    ? api("/api/order/place", "POST", {
        tradingsymbol: currentIdx + (expiries[currentExp] || "") + po.strike + po.type,
        symboltoken: "",
        transactiontype: "BUY",
        quantity: String(po.lot * po.idx.lot)
      })
    : Promise.resolve({ status: true, data: { orderid: "DEMO" + Date.now() } });

  doPlace.then(function(result) {
    if (result.status || (result.data && result.data.orderid)) {
      trades.unshift({
        id: (result.data && result.data.orderid) || Date.now(),
        index: currentIdx, strike: po.strike, type: po.type,
        ltp: po.ltp, lot: po.lot, units: po.lot * po.idx.lot,
        premium: (po.ltp * po.idx.lot * po.lot).toFixed(0),
        time: new Date().toLocaleTimeString("en-IN"),
        status: connected ? "LIVE" : "DEMO",
        conf: po.conf
      });
      document.getElementById("actionBox").innerHTML = "<div style='background:#00e67222;border:2px solid #00e676;border-radius:12px;padding:20px;text-align:center;color:#00e676;font-size:16px;font-weight:900'>&#9989; Order Placed!</div>";
      toast((connected ? "Live" : "Demo") + " order! " + currentIdx + " " + po.strike + po.type, "#00e676");
      setTimeout(function() { showDash(); }, 2000);
    } else {
      document.getElementById("actionBox").innerHTML = "<div style='background:#ff174422;border:1px solid #ff1744;border-radius:12px;padding:20px;text-align:center;color:#ff1744;font-weight:700'>&#10060; Order Failed: " + (result.message || "Unknown") + "</div>";
    }
  }).catch(function(e) {
    document.getElementById("actionBox").innerHTML = "<div style='background:#ff174422;border:1px solid #ff1744;border-radius:12px;padding:20px;text-align:center;color:#ff1744;font-weight:700'>&#10060; Error: " + e.message + "</div>";
  });
}

function runScan() {
  document.getElementById("scanBody").innerHTML = "<div class='empty'><div style='font-size:32px;margin-bottom:12px'>&#128269;</div><div style='color:#b388ff;font-weight:700;font-size:14px'>Claude scanning all 3 indices...</div></div>";
  var cands = [];
  Object.keys(INDICES).forEach(function(key) {
    var idx = INDICES[key], spot = spots[key], atm = Math.round(spot / idx.step) * idx.step;
    ["CE", "PE"].forEach(function(type) {
      [-1, 0, 1].forEach(function(o) {
        var st = atm + o * idx.step;
        cands.push(key + " " + st + type + " LTP " + simPrice(spot, st, type));
      });
    });
  });

  var prompt = "Expert Indian options trader. Pick TOP 3 best trades right now.\n" +
    "NIFTY: " + spots.NIFTY + "\nBANKNIFTY: " + spots.BANKNIFTY + "\nSENSEX: " + spots.SENSEX + "\n" +
    "Candidates:\n" + cands.map(function(c, i) { return (i+1) + ". " + c; }).join("\n") + "\n" +
    'Reply ONLY valid JSON:\n{"picks":[{"rank":1,"index":"NIFTY","strike":22500,"type":"CE","ltp":"145","confidence":78,"reason":"Strong momentum at key resistance","target":"215","sl":"90","horizon":"Intraday"},{"rank":2,"index":"BANKNIFTY","strike":49000,"type":"PE","ltp":"320","confidence":71,"reason":"Bearish divergence on 15min","target":"480","sl":"210","horizon":"1-2 days"},{"rank":3,"index":"SENSEX","strike":74000,"type":"CE","ltp":"180","confidence":67,"reason":"ATM breakout setup","target":"270","sl":"115","horizon":"Intraday"}]}';

  api("/api/ai/analyze", "POST", { prompt: prompt }).then(function(r) {
    var text = (r.text || "{}").replace(/CODEBLOCK/g, "").trim();
    var parsed;
    try { parsed = JSON.parse(text); } catch(e) { parsed = { picks: [] }; }
    renderScanResults(parsed.picks || []);
  }).catch(function() {
    renderScanResults([
      { rank:1, index:"NIFTY", strike:22500, type:"CE", ltp:"145", confidence:72, reason:"Strong ATM call momentum setup", target:"210", sl:"90", horizon:"Intraday" },
      { rank:2, index:"BANKNIFTY", strike:49000, type:"PE", ltp:"318", confidence:68, reason:"Bearish banking index structure", target:"480", sl:"210", horizon:"1-2 days" }
    ]);
  });
}

function renderScanResults(picks) {
  var body = document.getElementById("scanBody");
  if (!picks.length) { body.innerHTML = "<div class='empty'>No results. Try again.</div>"; return; }
  body.innerHTML = "";
  picks.forEach(function(p) {
    var hc = p.confidence >= 75;
    var bc = hc ? "#00e676" : "#f0b429";
    var div = document.createElement("div");
    div.className = "pick";
    div.style.border = "1.5px solid " + bc + "55";
    div.innerHTML =
      "<div class='pick-head'>" +
        "<div><div class='pick-name'>#" + p.rank + " " + p.index + " " + p.strike + " " + p.type + "</div>" +
        "<div class='pick-sub'>LTP Rs." + p.ltp + " &middot; " + p.horizon + "</div></div>" +
        "<div class='conf-badge' style='background:" + bc + "22;border:1px solid " + bc + ";color:" + bc + "'>" + p.confidence + "%</div>" +
      "</div>" +
      "<div class='pick-reason'>" + p.reason + "</div>" +
      "<div class='pick-tg'>" +
        "<div class='tg' style='background:#00e67222'><div class='tg-k'>TARGET</div><div class='tg-v' style='color:#00e676'>Rs." + p.target + "</div></div>" +
        "<div class='tg' style='background:#ff174422'><div class='tg-k'>STOP LOSS</div><div class='tg-v' style='color:#ff1744'>Rs." + p.sl + "</div></div>" +
      "</div>" +
      "<button class='pick-btn' style='background:" + bc + "' onclick=\"setIdx('" + (p.index in INDICES ? p.index : "NIFTY") + "');analyze(" + p.strike + ",'" + p.type + "'," + p.ltp + ")\">Analyze &amp; Trade &rarr;</button>";
    body.appendChild(div);
  });
}

function renderOrders() {
  var body = document.getElementById("ordersBody");
  if (!trades.length) {
    body.innerHTML = "<div class='empty'><div style='font-size:32px;margin-bottom:12px'>&#128203;</div>No trades yet this session</div>";
    return;
  }
  body.innerHTML = "";
  trades.forEach(function(t) {
    var live = t.status === "LIVE";
    var div = document.createElement("div");
    div.className = "order-card";
    div.style.borderColor = live ? "#00e67644" : "#1a2a45";
    div.innerHTML =
      "<div class='order-head'>" +
        "<div class='order-name'>" + t.index + " " + t.strike + " " + t.type + "</div>" +
        "<div class='order-status' style='background:" + (live ? "#00e67222" : "#f0b42922") + ";color:" + (live ? "#00e676" : "#f0b429") + "'>" + t.status + "</div>" +
      "</div>" +
      "<div class='order-details'>" +
        "<div class='od'><div class='od-k'>Premium</div><div class='od-v'>Rs." + t.ltp + "</div></div>" +
        "<div class='od'><div class='od-k'>Lots</div><div class='od-v'>" + t.lot + "</div></div>" +
        "<div class='od'><div class='od-k'>Units</div><div class='od-v'>" + t.units + "</div></div>" +
        "<div class='od'><div class='od-k'>Total</div><div class='od-v'>Rs." + Number(t.premium).toLocaleString("en-IN") + "</div></div>" +
        "<div class='od'><div class='od-k'>AI</div><div class='od-v'>" + t.conf + "%</div></div>" +
        "<div class='od'><div class='od-k'>Time</div><div class='od-v'>" + t.time + "</div></div>" +
      "</div>";
    body.appendChild(div);
  });
}
</script>
</body>
</html>`);
});

app.listen(CONFIG.PORT, "0.0.0.0", function() {
  console.log("Server running on port " + CONFIG.PORT);
});
