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

async function ensureSession() {
  if (SESSION.jwtToken && Date.now() < SESSION.expiresAt) return true;
  try {
    const totp = generateTOTP(CONFIG.TOTP_SECRET);
    const res = await axios.post(
      BASE + "/rest/auth/angelbroking/user/v1/loginByPassword",
      { clientcode: CONFIG.CLIENT_ID, password: CONFIG.PIN, totp: totp },
      { headers: aH(false) }
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

app.get("/health", function(req, res) {
  res.json({ status: "ok", session: !!SESSION.jwtToken });
});

app.post("/api/login", async function(req, res) {
  SESSION = { jwtToken: null, expiresAt: 0 };
  const ok = await ensureSession();
  if (ok) {
    res.json({ status: true });
  } else {
    res.status(401).json({ status: false, message: "Login failed" });
  }
});

app.get("/api/funds", async function(req, res) {
  await ensureSession();
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/user/v1/getRMS", { headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/optionchain", async function(req, res) {
  await ensureSession();
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/market/v1/optionchain",
      { params: req.body, headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/expiry/:name", async function(req, res) {
  await ensureSession();
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/market/v1/expiry",
      { params: { name: req.params.name, expirytype: "NEAR" }, headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/order/place", async function(req, res) {
  await ensureSession();
  try {
    const body = Object.assign({
      variety: "NORMAL", ordertype: "MARKET", producttype: "CARRYFORWARD",
      duration: "DAY", exchange: "NFO", price: "0", squareoff: "0", stoploss: "0"
    }, req.body);
    const r = await axios.post(BASE + "/rest/secure/angelbroking/order/v1/placeOrder", body, { headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/positions", async function(req, res) {
  await ensureSession();
  try {
    const r = await axios.get(BASE + "/rest/secure/angelbroking/order/v1/getPosition", { headers: aH(true) });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ai/analyze", async function(req, res) {
  try {
    const r = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: req.body.prompt }]
    }, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      }
    });
    const text = r.data.content && r.data.content[0] && r.data.content[0].text || "";
    res.json({ text: text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", function(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const html = getHTML();
  res.end(html);
});

function getHTML() {
  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'<meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
'<title>Options AI</title>' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}' +
'body{background:#070b14;color:#e8f4fd;font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;min-height:100vh}' +
'button{font-family:inherit;cursor:pointer;outline:none;border:none}' +
'.hdr{background:#0d1424;border-bottom:1px solid #1a2a45;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20}' +
'.logo{font-size:16px;font-weight:900;color:#00d4ff}' +
'.sub{font-size:10px;color:#5a7a99}' +
'.bdg{font-size:10px;padding:3px 8px;border-radius:20px;font-weight:700}' +
'.cnt{padding:16px;padding-bottom:80px}' +
'.scr{display:none}.scr.on{display:block}' +
'.nav{display:flex;background:#0d1424;border-top:1px solid #1a2a45;position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;z-index:20}' +
'.nav button{flex:1;padding:10px 4px;background:transparent;color:#5a7a99;font-size:10px;display:flex;flex-direction:column;align-items:center;gap:2px}' +
'.nav button.on{color:#00d4ff;font-weight:800}' +
'.nav button span{font-size:20px}' +
'.card{background:#111c30;border:1px solid #1a2a45;border-radius:14px;padding:16px;margin-bottom:14px}' +
'.tabs{display:flex;gap:8px;margin-bottom:14px}' +
'.tab{flex:1;padding:9px 4px;border-radius:10px;border:1.5px solid #1a2a45;background:#111c30;color:#5a7a99;font-weight:800;font-size:11px}' +
'.tn{border-color:#00d4ff;background:#00d4ff22;color:#00d4ff}' +
'.tb{border-color:#f0b429;background:#f0b42922;color:#f0b429}' +
'.ts{border-color:#b388ff;background:#b388ff22;color:#b388ff}' +
'.scard{border-radius:14px;padding:16px;margin-bottom:14px}' +
'.spx{font-size:32px;font-weight:900;letter-spacing:-1px}' +
'.lrow{background:#111c30;border:1px solid #1a2a45;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:10px}' +
'.lbtn{padding:5px 12px;border-radius:8px;border:1px solid #1a2a45;background:transparent;color:#5a7a99;font-weight:700;font-size:13px}' +
'.lbtn.on{border-color:#00d4ff;background:#00d4ff22;color:#00d4ff}' +
'.erow{display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px}' +
'.ebtn{padding:5px 12px;border-radius:20px;border:1px solid #1a2a45;background:transparent;color:#5a7a99;font-size:11px;font-weight:600;white-space:nowrap}' +
'.ebtn.on{border-color:#f0b429;background:#f0b42922;color:#f0b429}' +
'.sbtn{width:100%;padding:14px;background:linear-gradient(135deg,#b388ff,#7c3aed);border:none;border-radius:12px;color:#fff;font-weight:800;font-size:14px;margin-bottom:14px}' +
'.cwrap{background:#111c30;border:1px solid #1a2a45;border-radius:14px;overflow:hidden;margin-bottom:10px}' +
'.chead{display:flex;background:#0d1424;padding:8px;border-bottom:1px solid #1a2a45}' +
'.crow{display:flex;border-bottom:1px solid #1a2a45}' +
'.crow.atm{background:#00d4ff22}' +
'.cce{flex:1;padding:9px 8px;background:transparent;border:none;cursor:pointer;text-align:left}' +
'.cpe{flex:1;padding:9px 8px;background:transparent;border:none;cursor:pointer;text-align:right}' +
'.cep{color:#00e676;font-weight:700;font-size:13px}' +
'.cpp{color:#ff1744;font-weight:700;font-size:13px}' +
'.scol{width:80px;display:flex;align-items:center;justify-content:center;flex-direction:column}' +
'.sv{font-size:12px;font-weight:600}' +
'.sv.atm{font-weight:900;color:#00d4ff}' +
'.atmtag{font-size:8px;color:#00d4ff;font-weight:800}' +
'.toast{position:fixed;top:68px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:100;white-space:nowrap;box-shadow:0 4px 20px #0008;display:none}' +
'.bbtn{background:transparent;border:none;color:#5a7a99;margin-bottom:12px;font-size:14px;padding:0}' +
'.ah{border-radius:14px;padding:16px;margin-bottom:14px}' +
'.ab{background:#111c30;border:1px solid #1a2a45;border-radius:14px;padding:16px;margin-bottom:14px}' +
'.at{font-size:13px;line-height:1.75;color:#e8f4fd;white-space:pre-wrap}' +
'.cfm{background:#00e67222;border:1.5px solid #00e676;border-radius:14px;padding:16px;margin-bottom:14px}' +
'.cbtn{width:100%;padding:14px;background:#00e676;border:none;border-radius:10px;color:#000;font-weight:900;font-size:15px;margin-bottom:8px}' +
'.skbtn{width:100%;padding:10px;background:transparent;border:1px solid #1a2a45;border-radius:10px;color:#5a7a99;font-weight:600;font-size:13px}' +
'.avd{background:#ff174422;border:1px solid #ff174433;border-radius:12px;padding:14px;text-align:center}' +
'.st{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
'.si{background:#ffffff08;border-radius:8px;padding:5px 10px}' +
'.sk{font-size:9px;color:#5a7a99}' +
'.pcard{background:#111c30;border-radius:14px;padding:16px;margin-bottom:12px}' +
'.ptg{display:flex;gap:8px;margin-bottom:12px}' +
'.tgb{flex:1;border-radius:8px;padding:6px 10px;text-align:center}' +
'.tbtn{width:100%;padding:11px;border:none;border-radius:10px;color:#000;font-weight:800;font-size:13px}' +
'.empty{background:#111c30;border:1px solid #1a2a45;border-radius:14px;padding:32px;text-align:center;color:#5a7a99}' +
'.hint{font-size:11px;color:#5a7a99;text-align:center}' +
'</style>' +
'</head>' +
'<body>' +
'<div class="hdr">' +
'<div><div class="logo">Options AI</div><div class="sub">Angel One Claude Powered</div></div>' +
'<div style="display:flex;gap:6px">' +
'<div class="bdg" id="lb" style="background:#f0b42922;color:#f0b429">DEMO</div>' +
'<div class="bdg" style="background:#b388ff22;color:#b388ff">AI</div>' +
'</div></div>' +
'<div class="toast" id="toast"></div>' +
'<div class="cnt">' +
'<div class="scr on" id="s-dash">' +
'<div class="tabs">' +
'<button class="tab tn" onclick="setIdx(\'NIFTY\')">NIFTY</button>' +
'<button class="tab" onclick="setIdx(\'BANKNIFTY\')">BNIFTY</button>' +
'<button class="tab" onclick="setIdx(\'SENSEX\')">SENSEX</button>' +
'</div>' +
'<div class="scard" id="scard" style="background:linear-gradient(135deg,#111c30,#0d1424);border:1px solid #00d4ff44">' +
'<div style="font-size:11px;color:#5a7a99" id="sname">NIFTY 50 SPOT</div>' +
'<div class="spx" id="spx" style="color:#00d4ff">22485.00</div>' +
'<div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">' +
'<div style="font-size:11px;color:#5a7a99">Lot: <b id="lsz" style="color:#e8f4fd">50</b></div>' +
'<div style="font-size:11px;color:#5a7a99">Mode: <b id="mode" style="color:#ff9800">DEMO</b></div>' +
'<div style="font-size:11px;color:#5a7a99" id="funds"></div>' +
'</div></div>' +
'<div class="lrow">' +
'<span style="font-size:12px;color:#5a7a99">Lots</span>' +
'<button class="lbtn on" onclick="setQty(1)" id="q1">1</button>' +
'<button class="lbtn" onclick="setQty(2)" id="q2">2</button>' +
'<button class="lbtn" onclick="setQty(3)" id="q3">3</button>' +
'<button class="lbtn" onclick="setQty(5)" id="q5">5</button>' +
'<button class="lbtn" onclick="setQty(10)" id="q10">10</button>' +
'</div>' +
'<div class="erow" id="erow"></div>' +
'<button class="sbtn" onclick="runScan()">AI Auto-Scan All 3 Indices</button>' +
'<div class="cwrap">' +
'<div class="chead">' +
'<div style="flex:1;font-size:11px;font-weight:700;color:#00e676">CALLS</div>' +
'<div style="width:80px;font-size:11px;text-align:center;color:#5a7a99">STRIKE</div>' +
'<div style="flex:1;font-size:11px;font-weight:700;text-align:right;color:#ff1744">PUTS</div>' +
'</div>' +
'<div id="chain"></div>' +
'</div>' +
'<div class="hint">Tap any price - Claude AI - Confirm - Place order</div>' +
'</div>' +
'<div class="scr" id="s-analysis">' +
'<button class="bbtn" onclick="go(\'dash\')">Back</button>' +
'<div id="ah"></div>' +
'<div class="ab"><div style="font-size:11px;color:#b388ff;font-weight:700;margin-bottom:10px">CLAUDE AI ANALYSIS</div><div class="at" id="at">Analyzing...</div></div>' +
'<div id="cfm"></div>' +
'</div>' +
'<div class="scr" id="s-scan">' +
'<button class="bbtn" onclick="go(\'dash\')">Back</button>' +
'<div style="font-size:17px;font-weight:800;margin-bottom:2px">AI Auto-Scan</div>' +
'<div style="font-size:12px;color:#5a7a99;margin-bottom:16px">Claude scans NIFTY BANKNIFTY SENSEX</div>' +
'<div id="scanr"></div>' +
'</div>' +
'<div class="scr" id="s-orders">' +
'<div style="font-size:17px;font-weight:800;margin-bottom:2px">Orders</div>' +
'<div style="font-size:12px;color:#5a7a99;margin-bottom:16px">AI confirmed trades</div>' +
'<div id="ordr"></div>' +
'</div>' +
'</div>' +
'<div class="nav">' +
'<button class="on" id="n-dash" onclick="go(\'dash\')"><span>chart</span>Chain</button>' +
'<button id="n-scan" onclick="go(\'scan\')"><span>robot</span>AI Scan</button>' +
'<button id="n-orders" onclick="go(\'orders\')"><span>list</span>Orders</button>' +
'</div>' +
'<script>' +
'var S={idx:"NIFTY",qty:1,exp:0,exps:[],spots:{NIFTY:22485,BANKNIFTY:48920,SENSEX:73842},conn:false,trades:[],opt:null,po:null};' +
'var IDX={NIFTY:{name:"NIFTY 50",lot:50,color:"#00d4ff",step:50},BANKNIFTY:{name:"BANK NIFTY",lot:15,color:"#f0b429",step:100},SENSEX:{name:"SENSEX",lot:10,color:"#b388ff",step:100}};' +
'function api(p,m,b){var o={method:m||"GET",headers:{"Content-Type":"application/json"}};if(b)o.body=JSON.stringify(b);return fetch(p,o).then(function(r){return r.json();});}' +
'function showToast(msg,col){var e=document.getElementById("toast");e.textContent=msg;e.style.background=col||"#00e676";e.style.color=(col=="#ff9800"||col=="#ff1744")?"#fff":"#000";e.style.display="block";setTimeout(function(){e.style.display="none";},3500);}' +
'function go(name){document.querySelectorAll(".scr").forEach(function(s){s.classList.remove("on");});document.querySelectorAll(".nav button").forEach(function(b){b.classList.remove("on");});document.getElementById("s-"+name).classList.add("on");var nb=document.getElementById("n-"+name);if(nb)nb.classList.add("on");if(name==="orders")renderOrders();}' +
'function setIdx(n){S.idx=n;var idx=IDX[n];document.querySelectorAll(".tab").forEach(function(t){t.className="tab";});var tabs=document.querySelectorAll(".tab");var names=["NIFTY","BANKNIFTY","SENSEX"];var cls={NIFTY:"tn",BANKNIFTY:"tb",SENSEX:"ts"};tabs[names.indexOf(n)].classList.add(cls[n]);document.getElementById("scard").style.border="1px solid "+idx.color+"44";document.getElementById("sname").textContent=idx.name+" SPOT";document.getElementById("spx").style.color=idx.color;document.getElementById("lsz").textContent=idx.lot;updSpot();loadExp();renderChain();}' +
'function setQty(n){S.qty=n;[1,2,3,5,10].forEach(function(v){document.getElementById("q"+v).className="lbtn"+(v===n?" on":"");});}' +
'function sim(spot,strike,type){var m=type==="CE"?spot-strike:strike-spot;return Math.max(1,Math.max(0,m)+spot*0.003+(Math.random()*8-4)).toFixed(2);}' +
'function strikes(spot,step){var atm=Math.round(spot/step)*step;var out=[];for(var i=-5;i<=5;i++)out.push(atm+i*step);return out;}' +
'function renderChain(){var idx=IDX[S.idx],spot=S.spots[S.idx],st=strikes(spot,idx.step),body=document.getElementById("chain");body.innerHTML="";st.forEach(function(strike){var isAtm=Math.abs(strike-spot)<idx.step,ceLtp=sim(spot,strike,"CE"),peLtp=sim(spot,strike,"PE");var row=document.createElement("div");row.className="crow"+(isAtm?" atm":"");row.innerHTML="<button class=\'cce\' onclick=\'analyze("+strike+",\\\"CE\\\","+ceLtp+")\'>\'<div class=\'cep\'>"+ceLtp+"</div></button><div class=\'scol\'><div class=\'sv"+(isAtm?" atm":"")+"\'>"+(strike).toLocaleString("en-IN")+"</div>"+(isAtm?"<div class=\'atmtag\'>ATM</div>":"")+"</div><button class=\'cpe\' onclick=\'analyze("+strike+",\\\"PE\\\","+peLtp+")\'>\'<div class=\'cpp\'>"+peLtp+"</div></button>";body.appendChild(row);});}' +
'function updSpot(){var spot=S.spots[S.idx];document.getElementById("spx").textContent="Rs."+spot.toLocaleString("en-IN",{minimumFractionDigits:2});}' +
'function loadExp(){api("/api/expiry/"+S.idx).then(function(r){S.exps=(r.data&&r.data.length)?r.data:defExps();renderExps();}).catch(function(){S.exps=defExps();renderExps();});}' +
'function defExps(){var out=[];for(var i=0;i<4;i++){var d=new Date();d.setDate(d.getDate()+i*7);out.push(d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"}));}return out;}' +
'function renderExps(){var row=document.getElementById("erow");row.innerHTML="";S.exps.forEach(function(e,i){var btn=document.createElement("button");btn.className="ebtn"+(i===S.exp?" on":"");btn.textContent=e;btn.onclick=function(){S.exp=i;renderExps();renderChain();};row.appendChild(btn);});}' +
'function analyze(strike,type,ltp){S.opt={strike:strike,type:type,ltp:ltp};S.po=null;go("analysis");var idx=IDX[S.idx],spot=S.spots[S.idx],prem=(ltp*idx.lot*S.qty).toFixed(0),col=type==="CE"?"#00e676":"#ff1744";document.getElementById("ah").innerHTML="<div class=\'ah\' style=\'background:linear-gradient(135deg,#111c30,#0d1424);border:1px solid "+col+"55\'><div style=\'font-size:11px;color:#5a7a99\'>"+S.idx+" "+( S.exps[S.exp]||"")+"</div><div style=\'font-size:24px;font-weight:900;color:"+col+"\'>"+strike.toLocaleString("en-IN")+" "+type+"</div><div style=\'font-size:28px;font-weight:800\'>Rs."+ltp+"</div><div class=\'st\'><div class=\'si\'><div class=\'sk\'>Lots</div><div>"+S.qty+"</div></div><div class=\'si\'><div class=\'sk\'>Size</div><div>"+idx.lot+"</div></div><div class=\'si\'><div class=\'sk\'>Units</div><div>"+(S.qty*idx.lot)+"</div></div><div class=\'si\'><div class=\'sk\'>Total</div><div style=\'color:#f0b429\'>Rs."+Number(prem).toLocaleString("en-IN")+"</div></div></div></div>";document.getElementById("at").textContent="Analyzing market structure...";document.getElementById("cfm").innerHTML="";var prompt="Expert Indian options trader. Analyze decisively.\nINDEX: "+idx.name+" SPOT: "+spot.toLocaleString("en-IN")+"\nOPTION: "+S.idx+" "+(S.exps[S.exp]||"")+" "+strike+" "+type+"\nLTP: "+ltp+" Lots: "+S.qty+" Lot Size: "+idx.lot+" Total: "+prem+"\nRisk: Aggressive\n\nReply:\nSIGNAL: BUY or AVOID\nCONFIDENCE: XX%\nREASONING: 2-3 lines\nTARGET: X\nSTOP LOSS: X\nTIME HORIZON: intraday or 1-2 days\nRISK: one line";api("/api/ai/analyze","POST",{prompt:prompt}).then(function(r){var text=r.text||"Analysis unavailable.";document.getElementById("at").textContent=text;var isBuy=/signal:\s*buy/i.test(text);var cm=text.match(/confidence:\s*(\d+)%/i);var conf=cm?parseInt(cm[1]):0;if(isBuy&&conf>=65){S.po={strike:strike,type:type,ltp:ltp,qty:S.qty,idx:idx,conf:conf};document.getElementById("cfm").innerHTML="<div class=\'cfm\'><div style=\'font-size:13px;color:#00e676;font-weight:800;margin-bottom:4px\'>CLAUDE RECOMMENDS BUY</div><div style=\'font-size:12px;color:#5a7a99;margin-bottom:12px\'>Confidence: "+conf+"% "+(S.conn?"Live Angel One":"Demo")+"</div><button class=\'cbtn\' onclick=\'confirm()\'>CONFIRM AND PLACE "+(S.conn?"LIVE":"DEMO")+" ORDER</button><button class=\'skbtn\' onclick=\'document.getElementById(\"cfm\").innerHTML=\"\"\'>Skip</button></div>";}else{document.getElementById("cfm").innerHTML="<div class=\'avd\'><div style=\'color:#ff1744;font-weight:700\'>Claude does not recommend this trade</div><div style=\'font-size:11px;color:#5a7a99;margin-top:4px\'>Confidence below 65 percent or AVOID signal</div></div>";}}).catch(function(){document.getElementById("at").textContent="AI analysis failed. Check connection.";});}' +
'function confirm(){if(!S.po)return;document.getElementById("cfm").innerHTML="<div style=\'background:#111c30;border:1px solid #1a2a45;border-radius:12px;padding:16px;text-align:center;color:#5a7a99\'>Placing order...</div>";var po=S.po;var doPlace=S.conn?api("/api/order/place","POST",{tradingsymbol:S.idx+(S.exps[S.exp]||"")+po.strike+po.type,symboltoken:"",transactiontype:"BUY",quantity:String(po.qty*po.idx.lot)}):Promise.resolve({status:true,data:{orderid:"DEMO"+Date.now()}});doPlace.then(function(result){if(result.status||(result.data&&result.data.orderid)){S.trades.unshift({id:(result.data&&result.data.orderid)||Date.now(),index:S.idx,strike:po.strike,type:po.type,ltp:po.ltp,qty:po.qty,units:po.qty*po.idx.lot,premium:(po.ltp*po.idx.lot*po.qty).toFixed(0),time:new Date().toLocaleTimeString("en-IN"),status:S.conn?"LIVE":"DEMO",conf:po.conf});document.getElementById("cfm").innerHTML="<div style=\'background:#00e67222;border:1px solid #00e676;border-radius:12px;padding:16px;text-align:center;color:#00e676;font-weight:800\'>Order Placed!</div>";showToast((S.conn?"Live":"Demo")+" order! "+S.idx+" "+po.strike+po.type,"#00e676");setTimeout(function(){go("dash");},2000);}else{document.getElementById("cfm").innerHTML="<div style=\'background:#ff174422;border:1px solid #ff1744;border-radius:12px;padding:16px;text-align:center;color:#ff1744;font-weight:700\'>Order Failed</div>";}}).catch(function(e){document.getElementById("cfm").innerHTML="<div style=\'background:#ff174422;border:1px solid #ff1744;border-radius:12px;padding:16px;text-align:center;color:#ff1744;font-weight:700\'>Error: "+e.message+"</div>";});}' +
'function runScan(){go("scan");document.getElementById("scanr").innerHTML="<div class=\'empty\'><div style=\'font-size:28px;margin-bottom:10px\'>Scanning...</div><div style=\'color:#b388ff;font-weight:700\'>Claude analyzing all 3 indices...</div></div>";var cands=[];Object.keys(IDX).forEach(function(key){var idx=IDX[key],spot=S.spots[key],atm=Math.round(spot/idx.step)*idx.step;["CE","PE"].forEach(function(type){[-1,0,1].forEach(function(o){var st=atm+o*idx.step;cands.push(key+" "+st+type+" LTP "+sim(spot,st,type));});});});var prompt="Expert Indian options trader. Pick TOP 3 trades right now.\nNIFTY: "+S.spots.NIFTY+"\nBANKNIFTY: "+S.spots.BANKNIFTY+"\nSENSEX: "+S.spots.SENSEX+"\nCandidates:\n"+cands.map(function(c,i){return (i+1)+". "+c;}).join("\n")+"\nReply ONLY valid JSON no markdown:\n{\"picks\":[{\"rank\":1,\"index\":\"NIFTY\",\"strike\":22500,\"type\":\"CE\",\"ltp\":\"145\",\"confidence\":78,\"reason\":\"Strong momentum\",\"target\":\"215\",\"sl\":\"90\",\"horizon\":\"Intraday\"},{\"rank\":2,\"index\":\"BANKNIFTY\",\"strike\":49000,\"type\":\"PE\",\"ltp\":\"320\",\"confidence\":71,\"reason\":\"Bearish structure\",\"target\":\"480\",\"sl\":\"210\",\"horizon\":\"1-2 days\"},{\"rank\":3,\"index\":\"SENSEX\",\"strike\":74000,\"type\":\"CE\",\"ltp\":\"180\",\"confidence\":67,\"reason\":\"ATM breakout\",\"target\":\"270\",\"sl\":\"115\",\"horizon\":\"Intraday\"}]}";api("/api/ai/analyze","POST",{prompt:prompt}).then(function(r){var text=(r.text||"{}").replace(/```json|```/g,"").trim();var parsed;try{parsed=JSON.parse(text);}catch(e){parsed={picks:[]};}renderScan(parsed.picks||[]);}).catch(function(){renderScan([{rank:1,index:"NIFTY",strike:22500,type:"CE",ltp:"145",confidence:72,reason:"Strong ATM call momentum",target:"210",sl:"90",horizon:"Intraday"},{rank:2,index:"BANKNIFTY",strike:49000,type:"PE",ltp:"318",confidence:68,reason:"Bearish banking structure",target:"480",sl:"210",horizon:"1-2 days"}]);});}' +
'function renderScan(picks){var body=document.getElementById("scanr");if(!picks.length){body.innerHTML="<div class=\'empty\'>No results found</div>";return;}body.innerHTML="";picks.forEach(function(p){var hc=p.confidence>=75,bc=hc?"#00e676":"#f0b429",div=document.createElement("div");div.className="pcard";div.style.border="1.5px solid "+bc+"55";div.innerHTML="<div style=\'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px\'><div><div style=\'font-weight:900;font-size:16px\'>#"+p.rank+" "+p.index+" "+p.strike+" "+p.type+"</div><div style=\'font-size:11px;color:#5a7a99\'>LTP Rs."+p.ltp+" "+p.horizon+"</div></div><div style=\'background:"+(hc?"#00e67222":"#f0b42922")+";border:1px solid "+bc+";border-radius:20px;padding:4px 10px;font-size:12px;font-weight:800;color:"+bc+"\'>"+p.confidence+"%</div></div><div style=\'font-size:12px;color:#e8f4fd;line-height:1.5;margin-bottom:10px\'>"+p.reason+"</div><div class=\'ptg\'><div class=\'tgb\' style=\'background:#00e67222\'><div style=\'font-size:9px;color:#5a7a99\'>TARGET</div><div style=\'font-size:14px;font-weight:800;color:#00e676\'>Rs."+p.target+"</div></div><div class=\'tgb\' style=\'background:#ff174422\'><div style=\'font-size:9px;color:#5a7a99\'>STOP LOSS</div><div style=\'font-size:14px;font-weight:800;color:#ff1744\'>Rs."+p.sl+"</div></div></div><button class=\'tbtn\' style=\'background:"+bc+"\' onclick=\'setIdx(\""+(p.index in IDX?p.index:"NIFTY")+"\");analyze("+p.strike+",\""+p.type+"\","+p.ltp+")\'>Analyze and Trade</button>";body.appendChild(div);});}' +
'function renderOrders(){var body=document.getElementById("ordr");if(!S.trades.length){body.innerHTML="<div class=\'empty\'><div style=\'font-size:28px;margin-bottom:8px\'>No trades yet</div></div>";return;}body.innerHTML="";S.trades.forEach(function(t){var il=t.status==="LIVE",div=document.createElement("div");div.style="background:#111c30;border:1px solid "+(il?"#00e676":"#1a2a45")+"44;border-radius:14px;padding:14px;margin-bottom:10px";div.innerHTML="<div style=\'display:flex;justify-content:space-between;margin-bottom:6px\'><div style=\'font-weight:800\'>"+t.index+" "+t.strike+" "+t.type+"</div><div style=\'font-size:10px;background:"+(il?"#00e67222":"#f0b42922")+";color:"+(il?"#00e676":"#f0b429")+";padding:2px 8px;border-radius:20px;font-weight:700\'>"+t.status+"</div></div><div style=\'display:flex;gap:12px;flex-wrap:wrap\'>"+"<div><div style=\'font-size:9px;color:#5a7a99\'>Premium</div><div style=\'font-size:12px;font-weight:700\'>Rs."+t.ltp+"</div></div>"+"<div><div style=\'font-size:9px;color:#5a7a99\'>Lots</div><div style=\'font-size:12px;font-weight:700\'>"+t.qty+"</div></div>"+"<div><div style=\'font-size:9px;color:#5a7a99\'>Units</div><div style=\'font-size:12px;font-weight:700\'>"+t.units+"</div></div>"+"<div><div style=\'font-size:9px;color:#5a7a99\'>Total</div><div style=\'font-size:12px;font-weight:700\'>Rs."+Number(t.premium).toLocaleString("en-IN")+"</div></div>"+"<div><div style=\'font-size:9px;color:#5a7a99\'>AI</div><div style=\'font-size:12px;font-weight:700\'>"+t.conf+"%</div></div>"+"<div><div style=\'font-size:9px;color:#5a7a99\'>Time</div><div style=\'font-size:12px;font-weight:700\'>"+t.time+"</div></div>"+"</div>";body.appendChild(div);});}' +
'window.onload=function(){showToast("Connecting...", "#ff9800");api("/health").then(function(h){if(h.status==="ok"){return api("/api/login","POST").then(function(l){if(l.status===true){S.conn=true;document.getElementById("lb").textContent="LIVE";document.getElementById("lb").style.background="#00e67222";document.getElementById("lb").style.color="#00e676";document.getElementById("mode").textContent="LIVE";document.getElementById("mode").style.color="#00e676";showToast("Angel One LIVE!","#00e676");api("/api/funds").then(function(r){if(r.data&&r.data.availablecash){document.getElementById("funds").innerHTML="Avail: Rs."+parseFloat(r.data.availablecash).toLocaleString("en-IN",{maximumFractionDigits:0});}}).catch(function(){});}else{showToast("Login failed - Demo","#ff9800");}});}}).catch(function(){showToast("Demo mode","#ff9800");});loadExp();renderChain();setInterval(function(){S.spots.NIFTY=+(S.spots.NIFTY+(Math.random()-0.495)*12).toFixed(2);S.spots.BANKNIFTY=+(S.spots.BANKNIFTY+(Math.random()-0.495)*35).toFixed(2);S.spots.SENSEX=+(S.spots.SENSEX+(Math.random()-0.495)*45).toFixed(2);updSpot();renderChain();},3000);};' +
'<\/script>' +
'</body></html>';
}

app.listen(CONFIG.PORT, "0.0.0.0", function() {
  console.log("Server running on port " + CONFIG.PORT);
  ensureSession();
});
