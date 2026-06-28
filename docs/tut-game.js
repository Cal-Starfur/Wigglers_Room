// ============================================================================
// tut-game.js — Wigglers Room Tutorial
// Purpose-built for the tutorial experience. NOT a port of demo-game.js.
// Teaches: eat → acid → poop → drain → cocoon → sleep in a clean staged bin.
// Loaded by demo.html via dynamic script inject on _enterBin().
// window._demoMode = true is set by demo.html before this runs.
// ============================================================================

'use strict';

// ── Canvas + context ─────────────────────────────────────────────────────────
var canvas = document.getElementById('gameCanvas') || document.getElementById('c');
var ctx    = canvas.getContext('2d');

// ── Viewport ─────────────────────────────────────────────────────────────────
var W = 0, H = 0;
var WORLD_W = 480;  // tutorial bin is narrower than the full game — focused, not panoramic
var camY = 0;       // vertical scroll: world Y at top of screen
var camX = 0;       // horizontal offset (unused at tutorial width, kept for getBin compat)
var centreOffsetX = 0;

function resizeCanvas() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  centreOffsetX = W > WORLD_W ? Math.floor((W - WORLD_W) / 2) : 0;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── World geometry ────────────────────────────────────────────────────────────
// Y increases downward. H = one tier height.
// Tier 0 (scraps): y 0..H       ← worm starts here, food pile lives here
// Tier 1 (soil):   y H..2H      ← main tunneling zone, tier-1 scraps
// Tier 2 (compost):y 2H..3H     ← poop for bonus, drain, cocoon, sleep
// Sump:            y 3H+         ← worm tea (not shown in tutorial)

function cSurf()       { return 3 * H; }          // compost floor / sump top
function inCompost(wy) { return wy >= 2*H && wy < cSurf(); }
function getTier(wy)   { return wy < H ? 0 : wy < 2*H ? 1 : wy < cSurf() ? 2 : 3; }

function getBin() {
  var bw = Math.min(WORLD_W - 40, W - 40);
  var cx = centreOffsetX + WORLD_W / 2;
  return { cx: cx, bw: bw, bw2: bw / 2, lw: 4 };
}
function getBinCached() { return getBin(); }  // no caching needed at tutorial scale

// ── OffscreenCanvas support ────────────────────────────────────────────────────
var _ofcSupported = (function() {
  try { new OffscreenCanvas(1,1).getContext('2d'); return true; } catch(e) { return false; }
})();

// ── Frame counter ─────────────────────────────────────────────────────────────
var frame = 0;

// ── Perf HUD ──────────────────────────────────────────────────────────────────
var _PERF = /[?&]perf=1/.test(window.location.search || '');
var _perf = { sim: 0, draw: 0, fps: 60, last: 0 };

// ── Input ─────────────────────────────────────────────────────────────────────
var mX = WORLD_W / 2, mY = H * 1.5;   // move target in world coords
var _pointerDown = false;

function _worldX(screenX) { return screenX - centreOffsetX + camX; }
function _worldY(screenY) { return screenY + camY; }

canvas.addEventListener('pointermove', function(e) {
  if (_pointerDown) { mX = _worldX(e.clientX); mY = _worldY(e.clientY); }
});
canvas.addEventListener('pointerdown', function(e) {
  _pointerDown = true;
  mX = _worldX(e.clientX); mY = _worldY(e.clientY);
  // Double-tap / two-finger: poop
  if (e.isPrimary === false || (e.pointerType === 'touch' && e.pointerId > 1)) {
    _tryPoop();
  }
});
canvas.addEventListener('pointerup',   function() { _pointerDown = false; });
canvas.addEventListener('pointerleave',function() { _pointerDown = false; });

window.addEventListener('keydown', function(e) {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); _tryPoop(); }
  if (e.key === 's' || e.key === 'S')     { _trySleep(); }
  if (e.key === 'e' || e.key === 'E')     { _tryLayCocoon(); }
});

// ── Player worm ───────────────────────────────────────────────────────────────
var pSegs = [];          // [{x,y}] head is index 0
var pSR   = 6;           // worm radius px
var pSEG  = 6;           // segment count
var pHP   = 1.0;         // health 0–1
var pGut  = 0;           // gut fill 0..pGutMax
var pGutMax = 1.0;
var pAcid = 0;           // acid buildup 0–1
var pSleeping = false;
var karma = 0;
var pPath = [];          // tunnel points

var _HEAD_SPD = 2.2;     // px/frame at full health
var _pHistLen = 40;      // segment history length

// Spawn worm in the middle of tier 1
function spawnWorm() {
  var b = getBin();
  pSegs = [];
  var sx = b.cx, sy = H + H * 0.35;
  for (var i = 0; i < _pHistLen + pSEG + 4; i++) {
    pSegs.push({ x: sx, y: sy });
  }
  camY = Math.max(0, sy - H * 0.55);
  pHP = 1.0; pGut = 0.3; pAcid = 0; pSleeping = false;
  pPath = [];
  karma = 0;
  mX = sx; mY = sy - H * 0.2;
}

// ── Scraps (tier-1 food fragments) ───────────────────────────────────────────
var scraps = [];

function scrapsPush(s) { scraps.push(s); }

// ── Tunnel carving ────────────────────────────────────────────────────────────
var MAX_PPATH = 200;

function _carvePoint(x, y) {
  if (pPath.length >= MAX_PPATH) pPath.shift();
  pPath.push({ x: x, y: y, r: pSR });
}

// ── Poop ───────────────────────────────────────────────────────────────────────
var _poopCooldown = 0;

