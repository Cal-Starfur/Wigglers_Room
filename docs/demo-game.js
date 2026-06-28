// ============================================================================
// WIGGLERS ROOM — demo-game.js
// Extracted from game.js (SHA 84343c0). Tutorial-native demo build.
// Build plan: docs/DEMO_BUILD_PLAN.md
// T-01 + T-00: Canvas, Bin, Worm, Tunnels, Death Screen
// _restartDemo() provided by demo.html
// ============================================================================
// ============================================================================
// WIGGLERS ROOM — demo-game.js
// game.js extract (SHA 84343c0). Tutorial-native. T-01 + T-00.
// ============================================================================

// ── Demo stubs ────────────────────────────────────────────────────────────
function postToHost(msg){}
function saveSession(){}
function loadSession(){return null;}
function applyOfflineDrain(){}
function getGenColor(g){return '#ff4d8f';} // demo worm — hot pink
var username='You',karma=0,generation=0,castingEnrichment=0;
var snooScene=null,snooPhase='done',drainScene=false,valveOpen=false;
var floodActive=false,drainTapRot=0,otherPlayers=[],pendingWorms=[];
var drainBonusPopups=[],weekStartTs=0,weeklyContrib=0,tapReady=false;
var _hostScrapsLevel=null,playerState='playing',gardenTufts=[],gardenFlowers=[];
var _claimBtn=null,_claimPrompt=0;
var _demoDead=false,_demoDeadFade=0,_demoDeadBtn=null;
// stub: _restartDemo lives in demo.html; here we just reload
function _restartDemo(){ window.location.reload(); }

// ── T-01 stubs — filled in by later tickets ───────────────────────────────
function getLowestScrapY(){return H * 0.5;} // T-02: real impl scans scraps[]; 0.5 = lid bottom = pile ceiling
function compostDepth(wy){return wy-2*H;}
function drawDebrisFragment(){return;}         // T-02
function drawTrashChunk(){return;}             // T-03
function drawPath(path) {
  if (!path.length) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (var pass = 0; pass < 2; pass++) {
    var inSeg = false, lastTi = -1, lastAlpha = -1;
    for (var i = 0; i < path.length; i++) {
      var p = path[i];
      if (!p || p.alpha <= 0) {
        if (inSeg) { ctx.stroke(); inSeg = false; }
        lastTi = -1; lastAlpha = -1; continue;
      }
      var sy = p.y - camY;
      if (sy < -p.r*4 || sy > H + p.r*4) {
        if (inSeg) { ctx.stroke(); inSeg = false; }
        lastTi = -1; lastAlpha = -1; continue;
      }
      var pAlpha = (p.alpha != null ? p.alpha : 1);
      if (p.ti !== lastTi || Math.abs(pAlpha - lastAlpha) > 0.02) {
        if (inSeg) { ctx.stroke(); inSeg = false; }
        if (pass === 0) {
          ctx.strokeStyle = p.ti === 2 ? '#3a2010' : '#2a1808';
          ctx.lineWidth = p.r * 2.6; ctx.globalAlpha = 0.90 * pAlpha;
        } else {
          ctx.strokeStyle = p.ti === 2 ? '#6a4020' : '#4a2c10';
          ctx.lineWidth = p.r * 1.4; ctx.globalAlpha = 0.95 * pAlpha;
        }
        lastTi = p.ti; lastAlpha = pAlpha;
      }
      if (!inSeg) { ctx.beginPath(); ctx.moveTo(p.x, sy); inSeg = true; }
      else ctx.lineTo(p.x, sy);
    }
    if (inSeg) ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function getGenName(g){
  var N=['Hatchling','Seasoned','Composter','Elder','Ancient','Primordial','Eternal'];
  return N[Math.min(g,N.length-1)];
}

// ── Canvas bootstrap ─────────────────────────────────────────────────────
window.addEventListener('error', function(e) {
  if (!window.DEBUG_MODE) return;
  var msg = (e.message || '') + ' @ ' + (e.filename||'') + ':' + e.lineno + ':' + e.colno;
  if (!document.getElementById('_err')) {
    var d = document.createElement('div');
    d.id = '_err';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:#fff;font:12px monospace;padding:6px;z-index:9999;white-space:pre-wrap;pointer-events:none;';
    document.body.appendChild(d);
  }
  document.getElementById('_err').textContent = msg;
});

var root = document.getElementById('root');
var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d');

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'object') r = r[0] || 0;
    r = Math.min(r, w/2, h/2);
    this.moveTo(x+r, y); this.lineTo(x+w-r, y);
    this.quadraticCurveTo(x+w, y, x+w, y+r);
    this.lineTo(x+w, y+h-r);
    this.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    this.lineTo(x+r, y+h);
    this.quadraticCurveTo(x, y+h, x, y+h-r);
    this.lineTo(x, y+r);
    this.quadraticCurveTo(x, y, x+r, y);
    this.closePath();
  };
}
var _ctxFilterSupported = (function(){
  try { var t=document.createElement('canvas').getContext('2d'); t.filter='brightness(100%)'; return true; } catch(e){ return false; }
})();

var W = 0, H = 0;
var centreOffsetX = 0;
var camY = 0, camX = 0;
var viewMode = false, viewCamY = 0;
var mX = 0, mY = 0;
var frame = 0;
var weeklyFeedPending = false;
var snooLidAngle = 0;
var clitellumReady = false;
var cocoons = [];
var pGut = 0, pGutMax = 120, pPooping = false, pEaten = 0;
var pHunger = 0;
var DEBUG_MODE = false;

function getRealDayTime() {
  var now = new Date();
  var s = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds() + now.getMilliseconds()/1000;
  return s / 86400;
}
var dayTime = getRealDayTime();

var TIERS = [
  { bg: '#3a4a6a' },
  { bg: '#8b6340' },
  { bg: '#4a2c10' },
  { bg: '#2e3d58' }
];

// ── Array + state vars ───────────────────────────────────────────────────
var trashChunks = [];
var scraps = [];
var MAX_SCRAPS = 300;
function scrapsPush(s) {
  if (scraps.length >= MAX_SCRAPS) {
    var _removed = false;
    for (var _si3 = 0; _si3 < scraps.length; _si3++) {
      if (scraps[_si3].eaten) { scraps.splice(_si3, 1); _removed = true; break; }
    }
    if (!_removed) scraps.shift();
  }
  scraps.push(s);
}
var debris = [];
var _debrisDirty = false;
var drops = [];
var MAX_DROPS = 200;
function dropsPush(d) {
  if (drops.length >= MAX_DROPS) {
    var _removed = false;
    for (var _di2 = 0; _di2 < drops.length; _di2++) {
      if (!drops[_di2].active) { drops.splice(_di2, 1); _removed = true; break; }
    }
    if (!_removed) drops.shift();
  }
  drops.push(d);
}
var weatherQueue = [];
var _bladeCanvas = null;
var bugs = [];
var castings = [];
var tLvl = 0;
var pooled = 0;
var teaSplashes = [];
var valveDrips = [];
var WEEK_DRAIN_MS = 7 * 24 * 60 * 60 * 1000;
var weeklyFeedPending2 = false;
var floodActive2 = false;
var drainBonusPopups2 = [];
var scrapsLevel = 1.0;
var scrapsEmpty = false;

