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

function aH(auth) {
  const h = {
    "Content-Type":"application/json","X-UserType":"USER","X-SourceID":"WEB",
    "X-ClientLocalIP":"127.0.0.1","X-ClientPublicIP":"127.0.0.1",
    "X-MACAddress":"00:00:00:00:00:00","X-PrivateKey":CONFIG.API_KEY
  };
  if (auth && JWT) h["Authorization"] = "Bearer " + JWT;
  return h;
}

app.post("/login", async (req,res) => {
  try {
    const r = await axios.post(BASE+"/rest/auth/angelbroking/user/v1/loginByPassword",
      {clientcode:CONFIG.CLIENT_ID,password:CONFIG.PIN,totp:req.body.totp},{headers:aH(false)});
    if (r.data&&r.data.data&&r.data.data.jwtToken) {
      JWT = r.data.data.jwtToken;
      res.json({ok:true});
    } else res.json({ok:false,msg:r.data.message||"Failed"});
  } catch(e){res.json({ok:false,msg:e.message});}
});

app.post("/analyze", async (req,res) => {
  try {
    const r = await axios.post("https://api.anthropic.com/v1/messages",
      {model:"claude-sonnet-4-6",max_tokens:400,messages:[{role:"user",content:req.body.prompt}]},
      {headers:{"Content-Type":"application/json","x-api-key":CONFIG.ANTHROPIC_KEY,"anthropic-version":"2023-06-01"}});
    res.json({text:r.data.content[0].text});
  } catch(e){res.json({text:"AI error: "+e.message});}
});

app.post("/order", async (req,res) => {
  if (!JWT) return res.json({ok:false,msg:"Not logged in"});
  try {
    const r = await axios.post(BASE+"/rest/secure/angelbroking/order/v1/placeOrder",
      {variety:"NORMAL",ordertype:"MARKET",producttype:"CARRYFORWARD",
       duration:"DAY",exchange:"NFO",price:"0",squareoff:"0",stoploss:"0",...req.body},
      {headers:aH(true)});
    res.json({ok:r.data.status,data:r.data});
  } catch(e){res.json({ok:false,msg:e.message});}
});

app.get("/", (req,res) => {
  res.setHeader("Content-Type","text/html");
  res.end(PAGE);
});