function _tryPoop() {
  if (pSleeping) return;
  if (pGut < 0.18) return;   // nothing to poop
  if (_poopCooldown > 0) return;
  pGut = Math.max(0, pGut - 0.55);
  karma += 8;
  _poopCooldown = 90;
  if (inCompost(pSegs[0].y)) {
    tutorial._compostPooped = true;
    tutorial._reliefPooped  = true;
    karma += 22;   // compost bonus
  } else {
    tutorial._reliefPooped = true;
  }
}

// ── Sleep ──────────────────────────────────────────────────────────────────────
function _trySleep() {
  if (!inCompost(pSegs[0].y)) return;
  pSleeping = !pSleeping;
  if (pSleeping && tutorial.active && tutorial.scene) {
    if (tutorial.done) { _tutFinish(); return; }
    var _cs = tutorial.steps && tutorial.steps[tutorial.stepIndex];
    if (_cs && _cs.kind === 'sleep') { /* predicate handled in _tutStepDone */ }
  }
}

// ── Cocoon ─────────────────────────────────────────────────────────────────────
var cocoons = [];
var _cocoonCooldown = 0;

function _tryLayCocoon() {
  if (!inCompost(pSegs[0].y)) return;
  if (pGut < 0.4) return;
  if (_cocoonCooldown > 0) return;
  var b = getBin();
  cocoons.push({ x: pSegs[0].x, y: pSegs[0].y, t: 0 });
  pGut = Math.max(0, pGut - 0.4);
  karma += 20;
  _cocoonCooldown = 300;
  if (tutorial.scene) tutorial._cocoonDone = true;
}

// ── Drain (simplified — no tea physics, just the beat) ────────────────────────
var _atSump = false;
var _sumpHadDown = false;
var _drainHoldFrames = 0;
var DRAIN_HOLD = 70;   // frames to hold on the dot

// ── TRASH_TYPES (food appearance data for drawDebrisFragment) ─────────────────
var TRASH_TYPES = [
  {name:'lettuce',          liq:3, hp:2750, pts:9,  sz:54, debrisCol:'#60a830', debrisCol2:'#90d050'},
  {name:'watermelon_chunk', liq:5, hp:4000, pts:8,  sz:57, debrisCol:'#e03040', debrisCol2:'#60c040'},
  {name:'egg_shell',        liq:0, hp:3000, pts:9,  sz:36, debrisCol:'#d8d0b0', debrisCol2:'#f0e8c8'},
  {name:'overripe_fruit',   liq:9, hp:2750, pts:9,  sz:48, debrisCol:'#8a3080', debrisCol2:'#d06090', acid:0.7},
  {name:'bread_crust',      liq:1, hp:5500, pts:6,  sz:48, debrisCol:'#c89840', debrisCol2:'#e8c060'},
  {name:'apple_core',       liq:6, hp:4000, pts:7,  sz:33, debrisCol:'#c84030', debrisCol2:'#f06050', acid:0.3},
  {name:'pizza',            liq:2, hp:9000, pts:8,  sz:57, debrisCol:'#c8784a', debrisCol2:'#f0a060'},
  {name:'banana_peel',      liq:3, hp:5000, pts:6,  sz:42, debrisCol:'#c8a810', debrisCol2:'#f0d040'},
  {name:'tea_bag',          liq:5, hp:3500, pts:10, sz:27, debrisCol:'#7a4820', debrisCol2:'#b07840'},
  {name:'broccoli',         liq:2, hp:4250, pts:9,  sz:45, debrisCol:'#3a8828', debrisCol2:'#60b840'},
  {name:'mushroom',         liq:3, hp:3500, pts:10, sz:39, debrisCol:'#c8a880', debrisCol2:'#f0e0c0'},
];

// ── Tutorial state ─────────────────────────────────────────────────────────────
var tutorial = {
  active: true,   // always on — this file IS the tutorial
  scene:  true,
  live:   false,
  debug:  /[?&](leash|tutdbg)=1/.test(window.location.search || ''),
  steps:      [],
  stepIndex:  0,
  target:     null,
  extras:     null,
  panel:      null,
  leash:      null,
  done:       false,
  _doneFade:  0,
  _doneAt:    0,
  _finished:  false,
  _compostPooped: false,
  _reliefPooped:  false,
  _downDrainDone: false,
  _upDrainArmed:  false,
  _cocoonDone:    false,
  _freeStart:     0,
};

// ── Scrap draw ────────────────────────────────────────────────────────────────
// Lightweight shape per food type — same visual language as the full game's
// drawDebrisFragment, but only the types used in the tutorial curriculum.
function drawDebrisFragment(c, name, r, col, col2) {
  switch(name) {
    case 'lettuce':
      c.fillStyle = col2;
      c.beginPath(); c.ellipse(0, 0, r, r*0.65, 0.2, 0, Math.PI*2); c.fill();
      c.strokeStyle = col; c.lineWidth = r*0.28; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-r*0.55, 0); c.quadraticCurveTo(0, -r*0.5, r*0.55, 0); c.stroke();
      break;
    case 'watermelon_chunk':
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.fill();
      c.strokeStyle = col2; c.lineWidth = r*0.35;
      c.beginPath(); c.moveTo(-r*0.9, r*0.5); c.lineTo(r*0.9, r*0.5); c.stroke();
      break;
    case 'egg_shell':
      c.strokeStyle = col; c.lineWidth = r*0.42; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-r*0.8, r*0.2); c.quadraticCurveTo(0, -r*0.9, r*0.8, r*0.1); c.stroke();
      c.strokeStyle = col2; c.lineWidth = r*0.18;
      c.beginPath(); c.moveTo(-r*0.6, r*0.18); c.quadraticCurveTo(0, -r*0.65, r*0.6, r*0.06); c.stroke();
      break;
    case 'overripe_fruit':
      c.fillStyle = col;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.fill();
      c.fillStyle = col2; c.beginPath(); c.arc(r*0.2, -r*0.2, r*0.38, 0, Math.PI*2); c.fill();
      break;
    case 'bread_crust':
      c.fillStyle = col;
      c.beginPath(); c.ellipse(0, 0, r, r*0.55, 0.4, 0, Math.PI*2); c.fill();
      c.strokeStyle = col2; c.lineWidth = r*0.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-r*0.6, 0); c.lineTo(r*0.6, 0); c.stroke();
      break;
    default:
      c.fillStyle = col || '#a0c878';
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.fill();
  }
}