// ── Player state vars ────────────────────────────────────────────────────
var pSleeping = false;
var pSleepX = 0, pSleepY = 0;
var pSleepCurl = 0;
var pZzz = [];
var pAcid = 0;
var ACID_DECAY = 1 / (60 * 180);
var ACID_HP_DRAIN = 0.0006;
var pHP = 1.0;
var pSegs = [];
var pHist = [];
var pSR = 4;
var pSEG = 4;

// ── Junction + drain state ───────────────────────────────────────────────
var JUNCTION_HOLD_FRAMES = 90;
var junctionTimer = 0;
var junctionTargetIdx = -1;
var junctionUsedPoints = [];
var junctionCarveOrigin = null;
var drainDownTimer = 0;
var drainUpTimer = 0;
var drainDownCooldown = 0;

// ── pPath + bucket index ─────────────────────────────────────────────────
var pPath = [];
var pLastX = -999, pLastY = -999;
var MAX_PPATH = 2000;
var _pPathBuckets = {};
var PPATH_BUCKET_H = 8;
function _pPathBucketKey(y) { return Math.floor(y / PPATH_BUCKET_H); }
function _pPathBucketInsert(idx, y) {
  var k = _pPathBucketKey(y);
  if (!_pPathBuckets[k]) _pPathBuckets[k] = [];
  _pPathBuckets[k].push(idx);
}
function _pPathBucketRebuild() {
  _pPathBuckets = {};
  for (var _bi = 0; _bi < pPath.length; _bi++) {
    var _bp = pPath[_bi];
    if (_bp) _pPathBucketInsert(_bi, _bp.y);
  }
}

// ── Bin geometry helpers ─────────────────────────────────────────────────
function getBin() {
  var bw = Math.min(WORLD_W * 0.88, WORLD_W - 32);
  var cx = WORLD_W / 2;
  return { cx: cx, bw: bw, bw2: bw/2, lw: Math.floor(WORLD_W * 0.04) };
}
var _bin = null;
function _refreshBin() { _bin = getBin(); }
var _binCacheW = -1;
function getBinCached() {
  if (_bin === null || W !== _binCacheW) { _bin = getBin(); _binCacheW = W; }
  return _bin;
}
function getTier(wy) {
  if (!H) return 0;
  return Math.min(Math.max(Math.floor(wy / H), 0), 3);
}
function cSurf() { return 3*H; }
function tSurf() { return 3*H + H*0.25 + H*0.5 - tLvl*(H-8); }
function inCompost(wy) { return wy >= 2*H && wy < 3*H; }