const PAGE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Options AI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0f1e;color:#fff;font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:0}
.p{padding:16px 16px 80px}
.hdr{background:#111827;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:9;border-bottom:1px solid #1f2937}
.logo{color:#00d4ff;font-size:17px;font-weight:900}
.sub{color:#6b7280;font-size:10px}
#badge{font-size:11px;padding:4px 10px;border-radius:20px;font-weight:700;background:#f0b42920;color:#f0b429}
.card{background:#111827;border-radius:12px;padding:16px;margin-bottom:14px;border:1px solid #1f2937}
.btn{display:block;width:100%;padding:15px;font-size:15px;font-weight:700;border:none;border-radius:10px;margin-bottom:8px;cursor:pointer;text-align:center}
.blue{background:#00d4ff;color:#000}
.gray{background:#1f2937;color:#9ca3af}
.green{background:#00e676;color:#000}
.purple{background:#7c3aed;color:#fff}
.red{background:#374151;color:#9ca3af;border:1px solid #374151}
.inp{width:100%;padding:16px;font-size:28px;text-align:center;letter-spacing:8px;background:#0a0f1e;color:#fff;border:2px solid #1f2937;border-radius:10px;margin-bottom:10px}
.inp:focus{border-color:#00d4ff;outline:none}
.tabs{display:flex;gap:8px;margin-bottom:14px}
.tab{flex:1;padding:10px 4px;border-radius:8px;border:2px solid #1f2937;background:#111827;color:#9ca3af;font-weight:700;font-size:12px;cursor:pointer;text-align:center}
.lots{display:flex;gap:6px;align-items:center;background:#111827;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:12px}
.lot{padding:8px 14px;border-radius:8px;border:1px solid #1f2937;background:transparent;color:#9ca3af;font-size:15px;font-weight:700;cursor:pointer}
.exps{display:flex;gap:6px;overflow-x:auto;margin-bottom:14px;padding-bottom:4px}
.exp{padding:7px 14px;border-radius:20px;border:1px solid #1f2937;color:#9ca3af;white-space:nowrap;cursor:pointer;font-size:12px;background:transparent}
.chain-hdr{display:flex;padding:8px 10px;background:#0a0f1e;font-size:11px;font-weight:700;border-bottom:1px solid #1f2937}
.crow{display:flex;border-bottom:1px solid #0d1117;cursor:pointer}
.crow:active{background:#ffffff10}
.crow.atm{background:#00d4ff08}
.ce,.pe{flex:1;padding:12px 10px}
.ce{text-align:left}
.pe{text-align:right}
.cep{color:#00e676;font-size:15px;font-weight:700}
.pep{color:#ff1744;font-size:15px;font-weight:700}
.stk{width:85px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.stk.a{color:#00d4ff}
.atmtag{font-size:8px;color:#00d4ff;font-weight:700}
.nav{display:flex;position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:#111827;border-top:1px solid #1f2937;z-index:9}
.nb{flex:1;padding:10px 4px;background:transparent;border:none;color:#9ca3af;font-size:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px}
.nb.on{color:#00d4ff;font-weight:700}
.ni{font-size:22px}
.pre{white-space:pre-wrap;font-size:13px;line-height:1.8;color:#e5e7eb}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.stat{background:#ffffff0a;border-radius:8px;padding:6px 12px}
.sk{font-size:9px;color:#9ca3af}
.sv{font-size:14px;font-weight:700}
#toast{position:fixed;top:70px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:20px;font-weight:700;font-size:14px;z-index:99;display:none;white-space:nowrap}
.hidden{display:none!important}
.spot{font-size:34px;font-weight:900;letter-spacing:-1px;margin:4px 0}
.msg{padding:12px;border-radius:10px;margin-bottom:10px;font-size:14px}
.ok{background:#00e67615;color:#00e676;border:1px solid #00e676}
.err{background:#ff174415;color:#ff1744;border:1px solid #ff1744}
.info{background:#00d4ff15;color:#00d4ff;border:1px solid #00d4ff}
</style>
</head>
<body>

<div class="hdr">
  <div><div class="logo">&#9889; Options AI</div><div class="sub">Angel One &bull; Claude AI</div></div>
  <div id="badge">&#9675; DEMO</div>
</div>

<div id="toast"></div>

<div id="pg1" class="p">
  <br>
  <div class="card" style="border-color:#f0b429">
    <div style="color:#f0b429;font-weight:700;font-size:16px;margin-bottom:8px">&#128274; Connect Angel One</div>
    <div style="color:#9ca3af;font-size:13px;margin-bottom:14px">Open Google Authenticator. Enter the 6-digit Angel One code.</div>
    <input class="inp" type="tel" id="otp" maxlength="6" placeholder="000000">
    <div id="lmsg"></div>
    <button class="btn blue" id="lbtn" onclick="doLogin()">Connect LIVE</button>
    <button class="btn gray" onclick="goDemo()">Skip - Use Demo Mode</button>
  </div>
</div>

<div id="pg2" class="hidden">
  <div class="p">
    <div class="tabs">
      <div class="tab" id="ti-NIFTY" onclick="setIdx('NIFTY')" style="border-color:#00d4ff;color:#00d4ff">NIFTY</div>
      <div class="tab" id="ti-BANKNIFTY" onclick="setIdx('BANKNIFTY')">BNIFTY</div>
      <div class="tab" id="ti-SENSEX" onclick="setIdx('SENSEX')">SENSEX</div>
    </div>
    <div class="card" id="scard" style="border-color:#00d4ff40">
      <div id="sname" style="font-size:11px;color:#9ca3af">NIFTY 50 SPOT</div>
      <div id="sprice" class="spot" style="color:#00d4ff">22,485.00</div>
      <div style="display:flex;gap:16px;font-size:12px;color:#9ca3af;margin-top:6px;flex-wrap:wrap">
        <span>Lot: <b id="lsz" style="color:#fff">50</b></span>
        <span id="mtxt">Mode: <b style="color:#f0b429">DEMO</b></span>
        <span id="ftxt"></span>
      </div>
    </div>
    <div class="lots">
      <span style="color:#9ca3af;font-size:13px">Lots:</span>
      <div class="lot" id="L1" onclick="setLot(1)" style="border-color:#00d4ff;color:#00d4ff">1</div>
      <div class="lot" id="L2" onclick="setLot(2)">2</div>
      <div class="lot" id="L3" onclick="setLot(3)">3</div>
      <div class="lot" id="L5" onclick="setLot(5)">5</div>
      <div class="lot" id="L10" onclick="setLot(10)">10</div>
    </div>
    <div class="exps" id="erow"></div>
    <div onclick="goScan()" class="btn purple" style="margin-bottom:14px">&#129302; AI Auto-Scan All 3 Indices</div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="chain-hdr">
        <div style="flex:1;color:#00e676">CALLS</div>
        <div style="width:85px;text-align:center;color:#9ca3af">STRIKE</div>
        <div style="flex:1;text-align:right;color:#ff1744">PUTS</div>
      </div>
      <div id="chain"></div>
    </div>
    <div style="text-align:center;color:#6b7280;font-size:12px;padding:8px">Tap any price to get Claude AI analysis</div>
  </div>
</div>

<div id="pg3" class="hidden">
  <div class="p">
    <div onclick="goChain()" class="btn gray" style="width:auto;display:inline-block;padding:10px 20px;margin-bottom:14px">&#8592; Back</div>
    <div id="ohdr" class="card"></div>
    <div class="card">
      <div style="color:#b388ff;font-size:12px;font-weight:700;margin-bottom:10px">&#129302; CLAUDE AI ANALYSIS</div>
      <div id="aitext" class="pre">Analyzing...</div>
    </div>
    <div id="abox"></div>
  </div>
</div>

<div id="pg4" class="hidden">
  <div class="p">
    <div onclick="goChain()" class="btn gray" style="width:auto;display:inline-block;padding:10px 20px;margin-bottom:14px">&#8592; Back</div>
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">&#129302; AI Auto-Scan</div>
    <div style="color:#9ca3af;font-size:13px;margin-bottom:16px">Claude finds best options across all 3 indices</div>
    <div id="sbody"></div>
  </div>
</div>

<div id="pg5" class="hidden">
  <div class="p">
    <div style="font-size:18px;font-weight:900;margin-bottom:4px">&#128203; Orders</div>
    <div style="color:#9ca3af;font-size:13px;margin-bottom:16px">AI-confirmed trades</div>
    <div id="obody"></div>
  </div>
</div>

<div id="nav" class="nav hidden">
  <button class="nb on" id="n1" onclick="goChain()"><span class="ni">&#128202;</span>Chain</button>
  <button class="nb" id="n2" onclick="goScan()"><span class="ni">&#129302;</span>AI Scan</button>
  <button class="nb" id="n3" onclick="goOrders()"><span class="ni">&#128203;</span>Orders</button>
</div>

<script>
var live=false,idx="NIFTY",lots=1,exp=0,exps=[],trades=[],po=null;
var spots={NIFTY:22485,BANKNIFTY:48920,SENSEX:73842};
var cfg={NIFTY:{name:"NIFTY 50",lot:50,color:"#00d4ff",step:50},BANKNIFTY:{name:"BANK NIFTY",lot:15,color:"#f0b429",step:100},SENSEX:{name:"SENSEX",lot:10,color:"#b388ff",step:100}};

function $(i){return document.getElementById(i);}
function show(n){["pg1","pg2","pg3","pg4","pg5"].forEach(function(p){$(p).classList.add("hidden");});$(n).classList.remove("hidden");}
function nav(n){["n1","n2","n3"].forEach(function(x){$(x).classList.remove("on");});if(n)$(n).classList.add("on");}
function toast(m,c){var t=$("toast");t.textContent=m;t.style.background=c||"#00e676";t.style.color=(c=="#f0b429"||c=="#ff1744")?"#000":"#000";t.style.display="block";setTimeout(function(){t.style.display="none";},3000);}
function post(u,d,cb){fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){return r.json();}).then(cb).catch(function(e){cb({ok:false,text:"Error:"+e.message});});}

function doLogin(){
  var c=$("otp").value.trim();
  if(c.length!==6){$("lmsg").innerHTML="<div class='msg err'>Enter 6-digit code</div>";return;}
  $("lbtn").textContent="Connecting...";
  $("lbtn").style.opacity="0.7";
  post("/login",{totp:c},function(r){
    if(r.ok){
      live=true;
      $("badge").textContent="● LIVE";
      $("badge").style.background="#00e67620";
      $("badge").style.color="#00e676";
      $("mtxt").innerHTML="Mode: <b style='color:#00e676'>LIVE</b>";
      toast("Angel One Connected!","#00e676");
      startApp();
    } else {
      $("lmsg").innerHTML="<div class='msg err'>Failed: "+(r.msg||"Check code")+"</div>";
      $("lbtn").textContent="Connect LIVE";
      $("lbtn").style.opacity="1";
    }
  });
}

function goDemo(){
  toast("Demo mode active","#f0b429");
  startApp();
}

function startApp(){
  $("nav").classList.remove("hidden");
  goChain();
  buildExps();
  renderChain();
  setInterval(function(){
    spots.NIFTY=+(spots.NIFTY+(Math.random()-0.495)*12).toFixed(2);
    spots.BANKNIFTY=+(spots.BANKNIFTY+(Math.random()-0.495)*35).toFixed(2);
    spots.SENSEX=+(spots.SENSEX+(Math.random()-0.495)*45).toFixed(2);
    updateSpot();
    renderChain();
  },3000);
}

function goChain(){show("pg2");nav("n1");}
function goScan(){show("pg4");nav("n2");runScan();}
function goOrders(){show("pg5");nav("n3");renderOrders();}

function setIdx(n){
  idx=n;
  var c=cfg[n];
  ["NIFTY","BANKNIFTY","SENSEX"].forEach(function(x){
    var t=$("ti-"+x);
    t.style.borderColor="#1f2937";
    t.style.color="#9ca3af";
  });
  $("ti-"+n).style.borderColor=c.color;
  $("ti-"+n).style.color=c.color;
  updateSpot();
  buildExps();
  renderChain();
}

function updateSpot(){
  var c=cfg[idx];
  $("sname").textContent=c.name+" SPOT";
  $("sprice").textContent="Rs."+spots[idx].toLocaleString("en-IN",{minimumFractionDigits:2});
  $("sprice").style.color=c.color;
  $("scard").style.borderColor=c.color+"40";
  $("lsz").textContent=c.lot;
}

function setLot(n){
  lots=n;
  [1,2,3,5,10].forEach(function(v){
    var l=$("L"+v);
    l.style.borderColor="#1f2937";
    l.style.color="#9ca3af";
  });
  $("L"+n).style.borderColor="#00d4ff";
  $("L"+n).style.color="#00d4ff";
}

function sim(spot,strike,type){
  var m=type==="CE"?spot-strike:strike-spot;
  return Math.max(1,Math.max(0,m)+spot*0.003+(Math.random()*8-4)).toFixed(2);
}

function buildExps(){
  exps=[];
  for(var i=0;i<4;i++){
    var d=new Date();d.setDate(d.getDate()+i*7);
    exps.push(d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"}));
  }
  var row=$("erow");row.innerHTML="";
  exps.forEach(function(e,i){
    var b=document.createElement("div");
    b.className="exp";
    b.textContent=e;
    if(i===exp){b.style.borderColor="#f0b429";b.style.color="#f0b429";}
    b.onclick=(function(ii){return function(){
      exp=ii;
      document.querySelectorAll(".exp").forEach(function(x){x.style.borderColor="#1f2937";x.style.color="#9ca3af";});
      b.style.borderColor="#f0b429";b.style.color="#f0b429";
      renderChain();
    };})(i);
    row.appendChild(b);
  });
}

function renderChain(){
  var c=cfg[idx],spot=spots[idx];
  var atm=Math.round(spot/c.step)*c.step;
  var st=[];for(var i=-5;i<=5;i++)st.push(atm+i*c.step);
  var body=$("chain");body.innerHTML="";
  st.forEach(function(strike){
    var isAtm=Math.abs(strike-spot)<c.step;
    var ce=sim(spot,strike,"CE"),pe=sim(spot,strike,"PE");
    var row=document.createElement("div");
    row.className="crow"+(isAtm?" atm":"");
    row.innerHTML=
      "<div class='ce' onclick='analyze("+strike+",\"CE\","+ce+")'><span class='cep'>"+ce+"</span></div>"+
      "<div class='stk"+(isAtm?" a":"")+"'>"+strike.toLocaleString("en-IN")+(isAtm?"<div class='atmtag'>ATM</div>":"")+"</div>"+
      "<div class='pe' onclick='analyze("+strike+",\"PE\","+pe+")'><span class='pep'>"+pe+"</span></div>";
    body.appendChild(row);
  });
}

function analyze(strike,type,ltp){
  show("pg3");nav("");
  po=null;
  var c=cfg[idx],spot=spots[idx],prem=(ltp*c.lot*lots).toFixed(0),col=type==="CE"?"#00e676":"#ff1744";
  $("ohdr").style.borderColor=col+"44";
  $("ohdr").innerHTML=
    "<div style='font-size:11px;color:#9ca3af'>"+idx+" &bull; "+(exps[exp]||"")+"</div>"+
    "<div style='font-size:26px;font-weight:900;color:"+col+";margin:4px 0'>"+strike.toLocaleString("en-IN")+" "+type+"</div>"+
    "<div style='font-size:28px;font-weight:800'>Rs."+ltp+"</div>"+
    "<div class='stats'>"+
      "<div class='stat'><div class='sk'>Lots</div><div class='sv'>"+lots+"</div></div>"+
      "<div class='stat'><div class='sk'>Size</div><div class='sv'>"+c.lot+"</div></div>"+
      "<div class='stat'><div class='sk'>Units</div><div class='sv'>"+(lots*c.lot)+"</div></div>"+
      "<div class='stat'><div class='sk'>Total</div><div class='sv' style='color:#f0b429'>Rs."+Number(prem).toLocaleString("en-IN")+"</div></div>"+
    "</div>";
  $("aitext").textContent="Analyzing...";
  $("abox").innerHTML="";
  var prompt="Indian options expert. Analyze:\nINDEX: "+c.name+" SPOT Rs."+spot+"\nOPTION: "+idx+" "+(exps[exp]||"")+" "+strike+" "+type+" LTP Rs."+ltp+"\nLots:"+lots+" Size:"+c.lot+" Total:Rs."+prem+"\nRisk:Aggressive\n\nSIGNAL: BUY or AVOID\nCONFIDENCE: XX%\nREASONING: 2 lines\nTARGET: Rs.X\nSTOP LOSS: Rs.X\nHORIZON: intraday or 1-2 days";
  post("/analyze",{prompt:prompt},function(r){
    var text=r.text||"Analysis unavailable";
    $("aitext").textContent=text;
    var isBuy=/signal:\s*buy/i.test(text);
    var cm=text.match(/confidence:\s*(\d+)%/i);
    var conf=cm?parseInt(cm[1]):0;
    if(isBuy&&conf>=65){
      po={strike:strike,type:type,ltp:ltp,lots:lots,c:c,conf:conf};
      $("abox").innerHTML=
        "<div class='card' style='border-color:#00e676;background:#00e67610'>"+
          "<div style='color:#00e676;font-size:15px;font-weight:900;margin-bottom:4px'>&#9989; CLAUDE: BUY</div>"+
          "<div style='color:#9ca3af;font-size:13px;margin-bottom:14px'>Confidence "+conf+"% &bull; "+(live?"Live":"Demo")+"</div>"+
          "<div onclick='placeOrder()' class='btn green'>CONFIRM &amp; PLACE "+(live?"LIVE":"DEMO")+" ORDER</div>"+
          "<div onclick='$(\"abox\").innerHTML=\"\"' class='btn red'>Skip this trade</div>"+
        "</div>";
    } else {
      $("abox").innerHTML="<div class='card' style='border-color:#ff174440;background:#ff174410;text-align:center'><div style='color:#ff1744;font-size:16px;font-weight:900'>&#10060; CLAUDE: AVOID</div><div style='color:#9ca3af;font-size:13px;margin-top:6px'>Confidence below 65% or AVOID signal</div></div>";
    }
  });
}

function placeOrder(){
  if(!po)return;
  $("abox").innerHTML="<div class='card' style='text-align:center;color:#9ca3af;font-size:15px'>&#9203; Placing order...</div>";
  var p=po;
  if(live){
    post("/order",{tradingsymbol:idx+(exps[exp]||"")+p.strike+p.type,symboltoken:"",transactiontype:"BUY",quantity:String(p.lots*p.c.lot)},function(r){done(r,p);});
  } else {
    done({ok:true,data:{orderid:"DEMO"+Date.now()}},p);
  }
}

function done(r,p){
  if(r.ok||(r.data&&r.data.orderid)){
    trades.unshift({id:(r.data&&r.data.orderid)||Date.now(),index:idx,strike:p.strike,type:p.type,ltp:p.ltp,lots:p.lots,units:p.lots*p.c.lot,total:(p.ltp*p.c.lot*p.lots).toFixed(0),time:new Date().toLocaleTimeString("en-IN"),status:live?"LIVE":"DEMO",conf:p.conf});
    $("abox").innerHTML="<div class='card' style='border-color:#00e676;text-align:center;color:#00e676;font-size:16px;font-weight:900'>&#9989; Order Placed!</div>";
    toast("Order placed! "+idx+" "+p.strike+p.type,"#00e676");
    setTimeout(goChain,2000);
  } else {
    $("abox").innerHTML="<div class='card' style='border-color:#ff1744;text-align:center;color:#ff1744;font-weight:700'>&#10060; Failed: "+(r.msg||"Unknown")+"</div>";
  }
}

function runScan(){
  $("sbody").innerHTML="<div class='card' style='text-align:center;padding:30px'><div style='font-size:32px;margin-bottom:10px'>&#128269;</div><div style='color:#b388ff;font-weight:700'>Scanning all 3 indices...</div></div>";
  var cands=[];
  Object.keys(cfg).forEach(function(k){
    var c=cfg[k],spot=spots[k],atm=Math.round(spot/c.step)*c.step;
    ["CE","PE"].forEach(function(t){[-1,0,1].forEach(function(o){var s=atm+o*c.step;cands.push(k+" "+s+t+" Rs."+sim(spot,s,t));});});
  });
  var prompt="Indian options expert. Pick TOP 3 trades.\nNIFTY:"+spots.NIFTY+" BANKNIFTY:"+spots.BANKNIFTY+" SENSEX:"+spots.SENSEX+"\n"+cands.map(function(c,i){return(i+1)+". "+c;}).join("\n")+"\nReply ONLY JSON: {\"picks\":[{\"rank\":1,\"index\":\"NIFTY\",\"strike\":22500,\"type\":\"CE\",\"ltp\":145,\"conf\":78,\"reason\":\"Strong momentum\",\"target\":215,\"sl\":90,\"horizon\":\"Intraday\"},{\"rank\":2,\"index\":\"BANKNIFTY\",\"strike\":49000,\"type\":\"PE\",\"ltp\":320,\"conf\":71,\"reason\":\"Bearish divergence\",\"target\":480,\"sl\":210,\"horizon\":\"1-2 days\"},{\"rank\":3,\"index\":\"SENSEX\",\"strike\":74000,\"type\":\"CE\",\"ltp\":180,\"conf\":67,\"reason\":\"ATM breakout\",\"target\":270,\"sl\":115,\"horizon\":\"Intraday\"}]}";
  post("/analyze",{prompt:prompt},function(r){
    var parsed;
    try{
      var txt=(r.text||"{}");
      var m=txt.match(/\{[\s\S]*\}/);
      parsed=m?JSON.parse(m[0]):{picks:[]};
    }catch(e){parsed={picks:[]};}
    renderScan(parsed.picks||[
      {rank:1,index:"NIFTY",strike:22500,type:"CE",ltp:145,conf:72,reason:"Strong ATM momentum",target:215,sl:90,horizon:"Intraday"},
      {rank:2,index:"BANKNIFTY",strike:49000,type:"PE",ltp:318,conf:68,reason:"Bearish banking structure",target:480,sl:210,horizon:"1-2 days"}
    ]);
  });
}

function renderScan(picks){
  var body=$("sbody");body.innerHTML="";
  picks.forEach(function(p){
    var hc=p.conf>=75,bc=hc?"#00e676":"#f0b429";
    var d=document.createElement("div");
    d.className="card";
    d.style.borderColor=bc+"55";
    d.style.marginBottom="12px";
    d.innerHTML=
      "<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px'>"+
        "<div><div style='font-size:17px;font-weight:900'>#"+p.rank+" "+p.index+" "+p.strike+" "+p.type+"</div>"+
        "<div style='color:#9ca3af;font-size:12px;margin-top:2px'>LTP Rs."+p.ltp+" &bull; "+p.horizon+"</div></div>"+
        "<div style='background:"+bc+"20;border:1px solid "+bc+";border-radius:20px;padding:4px 10px;color:"+bc+";font-weight:900;font-size:13px'>"+p.conf+"%</div>"+
      "</div>"+
      "<div style='font-size:13px;line-height:1.6;margin-bottom:12px'>"+p.reason+"</div>"+
      "<div style='display:flex;gap:8px;margin-bottom:12px'>"+
        "<div style='flex:1;background:#00e67615;border-radius:8px;padding:10px;text-align:center'><div style='font-size:10px;color:#9ca3af'>TARGET</div><div style='font-size:16px;font-weight:900;color:#00e676'>Rs."+p.target+"</div></div>"+
        "<div style='flex:1;background:#ff174415;border-radius:8px;padding:10px;text-align:center'><div style='font-size:10px;color:#9ca3af'>STOP LOSS</div><div style='font-size:16px;font-weight:900;color:#ff1744'>Rs."+p.sl+"</div></div>"+
      "</div>"+
      "<div class='btn' style='background:"+bc+";color:#000;margin:0' onclick='setIdx(\""+p.index+"\");analyze("+p.strike+",\""+p.type+"\","+p.ltp+")'>Analyze &amp; Trade &rarr;</div>";
    body.appendChild(d);
  });
}

function renderOrders(){
  var body=$("obody");
  if(!trades.length){body.innerHTML="<div class='card' style='text-align:center;padding:40px'><div style='font-size:40px;margin-bottom:12px'>&#128203;</div><div style='color:#9ca3af'>No trades yet</div></div>";return;}
  body.innerHTML="";
  trades.forEach(function(t){
    var live=t.status==="LIVE",bc=live?"#00e676":"#f0b429";
    var d=document.createElement("div");
    d.className="card";
    d.style.borderColor=bc+"44";
    d.style.marginBottom="10px";
    d.innerHTML=
      "<div style='display:flex;justify-content:space-between;margin-bottom:10px'>"+
        "<div style='font-size:16px;font-weight:900'>"+t.index+" "+t.strike+" "+t.type+"</div>"+
        "<div style='background:"+bc+"20;color:"+bc+";padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700'>"+t.status+"</div>"+
      "</div>"+
      "<div style='display:flex;gap:14px;flex-wrap:wrap'>"+
        [["Prem","Rs."+t.ltp],["Lots",t.lots],["Units",t.units],["Total","Rs."+Number(t.total).toLocaleString("en-IN")],["AI",t.conf+"%"],["Time",t.time]].map(function(kv){
          return "<div><div style='font-size:10px;color:#9ca3af'>"+kv[0]+"</div><div style='font-size:13px;font-weight:700'>"+kv[1]+"</div></div>";
        }).join("")+
      "</div>";
    body.appendChild(d);
  });
}
</script>
</body>
</html>`;

app.listen(CONFIG.PORT,"0.0.0.0",function(){console.log("Server on port "+CONFIG.PORT);});