// ── Tier-0 chunk draw (acid pile) ─────────────────────────────────────────────
function drawPileChunk(c, name, r) {
  // overripe_fruit: soft purple blob with lighter highlight
  c.fillStyle = '#8a3080';
  c.beginPath();
  c.moveTo(-r*0.1, -r*0.88);
  c.bezierCurveTo(r*0.65, -r*0.8, r*0.92, -r*0.1, r*0.85, r*0.5);
  c.bezierCurveTo(r*0.7, r*0.92, -r*0.4, r*0.88, -r*0.82, r*0.55);
  c.bezierCurveTo(-r*1.0, r*0.1, -r*0.75, -r*0.62, -r*0.1, -r*0.88);
  c.closePath(); c.fill();
  c.fillStyle = '#d06090';
  c.beginPath(); c.ellipse(r*0.15, -r*0.22, r*0.36, r*0.22, 0.6, 0, Math.PI*2); c.fill();
}

// ── Tutorial spawn ─────────────────────────────────────────────────────────────
var _acidChunk = null;   // tier-0 acid pile item (module-level ref)

function spawnTutorialScene() {
  scraps = []; cocoons = []; pPath = [];
  _acidChunk = null;
  tutorial._compostPooped = false;
  tutorial._reliefPooped  = false;
  tutorial._downDrainDone = false;
  tutorial._upDrainArmed  = false;
  tutorial._cocoonDone    = false;
  tutorial._freeStart     = 0;
  tutorial.done           = false;
  tutorial._doneFade      = 0;
  tutorial._finished      = false;

  var b   = getBin();
  var xL  = b.cx - b.bw2 + 28, xR = b.cx + b.bw2 - 28;
  var span = xR - xL;

  // Helper: tier-1 scrap, tutProtected so the eat-gate locks it until it's the target
  function _tutFood(typeName, x, y) {
    var t = TRASH_TYPES.filter(function(z){ return z.name === typeName; })[0] || TRASH_TYPES[0];
    var sc = {
      x: x, y: y, t: t, hp: 5, maxHp: 5,
      sz: 9, rot: (Math.random()-0.5) * 0.8, rotSpd: 0,
      ti: 1, eaten: false, eating: false,
      tutProtected: true,
      col: t.debrisCol, col2: t.debrisCol2
    };
    scrapsPush(sc);
    return sc;
  }

  // Curriculum food — placed to make a readable left-to-right path for the worm
  var _starter = _tutFood('lettuce',          b.cx - span*0.08, H + H*0.40);
  var _lettuce  = _tutFood('lettuce',          xL + span*0.20,   H + H*0.52);
  var _melon    = _tutFood('watermelon_chunk', xL + span*0.52,   H + H*0.48);
  var _egg1     = _tutFood('egg_shell',        xL + span*0.56,   H + H*0.43);
  var _egg2     = _tutFood('egg_shell',        xL + span*0.68,   H + H*0.50);
  var _refuel   = _tutFood('watermelon_chunk', xL + span*0.34,   H + H*0.38);
  var _refuel2  = _tutFood('lettuce',          xL + span*0.46,   H + H*0.36);
  var _surface  = _tutFood('bread_crust',      xL + span*0.40,   H + H*0.62);
  _refuel._refuelTut = true;
  _refuel2._refuelTut = true;

  // Acid pile chunk (tier 0) — sits just above the food pile
  var acidSz = 22;
  _acidChunk = {
    x: b.cx, y: H*0.97 + 50 - acidSz*0.25,
    sz: acidSz, rot: 0, hp: 2750, maxHp: 2750, hpFrac: 1.0,
    being_eaten: false, gone: false, acid: 0.7,
    locked: false
  };
  tutorial.acidChunk = _acidChunk;

  // Non-edible beacons (guidance markers)
  var _poopSpot   = { x: b.cx,              y: 2*H + 0.5*(cSurf()-2*H), sz:16, eaten:false, gone:false, _zoneR:(cSurf()-2*H)*0.46, _zoneLine:true };
  var _downSpot   = { x: b.cx - span*0.14,  y: cSurf()-2,               sz:14, eaten:false, gone:false, _tutBeacon:true };
  var _cocoonSpot = { x: b.cx - span*0.08,  y: cSurf()-2,               sz:14, eaten:false, gone:false, _tutBeacon:true };
  var _upSpot     = { x: b.cx - span*0.04,  y: cSurf()-2,               sz:14, eaten:false, gone:false, _tutBeacon:true };
  var _sleepSpot  = { x: b.cx + span*0.12,  y: 2*H + 0.5*(cSurf()-2*H), sz:16, eaten:false, gone:false, _zoneR:(cSurf()-2*H)*0.46 };

  // 15-step ordered curriculum (matches tutorial-module.js)
  tutorial.steps = [
    { target:_starter,   kind:'eat',       panel:{title:'First Bite',     lines:['A scrap, right beside you.','Steer your worm to eat it.'],                             karma:'+3 karma',              tint:'#c0d4a8'} },
    { target:_lettuce,   kind:'eat',       panel:{title:'Lettuce',        lines:['Food fills your gut.','Steer to eat it.'],                                              karma:'+3 karma',              tint:'#c0d4a8'} },
    { target:_melon,     kind:'eat',       panel:{title:'Watermelon',     lines:['Juicy scraps drip worm tea','deep into the compost below.'],                            karma:'+3 karma',              tint:'#c0d4a8'} },
    { target:_acidChunk, kind:'acidfull',  panel:{title:'Overripe Fruit', lines:['Worth more — but acidic.','Climb to the pile and nibble','until your gut is stuffed.'],karma:'+45 karma',             tint:'#e89060'} },
    { target:null,       kind:'pooprelief',panel:{title:'Constipation',   lines:['A full gut bleeds health','until you poop. Two-finger tap','or Space to go.'],          karma:'clears the gut',        tint:'#e8b89a'} },
    { target:_egg1,      kind:'cure',      extras:[_egg2],
                                           panel:{title:'Eggshell',       lines:['Eggshell neutralizes acid.','Eat both until the green fades.'],                         karma:'+3 each',               tint:'#a8dc80'} },
    { target:_refuel,    kind:'refuel',    extras:[_refuel2],
                                           panel:{title:'Refuel',         lines:['That drained you. Eat both','scraps to rebuild health.'],                               karma:'+3 karma',              tint:'#c0d4a8'} },
    { target:_poopSpot,  kind:'poop',      panel:{title:'Compost Poop',   lines:['Dive into the dark compost','and poop — bonus karma','and richer soil.'],               karma:'bonus karma',           tint:'#cda36a'} },
    { target:_downSpot,  kind:'downdrain', panel:{title:'Down Drain',     lines:['Hold your point on the dot','at the sump floor —','tea drains out.'],                   karma:'+100 karma',            tint:'#7fc8e0'} },
    { target:_cocoonSpot,kind:'cocoon',    panel:{title:'Lay a Cocoon',   lines:['An extra life, stored in','the deep compost. Swipe up','or press E.'],                  karma:'banks a life',          tint:'#e6d2a0'} },
    { target:_upSpot,    kind:'updrain',   panel:{title:'Up Drain',       lines:['Hold the dot to arm','an up drain — it pumps','the tea back up to harvest.'],           karma:'+100 karma',            tint:'#7fc8e0'} },
    { target:_surface,   kind:'eat',       panel:{title:'Surface & Eat',  lines:['All that digging emptied you.','Climb up and eat to refuel.'],                          karma:'+3 karma',              tint:'#c0d4a8'} },
    { target:null,       kind:'freeplay',  panel:{title:'Free Roam',      lines:['You know the loop now.','Explore the bin for a bit.'],                                  karma:'90 seconds',            tint:'#c0d4a8'} },
    { target:_sleepSpot, kind:'sleep',     panel:{title:'Bedtime',        lines:['Dive into the dark compost','and sleep. Press and hold S.'],                            karma:'worms rest in compost', tint:'#a9c2e0'} },
    { target:null,       kind:'viewscroll',panel:{title:'Look Around',    lines:['While you sleep, drag to','scroll the bin.'],                                           karma:'viewer mode',            tint:'#a9c2e0'} },
  ];
  tutorial.stepIndex = 0;
  tutorial.panel     = tutorial.steps[0].panel;
  tutorial.target    = tutorial.steps[0].target;
}