// ── Path helpers ─────────────────────────────────────────────────────────
function nearestPathIdx(wx, wy, xTol, yTol) {
  var best = -1, bestDist = 999999;
  var _yMax = (yTol != null) ? wy + yTol : wy + 64;
  var kMin = _pPathBucketKey(wy);
  var kMax = _pPathBucketKey(_yMax);
  for (var k = kMin; k <= kMax; k++) {
    var bucket = _pPathBuckets[k];
    if (!bucket) continue;
    for (var _bi = 0; _bi < bucket.length; _bi++) {
      var i = bucket[_bi];
      var p = pPath[i];
      if (!p) continue;
      var a = p.alpha != null ? p.alpha : 1;
      if (a <= 0) continue;
      if (p.y < wy) continue;
      if (yTol != null && p.y > wy + yTol) continue;
      if (Math.abs(p.x - wx) > xTol) continue;
      var dist = Math.abs(p.y - wy);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
  }
  return best;
}

function addPoint(path, x, y, r, lastX, lastY) {
  var dx = x - lastX, dy = y - lastY;
  var dd = Math.sqrt(dx*dx + dy*dy);
  if (dd < r * 0.6) return false;
  var ti = getTier(y);
  if (ti < 2) return false;
  if (dd > r * 8) path.push(null);
  var _newIdx = path.length;
  path.push({x:x, y:y, r:r, ti:ti});
  if (path === pPath) _pPathBucketInsert(_newIdx, y);
  if (path.length > MAX_PPATH) {
    var _pruneTarget = path.length - MAX_PPATH;
    var _pruneAt = _pruneTarget;
    while (_pruneAt < path.length && path[_pruneAt] !== null) _pruneAt++;
    if (_pruneAt < path.length) _pruneAt++;
    path.splice(0, _pruneAt);
    if (path === pPath) _pPathBucketRebuild();
    if (typeof drops !== 'undefined') {
      for (var _ppi = 0; _ppi < drops.length; _ppi++) {
        var _ppd = drops[_ppi];
        if (_ppd.pathIdx != null) {
          _ppd.pathIdx -= _pruneAt;
          if (_ppd.pathIdx < 0) { _ppd.pathIdx = null; _ppd.stalled = false; }
        }
        if (_ppd.lastSegStart != null) { _ppd.lastSegStart = Math.max(0, _ppd.lastSegStart - _pruneAt); }
        if (_ppd.lastSegEnd   != null) { _ppd.lastSegEnd   = Math.max(0, _ppd.lastSegEnd   - _pruneAt); }
      }
    }
  }
  return true;
}

// ── WORLD_W + resizeCanvas ───────────────────────────────────────────────
var WORLD_W = 1194;

function resizeCanvas() {
  var vw = root.offsetWidth;
  var vh = root.offsetHeight;
  W = vw; H = vh;
  canvas.width = W; canvas.height = H;
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  canvas.style.transform = '';
  canvas.style.left = '0px';
  canvas.style.top = '0px';
  window._canvasScale = 1;
  window._canvasOffsetX = 0;
  window._canvasOffsetY = 0;
  window._canvasScaleX = 1;
  window._canvasScaleY = 1;
  _binCacheW = -1;
  _soilGradMW = -1;
}

// ── initPlayer ───────────────────────────────────────────────────────────
function initPlayer(saved) {
  var b = getBin();
  pSegs = []; pHist = []; pSR = 4; pSEG = pSEG || 4;
  pPath = []; pLastX = -999; pLastY = -999;
  var startX = (saved && saved.pX) ? saved.pX : b.cx;
  var startY = (saved && saved.pY) ? Math.max(H * 0.55, Math.min(H * 3.8, saved.pY)) : H * 1.4;
  for (var i = 0; i < 20; i++) pHist.push({x: startX, y: startY});
  for (var i = 0; i < Math.max(4, Math.min(8, pSEG)); i++) pSegs.push({x: startX - i * pSR * 2, y: startY});
  mX = startX; mY = startY;
  camY = startY - H/2;
  camX = (W >= WORLD_W) ? 0 : Math.max(0, startX - W/2);
}

function spawnScraps(){}

function setup(){
  resizeCanvas();
  pPath=[];drops=[];bugs=[];castings=[];trashChunks=[];debris=[];
  scraps=[];cocoons=[];teaSplashes=[];valveDrips=[];drainBonusPopups=[];
  tapReady=false;drainDownTimer=0;drainUpTimer=0;drainDownCooldown=0;
  pGut=0;pHP=1.0;pPooping=false;pAcid=0;
  _demoDead=false;_demoDeadFade=0;_demoDeadBtn=null;
  scrapsLevel=1.0;scrapsEmpty=false;
  dayTime=getRealDayTime();
  initPlayer(loadSession());
  spawnScraps();
  loop();
}

// ── Colour + sky helpers ─────────────────────────────────────────────────
function blendWet(e, mw, dr,dg,db, er,eg,eb, wr,wg,wb) {
  var r = Math.round((dr+(er-dr)*e)*(1-mw) + wr*mw);
  var g = Math.round((dg+(eg-dg)*e)*(1-mw) + wg*mw);
  var b = Math.round((db+(eb-db)*e)*(1-mw) + wb*mw);
  return '#'+('0'+r.toString(16)).slice(-2)+('0'+g.toString(16)).slice(-2)+('0'+b.toString(16)).slice(-2);
}
var _soilGradCache = null;
var _soilGradE = -1;
var _soilGradMW = -1;
function getSoilGradStops(e, mw) {
  if (_soilGradCache && Math.abs(e - _soilGradE) < 0.005 && Math.abs(mw - _soilGradMW) < 0.005) return _soilGradCache;
  _soilGradE = e; _soilGradMW = mw;
  _soilGradCache = [
    blendWet(e,mw, 0x7a,0x55,0x35, 0x4a,0x28,0x10, 0x38,0x44,0x2a),
    blendWet(e,mw, 0x6a,0x48,0x28, 0x38,0x1a,0x08, 0x2c,0x3a,0x24),
    blendWet(e,mw, 0x4a,0x2c,0x10, 0x22,0x10,0x04, 0x1e,0x2e,0x1c),
    blendWet(e,mw, 0x2a,0x16,0x00, 0x10,0x08,0x00, 0x12,0x20,0x14)
  ];
  return _soilGradCache;
}
function blendEnrichCol(br,bg,bb,er,eg,eb,e){
  var r=Math.round(br+(er-br)*e),g=Math.round(bg+(eg-bg)*e),b2=Math.round(bb+(eb-bb)*e);
  return '#'+('0'+r.toString(16)).slice(-2)+('0'+g.toString(16)).slice(-2)+('0'+b2.toString(16)).slice(-2);
}
function lerpCol(a,c,t){
  function h(s,i){return parseInt(s.slice(i,i+2),16);}
  var r=Math.round(h(a,1)+(h(c,1)-h(a,1))*t);
  var g=Math.round(h(a,3)+(h(c,3)-h(a,3))*t);
  var bl=Math.round(h(a,5)+(h(c,5)-h(a,5))*t);
  return '#'+('0'+r.toString(16)).slice(-2)+('0'+g.toString(16)).slice(-2)+('0'+bl.toString(16)).slice(-2);
}
function skyCol(t){
  var u;
  if(t<0.18)return['#05080f','#0a1020'];
  if(t<0.25){u=(t-0.18)/0.07;return[lerpCol('#05080f','#1a1030',u),lerpCol('#0a1020','#2a1840',u)];}
  if(t<0.32){u=(t-0.25)/0.07;return[lerpCol('#1a1030','#ff7040',u),lerpCol('#2a1840','#ffb060',u)];}
  if(t<0.42){u=(t-0.32)/0.10;return[lerpCol('#ff7040','#5ab4e8',u),lerpCol('#ffb060','#a8d8f0',u)];}
  if(t<0.58)return['#4aa8e8','#87ceeb'];
  if(t<0.68){u=(t-0.58)/0.10;return[lerpCol('#4aa8e8','#e87830',u),lerpCol('#87ceeb','#f0b060',u)];}
  if(t<0.75){u=(t-0.68)/0.07;return[lerpCol('#e87830','#1a1030',u),lerpCol('#f0b060','#2e1848',u)];}
  return['#05080f','#0a1020'];
}
var _starPos = [
  [0.08,0.06],[0.19,0.14],[0.32,0.04],[0.45,0.11],[0.58,0.07],[0.71,0.03],
  [0.83,0.09],[0.91,0.16],[0.13,0.22],[0.27,0.19],[0.52,0.24],[0.66,0.18],
  [0.79,0.20],[0.38,0.28],[0.61,0.31],[0.88,0.27],[0.05,0.30],[0.95,0.12]
];
var _segPtsScratch = [];

// ── drawWorm ─────────────────────────────────────────────────────────────
function drawWorm(segs, sr, col, sleeping, acid, hp) {
  if (segs.length < 1) return;
  hp = (hp === undefined) ? 1.0 : hp;
  var drawCol = col;
  if (acid && acid > 0.1) {
    var t1 = Math.min(1, (acid - 0.1) / 0.4);
    var r0=parseInt(col.slice(1,3),16),g0=parseInt(col.slice(3,5),16),b0=parseInt(col.slice(5,7),16);
    var rr=Math.round(r0+(0xc8-r0)*t1),gg=Math.round(g0+(0xf0-g0)*t1),bb=Math.round(b0+(0x20-b0)*t1);
    drawCol='#'+('0'+rr.toString(16)).slice(-2)+('0'+gg.toString(16)).slice(-2)+('0'+bb.toString(16)).slice(-2);
  }
  if (hp < 0.45) {
    var _pt=Math.min(1,(0.45-hp)/0.45);
    var _cr=parseInt(drawCol.slice(1,3),16),_cg=parseInt(drawCol.slice(3,5),16),_cb=parseInt(drawCol.slice(5,7),16);
    var _pr2=Math.round(_cr+(0xe8-_cr)*_pt),_pg2=Math.round(_cg+(0xe0-_cg)*_pt),_pb2=Math.round(_cb+(0xd8-_cb)*_pt);
    drawCol='#'+('0'+_pr2.toString(16)).slice(-2)+('0'+_pg2.toString(16)).slice(-2)+('0'+_pb2.toString(16)).slice(-2);
  }
  var headMoveDist=0;
  if(segs.length>1){var hmdx=segs[0].x-segs[1].x,hmdy=segs[0].y-segs[1].y;headMoveDist=Math.sqrt(hmdx*hmdx+hmdy*hmdy);}
  var isMoving=!sleeping&&headMoveDist>sr*0.15;
  for(var i=segs.length-1;i>=0;i--){
    var seg=segs[i];
    var wx=seg.x,wy2=seg.y;
    if(isMoving&&i>0&&i<segs.length-1){
      var prev=segs[i-1],next=segs[i+1];
      var dx=prev.x-next.x,dy=prev.y-next.y;
      var dl=Math.sqrt(dx*dx+dy*dy)||1;
      var px=-dy/dl,py=dx/dl;
      var taper=Math.sin(Math.PI*(i/segs.length));
      var bodyAmp=0.18-(sr-4)*0.05;
      var wave=Math.sin(i*0.9+frame*0.18)*sr*Math.max(0.05,bodyAmp)*taper;
      wx+=px*wave;wy2+=py*wave;
    }
    var sy=wy2-camY;
    if(sy<-sr*3||sy>H+sr*3)continue;
    var t=i/segs.length,r;
    if(t<0.08)r=sr*(0.3+t*(1/0.08)*0.7);
    else if(t<0.75)r=sr;
    else r=sr*(1-(t-0.75)*(1/0.25)*0.65);
    r=Math.max(1,r);
    ctx.beginPath();ctx.arc(wx,sy,r,0,Math.PI*2);
    ctx.fillStyle=(i%2===0)?drawCol:drawCol+'dd';ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.12)';ctx.lineWidth=0.5;ctx.stroke();
  }
  if(segs.length>5){
    var ci=Math.min(4,segs.length-1);var csy=segs[ci].y-camY;
    ctx.beginPath();ctx.arc(segs[ci].x,csy,sr*1.12,0,Math.PI*2);
    ctx.fillStyle=drawCol+'bb';ctx.fill();
  }
  if(segs.length>1){
    var hd=segs[0],hsy=hd.y-camY;
    var ang=Math.atan2(hd.y-segs[1].y,hd.x-segs[1].x);
    var eo=sr*0.45,ea1=ang+Math.PI/2,ea2=ang-Math.PI/2;
    var ex1=hd.x+Math.cos(ea1)*eo,ey1=hsy+Math.sin(ea1)*eo;
    var ex2=hd.x+Math.cos(ea2)*eo,ey2=hsy+Math.sin(ea2)*eo;
    if(sleeping){
      ctx.strokeStyle='#1a0800';ctx.lineWidth=sr*0.18;ctx.lineCap='round';
      ctx.beginPath();ctx.arc(ex1,ey1,sr*0.2,0,Math.PI);ctx.stroke();
      ctx.beginPath();ctx.arc(ex2,ey2,sr*0.2,0,Math.PI);ctx.stroke();
    }else{
      var _acidBlend=(acid&&acid>0.1)?Math.min(1,(acid-0.1)/0.4):0;
      var _eyePale=hp<0.45?Math.min(1,(0.45-hp)/0.45):0;
      var _ewr=Math.round(0xff+(0xd8-0xff)*_acidBlend),_ewg=Math.round(0xff+(0xf0-0xff)*_acidBlend),_ewb=Math.round(0xff+(0xa0-0xff)*_acidBlend);
      _ewr=Math.round(_ewr+(0xe8-_ewr)*_eyePale);_ewg=Math.round(_ewg+(0xe0-_ewg)*_eyePale);_ewb=Math.round(_ewb+(0xd8-_ewb)*_eyePale);
      var _eyeWhite='#'+('0'+_ewr.toString(16)).slice(-2)+('0'+_ewg.toString(16)).slice(-2)+('0'+_ewb.toString(16)).slice(-2);
      var _epr=Math.round(0x1a+(0x6a-0x1a)*_eyePale),_epg=Math.round(0x08+(0x5a-0x08)*_eyePale),_epb=Math.round(0x00+(0x4a-0x00)*_eyePale);
      var _eyePupil='#'+('0'+_epr.toString(16)).slice(-2)+('0'+_epg.toString(16)).slice(-2)+('0'+_epb.toString(16)).slice(-2);
      ctx.fillStyle=_eyeWhite;
      ctx.beginPath();ctx.arc(ex1,ey1,sr*0.25,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(ex2,ey2,sr*0.25,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=_eyePupil;
      ctx.beginPath();ctx.arc(ex1+Math.cos(ang)*1.2,ey1+Math.sin(ang)*1.2,sr*0.12,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(ex2+Math.cos(ang)*1.2,ey2+Math.sin(ang)*1.2,sr*0.12,0,Math.PI*2);ctx.fill();
    }
  }
}

// ── draw() ───────────────────────────────────────────────────────────────
function draw() {
  if (!W || !H) return;
  ctx.clearRect(0, 0, W, H);
  dayTime = getRealDayTime();
  centreOffsetX = W > WORLD_W ? Math.floor((W - WORLD_W) / 2) : 0;
  ctx.save();
  ctx.translate(centreOffsetX - camX, 0);
  var b = getBinCached();

  var _rawPileTopY = H * 0.97 + 50;
  for (var dpi = 0; dpi < trashChunks.length; dpi++) {
    var dptc = trashChunks[dpi];
    if (!dptc.gone) {
      var dpTop = dptc.y - dptc.sz * dptc.hpFrac;
      if (dpTop < _rawPileTopY) _rawPileTopY = dpTop;
    }
  }
  if (window._smoothPileTopY == null) window._smoothPileTopY = _rawPileTopY;
  window._smoothPileTopY += (_rawPileTopY - window._smoothPileTopY) * 0.08;
  var drawPileTopY = window._smoothPileTopY;

  var lidScreenY = H * 0.5 - camY;
  var horizScreenY = 3*H - camY;
  var skyCols = skyCol(dayTime);
  var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  var hf = horizScreenY / H;
  skyGrad.addColorStop(0, skyCols[0]);
  if (hf > 0.01 && hf < 0.99) {
    skyGrad.addColorStop(Math.min(0.98, hf - 0.02), skyCols[1]);
    skyGrad.addColorStop(Math.min(0.99, hf), '#6b4c28');
    skyGrad.addColorStop(Math.min(1.0, hf + 0.06), '#3a2810');
  } else if (hf <= 0.01) {
    skyGrad.addColorStop(0, '#3a2810');
  } else {
    skyGrad.addColorStop(0.98, skyCols[1]);
  }
  skyGrad.addColorStop(1, '#2a1e0c');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-centreOffsetX, 0, WORLD_W, H);

  var skyHeight = Math.max(0, lidScreenY);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, WORLD_W, Math.max(1, skyHeight)); ctx.clip();
  var starAlpha = dayTime<0.22?1:dayTime<0.30?1-(dayTime-0.22)/0.08:dayTime>0.78?1:dayTime>0.70?(dayTime-0.70)/0.08:0;
  if (starAlpha > 0.02) {
    ctx.globalAlpha = starAlpha;
    for (var si = 0; si < _starPos.length; si++) {
      var twinkle = 0.5 + 0.5*Math.sin(frame*0.04 + si*1.7);
      ctx.globalAlpha = starAlpha * (0.4 + 0.6*twinkle);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(_starPos[si][0]*WORLD_W, _starPos[si][1]*skyHeight, 1.2, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  var isDay = dayTime >= 0.25 && dayTime <= 0.75;
  if (isDay) {
    var sunT = (dayTime - 0.25) / 0.50;
    var sunX = WORLD_W * (0.15 + sunT * 0.70);
    var sunY = horizScreenY - Math.sin(sunT * Math.PI) * H * 1.2;
    if (sunY < H + 30 && sunY > -80) {
      var sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 80);
      var sunBright = sunT < 0.1 || sunT > 0.9 ? 0.4 : 0.25;
      sunGlow.addColorStop(0, 'rgba(255,230,100,'+sunBright+')');
      sunGlow.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath(); ctx.arc(sunX, sunY, 80, 0, Math.PI*2); ctx.fill();
      var sunCol = sunT<0.15||sunT>0.85?'#ff8030':sunT<0.3||sunT>0.7?'#ffbb40':'#fff7a0';
      ctx.fillStyle = sunCol;
      ctx.beginPath(); ctx.arc(sunX, sunY, 18, 0, Math.PI*2); ctx.fill();
    }
  } else {
    var moonT = (((dayTime - 0.75) % 1 + 1) % 1) / 0.50;
    moonT = Math.min(1, Math.max(0, moonT));
    var moonX = WORLD_W * (0.12 + moonT * 0.76);
    var moonY = horizScreenY - Math.sin(moonT * Math.PI) * H * 1.0;
    if (moonY < H + 20 && moonY > -60) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#e8e0c8';
      ctx.beginPath(); ctx.arc(moonX, moonY, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = skyCols[0];
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(moonX+5, moonY, 12, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // Background ground plane
  {
    var gTop = Math.max(0, Math.min(H, horizScreenY));
    var gH = H - gTop;
    if (gH > 0) {
      ctx.fillStyle = '#3a8018';
      ctx.fillRect(-centreOffsetX, gTop, WORLD_W, gH);
    }
  }

  // Tier bands
  for (var i = 0; i < 4; i++) {
    var sy = i*H - camY;
    var _skipBot = (i === 1) ? 3*H + H*0.25 - camY : sy + H;
    if (sy > H+4 || _skipBot < -4) continue;
    if (i === 0) {
      var t0LidScreenY = H * 0.5 - camY;
      var t0DrawTop = Math.max(sy, t0LidScreenY);
      var t0DrawH = (sy + H) - t0DrawTop;
      if (t0DrawH > 0) { ctx.fillStyle = TIERS[i].bg; ctx.fillRect(b.cx-b.bw2, t0DrawTop, b.bw, t0DrawH); }
    } else if (i === 1) {
      var t12Top = H - camY;
      var t12Bottom = 3*H + H*0.25 - camY;
      var t12VisTop = Math.max(t12Top, -4);
      var t12VisBottom = Math.min(t12Bottom, H + 4);
      if (t12VisBottom > t12VisTop) {
        var e = castingEnrichment;
        var mw = Math.min(1, window._moisture || 0);
        var t12Grad = ctx.createLinearGradient(0, t12Top, 0, t12Bottom);
        var _sgs = getSoilGradStops(e, mw);
        t12Grad.addColorStop(0, '#8b6340');
        t12Grad.addColorStop(0.443, '#8b6340');
        t12Grad.addColorStop(0.444, _sgs[0]);
        t12Grad.addColorStop(0.62, _sgs[1]);
        t12Grad.addColorStop(0.80, _sgs[2]);
        t12Grad.addColorStop(0.888, _sgs[3]);
        t12Grad.addColorStop(0.889, '#2e3d58');
        t12Grad.addColorStop(0.95, '#1e2a44');
        t12Grad.addColorStop(1, '#161f33');
        ctx.fillStyle = t12Grad;
        ctx.fillRect(b.cx-b.bw2, t12VisTop, b.bw, t12VisBottom - t12VisTop);
      }
    }
    if (i === 0) {
      var emptyScreenY = drawPileTopY - camY;
      var airTop = H * 0.5 - camY;
      var emptyH2 = Math.max(0, emptyScreenY - airTop);
      var pileScreenY = Math.max(airTop, emptyScreenY);
      if (emptyH2 > 0) {
        var airGrad = ctx.createLinearGradient(0, airTop, 0, pileScreenY);
        airGrad.addColorStop(0, '#4a5a7a');
        airGrad.addColorStop(0.35, '#3a4a6a');
        airGrad.addColorStop(1, '#2e3d58');
        ctx.fillStyle = airGrad;
        var airDrawH = Math.min(emptyH2, sy + H - airTop);
        ctx.fillRect(b.cx-b.bw2, airTop, b.bw, airDrawH);
      }
    }
    if (i < 3) {
      for (var h = 0; h < 8; h++) {
        var hx = b.cx-b.bw2+20 + h*(b.bw-40)/7;
        ctx.fillStyle = '#1a2535';
        ctx.beginPath(); ctx.arc(hx, sy+H-4, 2.5, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  drawPath(pPath);

  // Sump chamber
  var sumpTop = 3*H - camY;
  var sumpBottom = 3*H + H*0.25 - camY;
  if (sumpBottom > -10 && sumpTop < H + 10) {
    var sumpDrawTop = Math.max(sumpTop, -4);
    var sumpDrawH = Math.min(sumpBottom, H+4) - sumpDrawTop;
    if (sumpDrawH > 0) {
      ctx.strokeStyle = 'rgba(80,120,180,0.22)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.cx-b.bw2+3, sumpDrawTop); ctx.lineTo(b.cx-b.bw2+3, sumpDrawTop+sumpDrawH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.cx+b.bw2-3, sumpDrawTop); ctx.lineTo(b.cx+b.bw2-3, sumpDrawTop+sumpDrawH); ctx.stroke();
      if (tLvl > 0) {
        var teaHeight = tLvl * (sumpBottom - sumpTop);
        var teaSurf = sumpBottom - teaHeight;
        var teaSurfClipped = Math.max(sumpDrawTop, teaSurf);
        var teaDrawH = Math.min(sumpBottom, H+4) - teaSurfClipped;
        if (teaDrawH > 0) {
          var teaGrad = ctx.createLinearGradient(0, teaSurf, 0, sumpBottom);
          teaGrad.addColorStop(0, 'rgba(120,160,40,0.82)');
          teaGrad.addColorStop(1, 'rgba(70,110,20,0.95)');
          ctx.fillStyle = teaGrad;
          ctx.fillRect(b.cx-b.bw2+4, teaSurfClipped, b.bw-8, teaDrawH);
        }
      }
    }
  }

  // Bin lid
  var coverY = H * 0.5 - camY;
  var cw = b.bw + 30;
  var lidH = 22;
  var lidRimH = 10;
  var lidY = coverY;
  if (lidY > -H && lidY < H + 40) {
    ctx.fillStyle = '#2a3650';
    ctx.fillRect(b.cx-b.bw2+2, lidY, b.bw-4, lidRimH);
    var lidTop = lidY - lidH;
    ctx.save();
    ctx.translate(b.cx + cw/2, lidTop); ctx.rotate(0); ctx.translate(-(b.cx + cw/2), -lidTop);
    ctx.fillStyle = '#1e2a40';
    ctx.fillRect(b.cx-cw/2, lidY - 4, cw, 6);
    var lidGrad = ctx.createLinearGradient(0, lidTop, 0, lidY);
    lidGrad.addColorStop(0, '#5a6e92'); lidGrad.addColorStop(0.7, '#3a4a6a'); lidGrad.addColorStop(1, '#2e3d58');
    ctx.fillStyle = lidGrad;
    ctx.beginPath(); ctx.roundRect(b.cx-cw/2, lidTop, cw, lidH, [4,4,2,2]); ctx.fill();
    ctx.fillStyle = '#6a7ea8';
    ctx.beginPath(); ctx.roundRect(b.cx-cw/2+2, lidTop+1, cw-4, 4, 2); ctx.fill();
    var hndY = lidTop - 12;
    ctx.fillStyle = '#2a3848';
    ctx.beginPath(); ctx.roundRect(b.cx-36, hndY+2, 72, 14, 4); ctx.fill();
    var hndGrad = ctx.createLinearGradient(0, hndY-8, 0, hndY+16);
    hndGrad.addColorStop(0, '#6a7ea8'); hndGrad.addColorStop(1, '#3a4e6e');
    ctx.fillStyle = hndGrad;
    ctx.beginPath(); ctx.roundRect(b.cx-30, hndY-8, 60, 18, [8,8,3,3]); ctx.fill();
    var ventHoleXs = [b.cx-b.bw2*0.55, b.cx-b.bw2*0.25, b.cx, b.cx+b.bw2*0.25, b.cx+b.bw2*0.55];
    var ventY = lidTop + lidH * 0.52;
    for (var vi2 = 0; vi2 < ventHoleXs.length; vi2++) {
      var vhx = ventHoleXs[vi2];
      ctx.fillStyle = '#141e30'; ctx.beginPath(); ctx.arc(vhx, ventY, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#0a1020'; ctx.beginPath(); ctx.arc(vhx, ventY, 4.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    var wallTop2 = Math.max(0, H * 0.5 - camY);
    var wallBot2 = 3*H + H*0.25 - camY + 6;
    if (wallBot2 > wallTop2 && wallBot2 > 0 && wallTop2 < H) {
      var wDraw = Math.min(wallBot2, H) - Math.max(wallTop2, 0);
      if (wDraw > 0) {
        ctx.fillStyle = '#3a4a6a';
        ctx.fillRect(b.cx-b.bw2-6, Math.max(wallTop2,0), 6, wDraw);
        ctx.fillRect(b.cx+b.bw2, Math.max(wallTop2,0), 6, wDraw);
      }
    }
  }

  // Stand legs
  var bsy = 3*H + H*0.25 - camY;
  if (bsy > -10 && bsy < H + 130) {
    ctx.fillStyle = '#2e3d58';
    ctx.fillRect(b.cx-b.bw2-5, bsy-6, b.bw+10, 10);
    ctx.fillStyle = '#4a5e7a';
    ctx.fillRect(b.cx-b.bw2-5, bsy-6, b.bw+10, 3);
    var sLegH=80,sLegW=8,sFootW=14,sFootH=7;
    var sLegCol='#1a1c26',sLegHL='#2c3040',sFootC='#0e0e14';
    var sLegXs=[b.cx-b.bw2+20, b.cx-b.bw2+b.bw*0.36, b.cx+b.bw2-b.bw*0.36, b.cx+b.bw2-20];
    var xRailY2 = bsy + sLegH * 0.50;
    ctx.fillStyle = sLegCol;
    ctx.fillRect(sLegXs[0], xRailY2-3, sLegXs[3]-sLegXs[0], 6);
    for (var li = 0; li < sLegXs.length; li++) {
      var slx=sLegXs[li]-sLegW/2,sFx=sLegXs[li]-sFootW/2;
      var splay=(li===0)?-3:(li===3)?3:0;
      var lTop=bsy+4,lBot=bsy+sLegH-sFootH;
      ctx.beginPath();
      ctx.moveTo(slx,lTop);ctx.lineTo(slx+sLegW,lTop);
      ctx.lineTo(slx+sLegW+splay,lBot);ctx.lineTo(slx+splay,lBot);
      ctx.closePath();ctx.fillStyle=sLegCol;ctx.fill();
      ctx.beginPath();
      ctx.moveTo(slx+1,lTop);ctx.lineTo(slx+3,lTop);
      ctx.lineTo(slx+3+splay,lBot);ctx.lineTo(slx+1+splay,lBot);
      ctx.closePath();ctx.fillStyle=sLegHL;ctx.fill();
      ctx.beginPath();ctx.roundRect(sFx+splay,lBot,sFootW,sFootH,[0,0,3,3]);
      ctx.fillStyle=sFootC;ctx.fill();
    }
    ctx.restore(); // closes stand legs ctx.save (the outer ctx.save from translate)
  }

  // Worm
  drawWorm(pSegs, pSR, getGenColor(generation), pSleeping, pAcid, pHP);

  // Restore to screen space
  ctx.restore();

  // Cursor dot — screen space
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(mX - camX, mY - camY, 4, 0, Math.PI*2);
  ctx.fill();

  // HUD — minimal: HP + gut bars only
  var _barX=10,_barY=50,_barW=170,_barH=10,_barR=4,_barGap=4;
  var gutFracHUD=Math.min(1,pGut/pGutMax);
  var _hpGenCol=getGenColor(generation);
  var _hpR=parseInt(_hpGenCol.slice(1,3),16),_hpG=parseInt(_hpGenCol.slice(3,5),16),_hpB=parseInt(_hpGenCol.slice(5,7),16);
  var hpCol='rgb('+_hpR+','+_hpG+','+_hpB+')';
  ctx.fillStyle='rgba(10,20,8,0.85)';
  ctx.beginPath();ctx.roundRect(_barX,_barY,_barW,_barH,_barR);ctx.fill();
  var _hpFillW=Math.max(0,Math.round((_barW-2)*pHP));
  if(_hpFillW>0){ctx.fillStyle=hpCol;ctx.beginPath();ctx.roundRect(_barX+1,_barY+1,_hpFillW,_barH-2,_barR-1);ctx.fill();}
  ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(_barX+0.5,_barY+0.5,_barW-1,_barH-1,_barR);ctx.stroke();
  var _gutY=_barY+_barH+_barGap;
  ctx.fillStyle='rgba(10,20,8,0.85)';
  ctx.beginPath();ctx.roundRect(_barX,_gutY,_barW,_barH,_barR);ctx.fill();
  var _gutFillW=Math.max(0,Math.round((_barW-2)*gutFracHUD));
  if(_gutFillW>0){ctx.fillStyle='rgb(90,52,14)';ctx.beginPath();ctx.roundRect(_barX+1,_gutY+1,_gutFillW,_barH-2,_barR-1);ctx.fill();}
  ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(_barX+0.5,_gutY+0.5,_barW-1,_barH-1,_barR);ctx.stroke();

  // T-00: Demo death screen
  if (_demoDead && _demoDeadFade > 0) {
    ctx.save();
    ctx.globalAlpha = _demoDeadFade;
    ctx.fillStyle = 'rgba(8,4,1,0.88)';
    ctx.fillRect(0, 0, W, H);
    var _dtx=W/2,_dty=H/2-60;
    ctx.font="bold 28px 'Fredoka One', sans-serif";
    ctx.textAlign='center';
    var _dtg=ctx.createLinearGradient(_dtx-120,0,_dtx+120,0);
    _dtg.addColorStop(0,'#f5a623');_dtg.addColorStop(0.5,'#ffd580');_dtg.addColorStop(1,'#d4880a');
    ctx.fillStyle=_dtg;
    ctx.fillText("Your worm didn't make it.",_dtx,_dty);
    ctx.font='15px sans-serif';ctx.fillStyle='#f0e8d8';
    ctx.fillText('The bin is unforgiving at first.',_dtx,_dty+36);
    ctx.fillText('Every worm gets better with practice.',_dtx,_dty+58);
    var _bw=160,_bh=44,_bx=_dtx-_bw/2,_by=_dty+90;
    _demoDeadBtn={x:_bx,y:_by,w:_bw,h:_bh};
    var _bbg=ctx.createLinearGradient(_bx,_by,_bx,_by+_bh);
    _bbg.addColorStop(0,'rgba(212,136,10,0.22)');_bbg.addColorStop(1,'rgba(212,136,10,0.08)');
    ctx.fillStyle=_bbg;ctx.beginPath();ctx.roundRect(_bx,_by,_bw,_bh,8);ctx.fill();
    ctx.strokeStyle='#d4880a';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.roundRect(_bx,_by,_bw,_bh,8);ctx.stroke();
    ctx.font="bold 16px 'Fredoka One', sans-serif";ctx.fillStyle='#ffd580';
    ctx.fillText('Try Again',_dtx,_by+_bh*0.64);
    ctx.restore();
  }
}

// ── updatePlayer — T-01 skeleton ─────────────────────────────────────────
function updatePlayer(){
  if(_demoDead)return;
  if(!pSegs.length)return;

  if(pSleeping){
    pSleepCurl=Math.min(1,pSleepCurl+0.04);
    for(var si=0;si<pSegs.length;si++){
      var coilAngle=(si/pSegs.length)*Math.PI*2*1.5*pSleepCurl;
      var coilR=pSR*1.2*pSleepCurl*Math.min(1,si/3);
      pSegs[si].x+=(pSleepX+Math.cos(coilAngle)*coilR-pSegs[si].x)*0.18;
      pSegs[si].y+=(pSleepY+Math.sin(coilAngle)*coilR*0.6-pSegs[si].y)*0.18;
    }
    if(!viewMode){
      var tc3=pSleepY-H/2;
      camY+=(Math.max(0,Math.min(3*H+H*0.25-H+120,tc3))-camY)*0.04;
      camY=Math.round(camY);
    }
    return;
  }

  var head=pSegs[0];
  var lowestScrapY=getLowestScrapY();
  var wormCeiling=Math.max(4,lowestScrapY-pSR);
  var dx=mX-head.x,dy=mY-head.y;
  var d=Math.sqrt(dx*dx+dy*dy);
  var spd=0.40;
  var headTier=getTier(head.y);
  var pileZoneTop=H*0.7,pileZoneBot=H*0.7;
  for(var pzi=0;pzi<trashChunks.length;pzi++){
    var pztc=trashChunks[pzi];
    if(!pztc.gone){var pzBot=pztc.y+pztc.sz*pztc.hpFrac;if(pzBot>pileZoneBot)pileZoneBot=pzBot;}
  }
  pileZoneBot=Math.max(pileZoneBot,pileZoneTop+10);
  if(head.y>=pileZoneTop&&head.y<=pileZoneBot){spd=0.30;}
  else if(inCompost(head.y)){var t=compostDepth(head.y);spd=0.30-t*0.08;}

  if(d>2){
    var dn=d||1;
    var fwdX=dx/dn,fwdY=dy/dn;
    var perpX=-fwdY,perpY=fwdX;
    var steerAmp=Math.min(0.10,0.08+Math.pow(pSR-4,1.8)*0.008);
    var steerFreq=0.08/(1+(pSR-4)*0.3);
    var steerOffset=Math.sin(frame*steerFreq)*steerAmp;
    head.x+=fwdX*spd+perpX*steerOffset;
    head.y+=fwdY*spd+perpY*steerOffset;
  }
  var b2=getBinCached();
  head.x=Math.max(b2.cx-b2.bw2+4,Math.min(b2.cx+b2.bw2-4,head.x));
  head.y=Math.max(wormCeiling,Math.min(3*H-pSR,head.y));

  pHist.push({x:head.x,y:head.y});
  var spacing=pSR*1.4;
  var needed=Math.min(pSEG*Math.ceil(spacing)+300,6000);
  while(pHist.length>needed)pHist.shift();

  for(var i=1;i<pSegs.length;i++){
    var target=i*spacing,cum=0,placed=false;
    for(var j=pHist.length-1;j>0;j--){
      var ddx=pHist[j].x-pHist[j-1].x,ddy=pHist[j].y-pHist[j-1].y;
      cum+=Math.sqrt(ddx*ddx+ddy*ddy);
      if(cum>=target){pSegs[i].x=pHist[j].x;pSegs[i].y=pHist[j].y;placed=true;break;}
    }
    if(!placed&&pHist.length>0){pSegs[i].x=pHist[0].x;pSegs[i].y=pHist[0].y;}
    if(pSegs[i].y<wormCeiling)pSegs[i].y=wormCeiling;
  }

  // Tunnel carve
  var _hmx = head.x - (window._lastHeadX || head.x);
  var _hmy = head.y - (window._lastHeadY || head.y);
  var _hmoved = Math.sqrt(_hmx*_hmx + _hmy*_hmy);
  window._lastHeadX = head.x; window._lastHeadY = head.y;
  var _atSump = head.y >= 3*H - pSR - 2;
  if (!_atSump && _hmoved > 0.05 && addPoint(pPath, head.x, head.y, pSR, pLastX, pLastY)) {
    pLastX = head.x; pLastY = head.y;
  }

  // Camera — slow smooth lerp to follow worm (suppressed in viewMode)
  if (!viewMode) {
    var tc = head.y - H/2;
    camY += (Math.max(0, Math.min(3*H + H*0.25 - H + 120, tc)) - camY) * 0.04;
    if (W < WORLD_W) {
      var _b0 = getBinCached();
      var _binLeft  = _b0.cx - _b0.bw2;
      var _binRight = _b0.cx + _b0.bw2;
      var _camXTarget = head.x - W/2;
      var _camXMin = _binLeft - 20;
      var _camXMax = Math.max(_camXMin, _binRight - W + 20);
      camX += (Math.max(_camXMin, Math.min(_camXMax, _camXTarget)) - camX) * 0.04;
      camX = Math.round(camX);
    } else {
      camX = 0;
    }
  }

  if(pHP<=0&&!_demoDead){_demoDead=true;_demoDeadFade=0;}
}

function updatePhysics(){if(_demoDead)return;}

function loop(){
  requestAnimationFrame(loop);
  if(_demoDead&&_demoDeadFade<1)_demoDeadFade=Math.min(1,_demoDeadFade+0.025);
  resizeCanvas();frame++;
  dayTime=getRealDayTime();
  if(!_demoDead){updatePlayer();updatePhysics();}
  draw();
}

// ── Input ─────────────────────────────────────────────────────────────────
function _toCanvas(clientX,clientY){
  var r=root.getBoundingClientRect();
  return{x:clientX-r.left,y:clientY-r.top};
}
root.addEventListener('mousemove',function(e){
  var p=_toCanvas(e.clientX,e.clientY);
  mX=p.x-centreOffsetX+camX;mY=p.y+camY;
});
root.addEventListener('click',function(e){
  if(_demoDead){
    if(_demoDeadBtn){var p=_toCanvas(e.clientX,e.clientY),b=_demoDeadBtn;if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h)_restartDemo();}
    return;
  }
  var _cp=_toCanvas(e.clientX,e.clientY);
  if(!viewMode){mX=_cp.x-centreOffsetX+camX;mY=_cp.y+camY;}
});

var _gesture={lpTimer:null,lpStartX:0,lpStartY:0,lpActive:false,lpStart:0,lpDur:600,peakCount:0,swipeStartX:0,swipeStartY:0,swipeStartT:0,swipeLive:false,_viewDragLastY:null};
function _cancelLP(){if(_gesture.lpTimer){clearTimeout(_gesture.lpTimer);_gesture.lpTimer=null;}_gesture.lpActive=false;}

root.addEventListener('touchmove',function(e){
  e.preventDefault();if(_demoDead)return;
  var _tp=_toCanvas(e.touches[0].clientX,e.touches[0].clientY),tx=_tp.x,ty=_tp.y;
  if(viewMode&&pSleeping){
    if(_gesture._viewDragLastY!=null)viewCamY-=(ty-_gesture._viewDragLastY);
    _gesture._viewDragLastY=ty;return;
  }
  mX=tx-centreOffsetX+camX;mY=ty+camY;
  if(_gesture.lpActive){var _d=Math.sqrt(Math.pow(mX-_gesture.lpStartX,2)+Math.pow(ty-_gesture.lpStartY,2));if(_d>15)_cancelLP();}
},{passive:false});

root.addEventListener('touchstart',function(e){
  e.preventDefault();
  if(_demoDead){
    if(_demoDeadBtn){var p0=_toCanvas(e.touches[0].clientX,e.touches[0].clientY),b0=_demoDeadBtn;if(p0.x>=b0.x&&p0.x<=b0.x+b0.w&&p0.y>=b0.y&&p0.y<=b0.y+b0.h)_restartDemo();}
    return;
  }
  var _p=_toCanvas(e.touches[0].clientX,e.touches[0].clientY),tx=_p.x,ty=_p.y,now=performance.now(),n=e.touches.length;
  if(n===1){mX=tx-centreOffsetX+camX;mY=ty+camY;}
  if(n>_gesture.peakCount)_gesture.peakCount=n;
  if(n===1){
    _gesture.swipeStartX=tx;_gesture.swipeStartY=ty;_gesture.swipeStartT=now;_gesture.swipeLive=true;_gesture._viewDragLastY=null;
    if(!_gesture.lpActive){
      _gesture.lpStartX=tx;_gesture.lpStartY=ty;_gesture.lpStart=now;_gesture.lpActive=true;_gesture.peakCount=1;
      _gesture.lpTimer=setTimeout(function(){if(_gesture.lpActive){_gesture.lpActive=false;}},_gesture.lpDur);
    }
  }else{_cancelLP();}
},{passive:false});

root.addEventListener('touchend',function(e){
  e.preventDefault();if(_demoDead)return;
  if(e.touches.length===0){
    _cancelLP();_gesture._viewDragLastY=null;
    var peak=_gesture.peakCount;_gesture.peakCount=0;_gesture.swipeLive=false;
  }
},{passive:false});

root.addEventListener('touchcancel',function(){_cancelLP();},{passive:false});
document.addEventListener('keydown',function(e){
  if(e.key===' '){e.preventDefault();}
});

window.addEventListener('resize',resizeCanvas);
setup();
  