// ── Tutorial step predicates ───────────────────────────────────────────────────
function _tutStepDone(step) {
  if (!step) return true;
  if (step.kind === 'acidfull')   return pGut >= pGutMax * 0.97;
  if (step.kind === 'pooprelief') return !!tutorial._reliefPooped;
  if (step.kind === 'acid')       return pAcid > 0.35;
  if (step.kind === 'cure')       return pAcid < 0.12;
  if (step.kind === 'refuel') {
    if (!step.target || (!step.target.eaten && !step.target.gone)) return false;
    if (step.extras) for (var i=0; i<step.extras.length; i++) {
      if (step.extras[i] && !step.extras[i].eaten && !step.extras[i].gone) return false;
    }
    return true;
  }
  if (step.kind === 'poop')       return !!tutorial._compostPooped;
  if (step.kind === 'downdrain')  return !!tutorial._downDrainDone;
  if (step.kind === 'cocoon')     return !!tutorial._cocoonDone;
  if (step.kind === 'updrain')    return !!tutorial._upDrainArmed;
  if (step.kind === 'freeplay') {
    if (!tutorial._freeStart) tutorial._freeStart = Date.now();
    return (Date.now() - tutorial._freeStart) >= 90000;
  }
  if (step.kind === 'sleep')      return !!pSleeping;
  if (step.kind === 'viewscroll') {
    // simple: just wait 8s after sleep starts (no viewMode in tut-game)
    if (!tutorial._viewStart) tutorial._viewStart = Date.now();
    return (Date.now() - tutorial._viewStart) >= 8000;
  }
  // default: eat predicate
  return step.target && (step.target.eaten || step.target.gone);
}

function tutorialStep() {
  var steps = tutorial.steps;
  var si = tutorial.stepIndex || 0;
  while (si < steps.length && _tutStepDone(steps[si])) si++;
  tutorial.stepIndex = si;

  if (si >= steps.length) {
    tutorial.target = null; tutorial.leash = null;
    tutorial.panel  = null; tutorial.extras = null;
    if (!tutorial.done) {
      tutorial.done   = true;
      tutorial._doneAt = Date.now();
    }
    return;
  }

  var step = steps[si];
  // Re-point ring to next uneaten extra if primary already gone
  var tgt = step.target;
  if (step.extras && tgt && (tgt.eaten || tgt.gone)) {
    for (var k=0; k<step.extras.length; k++) {
      if (step.extras[k] && !step.extras[k].eaten && !step.extras[k].gone) { tgt = step.extras[k]; break; }
    }
  }
  tutorial.target = tgt;
  tutorial.extras = step.extras || null;
  tutorial.panel  = step.panel;
  tutorial.leash  = null;
}

function _tutFinish() {
  if (tutorial._finished) return;
  tutorial._finished = true;
  tutorial.done   = false;
  tutorial.active = false;
  if (typeof window.showDemoEnd === 'function') window.showDemoEnd();
}

// ── Update: player worm ───────────────────────────────────────────────────────
function updatePlayer() {
  if (pSleeping) {
    tutorialStep();  // advance sleep/viewscroll beats
    return;
  }

  tutorialStep();

  // Move target — clamp acid chunk nibble to tier-0 only (no leash otherwise)
  var tx = mX, ty = mY;
  var _cs = tutorial.steps[tutorial.stepIndex];
  if (_cs && _cs.kind === 'acidfull' && ty > H * 0.97) ty = H * 0.97;

  // Steer head toward target
  var hx = pSegs[0].x, hy = pSegs[0].y;
  var dx = tx - hx, dy = ty - hy;
  var dist = Math.sqrt(dx*dx + dy*dy) || 1;
  var spd = Math.min(_HEAD_SPD, dist);
  spd *= (0.5 + pHP * 0.5);   // slow when hurt

  var nx = hx + (dx/dist) * spd;
  var ny = hy + (dy/dist) * spd;

  // Clamp inside bin
  var b = getBin();
  nx = Math.max(b.cx - b.bw2 + pSR + 2, Math.min(b.cx + b.bw2 - pSR - 2, nx));
  ny = Math.max(pSR, Math.min(cSurf() + H*0.1, ny));

  // Shift segment history
  pSegs.unshift({ x: nx, y: ny });
  if (pSegs.length > _pHistLen + pSEG + 4) pSegs.pop();

  // Eat tier-1 scraps — eat-gate enforces tutorial order
  var head = pSegs[0];
  var _tutStepNow = tutorial.steps[tutorial.stepIndex];
  var _tutKindNow = _tutStepNow ? _tutStepNow.kind : null;
  for (var i=0; i<scraps.length; i++) {
    var s = scraps[i];
    if (s.eaten || s.ti !== 1) continue;
    var _openExtra = (_tutKindNow === 'cure'   && s.t && s.t.name === 'egg_shell') ||
                     (_tutKindNow === 'refuel' && s._refuelTut);
    if (s.tutProtected && s !== tutorial.target && !_openExtra) continue;
    var sdx = head.x - s.x, sdy = head.y - s.y;
    if (Math.sqrt(sdx*sdx + sdy*sdy) < pSR + s.sz * 0.72) {
      s.hp -= 0.055;
      s.eating = true;
      if (s.hp <= 0) {
        s.eaten = true; s.eating = false;
        pGut = Math.min(pGutMax, pGut + 0.28);
        karma += 3;
      }
    } else { s.eating = false; }
  }

  // Eat acid pile chunk (tier 0)
  if (_acidChunk && !_acidChunk.gone && !_acidChunk.locked) {
    var adx = head.x - _acidChunk.x, ady = head.y - _acidChunk.y;
    if (Math.abs(ady) < _acidChunk.sz * 1.1 && Math.abs(adx) < _acidChunk.sz * 1.1) {
      _acidChunk.being_eaten = true;
      _acidChunk.hp -= 0.04;
      _acidChunk.hpFrac = Math.max(0, _acidChunk.hp / _acidChunk.maxHp);
      if (frame % 8 === 0) pAcid = Math.min(1.0, pAcid + 0.022);
      pGut = Math.min(pGutMax, pGut + 0.008);
      if (_acidChunk.hp <= 0) { _acidChunk.gone = true; _acidChunk.being_eaten = false; karma += 45; }
    } else { _acidChunk.being_eaten = false; }
  }

  // Gut / HP / acid decay
  if (_poopCooldown > 0) _poopCooldown--;
  if (_cocoonCooldown > 0) _cocoonCooldown--;
  if (frame % 180 === 0) pGut = Math.max(0, pGut - 0.012);
  if (pGut >= pGutMax * 0.95) { pHP = Math.max(0.08, pHP - 0.0018); }  // constipation
  if (pAcid > 0.5 && pHP > 0.08 && frame % 4 === 0) pHP = Math.max(0.08, pHP - 0.0012);
  if (pAcid > 0 && frame % 90 === 0) pAcid = Math.max(0, pAcid - 0.015);
  if (pGut < pGutMax * 0.5 && pHP < 1.0 && frame % 60 === 0) pHP = Math.min(1.0, pHP + 0.025);

  // Eggshell acid cure
  if (_tutKindNow === 'cure') {
    for (var ei=0; ei<scraps.length; ei++) {
      if (scraps[ei].eaten && scraps[ei].t && scraps[ei].t.name === 'egg_shell') {
        if (frame % 12 === 0) pAcid = Math.max(0, pAcid - 0.035);
      }
    }
  }

  // Camera follow
  var targetCamY = Math.max(0, ny - H * 0.52);
  camY += (targetCamY - camY) * 0.08;

  // Drain detection
  _atSump = (head.y >= cSurf() - pSR - 4);
  if (_atSump) {
    _drainHoldFrames++;
    if (_drainHoldFrames >= DRAIN_HOLD) {
      if (!_sumpHadDown) {
        _sumpHadDown = true;
        tutorial._downDrainDone = true;
        karma += 100;
      } else if (tutorial._downDrainDone && !tutorial._upDrainArmed) {
        tutorial._upDrainArmed = true;
        karma += 100;
      }
    }
    // Carve tunnel near sump
    if (frame % 6 === 0) _carvePoint(head.x, head.y);
  } else {
    _drainHoldFrames = 0;
    if (getTier(head.y) === 2 && frame % 5 === 0) _carvePoint(head.x, head.y);
  }
}

// ── Draw ───────────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  // World transform
  ctx.save();
  ctx.translate(centreOffsetX - camX, 0);
  var b = getBin();

  // Sky / background
  var skyGrad = ctx.createLinearGradient(0, -camY, 0, H - camY);
  skyGrad.addColorStop(0,   '#1a2a12');
  skyGrad.addColorStop(0.6, '#2a3e1a');
  skyGrad.addColorStop(1,   '#1a2a12');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(b.cx - b.bw2 - 10, -camY, b.bw + 20, H * 5);

  // Bin walls
  ctx.fillStyle = '#2a3a2a';
  ctx.fillRect(b.cx - b.bw2 - b.lw, -camY, b.lw, H * 5);
  ctx.fillRect(b.cx + b.bw2,         -camY, b.lw, H * 5);

  // Tier fills
  var t0top = 0 - camY, t1top = H - camY, t2top = 2*H - camY, ctop = cSurf() - camY;

  // Tier 0 airspace (lid-to-pile)
  ctx.fillStyle = '#1e3018';
  ctx.fillRect(b.cx - b.bw2, t0top, b.bw, H);

  // Tier 1 soil
  var s1 = ctx.createLinearGradient(0, t1top, 0, t1top + H);
  s1.addColorStop(0,   '#2a1a0e'); s1.addColorStop(1,   '#1a0e08');
  ctx.fillStyle = s1;
  ctx.fillRect(b.cx - b.bw2, t1top, b.bw, H);

  // Tier 2 compost (dark rich)
  var s2 = ctx.createLinearGradient(0, t2top, 0, t2top + H);
  s2.addColorStop(0,   '#1a0e06'); s2.addColorStop(1,   '#0e0804');
  ctx.fillStyle = s2;
  ctx.fillRect(b.cx - b.bw2, t2top, b.bw, H);

  // Tier 0/1 boundary line
  ctx.strokeStyle = 'rgba(80,60,30,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(b.cx - b.bw2, t1top); ctx.lineTo(b.cx + b.bw2, t1top); ctx.stroke();

  // Tier 1/2 boundary line
  ctx.strokeStyle = 'rgba(60,40,20,0.4)';
  ctx.beginPath(); ctx.moveTo(b.cx - b.bw2, t2top); ctx.lineTo(b.cx + b.bw2, t2top); ctx.stroke();

  // Tunnels
  ctx.strokeStyle = 'rgba(90,55,22,0.55)';
  ctx.lineWidth = pSR * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var inSeg = false;
  ctx.beginPath();
  for (var pi=0; pi<pPath.length; pi++) {
    var pp = pPath[pi];
    var psy = pp.y - camY;
    if (!inSeg) { ctx.moveTo(pp.x, psy); inSeg = true; }
    else ctx.lineTo(pp.x, psy);
  }
  ctx.stroke();

  // Acid pile chunk
  if (_acidChunk && !_acidChunk.gone) {
    var acy = _acidChunk.y - camY;
    if (acy > -80 && acy < H + 80) {
      ctx.save();
      ctx.translate(_acidChunk.x, acy);
      ctx.globalAlpha = 0.92;
      drawPileChunk(ctx, 'overripe_fruit', _acidChunk.sz * (_acidChunk.hpFrac * 0.4 + 0.6));
      ctx.globalAlpha = 1;
      // Acid glow pulse
      var apulse = 0.3 + Math.sin(frame * 0.04) * 0.15;
      ctx.strokeStyle = 'rgba(180,40,120,' + apulse + ')';
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, _acidChunk.sz * 0.9, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  // Tier-1 scraps
  for (var si=0; si<scraps.length; si++) {
    var s = scraps[si];
    if (s.eaten || s.ti !== 1) continue;
    var scy = s.y - camY;
    if (scy < -20 || scy > H + 20) continue;
    ctx.save();
    ctx.translate(s.x, scy);
    if (Math.abs(s.rot) > 0.02) ctx.rotate(s.rot);
    ctx.globalAlpha = 0.82;
    drawDebrisFragment(ctx, s.t ? s.t.name : 'lettuce', s.sz, s.col, s.col2);
    ctx.globalAlpha = 1;
    if (s.eating) {
      ctx.strokeStyle = 'rgba(255,220,80,0.85)';
      ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, s.sz * 1.5, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  // Cocoons
  for (var ci=0; ci<cocoons.length; ci++) {
    var co = cocoons[ci];
    var coy = co.y - camY;
    if (coy < -20 || coy > H + 20) continue;
    ctx.save();
    ctx.translate(co.x, coy);
    var cpulse = 0.5 + 0.5 * Math.sin(frame * 0.06 + ci);
    ctx.strokeStyle = 'rgba(220,200,100,' + (0.5 + 0.3*cpulse) + ')';
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = 'rgba(200,170,60,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Drain hold indicator — ring at the sump floor when holding
  if (_atSump && _drainHoldFrames > 0) {
    var prog = Math.min(1, _drainHoldFrames / DRAIN_HOLD);
    var dsy = cSurf() - camY;
    ctx.strokeStyle = 'rgba(100,200,255,' + (0.4 + 0.4*prog) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(pSegs[0].x, dsy, 18, -Math.PI/2, -Math.PI/2 + prog * Math.PI*2); ctx.stroke();
  }

  // Worm body
  var acidTint = Math.min(1, pAcid * 1.8);
  for (var wi = pSEG - 1; wi >= 0; wi--) {
    var ws = pSegs[wi * Math.floor(_pHistLen / pSEG)];
    if (!ws) continue;
    var wsy = ws.y - camY;
    var t = wi / (pSEG - 1);  // 0=head, 1=tail
    var wr = pSR * (1.0 - t * 0.38);
    // Colour: green tint from acid
    var gr = Math.round(80  + (1-acidTint) * 60  + t*20);
    var gg = Math.round(160 + (1-acidTint) * 60  - t*30);
    var gb = Math.round(30  + acidTint * 80);
    ctx.fillStyle = 'rgb(' + gr + ',' + gg + ',' + gb + ')';
    ctx.beginPath(); ctx.arc(ws.x, wsy, wr, 0, Math.PI*2); ctx.fill();
  }
  // Head eyes
  if (pSegs[0]) {
    var hs = pSegs[0], hsy = hs.y - camY;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(hs.x - 2, hsy - 2, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(hs.x - 2, hsy - 2, 1, 0, Math.PI*2); ctx.fill();
  }

  // Tutorial highlight + arrow
  drawTutorialHighlight();

  // World transform pop — HUD below is screen-space
  ctx.restore();

  // ── HUD ───────────────────────────────────────────────────────────────────
  // Health bar (top left)
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(14, 14, 100, 10);
  var hpCol = pHP > 0.5 ? '#60d840' : pHP > 0.25 ? '#f0c020' : '#f02010';
  ctx.fillStyle = hpCol;
  ctx.fillRect(14, 14, Math.round(100 * pHP), 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, 100, 10);

  // Gut bar
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(14, 28, 100, 7);
  ctx.fillStyle = pGut >= pGutMax * 0.95 ? '#f05010' : '#a0784a';
  ctx.fillRect(14, 28, Math.round(100 * pGut / pGutMax), 7);

  // Acid bar (only visible if acidic)
  if (pAcid > 0.05) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(14, 39, 100, 5);
    ctx.fillStyle = 'rgba(200,80,160,' + (0.5 + pAcid*0.5) + ')';
    ctx.fillRect(14, 39, Math.round(100 * pAcid), 5);
  }

  // Karma
  ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffd700';
  ctx.fillText('☯ ' + Math.floor(karma), 14, 65);

  // Tutorial panel
  drawTutorialPanel();
  drawTutorialDone();

  // Perf HUD
  if (_PERF) {
    var _pt2 = performance.now();
    _perf.draw = _perf.draw * 0.9 + (_pt2 - _perf._pt1) * 0.1;
    if (_perf.last) _perf.fps = _perf.fps * 0.9 + (1000 / Math.max(1, _pt2 - _perf.last)) * 0.1;
    _perf.last = _pt2;
    var ptxt = 'FPS ' + _perf.fps.toFixed(0) + '  sim ' + _perf.sim.toFixed(1) + '  draw ' + _perf.draw.toFixed(1);
    ctx.save(); ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    var pw = ctx.measureText(ptxt).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(4, 4, pw, 18);
    ctx.fillStyle = (_perf.fps < 45 ? '#ff6b6b' : '#7CFC00'); ctx.fillText(ptxt, 10, 17);
    ctx.restore();
  }
}

// ── Tutorial draw helpers ──────────────────────────────────────────────────────
function drawTutorialHighlight() {
  if (!tutorial.active) return;
  var tgt = tutorial.target;
  if (!tgt || tgt.eaten || tgt.gone) return;

  var tx = tgt.x, ty = tgt.y - camY;
  var baseR = tgt.sz || 10;
  var onScreen = ty > -baseR && ty < H + baseR;
  var pulse = 0.5 + 0.5 * Math.sin(frame * 0.12);
  var ringR = tgt._zoneR ? tgt._zoneR : baseR * (1.7 + 0.35 * pulse);

  var _hx, _hy, _ad = Infinity, _prox = 0;
  if (pSegs && pSegs.length) {
    _hx = pSegs[0].x; _hy = pSegs[0].y - camY;
    var adx = tx - _hx, ady = ty - _hy;
    _ad = Math.sqrt(adx*adx + ady*ady);
    var _far = ringR * 1.9, _near = ringR * 0.85;
    _prox = Math.max(0, Math.min(1, (_far - _ad) / (_far - _near)));
  }

  if (tgt._zoneLine) {
    var _lineSY = 2*H - camY;
    if (_lineSY > -24 && _lineSY < H + 24) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b_hw().cx - b_hw().bw2, _lineSY); ctx.lineTo(b_hw().cx + b_hw().bw2, _lineSY);
      ctx.strokeStyle = 'rgba(255,176,48,' + (0.22 + 0.12*pulse) + ')'; ctx.lineWidth = 11; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.55 + 0.4*pulse) + ')';  ctx.lineWidth = 3;  ctx.stroke();
      ctx.restore();
    }
  } else if (onScreen) {
    ctx.save();
    ctx.beginPath(); ctx.arc(tx, ty, ringR, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,176,48,' + (0.22 + 0.12*pulse) + ')';
    ctx.lineWidth = (2.5 + 5*_prox) + 7; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.55 + 0.4*pulse + 0.3*_prox) + ')';
    ctx.lineWidth = 2.5 + 5*_prox; ctx.stroke();
    ctx.restore();
    if (tgt._tutBeacon && !tgt._zoneR) {
      ctx.save();
      var _dotR = 3.5 + 0.6*pulse + 1.5*_prox;
      ctx.fillStyle = 'rgba(255,176,48,' + (0.30 + 0.15*pulse) + ')';
      ctx.beginPath(); ctx.arc(tx, ty, _dotR+4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(tx, ty, _dotR, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  // Arrow anchored to worm head, pointing at target
  if (pSegs && pSegs.length && _ad > 1 && _prox < 0.999) {
    var ux = (tx - _hx) / _ad, uy = (ty - _hy) / _ad;
    var off = pSR + 20;
    var ax0 = _hx + ux*off, ay0 = _hy + uy*off;
    var glide = _prox * 0.9;
    var ax = ax0 + (tx - ax0)*glide, ay = ay0 + (ty - ay0)*glide;
    var scale = 1 - 0.55*_prox;
    var alpha = (0.75 + 0.25*pulse) * Math.pow(1 - _prox, 1.6);
    var aSize = (9 + 2*pulse) * scale;
    ctx.save();
    ctx.translate(ax, ay); ctx.rotate(Math.atan2(uy, ux)); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,176,48,0.30)';
    ctx.beginPath(); ctx.moveTo(aSize*1.45,0); ctx.lineTo(-aSize,aSize); ctx.lineTo(-aSize,-aSize); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,176,48,1)';
    ctx.beginPath(); ctx.moveTo(aSize,0); ctx.lineTo(-aSize*0.7,aSize*0.7); ctx.lineTo(-aSize*0.7,-aSize*0.7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Secondary targets (extras)
  if (tutorial.extras) {
    for (var ei=0; ei<tutorial.extras.length; ei++) {
      var ex = tutorial.extras[ei];
      if (!ex || ex.eaten || ex.gone || ex === tgt) continue;
      var exy = ex.y - camY;
      if (exy < -20 || exy > H+20) continue;
      var exR = (ex.sz||10) * (1.7 + 0.35*pulse);
      ctx.save();
      ctx.beginPath(); ctx.arc(ex.x, exy, exR, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,176,48,' + (0.18 + 0.10*pulse) + ')'; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,176,48,' + (0.45 + 0.30*pulse) + ')'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }
  }
}

// Cached bin for highlight (avoids recalc inside draw loop)
function b_hw() { return getBin(); }

function drawTutorialPanel() {
  if (!tutorial.active || !tutorial.panel) return;
  var pnl = tutorial.panel;
  var lines = pnl.lines || [];
  var cardW = Math.min(W - 24, 320);
  var cardX = (W - cardW) / 2;
  var cardH = 32 + lines.length * 17 + 20;
  var cardY = H - cardH - 18;
  var cx2 = cardX + cardW / 2;

  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 10);
  else               ctx.rect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = 'rgba(255,176,48,0.18)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
  ctx.fillStyle = 'rgba(12,28,12,0.93)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,176,48,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf2dc'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText(pnl.title || '', cx2, cardY + 22);
  ctx.font = '12px sans-serif'; ctx.fillStyle = pnl.tint || '#bcd0a8';
  for (var li=0; li<lines.length; li++) {
    ctx.fillText(lines[li], cx2, cardY + 42 + li*17);
  }
  var kTxt = pnl.karma || '';
  if (tutorial.steps[tutorial.stepIndex] && tutorial.steps[tutorial.stepIndex].kind === 'freeplay' && tutorial._freeStart) {
    var rem = Math.max(0, Math.ceil((90000 - (Date.now() - tutorial._freeStart)) / 1000));
    kTxt = 'Free roam: ' + rem + 's left';
  }
  ctx.fillStyle = '#9fd84a'; ctx.font = 'bold 12px sans-serif';
  ctx.fillText(kTxt, cx2, cardY + cardH - 9);
  ctx.restore();
}

function drawTutorialDone() {
  if (!tutorial.done) return;
  tutorial._doneFade = Math.min(1, tutorial._doneFade + 0.03);
  var a = tutorial._doneFade;
  ctx.save();
  ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#06140a'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  var cx2 = W/2, cy2 = H/2;
  var pw = Math.min(W*0.85, 360), ph = 188;
  var px = cx2 - pw/2, py = cy2 - ph/2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 14); else ctx.rect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(255,176,48,0.20)'; ctx.lineWidth = 12; ctx.lineCap='round'; ctx.stroke();
  ctx.fillStyle = '#0a1f0a'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,176,48,0.6)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf2dc'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText('Tutorial Complete', cx2, py + 52);
  ctx.fillStyle = '#bcd0a8'; ctx.font = '13px sans-serif';
  ctx.fillText("You've got the basics down —", cx2, py + 86);
  ctx.fillText('eat, poop, drain, cocoon, sleep.', cx2, py + 106);
  ctx.fillStyle = '#9fd84a'; ctx.font = '12px sans-serif';
  ctx.fillText('The bin is yours now.', cx2, py + 132);
  ctx.restore();
  if (tutorial._doneAt && (Date.now() - tutorial._doneAt) > 2600) _tutFinish();
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop() {
  frame++;
  var pt0 = _PERF ? performance.now() : 0;
  updatePlayer();
  var pt1 = _PERF ? performance.now() : 0;
  if (_PERF) { _perf.sim = _perf.sim * 0.9 + (pt1 - pt0) * 0.1; _perf._pt1 = pt1; }
  draw();
  requestAnimationFrame(loop);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
spawnWorm();
spawnTutorialScene();
loop();
