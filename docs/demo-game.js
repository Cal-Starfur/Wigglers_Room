


// DEBUG_MODE is declared near the bottom of this file; this handler reads it at call time
// so the reference is always current regardless of hoisting.
window.addEventListener('error', function(e) {
  if (!DEBUG_MODE) return; // only show red error div in debug builds
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
// PERF TEST (default-OFF): ?noblur=1 globally neutralizes shadowBlur (the tutorial's
// per-frame Gaussian-blur passes are the iPad-Safari paint bottleneck). Confirms the
// cause before the permanent halo conversion.
// PERF TEST (default-OFF): ?fast=1 draws tunnels in 1 pass instead of 2 (halves tunnel paint).
var _FAST = /[?&]fast=1/.test(window.location.search || '');
var _NODRAW   = /[?&]nodraw=1/.test(window.location.search || '');
var _NOCLOG   = /[?&]noclog=1/.test(window.location.search || '');
if (/[?&]noblur=1/.test(window.location.search || '')) {
  try {
    Object.defineProperty(ctx, 'shadowBlur', { configurable: true, get: function(){ return 0; }, set: function(){} });
  } catch(e) {}
}

// ── Compatibility shims ───────────────────────────────────────────────────
// roundRect polyfill — available in Chrome 99+, Safari 15.4+, but not all Devvit webviews
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'object') r = r[0] || 0;
    r = Math.min(r, w/2, h/2);
    this.moveTo(x+r, y);
    this.lineTo(x+w-r, y);
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
// ctx.filter guard — some canvas implementations (older WebKit) throw on assignment
var _ctxFilterSupported = (function(){
  try { var t=document.createElement('canvas').getContext('2d'); t.filter='brightness(100%)'; return true; } catch(e){ return false; }
})();

var W = 0, H = 0;
var centreOffsetX = 0; // pixels to shift world right so bin is centred on wide screens
var camY = 0;
var camX = 0;           // horizontal camera offset — follows worm X on wide worlds
var viewMode = false;   // true when sleeping or observing — free-scroll active
var viewCamY = 0;       // scroll target written by drag/wheel; camY lerps here in viewMode
var mX = 0, mY = 0;

// ── Tutorial Director ───────────────────────────────────────────────────────
// Guided intro that gates movement + progression before releasing to free roam.
// Commit 1 lands the skeleton + the single move-target clamp hook (the ONE place
// the worm reads its steering goal). Later commits add the staged scene, the
// highlight/spotlight, the step predicates, and the free-play windows.
//
// DEBUG PROOF: append ?leash=1 (or ?tutdbg=1) to the URL — the worm gets a fixed
// radius leash around wherever it is the first controlled frame, and a faint ring
// shows the boundary. OFF by default, so normal free-roam play is unchanged.
var tutorial = {
  active: false,   // master switch — false in normal free-roam play
  debug:  false,   // set from URL param; drives the hardcoded proof leash + ring
  step:   0,       // current tutorial step (later commits)
  leash:  null,    // null = free; { type:'radius', x, y, r } projects the target
  target: null,    // the scrap/trash this step is about (later commits)
  scene:  false,   // true = load the authored staged scene + freeze ambient refill
  live:   false,   // true (?tut=2) = run the SAME curriculum OVER the live game: real field, NPCs, ambient — no stripped scene, no freeze
  foodScraps: [],  // staged tier-1 food scraps (eat/fill steps) — set by spawnTutorialScene
  acidChunk:  null, // staged tier-0 acid pile item (acid step)   — set by spawnTutorialScene
  targetIndex: 0,  // (legacy) superseded by stepIndex
  steps:      [],  // ordered tutorial steps — built by spawnTutorialScene
  stepIndex:  0,   // current step cursor
  _compostPooped: false, // poop beat — latched true on first tier-2 (compost) poop
  _downDrainDone: false, // down-drain beat — latched when a down drain connects at the sump
  _upDrainArmed:  false, // up-drain beat — latched when an up drain is armed ("Up drain ready!")
  _cocoonDone:    false, // cocoon beat — latched when a cocoon is laid (swipe up / E)
  _freeStart:     0,     // free-play beat — wall-clock ms when the 90s explore window opened (0 = not started)
  done:       false, // true once the final beat (sleep) clears — shows the completion screen until tapped
  _doneFade:  0,     // 0->1 fade-in for the done screen
  panel:      null // current step's instruction panel — drawn by drawTutorialPanel
};
try {
  var _tutSearch = window.location.search || '';
  if (/[?&](leash|tutdbg)=1/.test(_tutSearch)) { tutorial.debug = true; tutorial.active = true; }
  if (/[?&]tut=1/.test(_tutSearch))            { tutorial.scene = true; tutorial.active = true; }
  if (/[?&]tut=2/.test(_tutSearch))            { tutorial.scene = true; tutorial.active = true; tutorial.live = true; }  // tutorial OVER the live game (merge mode)
} catch (e) {}

// Soft radius leash — project the requested steering target onto the allowed
// region. SOFT: we clamp only the TARGET, never the worm's body, so the worm can
// drift slightly past under its own momentum and then eases back. No-op when the
// tutorial is inactive or unleashed.
function tutorialClampTarget(tx, ty) {
  if (!tutorial.active || !tutorial.leash) return { x: tx, y: ty };
  var L = tutorial.leash;
  if (L.type === 'radius') {
    var ddx = tx - L.x, ddy = ty - L.y;
    var dd = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dd <= L.r || dd === 0) return { x: tx, y: ty };
    var k = L.r / dd;                 // project onto the circle edge
    return { x: L.x + ddx * k, y: L.y + ddy * k };
  }
  return { x: tx, y: ty };            // corridor leash arrives in a later commit
}

// ── Tutorial highlight / spotlight ───────────────────────────────────────────
// Commit 3: focuses attention on the current target — dims the scene, draws a
// pulsing amber glow ring on the target, and an edge arrow when it is off-screen.
// Reads tutorial.target (set by the step machine in commit 4). For now, when the
// staged scene is loaded, a TEMPORARY picker targets the first uneaten food scrap
// then the acid chunk, so the highlight can be tested end to end. Drawn in the
// world-translated space (x direct, y - camY) — same convention as the cursor.
// ── Tutorial ordered progression ─────────────────────────────────────────────
// Walks an explicit ordered step list (lettuce → watermelon → acid → eggshell),
// built by spawnTutorialScene. Each step drives the highlight target, a soft leash
// around the active item, and the instruction panel. A step completes via its own
// predicate. Called once per frame from updatePlayer, before the move-target clamp.
function _tutStepDone(step) {
  if (!step) return true;
  if (step.kind === 'acid') return pAcid > 0.35;   // green, but below the HP-damage threshold (~0.5)
  if (step.kind === 'acidfull')   return pGut >= pGutMax * 0.98;   // hold the acid beat until the gut is full (constipated)
  if (step.kind === 'pooprelief') return !!tutorial._reliefPooped; // any poop relieves the full gut
  if (step.kind === 'cure')       return pAcid < 0.12;             // ate enough eggshell to clear the green
  if (step.kind === 'refuel') {                                    // advance ONLY when every refuel scrap is eaten
    if (!step.target || (!step.target.eaten && !step.target.gone)) return false;
    if (step.extras) for (var _rf = 0; _rf < step.extras.length; _rf++) {
      var _rx = step.extras[_rf];
      if (_rx && !_rx.eaten && !_rx.gone) return false;
    }
    return true;
  }
  if (step.kind === 'poop') return !!tutorial._compostPooped;      // pooped down in the compost (tier 2)
  if (step.kind === 'downdrain') return !!tutorial._downDrainDone; // down drain connected at the sump
  if (step.kind === 'cocoon')    return !!tutorial._cocoonDone;     // laid a cocoon on the traverse
  if (step.kind === 'updrain')   return !!tutorial._upDrainArmed;  // up drain armed ("Up drain ready!")
  if (step.kind === 'freeplay') {                                  // 90s of open exploration
    if (!tutorial._freeStart) tutorial._freeStart = Date.now();    // wall-clock timer starts the frame this beat goes active
    return (Date.now() - tutorial._freeStart) >= 90000;
  }
  if (step.kind === 'sleep')     return !!pSleeping;               // asleep — only possible in the compost (tier 2+)
  if (step.kind === 'viewscroll') {                                // free-scroll lesson — drag the bin while asleep (viewer mode)
    if (!viewMode) { tutorial._viewStartY = null; return false; }   // only completable in free-scroll; re-latch if they wake
    if (tutorial._viewStartY == null) tutorial._viewStartY = viewCamY;
    return Math.abs(viewCamY - tutorial._viewStartY) > H * 0.4;     // scrolled ~0.4 of a screen
  }
  return step.target && (step.target.eaten || step.target.gone);   // 'eat'
}
function tutorialStep() {
  if (!tutorial.active || !tutorial.scene) return;
  var steps = tutorial.steps || [];
  var si = tutorial.stepIndex || 0;
  while (si < steps.length && _tutStepDone(steps[si])) si++;   // skip completed steps
  tutorial.stepIndex = si;

  if (si >= steps.length) {            // sequence complete — show the done card, then cut to the end screen
    tutorial.target = null; tutorial.leash = null; tutorial.panel = null; tutorial.extras = null;
    if (!tutorial.done) {              // latch ONCE — this branch re-fires every frame while asleep,
      tutorial.done = true;            // drawTutorialDone() takes over
      tutorial._doneAt = Date.now();   // dwell timer: set once so the auto-cut to the end screen can elapse
    }                                  // (was reset every frame, so > 2600ms never hit -> end screen never showed)
    return;
  }
  var step = steps[si];
  // Multi-item beats: if the primary target is already eaten but the beat isn't done,
  // re-point the ring/arrow to the next remaining extra so guidance never disappears.
  var _et = step.target;
  if (step.extras && step.extras.length && _et && (_et.eaten || _et.gone)) {
    for (var _ek = 0; _ek < step.extras.length; _ek++) {
      var _ee = step.extras[_ek];
      if (_ee && !_ee.eaten && !_ee.gone) { _et = _ee; break; }
    }
  }
  tutorial.target = _et;
  tutorial.extras = step.extras || null;
  tutorial.panel  = step.panel;
  // No leash for these steps — order is enforced by the eat-gate, guidance by the
  // ring/arrow/panel, so the player steers themselves (no auto-steer pull).
  tutorial.leash = null;
}

// Instruction panel for the current step — name + effect + karma. Screen-space card
// positioned via leftX (camX - centreOffsetX = screen x=0 in the translated world).
// No emoji; amber is glow-only (border/shadow); text fills are neutral / tinted.
function drawTutorialPanel() {
  if (!tutorial.active || !tutorial.panel) return;
  var pnl = tutorial.panel;
  var lines = pnl.lines || [];
  var leftX = camX - centreOffsetX;
  var cardW = Math.min(W - 24, 320);
  var cardX = leftX + (W - cardW) / 2;
  var cardH = 30 + lines.length * 16 + 20;
  var cardY = H - cardH - 18;
  var cx2 = cardX + cardW / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(12,28,12,0.92)';
  ctx.strokeStyle = 'rgba(255,176,48,0.5)';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(255,176,48,0.35)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 10);
  else ctx.rect(cardX, cardY, cardW, cardH);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf2dc';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(pnl.title || '', cx2, cardY + 21);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = pnl.tint || '#bcd0a8';
  for (var _pli = 0; _pli < lines.length; _pli++) {
    ctx.fillText(lines[_pli], cx2, cardY + 40 + _pli * 16);
  }

  ctx.fillStyle = '#9fd84a';
  ctx.font = 'bold 12px sans-serif';
  var _karmaTxt = pnl.karma || '';
  var _curStep = tutorial.steps && tutorial.steps[tutorial.stepIndex];
  if (_curStep && _curStep.kind === 'freeplay' && tutorial._freeStart) {  // live countdown on the free-play card
    var _rem = Math.max(0, Math.ceil((90000 - (Date.now() - tutorial._freeStart)) / 1000));
    _karmaTxt = 'Tutorial resumes in ' + _rem + 's';
  }
  ctx.fillText(_karmaTxt, cx2, cardY + cardH - 9);
  ctx.restore();
}

// ── Tutorial done screen ─────────────────────────────────────────────────────
// Shown after the final (sleep) beat clears. Fade-in dark wash + a centred card that
// recaps the loop; any tap dismisses it and turns the tutorial off (free roam). Amber is
// used for the glow/border ONLY (locked token) — never for text fill.
function drawTutorialDone() {
  if (!tutorial.done) return;
  tutorial._doneFade = Math.min(1, tutorial._doneFade + 0.03);
  var a = tutorial._doneFade;
  ctx.save();
  ctx.globalAlpha = a * 0.85;
  ctx.fillStyle = '#06140a';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  var cx2 = W/2, cy2 = H/2;
  var panelW = Math.min(W * 0.85, 360), panelH = 188;
  var px = cx2 - panelW/2, py = cy2 - panelH/2;
  ctx.fillStyle = '#0a1f0a';
  ctx.strokeStyle = 'rgba(255,176,48,0.6)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(255,176,48,0.4)'; ctx.shadowBlur = 16;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px, py, panelW, panelH, 14); else ctx.rect(px, py, panelW, panelH);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf2dc';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('Tutorial Complete', cx2, py + 52);
  ctx.fillStyle = '#bcd0a8';
  ctx.font = '13px sans-serif';
  ctx.fillText("You've got the basics down —", cx2, py + 86);
  ctx.fillText('eat, poop, drain, cocoon, sleep.', cx2, py + 106);
  ctx.fillStyle = '#9fd84a';
  ctx.font = '12px sans-serif';
  ctx.fillText('The bin is yours now.', cx2, py + 132);
  ctx.restore();
  // No prompt on the card — the continue action lives on the end screen.
  // Auto-cut to the end screen once the card has had a readable beat.
  if (tutorial._doneAt && (Date.now() - tutorial._doneAt) > 2600) _tutFinish();
}

// Finish the tutorial: turn it off and hand control to the teaser's end screen.
// Standalone-safe — if window.showDemoEnd isn't present (game run outside the teaser),
// this just drops to free roam, exactly as the old dismiss did.
function _tutFinish() {
  if (tutorial._finished) return;
  tutorial._finished = true;
  tutorial.done = false;
  tutorial.active = false;
  if (typeof window !== 'undefined' && typeof window.showDemoEnd === 'function') window.showDemoEnd();
}

// ── Tutorial highlight ───────────────────────────────────────────────────────
// Commit 3 (revised): no dimming. A pulsing amber glow ring marks the target, and
// a worm-anchored arrow sits just ahead of the head pointing at it — so guidance
// reads from where the player is, on-screen or off. Drawn in the world-translated
// space (x direct, y - camY) — same convention as the cursor.
function drawTutorialHighlight() {
  if (!tutorial.active) return;
  var tgt = tutorial.target;
  if (!tgt || tgt.eaten || tgt.gone) return;

  var tx = tgt.x;
  var ty = tgt.y - camY;
  var baseR = tgt.sz || 10;
  var onScreen = ty > -baseR && ty < H + baseR;
  var pulse = 0.5 + 0.5 * Math.sin(frame * 0.12);
  var ringR = tgt._zoneR ? tgt._zoneR : baseR * (1.7 + 0.35 * pulse);  // _zoneR = big fixed zone ring (compost poop)

  // Head proximity (0 far -> 1 arrived) drives BOTH the arrow's arrival dismiss and the
  // ring thickening, so reaching a target reads as a payoff rather than a nagging arrow.
  var _hx, _hy, _ad = Infinity, _prox = 0;
  if (pSegs && pSegs.length) {
    _hx = pSegs[0].x; _hy = pSegs[0].y - camY;
    var _adx = tx - _hx, _ady = ty - _hy;
    _ad = Math.sqrt(_adx * _adx + _ady * _ady);
    var _far = ringR * 1.9, _near = ringR * 0.85;   // fade band, in ring radii
    _prox = Math.max(0, Math.min(1, (_far - _ad) / (_far - _near)));
  }

  // Pulsing amber glow ring (amber = glow only — design token). Thickens + brightens as
  // the worm arrives (_prox), locking the target in as the arrow leaves.
  if (tgt._zoneLine) {
    // Compost-bonus beat: a glowing line across the compost top (y=2H) instead of a ring —
    // it marks the boundary the worm must drop BELOW to poop for the bonus.
    var _bz = getBin();
    var _lineSY = (2 * H) - camY;
    if (_lineSY > -24 && _lineSY < H + 24) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.55 + 0.4 * pulse + 0.3 * _prox) + ')';
      ctx.lineWidth = 3 + 4 * _prox;
      ctx.shadowColor = 'rgba(255,176,48,0.9)';
      ctx.shadowBlur = 10 + 8 * pulse + 6 * _prox;
      ctx.beginPath();
      ctx.moveTo(_bz.cx - _bz.bw2, _lineSY);
      ctx.lineTo(_bz.cx + _bz.bw2, _lineSY);
      ctx.stroke();
      ctx.restore();
    }
  } else if (onScreen) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.55 + 0.4 * pulse + 0.3 * _prox) + ')';
    ctx.lineWidth = 2.5 + 5 * _prox;
    ctx.shadowColor = 'rgba(255,176,48,0.9)';
    ctx.shadowBlur = 10 + 8 * pulse + 6 * _prox;
    ctx.beginPath();
    ctx.arc(tx, ty, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Precise aim point — a crisp dot at the exact target centre so the player
    // knows where to place their steering point (critical for the sump drain holds:
    // put your point on the dot at the floor and the hold connects).
    if (tgt._tutBeacon && !tgt._zoneR) {   // precise dot for point beacons only — zones get the big ring, no dot
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(255,176,48,0.95)';
      ctx.shadowBlur = 8 + 4 * _prox;
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5 + 0.6 * pulse + 1.5 * _prox, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Worm-anchored arrow — sits just ahead of the head pointing at the target, then on
  // arrival glides into the ring while shrinking + fading out (a clean "delivered you
  // here" dismiss) instead of hovering and pointing forever.
  if (pSegs && pSegs.length && _ad > 1 && _prox < 0.999) {
    var ux = (tx - _hx) / _ad, uy = (ty - _hy) / _ad;
    var off = (pSR || 6) + 20;                          // resting distance ahead of head
    var ax0 = _hx + ux * off, ay0 = _hy + uy * off;
    var glide = _prox * 0.9;                            // slide toward the ring on arrival
    var ax = ax0 + (tx - ax0) * glide, ay = ay0 + (ty - ay0) * glide;
    var scale = 1 - 0.55 * _prox;                       // shrink in
    var alpha = (0.75 + 0.25 * pulse) * Math.pow(1 - _prox, 1.6); // fade, accelerating
    var aSize = (9 + 2 * pulse) * scale;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(uy, ux));                     // tip (+x) toward the target
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,176,48,1)';
    ctx.shadowColor = 'rgba(255,176,48,0.85)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(aSize, 0);
    ctx.lineTo(-aSize * 0.7, aSize * 0.7);
    ctx.lineTo(-aSize * 0.7, -aSize * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Secondary target circles for multi-item beats (extra eggshells / refuel scraps).
  if (tutorial.extras && tutorial.extras.length) {
    for (var _ei = 0; _ei < tutorial.extras.length; _ei++) {
      var _ex = tutorial.extras[_ei];
      if (!_ex || _ex.eaten || _ex.gone || _ex === tgt) continue;
      var _exy = _ex.y - camY;
      var _exbR = _ex.sz || 10;
      if (_exy < -_exbR || _exy > H + _exbR) continue;
      var _exR = _exbR * (1.7 + 0.35 * pulse);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.45 + 0.35 * pulse) + ')';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(255,176,48,0.9)';
      ctx.shadowBlur = 9 + 6 * pulse;
      ctx.beginPath();
      ctx.arc(_ex.x, _exy, _exR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
var frame = 0;
// PERF DIAGNOSTIC (default-OFF): append ?perf=1 to show an FPS / sim-ms / draw-ms HUD.
var _PERF = /[?&]perf=1/.test(window.location.search || '');
var _perf = { sim: 0, draw: 0, fps: 60, last: 0 };
var username = 'u/You';   // player username — will come from Devvit auth in production
// dayTime is derived live from the real wall clock each frame — 0=midnight, 0.5=noon, 1=midnight
// This means all players worldwide see the same sky phase simultaneously.
function getRealDayTime() {
  var now = new Date();
  var secsSinceMidnight = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds() + now.getMilliseconds()/1000;
  return secsSinceMidnight / 86400; // 0.0 – 1.0
}
var dayTime = getRealDayTime();

var TIERS = [
  {bg:'#3a4a6a', label:'scraps & blanket'},
  {bg:'#8b6340', label:'active worms'},
  {bg:'#7a5535', label:'compost'},  // top of merged layer
  {bg:'#4a2c10', label:'compost'},  // bottom of merged layer
];

// Large rubbish chunks for tier 0 — nibbled down by worms
var TRASH_TYPES = [
  // ── Originals kept ───────────────────────────────────────────────────────
  {name:'pizza',        liq:2, hp:9000, pts:8,  sz:57, resist:0.10, minSR:5, debrisCol:'#c8784a', debrisCol2:'#f0a060'},
  {name:'banana_peel',  liq:3, hp:5000, pts:6,  sz:42, resist:0.05, minSR:4, debrisCol:'#c8a810', debrisCol2:'#f0d040'},
  {name:'apple_core',   liq:6, hp:4000, pts:7,  sz:33, resist:0.08, minSR:4, debrisCol:'#c84030', debrisCol2:'#f06050', acid:0.3},
  {name:'egg_shell',    liq:0, hp:3000, pts:9,  sz:36, resist:0.20, minSR:4, debrisCol:'#d8d0b0', debrisCol2:'#f0e8c8'},
  {name:'newspaper',    liq:0, hp:7000, pts:4,  sz:60, resist:0.15, minSR:4, debrisCol:'#c0b890', debrisCol2:'#e8e0c0'},
  {name:'tea_bag',      liq:5, hp:3500, pts:10, sz:27, resist:0.04, minSR:4, debrisCol:'#7a4820', debrisCol2:'#b07840'},
  {name:'orange_peel',  liq:8, hp:4500, pts:8,  sz:45, resist:0.06, minSR:4, debrisCol:'#c86010', debrisCol2:'#f09030', acid:0.6},
  {name:'bread_crust',  liq:1, hp:5500, pts:6,  sz:48, resist:0.14, minSR:5, debrisCol:'#c89840', debrisCol2:'#e8c060'},
  {name:'lettuce',      liq:3, hp:2750, pts:9,  sz:54, resist:0.04, minSR:4, debrisCol:'#60a830', debrisCol2:'#90d050'},
  {name:'potato',       liq:2, hp:6500, pts:7,  sz:42, resist:0.18, minSR:5, debrisCol:'#b89858', debrisCol2:'#d8c080'},
  {name:'pasta',        liq:1, hp:3750, pts:8,  sz:39, resist:0.07, minSR:4, debrisCol:'#e0c878', debrisCol2:'#f8e8a0'},
  {name:'fish_bone',    liq:4, hp:3250, pts:11, sz:51, resist:0.06, minSR:4, debrisCol:'#d0c8a8', debrisCol2:'#f0e8c8', acid:0.4},
  {name:'broccoli',     liq:2, hp:4250, pts:9,  sz:45, resist:0.10, minSR:5, debrisCol:'#3a8828', debrisCol2:'#60b840'},
  // ── Replacements (swapped non-organic items) ─────────────────────────────
  {name:'melon_rind',   liq:4, hp:10000,pts:4,  sz:63, resist:0.12, minSR:7, debrisCol:'#60a828', debrisCol2:'#f0e8a0'},
  {name:'corn_cob',     liq:1, hp:7500, pts:5,  sz:45, resist:0.20, minSR:6, debrisCol:'#d4a020', debrisCol2:'#f0cc60'},
  {name:'watermelon_chunk',liq:5,hp:4000,pts:8, sz:57, resist:0.04, minSR:4, debrisCol:'#e03040', debrisCol2:'#60c040'},
  {name:'avocado_pit',  liq:0, hp:9000, pts:6,  sz:30, resist:0.40, minSR:7, debrisCol:'#5a3010', debrisCol2:'#8a6030'},
  {name:'cardboard_tube',liq:0,hp:6000, pts:5,  sz:33, resist:0.18, minSR:4, debrisCol:'#b89060', debrisCol2:'#d8b888'},
  // ── New additions ────────────────────────────────────────────────────────
  {name:'mushroom',     liq:3, hp:3500, pts:10, sz:39, resist:0.05, minSR:4, debrisCol:'#c8a880', debrisCol2:'#f0e0c0'},
  {name:'overripe_fruit',liq:9,hp:2750, pts:9,  sz:48, resist:0.03, minSR:4, debrisCol:'#8a3080', debrisCol2:'#d06090', acid:0.7},
  {name:'walnut_shell', liq:0, hp:8000, pts:6,  sz:36, resist:0.38, minSR:6, debrisCol:'#7a4818', debrisCol2:'#b07838'},
  {name:'dried_leaves', liq:0, hp:3250, pts:7,  sz:54, resist:0.08, minSR:4, debrisCol:'#8a6020', debrisCol2:'#c09040'},
  {name:'straw_clump',  liq:0, hp:4500, pts:5,  sz:51, resist:0.10, minSR:4, debrisCol:'#c8a830', debrisCol2:'#e8cc70'},
  {name:'grass_clippings',liq:2,hp:3000,pts:8,  sz:45, resist:0.05, minSR:4, debrisCol:'#508020', debrisCol2:'#80c030'},
  {name:'dead_flower',  liq:1, hp:3750, pts:10, sz:42, resist:0.06, minSR:4, debrisCol:'#b06820', debrisCol2:'#e09840'},
  {name:'root_bulb',    liq:2, hp:7000, pts:7,  sz:39, resist:0.22, minSR:5, debrisCol:'#a07840', debrisCol2:'#c8a868'},
  {name:'whole_tomato', liq:7, hp:3500, pts:9,  sz:42, resist:0.04, minSR:4, debrisCol:'#c82020', debrisCol2:'#f04040', acid:0.5}
];

var trashChunks = [];

// State
var scraps = [];
// Hard cap — oldest eaten scraps removed first, then oldest by insertion when full.
var MAX_SCRAPS = 300;
// Safe push — enforces the cap by removing oldest eaten scrap first, then oldest entry.
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
var debris = [];   // nibble particles falling from tier 0 into tier 1
var _debrisDirty = false; // set true whenever a debris item goes inactive — avoids filter every frame
var drops = [];
// Hard cap — beyond this, oldest inactive drops are culled before new ones are added.
// At 60fps with normal eating, steady-state is well under 80 active drops.
var MAX_DROPS = 70;   // was 200; stalled drops now age out so this is just a safety cap
// Safe push — enforces the cap by dropping the oldest entry when full.
function dropsPush(d) {
  if (drops.length >= MAX_DROPS) {
    // Find and remove first inactive drop; if all active, remove oldest
    var _removed = false;
    for (var _di2 = 0; _di2 < drops.length; _di2++) {
      if (!drops[_di2].active) { drops.splice(_di2, 1); _removed = true; break; }
    }
    if (!_removed) drops.shift(); // all active — drop oldest
  }
  drops.push(d);
}
var weatherQueue = []; // pending shed events {fireFrame, chunkIdx}
var gardenTufts = [];  // pre-generated static grass tufts — never recomputed
var gardenFlowers = []; // pre-generated static flowers
var _bladeCanvas = null; // PERF-3: offscreen pre-render of blade fringe — rebuilt in setup()
var bugs = [];   // fruit flies / gnats in tier 0 empty airspace
var castingEnrichment = 0;  // 0–1 how rich the compost layer is — built by pooping in compost

// ── Weekly drain bonus system ──────────────────────────────────────────────
var WEEK_DRAIN_MS      = 7 * 24 * 60 * 60 * 1000;
var drainBonusPopups   = [];      // [{text, x, y, alpha, vy}] floating bonus text
var scrapsLevel = 1.0;
var scrapsEmpty = false;

// ── Karma / meta currency ─────────────────────────────────────────────────
var karma = 0;               // earned from eating & pooping, persisted across sessions
var DEATH_KARMA_COST = 50;   // karma to buy back from death

// ── Death screen ──────────────────────────────────────────────────────────
var deathScreen = false;
var deathCause  = '';            // reason string set at the moment pHP hits 0
var deathFade = 0;           // 0→1 fade-in alpha

// ── Offline hunger drain ──────────────────────────────────────────────────
// We record a timestamp on every session-save. On next load we compute
// elapsed seconds and drain hunger accordingly (capped so the player
// can't die offline, just arrive very hungry).

// ── Weather system — simulated bin environment ───────────────────────────────
// Seasonal baseline + slow random drift + occasional weather events.
// All values 0–1 internally; HUD converts to human-readable units.
// temp 0–1 maps to 20°F–110°F. humidity 0–1 = 0–100%.

// Seasonal baselines by month (0=Jan … 11=Dec)
// temp: 0–1 (20°F low end, 110°F high end)
// humidity: 0–1
var WEATHER_SEASONS = [
  { temp: 0.26, humidity: 0.58 }, // Jan — cold
  { temp: 0.29, humidity: 0.55 }, // Feb
  { temp: 0.38, humidity: 0.58 }, // Mar — warming
  { temp: 0.48, humidity: 0.62 }, // Apr
  { temp: 0.58, humidity: 0.68 }, // May
  { temp: 0.68, humidity: 0.74 }, // Jun — hot, humid
  { temp: 0.76, humidity: 0.78 }, // Jul — peak summer
  { temp: 0.74, humidity: 0.76 }, // Aug
  { temp: 0.64, humidity: 0.70 }, // Sep — cooling
  { temp: 0.52, humidity: 0.63 }, // Oct
  { temp: 0.38, humidity: 0.60 }, // Nov
  { temp: 0.28, humidity: 0.57 }, // Dec
];

var weather = {
  humidity:  0.62,
  temp:      0.56,
};

// Drift targets — slowly lerp weather toward these
var _weatherTarget = { humidity: 0.62, temp: 0.56 };
// Event state — a weather event overrides the seasonal baseline temporarily
var _weatherEvent  = null; // null | { humidity, temp, endFrame }
var _weatherNextEvent = 0; // frame when next event can fire

// Called once per ~10 seconds (every 600 frames) to update simulation
function updateWeatherSim() {
  var now   = new Date();
  var month = now.getMonth(); // 0–11
  var base  = WEATHER_SEASONS[month];

  // Check if current event has expired
  if (_weatherEvent && frame >= _weatherEvent.endFrame) {
    _weatherEvent = null;
  }

  // Maybe trigger a new weather event (dry spell or heat wave — rain removed)
  if (!_weatherEvent && frame >= _weatherNextEvent) {
    var roll = Math.random();
    if (roll < 0.18) {
      // Dry spell — lower humidity
      var dur = (3600 + Math.random() * 7200);
      _weatherEvent = {
        temp:     base.temp + 0.04 + Math.random() * 0.06,
        humidity: Math.max(0, base.humidity - 0.12 - Math.random() * 0.10),
        endFrame: frame + dur,
        type:     'dry'
      };
    } else if (roll < 0.26) {
      // Heat wave — high temp
      var dur = (7200 + Math.random() * 14400);
      _weatherEvent = {
        temp:     Math.min(1, base.temp + 0.10 + Math.random() * 0.08),
        humidity: base.humidity + (Math.random() - 0.5) * 0.08,
        endFrame: frame + dur,
        type:     'heat'
      };
    }
    // Next event check: 5–15 minutes from now
    _weatherNextEvent = frame + 18000 + Math.floor(Math.random() * 36000);
  }

  // Set drift target — event overrides seasonal baseline
  var tgt = _weatherEvent || base;
  // Small random micro-drift so values always feel alive
  _weatherTarget.temp     = Math.max(0, Math.min(1, tgt.temp     + (Math.random()-0.5)*0.015));
  _weatherTarget.humidity = Math.max(0, Math.min(1, tgt.humidity + (Math.random()-0.5)*0.012));
}

// Lerp weather toward target each frame (very slowly)
function tickWeather() {
  weather.temp     += (_weatherTarget.temp     - weather.temp)     * 0.0008;
  weather.humidity += (_weatherTarget.humidity - weather.humidity) * 0.0008;
}

// ── Devvit postMessage bridge ─────────────────────────────────────────────────
// Handles all inbound messages from the Reddit/Devvit host.
// The game also sends outbound messages via postToHost() below.
// When running as a plain HTML file (local dev / testing) everything falls back
// to localStorage automatically — no Devvit host needed for local play.

// Flag: true once the host has delivered a session so setup() knows not to wait
var _devvitSessionReceived = false;

// Outbound helper — posts a message to the Devvit host if we're inside an iframe.
// Safe to call at any time; silently does nothing when running standalone.
function postToHost(msg) {
  try {
    // ── Mobile (Reddit app = React Native WebView) ────────────────────────
    // RN WebView injects window.ReactNativeWebView; postMessage MUST receive
    // a string — passing a raw object silently fails on mobile.
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      return;
    }
    // ── Web / iframe (reddit.com desktop or dev server) ───────────────────
    // window.parent !== window when inside an iframe; use structured clone
    // (no JSON.stringify needed — browser handles it).
    var target = (window.parent && window.parent !== window) ? window.parent : window;
    target.postMessage(msg, '*');
  } catch(e) {}
}

window.addEventListener('message', function(e) {
  // In Devvit, webView.postMessage() arrives from the Devvit platform origin,
  // not necessarily 'https://www.reddit.com'. Drop the strict origin check
  // and rely on the message type/structure for safety instead.
  // NOTE: On the Reddit mobile app (React Native WebView), messages arrive
  // with an empty/null e.origin — do NOT gate on origin here or mobile breaks.
  // The old guard `if (!e.origin) return` was silently dropping ALL mobile messages.

  // Devvit wraps webView.postMessage() in { type: 'devvit-message', data: { message: ... } }
  // Unwrap it so all handlers below can work with the raw message object.
  var msg = e.data;
  if (msg && msg.type === 'devvit-message' && msg.data && msg.data.message) {
    msg = typeof msg.data.message === 'string'
      ? JSON.parse(msg.data.message)
      : msg.data.message;
  }
  if (!msg || !msg.type) return;

  // ── setUsername — Reddit auth identity ───────────────────────────────────
  // Devvit host sends: { type: 'setUsername', username: 'u/SoilKing42' }

  // ── setPresence — list of other players currently in the bin ──────────────
  // Sent by host after 'requestPresence' and on Realtime presence updates.
  // { type: 'setPresence', players: [{ username, x, y, sleeping, size, avatarUrl }] }
  // We filter out our own entry so we never draw a ghost of the local player.
  if (msg.type === 'setPresence' && Array.isArray(msg.players)) {
    var now = Date.now();
    msg.players.forEach(function(p) {
      // Skip self — check both current username and any pending username from setSession.
      // username may still be '' when first presence arrives (race on boot).
      if (!p) return;
      if (username && p.username === username) return;
      if (window._pendingUsername && p.username === window._pendingUsername) return;
      // Find existing entry or create one
      var existing = null;
      for (var i = 0; i < otherPlayers.length; i++) {
        if (otherPlayers[i].username === p.username) { existing = otherPlayers[i]; break; }
      }
      if (existing) {
        // Smoothly interpolate toward new position — guard against falsy 0 coords
        if (p.x != null) existing.targetX = +p.x;
        if (p.y != null) existing.targetY = +p.y;
        existing.sleeping  = !!p.sleeping;
        existing.size      = Math.max(4, Math.min(7, +p.size || 5));
        existing.lastSeen  = now;
        // Load avatar if URL changed or image not yet loaded
        if (p.avatarUrl && p.avatarUrl !== existing.avatarUrl) {
          existing.avatarUrl = p.avatarUrl;
          var _img = new Image(); _img.src = p.avatarUrl;
          existing.avatarImg = _img;
        }
      } else {
        var _newImg = null;
        if (p.avatarUrl) { _newImg = new Image(); _newImg.src = p.avatarUrl; }
        otherPlayers.push({
          username:  p.username,
          x:         p.x != null ? +p.x : 0,
          y:         p.y != null ? +p.y : 0,
          targetX:   p.x != null ? +p.x : 0,
          targetY:   p.y != null ? +p.y : 0,
          sleeping:  !!p.sleeping,
          size:      Math.max(4, Math.min(7, +p.size || 5)),
          avatarUrl: p.avatarUrl || null,
          avatarImg: _newImg,
          hist:      null,  // initialised lazily in draw loop
          lastSeen:  now
        });
      }
    });
    // Prune players not seen in the last 90 seconds (left the post)
    otherPlayers = otherPlayers.filter(function(p) { return now - p.lastSeen < 90000; });
  }

  
  // ── setQueueState — sent on post open to queued / waiting players ─────────
});

// Derived rates — called each frame from updatePhysics
function _registerPendingWorm(pw) {
  if (!pw || !pw.username) return;
  for (var _ri = 0; _ri < pendingWorms.length; _ri++) {
    if (pendingWorms[_ri].username === pw.username) {
      pendingWorms[_ri].hatchTs = pw.hatchTs;
      pendingWorms[_ri].x       = pw.x;
      pendingWorms[_ri].y       = pw.y;
      return;
    }
  }
  pendingWorms.push({
    username: pw.username,
    hatchTs:  pw.hatchTs,
    x:        pw.x  != null ? pw.x  : W/2,
    y:        pw.y  != null ? pw.y  : 2.1 * (H || 400),
    hatched:  false,
    gutFrac:  1.0,
    segs:     null,
    angle:    0
  });
}

function _findPendingWorm(uname) {
  for (var _fi = 0; _fi < pendingWorms.length; _fi++) {
    if (pendingWorms[_fi].username === uname) return pendingWorms[_fi];
  }
  return null;
}

// Convert internal 0–1 temp to Fahrenheit  (0 = 20°F, 1 = 110°F)
function weatherTempF() { return Math.round(20 + weather.temp * 90); }




// Tunnel paths - one array per worm
var pPath = [];
var pLastX = -999, pLastY = -999;
// Hard cap on tunnel path length — prune oldest COMPLETE segments when exceeded.
// 2000 points ≈ several minutes of digging; keeps O(pPath) work bounded.
var MAX_PPATH = 2000;
var MAX_NPC_PATH = 280;          // NPC tunnels capped far below the player's so the shared
                                 // spatial index stays small and cheap to rebuild/scan.
var NPC_SIM_CAP = (function(){ var m=(window.location.search||'').match(/[?&]cap=(\d+)/); return m ? Math.max(0, +m[1]) : 10; })();            // max NPCs simulated/drawn at once (demo mode). Thins the
                                 // ~25-strong presence list so a single page stays smooth;
                                 // the real game would cap concurrent sims the same way.

// ── PERF-2: pPath Y-bucket spatial index ─────────────────────────────────
// Divides pPath into 8px-tall Y slabs so nearestPathIdx() and the drop-attachment
// scan skip the vast majority of the 2,000-point array.
// Each bucket key is Math.floor(y / PPATH_BUCKET_H) → array of pPath indices.
// The index is maintained incrementally: addPoint() inserts, splice() rebuilds.
var _pPathBuckets = {};          // { bucketKey: [ {arr, idx} ] } — spatial index across ALL registered paths
var _pPathBucketsDirty = false;  // set on prune; rebuilt at most once/frame in updatePhysics
var PPATH_BUCKET_H = 8;          // px — matches worm radius; ~1–3 buckets per scan
function _pPathBucketKey(y) { return Math.floor(y / PPATH_BUCKET_H); }

// Registry of every carve-able path. pPath (player) is always first; NPC sim.path
// arrays are appended at runtime (step 2). The spatial index and drop router address
// points as {arr, idx} so a drop can bind to and route through any registered path.
// With only pPath registered, every {arr} resolves to pPath — behaviour is unchanged.
var pathRegistry = [pPath];

// Insert one {arr, idx} reference into the bucket for a given Y.
function _pPathBucketInsert(arr, idx, y) {
  var k = _pPathBucketKey(y);
  if (!_pPathBuckets[k]) _pPathBuckets[k] = [];
  _pPathBuckets[k].push({ arr: arr, idx: idx });
}

// Full rebuild — called after a splice() shifts indices in any registered path.
// Walks every path in the registry. Once tunnels saturate their cap this fires EVERY
// frame (every carve prunes -> dirty), so it must allocate nothing: it reuses the bucket
// arrays (cleared in place) and draws {arr,idx} entries from a persistent pool. Previously
// it minted ~one object per point per frame (~4800 at full tunnels), and that GC churn was
// the progressive-lag culprit. Output is identical; only the allocations are gone.
var _bucketEntryPool = [];   // reused {arr,idx} carriers — grows to high-water once, then 0 allocs
function _pPathBucketRebuild() {
  for (var _k in _pPathBuckets) { var _ba = _pPathBuckets[_k]; if (_ba) _ba.length = 0; }
  var _pc = 0;
  for (var _ri = 0; _ri < pathRegistry.length; _ri++) {
    var _ra = pathRegistry[_ri];
    for (var _bi = 0; _bi < _ra.length; _bi++) {
      var _bp = _ra[_bi];
      if (!_bp) continue;
      var _key = _pPathBucketKey(_bp.y);
      var _bkt = _pPathBuckets[_key];
      if (!_bkt) { _bkt = _pPathBuckets[_key] = []; }
      var _e = _bucketEntryPool[_pc];
      if (!_e) { _e = _bucketEntryPool[_pc] = { arr: null, idx: 0 }; }
      _e.arr = _ra; _e.idx = _bi;
      _bkt.push(_e);
      _pc++;
    }
  }
}

// ── Cocoon system ─────────────────────────────────────────────────────────
var cocoons = [];
var COCOON_KARMA_REQ  = 90;
var COCOON_MATURE_MS  = 7 * 24 * 60 * 60 * 1000;
var COCOON_WEEK_MS    = WEEK_DRAIN_MS; // same duration — one week
var COCOON_MAX        = 3;
var lastCocoonLaid    = 0;
var clitellumReady    = false;

// ── Junction state ────────────────────────────────────────────────────────
var JUNCTION_HOLD_FRAMES = 90;   // ~1.5s at 60fps
var junctionTimer = 0;           // counts up while worm holds still over a drain
var junctionTargetIdx = -1;      // pPath index of nearest sump-connected point
var junctionTargetRef = null;    // {arr, idx} of the cross-path point being held over
var junctionUsedPoints = [];     // [{x,y}] locations already junctioned — no re-use
var junctionCarveOrigin = null;  // {x,y} set on junction stamp — suppresses carving until 20px away
var drainDownTimer = 0;          // charges while worm holds still at sump (down drain)
var drainUpTimer = 0;            // charges while worm holds still at sump after down drain (up drain)
var drainDownCooldown = 0;       // lockout frames after down drain fires — prevents up drain starting instantly

// Player worm
var pEaten = 0;   // total items eaten — growth gated on this
var bornTs = 0;   // timestamp when this worm life began — for headstone birth date
var pGut = 0;     // gut size 0..pGutMax — bigger gut = bigger poop deposit
var pGutMax = 8;
var pPooping = false;
var pLastPoopScore = 0;
var pLastPoop = 0; // frame of last poop — cooldown
var POOP_COOLDOWN = 12; // frames between poops (~5 per second at 60fps)

// ── Sleep state ───────────────────────────────────────────────────────────
var pSleeping = false;
var pSleepX = 0, pSleepY = 0;   // locked position while sleeping
var pSleepCurl = 0;              // 0→1 curl animation progress
var pZzz = [];                   // floating ZZZ particles

// ── Acid burn state ───────────────────────────────────────────────────────
var pAcid = 0;           // 0.0–1.0 acid buildup level
var ACID_DECAY = 1 / (60 * 180); // acid clears in ~3 minutes of not eating acid
var ACID_HP_DRAIN = 0.0006;      // HP lost per frame while acid > 0.5
var pHP = 1.0;
// pHunger is DERIVED each frame: pHunger = 1 - (pGut/pGutMax)
// 0.0 = full gut (satisfied), 1.0 = empty gut (starving) — high value = danger
var pHunger = 0.0;
var pSegs = [];
var pHist = [];
var pSR = 4;
var pSEG = 4;
var generation = 0; // increments on each natural death — never resets

// ── Other players (presence) ──────────────────────────────────────────────
// Each entry: { username, x, y, sleeping, size, avatarUrl, lastSeen }
// Populated via postMessage({ type: 'setPresence', players: [...] }) from host.
// Rendered as ghost worms in the draw loop — no game logic applied to them.
var otherPlayers = [];

// ── Queue & pending worm system ───────────────────────────────────────────
var playerState     = 'playing';   // 'playing' | 'dead' | 'queued' | 'claiming'
var queuePosition   = 0;           // 1-based position in wait list (0 = not queued)
var queueTotal      = 0;           // total players in queue
var pendingWorms    = [];          // [{username, hatchTs, x, y, hatched, gutFrac, segs, angle}]
var HATCH_DELAY_MS  = 3 * 60 * 1000;  // 3 minutes
var UNCLAIMED_GUT_BURN = 3.0;     // multiplier on gut drain when worm uncontrolled
var OFFLINE_DRAIN_PER_SEC_Q = 1 / (24 * 3600); // local copy for queue calc

function getBin() {
  // Bin is always sized to WORLD_W, centered in the world.
  // camX scrolls the world within the viewport (W).
  var bw = Math.min(WORLD_W * 0.88, WORLD_W - 32);
  var cx = WORLD_W / 2;
  return { cx: cx, bw: bw, bw2: bw/2, lw: Math.floor(WORLD_W * 0.04) };
}
// Cached bin geometry — recomputed only when W changes (resizeCanvas).
// Hot paths call _bin instead of getBin() to avoid per-frame recalculation.
var _bin = null;
// Override getBin to return the cache when available — safe because W never
// changes mid-frame. Falls back to live if cache is stale (W changed since last resize).
var _binCacheW = -1;
function getBinCached() {
  if (_bin === null || W !== _binCacheW) { _bin = getBin(); _binCacheW = W; }
  return _bin;
}

function getTier(wy) {
  if (!H) return 0;
  return Math.min(Math.max(Math.floor(wy / H), 0), 3);
}

function cSurf() { return 2.5*H; } // sump line / compost bottom. Compost = [2H..cSurf()] (half-depth).

// ── Compost layer (tier 2, y = 2H..cSurf()) ─
function inCompost(wy) { return wy >= 2*H && wy < cSurf(); }
// 0 at top of compost, 1 at bottom — for depth-scaled rewards/effects
function compostDepth(wy) { return Math.min(1, Math.max(0, (wy - 2*H) / (cSurf() - 2*H))); }

// Find the nearest pPath index at or below a given world-y, within xTol horizontally
function nearestPathIdx(wx, wy, xTol, yTol) {
  // PERF-2: scan only the Y-buckets that overlap the search window instead of all 2,000 points.
  var best = -1, bestDist = 999999;
  var _yMax = (yTol != null) ? wy + yTol : wy + 64; // cap at 64px when no yTol given
  var kMin = _pPathBucketKey(wy);
  var kMax = _pPathBucketKey(_yMax);
  for (var k = kMin; k <= kMax; k++) {
    var bucket = _pPathBuckets[k];
    if (!bucket) continue;
    for (var _bi = 0; _bi < bucket.length; _bi++) {
      var entry = bucket[_bi];
      var i = entry.idx;
      var p = entry.arr[entry.idx];
      if (!p) continue;
      var a = p.alpha != null ? p.alpha : 1;
      if (a <= 0) continue;
      if (p.y < wy) continue; // must be at or below
      if (yTol != null && p.y > wy + yTol) continue; // not too far below
      if (Math.abs(p.x - wx) > xTol) continue;
      var dist = Math.abs(p.y - wy);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
  }
  return best;
}

// Paths only exist in the compost layer (tier 2) — dense enough to hold a channel
// Tiers 0 and 1 are too loose; movement leaves no trace there

function addPoint(path, x, y, r, lastX, lastY) {
  var dx = x - lastX, dy = y - lastY;
  var dd = Math.sqrt(dx*dx + dy*dy);
  if (dd < r * 0.6) return false;
  var ti = getTier(y);
  if (ti < 2) return false; // only dense lower tiers hold tunnels
  if (dd > r * 8) path.push(null);
  // PERF-2: insert into Y-bucket index before push so the index stays current.
  // path === pPath check guards against any future secondary path arrays.
  var _newIdx = path.length;
  path.push({x:x, y:y, r:r, ti:ti});
  if (pathRegistry.indexOf(path) >= 0) _pPathBucketInsert(path, _newIdx, y);
  // Prune oldest complete segment(s) when over cap — always cut on a null boundary
  // so no segment is left half-orphaned (drops referencing pruned indices detach safely).
  var _pathCap = (path === pPath) ? MAX_PPATH : MAX_NPC_PATH;
  if (path.length > _pathCap) {
    var _pruneTarget = path.length - _pathCap; // how many entries to drop
    // Walk forward to the first null AT OR AFTER _pruneTarget so we cut cleanly
    var _pruneAt = _pruneTarget;
    while (_pruneAt < path.length && path[_pruneAt] !== null) _pruneAt++;
    if (_pruneAt < path.length) _pruneAt++; // include the null itself
    path.splice(0, _pruneAt);
    // PERF-2: rebuild the bucket index after splice — all indices shifted by _pruneAt.
    // O(pPath.length) but only fires when MAX_PPATH is hit, not every frame.
    if (pathRegistry.indexOf(path) >= 0) _pPathBucketsDirty = true; // debounced — one rebuild/frame
    // Shift all pathIdx references on active drops — they point into the OLD array
    // Drops that referenced pruned entries will have pathIdx < 0 after shift and must detach.
    // (updatePhysics already handles null/missing pPath[d.pathIdx] by detaching the drop.)
    if (typeof drops !== 'undefined') {
      for (var _ppi = 0; _ppi < drops.length; _ppi++) {
        var _ppd = drops[_ppi];
        // Only drops bound to THIS path's array are affected by its splice.
        if ((_ppd.pathArr || pPath) !== path) continue;
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

// ---- Trash chunk offscreen pre-render (PERF-1) ---- //
// Pre-renders a trash chunk to an OffscreenCanvas and caches it as tc.img.
// Called once at spawn (or once on settle after drop) and again only when
// hpFrac crosses a 10% threshold (chunks banded into 10 buckets).
// The draw loop replaces the 701-line drawTrashChunk() call with ctx.drawImage().
function _prerenderTrashChunk(tc) {
  var r = tc.sz;
  var hpFrac = tc.hpFrac;
  var pad = Math.ceil(r * 1.4) + 2;
  var size = pad * 2;
  var oc;
  try {
    oc = new OffscreenCanvas(size, size);
  } catch (e) {
    // Fallback to regular canvas if OffscreenCanvas not available
    oc = document.createElement('canvas');
    oc.width = size; oc.height = size;
  }
  var octx = oc.getContext('2d');
  octx.clearRect(0, 0, size, size);
  octx.translate(pad, pad);
  try {
    drawTrashChunk(octx, tc.t.name, r, hpFrac);
  } catch (e) {
    // If render fails, leave tc.img null — draw loop will fall back to live draw
    tc.img = null;
    tc._imgPad = pad;
    tc._imgHpBucket = Math.floor(hpFrac * 10);
    return;
  }
  tc.img = oc;
  tc._imgPad = pad;
  tc._imgHpBucket = Math.floor(hpFrac * 10);
}

// Invalidates cached img if hpFrac has crossed a 10% bucket boundary.
// Call after any hp change on a trash chunk.
function _invalidateChunkImg(tc) {
  var newBucket = Math.floor(tc.hpFrac * 10);
  if (tc.img && tc._imgHpBucket === newBucket) return; // still valid
  _prerenderTrashChunk(tc);
}

// ---- Trash chunk drawing ---- //
// Items always drawn full size at full brightness — decay shown only through nibble debris.
// ctx must be already translated & rotated before calling.
function drawTrashChunk(ctx, name, r, hpFrac) {
  // dim() kept for colour reuse but always returns full brightness
  function dim(hex) { return hex; }

  switch(name) {

    case 'pizza': // Pizza slice
      // Crust outer triangle
      ctx.fillStyle = dim('#d4936a');
      ctx.beginPath();
      ctx.moveTo(0, -r*0.9);
      ctx.lineTo(-r*0.85, r*0.72);
      ctx.lineTo(r*0.85, r*0.72);
      ctx.closePath(); ctx.fill();
      // Dough fill
      ctx.fillStyle = dim('#f0c888');
      ctx.beginPath();
      ctx.moveTo(0, -r*0.62);
      ctx.lineTo(-r*0.65, r*0.62);
      ctx.lineTo(r*0.65, r*0.62);
      ctx.closePath(); ctx.fill();
      // Tomato sauce patches
      ctx.fillStyle = dim('#c03020');
      ctx.beginPath(); ctx.ellipse(-r*0.15, r*0.1, r*0.32, r*0.22, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r*0.2, -r*0.15, r*0.2, r*0.16, -0.5, 0, Math.PI*2); ctx.fill();
      // Cheese blobs
      ctx.fillStyle = dim('#f0d060');
      ctx.beginPath(); ctx.ellipse(r*0.05, r*0.05, r*0.18, r*0.12, 0.8, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-r*0.28, -r*0.08, r*0.13, r*0.09, -0.3, 0, Math.PI*2); ctx.fill();
      // Pepperoni
      ctx.fillStyle = dim('#8a2010');
      ctx.beginPath(); ctx.arc(-r*0.05, -r*0.28, r*0.12, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(r*0.3, r*0.28, r*0.09, 0, Math.PI*2); ctx.fill();
      // Crust ridge
      ctx.strokeStyle = dim('#b87040');
      ctx.lineWidth = r*0.09;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-r*0.85, r*0.72); ctx.lineTo(r*0.85, r*0.72);
      ctx.stroke();
      break;

    case 'banana_peel': // Floppy banana peel
      // Four splayed peel lobes
      var peelCols = [dim('#d4a808'), dim('#c09808'), dim('#e8c010'), dim('#b88800')];
      var angles = [-0.7, 0.2, 1.1, 2.0];
      for (var peelI = 0; peelI < 4; peelI++) {
        ctx.fillStyle = peelCols[peelI];
        ctx.save();
        ctx.rotate(angles[peelI]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(r*0.2, -r*0.3, r*0.5, -r*1.0, r*0.15, -r*1.1);
        ctx.bezierCurveTo(-r*0.2, -r*1.0, -r*0.4, -r*0.4, 0, 0);
        ctx.fill();
        // Inner pale peel surface
        ctx.fillStyle = dim('#f5e090');
        ctx.beginPath();
        ctx.moveTo(0, -r*0.05);
        ctx.bezierCurveTo(r*0.1, -r*0.3, r*0.3, -r*0.85, r*0.1, -r*0.95);
        ctx.bezierCurveTo(-r*0.1, -r*0.82, -r*0.22, -r*0.32, 0, -r*0.05);
        ctx.fill();
        ctx.restore();
      }
      // Brown tip nub
      ctx.fillStyle = dim('#5a3a00');
      ctx.beginPath(); ctx.arc(0, 0, r*0.15, 0, Math.PI*2); ctx.fill();
      break;

    case 'apple_core': // Gnawed apple core
      // Core body
      ctx.fillStyle = dim('#d4c8a0');
      ctx.beginPath();
      ctx.ellipse(0, 0, r*0.38, r*0.9, 0, 0, Math.PI*2);
      ctx.fill();
      // Remaining red flesh patches
      if (hpFrac > 0.3) {
        ctx.fillStyle = dim('#d83020');
        ctx.beginPath(); ctx.ellipse(-r*0.25, -r*0.3, r*0.22, r*0.35, 0.4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r*0.22, r*0.2, r*0.18, r*0.28, -0.3, 0, Math.PI*2); ctx.fill();
      }
      // Seeds
      ctx.fillStyle = dim('#3a2008');
      for (var seedI = 0; seedI < 3; seedI++) {
        ctx.beginPath(); ctx.ellipse((seedI-1)*r*0.12, seedI*r*0.18-r*0.12, r*0.06, r*0.1, 0.2, 0, Math.PI*2); ctx.fill();
      }
      // Top stem
      ctx.strokeStyle = dim('#5a3010');
      ctx.lineWidth = r*0.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -r*0.9); ctx.lineTo(r*0.08, -r*1.15); ctx.stroke();
      // Bottom calyx
      ctx.strokeStyle = dim('#5a3010');
      ctx.lineWidth = r*0.08;
      ctx.beginPath(); ctx.moveTo(-r*0.12, r*0.88); ctx.lineTo(r*0.12, r*0.95); ctx.stroke();
      break;

    case 'melon_rind': // Big curved rind — green outside, pale inside, pink flesh remnant
      // Green outer rind
      ctx.fillStyle = '#4a8820';
      ctx.beginPath();
      ctx.moveTo(-r*0.95, r*0.1);
      ctx.bezierCurveTo(-r*0.9, -r*0.55, r*0.9, -r*0.55, r*0.95, r*0.1);
      ctx.bezierCurveTo(r*0.85, r*0.75, -r*0.85, r*0.75, -r*0.95, r*0.1);
      ctx.fill();
      // White pith band
      ctx.fillStyle = '#e8f0d8';
      ctx.beginPath();
      ctx.moveTo(-r*0.82, r*0.12);
      ctx.bezierCurveTo(-r*0.78, -r*0.38, r*0.78, -r*0.38, r*0.82, r*0.12);
      ctx.bezierCurveTo(r*0.72, r*0.58, -r*0.72, r*0.58, -r*0.82, r*0.12);
      ctx.fill();
      // Pink flesh
      ctx.fillStyle = '#e85870';
      ctx.beginPath();
      ctx.moveTo(-r*0.62, r*0.14);
      ctx.bezierCurveTo(-r*0.58, -r*0.18, r*0.58, -r*0.18, r*0.62, r*0.14);
      ctx.bezierCurveTo(r*0.52, r*0.42, -r*0.52, r*0.42, -r*0.62, r*0.14);
      ctx.fill();
      // Seeds
      ctx.fillStyle = '#1a1008';
      for (var melonSeedI = 0; melonSeedI < 4; melonSeedI++) {
        ctx.beginPath(); ctx.ellipse(-r*0.3+melonSeedI*r*0.2, r*0.1, r*0.04, r*0.07, 0.2, 0, Math.PI*2); ctx.fill();
      }
      break;

    case 'corn_cob': // Corn cob with a few kernels still on
      // Cob body
      ctx.fillStyle = '#d4a828';
      ctx.beginPath();
      ctx.ellipse(0, 0, r*0.42, r*0.9, 0, 0, Math.PI*2);
      ctx.fill();
      // Kernel rows — fixed grid
      ctx.fillStyle = '#f0cc50';
      for (var cri = -3; cri <= 3; cri++) {
        for (var cci = 0; cci < 4; cci++) {
          var kx = (cci - 1.5) * r*0.18;
          var ky = cri * r*0.22;
          ctx.beginPath(); ctx.ellipse(kx, ky, r*0.08, r*0.09, 0, 0, Math.PI*2); ctx.fill();
        }
      }
      // Kernel shadow lines
      ctx.strokeStyle = '#b88818'; ctx.lineWidth = r*0.03;
      for (var cornRowI = -3; cornRowI <= 3; cornRowI++) {
        ctx.beginPath(); ctx.moveTo(-r*0.35, cornRowI*r*0.22-r*0.05); ctx.lineTo(r*0.35, cornRowI*r*0.22-r*0.05); ctx.stroke();
      }
      // Silk strands at top
      ctx.strokeStyle = '#e8c878'; ctx.lineWidth = r*0.03; ctx.lineCap='round';
      for (var silkI = 0; silkI < 5; silkI++) {
        ctx.beginPath();
        ctx.moveTo((silkI-2)*r*0.08, -r*0.88);
        ctx.lineTo((silkI-2)*r*0.12, -r*1.15);
        ctx.stroke();
      }
      // Husk leaf remnants at bottom
      ctx.fillStyle = '#78a028';
      ctx.beginPath(); ctx.moveTo(-r*0.42, r*0.78); ctx.bezierCurveTo(-r*0.6, r*1.1, r*0.1, r*1.2, r*0.3, r*0.9); ctx.lineTo(r*0.42, r*0.78); ctx.closePath(); ctx.fill();
      break;

    case 'watermelon_chunk': // Big wedge of watermelon — bright and juicy
      // Green rind outer
      ctx.fillStyle = '#3a8818';
      ctx.beginPath();
      ctx.moveTo(0, -r*0.15);
      ctx.lineTo(-r*0.95, r*0.82);
      ctx.lineTo(r*0.95, r*0.82);
      ctx.closePath(); ctx.fill();
      // White pith
      ctx.fillStyle = '#e8f4d8';
      ctx.beginPath();
      ctx.moveTo(0, -r*0.08);
      ctx.lineTo(-r*0.82, r*0.75);
      ctx.lineTo(r*0.82, r*0.75);
      ctx.closePath(); ctx.fill();
      // Red flesh
      ctx.fillStyle = '#e82840';
      ctx.beginPath();
      ctx.moveTo(0, r*0.05);
      ctx.lineTo(-r*0.68, r*0.72);
      ctx.lineTo(r*0.68, r*0.72);
      ctx.closePath(); ctx.fill();
      // Seeds
      ctx.fillStyle = '#1a1008';
      var wmSeeds = [[-r*0.28,r*0.38],[r*0.18,r*0.28],[-r*0.05,r*0.52],[r*0.4,r*0.48],[-r*0.45,r*0.55]];
      for (var wmSeedI=0; wmSeedI<wmSeeds.length; wmSeedI++) {
        ctx.beginPath(); ctx.ellipse(wmSeeds[wmSeedI][0], wmSeeds[wmSeedI][1], r*0.04, r*0.07, 0.3, 0, Math.PI*2); ctx.fill();
      }
      // Stripe on rind
      ctx.strokeStyle = '#285a10'; ctx.lineWidth = r*0.06;
      ctx.beginPath(); ctx.moveTo(-r*0.5, r*0.42); ctx.lineTo(-r*0.72, r*0.78); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r*0.38, r*0.38); ctx.lineTo(r*0.58, r*0.78); ctx.stroke();
      break;

    case 'avocado_pit': // Hard round pit — brown, smooth, dense
      // Outer skin
      ctx.fillStyle = '#3a2008';
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.82, r*0.95, 0.15, 0, Math.PI*2); ctx.fill();
      // Inner flesh colour showing through crack
      ctx.fillStyle = '#c89840';
      ctx.beginPath();
      ctx.moveTo(-r*0.1, -r*0.7);
      ctx.bezierCurveTo(r*0.3, -r*0.5, r*0.35, r*0.3, r*0.0, r*0.6);
      ctx.bezierCurveTo(-r*0.25, r*0.3, -r*0.3, -r*0.4, -r*0.1, -r*0.7);
      ctx.fill();
      // Surface sheen
      ctx.fillStyle = 'rgba(255,220,160,0.18)';
      ctx.beginPath(); ctx.ellipse(-r*0.22, -r*0.28, r*0.28, r*0.18, -0.6, 0, Math.PI*2); ctx.fill();
      break;

    case 'cardboard_tube': // Toilet roll / kitchen roll cardboard tube
      // Tube body — open cylinder
      ctx.fillStyle = '#c8a060';
      ctx.beginPath();
      ctx.ellipse(0, -r*0.72, r*0.52, r*0.14, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(-r*0.52, -r*0.72, r*1.04, r*1.44);
      ctx.beginPath();
      ctx.ellipse(0, r*0.72, r*0.52, r*0.14, 0, 0, Math.PI*2); ctx.fill();
      // Hollow interior (open ends)
      ctx.fillStyle = '#7a4820';
      ctx.beginPath(); ctx.ellipse(0, -r*0.72, r*0.36, r*0.09, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, r*0.72, r*0.36, r*0.09, 0, 0, Math.PI*2); ctx.fill();
      // Spiral seam line
      ctx.strokeStyle = '#a07840'; ctx.lineWidth = r*0.05;
      ctx.beginPath();
      ctx.moveTo(-r*0.52, -r*0.4);
      ctx.bezierCurveTo(r*0.0, -r*0.55, r*0.0, r*0.55, r*0.52, r*0.4);
      ctx.stroke();
      // Slight crush dent
      ctx.fillStyle = 'rgba(80,40,10,0.18)';
      ctx.beginPath(); ctx.ellipse(r*0.3, r*0.1, r*0.2, r*0.38, 0.3, 0, Math.PI*2); ctx.fill();
      break;

    case 'mushroom': // Whole mushroom — cap and stubby stalk
      // Stalk
      ctx.fillStyle = '#e8dcc8';
      ctx.beginPath(); ctx.ellipse(0, r*0.55, r*0.22, r*0.48, 0, 0, Math.PI*2); ctx.fill();
      // Gills under cap
      ctx.fillStyle = '#c8b8a0';
      ctx.beginPath();
      ctx.moveTo(-r*0.78, r*0.08);
      ctx.bezierCurveTo(-r*0.5, r*0.28, r*0.5, r*0.28, r*0.78, r*0.08);
      ctx.lineTo(r*0.22, r*0.08);
      ctx.bezierCurveTo(r*0.1, r*0.22, -r*0.1, r*0.22, -r*0.22, r*0.08);
      ctx.closePath(); ctx.fill();
      // Gill lines
      ctx.strokeStyle = '#a89070'; ctx.lineWidth = r*0.03;
      for (var gi2 = -3; gi2 <= 3; gi2++) {
        ctx.beginPath(); ctx.moveTo(gi2*r*0.22, r*0.1); ctx.lineTo(gi2*r*0.12, r*0.22); ctx.stroke();
      }
      // Cap
      ctx.fillStyle = '#b07040';
      ctx.beginPath();
      ctx.moveTo(-r*0.78, r*0.1);
      ctx.bezierCurveTo(-r*0.88, -r*0.4, -r*0.55, -r*0.92, 0, -r*0.95);
      ctx.bezierCurveTo(r*0.55, -r*0.92, r*0.88, -r*0.4, r*0.78, r*0.1);
      ctx.closePath(); ctx.fill();
      // Cap highlights
      ctx.fillStyle = '#c88850';
      ctx.beginPath(); ctx.ellipse(-r*0.15, -r*0.55, r*0.28, r*0.18, -0.4, 0, Math.PI*2); ctx.fill();
      break;

    case 'overripe_fruit': // Squashed overripe plum/fig — purple, oozing
      // Main body, irregular squashed blob
      ctx.fillStyle = '#6a1858';
      ctx.beginPath();
      ctx.moveTo(-r*0.1, -r*0.88);
      ctx.bezierCurveTo(r*0.65, -r*0.8, r*0.92, -r*0.1, r*0.85, r*0.5);
      ctx.bezierCurveTo(r*0.7, r*0.92, -r*0.4, r*0.88, -r*0.82, r*0.55);
      ctx.bezierCurveTo(-r*1.0, r*0.1, -r*0.75, -r*0.62, -r*0.1, -r*0.88);
      ctx.fill();
      // Oozing juice patch
      ctx.fillStyle = '#c03880';
      ctx.beginPath(); ctx.ellipse(r*0.2, r*0.3, r*0.42, r*0.28, 0.5, 0, Math.PI*2); ctx.fill();
      // Stem nub
      ctx.strokeStyle = '#3a1808'; ctx.lineWidth = r*0.1; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-r*0.08, -r*0.88); ctx.lineTo(r*0.04, -r*1.1); ctx.stroke();
      // Wrinkled skin lines
      ctx.strokeStyle = 'rgba(100,10,60,0.4)'; ctx.lineWidth = r*0.05;
      ctx.beginPath(); ctx.moveTo(-r*0.5, -r*0.3); ctx.bezierCurveTo(-r*0.2, r*0.1, r*0.3, r*0.0, r*0.55, r*0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r*0.6, r*0.2); ctx.bezierCurveTo(-r*0.1, r*0.5, r*0.2, r*0.6, r*0.5, r*0.62); ctx.stroke();
      break;

    case 'walnut_shell': // Cracked walnut half — hard ridged shell
      // Outer shell
      ctx.fillStyle = '#6a3a10';
      ctx.beginPath();
      ctx.moveTo(-r*0.72, r*0.1);
      ctx.bezierCurveTo(-r*0.82, -r*0.55, -r*0.3, -r*0.92, r*0.0, -r*0.88);
      ctx.bezierCurveTo(r*0.35, -r*0.85, r*0.82, -r*0.45, r*0.72, r*0.1);
      ctx.bezierCurveTo(r*0.6, r*0.55, -r*0.6, r*0.55, -r*0.72, r*0.1);
      ctx.fill();
      // Inner pale shell wall
      ctx.fillStyle = '#c8a868';
      ctx.beginPath();
      ctx.moveTo(-r*0.58, r*0.08);
      ctx.bezierCurveTo(-r*0.65, -r*0.38, -r*0.2, -r*0.72, r*0.0, -r*0.68);
      ctx.bezierCurveTo(r*0.25, -r*0.65, r*0.62, -r*0.3, r*0.55, r*0.08);
      ctx.bezierCurveTo(r*0.42, r*0.38, -r*0.42, r*0.38, -r*0.58, r*0.08);
      ctx.fill();
      // Ridge lines across shell
      ctx.strokeStyle = '#4a2808'; ctx.lineWidth = r*0.06; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0, -r*0.72); ctx.bezierCurveTo(-r*0.1, -r*0.2, -r*0.05, r*0.2, 0, r*0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r*0.38, -r*0.42); ctx.bezierCurveTo(-r*0.3, -r*0.1, -r*0.28, r*0.12, -r*0.22, r*0.38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r*0.38, -r*0.42); ctx.bezierCurveTo(r*0.3, -r*0.1, r*0.28, r*0.12, r*0.22, r*0.38); ctx.stroke();
      break;

    case 'dried_leaves': // Crumpled autumn leaf
      ctx.fillStyle = '#8a5818';
      ctx.beginPath();
      ctx.moveTo(0, -r*0.95);
      ctx.bezierCurveTo(r*0.5, -r*0.8, r*0.95, -r*0.3, r*0.88, r*0.15);
      ctx.bezierCurveTo(r*0.75, r*0.55, r*0.3, r*0.92, 0, r*0.95);
      ctx.bezierCurveTo(-r*0.3, r*0.92, -r*0.75, r*0.55, -r*0.88, r*0.15);
      ctx.bezierCurveTo(-r*0.95, -r*0.3, -r*0.5, -r*0.8, 0, -r*0.95);
      ctx.fill();
      // Dried colour variation patches
      ctx.fillStyle = '#c07828';
      ctx.beginPath(); ctx.ellipse(r*0.3, -r*0.2, r*0.28, r*0.2, 0.6, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-r*0.25, r*0.35, r*0.22, r*0.16, -0.4, 0, Math.PI*2); ctx.fill();
      // Midrib and veins
      ctx.strokeStyle = '#5a3008'; ctx.lineWidth = r*0.05; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0, -r*0.88); ctx.lineTo(0, r*0.88); ctx.stroke();
      ctx.lineWidth = r*0.03;
      var dvAngles = [-0.5, -0.25, 0.25, 0.5];
      for (var dvi=0; dvi<4; dvi++) {
        ctx.beginPath(); ctx.moveTo(dvAngles[dvi]*r*0.3, dvi*r*0.38-r*0.38);
        ctx.lineTo(dvAngles[dvi]*r*0.8, dvi*r*0.38-r*0.28); ctx.stroke();
      }
      break;

    case 'straw_clump': // Clump of dried straw / hay
      ctx.lineCap='round';
      var stAngles = [-0.35,-0.18,-0.05,0.08,0.22,0.38,-0.28,0.15,-0.12,0.3];
      var stCols = ['#c8a830','#d4b840','#b89820','#e0c050','#c0a028'];
      for (var sti=0; sti<10; sti++) {
        ctx.strokeStyle = stCols[sti%5]; ctx.lineWidth = r*0.07;
        ctx.save(); ctx.rotate(stAngles[sti]);
        ctx.beginPath();
        ctx.moveTo(0, -r*0.9);
        ctx.bezierCurveTo(r*0.1, -r*0.4, -r*0.1, r*0.2, r*0.05, r*0.92);
        ctx.stroke();
        ctx.restore();
      }
      // Binding wisp in middle
      ctx.strokeStyle = '#906018'; ctx.lineWidth = r*0.12;
      ctx.beginPath(); ctx.moveTo(-r*0.25, 0); ctx.lineTo(r*0.25, 0); ctx.stroke();
      break;

    case 'grass_clippings': // Handful of fresh cut grass
      ctx.lineCap='round';
      var gcAngles = [-0.4,-0.22,-0.08,0.05,0.18,0.32,0.45,-0.3,0.1,-0.15,0.28];
      var gcCols = ['#508020','#68a028','#407018','#80c030','#5a9020'];
      for (var gci=0; gci<11; gci++) {
        ctx.strokeStyle = gcCols[gci%5]; ctx.lineWidth = r*0.06;
        ctx.save(); ctx.rotate(gcAngles[gci]);
        ctx.beginPath();
        ctx.moveTo(0, -r*0.92);
        ctx.bezierCurveTo(r*0.12, -r*0.5, -r*0.08, r*0.1, r*0.04, r*0.88);
        ctx.stroke();
        ctx.restore();
      }
      break;

    case 'dead_flower': // Wilted flower head — drooping petals
      // Centre seed head
      ctx.fillStyle = '#5a3808';
      ctx.beginPath(); ctx.arc(0, 0, r*0.28, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#8a5818';
      ctx.beginPath(); ctx.arc(0, 0, r*0.18, 0, Math.PI*2); ctx.fill();
      // Drooping petals — 7 wilted, all angled downward
      var dfPetalAngles = [0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4];
      var dfCols = ['#c07820','#d08830','#b86818','#e09838'];
      for (var dfi=0; dfi<7; dfi++) {
        ctx.save();
        ctx.rotate(dfPetalAngles[dfi]);
        ctx.fillStyle = dfCols[dfi%4];
        ctx.beginPath();
        // Petals droop — control points lean down
        ctx.moveTo(0, -r*0.25);
        ctx.bezierCurveTo(r*0.2, -r*0.4, r*0.35, -r*0.9, r*0.12, -r*0.98);
        ctx.bezierCurveTo(-r*0.18, -r*0.85, -r*0.22, -r*0.4, 0, -r*0.25);
        ctx.fill();
        ctx.restore();
      }
      // Stem stub
      ctx.strokeStyle = '#486010'; ctx.lineWidth = r*0.1;
      ctx.beginPath(); ctx.moveTo(0, r*0.25); ctx.lineTo(r*0.08, r*0.88); ctx.stroke();
      break;

    case 'root_bulb': // Gnarly root / small bulb with trailing roots
      // Main bulb body
      ctx.fillStyle = '#9a7040';
      ctx.beginPath();
      ctx.moveTo(-r*0.2, -r*0.72);
      ctx.bezierCurveTo(r*0.55, -r*0.68, r*0.85, -r*0.08, r*0.75, r*0.38);
      ctx.bezierCurveTo(r*0.6, r*0.78, -r*0.3, r*0.82, -r*0.68, r*0.48);
      ctx.bezierCurveTo(-r*0.9, r*0.08, -r*0.72, -r*0.48, -r*0.2, -r*0.72);
      ctx.fill();
      // Soil patches
      ctx.fillStyle = '#6a4820';
      ctx.beginPath(); ctx.ellipse(r*0.2, r*0.2, r*0.25, r*0.15, 0.4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-r*0.28, -r*0.18, r*0.18, r*0.1, -0.3, 0, Math.PI*2); ctx.fill();
      // Trailing root tendrils
      ctx.strokeStyle = '#8a6030'; ctx.lineWidth = r*0.05; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(r*0.5, r*0.55); ctx.bezierCurveTo(r*0.7, r*0.8, r*0.85, r*0.9, r*0.75, r*1.05); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r*0.4, r*0.62); ctx.bezierCurveTo(-r*0.6, r*0.88, -r*0.55, r*1.0, -r*0.42, r*1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r*0.1, r*0.78); ctx.bezierCurveTo(r*0.2, r*1.0, r*0.12, r*1.1, r*0.18, r*1.18); ctx.stroke();
      // Green sprout tip
      ctx.strokeStyle = '#508020'; ctx.lineWidth = r*0.08;
      ctx.beginPath(); ctx.moveTo(-r*0.18, -r*0.72); ctx.lineTo(-r*0.1, -r*1.05); ctx.stroke();
      break;

    case 'whole_tomato': // Ripe tomato, slightly squished
      // Body
      ctx.fillStyle = '#d02020';
      ctx.beginPath();
      ctx.moveTo(-r*0.1, -r*0.82);
      ctx.bezierCurveTo(r*0.65, -r*0.78, r*0.95, -r*0.18, r*0.92, r*0.28);
      ctx.bezierCurveTo(r*0.85, r*0.78, r*0.3, r*0.95, 0, r*0.95);
      ctx.bezierCurveTo(-r*0.35, r*0.95, -r*0.88, r*0.72, -r*0.92, r*0.22);
      ctx.bezierCurveTo(-r*0.95, -r*0.28, -r*0.65, -r*0.8, -r*0.1, -r*0.82);
      ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255,160,140,0.35)';
      ctx.beginPath(); ctx.ellipse(-r*0.28, -r*0.28, r*0.3, r*0.2, -0.5, 0, Math.PI*2); ctx.fill();
      // Ribbing lines
      ctx.strokeStyle = '#a01818'; ctx.lineWidth = r*0.04;
      for (var tri=0; tri<4; tri++) {
        var ta = tri * Math.PI/2 + 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ta)*r*0.12, Math.sin(ta)*r*0.12-r*0.72);
        ctx.bezierCurveTo(Math.cos(ta)*r*0.5, Math.sin(ta)*r*0.2, Math.cos(ta)*r*0.6, Math.sin(ta)*r*0.5, Math.cos(ta)*r*0.55, Math.sin(ta)*r*0.88);
        ctx.stroke();
      }
      // Calyx star
      ctx.fillStyle = '#286010';
      for (var tci=0; tci<5; tci++) {
        var tca = tci * Math.PI*2/5 - Math.PI/2;
        ctx.beginPath();
        ctx.moveTo(0, -r*0.8);
        ctx.lineTo(Math.cos(tca)*r*0.32, Math.sin(tca)*r*0.2-r*0.82);
        ctx.lineTo(Math.cos(tca+0.6)*r*0.1, Math.sin(tca+0.6)*r*0.1-r*0.82);
        ctx.closePath(); ctx.fill();
      }
      break;

    case 'egg_shell': // Cracked eggshell halves
      // Bottom half shell
      ctx.fillStyle = dim('#ede8d8');
      ctx.beginPath();
      ctx.moveTo(-r*0.75, r*0.1);
      ctx.bezierCurveTo(-r*0.8, r*0.8, r*0.8, r*0.8, r*0.75, r*0.1);
      ctx.closePath(); ctx.fill();
      // Inner yolk residue
      ctx.fillStyle = dim('#d4a820');
      ctx.beginPath(); ctx.ellipse(0, r*0.5, r*0.3, r*0.2, 0, 0, Math.PI*2); ctx.fill();
      // Top broken half, tilted
      ctx.save(); ctx.rotate(-0.35);
      ctx.fillStyle = dim('#f0ead8');
      ctx.beginPath();
      ctx.moveTo(-r*0.6, -r*0.8);
      ctx.bezierCurveTo(-r*0.72, -r*0.1, r*0.72, -r*0.1, r*0.6, -r*0.8);
      ctx.closePath(); ctx.fill();
      // Jagged crack edge on top half
      ctx.strokeStyle = dim('#c8c0a8'); ctx.lineWidth = r*0.05;
      ctx.beginPath();
      ctx.moveTo(-r*0.6, -r*0.8);
      ctx.lineTo(-r*0.3, -r*0.65); ctx.lineTo(-r*0.1, -r*0.78);
      ctx.lineTo(r*0.15, -r*0.6); ctx.lineTo(r*0.35, -r*0.72); ctx.lineTo(r*0.6, -r*0.8);
      ctx.stroke();
      ctx.restore();
      break;

    case 'newspaper': // Crumpled newspaper sheet
      ctx.fillStyle = dim('#d8d4b8');
      ctx.beginPath();
      ctx.moveTo(-r*0.9, -r*0.7);
      ctx.lineTo(-r*0.5, -r*0.95);
      ctx.lineTo(r*0.3, -r*0.88);
      ctx.lineTo(r*0.95, -r*0.55);
      ctx.lineTo(r*0.85, r*0.4);
      ctx.lineTo(r*0.4, r*0.92);
      ctx.lineTo(-r*0.4, r*0.88);
      ctx.lineTo(-r*0.92, r*0.5);
      ctx.closePath(); ctx.fill();
      // Text lines — fixed offsets, no random
      ctx.strokeStyle = dim('#888070'); ctx.lineWidth = r*0.04;
      var lineOffsets = [0.05, -0.03, 0.04, -0.05, 0.02, -0.04, 0.03];
      for (var li3 = -3; li3 <= 3; li3++) {
        var lo = lineOffsets[li3+3];
        ctx.beginPath();
        ctx.moveTo(-r*0.7, li3*r*0.22);
        ctx.lineTo(r*0.68 + lo*r, li3*r*0.22 + lo*r*0.4);
        ctx.stroke();
      }
      // Headline block
      ctx.fillStyle = dim('#555048');
      ctx.fillRect(-r*0.65, -r*0.62, r*1.3, r*0.18);
      // Crease fold line
      ctx.strokeStyle = dim('#a8a490'); ctx.lineWidth = r*0.06;
      ctx.beginPath(); ctx.moveTo(-r*0.8, -r*0.2); ctx.lineTo(r*0.8, r*0.1); ctx.stroke();
      break;

    case 'tea_bag': // Tea bag with string
      // Bag body
      ctx.fillStyle = dim('#c8a060');
      ctx.beginPath();
      ctx.roundRect(-r*0.55, r*0.0, r*1.1, r*0.85, r*0.12);
      ctx.fill();
      // Wet tea stain darker centre
      ctx.fillStyle = dim('#7a4820');
      ctx.beginPath(); ctx.ellipse(0, r*0.45, r*0.32, r*0.25, 0, 0, Math.PI*2); ctx.fill();
      // Tag top
      ctx.fillStyle = dim('#e8e0c8');
      ctx.beginPath(); ctx.roundRect(-r*0.22, -r*0.88, r*0.44, r*0.28, r*0.06); ctx.fill();
      // String
      ctx.strokeStyle = dim('#a08060'); ctx.lineWidth = r*0.05; ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(0, -r*0.6); ctx.quadraticCurveTo(r*0.3, -r*0.35, r*0.05, r*0.0);
      ctx.stroke();
      // Staple
      ctx.strokeStyle = dim('#888'); ctx.lineWidth = r*0.07;
      ctx.beginPath(); ctx.moveTo(-r*0.1, -r*0.6); ctx.lineTo(r*0.1, -r*0.6); ctx.stroke();
      break;

    case 'orange_peel': // Orange peel strips curled
      ctx.fillStyle = dim('#d86818');
      ctx.beginPath();
      ctx.moveTo(-r*0.85, -r*0.3);
      ctx.bezierCurveTo(-r*0.7, -r*1.0, r*0.4, -r*0.9, r*0.85, -r*0.2);
      ctx.bezierCurveTo(r*0.7, r*0.5, -r*0.2, r*0.8, -r*0.55, r*0.7);
      ctx.bezierCurveTo(-r*0.9, r*0.55, -r*1.0, r*0.2, -r*0.85, -r*0.3);
      ctx.fill();
      ctx.fillStyle = dim('#f0e8d0');
      ctx.beginPath();
      ctx.moveTo(-r*0.7, -r*0.2);
      ctx.bezierCurveTo(-r*0.55, -r*0.78, r*0.28, -r*0.7, r*0.65, -r*0.12);
      ctx.bezierCurveTo(r*0.5, r*0.38, -r*0.12, r*0.62, -r*0.38, r*0.55);
      ctx.bezierCurveTo(-r*0.7, r*0.4, -r*0.8, r*0.1, -r*0.7, -r*0.2);
      ctx.fill();
      ctx.fillStyle = dim('#c05010');
      for (var di3 = 0; di3 < 8; di3++) {
        var da = di3 * 0.78 + 0.3;
        ctx.beginPath(); ctx.arc(Math.cos(da)*r*0.4, Math.sin(da)*r*0.28, r*0.04, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = dim('#e07820');
      ctx.beginPath();
      ctx.moveTo(r*0.2, r*0.55);
      ctx.bezierCurveTo(r*0.7, r*0.3, r*0.85, r*0.8, r*0.4, r*0.95);
      ctx.bezierCurveTo(r*0.1, r*1.0, -r*0.1, r*0.75, r*0.2, r*0.55);
      ctx.fill();
      break;

    case 'bread_crust': // Crusty bread heel
      ctx.fillStyle = dim('#c89038');
      ctx.beginPath();
      ctx.moveTo(-r*0.9, r*0.5);
      ctx.bezierCurveTo(-r*0.95, -r*0.2, -r*0.5, -r*0.9, r*0.1, -r*0.85);
      ctx.bezierCurveTo(r*0.7, -r*0.8, r*0.95, -r*0.1, r*0.88, r*0.5);
      ctx.closePath(); ctx.fill();
      // Inner soft crumb
      ctx.fillStyle = dim('#f0d880');
      ctx.beginPath();
      ctx.moveTo(-r*0.65, r*0.38);
      ctx.bezierCurveTo(-r*0.7, -r*0.1, -r*0.32, -r*0.65, r*0.08, -r*0.6);
      ctx.bezierCurveTo(r*0.5, -r*0.55, r*0.68, -r*0.05, r*0.62, r*0.38);
      ctx.closePath(); ctx.fill();
      // Air bubble holes — fixed positions
      ctx.fillStyle = dim('#c89038');
      var bhX = [-r*0.38, -r*0.12, r*0.15, r*0.4];
      var bhY = [-r*0.12, r*0.08, -r*0.18, r*0.05];
      var bhA = [0.3, 0.9, 0.5, 1.2];
      for (var bhi = 0; bhi < 4; bhi++) {
        ctx.beginPath();
        ctx.ellipse(bhX[bhi], bhY[bhi], r*0.07, r*0.05, bhA[bhi], 0, Math.PI*2);
        ctx.fill();
      }
      break;

    case 'lettuce': // Wilted lettuce leaf
      ctx.fillStyle = dim('#70b838');
      ctx.beginPath();
      ctx.moveTo(0, -r*0.95);
      ctx.bezierCurveTo(r*0.8, -r*0.7, r*1.0, r*0.2, r*0.6, r*0.9);
      ctx.bezierCurveTo(r*0.2, r*1.05, -r*0.4, r*0.85, -r*0.65, r*0.5);
      ctx.bezierCurveTo(-r*1.0, -r*0.1, -r*0.75, -r*0.72, 0, -r*0.95);
      ctx.fill();
      // Leaf veins — fixed endpoint offsets
      ctx.strokeStyle = dim('#48880e'); ctx.lineWidth = r*0.05; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0, -r*0.8); ctx.lineTo(r*0.05, r*0.7); ctx.stroke();
      var veinEndX = [r*0.12, r*0.52, r*0.48, -r*0.28];
      var veinEndY = [-r*0.2, -r*0.04, r*0.24, r*0.48];
      for (var vi = 0; vi < 4; vi++) {
        var va = -0.6 + vi*0.4;
        ctx.beginPath();
        ctx.moveTo(va*r*0.1, -r*0.5 + vi*r*0.28);
        ctx.lineTo(veinEndX[vi], veinEndY[vi]);
        ctx.stroke();
      }
      // Wilting brown edges
      if (hpFrac < 0.6) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = dim('#906020');
        ctx.beginPath(); ctx.ellipse(r*0.55, r*0.65, r*0.22, r*0.14, 0.8, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
      break;

    case 'potato': // Muddy potato
      ctx.fillStyle = dim('#b09050');
      ctx.beginPath();
      ctx.moveTo(-r*0.2, -r*0.95);
      ctx.bezierCurveTo(r*0.5, -r*0.88, r*0.92, -r*0.3, r*0.88, r*0.3);
      ctx.bezierCurveTo(r*0.82, r*0.88, r*0.1, r*1.0, -r*0.45, r*0.85);
      ctx.bezierCurveTo(-r*0.95, r*0.65, -r*0.92, -r*0.1, -r*0.7, -r*0.6);
      ctx.bezierCurveTo(-r*0.55, -r*0.9, -r*0.2, -r*0.95, -r*0.2, -r*0.95);
      ctx.fill();
      // Mud patches
      ctx.fillStyle = dim('#7a5828');
      ctx.beginPath(); ctx.ellipse(-r*0.2, r*0.3, r*0.22, r*0.14, 0.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r*0.3, -r*0.3, r*0.15, r*0.1, -0.3, 0, Math.PI*2); ctx.fill();
      // Eyes (sprout bumps)
      ctx.fillStyle = dim('#d0b870');
      for (var eyi = 0; eyi < 3; eyi++) {
        var ea2 = eyi * 2.1 + 0.5;
        ctx.beginPath(); ctx.arc(Math.cos(ea2)*r*0.55, Math.sin(ea2)*r*0.55, r*0.07, 0, Math.PI*2); ctx.fill();
      }
      break;

    case 'pasta': // Clump of cooked pasta
      ctx.fillStyle = dim('#e8d078');
      // Several noodle strands tangled
      ctx.lineWidth = r*0.18; ctx.lineCap='round'; ctx.lineJoin='round';
      var pastaPaths = [
        [[-r*0.7,-r*0.5],[r*0.1,-r*0.8],[r*0.7,-r*0.2],[r*0.3,r*0.6]],
        [[-r*0.4,-r*0.2],[r*0.6,r*0.1],[-r*0.1,r*0.7],[-r*0.6,r*0.3]],
        [[r*0.2,-r*0.6],[-r*0.5,r*0.0],[r*0.4,r*0.5],[r*0.05,r*0.9]]
      ];
      for (var pi3 = 0; pi3 < pastaPaths.length; pi3++) {
        ctx.strokeStyle = dim(pi3===1?'#d4b858':'#f0de90');
        var pp = pastaPaths[pi3];
        ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]);
        for (var pj = 1; pj < pp.length; pj++) ctx.bezierCurveTo(pp[pj-1][0]+r*0.2, pp[pj-1][1], pp[pj][0]-r*0.2, pp[pj][1], pp[pj][0], pp[pj][1]);
        ctx.stroke();
      }
      break;

    case 'fish_bone': // Fish skeleton
      // Spine
      ctx.strokeStyle = dim('#d8cca8'); ctx.lineWidth = r*0.12; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-r*0.92, 0); ctx.lineTo(r*0.82, 0); ctx.stroke();
      // Tail fan
      ctx.fillStyle = dim('#d0c4a0');
      ctx.beginPath();
      ctx.moveTo(r*0.82, 0);
      ctx.lineTo(r*1.05, -r*0.38); ctx.lineTo(r*0.88, 0); ctx.lineTo(r*1.05, r*0.38);
      ctx.closePath(); ctx.fill();
      // Ribs
      ctx.lineWidth = r*0.07;
      for (var ri3 = 0; ri3 < 6; ri3++) {
        var rx = -r*0.6 + ri3*r*0.22;
        ctx.strokeStyle = dim('#c8bc98');
        ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx - r*0.08, -r*0.45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx - r*0.08, r*0.45); ctx.stroke();
      }
      // Head outline
      ctx.strokeStyle = dim('#d0c4a0'); ctx.lineWidth = r*0.1;
      ctx.beginPath(); ctx.arc(-r*0.82, 0, r*0.28, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = dim('#1a1808');
      ctx.beginPath(); ctx.arc(-r*0.88, -r*0.1, r*0.06, 0, Math.PI*2); ctx.fill();
      break;

    case 'broccoli': // Broccoli stalk and florets
      // Stalk
      ctx.fillStyle = dim('#607828');
      ctx.beginPath(); ctx.roundRect(-r*0.14, r*0.1, r*0.28, r*0.85, r*0.08); ctx.fill();
      // Cut stalk bottom
      ctx.fillStyle = dim('#90b840');
      ctx.beginPath(); ctx.ellipse(0, r*0.95, r*0.14, r*0.07, 0, 0, Math.PI*2); ctx.fill();
      // Floret clusters
      var floretPos = [[-r*0.38,-r*0.28],[r*0.38,-r*0.22],[0,-r*0.52],[-r*0.55,r*0.08],[r*0.52,r*0.1],[0,r*0.0]];
      for (var fi2 = 0; fi2 < floretPos.length; fi2++) {
        ctx.fillStyle = dim(fi2%2===0?'#3a8820':'#50a830');
        ctx.beginPath();
        ctx.arc(floretPos[fi2][0], floretPos[fi2][1], r*(0.22+fi2*0.03), 0, Math.PI*2);
        ctx.fill();
      }
      // Darker floret tips
      ctx.fillStyle = dim('#286010');
      for (var fi3 = 0; fi3 < floretPos.length; fi3++) {
        ctx.beginPath();
        ctx.arc(floretPos[fi3][0], floretPos[fi3][1]-r*0.06, r*0.1, 0, Math.PI*2);
        ctx.fill();
      }
      break;

  }
}
// ---- Debris fragment drawing ---- //
// Draws a small torn chunk of a specific trash type, centered at (0,0), radius ~r
// Called for both falling debris and settled tier-1 scraps
function drawDebrisFragment(ctx, name, r, col, col2) {
  switch(name) {
    case 'pizza':
      // Tiny wedge of crust with sauce smear
      ctx.fillStyle = col2; // sauce
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = col; // dough edge
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(r*1.1, -r*0.5); ctx.lineTo(r*0.8, r*0.7); ctx.closePath();
      ctx.fill();
      break;
    case 'banana_peel':
      // Thin curved strip
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.55; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r*0.9, r*0.3);
      ctx.quadraticCurveTo(0, -r*0.8, r*0.9, r*0.2);
      ctx.stroke();
      break;
    case 'apple_core':
      // Pale flesh chunk with red skin edge
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r*0.7, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = r*0.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r*0.6, -r*0.5); ctx.lineTo(r*0.5, r*0.4); ctx.stroke();
      break;
    case 'melon_rind':
      // Curved rind strip — green outside, pale inside
      ctx.strokeStyle = col; ctx.lineWidth = r*0.7; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-r*0.85, r*0.1); ctx.quadraticCurveTo(0, -r*0.7, r*0.85, r*0.1); ctx.stroke();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.28;
      ctx.beginPath(); ctx.moveTo(-r*0.65, r*0.08); ctx.quadraticCurveTo(0, -r*0.48, r*0.65, r*0.08); ctx.stroke();
      break;
    case 'corn_cob':
      // Tiny kernel cluster
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.9, r*0.65, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = col;
      for (var dcci=0; dcci<4; dcci++) {
        ctx.beginPath(); ctx.ellipse((dcci-1.5)*r*0.35, 0, r*0.14, r*0.18, 0, 0, Math.PI*2); ctx.fill();
      }
      break;
    case 'watermelon_chunk':
      // Tiny red flesh chunk with green rind edge
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.35;
      ctx.beginPath(); ctx.moveTo(-r*0.9, r*0.5); ctx.lineTo(r*0.9, r*0.5); ctx.stroke();
      break;
    case 'avocado_pit':
      // Hard brown chunk
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.9, r*0.8, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(r*0.1, -r*0.05, r*0.38, r*0.25, 0.5, 0, Math.PI*2); ctx.fill();
      break;
    case 'cardboard_tube':
      // Curved cardboard strip
      ctx.strokeStyle = col; ctx.lineWidth = r*0.55; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-r*0.8, -r*0.3); ctx.quadraticCurveTo(0, r*0.6, r*0.8, -r*0.2); ctx.stroke();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.2;
      ctx.beginPath(); ctx.moveTo(-r*0.6, -r*0.2); ctx.quadraticCurveTo(0, r*0.4, r*0.6, -r*0.12); ctx.stroke();
      break;
    case 'mushroom':
      // Tiny cap fragment
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-r*0.9, r*0.2); ctx.bezierCurveTo(-r*0.7, -r*0.7, r*0.7, -r*0.7, r*0.9, r*0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(0, r*0.15, r*0.55, r*0.18, 0, 0, Math.PI*2); ctx.fill();
      break;
    case 'overripe_fruit':
      // Squashed purple blob with juice
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.9, r*0.7, 0.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(r*0.15, r*0.1, r*0.45, r*0.3, 0.3, 0, Math.PI*2); ctx.fill();
      break;
    case 'walnut_shell':
      // Curved shell shard with ridge
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-r*0.8, r*0.3); ctx.bezierCurveTo(-r*0.7, -r*0.6, r*0.7, -r*0.5, r*0.8, r*0.25); ctx.bezierCurveTo(r*0.5, r*0.6, -r*0.5, r*0.6, -r*0.8, r*0.3); ctx.fill();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.1;
      ctx.beginPath(); ctx.moveTo(-r*0.2, -r*0.35); ctx.bezierCurveTo(0, r*0.0, r*0.1, r*0.2, r*0.0, r*0.45); ctx.stroke();
      break;
    case 'dried_leaves':
      // Crumpled leaf scrap
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0,-r*0.9); ctx.bezierCurveTo(r*0.8,-r*0.4,r*0.7,r*0.5,r*0.1,r*0.9); ctx.bezierCurveTo(-r*0.6,r*0.7,-r*0.8,-r*0.1,0,-r*0.9); ctx.fill();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.06;
      ctx.beginPath(); ctx.moveTo(0,-r*0.7); ctx.lineTo(r*0.05,r*0.6); ctx.stroke();
      break;
    case 'straw_clump':
      // Single straw strand
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.35; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-r*0.1,-r*0.95); ctx.bezierCurveTo(r*0.2,-r*0.3,-r*0.15,r*0.3,r*0.05,r*0.92); ctx.stroke();
      break;
    case 'grass_clippings':
      // Two grass blade snippets
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.25; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-r*0.3,-r*0.8); ctx.lineTo(-r*0.35,r*0.8); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = r*0.2;
      ctx.beginPath(); ctx.moveTo(r*0.2,-r*0.7); ctx.lineTo(r*0.25,r*0.75); ctx.stroke();
      break;
    case 'dead_flower':
      // Tiny petal with centre nub
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.85, r*0.55, 0.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, r*0.28, 0, Math.PI*2); ctx.fill();
      break;
    case 'root_bulb':
      // Earthy root chunk with tendril
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-r*0.6,-r*0.6); ctx.bezierCurveTo(r*0.5,-r*0.8,r*0.8,r*0.2,r*0.5,r*0.7); ctx.bezierCurveTo(-r*0.1,r*0.9,-r*0.8,r*0.3,-r*0.6,-r*0.6); ctx.fill();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.1; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(r*0.4,r*0.6); ctx.bezierCurveTo(r*0.6,r*0.85,r*0.5,r*1.05,r*0.4,r*1.1); ctx.stroke();
      break;
    case 'whole_tomato':
      // Squashed red blob with skin
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r*0.75, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.12;
      ctx.beginPath(); ctx.moveTo(-r*0.5,-r*0.3); ctx.bezierCurveTo(0,r*0.1,r*0.2,r*0.2,r*0.55,-r*0.1); ctx.stroke();
      break;
    case 'egg_shell':
      // Curved shell shard
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r*0.8, r*0.2);
      ctx.quadraticCurveTo(0, -r*0.9, r*0.8, r*0.1);
      ctx.stroke();
      break;
    case 'newspaper':
      // Torn paper scrap with faint text lines
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.moveTo(-r*0.9, -r*0.5); ctx.lineTo(r*0.5, -r*0.8);
      ctx.lineTo(r*0.8, r*0.4); ctx.lineTo(-r*0.4, r*0.7); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = r*0.08;
      ctx.beginPath(); ctx.moveTo(-r*0.6, -r*0.1); ctx.lineTo(r*0.5, -r*0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r*0.5, r*0.2); ctx.lineTo(r*0.4, r*0.2); ctx.stroke();
      break;
    case 'tea_bag':
      // Small soggy square scrap
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(-r*0.7, -r*0.6, r*1.4, r*1.2, r*0.2); ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(0, 0, r*0.4, r*0.3, 0, 0, Math.PI*2); ctx.fill();
      break;
    case 'orange_peel':
      // Curved rind strip, orange outside white inside
      ctx.strokeStyle = col; ctx.lineWidth = r*0.65; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r*0.8, -r*0.2);
      ctx.quadraticCurveTo(r*0.1, -r*0.9, r*0.8, r*0.3);
      ctx.stroke();
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.25;
      ctx.beginPath();
      ctx.moveTo(-r*0.65, -r*0.15);
      ctx.quadraticCurveTo(r*0.1, -r*0.7, r*0.65, r*0.25);
      ctx.stroke();
      break;
    case 'bread_crust':
      // Chunky doughy lump
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-r*0.7, r*0.4); ctx.bezierCurveTo(-r*0.9, -r*0.2, r*0.1, -r*0.9, r*0.8, -r*0.3);
      ctx.bezierCurveTo(r*0.9, r*0.3, r*0.2, r*0.8, -r*0.7, r*0.4);
      ctx.fill();
      ctx.fillStyle = col2; // crumb interior showing
      ctx.beginPath(); ctx.ellipse(r*0.1, 0, r*0.35, r*0.25, 0.4, 0, Math.PI*2); ctx.fill();
      break;
    case 'lettuce':
      // Ragged leaf fragment
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.moveTo(0, -r*0.9); ctx.bezierCurveTo(r*0.8, -r*0.5, r*0.9, r*0.4, r*0.3, r*0.9);
      ctx.bezierCurveTo(-r*0.4, r*0.8, -r*0.9, r*0.1, 0, -r*0.9);
      ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = r*0.08;
      ctx.beginPath(); ctx.moveTo(0, -r*0.7); ctx.lineTo(r*0.05, r*0.6); ctx.stroke();
      break;
    case 'potato':
      // Earthy starchy lump
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-r*0.6, -r*0.7); ctx.bezierCurveTo(r*0.5, -r*0.9, r*0.9, r*0.1, r*0.6, r*0.7);
      ctx.bezierCurveTo(-r*0.1, r*0.95, -r*0.9, r*0.4, -r*0.6, -r*0.7);
      ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.ellipse(r*0.1, r*0.1, r*0.3, r*0.2, 0.3, 0, Math.PI*2); ctx.fill();
      break;
    case 'pasta':
      // Single noodle strand coil
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.45; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r*0.9, r*0.3);
      ctx.bezierCurveTo(-r*0.2, -r*1.0, r*0.5, r*0.8, r*0.9, -r*0.2);
      ctx.stroke();
      break;
    case 'fish_bone':
      // Mini rib section
      ctx.strokeStyle = col2; ctx.lineWidth = r*0.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r*0.9, 0); ctx.lineTo(r*0.9, 0); ctx.stroke();
      ctx.lineWidth = r*0.1;
      ctx.beginPath(); ctx.moveTo(-r*0.4, 0); ctx.lineTo(-r*0.55, -r*0.65); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r*0.1, 0); ctx.lineTo(r*0.0, -r*0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r*0.55, 0); ctx.lineTo(r*0.45, -r*0.55); ctx.stroke();
      break;
    case 'broccoli':
      // Tiny floret with stub
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.arc(0, -r*0.2, r*0.65, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(-r*0.18, r*0.3, r*0.36, r*0.55, r*0.08); ctx.fill();
      ctx.fillStyle = '#286010';
      ctx.beginPath(); ctx.arc(0, -r*0.35, r*0.22, 0, Math.PI*2); ctx.fill();
      break;
    default:
      // Generic organic blob
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r*0.65, 0, 0, Math.PI*2); ctx.fill();
      break;
  }
}

function getLowestScrapY() {
  if (trashChunks.length === 0) return H + 50;
  var minY = H + 50; // pile base is now at H+50
  for (var i = 0; i < trashChunks.length; i++) {
    var tc = trashChunks[i];
    if (tc.gone || tc.locked) continue;
    var chunkTop = tc.y - tc.sz * 0.9;
    if (chunkTop < minY) minY = chunkTop;
  }
  return minY;
}


function spawnScraps() {
  var b = getBin();
  scraps = [];
  trashChunks = [];
  debris = [];
  bugs = [];

  // --- Tier 0 bugs: fruit flies / gnats drifting in the empty bin airspace ---
  // Each bug has a Lissajous-style figure-8 orbit around a roaming anchor point
  var b0 = getBin();
  for (var bi = 0; bi < 22 && bugs.length < 40; bi++) {
    var bx = (b0.cx - b0.bw2 * 0.75) + Math.random() * b0.bw * 0.85;
    var by = H * 0.12 + Math.random() * H * 0.72; // upper ~80% of tier 0
    bugs.push({
      ax: bx, ay: by,          // anchor (drifts slowly)
      phase: Math.random() * Math.PI * 2,
      phase2: Math.random() * Math.PI * 2,
      speed: 0.028 + Math.random() * 0.025,
      rx: 14 + Math.random() * 22,   // orbit radius x
      ry: 8  + Math.random() * 14,   // orbit radius y
      px: bx, py: by,               // actual position (for trail)
      vax: (Math.random()-0.5)*0.18, // anchor drift velocity
      vay: (Math.random()-0.5)*0.10,
      sz: 1 + Math.random() * 0.8,
      alpha: 0.55 + Math.random() * 0.35,
      wing: 0,  // wing flap angle
      type: Math.random() < 0.3 ? 'midge' : 'gnat' // tiny visual variants
    });
  }

  // --- Tier 0: 6 layers — 3 Z-depth positions × 2 reserves each ---
  // Depth 0 (front):  layer 0 active first, layer 3 reserve
  // Depth 1 (mid):    layer 1 active, layer 4 reserve
  // Depth 2 (back):   layer 2 active, layer 5 reserve
  // Unlock chain: 3 after 0, then 1 after 0+3, then 4 after 1, then 2 after 1+4, then 5 after 2
  var margin = 14;
  var xMin = b.cx - b.bw2 + margin;
  var xMax = b.cx + b.bw2 - margin;
  var baseY = H * 0.97 + 50;
  var NUM_LAYERS = 6;
  // Scale chunk density by server-reported scraps level (0–1).
  // On a fresh bin _hostScrapsLevel is undefined → defaults to 1.0 (full).
  // When Devvit sends setWorldState, this ensures new players join a bin that
  // visually matches how depleted the shared food supply already is.
  var _scrapsScale = (window._hostScrapsLevel != null)
    ? Math.max(0.05, Math.min(1, window._hostScrapsLevel))
    : 1.0;
  var targetPerLayer = Math.max(1, Math.floor((b.bw - margin*2) / 38 * _scrapsScale));
  var pool = TRASH_TYPES.slice().sort(function() { return Math.random() - 0.5; });

  // Guarantee acidic foods appear — seed one of each into the front of layer 0's pool
  var acidTypes = TRASH_TYPES.filter(function(t) { return t.acid; });
  for (var ai = acidTypes.length - 1; ai >= 0; ai--) {
    pool.unshift(acidTypes[ai]);
  }


  // depth controls visual Z (draw order), zScale per depth
  var layerDepth  = [0, 1, 2, 0, 1, 2];
  var layerZScale = [1.0, 0.88, 0.76, 1.0, 0.88, 0.76];
  // Active layers (0,1,2) sit at the bottom of tier 0.
  // Reserve layers (3,4,5) sit one pile-height above so they visually stack on top.
  var pileHeight = H * 0.07; // roughly one layer's worth of vertical space
  var layerBaseY = [
    H * 0.97 + 50,              // layer 0: active front
    H * 0.97 + 50,              // layer 1: active mid
    H * 0.97 + 50,              // layer 2: active back
    H * 0.97 + 50 - pileHeight, // layer 3: reserve front
    H * 0.97 + 50 - pileHeight, // layer 4: reserve mid
    H * 0.97 + 50 - pileHeight  // layer 5: reserve back
  ];

  for (var layer = 0; layer < NUM_LAYERS; layer++) {
    var zScale   = layerZScale[layer];
    var placed   = [];
    var attempts = 0;
    var maxAttempts = targetPerLayer * 40;
    var pi4 = 0;

    while (placed.length < targetPerLayer && attempts < maxAttempts) {
      attempts++;
      var t = pool[(pi4++) % pool.length];
      var szScale = (0.65 + Math.random() * 0.45) * zScale;
      var sz = t.sz * szScale;

      var cx = xMin + Math.random() * (xMax - xMin);
      var cy = layerBaseY[layer] - sz * (0.1 + Math.random() * 0.35);

      var tooClose = false;
      for (var pi5 = 0; pi5 < placed.length; pi5++) {
        var p2 = placed[pi5];
        var dx2 = cx - p2.x, dy2 = cy - p2.y;
        var minDist = sz * 0.7 + p2.sz * 0.7;
        if (dx2*dx2 + dy2*dy2 < minDist*minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;

      var chunk = {
        x: cx, y: cy,
        t: t,
        hp: t.hp, maxHp: t.hp,
        hpFrac: 1.0,
        sz: sz,
        baseSz: sz / zScale,
        zScale: zScale,
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.002,
        being_eaten: false,
        gone: false,
        nibbleCooldown: 0,
        layer: layer,
        depth: layerDepth[layer],
        locked: layer !== 0,  // only layer 0 starts active
        nextWeatherFrame: frame + Math.floor(Math.random() * 1800), // staggered first shed
        // Drop animation — starts from bucket mouth position
        dropY: cy,
        dropX: cx,
        dropVy: 0,
        dropVx: 0,
        dropping: false
      };
      placed.push(chunk);
      trashChunks.push(chunk);
      // PERF-1: pre-render to offscreen canvas now; dropping chunks wait until settled
      if (!chunk.dropping) _prerenderTrashChunk(chunk);
    }
  }

  // --- Tier 1: small decomposed debris scraps that worms eat directly ---
  var tier1Count = Math.floor((b.bw / 22) * 0.22 * (H / 22));
  for (var ti1 = 0; ti1 < tier1Count; ti1++) {
    var tIdx = Math.floor(Math.random() * TRASH_TYPES.length);
    var t1 = TRASH_TYPES[tIdx];
    var hp1 = 3 + Math.random() * 4;
    var x1 = (b.cx - b.bw2 + 14) + Math.random() * (b.bw - 28);
    var y1 = H + 12 + Math.random() * (H - 24);
    scrapsPush({
      x: x1, y: y1,
      t: t1, hp: hp1, maxHp: hp1,
      sz: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      rotSpd: (Math.random() - 0.5) * 0.006,
      ti: 1, eaten: false, eating: false,
      col: t1.debrisCol, col2: t1.debrisCol2
    });
  }

  // Guarantee eggshell scraps in upper tier 1 — small worms need them to neutralise acid
  var eggShellType = TRASH_TYPES.filter(function(t) { return t.name === 'egg_shell'; })[0];
  if (eggShellType) {
    var eggCount = 4 + Math.floor(Math.random() * 4); // 4-7 eggshell pieces always present
    for (var ei = 0; ei < eggCount; ei++) {
      var ex = (b.cx - b.bw2 + 14) + Math.random() * (b.bw - 28);
      var ey = H + 12 + Math.random() * (H * 0.4); // upper tier 1 where tiny worms roam
      scrapsPush({
        x: ex, y: ey,
        t: eggShellType, hp: 3 + Math.random() * 3, maxHp: 6,
        sz: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.004,
        ti: 1, eaten: false, eating: false,
        col: eggShellType.debrisCol, col2: eggShellType.debrisCol2
      });
    }
  }

  updateScrapsLevel();
}

// ── Tutorial staged scene ────────────────────────────────────────────────────
// Commit 2: replaces the random scrap field with a deterministic authored layout
// so the guided steps always have the same targets in the same places. Builds a
// few tier-1 FOOD scraps (non-acid — eat / fill-the-gut steps) plus ONE acid item
// in the tier-0 pile (the "climb up and learn acid" step). Refs are stashed on
// `tutorial` for the highlight + step-gating commits. NPCs are untouched.
// Positions are intentionally simple and meant to be tuned.
function spawnTutorialScene() {
  var b = getBin();
  if (tutorial.live) { spawnScraps(); }                              // merge mode: build the REAL field, inject curriculum on top
  else { scraps = []; trashChunks = []; debris = []; bugs = []; }    // staged mode: strip the field down to the lesson
  tutorial.foodScraps = [];
  tutorial.acidChunk  = null;
  tutorial._compostPooped = false;
  tutorial._reliefPooped  = false;
  tutorial._refuelAte     = false;
  tutorial._downDrainDone = false;
  tutorial._upDrainArmed  = false;
  tutorial._cocoonDone    = false;
  tutorial._viewStartY    = null;
  tutorial._freeStart     = 0;

  var _xL = b.cx - b.bw2 + 28, _xR = b.cx + b.bw2 - 28;
  var _span = _xR - _xL;

  // Tier-1 food helper — a small fragment of a given type, reserved for the player.
  function _tutFood(typeName, x, y) {
    var t = TRASH_TYPES.filter(function (z) { return z.name === typeName; })[0] || TRASH_TYPES[0];
    var sc = {
      x: x, y: y, t: t, hp: 5, maxHp: 5,
      sz: 9, rot: 0, rotSpd: 0,
      ti: 1, eaten: false, eating: false,
      tutProtected: true,   // NPCs skip it; only the active target is player-eatable
      col: t.debrisCol, col2: t.debrisCol2
    };
    scrapsPush(sc);
    tutorial.foodScraps.push(sc);
    return sc;
  }

  // Curated curriculum, placed to make a sensible path:
  //   lettuce (left) → watermelon (mid) → acid pile chunk (centre top) → eggshell (centre low)
  var _starter = _tutFood('lettuce',          _xL + _span * 0.42, H + H * 0.47);  // close first bite — worm spawns mid-bin, lettuce was too far (HP bleed)
  var _lettuce = _tutFood('lettuce',          _xL + _span * 0.22, H + H * 0.55);
  var _melon   = _tutFood('watermelon_chunk', _xL + _span * 0.55, H + H * 0.50);
  var _egg1    = _tutFood('egg_shell',        _xL + _span * 0.563, H + H * 0.459);  // cure beat: 2 eggshells clear the higher acid
  var _egg2    = _tutFood('egg_shell',        _xL + _span * 0.66,  H + H * 0.500);

  // Acid item in the tier-0 pile — climb up, nibble, pAcid rises, worm tints green.
  var _ac = null;
  var _acidT = TRASH_TYPES.filter(function (t) { return t.name === 'overripe_fruit'; })[0];
  if (_acidT) {
    var _acz = 1.0;
    var _acsz = _acidT.sz * 0.8 * _acz;
    var _acx = b.cx;
    var _acy = (H * 0.97 + 50) - _acsz * 0.25;
    _ac = {
      x: _acx, y: _acy,
      t: _acidT, hp: _acidT.hp, maxHp: _acidT.hp, hpFrac: 1.0,
      sz: _acsz, baseSz: _acsz / _acz, zScale: _acz,
      rot: 0, rotSpd: 0,
      being_eaten: false, gone: false, nibbleCooldown: 0,
      layer: 0, depth: 0, locked: false,
      nextWeatherFrame: frame + 99999,
      dropY: _acy, dropX: _acx, dropVy: 0, dropVx: 0, dropping: false
    };
    trashChunks.push(_ac);
    _prerenderTrashChunk(_ac);
    tutorial.acidChunk = _ac;
  }

  // Compost beacon — a non-edible marker the poop beat aims the ring/arrow at, low
  // in the dark soil (tier 2) so the worm is guided down to where pooping pays off.
  // Compost poop beacon — a big ZONE ring centred in the compost band (tier 2). _zoneR makes
  // the ring nearly touch the tier-1/2 line above (2H) and the sump line below (3H): "get in
  // this layer and poop", not a precise point — so no aim-dot for this one.
  var _poopSpot = { x: b.cx, y: 2*H + 0.5*(cSurf()-2*H), sz: 16, eaten: false, gone: false, _tutBeacon: true, _zoneR: (cSurf()-2*H)*0.48, _zoneLine: true };

  // Two sump-floor beacons ON the sump border (y = 3H - 2). The worm head clamps at
  // 3H - pSR, so steering the point onto a beacon parks the head in the _atSump zone
  // (head.y >= 3H - pSR - 2) and the hold actually connects. Down drain and up drain
  // sit at SEPARATE x so the second beat reads as "now steer over to the new dot",
  // not an invisible re-hold in place. Both stay on the floor so _sumpHadDown persists
  // while the worm traverses between them.
  var _downSpot = { x: b.cx - _span * 0.16,   y: cSurf() - 2, sz: 15, eaten: false, gone: false, _tutBeacon: true };
  var _upSpot   = { x: b.cx - _span * 0.053, y: cSurf() - 2, sz: 15, eaten: false, gone: false, _tutBeacon: true };  // ~1/3 of the old down->up gap — short traverse keeps the worm low so _sumpHadDown holds
  // Cocoon sits MIDWAY between the down & up drain dots: the cocoon can be laid anywhere in
  // deep compost, so its dot belongs right on the traverse — not parked on the far up-drain
  // dot (which made it look like a long detour). down -> cocoon -> up now reads left-to-right.
  var _cocoonSpot = { x: b.cx - _span * 0.106, y: cSurf() - 2, sz: 15, eaten: false, gone: false, _tutBeacon: true };

  // Refuel scraps — two fresh tier-1 foods for the post-cure refuel beat. The worm only
  // needs to eat ONE to advance; the rest are extra digestion fuel. _refuelTut opens them all.
  var _refuel  = _tutFood('watermelon_chunk', _xL + _span * 0.34, H + H * 0.42); _refuel._refuelTut  = true;
  var _refuel2 = _tutFood('lettuce',          _xL + _span * 0.46, H + H * 0.40); _refuel2._refuelTut = true;

  // Surface refuel scrap — fresh tier-1 food sitting JUST ABOVE the compost line (~1.8H),
  // for the "starving, climb up and eat" beat. The worm rises straight out of the sump after
  // the up-drain beat, so keeping the crust low means it can refuel before its gut bottoms out.
  // tutProtected + non-target until then, so the eat-gate keeps it locked early.
  var _surface = _tutFood('bread_crust', _xL + _span * 0.38, H + H * 0.62);  // nudged up off the 2H breakdown line (worm climbs up from the drain to eat it)

  // Sleep zone — the SAME big compost ZONE ring as the poop beat, just a different spot:
  // "get down into the compost and sleep". Sleeping only succeeds in tier 2+, so being
  // asleep IS the completion; the ring is pure guidance (no aim-dot, like the poop zone).
  var _sleepSpot = { x: b.cx + _span * 0.14, y: 2*H + 0.5*(cSurf()-2*H), sz: 16, eaten: false, gone: false, _tutBeacon: true, _zoneR: (cSurf()-2*H)*0.48 };

  // Ordered step list — each beat teaches one distinct thing. Karma matches the
  // engine: tier-1 scraps pay a flat +3; a finished pile chunk pays pts*5.
  tutorial.steps = [
    { target: _starter, kind: 'eat',  panel: { title: 'First Bite',     lines: ['A scrap, right by you.', 'Eat it to get started.'],                                karma: '+3 karma',  tint: '#c0d4a8' } },
    { target: _lettuce, kind: 'eat',  panel: { title: 'Lettuce',        lines: ['Food fills your gut.', 'Eat it to grow.'],                                        karma: '+3 karma',  tint: '#c0d4a8' } },
    { target: _melon,   kind: 'eat',  panel: { title: 'Watermelon',     lines: ['Juicy scraps drip into the', 'worm tea you drain weekly.'],                        karma: '+3 karma',  tint: '#c0d4a8' } },
    { target: _ac,      kind: 'acidfull',   panel: { title: 'Overripe Fruit', lines: ['Worth more, but acidic — and', 'it fills you up. Keep eating', 'until your gut is stuffed.'], karma: '+45 karma', tint: '#e89060' } },
    { target: null,     kind: 'pooprelief', panel: { title: 'Constipation',   lines: ['A full gut is constipation —', 'you bleed health till you poop.', 'Two-finger tap (or Space).'], karma: 'clears the gut', tint: '#e8b89a' } },
    { target: _egg1,    kind: 'cure',   extras: [_egg2],                   panel: { title: 'Eggshell',       lines: ['The antidote: eggshell', 'neutralizes the acid. Eat', 'both until the green fades.'], karma: '+3 each',  tint: '#a8dc80' } },
    { target: _refuel,  kind: 'refuel', extras: [_refuel2], panel: { title: 'Refuel',         lines: ['That hurt you. Eat to fill up —', 'health comes back as you digest.', 'Eat both scraps to move on.'], karma: '+3 karma', tint: '#c0d4a8' } },
    { target: _poopSpot, kind: 'poop',      panel: { title: 'Compost Bonus',  lines: ['Now dive into the dark', 'compost and poop down here —', 'bonus karma + rich soil.'],     karma: 'bonus karma', tint: '#cda36a' } },
    { target: _downSpot, kind: 'downdrain', panel: { title: 'Down Drain',    lines: ['Put your point on the dot at', 'the sump floor and hold — tea', 'drains down and out.'],            karma: '+100 karma', tint: '#7fc8e0' } },
    { target: _cocoonSpot, kind: 'cocoon',  panel: { title: 'Cocoon',        lines: ['Laying a cocoon in the deep', 'compost is an extra life for', 'your worm. Swipe up (or E).'], karma: 'banks an extra life', tint: '#e6d2a0' } },
    { target: _upSpot,   kind: 'updrain',   panel: { title: 'Up Drain',      lines: ['Now hold on that dot to arm', 'an up drain — it pumps the tea', 'back up to harvest.'],             karma: '+100 karma', tint: '#7fc8e0' } },
    { target: _surface,  kind: 'eat',       panel: { title: 'Surface & Eat', lines: ['All that digging emptied', 'your gut. Climb up to the', 'surface and eat to refuel.'],        karma: '+3 karma',   tint: '#c0d4a8' } },
    { target: null,       kind: 'freeplay', panel: { title: 'Free Play',     lines: ['Nice work — you know the basics.', 'Take a bit to roam the bin on', 'your own: eat, dig, drain, poke.'], karma: 'explore freely',            tint: '#c0d4a8' } },
    { target: _sleepSpot, kind: 'sleep',    panel: { title: 'Bedtime',       lines: ['Dive into the dark compost', 'and sleep down here.', 'Press and hold (or S).'],                karma: 'worms rest in the compost', tint: '#a9c2e0' } },
    { target: null,       kind: 'viewscroll', panel: { title: 'Look Around',  lines: ['While you sleep, drag to', 'scroll around — roam the bin', 'and watch the others.'],           karma: 'viewer mode',               tint: '#a9c2e0' } }
  ];
  tutorial.stepIndex = 0;
  tutorial.panel = tutorial.steps[0].panel;

  // Staged mode freezes the food-supply bookkeeping so nothing refills/unlocks mid-tutorial.
  // Live mode leaves the real game's supply running.
  if (!tutorial.live) { scrapsLevel = 1.0; scrapsEmpty = false; }
}

function updateScrapsLevel() {
  // Tutorial freeze — staged scene never refills or unlocks reserve layers.
  if (tutorial.scene && !tutorial.live) { scrapsLevel = 1.0; scrapsEmpty = false; return; }
  // Count alive chunks per layer (0-5)
  var layerTotal = [0,0,0,0,0,0];
  var layerAlive = [0,0,0,0,0,0];
  for (var i = 0; i < trashChunks.length; i++) {
    var tc = trashChunks[i];
    var l = tc.layer || 0;
    if (l < 6) { layerTotal[l]++; if (!tc.gone) layerAlive[l]++; }
  }

  // Fraction remaining per layer
  function frac(l) { return layerTotal[l] > 0 ? layerAlive[l] / layerTotal[l] : 0; }

  // Unlock rules — threshold: lock while prev layer(s) still have >40% remaining
  // Layer 0: always active
  // Layer 3: unlocks when layer 0 is <40% remaining (reserve for front)
  // Layer 1: unlocks when layers 0+3 combined are <40% remaining (mid opens)
  // Layer 4: unlocks when layer 1 is <40% remaining
  // Layer 2: unlocks when layers 1+4 combined are <40% remaining (back opens)
  // Layer 5: unlocks when layer 2 is <40% remaining
  var combined03 = (layerTotal[0]+layerTotal[3]) > 0
    ? (layerAlive[0]+layerAlive[3]) / (layerTotal[0]+layerTotal[3]) : 0;
  var combined14 = (layerTotal[1]+layerTotal[4]) > 0
    ? (layerAlive[1]+layerAlive[4]) / (layerTotal[1]+layerTotal[4]) : 0;

  var shouldLock = [
    false,          // 0: always active
    combined03 > 0.40,  // 1: mid unlocks when front+reserve mostly eaten
    combined14 > 0.40,  // 2: back unlocks when mid+reserve mostly eaten
    frac(0) > 0.40,    // 3: front reserve unlocks when front mostly eaten
    frac(1) > 0.40,    // 4: mid reserve unlocks when mid mostly eaten
    frac(2) > 0.40     // 5: back reserve unlocks when back mostly eaten
  ];

  for (var i = 0; i < trashChunks.length; i++) {
    var tc = trashChunks[i];
    var l = tc.layer || 0;
    if (l >= 6) continue;
    var wasLocked = tc.locked;
    tc.locked = shouldLock[l];
    // First unlock — scale up to full size, fresh hp
    if (wasLocked && !tc.locked && tc.baseSz) {
      tc.sz = tc.baseSz * (0.65 + Math.random() * 0.45);
      tc.maxHp = tc.t.hp; tc.hp = tc.t.hp; tc.hpFrac = 1.0;
      // PERF-1: sz changed — must re-render at new size
      _prerenderTrashChunk(tc);
    }
  }

  var total = trashChunks.length;
  var alive = trashChunks.filter(function(tc) { return !tc.gone; }).length;
  scrapsLevel = total > 0 ? alive / total : 0;
  if (scrapsLevel <= 0 && total > 0 && !scrapsEmpty) {
    scrapsEmpty = true;
  }
}


function initPlayer(saved) {
  var b = getBin();
  pSegs = []; pHist = []; pSR = 4; pSEG = pSEG || 4;  // radius always 4
  pPath = []; pLastX = -999; pLastY = -999;
  var startX = (saved && saved.pX) ? saved.pX : b.cx;
  var startY = (saved && saved.pY) ? Math.max(H * 0.55, Math.min(H * 3.8, saved.pY)) : H * 1.4;
  for (var i = 0; i < 20; i++) pHist.push({x: startX, y: startY});
  for (var i = 0; i < Math.max(4, Math.min(8, pSEG)); i++) pSegs.push({x: startX - i * pSR * 2, y: startY});
  mX = startX; mY = startY; camY = startY - H/2; camX = (W >= WORLD_W) ? 0 : Math.max(0, startX - W/2); // snap camera to worm at spawn
}

// ── Session persistence ───────────────────────────────────────────────────



function formatOfflineTime(sec) {
  if (sec < 3600) return Math.round(sec/60) + 'm';
  if (sec < 86400) return Math.round(sec/3600) + 'h';
  return Math.round(sec/86400) + 'd';
}

// FEAT-2: Cross-device session continuity constants
var deviceConflictActive = false;  // true if another device is currently active





// W = viewport width (what the player sees).
// WORLD_W = full world/bin width — always iPad Pro 11" landscape width.
// On iPad: W ≈ WORLD_W, no horizontal scroll. On mobile: W < WORLD_W, camX pans.
var WORLD_W = 1194;

function resizeCanvas() {
  var vw = root.offsetWidth;
  var vh = root.offsetHeight;
  // Always update W/H and canvas size to match the viewport.
  // The old one-time guard (!W || !H) caused desktop/fullscreen to stay
  // stuck at the initial size, leaving a black bar and half-filled background.
  W = vw;
  H = vh;
  canvas.width  = W;
  canvas.height = H;
  // Canvas always fills the viewport exactly — no CSS scaling needed.
  canvas.style.width  = vw + 'px';
  canvas.style.height = vh + 'px';
  canvas.style.transform = '';
  canvas.style.left = '0px';
  canvas.style.top  = '0px';
  window._canvasScale   = 1;
  window._canvasOffsetX = 0;
  window._canvasOffsetY = 0;
  window._canvasScaleX  = 1;
  window._canvasScaleY  = 1;
  // Invalidate bin cache so geometry recalculates for new W
  _binCacheW = -1;
  // Invalidate soil gradient cache
  _soilGradMW = -1;
}

// PERF-3: Build offscreen blade fringe canvas — called once in setup(), O(bladeCount) not O(bladeCount × frames).
// Blades are drawn at y=0 (base); draw() stamps with ctx.drawImage(_bladeCanvas, -centreOffsetX + camX, horizScreenY).
// Canvas is WORLD_W wide × 20px tall (max blade height is 16px + some headroom).
function _buildBladeCanvas() {
  var bladeCount = Math.floor(WORLD_W / 4);
  var oc = document.createElement('canvas');
  oc.width  = WORLD_W;
  oc.height = 20; // tallest blade is 6 + 5*2 = 16px; 20px gives headroom
  var octx = oc.getContext('2d');
  for (var gi = 0; gi < bladeCount; gi++) {
    var gbx = gi * 4 + (gi % 3);
    var gbh = 6 + (gi % 6) * 2;
    octx.fillStyle = (gi%4===0) ? '#5aaa28' : (gi%4===1) ? '#4a9020' : (gi%4===2) ? '#68c030' : '#3a8018';
    octx.beginPath();
    octx.moveTo(gbx,     20); // base at bottom of offscreen canvas
    octx.lineTo(gbx + 3, 20);
    octx.lineTo(gbx + 1 + (gi%2===0?1:-1), 20 - gbh);
    octx.closePath();
    octx.fill();
  }
  _bladeCanvas = oc;
}

function setup() {
  resizeCanvas();
  pPath = []; drops = []; bugs = []; trashChunks = []; debris = []; weatherQueue = [];
  scraps = []; cocoons = []; drainBonusPopups = [];
  drainDownTimer = 0; drainUpTimer = 0; drainDownCooldown = 0;
  window._sumpHadDown = null; window._upDrainBonusFired = false;
  pGut = 0; pHP = 1.0; pPooping = false; pAcid = 0;
  deathScreen = false; deathFade = 0;
  scrapsLevel = 1.0; scrapsEmpty = false;

  // Pre-generate static flowers
  var flowerCols2 = [
    {p:'#e84070',c:'#f0e040'},{p:'#e07030',c:'#fff080'},{p:'#9040e0',c:'#f0e040'},
    {p:'#e04090',c:'#fff080'},{p:'#40a0e0',c:'#ffffff'},{p:'#e0d020',c:'#fff8a0'},
    {p:'#f06030',c:'#ffe060'},{p:'#80d040',c:'#ffff90'},{p:'#c040c0',c:'#ffe0ff'}
  ];
  gardenFlowers = [];
  for (var fli = 0; fli < 28; fli++) {
    var fc = flowerCols2[Math.floor(Math.random() * flowerCols2.length)];
    gardenFlowers.push({
      xf:    Math.random(),
      wy:    cSurf() + Math.random() * H * 0.8, // fixed world Y below horizon
      h:     10 + Math.random() * 14,
      petR:  2.5 + Math.random() * 2,
      nPet:  4 + Math.floor(Math.random() * 3),
      pCol:  fc.p,
      cCol:  fc.c,
      lean:  (Math.random() - 0.5) * 0.3
    });
  }
  // stay correct on resize. Y is fraction of a nominal ground height (2*H).
  var tuftCols2 = ['#4aaa28','#5ab830','#3a9020','#68c038','#2e7818','#80d040'];
  gardenTufts = [];
  for (var ti3 = 0; ti3 < 380; ti3++) {
    gardenTufts.push({
      xf:   Math.random(),
      wy:   cSurf() + Math.random() * H * 0.8, // fixed world Y below horizon
      h:    4 + Math.random() * 8,
      w:    2 + Math.random() * 3,
      lean: (Math.random() - 0.5) * 3,
      col:  tuftCols2[Math.floor(Math.random() * tuftCols2.length)],
      alpha: 0.55 + Math.random() * 0.4
    });
  }

  // PERF-3: Pre-render blade fringe to offscreen canvas once — replaces 1,788 per-frame canvas calls.
  // Blades are drawn at Y=0 (base of canvas); draw() stamps with offset = horizScreenY.
  _buildBladeCanvas();

  initPlayer(null);  // demo: ephemeral — fresh worm each load
  if (tutorial.scene) { spawnTutorialScene(); } else { spawnScraps(); }
}

function updateCocoons() {
  var now = Date.now();
  clitellumReady = karma >= COCOON_KARMA_REQ &&
                   (lastCocoonLaid === 0 || (now - lastCocoonLaid) >= COCOON_WEEK_MS) &&
                   cocoons.filter(function(c){ return c.owner === username; }).length < COCOON_MAX;
  for (var i = 0; i < cocoons.length; i++) {
    var c = cocoons[i];
    var _matureMs = (generation >= 4 && c.owner === username) ? 5 * 24 * 60 * 60 * 1000 : COCOON_MATURE_MS;
    c.matured = (now - c.laid) >= _matureMs;
    c.pulse = c.matured ? (Math.sin(frame * 0.06) * 0.5 + 0.5) : 0;
  }
}

function updatePlayer() {
  if (!pSegs.length) return;

  // Natural lifespan — worm dies gracefully at 300,000 eaten
  if (pEaten >= 300000 && !deathScreen) {
    deathCause = 'natural';
    pHP = 0;
  }

  // Tutorial safety: a teaching beat must never end in death. Hold a small HP floor while the
  // live tutorial is still working through its steps; normal mortality resumes once it ends.
  if (tutorial.live && tutorial.active && tutorial.steps && tutorial.stepIndex < tutorial.steps.length && pHP < 0.08) pHP = 0.08;
  // Death check — trigger death screen instead of instant respawn
  if (pHP <= 0 && !deathScreen) { // hunger now drives HP bleed; death is always HP-based
    deathScreen = true;
    deathFade = 0;
    return;
  }
  if (deathScreen) {
    // Freeze camera — clamp to valid world bounds so it can't drift or go NaN
    camY = Math.max(0, Math.min(cSurf() + H*0.25 - H + 120, camY));
    return;
  }

  // ── Sleeping — worm is locked in place ───────────────────────────────────
  if (pSleeping) {
    tutorialStep();   // keep advancing the tutorial while asleep — otherwise the final 'sleep' beat never completes and the done card never fires
    pSleepCurl = Math.min(1, pSleepCurl + 0.04);
    for (var si = 0; si < pSegs.length; si++) {
      var coilAngle = (si / pSegs.length) * Math.PI * 2 * 1.5 * pSleepCurl;
      var coilR = pSR * 1.2 * pSleepCurl * Math.min(1, si / 3);
      pSegs[si].x += (pSleepX + Math.cos(coilAngle) * coilR - pSegs[si].x) * 0.18;
      pSegs[si].y += (pSleepY + Math.sin(coilAngle) * coilR * 0.6 - pSegs[si].y) * 0.18;
    }
    // Fade path closed while sleeping — tunnel fills back in.
    // When a clogged point's tunnel finishes fading, give it a downward
    // velocity so it settles through compost like a poop drop — keeping
    // its clog art shape the whole way down.
    for (var pi2 = 0; pi2 < pPath.length; pi2++) {
      var _pp2 = pPath[pi2];
      if (!_pp2) continue;
      if (_pp2.alpha == null) _pp2.alpha = 1;
      var _prevAlpha = _pp2.alpha;
      _pp2.alpha = Math.max(0, _pp2.alpha - 0.003);
      if (_prevAlpha > 0 && _pp2.alpha === 0 && (_pp2.clog || 0) > 0) {
        // Tube faded — burst the clog back into poop drops
        var _clogStrength = _pp2.clog;
        var _numBurst = 1 + Math.floor(_clogStrength * 3); // 1–4 drops depending on clog density
        for (var _bi = 0; _bi < _numBurst; _bi++) {
          dropsPush({
            x:              _pp2.x + (Math.random() - 0.5) * (_pp2.r || pSR) * 2,
            y:              _pp2.y,
            vy:             0.4 + Math.random() * 0.5,
            sz:             (_pp2.r || pSR) * (0.5 + Math.random() * 0.5),
            active:         true,
            isPoop:         true,
            clogAmt:        0.08 + (_clogStrength / _numBurst) * 0.12,
            enteredCompost: inCompost(_pp2.y)
          });
        }
        _pp2.clog = 0; // clear so no double-burst next frame
      }
    }
    // HP regen in safe zone
    if (inCompost(pSleepY)) {
      var _regenRate = (1 + castingEnrichment * 3) / (12 * 60 * 60 * 60);
      if (generation >= 3) _regenRate *= 2; // Gen 3+ perk: sleep regen doubled
      pHP = Math.min(1.0, pHP + _regenRate);
    }
    // Spawn ZZZ particles occasionally
    if (frame % 90 === 0) {
      pZzz.push({ x: pSleepX + (Math.random()-0.5)*pSR*2, wy: pSleepY - pSR*2, vy: -0.5, alpha: 1, size: 8 + Math.random()*6, char: ['z','z','Z'][Math.floor(Math.random()*3)] });
    }
    // (ZZZ particles drift + fade once per frame in loop() — covers player AND NPC sleepers)
    // Camera still follows sleep spot — unless player has scrolled away in viewMode
    if (!viewMode) {
      var tc3 = pSleepY - H/2;
      camY += (Math.max(0, Math.min(cSurf() + H*0.25 - H + 120, tc3)) - camY) * 0.04;
      camY = Math.round(camY);
    }
    return;
  }
  var head = pSegs[0];

  // Dynamic ceiling — worms cannot go above the lowest (topmost) scrap in tier 0.
  // As the pile depletes from the bottom, the ceiling drops, exposing more bin.
  var lowestScrapY = getLowestScrapY();
  var wormCeiling = Math.max(4, lowestScrapY - pSR);

  tutorialStep();   // advance ordered target + leash before the worm reads its goal
  // ── Tutorial move-target clamp — the ONE place the worm reads its steering goal ─
  // Debug proof: lazily anchor a fixed radius leash around the worm the first
  // controlled frame, so ?leash=1 visibly bounds free movement.
  if (tutorial.debug && tutorial.active && !tutorial.leash) {
    tutorial.leash = { type: 'radius', x: head.x, y: head.y, r: 180 };
  }
  var _mt = tutorialClampTarget(mX, mY);
  var dx = _mt.x - head.x, dy = _mt.y - head.y;
  var d = Math.sqrt(dx*dx + dy*dy);

  // Speed — no gut penalty, just scrap resistance
  var spd = 0.40;  // Tier 1 open soil (base/max)
  var headTier = getTier(head.y);
  // Speed is slowest through the rubbish pile zone (H*0.7 to H*1.3)
  // then eases gradually deeper into clean soil and compost
  // Pile boundary — computed from live trash chunks so it shrinks as scraps are eaten
  var pileZoneTop = H * 0.7;
  var pileZoneBot = H * 0.7; // will be pushed down by chunk extents
  for (var pzi = 0; pzi < trashChunks.length; pzi++) {
    var pztc = trashChunks[pzi];
    if (!pztc.gone) {
      var pzBot = pztc.y + pztc.sz * pztc.hpFrac;
      if (pzBot > pileZoneBot) pileZoneBot = pzBot;
    }
  }
  pileZoneBot = Math.max(pileZoneBot, pileZoneTop + 10); // never collapse to nothing
  if (head.y >= pileZoneTop && head.y <= pileZoneBot) {
    // Tier 0 dense rubbish — slowest
    spd = 0.30;
  } else if (inCompost(head.y)) {
    // Tier 2 compost — 0.30 shallow → 0.22 deep when boring fresh soil
    var t = compostDepth(head.y);
    spd = 0.30 - t * 0.08;  // 0.30 → 0.22

    // Existing tunnel boost — scan only PREVIOUS segments (before the last null).
    // Current active segment is the tunnel being carved right now and never grants
    // a boost — you cannot surf your own fresh wake.
    // When inside a previous tunnel: boost scales with alpha (freshness).
    // _inExistingTunnel flag tells the carve step below to suppress addPoint().
    window._inExistingTunnel = false;
    var _activeSegStart = 0;
    for (var _asi2 = pPath.length - 1; _asi2 >= 0; _asi2--) {
      if (!pPath[_asi2]) { _activeSegStart = _asi2 + 1; break; }
    }
    for (var ti5 = 0; ti5 < _activeSegStart; ti5++) {
      var pp5 = pPath[ti5];
      if (!pp5) continue;
      var pa5 = pp5.alpha != null ? pp5.alpha : 1;
      if (pa5 <= 0) continue; // fully faded — tunnel closed, no boost
      var ttdx = head.x - pp5.x, ttdy = head.y - pp5.y;
      if (Math.sqrt(ttdx*ttdx + ttdy*ttdy) < pp5.r * 1.5) {
        // Inside a living previous tunnel — boost proportional to freshness
        // Fresh tunnel (pa5=1.0) → 0.40 (matches Tier 1 open soil)
        // Half-faded (pa5=0.5) → 0.31, nearly gone (pa5=0.1) → 0.24
        spd = Math.max(spd, 0.22 + pa5 * 0.18);
        window._inExistingTunnel = true;
        break;
      }
    }
  }
  // else: Tier 1 open soil — full speed (0.40)

  // ── Gut & Hunger ────────────────────────────────────────────────────────────────
  // Hunger is derived directly from gut fullness — one meter, two views.
  // pHunger = 1 - (pGut / pGutMax): full gut = satisfied, empty gut = starving.
  // Eating fills pGut -> hunger drops. Pooping empties pGut -> hunger spikes back.
  // No independent hunger drain — starvation means not eating, not time passing.

  // Keep gut capacity current with worm size
  pGutMax = 4 + Math.floor((pSR - 4) / 3 * 4);
  if (generation >= 1) pGutMax = Math.round(pGutMax * 1.10); // Gen 1+ perk: +10% gut capacity

  // Derive hunger from gut — single source of truth
  pHunger = 1 - Math.min(1, pGut / pGutMax);

  var gutFull = pGut >= pGutMax * 0.98;
  var starving     = pHunger >= 1.0;  // gut completely empty
  var constipated  = gutFull;          // gut completely full — must poop
  var hungry       = pHunger > 0.5;   // gut less than half full — HP bleeding

  if (constipated) {
    if (pHP > 0) deathCause = 'constipation';
    pHP = Math.max(0, pHP - 0.0003);
  } else if (starving) {
    if (pHP > 0) deathCause = 'starvation';
    pHP = Math.max(0, pHP - 0.0003);
  } else if (hungry) {
    if (pHP > 0) deathCause = 'hunger';
    var hungerBleed = Math.pow((pHunger - 0.5) / 0.5, 3) * 0.0003;
    pHP = Math.max(0, pHP - hungerBleed);
  }

  // ── Passive digestion — runs alongside hunger bleed, not instead of it ───
  // Above 50% gut: full rate. Below 50%: 0.1x — reserve trickles slowly, won't starve you.
  // Stops only when fully starving (pGut=0) or constipated (gut full).
  if (!starving && !constipated && pGut > 0) {
    var digestMult = 1.0;
    if (pSleeping) {
      digestMult = 2.0;
    } else if (d < pSR * 2) {
      digestMult = 1.5; // nearly stationary
    }
    // Depth bonus — deeper in compost = faster digestion
    if (inCompost(head.y)) digestMult *= 2.5 + compostDepth(head.y) * 0.5; // 2.5x top, 3.0x bottom

    // Above 50% gut: full rate. Below 50%: 0.1x trickle through the reserve
    var gutFrac50 = pGut / pGutMax;
    var reserveMult = gutFrac50 > 0.5 ? 1.0 : 0.1;

    var digestRate = digestMult * reserveMult / (5 * 60 * 60);
    var gutDrained = Math.min(pGut, digestRate * pGutMax);
    pGut = Math.max(0, pGut - gutDrained);

    // HP recovery — only when gut is above 20%; below that, bleed must win
    if (gutFrac50 > 0.20) {
      var hpGain = gutDrained / pGutMax * 0.40;
      pHP = Math.min(1.0, pHP + hpGain);
    }
  }

  // Acid decay — clears naturally over ~60 seconds when not eating acid food
  pAcid = Math.max(0, pAcid - ACID_DECAY);
  // Acid HP burn — starts hurting at 50% acid buildup, gets worse as it rises
  if (pAcid > 0.5) {
    if (pHP > 0) deathCause = 'acidity';
    pHP = Math.max(0, pHP - ACID_HP_DRAIN * ((pAcid - 0.5) * 2));
  }

  var tail0 = pSegs[pSegs.length - 1];

  // --- Nibble trash chunks (tier 0) ---
  if (headTier === 0 || (headTier === 1 && head.y < H + 80)) {
    for (var i = 0; i < trashChunks.length; i++) {
      var tc2 = trashChunks[i];
      if (tc2.gone || tc2.locked) continue;
      var sdx = head.x - tc2.x, sdy = head.y - tc2.y;
      var hitR = pSR + tc2.sz * tc2.hpFrac * 0.85;
      if (Math.sqrt(sdx*sdx + sdy*sdy) < hitR) {
        var minSize = tc2.t.minSR || 4;
        if (pSR < minSize) {
          // Too small — bounce off and slow down, no particles
          spd *= 0.3;
          tc2.being_eaten = false;
        } else {
        // Nibble: remove a small bite each frame
        var biteAmt = 0.07 + pSR * 0.016;
        if (generation >= 5) biteAmt *= 1.20; // Gen 5+ perk: +20% bite rate
        tc2.hp -= biteAmt;
        tc2.hpFrac = Math.max(0, tc2.hp / tc2.maxHp);
        // PERF-1: invalidate cached img if hpFrac crossed a 10% bucket
        _invalidateChunkImg(tc2);
        // Acid buildup from toxic foods
        if (tc2.t.acid && frame % 8 === 0) {
          pAcid = Math.min(1.0, pAcid + tc2.t.acid * 0.015);
        }
        // Decrement first so both checks below fire on the correct frame
        tc2.nibbleCooldown--;
        // Spawn a nibble debris particle every few bites
        if (tc2.nibbleCooldown <= 0) {
          tc2.nibbleCooldown = 45 + Math.floor(Math.random() * 16);
          var debSz = 3.5 + Math.random() * 5;
          var debVx = (Math.random() - 0.5) * 2.2;
          var debVy = 0.8 + Math.random() * 1.2;
          var debSpin = (Math.random() - 0.5) * 0.18; // spin speed, faster for smaller bits
          if (debris.length < 80) debris.push({
            x: tc2.x + (Math.random() - 0.5) * tc2.sz * 0.8,
            y: tc2.y + tc2.sz * 0.2,
            vy: debVy, vx: debVx,
            sz: debSz,
            spin: debSpin,
            hp: 2 + Math.random() * 3,
            maxHp: 5,
            col: tc2.t.debrisCol,
            col2: tc2.t.debrisCol2,
            name: tc2.t.name,
            acid: tc2.t.acid || 0,
            liq:  tc2.t.liq  || 0,
            ti: 0, active: true,
            rot: Math.random() * Math.PI * 2
          });
          // Liquid drops from juicy items
          if (tc2.t.liq > 0 && Math.random() < tc2.t.liq * 0.08) {
            dropsPush({x: tc2.x + (Math.random()-0.5)*tc2.sz, y: tc2.y, vy: 0.3 + Math.random()*0.2, sz: 3, active: true});
          }
          // Gut fill on the same event — once per 45-60 frames, not every 8
          pGutMax = 4 + Math.floor((pSR - 4) / 3 * 4);
          var gutFill = 0.5 + (pSR - 4) / 3 * 0.1; // sr=4:0.5, sr=7:0.6 — baby worm feels each nibble
          pGut = Math.min(pGutMax, pGut + gutFill);
        }
        if (frame % 8 === 0) {
          karma += 1;
          pEaten++;
          if (pSegs.length < 8 && pEaten % 12500 === 0) pSegs.push({x: tail0.x, y: tail0.y});
          pSEG = pSegs.length;
          pSR = 4; // radius locked — worms grow in length only
        }
        if (tc2.hp <= 0) {
          tc2.gone = true;
          karma += tc2.t.pts * 5;
          if (tc2.t.name === 'egg_shell') pAcid = Math.max(0, pAcid - 0.3);
          updateScrapsLevel();
        }
        } // end size-check else
      } else {
        tc2.being_eaten = false;
      }
    }
  }

  // --- Passive trash chunk weathering — 8 chunks selected every ~30s, fired staggered ---
  // Every 1800 frames pick 8 random living chunks and schedule each to fire at a
  // random point within the next 1800 frames so sheds are spread organically.
  if (frame % 1800 === 0) {
    var weatherPool = [];
    for (var i = 0; i < trashChunks.length; i++) {
      if (!trashChunks[i].gone) weatherPool.push(i);
    }
    // Fisher-Yates shuffle
    for (var wi = weatherPool.length - 1; wi > 0; wi--) {
      var wj = Math.floor(Math.random() * (wi + 1));
      var wt = weatherPool[wi]; weatherPool[wi] = weatherPool[wj]; weatherPool[wj] = wt;
    }
    var weatherCount = Math.min(8, weatherPool.length);
    for (var wi2 = 0; wi2 < weatherCount; wi2++) {
      weatherQueue.push({
        fireFrame: frame + Math.floor(Math.random() * 1800),
        chunkIdx:  weatherPool[wi2]
      });
    }
  }
  // Fire any queued sheds whose time has come — use fired flag + bulk filter
  // instead of per-element splice (O(n) each) inside the loop.
  var _wqAnyFired = false;
  for (var qi = 0; qi < weatherQueue.length; qi++) {
    var qe = weatherQueue[qi];
    if (frame < qe.fireFrame) continue;
    qe._fired = true; _wqAnyFired = true;
    var pd = trashChunks[qe.chunkIdx];
    if (!pd || pd.gone) continue;
    // Passive hp bleed
    pd.hp -= pd.maxHp * 0.005;
    pd.hpFrac = Math.max(0, pd.hp / pd.maxHp);
    if (pd.hp <= 0) {
      pd.gone = true;
      updateScrapsLevel();
      continue;
    }
    // PERF-1: invalidate cached img if hpFrac crossed a 10% bucket
    _invalidateChunkImg(pd);
    // Shed one scrap into tier 1
    var shedX = pd.x + (Math.random() - 0.5) * pd.sz * 0.6;
    var shedY = Math.max(H + 12, Math.min(H * 2 - 12, pd.y + pd.sz * 0.5 + Math.random() * 10));
    scrapsPush({
      x: shedX, y: shedY,
      t: pd.t,
      hp: 1 + Math.random() * 2, maxHp: 3,
      sz: 4 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      rotSpd: (Math.random() - 0.5) * 0.004,
      ti: 1, eaten: false, eating: false,
      col: pd.t.debrisCol, col2: pd.t.debrisCol2
    });
    // Tea drop if juicy
    if (pd.t.liq > 0) {
      dropsPush({x: shedX, y: shedY, vy: 0.4 + Math.random() * 0.3, sz: 2 + Math.random(), active: true});
    }
  }
  // Bulk remove fired entries in a single pass
  if (_wqAnyFired) weatherQueue = weatherQueue.filter(function(e) { return !e._fired; });

  // --- Eat tier 1 debris scraps (small fragments) ---
  // Multi-item beats open extra same-type scraps: 'cure' opens all eggshells, 'refuel' opens all refuel scraps.
  var _tutStepNow = tutorial.scene ? tutorial.steps[tutorial.stepIndex] : null;
  var _tutKindNow = _tutStepNow ? _tutStepNow.kind : null;
  for (var i = 0; i < scraps.length; i++) {
    var s = scraps[i];
    if (s.eaten || s.ti !== 1) continue;
    var _openExtra = (_tutKindNow === 'cure'   && s.t && s.t.name === 'egg_shell') ||
                     (_tutKindNow === 'refuel' && s._refuelTut);
    if (tutorial.scene && !(_tutStepNow && _tutStepNow.kind === 'freeplay') && (tutorial.live || s.tutProtected) && s !== tutorial.target && !_openExtra) continue;  // only the active target (+ open extras); live mode locks ALL scraps; free-play opens everything
    var sdx2 = head.x - s.x, sdy2 = head.y - s.y;
    var sDist = Math.sqrt(sdx2*sdx2 + sdy2*sdy2);
    var sHitR = pSR + s.sz * 0.72; // tightened to match visual art (~0.7-0.9r drawn size)
    if (sDist < sHitR) {
      // Smooth deceleration — slow to a near-stop at dead centre, but not a jarring instant halt.
      // At the very edge of the hitbox: ~30% slowdown. At contact centre: nearly stopped.
      var sOverlap = 1 - (sDist / sHitR); // 0 at edge, 1 at centre
      spd *= (1 - sOverlap * 0.92);        // edge: spd*0.70 → centre: spd*0.08
      s.eating = true;
      // Acid buildup while nibbling acidic scraps
      if (s.t && s.t.acid && frame % 8 === 0) {
        pAcid = Math.min(1.0, pAcid + s.t.acid * 0.01);
      }
      s.hp -= 0.03;
      if (s.hp <= 0) {
        s.eaten = true; s.eating = false;
        var scrapFill = 0.5 + (pSR - 4) / 3 * 0.1; // sr=4: 0.5, sr=7: 0.6 — matches nibble rate
        pGut = Math.min(pGutMax, pGut + scrapFill);
        if (s.t && s.t.name === 'egg_shell') pAcid = Math.max(0, pAcid - 0.15);
        if (s._refuelTut) tutorial._refuelAte = true;   // any refuel scrap eaten advances the refuel beat
        // Liquid drops — juicy/acid scraps produce drops that fall toward tea level
        if (s.t && s.t.liq > 0) {
          var numDrops = Math.ceil(s.t.liq / 3); // liq:3=1 drop, liq:6=2, liq:9=3
          for (var di = 0; di < numDrops; di++) {
            dropsPush({x: s.x + (Math.random()-0.5)*s.sz, y: s.y, vy: 0.4 + Math.random()*0.3, sz: 2 + Math.random(), active: true});
          }
        }
        pEaten++;
        if (pSegs.length < 8 && pEaten % 12500 === 0) pSegs.push({x: tail0.x, y: tail0.y});
        pSEG = pSegs.length;
        pSR = 4; // radius locked — worms grow in length only
        karma += 3;
      }
    } else {
      s.eating = false;
    }
  }


  if (d > 2) {
    // Steer wiggle — nudge direction left/right each frame so head snakes toward target
    var dn = d || 1;
    var fwdX = dx / dn, fwdY = dy / dn;   // forward unit vector
    var perpX = -fwdY, perpY = fwdX;       // perpendicular unit vector
    var steerAmp = Math.min(0.10, 0.08 + Math.pow(pSR - 4, 1.8) * 0.008);               // amplitude in pixels — scales with worm size
    var steerFreq = 0.08 / (1 + (pSR - 4) * 0.3); // bigger worms pivot more slowly
    var steerOffset = Math.sin(frame * steerFreq) * steerAmp;
    head.x += fwdX * spd + perpX * steerOffset;
    head.y += fwdY * spd + perpY * steerOffset;
  }
  var b2 = getBinCached();
  head.x = Math.max(b2.cx - b2.bw2 + 4, Math.min(b2.cx + b2.bw2 - 4, head.x));
  head.y = Math.max(wormCeiling, Math.min(cSurf() - pSR, head.y));

  // Path history — head position now already wiggles so tunnel carves naturally
  pHist.push({x: head.x, y: head.y});
  var spacing = pSR * 1.4;
  var needed = Math.min(pSEG * Math.ceil(spacing) + 300, 6000);
  while (pHist.length > needed) pHist.shift();

  // Place segments — use the same ceiling as the head so body follows naturally
  for (var i = 1; i < pSegs.length; i++) {
    var target = i * spacing, cum = 0, placed = false;
    for (var j = pHist.length - 1; j > 0; j--) {
      var ddx = pHist[j].x - pHist[j-1].x, ddy = pHist[j].y - pHist[j-1].y;
      cum += Math.sqrt(ddx*ddx + ddy*ddy);
      if (cum >= target) { pSegs[i].x = pHist[j].x; pSegs[i].y = pHist[j].y; placed = true; break; }
    }
    // History too short — snap to oldest known point instead of leaving segment stranded
    if (!placed && pHist.length > 0) { pSegs[i].x = pHist[0].x; pSegs[i].y = pHist[0].y; }
    if (pSegs[i].y < wormCeiling) pSegs[i].y = wormCeiling;
  }

  // Carve tunnel
  // Only carve when worm is actively moving — prevents spurs when paused
  var _hmx = head.x - (window._lastHeadX || head.x);
  var _hmy = head.y - (window._lastHeadY || head.y);
  var _hmoved = Math.sqrt(_hmx*_hmx + _hmy*_hmy);
  window._lastHeadX = head.x; window._lastHeadY = head.y;

  // ── Sump boundary flag — must be declared BEFORE junction check which guards on it ──
  var _atSump = head.y >= cSurf() - pSR - 2;

  // ── Junction detection — worm holds still over an existing sump-connected path ─
  // Only active in compost, not at the sump boundary itself
  if (!_atSump && inCompost(head.y)) {
    if (_hmoved < 0.01) {
      // Find where the player's OWN active segment starts (after the last null) —
      // you can't junction the tube you're currently carving into itself.
      var _activeSegStart = 0;
      for (var _asi = pPath.length - 1; _asi >= 0; _asi--) {
        if (!pPath[_asi]) { _activeSegStart = _asi + 1; break; }
      }
      // Scan EVERY registered path for the nearest junctionable point. On the player's
      // own path only points BEFORE the active segment are eligible; on every other
      // path (NPC tubes) all points are fair game.
      var _jFoundArr = null, _jFoundIdx = -1, _jBestD = Infinity;
      var _jProx = pSR * 2;
      // Spatial lookup over the overlapping Y-buckets only — O(local), not O(all tunnel points).
      var _jkMin = _pPathBucketKey(head.y - _jProx), _jkMax = _pPathBucketKey(head.y + _jProx);
      for (var _jk = _jkMin; _jk <= _jkMax; _jk++) {
        var _jBkt = _pPathBuckets[_jk];
        if (!_jBkt) continue;
        for (var _jbi = 0; _jbi < _jBkt.length; _jbi++) {
          var _jEnt = _jBkt[_jbi];
          var _jArrS = _jEnt.arr;
          // On the player's OWN path only points before the active segment are eligible.
          if (_jArrS === pPath && _jEnt.idx >= _activeSegStart) continue;
          var _jp = _jArrS[_jEnt.idx];
          if (!_jp) continue;
          var _ja = _jp.alpha != null ? _jp.alpha : 1;
          if (_ja <= 0) continue;
          var _jdxA = Math.abs(_jp.x - head.x), _jdyA = Math.abs(_jp.y - head.y);
          if (_jdxA > _jProx || _jdyA > _jProx) continue;
          // Skip locations already junctioned
          var _jUsed = false;
          for (var _jui = 0; _jui < junctionUsedPoints.length; _jui++) {
            var _ju = junctionUsedPoints[_jui];
            if (Math.abs(_ju.x - _jp.x) < pSR * 3 && Math.abs(_ju.y - _jp.y) < pSR * 3) { _jUsed = true; break; }
          }
          if (_jUsed) continue;
          var _jdSum = _jdxA + _jdyA;
          if (_jdSum < _jBestD) { _jBestD = _jdSum; _jFoundArr = _jArrS; _jFoundIdx = _jEnt.idx; }
        }
      }
      if (_jFoundArr) {
        // Holding still over a valid drain point — advance timer
        if (!junctionTargetRef || junctionTargetRef.arr !== _jFoundArr || junctionTargetRef.idx !== _jFoundIdx) {
          // Moved to a different point — reset
          junctionTimer = 0;
          junctionTargetRef = { arr: _jFoundArr, idx: _jFoundIdx };
        } else {
          junctionTimer++;
          if (junctionTimer >= JUNCTION_HOLD_FRAMES) {
            // ── Stamp junction onto the player's tube, targeting ANY path ────
            pPath.push({x: head.x, y: head.y, r: pSR, ti: 2, junctionTarget: { arr: junctionTargetRef.arr, idx: junctionTargetRef.idx }});
            pPath.push(null);
            pLastX = -999; pLastY = -999;
            junctionUsedPoints.push({x: head.x, y: head.y});
            if (junctionUsedPoints.length > 200) junctionUsedPoints.shift(); // bound growth
            junctionCarveOrigin = {x: head.x, y: head.y}; // suppress carving for 20px
            var jScore = Math.round(15 * (1 + compostDepth(head.y)));
            karma += jScore;
            drainBonusPopups.push({ text: '🌿 Junction linked! +' + jScore, x: head.x, wy: head.y - pSR*3, alpha: 1, vy: -0.55 });
            junctionTimer = 0;
            junctionTargetRef = null;
          }
        }
      } else {
        // No drain nearby — reset
        junctionTimer = 0;
        junctionTargetRef = null;
      }
    } else {
      // Worm moved — reset
      junctionTimer = 0;
      junctionTargetIdx = -1;
      junctionTargetRef = null;
    }
  } else {
    junctionTimer = 0;
    junctionTargetIdx = -1;
    junctionTargetRef = null;
  }
  // Drain connections — worm holds still at sump to charge, same mechanic as junction.
  // Down drain: first hold stamps sumpExit + seals segment, rewards if tunnel spans to top.
  // Up drain:   subsequent holds stamp a new sumpExit (open segment) + fire "Up drain ready!".
  if (_atSump) {
    // At sump floor: wiggle keeps _hmoved ~0.08-0.10 even when pinned.
    // Use a looser threshold so holding still at the boundary charges the timer.
    var _sumpStill = _hmoved < 0.25;
    // Tick down the post-down-drain cooldown every frame we're at the sump
    if (drainDownCooldown > 0) drainDownCooldown--;
    if (_sumpStill) {
      if (window._sumpHadDown == null) {
        // ── No down drain yet — charge down drain timer ───────────────────
        drainDownTimer++;
        drainUpTimer = 0;
        if (drainDownTimer >= JUNCTION_HOLD_FRAMES) {
          drainDownTimer = 0;
          drainUpTimer = 0;
          drainDownCooldown = JUNCTION_HOLD_FRAMES;
          window._sumpHadDown = true;
          if (tutorial.scene) tutorial._downDrainDone = true;   // down-drain beat satisfied
          karma += 100;
          drainBonusPopups.push({ text: 'Down drain connected! +100', x: head.x, wy: head.y - pSR*3, alpha: 1, vy: -0.55 });
          pPath.push({x: head.x, y: cSurf(), r: pSR, ti: 2, sumpExit: true});
          pPath.push(null);
          pLastX = -999; pLastY = -999;
          var _dsSegTop = false;
          var _dsScanStart = pPath.length - 3;
          var _dsScanLimit = Math.max(0, _dsScanStart - 2000);
          for (var _dsi = _dsScanStart; _dsi >= _dsScanLimit; _dsi--) {
            var _dsp = pPath[_dsi];
            if (!_dsp) continue;
            if (_dsp.y <= 2*H + H*0.15) { _dsSegTop = true; break; }
            if (_dsp.y < 2*H - H*0.1) break;
          }
          // Always reward the down drain connection — full bonus for spanning tunnels, smaller for short ones
          var _drainBonus = _dsSegTop ? 100 : 25;
          var _drainMsg   = _dsSegTop ? '🌿 Drain connected! +100' : '🌿 Drain tapped! +25';
          karma += _drainBonus;
          drainBonusPopups.push({ text: _drainMsg, x: head.x, wy: head.y - pSR*3, alpha: 1, vy: -0.55 });
        }
      } else {
        // ── Down drain exists — charge up drain timer (only after cooldown expires) ──
        // Use a stricter still threshold here — the down drain needs 0.25 because the
        // worm is pinned at the boundary and wiggles ~0.08-0.10 even when held.
        // But for the up drain we want deliberate stillness, so use the same tight
        // threshold as junction detection (0.01 — barely any movement at all).
        drainDownTimer = 0;
        var _upStill = _hmoved < 0.12; // tighter than _sumpStill but forgiving of idle wiggle
        if (_upStill && drainDownCooldown <= 0) {
          drainUpTimer++;
          if (drainUpTimer >= JUNCTION_HOLD_FRAMES) {
            drainUpTimer = 0;
            drainDownCooldown = JUNCTION_HOLD_FRAMES; // cooldown after each up drain too
            window._sumpHadDown = true; // keep flag so further holds make more up drains
            pPath.push({x: head.x, y: cSurf(), r: pSR, ti: 2, sumpExit: true});
            pLastX = head.x; pLastY = cSurf();
            window._upDrainBonusFired = false;
            drainBonusPopups.push({ text: '🌿 Up drain ready!', x: head.x, wy: head.y - pSR*3, alpha: 1, vy: -0.55 });
            if (tutorial.scene) tutorial._upDrainArmed = true;   // up-drain beat satisfied (the +100 completes on the climb up)
          }
        } else {
          // Moving or in cooldown — reset so the full hold is required from a standstill
          drainUpTimer = 0;
        }
      }
    } else {
      // Worm moving — reset both timers (cooldown keeps ticking)
      drainDownTimer = 0;
      drainUpTimer = 0;
    }
  } else {
    drainDownTimer = 0;
    drainUpTimer = 0;
    drainDownCooldown = 0; // leaving the sump fully resets cooldown
    // Clear down-drain flag once worm is clearly above sump
    if (head.y < cSurf() - pSR - 20) {
      window._sumpHadDown = null;
    }
  }

  // Carve tunnel — blocked entirely while at sump boundary (no horizontal path carved there)
  // Also suppressed for 20px after a junction stamp to avoid a spur right at the link point
  if (junctionCarveOrigin) {
    var _jcox = head.x - junctionCarveOrigin.x, _jcoy = head.y - junctionCarveOrigin.y;
    if (Math.sqrt(_jcox*_jcox + _jcoy*_jcoy) >= 20) junctionCarveOrigin = null;
  }
  if (!_atSump && !junctionCarveOrigin && !window._inExistingTunnel && _hmoved > 0.05 && addPoint(pPath, head.x, head.y, pSR, pLastX, pLastY)) {
    pLastX = head.x; pLastY = head.y;
    // Up drain bonus — fires once when an upward tunnel (from sumpExit) reaches the top of compost
    if (!window._upDrainBonusFired && head.y <= 2*H) {
      // Check active segment contains a sumpExit (confirming this is an upward tunnel)
      var _ubHasSump = false;
      for (var _ubi = pPath.length - 1; _ubi >= 0; _ubi--) {
        var _ubp = pPath[_ubi];
        if (!_ubp) break;
        if (_ubp.sumpExit) { _ubHasSump = true; break; }
      }
      if (_ubHasSump) {
        karma += 100;
        drainBonusPopups.push({ text: '🌿 Up drain complete! +100', x: head.x, wy: head.y - pSR*3, alpha: 1, vy: -0.55 });
        window._upDrainBonusFired = true;
        // Seal the completed up-drain as its own segment so drops can't
        // jump across into other tunnels. The sumpExit at the bottom stays
        // as the drain point — this null gives the tunnel its own identity.
        pPath.push(null);
        pLastX = -999; pLastY = -999;
      }
    }

  }

  // Camera — slow smooth lerp to follow worm (suppressed in viewMode)
  if (!viewMode) {
    var tc = head.y - H/2;
    camY += (Math.max(0, Math.min(cSurf() + H*0.25 - H + 120, tc)) - camY) * 0.04;
    // Horizontal camera — follow worm, scroll world within viewport.
    // On wide screens (W >= WORLD_W) the bin fits entirely — no scroll needed.
    // Centering is handled by centreOffsetX in draw(), keeping camX always >= 0
    // so mouse/touch world-coord conversion stays correct.
    if (W < WORLD_W) {
      var _b0 = getBinCached();
      var _binLeft  = _b0.cx - _b0.bw2;
      var _binRight = _b0.cx + _b0.bw2;
      var _camXTarget = head.x - W/2;          // center worm in viewport
      var _camXMin = _binLeft - 20;             // left clamp: don't show beyond bin left
      var _camXMax = Math.max(_camXMin, _binRight - W + 20); // right clamp
      // Lerp rate matches camY (0.04) for consistent feel across both axes.
      camX += (Math.max(_camXMin, Math.min(_camXMax, _camXTarget)) - camX) * 0.04;
      camX = Math.round(camX);
    } else {
      camX = 0; // wide screen — bin fits, no horizontal scroll
    }
  }
}


// Castings enrichment decays very slowly — rich soil degrades over ~30 min without feeding
var ENRICH_DECAY = 0.000001; // ~16 min to lose 1.0 at 60fps

// Reusable typed-array buffer for tunnel-decay segment connectivity flags.
// Avoids a new Uint8Array allocation every 10 frames as pPath grows.
var _segConnBuf = new Uint8Array(512);
var TUNNEL_DECAY = 0.0000167;        // base rate (~16 min for sump-connected)
var TUNNEL_DECAY_UNCONNECTED = 0.0000535; // ~5 min for tubes with no sump link

function updatePhysics() {
  // ── Tutorial: compost economy OFF ─────────────────────────────────────────
  // The lesson doesn't need casting enrichment or saturation (sump tea + moisture),
  // and letting them build invites flood/drowning pressure and NPC-tube drop churn
  // mid-lesson. updatePhysics runs LAST each frame (after updatePlayer + updateNPCSims +
  // tryPoop), so pinning here every frame wipes all accumulation before draw and before
  // next frame's threshold checks — values never approach flood (tLvl>=0.9) or drowning
  // (pooled>0.6). Drops still fall/render; only the totals are held at baseline.
  if (tutorial.active) {
    castingEnrichment = 0;
  }
  // Rebuild the shared path bucket index at most ONCE per frame if any path pruned since the
  // last frame. Previously every prune triggered a full O(all-points) rebuild, so once NPC
  // tunnels saturated their cap the per-carve rebuilds piled up and the game got laggy over
  // time. Debouncing to one rebuild/frame removes that storm; readers tolerate a 1-frame-stale
  // index (they already guard against missing points).
  if (_pPathBucketsDirty) { _pPathBucketRebuild(); _pPathBucketsDirty = false; }
  // Filter eaten scraps — only every 60 frames to avoid allocation pressure
  if (frame % 60 === 0) scraps = scraps.filter(function(s) { return !s.eaten; });

  // --- Castings enrichment slow decay ---
  castingEnrichment = Math.max(0, castingEnrichment - ENRICH_DECAY);

  // --- Passive tunnel decay — tier 2 paths fill back in over time ---
  // Only every 10 frames — decay is slow enough this is imperceptible, saves O(pPath) per frame
  // First pass: tag every point with whether its segment contains a sumpExit.
  // We walk the array once, tracking sumpExit within each segment (null = boundary).
  if (frame % 10 === 0) {
    // Build a per-segment sump-connected flag in one forward pass.
    // segConnected[i] = true if pPath[i] is part of a segment that has a sumpExit point.
    // Reuse module-level buffer — grow only when pPath exceeds current allocation.
    if (_segConnBuf.length < pPath.length) _segConnBuf = new Uint8Array(pPath.length * 2);
    var _segConn = _segConnBuf;
    // Zero only the portion we need (avoids full clear of a large buffer)
    for (var _zi = 0; _zi < pPath.length; _zi++) _segConn[_zi] = 0;
    var _segStart = 0;
    var _segHasSump = false;
    for (var _tci = 0; _tci <= pPath.length; _tci++) {
      var _tcp = _tci < pPath.length ? pPath[_tci] : null;
      if (!_tcp) {
        // End of segment — backfill the flag for the whole segment
        if (_segHasSump) {
          for (var _tfi = _segStart; _tfi < _tci; _tfi++) _segConn[_tfi] = 1;
        }
        _segStart = _tci + 1;
        _segHasSump = false;
      } else {
        if (_tcp.sumpExit || _tcp.junctionTarget != null) _segHasSump = true;
      }
    }

    for (var tdi = 0; tdi < pPath.length; tdi++) {
      var tp = pPath[tdi];
      if (!tp || tp.ti !== 2) continue;
      if (tp.alpha == null) tp.alpha = 1;
      var _decayRate = _segConn[tdi] ? TUNNEL_DECAY : TUNNEL_DECAY_UNCONNECTED;
      tp.alpha = Math.max(0, tp.alpha - _decayRate * 10);
      // Clog self-clears over ~25 min (castings break down in rich compost)
      // But only decay if no fresh poop landed here in the last 1800 frames (~30 seconds)
      if (tp.clog && (frame - (tp.clogTs || 0)) > 1800) {
        var clogDecay = (0.00001 + castingEnrichment * 0.00003) * 10;
        tp.clog = Math.max(0, tp.clog - clogDecay);
      }
    }
  }


  // --- Settling clog art removed --- clogs now burst into isPoop drops when their
  // tunnel alpha hits 0 (see the alpha fade loop above). The clogVy settling path
  // is no longer needed; drops re-enter normal poop physics from there.

  // --- Settled scraps slowly sink deeper into tier 1, then fade into compost ---
  for (var i = scraps.length - 1; i >= 0; i--) {
    var sc = scraps[i];
    if (sc.ti !== 1 || sc.eaten || sc.tutProtected) continue;   // staged tutorial food never sinks/decomposes — must persist until its beat
    // Sink at same rate as castings — 0.012 + sz*0.001 px/frame
    sc.y += 0.012 + (sc.sz || 5) * 0.001;
    var bsc = getBinCached();
    sc.x = Math.max(bsc.cx - bsc.bw2 + 6, Math.min(bsc.cx + bsc.bw2 - 6, sc.x));
    // Once at the true bottom of tier 1, start fading as organic matter breaks down
    if (sc.y >= 2*H) {
      sc.alpha = sc.alpha != null ? sc.alpha : 1.0;
      sc.alpha -= 0.04;
      if (sc.alpha <= 0) {
        // Natural decomposition — produce tea drops scaled by liq value, same as eaten path
        var scLiq = (sc.t && sc.t.liq) ? sc.t.liq : 0;
        if (scLiq > 0) {
          var numDecompDrops = Math.ceil(scLiq / 3);
          for (var ddi = 0; ddi < numDecompDrops; ddi++) {
            dropsPush({x: sc.x + (Math.random()-0.5)*sc.sz, y: sc.y, vy: 0.4 + Math.random()*0.3, sz: 2 + Math.random(), active: true});
          }
        }
        scraps.splice(i, 1); // fully decomposed
      }
    }
  }

  // --- Debris particles (nibble bits falling from tier 0 into tier 1) ---
  var binB = getBinCached();
  for (var i = 0; i < debris.length; i++) {
    var db = debris[i];
    if (!db.active) continue;

    db.x += db.vx;
    db.y += db.vy;
    db.rot += (db.spin || 0.04);

    if (db.ti === 0) {
      // Falling in tier 0 — normal gravity
      db.vy = Math.min(db.vy + 0.08, 5.0);
      db.vx *= 0.97;

      if (db.y >= H + 50) {
        // Enter tier 1 soil — keep downward momentum, lose some on impact
        db.ti = 1;
        db.entryY = H + 50;
        db.vy = Math.abs(db.vy) * (0.5 + (db.sz / 14) * 0.3);
        db.vx *= 0.45;
        db.spin = (Math.random() - 0.5) * 0.2;
      }
    } else {
      // In tier 1 soil — drain velocity, no added gravity
      db.vy *= 0.93;
      db.vx *= 0.70;

      var travelled = db.y - (db.entryY || H + 50);
      if (travelled > 15 && db.vy < 0.4) {
        var scatter = (Math.random() - 0.5) * binB.bw * 0.5; // spread up to 25% of bin width either side
        var sx3 = Math.max(binB.cx-binB.bw2+6, Math.min(binB.cx+binB.bw2-6, db.x + scatter));
        var sy3 = Math.max(H + 55, Math.min(H * 2 - 12, db.y + Math.random() * 40));
        scrapsPush({
          x: sx3, y: sy3,
          t: {name: db.name || 'debris', liq: db.liq || 0, hp: db.hp, sz: db.sz, resist: 0.02,
              pts: 1, acid: db.acid || 0, debrisCol: db.col, debrisCol2: db.col2},
          hp: db.hp, maxHp: db.maxHp || db.hp,
          sz: db.sz,
          rot: db.rot, rotSpd: (Math.random()-0.5)*0.003,
          ti: 1, eaten: false, eating: false,
          col: db.col, col2: db.col2, name: db.name
        });
        db.active = false; _debrisDirty = true;
      }
    }

    if (db.y > H * 2.0 || db.x < binB.cx-binB.bw2-20 || db.x > binB.cx+binB.bw2+20) { db.active = false; _debrisDirty = true; }
  }
  // Only run the filter when something actually went inactive — avoids allocation every frame
  if (_debrisDirty) { debris = debris.filter(function(db) { return db.active; }); _debrisDirty = false; }

  // --- Bugs (tier 0 airspace gnats) ---
  var b_bin = getBinCached();
  var pileTopY = H * 0.95;
  for (var bi2 = 0; bi2 < trashChunks.length; bi2++) {
    var tc_b = trashChunks[bi2];
    if (!tc_b.gone) {
      var tcT = tc_b.y - tc_b.sz * tc_b.hpFrac;
      if (tcT < pileTopY) pileTopY = tcT;
    }
  }
  for (var bi2 = 0; bi2 < bugs.length; bi2++) {
    var bug = bugs[bi2];
    bug.phase  += bug.speed;
    bug.phase2 += bug.speed * 1.618;
    bug.wing   += 0.45;
    bug.px = bug.ax + Math.cos(bug.phase)  * bug.rx;
    bug.py = bug.ay + Math.sin(bug.phase2) * bug.ry;
    bug.ax += bug.vax;
    bug.ay += bug.vay;
    var bugLeft  = b_bin.cx - b_bin.bw2 + 12;
    var bugRight = b_bin.cx + b_bin.bw2 - 12;
    if (bug.ax < bugLeft  || bug.ax > bugRight) bug.vax *= -1;
    if (bug.ay < 6        || bug.ay > pileTopY - 10) bug.vay *= -1;
    bug.ax = Math.max(bugLeft,  Math.min(bugRight,  bug.ax));
    bug.ay = Math.max(6,        Math.min(Math.max(6, pileTopY - 10), bug.ay));
    if (Math.random() < 0.004) bug.vax = (Math.random()-0.5)*0.22;
    if (Math.random() < 0.003) bug.vay = (Math.random()-0.5)*0.14;
  }

  // Drops — all drops fall freely through the compost, no coin flip or hard gate.
  // Speed through compost is governed by how saturated the soil already is.
  // Drops sitting in the compost ARE the saturation — pooled is derived from them.

  // Helper: find the null-boundary index that starts the segment containing pPath[idx].
  // Returns 0 if idx is in the first segment (no null before it).
  // Used so stalled tea drops only re-scan their own segment, not cross into older tunnels.
  function _dropSegStart(arr, idx) {
    for (var _ss = idx - 1; _ss >= 0; _ss--) {
      if (!arr[_ss]) return _ss + 1;
    }
    return 0;
  }
  // Helper: find the index one past the null boundary that ends the segment at idx.
  // Returns arr.length if there is no trailing null (last segment).
  function _dropSegEnd(arr, idx) {
    for (var _se = idx + 1; _se < arr.length; _se++) {
      if (!arr[_se]) return _se;
    }
    return arr.length;
  }

  // Returns the {x,y} where a drop should stall on the clog-facing side.
  // queueOffset (px) staggers multiple queued drops along the tube axis.

  var cs = cSurf();
  for (var i = drops.length - 1; i >= 0; i--) {
    var d = drops[i];
    if (!d.active) continue;

    // Drops jammed behind clogs/junctions used to be flushed by the weekly sump drain
    // (removed in the economy teardown). Now they pile up to MAX_DROPS and tank FPS as
    // the count climbs (overdraw + per-frame rescans). Cull any drop that hasn't made
    // vertical progress for ~8s. Progress-based so it ignores the 40-frame clog-retry
    // toggle and never collides with d._stallAge.
    if (d._jamY == null) d._jamY = d.y;
    if (Math.abs(d.y - d._jamY) > (d.r || 4) * 3) {
      d._jamY = d.y; d._jamFrames = 0;         // made real progress -- reset
    } else {
      d._jamFrames = (d._jamFrames || 0) + 1;
      if (d._jamFrames > 180) {                // stuck ~3s with no progress
        if (d.isPoop) castingEnrichment = Math.min(1, castingEnrichment + 0.0003);
        d.active = false;
        continue;
      }
    }

    var P = d.pathArr || pPath;   // the path this drop is currently bound to (defaults to player)

    // Free-fall move — only applied when NOT on a path tunnel.
    // When d.pathIdx is set, the steering block below handles all movement;
    // applying d.y += d.vy here as well was double-moving the drop and
    // pushing it out of the tube on shallow or horizontal segments.
    if (d.pathIdx == null && !d.clogStalled) d.y += d.vy;

    if (inCompost(d.y)) {

      // Follow P — attach to nearest path point at or below drop, then walk forward
      if (d.pathIdx != null) {
        var pp = P[d.pathIdx];
        if (!pp || (pp.alpha != null && pp.alpha <= 0)) {
          // Target point deleted or faded — detach, free-fall from here
          d.lastSegStart = _dropSegStart(P, d.pathIdx); d.lastSegEnd = _dropSegEnd(P, d.pathIdx);
          d.pathIdx = null;
        } else {
          // On P — tunnel acts as clear channel, speed governed by angle of segment
          // ptdist needs computing first for angle, then reused for steering
          var ptdx = pp.x - d.x, ptdy = pp.y - d.y;
          var ptdist = Math.sqrt(ptdx*ptdx + ptdy*ptdy);

          // ── Clog check — tea blocked by poop deposit ─────────────────────────
          // Target point is clogged: stall the drop at its CURRENT position so it
          // never moves into or past the clog art. No jumping back to prevPt needed
          // because we intercept before any movement toward the clog happens.
          if (!d.isPoop && (pp.clog || 0) >= 0.55) {
            // Clog blocks this drop — detach and pool in place.
            // When the clog decays the drop re-enters normal compost fall logic.
            d.pathIdx     = null;
            d.vy          = 0;
            d.stalled     = true;
            d.clogStalled = true;
          } else {

          var angle = ptdist > 0 ? Math.abs(ptdy / ptdist) : 0; // 0=horizontal, 1=vertical
          var targetVy = 0.05 + angle * 0.45; // 0.05 horizontal → 0.5 vertical
          d.vy = Math.min(d.vy + 0.02, targetVy); // accelerate toward angle-based target
          if (ptdist <= d.vy + 1) {
            // Reached this point
            d.x = pp.x; d.y = pp.y;
            if (d.isPoop && typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE && (frame % 6 === 0)) {
              console.log('[POOP-ARRIVE] y='+pp.y.toFixed(1)+' sumpExit='+!!pp.sumpExit+' junctionTarget='+pp.junctionTarget+' clog='+(pp.clog||0).toFixed(3)+' pathIdx='+d.pathIdx+' pPathLen='+P.length);
            }
            // If this is the sealed sump exit point — drop into sump OR deposit clog
            if (pp.sumpExit) {
              if (d.isPoop) {
                // ── Poop at sumpExit: only deposit here if this is the tube terminus ──
                // For a down-drain the sumpExit is the last point (null follows it) — deposit.
                // For an up-drain the sumpExit is the entry at the bottom and live points
                // continue upward — poop should advance past it, not clog the entry.
                var _nextAfterExit = false;
                for (var _nae = d.pathIdx + 1; _nae < P.length; _nae++) {
                  var _naep = P[_nae];
                  if (!_naep) break; // segment boundary — nothing follows
                  var _naea = _naep.alpha != null ? _naep.alpha : 1;
                  if (_naea > 0) { _nextAfterExit = true; break; }
                }
                if (!_nextAfterExit) {
                  // Down-drain terminus — deposit clog and stop.
                  // A single poop drop is enough to seal a drain: clamp to at
                  // least 0.6 (above the 0.55 tea-block threshold) immediately.
                  if (pp.clog == null) pp.clog = 0;
                  pp.clog  = Math.min(1, Math.max(0.6, pp.clog + d.clogAmt));
                  pp.alpha = 1.0;
                  pp.clogTs = frame;
                  d.active = false;
                  if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) console.log('[CLOG] Poop deposited at sumpExit, clog='+pp.clog.toFixed(3)+' pathIdx='+d.pathIdx+' y='+pp.y.toFixed(1));
                } else {
                  // Up-drain entry — advance to the next live point so poop travels up the tube
                  d.upDrain = true; // switch advance direction: poop now climbs toward shallower points
                  // Lock to this segment immediately — prevents the rescan from snapping
                  // the poop to a nearby down-drain if the up-drain advance stalls or detaches.
                  d.lastSegStart = _dropSegStart(P, d.pathIdx);
                  d.lastSegEnd   = _dropSegEnd(P, d.pathIdx);
                  for (var _uae = d.pathIdx + 1; _uae < P.length; _uae++) {
                    var _uaep = P[_uae];
                    if (!_uaep) break;
                    var _uaea = _uaep.alpha != null ? _uaep.alpha : 1;
                    if (_uaea > 0) { d.prevPathIdx = d.pathIdx; d.pathIdx = _uae; break; }
                  }
                }
              } else if ((pp.clog || 0) >= (pp.sumpExit ? 0.3 : 0.55)) {
                // Clog at sumpExit — pool in place and wait for decay.
                d.pathIdx     = null;
                d.vy          = 0;
                d.stalled     = true;
                d.clogStalled = true;
              } else {
                d.inTunnel = true;
                d.pathIdx = null;
                d.y = cSurf();
                d.vy = 0.5;
                if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) console.log('[CLOG] Tea passed sumpExit — clog='+((pp.clog||0).toFixed(3))+' pathIdx='+d.pathIdx);
              }
            } else if (pp.junctionTarget != null && pp.junctionTarget.arr) {
              // Junction point — hop to the connected drain segment, which may live on a
              // DIFFERENT path (player<->NPC or NPC<->NPC). Target is a {arr, idx} reference.
              var _jt   = pp.junctionTarget;
              var _jarr = _jt.arr;
              var _jHopY = pp.y; // Y of the junction stamp
              var _jBest = -1;
              // First try: find a point in the target segment at or below junction Y
              for (var _jsi = _jt.idx; _jsi < _jarr.length; _jsi++) {
                var _jsp = _jarr[_jsi];
                if (!_jsp) break; // end of that segment
                var _jsa = _jsp.alpha != null ? _jsp.alpha : 1;
                if (_jsa <= 0) continue;
                if (_jsp.y >= _jHopY) { _jBest = _jsi; break; }
              }
              // Fallback: deepest point in that segment regardless of Y
              if (_jBest < 0) {
                var _jDeepY = -Infinity, _jDeepI = -1;
                for (var _jsi2 = _jt.idx; _jsi2 < _jarr.length; _jsi2++) {
                  var _jsp2 = _jarr[_jsi2];
                  if (!_jsp2) break;
                  var _jsa2 = _jsp2.alpha != null ? _jsp2.alpha : 1;
                  if (_jsa2 <= 0) continue;
                  if (_jsp2.y > _jDeepY) { _jDeepY = _jsp2.y; _jDeepI = _jsi2; }
                }
                _jBest = _jDeepI;
              }
              if (_jBest >= 0) {
                // Tea must not hop into a clogged connected drain — stall at the junction point.
                var _jBestClog = (_jarr[_jBest].clog || 0);
                var _jBestIsSumpExit = !!(_jarr[_jBest].sumpExit);
                if (!d.isPoop && _jBestClog >= (_jBestIsSumpExit ? 0.3 : 0.55)) {
                  // Connected drain is clogged — block here at the junction stamp point.
                  d.pathIdx     = null;
                  d.vy          = 0;
                  d.stalled     = true;
                  d.clogStalled = true;
                } else {
                  d.prevPathIdx = d.pathIdx;
                  d.pathArr = _jarr;   // hop ACROSS to the target's path
                  d.pathIdx = _jBest;
                  d.x = _jarr[_jBest].x;
                  d.y = _jarr[_jBest].y;
                }
              } else {
                // Target segment gone — free-fall
                d.lastSegStart = _dropSegStart(P, d.pathIdx); d.lastSegEnd = _dropSegEnd(P, d.pathIdx);
                d.pathIdx = null;
                d.vy = Math.max(0.08, d.vy);
              }
            } else {
              // Advance to next point — forward scan direction depends on tunnel orientation.
              // Normal (down-drain / free compost): look for deeper points (npp.y > pp.y).
              // Up-drain (d.upDrain=true): look for shallower points (npp.y < pp.y).
              var advanced = false;
              var nextIsHorizontal = false;
              if (d.upDrain) {
                // ── Up-drain: advance toward shallower points ──────────────────────
                for (var pi8 = d.pathIdx + 1; pi8 < P.length; pi8++) {
                  var upp = P[pi8];
                  if (!upp) break;
                  var ua = upp.alpha != null ? upp.alpha : 1;
                  if (ua <= 0) continue;
                  if (upp.y < pp.y) {
                    // Tea: stop BEFORE a clogged next point — stall at current point.
                    if (!d.isPoop && (upp.clog || 0) >= 0.55) {
                      // Clog ahead on up-drain — pool in place and wait for decay.
                      d.pathIdx     = null;
                      d.vy          = 0;
                      d.stalled     = true;
                      d.clogStalled = true;
                      advanced = true;
                    } else {
                      d.prevPathIdx = d.pathIdx;
                      d.pathIdx = pi8; advanced = true;
                    }
                    break;
                  }
                  if (upp.y === pp.y) { nextIsHorizontal = true; }
                }
                if (!advanced && !nextIsHorizontal) {
                  // Top of the up-drain dead-end
                  if (d.isPoop) {
                    // Poop deposits at the terminus
                    if (pp.clog == null) pp.clog = 0;
                    pp.clog   = Math.min(1, pp.clog + d.clogAmt);
                    pp.alpha  = 1.0;
                    pp.clogTs = frame;
                    d.active  = false;
                  } else if ((pp.clog || 0) >= 0.55) {
                    // Clog at up-drain terminus — pool in place and wait for decay.
                    d.pathIdx     = null;
                    d.vy          = 0;
                    d.stalled     = true;
                    d.clogStalled = true;
                  } else {
                    // No clog — tea exits the top of the up-drain and free-falls from here
                    d.lastSegStart = _dropSegStart(P, d.pathIdx); d.lastSegEnd = _dropSegEnd(P, d.pathIdx);
                    d.pathIdx = null;
                    d.vy = Math.max(0.05, d.vy);
                  }
                }
              } else {
              // ── Normal: advance toward deeper points ───────────────────────────
              for (var pi3 = d.pathIdx + 1; pi3 < P.length; pi3++) {
                var npp = P[pi3];
                if (!npp) break;
                var na = npp.alpha != null ? npp.alpha : 1;
                if (na <= 0) continue;
                if (npp.y > pp.y || (d.isPoop && npp.sumpExit)) {
                  // Fix 3: poop reaches a fully-packed next point — deposit at the bottleneck (npp), not upstream (pp)
                  if (d.isPoop && (npp.clog || 0) >= 0.9) {
                    if (npp.clog == null) npp.clog = 0;
                    npp.clog  = Math.min(1, npp.clog + d.clogAmt * 0.5);
                    npp.alpha = 1.0;
                    npp.clogTs = frame;
                    d.active = false;
                    advanced = true;
                  // Tea: stop BEFORE a clogged next point — stall at current point.
                  // Must null pathIdx so the drop exits the on-path steering loop;
                  // leaving pathIdx set caused vy to oscillate (+=0.02 each frame,
                  // "arrive", stall, reset to 0, repeat) freezing the drop in place.
                  } else if (!d.isPoop && (npp.clog || 0) >= 0.55) {
                    // Clog ahead — pool in place and wait for decay.
                    d.pathIdx     = null;
                    d.vy          = 0;
                    d.stalled     = true;
                    d.clogStalled = true;
                    advanced = true;    // suppress further scanning this frame
                  } else {
                    d.prevPathIdx = d.pathIdx;
                    d.pathIdx = pi3; advanced = true;
                  }
                  break;
                }
                if (npp.y === pp.y) { nextIsHorizontal = true; } // flat section ahead
              }
              if (!advanced && nextIsHorizontal) {
                // Horizontal section — advance along it regardless of whether descent follows
                for (var pi7 = d.pathIdx + 1; pi7 < P.length; pi7++) {
                  var hpp2 = P[pi7];
                  if (!hpp2) break;
                  var ha2 = hpp2.alpha != null ? hpp2.alpha : 1;
                  if (ha2 <= 0) continue;
                  if (hpp2.y >= pp.y) { d.prevPathIdx = d.pathIdx; d.pathIdx = pi7; advanced = true; break; }
                }
                // If nothing ahead on the horizontal — detach and free-fall from here
                if (!advanced) {
                  d.lastSegStart = _dropSegStart(P, d.pathIdx); d.lastSegEnd = _dropSegEnd(P, d.pathIdx);
                  d.pathIdx = null;
                  d.vy = Math.max(0.05, d.vy);
                  advanced = true; // prevent backward scan re-attaching
                }
              }
              if (!advanced) {
                // Nothing deeper forward — scan backward within the SAME segment only.
                // Stop at null (segment boundary) to prevent drops drifting into older tunnels.
                for (var pi5 = d.pathIdx - 1; pi5 >= 0; pi5--) {
                  var bpp = P[pi5];
                  if (!bpp) break; // stop at segment boundary — do NOT cross into other tunnels
                  var ba = bpp.alpha != null ? bpp.alpha : 1;
                  if (ba <= 0) continue;
                  if (bpp.sumpExit || bpp.y > pp.y) { d.prevPathIdx = d.pathIdx; d.pathIdx = pi5; advanced = true; break; }
                }
              }
              if (!advanced && !nextIsHorizontal) {
                // Truly no deeper point in either direction.
                // Poop deposits here and stops.
                // Tea: if this dead-end segment contains ANY clog (not just at pp),
                //      the drop is trapped — stall it here (downstream backpressure case,
                //      e.g. the far arm of a V-tube where pp itself is clean but a clog
                //      sits elsewhere in the same segment blocking the exit).
                //      Otherwise detach and free-fall as normal.
                if (d.isPoop) {
                  // Before depositing, scan forward for a sumpExit still ahead in this segment.
                  // Poop may have stalled on a flat/upward section before reaching the drain mouth.
                  var _foundSumpFwd = false;
                  for (var _sf = d.pathIdx + 1; _sf < P.length; _sf++) {
                    var _sfp = P[_sf];
                    if (!_sfp) break;
                    var _sfa = _sfp.alpha != null ? _sfp.alpha : 1;
                    if (_sfa <= 0) continue;
                    if (_sfp.sumpExit) { d.prevPathIdx = d.pathIdx; d.pathIdx = _sf; _foundSumpFwd = true; break; }
                  }
                  if (!_foundSumpFwd) {
                    if (pp.clog == null) pp.clog = 0;
                    pp.clog  = Math.min(1, pp.clog + d.clogAmt);
                    pp.alpha = 1.0; // poop solidifies the tunnel point — never fades it
                    pp.clogTs = frame; // mark fresh deposit for decay gating (Bug 4)
                    d.active = false;
                    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) console.log('[CLOG] Poop deposited at DEAD-END (not sumpExit!) clog='+pp.clog.toFixed(3)+' y='+pp.y.toFixed(1)+' sumpExit='+!!pp.sumpExit);
                  }
                } else {
                  // Check if any point in this segment is clogged
                  var _segHasClog = (pp.clog || 0) > 0;
                  if (!_segHasClog) {
                    var _chkS = _dropSegStart(P, d.pathIdx), _chkE = _dropSegEnd(P, d.pathIdx);
                    for (var _chk = _chkS; _chk < _chkE; _chk++) {
                      var _chkP = P[_chk];
                      if (_chkP && (_chkP.clog || 0) >= 0.55) { _segHasClog = true; break; }
                    }
                  }
                  if (_segHasClog) {
                    // Clog somewhere in segment — pool in place and wait for decay.
                    d.pathIdx     = null;
                    d.vy          = 0;
                    d.stalled     = true;
                    d.clogStalled = true;
                  } else {
                    d.lastSegStart = _dropSegStart(P, d.pathIdx); d.lastSegEnd = _dropSegEnd(P, d.pathIdx);
                    d.pathIdx = null;
                    d.vy = Math.max(0.05, d.vy);
                  }
                }
              }
              } // end normal (non-upDrain) advance block
            }
          } else {
            // Steer toward next path point using vy as speed
            if (ptdist > 0) {
              d.x += (ptdx / ptdist) * d.vy + (d.vx || 0);
              d.y += (ptdy / ptdist) * d.vy;
            }
            // Decay lateral boost
            if (d.vx) d.vx *= 0.85;
          }
          } // end not-clogged else
        }
      } else {
        // Detached (pathIdx == null) — free percolation, or clog-stalled backpressure.
        if (d.clogStalled) {
          // Clog-stalled: pool in place as backpressure, but PERIODICALLY re-test whether the
          // blockage has cleared — the clog decayed, or the NPC tube it was waiting on dissolved.
          // Previously clogStalled was only ever cleared inside the scan below, which stalled
          // drops never reached, so tea stayed frozen forever ("holding the tea") and these
          // frozen drops piled up toward the cap, dragging the frame rate down over time.
          // Clearing the flag lets the scan/fall below re-route it; if it's still blocked the
          // on-path routing simply re-stalls it next frame (it can't leak past a live clog).
          d.vy = 0;
          d._stallAge = (d._stallAge || 0) + 1;
          if (d._stallAge >= 40) { d._stallAge = 0; d.clogStalled = false; }
        } else if (!d.isPoop) {
          // Assign a random stall depth on first entry so drops pool at varied heights
          // rather than creeping all the way to 3H. Deeper stalls are rarer (percolation
          // gets harder the more compacted the soil is lower down).
          if (d.stallDepth == null) {
            // Bias toward upper-mid compost: uniform [2H + 5%..2H + 90%] of the layer.
            // castingEnrichment compacts lower layers — richer soil stalls drops higher.
            var _maxFrac = 0.90 - castingEnrichment * 0.30; // 0.90 bare → 0.60 rich
            var _minFrac = 0.05;
            d.stallDepth = 2*H + (_minFrac + Math.random() * (_maxFrac - _minFrac)) * (cSurf() - 2*H);
            d.clogStalled = false; // percolation stall — NOT a blockage, re-attach cap must not fire
          }

          if (d.y >= d.stallDepth) {
            // Reached stall point — come to rest here, become pooled moisture
            d.y  = d.stallDepth;
            d.vy = 0;
            d.stalled = true;
            d.lastSegStart = null; d.lastSegEnd = null;  // release old-tube lock once pooled
          } else {
            // Still falling toward stall — apply compost drag
            d.vy *= 0.96;
            d.vy = Math.max(0.04, d.vy);
          }
        } else {
          // Poop drop — decelerates like a casting until it finds a tube
          d.vy *= 0.92;
          if (d.vy < 0.003) d.vy = 0.003;
        }

        // Even while stalled, keep scanning for a nearby tunnel that could carry this drop the
        // rest of the way down. Skipped for clog-stalled drops (they pool until their recheck);
        // RESTING pooled drops only re-scan ~once every 8 frames (staggered by index) instead of
        // every frame — a falling drop still scans every frame so it attaches promptly.
        if (!d.clogStalled && (!d.stalled || ((frame + i) & 7) === 0)) {
        var _bestArr = null, _bestIdx = -1, _bestDist = 999999;
        var _scanX = d.x, _scanY = d.y;
        // Poop scans only the current active segment — prevents snapping to distant
        // tunnels carved elsewhere. Tea scans all of P as before.
        var _xTol = d.isPoop ? pSR * 1.8 : (d.stalled ? pSR * 5 : pSR * 2);
        var _yTol = d.isPoop ? pSR * 2.5 : (d.stalled ? pSR * 5 : pSR * 2);
        // Both poop and tea scan all of P. Poop previously only scanned
        // the current active segment to prevent jumping, but that stopped it
        // from finding sealed sump-connected tunnels. Null boundaries now
        // do the isolation work — segment scanning stops at nulls naturally.
        var _scanStart = 0;
        // Stalled drops are restricted to their own last-known segment so they
        // cannot jump sideways into an older tunnel within the X/Y tolerance radius.
        // Poop in upDrain mode is also locked to its segment.
        var _scanRestricted = (d.isPoop && d.upDrain) && d.lastSegStart != null;
        var _rStart = _scanRestricted ? d.lastSegStart : _scanStart;
        var _rEnd   = _scanRestricted ? d.lastSegEnd   : P.length;

        // PERF-2: build a candidate index set from Y-buckets so the inner loop
        // only visits points near this drop instead of all 2,000.
        // Restricted scans (upDrain / stalled poop) already have a tight index range
        // and skip the bucket pass — the range walk is already O(segment size).
        var _useBuckets = !_scanRestricted && Object.keys(_pPathBuckets).length > 0;
        var _bucketCandidates = null;
        if (_useBuckets) {
          _bucketCandidates = [];
          // Poop scans ±yTol in both directions; tea only looks downward (≥ _scanY).
          var _bYMin = d.isPoop ? _scanY - _yTol : _scanY;
          var _bYMax = _scanY + _yTol;
          var _bkMin = _pPathBucketKey(_bYMin);
          var _bkMax = _pPathBucketKey(_bYMax);
          for (var _bk = _bkMin; _bk <= _bkMax; _bk++) {
            var _bkt = _pPathBuckets[_bk];
            if (!_bkt) continue;
            for (var _bki = 0; _bki < _bkt.length; _bki++) {
              _bucketCandidates.push(_bkt[_bki]);
            }
          }
        }

        // Scan: either bucket candidates (fast path) or the full index range (restricted / fallback).
        var _scanLen = _useBuckets ? _bucketCandidates.length : (_rEnd - _rStart);
        for (var _siLoop = 0; _siLoop < _scanLen; _siLoop++) {
          var _cand = _useBuckets ? _bucketCandidates[_siLoop] : { arr: P, idx: _rStart + _siLoop };
          var _carr = _cand.arr, _si = _cand.idx;
          var _sp = _carr[_si];
          if (!_sp) continue;
          var _sa = _sp.alpha != null ? _sp.alpha : 1;
          if (_sa <= 0) continue;
          // Tea only attaches to points clearly BELOW the drop (>= ~0.6 worm-radii down). That
          // "below" margin is what stops a drop that just detached at a tube's lowest point from
          // instantly re-grabbing that same point (a wiggle neighbour looks "deeper") and looping
          // forever — while still letting it connect to a genuinely lower tube (a new path) as it
          // keeps falling. The old whole-segment exclusion was too broad: a long tunnel is one
          // segment, so it also blocked re-joining the SAME tunnel further down.
          if (!d.isPoop && _sp.y < _scanY + pSR * 0.6) continue;
          if (!d.isPoop && _sp.y > _scanY + _yTol) continue; // tea: don't snap too far below
          if (!d.isPoop && _sp.y < _scanY - _yTol) continue; // poop: no upper bound needed beyond tolerance
          if (Math.abs(_sp.x - _scanX) > _xTol) continue;
          // Check both forward and backward in this segment for a deeper point
          var _segHasDeeper = false;
          for (var _si2 = _si + 1; _si2 < Math.min(_carr.length, _si + 60); _si2++) {
            var _sp2 = _carr[_si2];
            if (!_sp2) break;
            var _sa2 = _sp2.alpha != null ? _sp2.alpha : 1;
            if (_sa2 <= 0) continue;
            if (_sp2.y > _sp.y) { _segHasDeeper = true; break; }
          }
          if (!_segHasDeeper) {
            // Also scan backward within the same segment only — stop at null boundary
            for (var _si3 = _si - 1; _si3 >= Math.max(0, _si - 60); _si3--) {
              var _sp3 = _carr[_si3];
              if (!_sp3) break; // stop at segment boundary — do NOT cross into other tunnels
              var _sa3 = _sp3.alpha != null ? _sp3.alpha : 1;
              if (_sa3 <= 0) continue;
              if (_sp3.y > _sp.y) { _segHasDeeper = true; break; }
            }
          }
          // Poop attaches to any point in a dead-end tube (no deeper point needed) —
          // it will walk to the end and deposit clog there. Tea still requires a deeper
          // point to flow toward, or a sumpExit to drain through.
          if (!_segHasDeeper && !d.isPoop && !(_sp.sumpExit)) continue;
          // Both poop and tea use nearest-point attachment.
          // Poop previously used deepest-point to avoid clogging the tube entry, but that
          // caused instant teleport to the drain. The sumpExit pass-through fix already
          // prevents entry-clogging, so nearest is correct for both.
          var _ddx = _sp.x - _scanX, _ddy = _sp.y - _scanY;
          var _dist = Math.sqrt(_ddx*_ddx + _ddy*_ddy);
          // Poop: hard cap on snap distance — never teleport more than ~2 worm radii away
          if (d.isPoop && _dist > pSR * 2.2) continue;
          if (_dist < _bestDist) { _bestArr = _carr; _bestIdx = _si; _bestDist = _dist; }
        }
        if (_bestIdx >= 0) {
          d.prevPathIdx  = null;   // fresh attachment — no meaningful previous index yet
          d.pathArr      = _bestArr;
          d.pathIdx      = _bestIdx;
          d.x            = _bestArr[_bestIdx].x;
          d.y            = _bestArr[_bestIdx].y;
          d.stalled      = false;  // tunnel found — resume flowing
          d.clogStalled  = false;  // clear blockage flag
          d.stallDepth   = null;   // allow re-stall if it detaches again deeper down
          d.lastSegStart = null;   // clear segment lock — fresh attachment
          d.lastSegEnd   = null;
          d.vy           = Math.max(0.05, d.vy);
        }
        } // end scan wrapper — skipped while clog-stalled
      }
    } else if (d.y >= cSurf() && d.y < cSurf() + H*0.25) {
      // Entered sump zone
      if (!d.inSump) {
        d.inSump = true;
      }
      if (d.inTunnel) {
        // Tunnel drop — accelerate under gravity into the tea, no drag
        d.vy = Math.min(d.vy + 0.05, 3.0);
      } else {
        // Pathless leak — slow to a near-stop (culled at 3H+H*0.25)
        d.vy = Math.max(d.vy, 1.6);   // post-economy: sink fast, cull at floor (no sump pile-up)
      }
    }

    var _sumpFloor  = cSurf() + H*0.25;

    // Drop fell past sump floor — poop deposits castings, tea removed silently
    if (d.y > _sumpFloor) {
      if (d.isPoop) { castingEnrichment = Math.min(1, castingEnrichment + 0.0005); }
      d.active = false;
    }
  }
  drops = drops.filter(function(d) { return d.active; });


  

}


function drawPath(path) {
  if (!path.length) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (var pass = 0; pass < (_FAST ? 1 : 2); pass++) {
    var inSeg = false;
    var lastTi = -1;
    var lastAlpha = -1;
    for (var i = 0; i < path.length; i++) {
      var p = path[i];
      if (!p || p.alpha <= 0) {
        if (inSeg) { ctx.stroke(); inSeg = false; }
        lastTi = -1;    // reset so next segment always re-sets style
        lastAlpha = -1;
        continue;
      }
      var sy = p.y - camY;
      if (sy < -p.r*4 || sy > H + p.r*4) {
        if (inSeg) { ctx.stroke(); inSeg = false; }
        lastTi = -1;
        lastAlpha = -1;
        continue;
      }
      var pAlpha = (p.alpha != null ? p.alpha : 1);
      // Re-set style whenever tier OR alpha changes meaningfully
      if (p.ti !== lastTi || Math.abs(pAlpha - lastAlpha) > 0.02) {
        if (inSeg) { ctx.stroke(); inSeg = false; }
        if (pass === 0) {
          ctx.strokeStyle = p.ti === 2 ? '#3a2010' : '#2a1808';
          ctx.lineWidth = p.r * 2.6;
          ctx.globalAlpha = 0.90 * pAlpha;
        } else {
          ctx.strokeStyle = p.ti === 2 ? '#6a4020' : '#4a2c10';
          ctx.lineWidth = p.r * 1.4;
          ctx.globalAlpha = 0.95 * pAlpha;
        }
        lastTi = p.ti;
        lastAlpha = pAlpha;
      }
      if (!inSeg) { ctx.beginPath(); ctx.moveTo(p.x, sy); inSeg = true; }
      else ctx.lineTo(p.x, sy);
    }
    if (inSeg) ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Generation debug panel (DEBUG_MODE only) ─────────────────────────────

// ── Generation color palette ──────────────────────────────────────────────
var GEN_COLORS = [
  '#e8a882', // Gen 0 — Hatchling    (soft pink-peach)
  '#c8873a', // Gen 1 — Seasoned     (warm amber)
  '#c0201a', // Gen 2 — Composter    (red)
  '#4a7a6e', // Gen 3 — Elder        (deep teal)
  '#6a4a9e', // Gen 4 — Ancient      (rich purple)
  '#2a4a8e', // Gen 5 — Primordial   (ocean blue)
  '#8e2a6a', // Gen 6+ — Eternal     (deep magenta)
];
var GEN_NAMES = ['Hatchling','Seasoned','Composter','Elder','Ancient','Primordial','Eternal'];

function getGenColor(gen) {
  return GEN_COLORS[Math.min(gen, GEN_COLORS.length - 1)];
}

function getGenName(gen) {
  return GEN_NAMES[Math.min(gen, GEN_NAMES.length - 1)];
}


// RESERVED / NOT CURRENTLY CALLED — kept for future "invasive worms" (a cheap, distinct body).
// One round-capped stroke through the segment chain (dark edge + colour core) + head + 2 eye
// dots: ~5 canvas ops/worm vs the per-segment circle stack in drawWorm. Same acid/HP colour
// treatment. NPCs use the detailed drawWorm; wire this up when invasive worms are added.

function drawWorm(segs, sr, col, sleeping, acid, hp) {
  if (segs.length < 1) return;
  hp = (hp === undefined) ? 1.0 : hp; // default full health for ghost worms
  // Stage 1 — acid shifts gen color toward lime green #c8f020, full green at pAcid 0.5
  var drawCol = col;
  if (acid && acid > 0.1) {
    var t1 = Math.min(1, (acid - 0.1) / 0.4); // full green at 0.5
    var r0 = parseInt(col.slice(1,3),16), g0 = parseInt(col.slice(3,5),16), b0 = parseInt(col.slice(5,7),16);
    var rr = Math.round(r0 + (0xc8 - r0) * t1);
    var gg = Math.round(g0 + (0xf0 - g0) * t1);
    var bb = Math.round(b0 + (0x20 - b0) * t1);
    drawCol = '#' + ('0'+rr.toString(16)).slice(-2) + ('0'+gg.toString(16)).slice(-2) + ('0'+bb.toString(16)).slice(-2);
  }
  // Stage 2 — HP pale lerps on top of whatever color drawCol is now (gen or green)
  if (hp < 0.45) {
    var _pt = Math.min(1, (0.45 - hp) / 0.45);
    var _cr = parseInt(drawCol.slice(1,3),16), _cg = parseInt(drawCol.slice(3,5),16), _cb = parseInt(drawCol.slice(5,7),16);
    var _pr2 = Math.round(_cr + (0xe8 - _cr) * _pt);
    var _pg2 = Math.round(_cg + (0xe0 - _cg) * _pt);
    var _pb2 = Math.round(_cb + (0xd8 - _cb) * _pt);
    drawCol = '#' + ('0'+_pr2.toString(16)).slice(-2) + ('0'+_pg2.toString(16)).slice(-2) + ('0'+_pb2.toString(16)).slice(-2);
  }
  // Measure movement — wiggle only animates when worm is actually moving
  var headMoveDist = 0;
  if (segs.length > 1) {
    var hmdx = segs[0].x - segs[1].x, hmdy = segs[0].y - segs[1].y;
    headMoveDist = Math.sqrt(hmdx*hmdx + hmdy*hmdy);
  }
  var isMoving = !sleeping && headMoveDist > sr * 0.15;

  for (var i = segs.length - 1; i >= 0; i--) {
    var seg = segs[i];
    // Wiggle — lateral offset perpendicular to direction of travel, only when moving
    var wx = seg.x, wy2 = seg.y;
    if (isMoving && i > 0 && i < segs.length - 1) {
      var prev = segs[i - 1], next = segs[i + 1];
      var dx = prev.x - next.x, dy = prev.y - next.y;
      var dl = Math.sqrt(dx*dx + dy*dy) || 1;
      // Perpendicular unit vector
      var px = -dy / dl, py = dx / dl;
      // Sine wave along body — amplitude tapers at head and tail
      var taper = Math.sin(Math.PI * (i / segs.length));
      var bodyAmp = 0.18 - (sr - 4) * 0.05; // shrinks from 0.18 at sr=4, more aggressively for large worms
      var wave = Math.sin(i * 0.9 + frame * 0.18) * sr * Math.max(0.05, bodyAmp) * taper;
      wx += px * wave;
      wy2 += py * wave;
    }
    var sy = wy2 - camY;
    if (sy < -sr*3 || sy > H + sr*3) continue;
    var t = i / segs.length;
    var r;
    if (t < 0.08) r = sr * (0.3 + t * (1/0.08) * 0.7);
    else if (t < 0.75) r = sr;
    else r = sr * (1 - (t-0.75) * (1/0.25) * 0.65);
    r = Math.max(1, r);
    ctx.beginPath();
    ctx.arc(wx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = (i % 2 === 0) ? drawCol : drawCol + 'dd';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  // Clitellum
  if (segs.length > 5) {
    var ci = Math.min(4, segs.length - 1);
    var csy = segs[ci].y - camY;
    ctx.beginPath();
    ctx.arc(segs[ci].x, csy, sr * 1.12, 0, Math.PI * 2);
    ctx.fillStyle = drawCol + 'bb';
    ctx.fill();
  }
  // Eyes
  if (segs.length > 1) {
    var hd = segs[0];
    var hsy = hd.y - camY;
    var ang = Math.atan2(hd.y - segs[1].y, hd.x - segs[1].x);
    var eo = sr * 0.45;
    var ea1 = ang + Math.PI/2;
    var ea2 = ang - Math.PI/2;
    var ex1 = hd.x + Math.cos(ea1)*eo, ey1 = hsy + Math.sin(ea1)*eo;
    var ex2 = hd.x + Math.cos(ea2)*eo, ey2 = hsy + Math.sin(ea2)*eo;
    if (sleeping) {
      // Closed eyes — small curved lines
      ctx.strokeStyle = '#1a0800';
      ctx.lineWidth = sr * 0.18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex1, ey1, sr * 0.2, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex2, ey2, sr * 0.2, 0, Math.PI);
      ctx.stroke();
    } else {
      // Eyes: acid shifts whites toward lime-tinged by 0.5, then HP pale fades on top
      var _acidBlend = (acid && acid > 0.1) ? Math.min(1, (acid - 0.1) / 0.4) : 0;
      var _eyePale   = hp < 0.45 ? Math.min(1, (0.45 - hp) / 0.45) : 0;
      // Acid eye target at full green: #d8f0a0
      var _ewr = Math.round(0xff + (0xd8 - 0xff) * _acidBlend);
      var _ewg = Math.round(0xff + (0xf0 - 0xff) * _acidBlend);
      var _ewb = Math.round(0xff + (0xa0 - 0xff) * _acidBlend);
      // Then pale on top of that result
      _ewr = Math.round(_ewr + (0xe8 - _ewr) * _eyePale);
      _ewg = Math.round(_ewg + (0xe0 - _ewg) * _eyePale);
      _ewb = Math.round(_ewb + (0xd8 - _ewb) * _eyePale);
      var _eyeWhite = '#' + ('0'+_ewr.toString(16)).slice(-2) + ('0'+_ewg.toString(16)).slice(-2) + ('0'+_ewb.toString(16)).slice(-2);
      // Pupils — dark brown → milky grey when sick
      var _epr = Math.round(0x1a + (0x6a - 0x1a) * _eyePale); // #1a0800 → #6a5a4a
      var _epg = Math.round(0x08 + (0x5a - 0x08) * _eyePale);
      var _epb = Math.round(0x00 + (0x4a - 0x00) * _eyePale);
      var _eyePupil = '#' + ('0'+_epr.toString(16)).slice(-2) + ('0'+_epg.toString(16)).slice(-2) + ('0'+_epb.toString(16)).slice(-2);
      ctx.fillStyle = _eyeWhite;
      ctx.beginPath(); ctx.arc(ex1, ey1, sr*0.25, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex2, ey2, sr*0.25, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = _eyePupil;
      ctx.beginPath(); ctx.arc(ex1+Math.cos(ang)*1.2, ey1+Math.sin(ang)*1.2, sr*0.12, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex2+Math.cos(ang)*1.2, ey2+Math.sin(ang)*1.2, sr*0.12, 0, Math.PI*2); ctx.fill();
    }
  }
}

// ── Snoo avatar — drawn above worm heads instead of text labels ──────────
// s = scale (1 = ~22px tall), cx/cy = centre of head
function drawSnoo(ctx, cx, cy, s, sleeping) {
  // s is a pixel scale — old head radius was s*5, so headR = s*5
  ctx.save();
  ctx.translate(cx, cy);

  var headR = s * 5;
  // SVG coordinate system: viewBox 0 0 256 256, head ellipse cx=128.1 cy=149.3 rx=85.3 ry=64
  var SC = headR / 64;
  var ox = 128.1, oy = 149.3;
  // headCY = 0 since we translate to cy already; offset so head is centred on (cx,cy)
  var headCY = 0;
  function svgX(v) { return (v - ox) * SC; }
  function svgY(v) { return (v - oy) * SC + headCY; }

  function makeSnooGrad(gcx, gcy, gr) {
    var g = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, gr * 1.4);
    g.addColorStop(0,    '#FEFFFF');
    g.addColorStop(0.4,  '#FEFFFF');
    g.addColorStop(0.51, '#F9FCFC');
    g.addColorStop(0.62, '#EDF3F5');
    g.addColorStop(0.72, '#D8E4E8');
    g.addColorStop(0.8,  '#C8D5DD');
    g.addColorStop(0.9,  '#FFEBEF');
    return g;
  }

  // Ears
  var earR  = 29.9 * SC;
  var earCY = svgY(123.7);
  var lexX = svgX(55.4), rexX = svgX(200.6);
  ctx.fillStyle = makeSnooGrad(lexX, earCY, earR);
  ctx.beginPath(); ctx.arc(lexX, earCY, earR, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = makeSnooGrad(rexX, earCY, earR);
  ctx.beginPath(); ctx.arc(rexX, earCY, earR, 0, Math.PI*2); ctx.fill();

  // Head ellipse
  var hRx = 85.3*SC, hRy = 64*SC;
  var hCX = svgX(128.1), hCY2 = svgY(149.3);
  ctx.fillStyle = makeSnooGrad(hCX, hCY2, Math.max(hRx, hRy));
  ctx.beginPath(); ctx.ellipse(hCX, hCY2, hRx, hRy, 0, 0, Math.PI*2); ctx.fill();

  if (sleeping) {
    // Closed eyes — simple arcs
    ctx.strokeStyle = '#442020'; ctx.lineWidth = SC*3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(svgX(88), svgY(143), 10*SC, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(svgX(168), svgY(143), 10*SC, Math.PI, 0); ctx.stroke();
    // ZZZ
    ctx.fillStyle = 'rgba(150,150,150,0.8)';
    ctx.font = 'bold ' + Math.round(headR*0.6) + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('z', hRx + SC*4, headCY - hRy*0.5);
  } else {
    // Left dark socket
    ctx.fillStyle = '#842123';
    ctx.beginPath();
    ctx.moveTo(svgX(102.8), svgY(143.1));
    ctx.bezierCurveTo(svgX(102.3),svgY(153.9), svgX(95.1), svgY(157.9), svgX(86.7), svgY(157.9));
    ctx.bezierCurveTo(svgX(78.3), svgY(157.9), svgX(71.9), svgY(152.3), svgX(72.4), svgY(141.5));
    ctx.bezierCurveTo(svgX(72.9), svgY(130.7), svgX(80.6), svgY(123.5), svgX(88.5), svgY(123.5));
    ctx.bezierCurveTo(svgX(96.4), svgY(123.5), svgX(103.3),svgY(132.3), svgX(102.8),svgY(143.1));
    ctx.closePath(); ctx.fill();
    // Right dark socket
    ctx.beginPath();
    ctx.moveTo(svgX(183.6), svgY(141.5));
    ctx.bezierCurveTo(svgX(184.1),svgY(152.3), svgX(177.7),svgY(157.9), svgX(169.3),svgY(157.9));
    ctx.bezierCurveTo(svgX(160.9),svgY(157.9), svgX(153.7),svgY(154.0), svgX(153.2),svgY(143.1));
    ctx.bezierCurveTo(svgX(152.7),svgY(132.3), svgX(159.1),svgY(123.9), svgX(167.5),svgY(123.9));
    ctx.bezierCurveTo(svgX(175.9),svgY(123.9), svgX(183.1),svgY(130.6), svgX(183.6),svgY(141.5));
    ctx.closePath(); ctx.fill();
    // Iris gradient
    function makeIrisGrad(icx, icy) {
      var g = ctx.createRadialGradient(icx, icy - 3*SC, 0, icx, icy + 2*SC, 17*SC);
      g.addColorStop(0,    '#FF6600');
      g.addColorStop(0.5,  '#FF4500');
      g.addColorStop(1,    '#D4301F');
      return g;
    }
    // Left iris
    ctx.fillStyle = makeIrisGrad(svgX(87.8), svgY(141.5));
    ctx.beginPath();
    ctx.moveTo(svgX(102.8), svgY(144.1));
    ctx.bezierCurveTo(svgX(102.3),svgY(154.2), svgX(95.6), svgY(157.9), svgX(87.8), svgY(157.9));
    ctx.bezierCurveTo(svgX(80.0), svgY(157.9), svgX(74.5), svgY(152.4), svgX(74.5), svgY(142.2));
    ctx.bezierCurveTo(svgX(75.0), svgY(132.1), svgX(81.7), svgY(125.4), svgX(89.5), svgY(125.4));
    ctx.bezierCurveTo(svgX(97.3), svgY(125.4), svgX(103.3),svgY(133.9), svgX(102.8),svgY(144.1));
    ctx.closePath(); ctx.fill();
    // Right iris
    ctx.fillStyle = makeIrisGrad(svgX(168.3), svgY(141.5));
    ctx.beginPath();
    ctx.moveTo(svgX(153.3), svgY(144.1));
    ctx.bezierCurveTo(svgX(153.8),svgY(154.2), svgX(160.5),svgY(157.9), svgX(168.3),svgY(157.9));
    ctx.bezierCurveTo(svgX(176.1),svgY(157.9), svgX(182.1),svgY(152.4), svgX(181.7),svgY(142.2));
    ctx.bezierCurveTo(svgX(181.2),svgY(132.1), svgX(174.5),svgY(125.4), svgX(166.7),svgY(125.4));
    ctx.bezierCurveTo(svgX(158.9),svgY(125.4), svgX(152.8),svgY(133.9), svgX(153.3),svgY(144.1));
    ctx.closePath(); ctx.fill();
    // Pupil shine
    ctx.fillStyle = '#FF6101';
    ctx.beginPath(); ctx.ellipse(svgX(88.0),  svgY(149.1), 9.3*SC, 7.1*SC, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(svgX(168.2), svgY(149.1), 9.3*SC, 7.1*SC, 0, 0, Math.PI*2); ctx.fill();
    // Catchlights
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(svgX(82),  svgY(132), 4.8*SC, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(svgX(162), svgY(132), 4.8*SC, 0, Math.PI*2); ctx.fill();
    // Nose dots
    ctx.fillStyle = '#FFC49C';
    ctx.beginPath(); ctx.ellipse(svgX(94.4), svgY(134.8), 3.3*SC, 3.6*SC, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(svgX(173.3),svgY(134.8), 3.3*SC, 3.6*SC, 0, 0, Math.PI*2); ctx.fill();
    // Mouth
    function smilePath(topSvgY, botSvgY, halfWSvg) {
      var tx=svgX(128.1), ty=svgY(topSvgY);
      var hw=halfWSvg*SC, depth=(botSvgY-topSvgY)*SC;
      ctx.beginPath();
      ctx.moveTo(tx-hw, ty); ctx.lineTo(tx+hw, ty);
      ctx.bezierCurveTo(tx+hw, ty+depth*0.4, tx+hw*0.80, ty+depth, tx, ty+depth);
      ctx.bezierCurveTo(tx-hw*0.80, ty+depth, tx-hw, ty+depth*0.4, tx-hw, ty);
      ctx.closePath();
    }
    ctx.fillStyle='#BBCFDA'; smilePath(165.1,186.0,30.1); ctx.fill();
    ctx.fillStyle='#FFFFFF';  smilePath(167.5,190.1,30.0); ctx.fill();
    var mG=ctx.createRadialGradient(svgX(128.1),svgY(175),0,svgX(128.1),svgY(166),21*SC);
    mG.addColorStop(0,'#172E35'); mG.addColorStop(0.73,'#030708'); mG.addColorStop(1,'#000000');
    ctx.fillStyle=mG; smilePath(166.2,187.2,29.5); ctx.fill();
  }

  // Antenna — SVG-accurate filled stem + orb
  var orbX = svgX(174.8), orbY = svgY(55.5), orbR = 21.2*SC;
  ctx.fillStyle = makeSnooGrad(orbX, orbY, orbR);
  ctx.beginPath(); ctx.arc(orbX, orbY, orbR, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#172E35';
  ctx.beginPath();
  ctx.moveTo(svgX(127.8), svgY(88));
  ctx.bezierCurveTo(svgX(127.8), svgY(69), svgX(143.2), svgY(53.6), svgX(162.2), svgY(53.6));
  ctx.bezierCurveTo(svgX(164.7), svgY(53.6), svgX(166.8), svgY(55.7), svgX(166.8), svgY(58.2));
  ctx.bezierCurveTo(svgX(166.8), svgY(60.7), svgX(164.7), svgY(62.8), svgX(162.2), svgY(62.8));
  ctx.bezierCurveTo(svgX(148.3), svgY(62.8), svgX(137.0), svgY(74.1), svgX(137.0), svgY(88.0));
  ctx.bezierCurveTo(svgX(132.4), svgY(87.0), svgX(130.3), svgY(88.0), svgX(127.8), svgY(88.0));
  ctx.closePath(); ctx.fill();
  // Head-top patch to blend stem base
  ctx.save();
  ctx.beginPath(); ctx.ellipse(hCX, hCY2, hRx, hRy, 0, 0, Math.PI*2); ctx.clip();
  ctx.fillStyle = makeSnooGrad(hCX, hCY2, Math.max(hRx, hRy));
  ctx.fillRect(hCX - hRx*0.55, hCY2 - hRy*1.05, hRx*1.1, hRy*0.22);
  ctx.restore();

  ctx.restore();
}


// blendWet — used each frame by the tier1/compost gradient to mix dry/enriched/wet colours.
// Lifted to module scope (was re-declared inside draw() every frame — wasteful).
// Call: blendWet(e, mw, dryR,dryG,dryB, enrichR,enrichG,enrichB, wetR,wetG,wetB)
function blendWet(e, mw, dr,dg,db, er,eg,eb, wr,wg,wb) {
  var r = Math.round((dr+(er-dr)*e)*(1-mw) + wr*mw);
  var g = Math.round((dg+(eg-dg)*e)*(1-mw) + wg*mw);
  var b = Math.round((db+(eb-db)*e)*(1-mw) + wb*mw);
  return '#'+('0'+r.toString(16)).slice(-2)+('0'+g.toString(16)).slice(-2)+('0'+b.toString(16)).slice(-2);
}

// ── Cached soil-gradient colour stops ────────────────────────────────────────
// blendWet is called 4× per frame for the tier gradient. Cache the 4 stops and
// only recompute when castingEnrichment or _moisture changes by more than 0.005.
var _soilGradCache = null;
var _soilGradE  = -1;
var _soilGradMW = -1;
function getSoilGradStops(e, mw) {
  if (_soilGradCache && Math.abs(e - _soilGradE) < 0.005 && Math.abs(mw - _soilGradMW) < 0.005) {
    return _soilGradCache;
  }
  _soilGradE  = e;
  _soilGradMW = mw;
  _soilGradCache = [
    blendWet(e,mw, 0x7a,0x55,0x35, 0x4a,0x28,0x10, 0x38,0x44,0x2a),
    blendWet(e,mw, 0x6a,0x48,0x28, 0x38,0x1a,0x08, 0x2c,0x3a,0x24),
    blendWet(e,mw, 0x4a,0x2c,0x10, 0x22,0x10,0x04, 0x1e,0x2e,0x1c),
    blendWet(e,mw, 0x2a,0x16,0x00, 0x10,0x08,0x00, 0x12,0x20,0x14)
  ];
  return _soilGradCache;
}

function lerpCol(a, c, t) {
  function h(s,i){ return parseInt(s.slice(i,i+2),16); }
  var r  = Math.round(h(a,1) + (h(c,1)-h(a,1))*t);
  var g  = Math.round(h(a,3) + (h(c,3)-h(a,3))*t);
  var bl = Math.round(h(a,5) + (h(c,5)-h(a,5))*t);
  return '#'+('0'+r.toString(16)).slice(-2)
           +('0'+g.toString(16)).slice(-2)
           +('0'+bl.toString(16)).slice(-2);
}
function skyCol(t) {
  // Returns [topHex, bottomHex]. t: 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk
  var u;
  if (t < 0.18) return ['#05080f','#0a1020'];
  if (t < 0.25) { u=(t-0.18)/0.07; return [lerpCol('#05080f','#1a1030',u),lerpCol('#0a1020','#2a1840',u)]; }
  if (t < 0.32) { u=(t-0.25)/0.07; return [lerpCol('#1a1030','#ff7040',u),lerpCol('#2a1840','#ffb060',u)]; }
  if (t < 0.42) { u=(t-0.32)/0.10; return [lerpCol('#ff7040','#5ab4e8',u),lerpCol('#ffb060','#a8d8f0',u)]; }
  if (t < 0.58) return ['#4aa8e8','#87ceeb'];
  if (t < 0.68) { u=(t-0.58)/0.10; return [lerpCol('#4aa8e8','#e87830',u),lerpCol('#87ceeb','#f0b060',u)]; }
  if (t < 0.75) { u=(t-0.68)/0.07; return [lerpCol('#e87830','#1a1030',u),lerpCol('#f0b060','#2e1848',u)]; }
  return ['#05080f','#0a1020'];
}

// Star positions — hoisted to module scope so the array is never reallocated each frame.
// Fractions of (W, skyHeight) — multiplied in the draw loop.
var _starPos = [
  [0.08,0.06],[0.19,0.14],[0.32,0.04],[0.45,0.11],[0.58,0.07],[0.71,0.03],
  [0.83,0.09],[0.91,0.16],[0.13,0.22],[0.27,0.19],[0.52,0.24],[0.66,0.18],
  [0.79,0.20],[0.38,0.28],[0.61,0.31],[0.88,0.27],[0.05,0.30],[0.95,0.12]
];

// Reusable scratch array for clog-clip segment point building — avoids per-point allocation.
var _segPtsScratch = [];

function draw() {
  if (_NODRAW) { ctx.clearRect(0, 0, W, H); return; }
  if (!W || !H) return;
  ctx.clearRect(0, 0, W, H);
  // centreOffsetX: on wide screens, shift world right so bin is centred.
  // This keeps camX always >= 0 (correct for mouse coords), while centering visually.
  centreOffsetX = W > WORLD_W ? Math.floor((W - WORLD_W) / 2) : 0;
  // Shift entire world by centreOffsetX - camX so worm stays horizontally centered
  ctx.save();
  ctx.translate(centreOffsetX - camX, 0);
  var b = getBinCached();

  // Compute pile top Y once — used by airspace, soil fill, blanket, bugs.
  // Smoothed with a lerp so frame-to-frame nibble changes don't cause flicker.
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

  // ── Time-of-day sky — fills ENTIRE canvas as base layer ─────────────────
  // Horizon is fixed at world y = cSurf() (the sump line) in screen space.
  // Above it: sky. Below it: ground/soil. This stays consistent at all scroll depths.
  var lidScreenY  = H * 0.5 - camY;
  var horizScreenY = cSurf() - camY;   // sump line in screen space — the true horizon
  var skyCols = skyCol(dayTime);

  var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  // Sky fills everything above the horizon
  var hf = horizScreenY / H; // horizon fraction (can be <0 or >1 when scrolled)
  skyGrad.addColorStop(0, skyCols[0]);
  if (hf > 0.01 && hf < 0.99) {
    skyGrad.addColorStop(Math.min(0.98, hf - 0.02), skyCols[1]);
    skyGrad.addColorStop(Math.min(0.99, hf),         '#6b4c28'); // horizon glow
    skyGrad.addColorStop(Math.min(1.0,  hf + 0.06),  '#3a2810'); // soil just below
  } else if (hf <= 0.01) {
    // Scrolled so deep horizon is above screen — all ground
    skyGrad.addColorStop(0,   '#3a2810');
  } else {
    // Horizon is below screen — all sky
    skyGrad.addColorStop(0.98, skyCols[1]);
  }
  skyGrad.addColorStop(1, '#2a1e0c');
  ctx.fillStyle = skyGrad;
  // Start at -centreOffsetX (left edge of canvas in translated world space) and span W.
  ctx.fillRect(-centreOffsetX, 0, WORLD_W, H);

  // Sun/Moon are clipped to above the lid only
  var skyHeight = Math.max(0, lidScreenY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, Math.max(1, skyHeight));
  ctx.clip();

  // Stars (night only)
  var starAlpha = dayTime < 0.22 ? 1 : dayTime < 0.30 ? 1-(dayTime-0.22)/0.08
                : dayTime > 0.78 ? 1 : dayTime > 0.70 ? (dayTime-0.70)/0.08 : 0;
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

  // Sun / Moon — arc relative to the true horizon (world cSurf() = sump line)
  var isDay = dayTime >= 0.25 && dayTime <= 0.75;
  if (isDay) {
    var sunT = (dayTime - 0.25) / 0.50; // 0=rise, 0.5=noon, 1=set
    var sunX = WORLD_W * (0.15 + sunT * 0.70);
    // Rises from and sets at horizScreenY, peaks high above
    var sunY = horizScreenY - Math.sin(sunT * Math.PI) * H * 1.2;
    if (sunY < H + 30 && sunY > -80) {
      var sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 80);
      var sunBright = sunT < 0.1 || sunT > 0.9 ? 0.4 : 0.25;
      sunGlow.addColorStop(0, 'rgba(255,230,100,'+sunBright+')');
      sunGlow.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath(); ctx.arc(sunX, sunY, 80, 0, Math.PI*2); ctx.fill();
      var sunCol = sunT < 0.15 || sunT > 0.85 ? '#ff8030' : sunT < 0.3 || sunT > 0.7 ? '#ffbb40' : '#fff7a0';
      ctx.fillStyle = sunCol;
      ctx.beginPath(); ctx.arc(sunX, sunY, 18, 0, Math.PI*2); ctx.fill();
      var rayAlpha = Math.max(0, Math.min(1, (Math.sin(sunT*Math.PI) - 0.3) * 1.8));
      if (rayAlpha > 0.05) {
        ctx.globalAlpha = rayAlpha * 0.5;
        ctx.strokeStyle = sunCol; ctx.lineWidth = 1.5;
        for (var ri = 0; ri < 8; ri++) {
          var ra = ri * Math.PI/4 + frame*0.004;
          ctx.beginPath();
          ctx.moveTo(sunX + Math.cos(ra)*22, sunY + Math.sin(ra)*22);
          ctx.lineTo(sunX + Math.cos(ra)*36, sunY + Math.sin(ra)*36);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
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

  ctx.restore(); // end sun/moon clip

  // ── Background ground plane — drawn right after sky, before the bin ────
  // Horizon at world cSurf(). Ground fills from horizScreenY to canvas bottom, full width.
  // NOTE: the base green fill is UNCONDITIONAL — when camY <= 2*H the horizon is
  // off the bottom of the screen (horizScreenY >= H) but the sky gradient's final
  // stop is dark brown (#2a1e0c), which would bleed through below the bin without
  // this fill. gTop = max(0, horizScreenY) safely clamps to 0 when horizon is
  // above the screen top, and to H when it is off the bottom (fillRect with H-H=0
  // draws nothing in that case — but we still need the fill for the onscreen portion).
  {
    var gTop = Math.max(0, Math.min(H, horizScreenY));
    var gH = H - gTop;
    if (gH > 0) {
      ctx.fillStyle = '#3a8018';
      ctx.fillRect(-centreOffsetX, gTop, WORLD_W, gH);
    }

    // Scatter static grass tufts — world Y converted to screen (only when near horizon)
    if (horizScreenY > -10 && horizScreenY < H + 60) {
      for (var ti2 = 0; ti2 < gardenTufts.length; ti2++) {
        var gt = gardenTufts[ti2];
        var tx2 = gt.xf * WORLD_W;
        var ty2 = gt.wy - camY;
        if (ty2 < -10 || ty2 > H + 10) continue;
        ctx.fillStyle = gt.col;
        ctx.globalAlpha = gt.alpha;
        ctx.beginPath();
        ctx.moveTo(tx2,          ty2);
        ctx.lineTo(tx2 + gt.w,   ty2);
        ctx.lineTo(tx2 + gt.w/2 + gt.lean, ty2 - gt.h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // PERF-3: Blade fringe — single drawImage instead of 1,788 per-frame canvas calls.
    // _bladeCanvas is WORLD_W × 20px, blades drawn at base (y=20). Stamp at horizScreenY - 20
    // so the blade bases sit exactly on the horizon line.
    if (horizScreenY > -20 && horizScreenY < H && _bladeCanvas) {
      ctx.drawImage(_bladeCanvas, 0, horizScreenY - 20);
    }

    // Static pre-generated flowers — world Y converted to screen (only when near horizon)
    if (horizScreenY > -10 && horizScreenY < H + 60) {
      for (var fi = 0; fi < gardenFlowers.length; fi++) {
        var fd = gardenFlowers[fi];
        var fx2 = fd.xf * WORLD_W;
        var fy2 = fd.wy - camY;
        if (fy2 < -20 || fy2 > H + 20) continue;
        ctx.strokeStyle = '#3a7818'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.save();
        ctx.translate(fx2, fy2);
        ctx.rotate(fd.lean);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -fd.h); ctx.stroke();
        ctx.fillStyle = fd.pCol;
        for (var pi3 = 0; pi3 < fd.nPet; pi3++) {
          var pa = pi3 * Math.PI * 2 / fd.nPet;
          ctx.beginPath();
          ctx.ellipse(Math.cos(pa)*fd.petR*1.3, -fd.h + Math.sin(pa)*fd.petR*1.3, fd.petR, fd.petR*0.7, pa, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.fillStyle = fd.cCol;
        ctx.beginPath(); ctx.arc(0, -fd.h, fd.petR * 0.55, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // Tiers
  for (var i = 0; i < 4; i++) {
    var sy = i*H - camY;
    // For i===1 the combined tier 1+2 rect spans H..3*H — skip only if that full range is off screen
    var _skipBot = (i === 1) ? cSurf() + H*0.25 - camY : sy + H;
    if (sy > H+4 || _skipBot < -4) continue;

    // Tier 0 bg: only draw the lower half — lid seals the upper half
    if (i === 0) {
      var t0LidScreenY = H * 0.5 - camY;
      var t0DrawTop = Math.max(sy, t0LidScreenY);
      var t0DrawH = (sy + H) - t0DrawTop;
      if (t0DrawH > 0) {
        ctx.fillStyle = TIERS[i].bg;
        ctx.fillRect(b.cx-b.bw2, t0DrawTop, b.bw, t0DrawH);
      }
    } else if (i === 1) {
      // ── Tier 1 + compost — single seamless gradient from H to cSurf() ────────
      // One rect, no boundary between them, eliminates all flicker at the seam.
      var t12Top    = H - camY;
      var t12Bottom = cSurf() + H*0.25 - camY; // extend to include sump zone
      var t12VisTop    = Math.max(t12Top, -4);
      var t12VisBottom = Math.min(t12Bottom, H + 4);
      if (t12VisBottom > t12VisTop) {
        var e  = castingEnrichment;
        var mw = 0; // moisture removed (saturation gone)
        // Gradient spans tier1(H..2H) + compost(2H..cSurf()) + sump(cSurf()..cSurf()+0.25H).
        // Boundary fractions are computed from the LIVE geometry so the colour lines track
        // cSurf() (they used to be hardcoded for the old 3H sump and drifted when compost halved).
        var _gR = (cSurf() + 0.25*H) - H;   // world height the gradient covers
        var _fC = (2*H - H) / _gR;          // tier1 / compost colour boundary (world 2H)
        var _fS = (cSurf() - H) / _gR;      // compost / sump colour boundary (world cSurf())
        var t12Grad = ctx.createLinearGradient(0, t12Top, 0, t12Bottom);
        var _sgs = getSoilGradStops(e, mw);
        t12Grad.addColorStop(0,                        '#8b6340'); // tier 1 flat brown
        t12Grad.addColorStop(Math.max(0, _fC - 0.001), '#8b6340'); // hold to compost boundary
        t12Grad.addColorStop(_fC,                      _sgs[0]); // compost top
        t12Grad.addColorStop(_fC + (_fS - _fC) * 0.40, _sgs[1]);
        t12Grad.addColorStop(_fC + (_fS - _fC) * 0.75, _sgs[2]);
        t12Grad.addColorStop(Math.max(_fC, _fS - 0.001), _sgs[3]); // compost bottom
        t12Grad.addColorStop(_fS,                      '#2e3d58'); // sump top — blue
        t12Grad.addColorStop(_fS + (1 - _fS) * 0.5,    '#1e2a44');
        t12Grad.addColorStop(1,                        '#161f33'); // sump bottom
        ctx.fillStyle = t12Grad;
        ctx.fillRect(b.cx-b.bw2, t12VisTop, b.bw, t12VisBottom - t12VisTop);




      }
    } else if (i === 2 || i === 3) {
      // Covered by the tier 1 block above — skip
    } else {
      // Fallback for any other tier
      ctx.fillStyle = TIERS[i].bg;
      ctx.fillRect(b.cx-b.bw2, sy - 4, b.bw, H + 8);
    }

    // Tier 0 — rubbish bin interior
    if (i === 0) {
      // ── Find pile top ──────────────────────────────────────────────────────
      var emptyScreenY = drawPileTopY - camY; // screen-space pile top — shared value, no flicker
      var airTop = H * 0.5 - camY;         // lid bottom = airspace top
      var emptyH2 = Math.max(0, emptyScreenY - airTop);
      var pileScreenY = Math.max(airTop, emptyScreenY);
      var pileH = Math.max(0, (sy + H - 1) - pileScreenY);

      // ── Empty airspace — bin interior walls (same blue as the container) ──
      if (emptyH2 > 0) {
        var airGrad = ctx.createLinearGradient(0, airTop, 0, pileScreenY);
        airGrad.addColorStop(0,   '#4a5a7a'); // lighter at top (lid gap light)
        airGrad.addColorStop(0.35,'#3a4a6a'); // main bin-wall blue
        airGrad.addColorStop(1,   '#2e3d58'); // shadowed near pile
        ctx.fillStyle = airGrad;
        var airDrawH = Math.min(emptyH2, sy + H - airTop); // clamp to tier 0 bottom — no blue bleed into tier 1
        ctx.fillRect(b.cx-b.bw2, airTop, b.bw, airDrawH);

        // Moulded vertical panel lines on bin interior
        ctx.strokeStyle = 'rgba(90,110,150,0.28)';
        ctx.lineWidth = 1;
        var panelXs = [0.18, 0.36, 0.55, 0.73, 0.88];
        for (var pn = 0; pn < panelXs.length; pn++) {
          var px2 = b.cx - b.bw2 + 4 + panelXs[pn] * (b.bw - 8);
          ctx.beginPath(); ctx.moveTo(px2, airTop+2); ctx.lineTo(px2, pileScreenY-2); ctx.stroke();
        }

        // Horizontal mould seam lines
        ctx.strokeStyle = 'rgba(80,100,140,0.22)';
        var seamCount = Math.max(1, Math.floor(emptyH2 / 40));
        for (var sn = 1; sn <= seamCount; sn++) {
          var sny = airTop + (sn / (seamCount + 1)) * emptyH2;
          ctx.beginPath(); ctx.moveTo(b.cx-b.bw2+4, sny); ctx.lineTo(b.cx+b.bw2-4, sny); ctx.stroke();
        }

        // ── Bugs — dark bodies + pale wings pop against the blue ─────────────
        ctx.save();
        ctx.beginPath();
        ctx.rect(b.cx-b.bw2, airTop, b.bw, emptyH2);
        ctx.clip();
        for (var bi3 = 0; bi3 < bugs.length; bi3++) {
          var bug = bugs[bi3];
          var bsx = bug.px;
          var bsy2 = bug.py - camY;
          if (bsy2 < airTop+1 || bsy2 > airTop + emptyH2 - 1) continue;
          var wf = Math.sin(bug.wing) * 3;
          ctx.globalAlpha = bug.alpha;
          if (bug.type === 'midge') {
            // Wings: pale lines visible on blue bg
            ctx.strokeStyle = 'rgba(220,230,255,0.80)';
            ctx.lineWidth = 1;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(bsx, bsy2); ctx.lineTo(bsx - 4 - wf, bsy2 - 2.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bsx, bsy2); ctx.lineTo(bsx + 4 + wf, bsy2 - 2.5); ctx.stroke();
            // Dark body
            ctx.fillStyle = '#0e0c06';
            ctx.beginPath(); ctx.arc(bsx, bsy2, bug.sz * 1.1, 0, Math.PI*2); ctx.fill();
            // Tiny specular highlight
            ctx.fillStyle = 'rgba(255,255,200,0.55)';
            ctx.beginPath(); ctx.arc(bsx - 0.4, bsy2 - 0.5, bug.sz * 0.35, 0, Math.PI*2); ctx.fill();
          } else {
            // Gnat: motion trail + dark body
            ctx.strokeStyle = 'rgba(200,215,255,0.35)';
            ctx.lineWidth = 1;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(bsx - Math.cos(bug.phase)*4, bsy2 - Math.sin(bug.phase2)*3);
            ctx.lineTo(bsx, bsy2);
            ctx.stroke();
            ctx.fillStyle = '#0a0806';
            ctx.beginPath(); ctx.arc(bsx, bsy2, bug.sz * 0.9, 0, Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      // ── Pile zone — just a faint dark shadow at the very bottom, no solid fill ──
      // The trash chunks themselves provide the visual mass; a solid fill buries the worm
      if (pileH > 0 && emptyH2 > 0) {
        // Ragged surface silhouette — a thin dark fringe where air meets pile
        ctx.fillStyle = 'rgba(20,10,4,0.45)';
        ctx.beginPath();
        ctx.moveTo(b.cx-b.bw2, pileScreenY);
        var surfSteps = 18;
        for (var ps = 0; ps <= surfSteps; ps++) {
          var psx = b.cx - b.bw2 + 3 + ps * (b.bw - 6) / surfSteps;
          var bump = Math.sin(ps * 1.3) * 5 + Math.sin(ps * 2.7 + 1) * 3 + Math.sin(ps * 0.6 + 2) * 7;
          ctx.lineTo(psx, pileScreenY + bump + 12);
        }
        ctx.lineTo(b.cx+b.bw2, pileScreenY);
        ctx.closePath();
        ctx.fill();
      }

      if (scrapsEmpty) {
        ctx.fillStyle = 'rgba(200,60,20,0.85)';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SCRAPS EXHAUSTED', b.cx, sy+H/2-8);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255,200,100,0.85)';
        ctx.fillText('drain tea to refill!', b.cx, sy+H/2+10);
      }
    }

    // Tier 3 (sump zone) — drawn separately as the open sump chamber below the tier loop.
    // The old brown fill that used to live here was removed: it started at cSurf() (cSurf())
    // and painted a full-height #2a1800 rect that overwrote the grass behind the legs.

    // Tier 4 ? tea
    // Drainage holes — bottom of each tier except the last
    if (i < 3) {
      for (var h = 0; h < 8; h++) {
        var hx = b.cx-b.bw2+20 + h*(b.bw-40)/7;
        ctx.fillStyle = '#1a2535';
        ctx.beginPath();
        ctx.arc(hx, sy+H-4, 2.5, 0, Math.PI*2);
        ctx.fill();
      }
    }


  }

  // Tunnel paths — NPC trails first (behind), then the player's path on top
  if (window._demoMode) {
    for (var _npd = 0; _npd < otherPlayers.length; _npd++) {
      var _nopp = otherPlayers[_npd];
      if (_nopp.sim && !_nopp._dormant && _nopp.sim.path && _nopp.sim.path.length) drawPath(_nopp.sim.path);
    }
  }
  drawPath(pPath);

  // Clog deposits — stroked line clipped to its own tunnel segment so it can never
  // bleed outside the tube walls or past the segment endpoints.
  // Strategy per clogged point:
  //   1. Walk to the null boundaries to find the full segment.
  //   2. Build a clip region by stroking the segment polyline at lineWidth = r*2.6
  //      (same as the tunnel outer pass) into a Path2D, then ctx.clip() it.
  //   3. Draw the clog stroke — same lineWidth, growing length — inside that clip.
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  // Clog deposits render for EVERY registered path (player + NPC tubes).
  for (var _crpi = 0; !_NOCLOG && _crpi < pathRegistry.length; _crpi++) {
    var _CP = pathRegistry[_crpi];
  for (var _ci = 0; _ci < _CP.length; _ci++) {
    var _cp = _CP[_ci];
    if (!_cp || !_cp.clog || _cp.clog <= 0) continue;
    var _csy = _cp.y - camY;
    if (_csy < -20 || _csy > H + 20) continue;

    var _cr = _cp.r || 4;

    // PERF: clog stroke is a tube-width, round-capped capsule along the local
    // tunnel axis, so on straight/gently-curved runs it already sits inside the
    // tube. We skip the old per-point tube-outline clip (segment-boundary walk +
    // offset-polygon rebuild + ctx.clip()) which cost ~everything here and scaled
    // with poop count. Tradeoff: at very sharp bends a clog may bleed a few px.
    var _prevP = (_ci > 0 && _CP[_ci - 1]) ? _CP[_ci - 1] : null;
    var _nextP = (_ci < _CP.length - 1 && _CP[_ci + 1]) ? _CP[_ci + 1] : null;
    var _angle = Math.PI / 2;
    if (_prevP || _nextP) {
      var _dx = (_nextP ? _nextP.x : _cp.x) - (_prevP ? _prevP.x : _cp.x);
      var _dy = (_nextP ? _nextP.y : _cp.y) - (_prevP ? _prevP.y : _cp.y);
      if (_dx !== 0 || _dy !== 0) _angle = Math.atan2(_dy, _dx);
    }
    var _ax = Math.cos(_angle), _ay = Math.sin(_angle);
    var _halfLen = _cr * _cp.clog * 4;

    ctx.globalAlpha = Math.min(1, 0.55 + _cp.clog * 0.45);
    ctx.strokeStyle = '#2a1000';
    ctx.lineWidth   = _cr * 2.6;
    ctx.beginPath();
    ctx.moveTo(_cp.x - _ax * _halfLen, _csy - _ay * _halfLen);
    ctx.lineTo(_cp.x + _ax * _halfLen, _csy + _ay * _halfLen);
    ctx.stroke();

    if (_cp.clog > 0.2) {
      ctx.globalAlpha = Math.min(1, (_cp.clog - 0.2) * 0.7);
      ctx.strokeStyle = '#5a2800';
      ctx.lineWidth   = _cr * 1.4;
      ctx.beginPath();
      ctx.moveTo(_cp.x - _ax * _halfLen * 0.7, _csy - _ay * _halfLen * 0.7);
      ctx.lineTo(_cp.x + _ax * _halfLen * 0.7, _csy + _ay * _halfLen * 0.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  }

  // --- Tier 0 pile: dark soil fill + straw blanket, drawn before trash so items sit in it ---
  {
    var bkb = getBinCached();
    var bkT0Bot = H - camY;
    if (bkT0Bot > 0 && bkT0Bot < H * 2) {
      var bkPSY = drawPileTopY - camY;  // same value as airspace — no boundary mismatch
      var bkPH = bkT0Bot - bkPSY;
      if (bkPH > 0 && bkPSY < H) {
        // Straw blanket strips across the pile surface
        var bkSD = [
          // Original 14
          [0.08, 2,  0.22,-0.12,'#d4c87a',0.45],[0.18,-4, 0.28, 0.08,'#c8b858',0.38],
          [0.32, 1,  0.18, 0.18,'#e8e0b8',0.42],[0.41,-2, 0.24,-0.22,'#b0a050',0.34],
          [0.52, 3,  0.20, 0.14,'#d8d0a0',0.44],[0.60,-3, 0.26, 0.06,'#c0b060',0.36],
          [0.72, 2,  0.16,-0.16,'#e0d8b0',0.40],[0.82,-1, 0.22, 0.20,'#c8bc70',0.34],
          [0.12, 8,  0.30,-0.05,'#a89840',0.30],[0.44, 9, 0.20, 0.10,'#d0c888',0.32],
          [0.67, 7,  0.24,-0.08,'#b8aa58',0.30],[0.25, 5, 0.18, 0.15,'#e8e0c0',0.28],
          [0.88, 4,  0.14,-0.18,'#c0b868',0.34],[0.03, 6, 0.16, 0.09,'#d8d0a8',0.26],
          // Second batch
          [0.05, 3,  0.19,-0.10,'#e0d090',0.42],[0.15,-3, 0.25, 0.12,'#d4c070',0.36],
          [0.28, 2,  0.21, 0.20,'#c8b848',0.40],[0.38,-5, 0.17,-0.18,'#b8a840',0.32],
          [0.48, 4,  0.23, 0.09,'#e4dca8',0.43],[0.57,-2, 0.20, 0.05,'#ccc060',0.35],
          [0.65, 3,  0.18,-0.14,'#dcd4a0',0.41],[0.76,-1, 0.26, 0.22,'#c4b450',0.33],
          [0.85, 5,  0.15,-0.07,'#e8e0b0',0.38],[0.93, 2, 0.19, 0.11,'#d0c068',0.31],
          [0.10, 6,  0.28,-0.04,'#b0a038',0.28],[0.35, 4, 0.16, 0.13,'#dcd498',0.30],
          [0.55, 8,  0.22,-0.09,'#c0b048',0.29],[0.78, 3, 0.24, 0.17,'#e4dca0',0.32],
          // Third batch
          [0.02, 1,  0.20, 0.15,'#d8cc80',0.44],[0.13,-6, 0.27,-0.11,'#ccbc58',0.37],
          [0.22, 3,  0.16, 0.21,'#ece4b8',0.41],[0.34,-3, 0.23,-0.19,'#b4a448',0.33],
          [0.45, 2,  0.21, 0.08,'#d4cc98',0.43],[0.53,-4, 0.18, 0.04,'#c8b858',0.36],
          [0.62, 1,  0.25,-0.15,'#e0d8a8',0.40],[0.71,-2, 0.20, 0.23,'#bca84e',0.34],
          [0.80, 6,  0.17,-0.08,'#e4dcb0',0.39],[0.90, 3, 0.21, 0.10,'#ccc468',0.31],
          [0.07, 9,  0.29,-0.06,'#ac9c38',0.29],[0.42, 7, 0.15, 0.14,'#e0d89c',0.31],
          [0.70, 5,  0.23,-0.10,'#c4b44c',0.30],[0.96, 4, 0.18, 0.16,'#dcd49e',0.33]
        ];
        for (var bksi2 = 0; bksi2 < bkSD.length; bksi2++) {
          var bksd2 = bkSD[bksi2];
          var bksx2 = bkb.cx - bkb.bw2 + 4 + bksd2[0] * (bkb.bw - 8);
          var bksy2 = bkPSY + bksd2[1];
          var bkslen2 = bksd2[2] * (bkb.bw - 8);
          ctx.save();
          ctx.translate(bksx2, bksy2);
          ctx.rotate(bksd2[3]);
          ctx.globalAlpha = bksd2[5];
          ctx.strokeStyle = bksd2[4];
          ctx.lineWidth = 1.8 + (bksi2 % 3) * 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(bkslen2*0.3, -2, bkslen2*0.7, 2, bkslen2, 0);
          ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(b.cx - b.bw2, 0, b.bw, H);
  ctx.clip();
  // Draw order: back-to-front by depth, reserve before active within each depth
  var drawOrder = [5, 2, 4, 1, 3, 0];
  for (var doi = 0; doi < drawOrder.length; doi++) {
    var zPass = drawOrder[doi];
    for (var i = 0; i < trashChunks.length; i++) {
      var tc6 = trashChunks[i];
      if (tc6.gone) continue;
      if ((tc6.layer || 0) !== zPass) continue;
      var drawY = tc6.dropping ? tc6.dropY : tc6.y;
      var drawX = tc6.dropping ? (tc6.dropX !== undefined ? tc6.dropX : tc6.x) : tc6.x;
      var tcy = drawY - camY;
      if (tcy < -80 || tcy > H + 80) continue;
      var curR = tc6.sz;
      var depthY = tc6.dropping ? 0 : (tc6.depth || 0) * 3;
      // PERF-1: use pre-rendered offscreen canvas if available
      if (tc6.img && !tc6.dropping) {
        var pad6 = tc6._imgPad || Math.ceil(curR * 1.4) + 2;
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.translate(drawX, tcy + depthY);
        ctx.rotate(tc6.rot);
        ctx.drawImage(tc6.img, -pad6, -pad6, pad6 * 2, pad6 * 2);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        // Dropping chunk or not yet pre-rendered — fall back to live draw
        ctx.save();
        ctx.translate(drawX, tcy + depthY);
        ctx.rotate(tc6.rot);
        ctx.globalAlpha = 0.92;
        try {
          drawTrashChunk(ctx, tc6.t.name, curR, tc6.hpFrac);
        } catch(e) {
          ctx.restore();
          ctx.globalAlpha = 1;
          if (_ctxFilterSupported) ctx.filter = 'none';
          // Draw a fallback coloured circle so the game doesn't crash
          ctx.save();
          ctx.translate(tc6.x, tc6.y - camY);
          ctx.fillStyle = tc6.t.debrisCol || '#888';
          ctx.beginPath(); ctx.arc(0, 0, curR, 0, Math.PI*2); ctx.fill();
          ctx.restore();
          // Log once per type
          if (!window._dtcErr) window._dtcErr = {};
          if (!window._dtcErr[tc6.t.name]) {
            window._dtcErr[tc6.t.name] = true;
            console.error('drawTrashChunk error for', tc6.t.name, ':', e.message);
          }
          continue;
        }
        if (_ctxFilterSupported) ctx.filter = 'none';
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      if (!tc6.locked && tc6.hpFrac < 0.95) {
        var bw4 = curR * 2.4;
        var pad6hp = Math.ceil(curR * 1.4) + 2; // matches prerender pad
        var barY = tcy + depthY - pad6hp - 5;   // 5px above the image top
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(tc6.x - bw4/2, barY, bw4, 4);
        ctx.fillStyle = tc6.hpFrac > 0.5 ? '#60d840' : tc6.hpFrac > 0.25 ? '#f0c020' : '#f02010';
        ctx.fillRect(tc6.x - bw4/2, barY, bw4 * tc6.hpFrac, 4);
        ctx.globalAlpha = 1;
      }
      // Eating glow — active layer only
      if (!tc6.locked && tc6.being_eaten) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = 'rgba(255,220,80,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(tc6.x, tcy + depthY, curR * 1.15, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore(); // end bin-wall clip

  // --- Acid glow pass — pulsing stroke outline on acidic chunks, matched to shape ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.cx - b.bw2, 0, b.bw, H);
  ctx.clip();
  for (var i = 0; i < trashChunks.length; i++) {
    var tcg = trashChunks[i];
    if (tcg.gone) continue;
    if (tcg.t.name === 'egg_shell' && !tcg.locked) {
      var ePulse2 = 0.30 + Math.sin(frame * 0.03 + tcg.x * 0.05) * 0.15;
      var tcgY2 = tcg.y - camY;
      var dYg2 = (tcg.depth || 0) * 3;
      ctx.save();
      ctx.translate(tcg.x, tcgY2 + dYg2);
      ctx.rotate(tcg.rot);
      var r5 = tcg.sz;
      // Outer soft halo (wide, low alpha) — replaces shadowBlur
      ctx.strokeStyle = 'rgba(80,180,255,' + (ePulse2 * 0.35) + ')';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(0, 0, r5*0.72, r5*0.58, 0, 0, Math.PI*2);
      ctx.stroke();
      // Inner sharp stroke
      ctx.strokeStyle = 'rgba(80,180,255,' + ePulse2 + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r5*0.72, r5*0.58, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    if (!tcg.t.acid || tcg.locked) continue;
    var tcgy = tcg.y - camY;
    if (tcgy < -80 || tcgy > H + 80) continue;
    var depthYg = (tcg.depth || 0) * 3;
    var pulse = 0.35 + Math.sin(frame * 0.035 + tcg.x * 0.05) * 0.20;
    var acidStr = tcg.t.acid;
    var gr = 255;
    var gg = Math.round(180 - acidStr * 180);
    ctx.save();
    ctx.translate(tcg.x, tcgy + depthYg);
    ctx.rotate(tcg.rot);
    var r2 = tcg.sz;
    // Outer halo stroke — replaces shadowBlur
    ctx.strokeStyle = 'rgba('+gr+','+gg+',0,' + (pulse * 0.30) + ')';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    switch (tcg.t.name) {
      case 'apple_core':
        ctx.ellipse(0, 0, r2*0.42, r2*0.95, 0, 0, Math.PI*2);
        break;
      case 'orange_peel':
        ctx.moveTo(-r2*0.85, -r2*0.3);
        ctx.bezierCurveTo(-r2*0.7, -r2*1.0, r2*0.4, -r2*0.9, r2*0.85, -r2*0.2);
        ctx.bezierCurveTo(r2*0.7, r2*0.5, -r2*0.2, r2*0.8, -r2*0.55, r2*0.7);
        ctx.bezierCurveTo(-r2*0.9, r2*0.55, -r2*1.0, r2*0.2, -r2*0.85, -r2*0.3);
        ctx.closePath();
        break;
      case 'overripe_fruit':
        ctx.beginPath();
        ctx.moveTo(-r2*0.1, -r2*0.88);
        ctx.bezierCurveTo(r2*0.65, -r2*0.8, r2*0.92, -r2*0.1, r2*0.85, r2*0.5);
        ctx.bezierCurveTo(r2*0.7, r2*0.92, -r2*0.4, r2*0.88, -r2*0.82, r2*0.55);
        ctx.bezierCurveTo(-r2*1.0, r2*0.1, -r2*0.75, -r2*0.62, -r2*0.1, -r2*0.88);
        ctx.closePath();
        break;
      case 'fish_bone':
        // Spine line
        ctx.moveTo(-r2*0.92, 0); ctx.lineTo(r2*0.82, 0);
        ctx.stroke();
        // Tail fan outline
        ctx.beginPath();
        ctx.moveTo(r2*0.82, 0);
        ctx.lineTo(r2*1.05, -r2*0.38);
        ctx.lineTo(r2*0.88, 0);
        ctx.lineTo(r2*1.05, r2*0.38);
        ctx.closePath();
        ctx.stroke();
        // Head circle
        ctx.beginPath();
        ctx.arc(-r2*0.82, 0, r2*0.28, 0, Math.PI*2);
        ctx.stroke();
        break;
      case 'whole_tomato':
        ctx.arc(0, 0, r2*0.82, 0, Math.PI*2);
        break;
      default:
        ctx.arc(0, 0, r2*0.9, 0, Math.PI*2);
    }
    // Halo pass (already set lineWidth=8, low alpha)
    if (tcg.t.name !== 'fish_bone') ctx.stroke();
    // Sharp inner stroke
    ctx.strokeStyle = 'rgba('+gr+','+gg+',0,' + pulse + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    switch (tcg.t.name) {
      case 'apple_core':    ctx.ellipse(0, 0, r2*0.42, r2*0.95, 0, 0, Math.PI*2); break;
      case 'orange_peel':
        ctx.moveTo(-r2*0.85, -r2*0.3);
        ctx.bezierCurveTo(-r2*0.7, -r2*1.0, r2*0.4, -r2*0.9, r2*0.85, -r2*0.2);
        ctx.bezierCurveTo(r2*0.7, r2*0.5, -r2*0.2, r2*0.8, -r2*0.55, r2*0.7);
        ctx.bezierCurveTo(-r2*0.9, r2*0.55, -r2*1.0, r2*0.2, -r2*0.85, -r2*0.3);
        ctx.closePath(); break;
      case 'overripe_fruit':
        ctx.moveTo(-r2*0.1, -r2*0.88);
        ctx.bezierCurveTo(r2*0.65, -r2*0.8, r2*0.92, -r2*0.1, r2*0.85, r2*0.5);
        ctx.bezierCurveTo(r2*0.7, r2*0.92, -r2*0.4, r2*0.88, -r2*0.82, r2*0.55);
        ctx.bezierCurveTo(-r2*1.0, r2*0.1, -r2*0.75, -r2*0.62, -r2*0.1, -r2*0.88);
        ctx.closePath(); break;
      case 'fish_bone':
        ctx.moveTo(-r2*0.92, 0); ctx.lineTo(r2*0.82, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r2*0.82, 0); ctx.lineTo(r2*1.05, -r2*0.38);
        ctx.lineTo(r2*0.88, 0); ctx.lineTo(r2*1.05, r2*0.38); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(-r2*0.82, 0, r2*0.28, 0, Math.PI*2); break;
      case 'whole_tomato': ctx.arc(0, 0, r2*0.82, 0, Math.PI*2); break;
      default:             ctx.arc(0, 0, r2*0.9, 0, Math.PI*2);
    }
    if (tcg.t.name !== 'fish_bone') ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // --- Draw debris particles falling from tier 0 ---
  for (var i = 0; i < debris.length; i++) {
    var db = debris[i];
    if (!db.active) continue;
    var dby = db.y - camY;
    if (dby < -40 || dby > H + 40) continue;
    ctx.save();
    ctx.translate(db.x, dby);
    ctx.rotate(db.rot);
    ctx.globalAlpha = 0.92;
    drawDebrisFragment(ctx, db.name || 'default', db.sz, db.col, db.col2 || db.col);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // --- Draw tier-1 scraps (settled debris, small fragments) ---
  for (var i = 0; i < scraps.length; i++) {
    var s = scraps[i];
    if (s.eaten || s.ti !== 1) continue;
    var scy = s.y - camY;
    if (scy < -20 || scy > H + 20) continue;
    var sRot = s.rot || 0;
    ctx.save();
    ctx.translate(s.x, scy);
    // PERF-4: skip rotate() for settled scraps with near-zero rotation — saves a matrix multiply
    if (Math.abs(sRot) > 0.02) ctx.rotate(sRot);
    ctx.globalAlpha = (s.alpha != null ? s.alpha : 1.0) * 0.78;
    drawDebrisFragment(ctx, s.name || s.t.name || 'default', s.sz, s.col || s.t.debrisCol, s.col2 || s.t.debrisCol2 || s.col);
    if (s.eating) {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = 'rgba(255,220,80,0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 0, s.sz * 1.5, 0, Math.PI*2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Open sump chamber — drawn BEFORE drops so tea drops fall visibly into it ──
  // Sump bg is now part of the combined tier1+compost+sump gradient rect — no separate fill needed.
  var sumpTop    = cSurf() - camY;
  var sumpBottom = cSurf() + H*0.25 - camY;
  if (sumpBottom > -10 && sumpTop < H + 10) {
    var sumpDrawTop = Math.max(sumpTop, -4);
    var sumpDrawH   = Math.min(sumpBottom, H+4) - sumpDrawTop;
    if (sumpDrawH > 0) {

      // Moisture sheen on walls
      ctx.strokeStyle = 'rgba(80,120,180,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.cx-b.bw2+3, sumpDrawTop); ctx.lineTo(b.cx-b.bw2+3, sumpDrawTop+sumpDrawH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.cx+b.bw2-3, sumpDrawTop); ctx.lineTo(b.cx+b.bw2-3, sumpDrawTop+sumpDrawH); ctx.stroke();

      // Worm tea — fills from the floor upward
      // Empty sump - faint bottom sheen
      var puddle = ctx.createRadialGradient(b.cx, sumpBottom-8, 4, b.cx, sumpBottom-8, b.bw2*0.6);
      puddle.addColorStop(0,   'rgba(100,160,200,0.15)');
      puddle.addColorStop(1,   'rgba(100,160,200,0)');
      ctx.fillStyle = puddle;
      ctx.fillRect(b.cx-b.bw2, sumpBottom-30, b.bw, 30);


    }
  }

  // Drops — drawn AFTER sump so they're visible falling into it.
  for (var i = 0; i < drops.length; i++) {
    var dp = drops[i];
    if (!dp.active) continue;
    var dpy = dp.y - camY;
    if (dpy < -10 || dpy > H+10) continue;
    ctx.fillStyle = dp.isPoop ? '#1e0e00' : '#d4aa10';
    ctx.globalAlpha = dp.isPoop ? 1.0 : 0.9;
    ctx.beginPath();
    ctx.arc(dp.x, dpy, dp.sz, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }




  // ── Vermicompost bin lid ──────────────────────────────────────────────────
  // Lid sits at world y = H*0.5 (halfway into tier 0, right above the rubbish heap).
  // This means at game start (camY=H*0.5) the lid appears at screen y=0 — immediately visible.
  var coverY = H * 0.5 - camY;  // world y=H/2 in screen space
  var cw = b.bw + 30;
  var lidH = 22;
  var lidRimH = 10;
  var lidY = coverY;

  if (lidY > -H && lidY < H + 40) {

    // ── Lid underside rim (the part that grips inside the bin opening) ─────
    {
      ctx.fillStyle = '#2a3650';
      ctx.fillRect(b.cx-b.bw2+2, lidY, b.bw-4, lidRimH);
    }

    // ── Main lid slab — rotates around right edge hinge (back of bin) ────────
    // Slightly domed — taller in the middle using a gradient fake
    var lidTop = lidY - lidH;
    ctx.save();
    // Hinge at right edge — lid swings up and to the left (Snoo lifts from front-left)
    ctx.translate(b.cx + cw/2, lidTop);
    ctx.translate(-(b.cx + cw/2), -lidTop);
    // Shadow underside of lid where it overhangs
    ctx.fillStyle = '#1e2a40';
    ctx.fillRect(b.cx-cw/2, lidY - 4, cw, 6);

    // Main lid body
    var lidGrad = ctx.createLinearGradient(0, lidTop, 0, lidY);
    lidGrad.addColorStop(0,   '#5a6e92');  // top edge — lighter (sky reflected)
    lidGrad.addColorStop(0.25,'#4a5e82');
    lidGrad.addColorStop(0.7, '#3a4a6a');  // main body colour
    lidGrad.addColorStop(1,   '#2e3d58');  // bottom — in shadow
    ctx.fillStyle = lidGrad;
    ctx.beginPath();
    ctx.roundRect(b.cx-cw/2, lidTop, cw, lidH, [4, 4, 2, 2]);
    ctx.fill();

    // Lid top edge highlight strip (catches sky light)
    ctx.fillStyle = '#6a7ea8';
    ctx.beginPath();
    ctx.roundRect(b.cx-cw/2+2, lidTop+1, cw-4, 4, 2);
    ctx.fill();

    // Ribbed texture — 4 moulded ribs across the lid surface
    ctx.strokeStyle = 'rgba(30,45,70,0.5)';
    ctx.lineWidth = 1.5;
    var ribXs = [0.22, 0.38, 0.62, 0.78];
    for (var ri = 0; ri < ribXs.length; ri++) {
      var rx2 = b.cx - cw/2 + ribXs[ri] * cw;
      ctx.beginPath();
      ctx.moveTo(rx2, lidTop + 5);
      ctx.lineTo(rx2, lidY - 5);
      ctx.stroke();
    }
    // Faint highlight on each rib left edge
    ctx.strokeStyle = 'rgba(100,125,175,0.25)';
    ctx.lineWidth = 1;
    for (var ri = 0; ri < ribXs.length; ri++) {
      var rx2 = b.cx - cw/2 + ribXs[ri] * cw - 1.5;
      ctx.beginPath();
      ctx.moveTo(rx2, lidTop + 5);
      ctx.lineTo(rx2, lidY - 5);
      ctx.stroke();
    }

    // ── Central raised handle ──────────────────────────────────────────────
    var hndY = lidTop - 12;
    // Handle base plate
    ctx.fillStyle = '#2a3848';
    ctx.beginPath(); ctx.roundRect(b.cx-36, hndY+2, 72, 14, 4); ctx.fill();
    // Handle arch body
    var hndGrad = ctx.createLinearGradient(0, hndY-8, 0, hndY+16);
    hndGrad.addColorStop(0, '#6a7ea8');
    hndGrad.addColorStop(1, '#3a4e6e');
    ctx.fillStyle = hndGrad;
    ctx.beginPath(); ctx.roundRect(b.cx-30, hndY-8, 60, 18, [8, 8, 3, 3]); ctx.fill();
    // Handle top shine
    ctx.fillStyle = 'rgba(180,200,240,0.35)';
    ctx.beginPath(); ctx.roundRect(b.cx-24, hndY-6, 48, 6, 3); ctx.fill();

    // ── Vent holes — 5 circular holes drilled in lid ───────────────────────
    // Real worm bins have ventilation holes in the lid
    var ventHoleXs = [
      b.cx - b.bw2*0.55, b.cx - b.bw2*0.25,
      b.cx,
      b.cx + b.bw2*0.25, b.cx + b.bw2*0.55
    ];
    var ventY = lidTop + lidH * 0.52;
    for (var vi2 = 0; vi2 < ventHoleXs.length; vi2++) {
      var vhx = ventHoleXs[vi2];
      // Hole recess shadow
      ctx.fillStyle = '#141e30';
      ctx.beginPath(); ctx.arc(vhx, ventY, 6, 0, Math.PI*2); ctx.fill();
      // Hole inner dark
      ctx.fillStyle = '#0a1020';
      ctx.beginPath(); ctx.arc(vhx, ventY, 4.5, 0, Math.PI*2); ctx.fill();
      // Hole rim highlight
      ctx.strokeStyle = 'rgba(100,130,180,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(vhx, ventY, 5.5, Math.PI*1.2, Math.PI*2.0); ctx.stroke();
      // Mesh texture hint — 2 cross lines inside hole
      ctx.strokeStyle = 'rgba(60,90,140,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(vhx-3.5, ventY); ctx.lineTo(vhx+3.5, ventY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(vhx, ventY-3.5); ctx.lineTo(vhx, ventY+3.5); ctx.stroke();
    }

    // ── Hinge strip at back edge (top of lid) ────────────────────────────
    ctx.fillStyle = '#1e2a3e';
    ctx.fillRect(b.cx-b.bw2*0.7, lidTop, b.bw*0.6, 5);
    // Two hinge barrels
    for (var hi2 = 0; hi2 < 2; hi2++) {
      var hx2 = b.cx + (hi2===0?-1:1)*b.bw2*0.32;
      ctx.fillStyle = '#384e6e';
      ctx.beginPath(); ctx.arc(hx2, lidTop+2, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#4a6080';
      ctx.beginPath(); ctx.arc(hx2, lidTop+2, 3.5, 0, Math.PI*2); ctx.fill();
      // Hinge pin
      ctx.fillStyle = '#8898b0';
      ctx.beginPath(); ctx.arc(hx2, lidTop+2, 1.5, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore(); // end lid rotation

    // ── Outer side walls of bin visible just below lid ─────────────────────
    // Thick plastic lip where lid meets bin top
    ctx.fillStyle = '#3a4a6a';
    ctx.fillRect(b.cx-cw/2-3, lidY, 8, 18);
    ctx.fillRect(b.cx+cw/2-5, lidY, 8, 18);
    // Lip highlight
    ctx.fillStyle = '#5a6a8a';
    ctx.fillRect(b.cx-cw/2-1, lidY+1, 4, 14);
    ctx.fillRect(b.cx+cw/2-2, lidY+1, 4, 14);
  }
  // Side wall strips — lid down to bin floor only (sky visible below floor / between legs)
  var wallTop2 = Math.max(0, H * 0.5 - camY);
  var wallBot2 = cSurf() + H*0.25 - camY + 6; // bin floor
  if (wallBot2 > wallTop2 && wallBot2 > 0 && wallTop2 < H) {
    var wDraw = Math.min(wallBot2, H) - Math.max(wallTop2, 0);
    if (wDraw > 0) {
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(b.cx-b.bw2-6, Math.max(wallTop2,0), 6, wDraw);
      ctx.fillRect(b.cx+b.bw2,   Math.max(wallTop2,0), 6, wDraw);
    }
  }

  var bsy = cSurf() + H*0.25 - camY;
  // Bin floor and legs
  if (bsy > -10 && bsy < H + 130) {
    // Bin base plate
    ctx.fillStyle = '#2e3d58';
    ctx.fillRect(b.cx-b.bw2-5, bsy-6, b.bw+10, 10);
    ctx.fillStyle = '#4a5e7a';
    ctx.fillRect(b.cx-b.bw2-5, bsy-6, b.bw+10, 3); // highlight top

    // ── Vermicomposter stand legs — slim, dark, cross-braced ─────────────────
    var sLegH   = 80;
    var sLegW   = 8;
    var sFootW  = 14;
    var sFootH  = 7;
    var sLegCol = '#1a1c26';
    var sLegHL  = '#2c3040';
    var sFootC  = '#0e0e14';

    var sLegXs = [
      b.cx - b.bw2 + 20,
      b.cx - b.bw2 + b.bw * 0.36,
      b.cx + b.bw2 - b.bw * 0.36,
      b.cx + b.bw2 - 20
    ];

    // Cross-brace horizontal rail (drawn behind legs)
    var xRailY2 = bsy + sLegH * 0.50;
    ctx.fillStyle = sLegCol;
    ctx.fillRect(sLegXs[0], xRailY2 - 3, sLegXs[3] - sLegXs[0], 6);
    ctx.fillStyle = sLegHL;
    ctx.fillRect(sLegXs[0], xRailY2 - 3, sLegXs[3] - sLegXs[0], 2);

    for (var li = 0; li < sLegXs.length; li++) {
      var slx = sLegXs[li] - sLegW / 2;
      var sFx  = sLegXs[li] - sFootW / 2;
      // Outer legs splay slightly outward
      var splay = (li === 0) ? -3 : (li === 3) ? 3 : 0;
      var lTop  = bsy + 4;
      var lBot  = bsy + sLegH - sFootH;

      // Leg body
      ctx.beginPath();
      ctx.moveTo(slx,              lTop);
      ctx.lineTo(slx + sLegW,      lTop);
      ctx.lineTo(slx + sLegW + splay, lBot);
      ctx.lineTo(slx + splay,         lBot);
      ctx.closePath();
      ctx.fillStyle = sLegCol;
      ctx.fill();

      // Highlight strip
      ctx.beginPath();
      ctx.moveTo(slx + 1,            lTop);
      ctx.lineTo(slx + 3,            lTop);
      ctx.lineTo(slx + 3 + splay,    lBot);
      ctx.lineTo(slx + 1 + splay,    lBot);
      ctx.closePath();
      ctx.fillStyle = sLegHL;
      ctx.fill();

      // Two grooves
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      for (var gr = 1; gr <= 2; gr++) {
        var gf = gr / 3;
        var ggy = lTop + (lBot - lTop) * gf;
        ctx.beginPath();
        ctx.moveTo(slx + splay * gf, ggy);
        ctx.lineTo(slx + sLegW + splay * gf, ggy);
        ctx.stroke();
      }

      // Rubber foot
      ctx.beginPath();
      ctx.roundRect(sFx + splay, lBot, sFootW, sFootH, [0,0,3,3]);
      ctx.fillStyle = sFootC;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sFx + 2 + splay, lBot + 1, sFootW - 4, 2);
    }

  }

  // Player worm — pass pure gen color; drawWorm handles acid and HP pale internally
  var wormCol = getGenColor(generation);
  drawWorm(pSegs, pSR, wormCol, pSleeping, pAcid, pHP);


  // ── Ghost worms — real players (lerp) or NPC sims (full seg chain) ────────
  if (otherPlayers.length) {
    ctx.save();
    var nowOP = Date.now();
    for (var op = 0; op < otherPlayers.length; op++) {
     try {
      var opp = otherPlayers[op];
      // Demo: only draw active simulated worms. Dormant (over-cap) or presence-only
      // entries have no live sim segments — drawing them hits the ghost/else branch,
      // so skip them outright. (No real human players exist in the demo.)
      if (window._demoMode && (!opp.sim || opp._dormant || !opp.sim.segs || !opp.sim.segs.length)) continue;
      var sim = opp.sim || null;
      var oppSR = opp.size || 5;

      // ── Build segment list ────────────────────────────────────────────────
      var ghostSegs;
      if (sim && sim.segs && sim.segs.length) {
        ghostSegs = sim.segs; // NPC: use real sim segment chain
      } else {
        // Real player: lerp toward target, build from history ring buffer
        opp.x = opp.x + ((opp.targetX || opp.x) - opp.x) * 0.08;
        opp.y = opp.y + ((opp.targetY || opp.y) - opp.y) * 0.08;
        if (!opp.hist) { opp.hist = []; for (var _hi = 0; _hi < 10; _hi++) opp.hist.push({x: opp.x, y: opp.y}); }
        opp.hist.push({x: opp.x, y: opp.y});
        if (opp.hist.length > 10) opp.hist.shift();
        var _nSeg = Math.max(4, oppSR - 1);
        ghostSegs = [];
        for (var _gi = 0; _gi < _nSeg; _gi++) {
          var _ghi = Math.max(0, opp.hist.length - 1 - Math.floor(_gi * opp.hist.length / _nSeg));
          ghostSegs.push({x: opp.hist[_ghi].x, y: opp.hist[_ghi].y});
        }
      }

      // Cull off-screen
      var headScreenY = ghostSegs[0].y - camY;
      if (headScreenY < -oppSR * 4 || headScreenY > H + oppSR * 4) continue;

      // Stale fade — NPCs never stale
      var _staleSec = sim ? 0 : (nowOP - (opp.lastSeen || nowOP)) / 1000;
      var _staleAlpha = _staleSec > 30 ? Math.max(0.1, 1 - (_staleSec - 30) / 60) : 1;

      // Gen colour + draw
      var oppGen = (sim ? sim.gen : 0) || 0;
      var oppCol = getGenColor(oppGen);
      var oppSleeping = sim ? sim.sleeping : !!opp.sleeping;
      var oppAcid = sim ? sim.acid : 0;
      var oppHP   = sim ? sim.hp   : 1;

      ctx.globalAlpha = 0.92 * _staleAlpha;
      drawWorm(ghostSegs, oppSR, oppCol, oppSleeping, oppAcid, oppHP);

      // Poop flash for NPC sims
      if (sim && sim.poopFlash > 0) {
        sim.poopFlash--;
        ctx.globalAlpha = 0.8 * _staleAlpha;
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#f0d050';
        ctx.textAlign = 'center';
        ctx.fillText('💩', ghostSegs[0].x, headScreenY - oppSR - 22);
      }
     } catch(_ge) { window._ghostErr = _ge.message; }
    }
    ctx.restore();
  }

  // ── Progress rings — junction, down drain, up drain — identical style ───
  var _ringTimer = junctionTimer > 0 ? junctionTimer : drainDownTimer > 0 ? drainDownTimer : drainUpTimer;
  if (_ringTimer > 0 && pSegs.length) {
    var _rprog = _ringTimer / JUNCTION_HOLD_FRAMES;
    var _rhx = pSegs[0].x, _rhy = pSegs[0].y - camY;
    var _rrr = pSR * 3;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#60e880';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(_rhx, _rhy, _rrr, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.90;
    ctx.strokeStyle = '#a0ffc0';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(_rhx, _rhy, _rrr, -Math.PI/2, -Math.PI/2 + Math.PI*2*_rprog);
    ctx.stroke();
    ctx.restore();
  }
  if (pSegs.length) {
    var phsy = pSegs[0].y - camY;
    if (avatarMode === 0) {
      // Snoo mode — use real Reddit avatar if loaded, else drawn Snoo
      if (playerAvatarImg) {
        // Snoovatar — pre-rendered offscreen canvas, draw 1:1, no scaling flicker
        var _aw = playerAvatarImg.width, _ah = playerAvatarImg.height;
        var _ax = pSegs[0].x - _aw / 2;   // center on worm head
        var _ay = phsy - pSR - _ah - 2;    // feet just above worm head
        ctx.drawImage(playerAvatarImg, _ax, _ay);
      } else {
        drawSnoo(ctx, pSegs[0].x, phsy - pSR - 20, 1.4, pSleeping);
      }
    } else if (avatarMode === 1) {
      // Username mode — show the player's Reddit username
      ctx.fillStyle = 'rgba(200,240,160,0.9)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(username, pSegs[0].x, phsy - pSR - 5);
    }
    // avatarMode === 2: hidden / immersive
    if (pPooping) {
      ctx.globalAlpha = 0.9;
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#f0d050';
      ctx.textAlign = 'center';
      ctx.fillText('💩 +' + pLastPoopScore + '!', pSegs[0].x, phsy - pSR - 42);
      ctx.globalAlpha = 1;
    }
  }
  // Cursor
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(mX, mY - camY, 4, 0, Math.PI*2);
  ctx.fill();

  drawTutorialHighlight();
  drawTutorialPanel();
  drawTutorialDone();

  // Tutorial leash boundary — debug proof only (?leash=1). Same coord convention
  // as the cursor dot above: world-X direct, Y offset by camY.
  if (tutorial.debug && tutorial.leash && tutorial.leash.type === 'radius') {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tutorial.leash.x, tutorial.leash.y - camY, tutorial.leash.r, 0, Math.PI*2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }


  // ── Drain bonus popups ────────────────────────────────────────────────────
  for (var dbi = drainBonusPopups.length - 1; dbi >= 0; dbi--) {
    var dbp = drainBonusPopups[dbi];
    dbp.wy += dbp.vy;
    dbp.alpha -= 0.004;  // ~4 seconds at 60fps — long enough to read after Snoo leaves
    if (dbp.alpha <= 0) { drainBonusPopups.splice(dbi, 1); continue; }
    ctx.globalAlpha = dbp.alpha;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#b0ff60';
    ctx.textAlign = 'center';
    ctx.fillText(dbp.text, dbp.x, dbp.wy - camY);
    ctx.globalAlpha = 1;
  }

  // ── Weekly drain announcement ─────────────────────────────────────────────
  if (window._drainMsg && (frame - window._drainMsgT) < 360) {
    var dmA = Math.max(0, 1 - (frame - window._drainMsgT) / 360);
    ctx.globalAlpha = dmA;
    ctx.fillStyle = 'rgba(10,40,10,0.92)';
    ctx.fillRect(W/2 - 210, H * 0.38, 420, 38);
    ctx.fillStyle = '#c0ffb0';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(window._drainMsg, W/2, H * 0.38 + 24);
    ctx.globalAlpha = 1;
  }

  // ── Draw cocoons in world space — player-owned only ──────────────────
  for (var ci = 0; ci < cocoons.length; ci++) {
    var co = cocoons[ci];
    if (co.owner !== username) continue;
    if (co.y < (2*H + 0.70*(cSurf()-2*H))) continue; // safety — only render in dark compost zone
    var csx = co.x;
    var csy = co.y - camY;
    if (csy < -30 || csy > H + 30) continue;

    // Maturity colour: pale yellow → amber → warm brown
    var now3 = Date.now();
    var ageFrac = Math.min(1, (now3 - co.laid) / COCOON_MATURE_MS);
    var cr = Math.round(220 + (139 - 220) * ageFrac);
    var cg = Math.round(200 + (90  - 200) * ageFrac);
    var cb = Math.round(100 + (30  - 100) * ageFrac);
    var cocoonCol = 'rgb('+cr+','+cg+','+cb+')';

    // Glow when matured — subtle, half radius
    if (co.matured) {
      var glowA = 0.08 + co.pulse * 0.12;
      var glow = ctx.createRadialGradient(csx, csy, 1, csx, csy, 11);
      glow.addColorStop(0, 'rgba(255,220,80,'+glowA+')');
      glow.addColorStop(1, 'rgba(255,180,40,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(csx, csy, 11, 0, Math.PI*2); ctx.fill();
    }

    // Lemon shape — halved: was 7×10, now 3.5×5
    ctx.save();
    ctx.translate(csx, csy);
    ctx.rotate(0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5, 5, 0, 0, Math.PI*2);
    ctx.fillStyle = cocoonCol;
    ctx.fill();
    // Highlight
    ctx.beginPath();
    ctx.ellipse(-1, -1.5, 1.2, 1.8, -0.3, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
    // Dark ridge line
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(0, 4.5); ctx.stroke();
    ctx.restore();

    // Owner name — hidden in immersive mode
    if (avatarMode !== 2) {
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = co.gifted ? 'rgba(180,255,180,0.65)' : 'rgba(255,240,160,0.65)';
      ctx.fillText((co.gifted ? '🎁 ' : '') + co.owner, csx, csy - 8);
    }
  }

  // --- Acid glow on tier 1 scraps ---
  for (var i = 0; i < scraps.length; i++) {
    var sg = scraps[i];
    if (sg.eaten || sg.ti !== 1 || !sg.t || !sg.t.acid) continue;
    var sgy = sg.y - camY;
    if (sgy < -20 || sgy > H + 20) continue;
    var sPulse = 0.30 + Math.sin(frame * 0.035 + sg.x * 0.05) * 0.18;
    var acidStr2 = sg.t.acid;
    var sgr = 255, sgg = Math.round(180 - acidStr2 * 180);
    ctx.save();
    ctx.translate(sg.x, sgy);
    ctx.rotate(sg.rot || 0);
    ctx.lineCap = 'round';
    var r3 = sg.sz;
    // Outer halo — replaces shadowBlur
    ctx.strokeStyle = 'rgba('+sgr+','+sgg+',0,' + (sPulse * 0.28) + ')';
    ctx.lineWidth = 6;
    switch (sg.t.name) {
      case 'apple_core':
        ctx.beginPath();
        ctx.ellipse(0, 0, r3, r3*0.7, 0.3, 0, Math.PI*2);
        ctx.stroke();
        break;
      case 'fish_bone':
        // Spine
        ctx.beginPath(); ctx.moveTo(-r3*0.9, 0); ctx.lineTo(r3*0.9, 0); ctx.stroke();
        // Three ribs
        ctx.lineWidth = 1.0;
        ctx.beginPath(); ctx.moveTo(-r3*0.4, 0); ctx.lineTo(-r3*0.55, -r3*0.65); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r3*0.1, 0); ctx.lineTo(r3*0.0, -r3*0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r3*0.55, 0); ctx.lineTo(r3*0.45, -r3*0.55); ctx.stroke();
        break;
      case 'orange_peel':
        // Curved strip
        ctx.beginPath();
        ctx.moveTo(-r3*0.8, -r3*0.2);
        ctx.quadraticCurveTo(r3*0.1, -r3*0.9, r3*0.8, r3*0.3);
        ctx.stroke();
        break;
      case 'overripe_fruit':
        ctx.beginPath();
        ctx.ellipse(0, 0, r3*0.9, r3*0.7, 0.4, 0, Math.PI*2);
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, r3 * 0.9, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Sharp inner stroke
    ctx.strokeStyle = 'rgba('+sgr+','+sgg+',0,'+sPulse+')';
    ctx.lineWidth = 1.8;
    switch (sg.t.name) {
      case 'apple_core':
        ctx.beginPath(); ctx.ellipse(0, 0, r3, r3*0.7, 0.3, 0, Math.PI*2); ctx.stroke(); break;
      case 'fish_bone':
        ctx.beginPath(); ctx.moveTo(-r3*0.9, 0); ctx.lineTo(r3*0.9, 0); ctx.stroke();
        ctx.lineWidth = 1.0;
        ctx.beginPath(); ctx.moveTo(-r3*0.4, 0); ctx.lineTo(-r3*0.55, -r3*0.65); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r3*0.1, 0); ctx.lineTo(r3*0.0, -r3*0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r3*0.55, 0); ctx.lineTo(r3*0.45, -r3*0.55); ctx.stroke(); break;
      case 'orange_peel':
        ctx.beginPath(); ctx.moveTo(-r3*0.8, -r3*0.2); ctx.quadraticCurveTo(r3*0.1, -r3*0.9, r3*0.8, r3*0.3); ctx.stroke(); break;
      case 'overripe_fruit':
        ctx.beginPath(); ctx.ellipse(0, 0, r3*0.9, r3*0.7, 0.4, 0, Math.PI*2); ctx.stroke(); break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, r3 * 0.9, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // --- Eggshell glow — blue stroke to signal antidote ---
  for (var i = 0; i < scraps.length; i++) {
    var eg = scraps[i];
    if (eg.eaten || eg.ti !== 1 || !eg.t || eg.t.name !== 'egg_shell') continue;
    var egy = eg.y - camY;
    if (egy < -20 || egy > H + 20) continue;
    var ePulse = 0.30 + Math.sin(frame * 0.03 + eg.x * 0.05) * 0.15;
    var r4 = eg.sz;
    ctx.save();
    ctx.translate(eg.x, egy);
    ctx.rotate(eg.rot || 0);
    ctx.lineCap = 'round';
    var r4 = eg.sz;
    // Outer halo — replaces shadowBlur
    ctx.strokeStyle = 'rgba(80,180,255,' + (ePulse * 0.32) + ')';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-r4*0.8, r4*0.2);
    ctx.quadraticCurveTo(0, -r4*0.9, r4*0.8, r4*0.1);
    ctx.stroke();
    // Sharp inner stroke
    ctx.strokeStyle = 'rgba(80,180,255,' + ePulse + ')';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-r4*0.8, r4*0.2);
    ctx.quadraticCurveTo(0, -r4*0.9, r4*0.8, r4*0.1);
    ctx.stroke();
    ctx.restore();
  }

  // ── Clitellum indicator + cocoon feedback msg ─────────────────────────
  if (clitellumReady && pSegs.length && !deathScreen) {
    // Clitellum sits on segment ~30% back from head — same as a real earthworm
    var cSeg = pSegs[Math.min(Math.floor(pSegs.length * 0.30), pSegs.length - 1)];
    var csx = cSeg.x, csy = cSeg.y - camY;
    // Angle the band perpendicular to the worm body direction
    var cPrev = pSegs[Math.max(0, Math.floor(pSegs.length * 0.30) - 1)];
    var cNext = pSegs[Math.min(pSegs.length - 1, Math.floor(pSegs.length * 0.30) + 1)];
    var cAng  = Math.atan2(cNext.y - cPrev.y, cNext.x - cPrev.x);
    ctx.save();
    ctx.translate(csx, csy);
    ctx.rotate(cAng);
    ctx.globalAlpha = 0.55 + Math.sin(frame * 0.09) * 0.2;
    ctx.fillStyle = '#f090a8';
    ctx.beginPath();
    // Band is slightly wider than the worm, very thin — hugs the body
    ctx.ellipse(0, 0, pSR * 1.15, pSR * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  if (window._cocoonMsg && (frame - window._cocoonMsgT) < 180) {
    var msgA = Math.max(0, 1 - (frame - window._cocoonMsgT) / 180);
    ctx.globalAlpha = msgA;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff0a0';
    ctx.fillText(window._cocoonMsg, W/2, H * 0.35);
    ctx.globalAlpha = 1;
  }


  // ── Restore canvas transform — everything below is screen-space HUD ──────
  ctx.restore();

  // HUD — Karma pill (top left, persistent across deaths)
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  var myCocHUDTop = cocoons.filter(function(c){ return c.owner === username; }).length;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('\u262F\uFE0E', 18, 28);
  ctx.fillStyle = '#ffd700';
  ctx.fillText(' ' + Math.floor(karma), 30, 28);

  // Tinted worm emoji in gen color using offscreen canvas
  var _genCol = getGenColor(generation);
  var _karmaW = ctx.measureText(' ' + Math.floor(karma)).width;
  var _emojiX = 30 + _karmaW + 8;
  var _emojiSz = 16;
  var _ofc = document.createElement('canvas');
  _ofc.width = _emojiSz + 4; _ofc.height = _emojiSz + 4;
  var _octx = _ofc.getContext('2d');
  _octx.font = _emojiSz + 'px sans-serif';
  _octx.textAlign = 'left';
  _octx.fillText('🪱', 0, _emojiSz);
  _octx.globalCompositeOperation = 'source-atop';
  _octx.fillStyle = _genCol;
  _octx.fillRect(0, 0, _ofc.width, _ofc.height);
  ctx.drawImage(_ofc, _emojiX, 14);

  // Cocoon count after tinted worm
  ctx.fillStyle = _genCol;
  ctx.font = '13px sans-serif';
  ctx.fillText(' ' + myCocHUDTop, _emojiX + _emojiSz + 2, 28);

  // Generation name — same gen colour
  ctx.fillStyle = _genCol;
  ctx.font = '9px sans-serif';
  ctx.fillText(getGenName(generation), 18, 42);

  // Real-time clock HUD — top centre
  var now = new Date();
  var hh = now.getHours(), mm = now.getMinutes();
  var ampm = hh >= 12 ? 'PM' : 'AM';
  var hh12 = hh % 12 || 12;
  var clockStr = hh12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm;
  ctx.fillStyle = '#f0e8b0';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(clockStr, W/2, 26);

  // --- Cocoon status in HUD ---
  var myCocHUD = cocoons.filter(function(c){ return c.owner === username; });
  var matHUD   = myCocHUD.filter(function(c){ return c.matured; }).length;
  if (clitellumReady) {
    ctx.fillStyle = '#ffb0c0';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('🪱 E — lay cocoon', 18, 48);
  } else if (myCocHUD.length > 0) {
    ctx.fillStyle = '#d0c080';
    ctx.font = '9px sans-serif';
    ctx.fillText('🪱 ' + matHUD + '/' + myCocHUD.length + ' cocoons ready', 18, 48);
  }

  // --- HP + Gut merged bar ---
  // Two stacked pill bars: HP on top, gut fill below — clean rounded design
  var gutFracHUD  = Math.min(1, pGut / pGutMax);
  var gutIsFullHUD = gutFracHUD >= 0.98;
  var starving     = pHunger > 0.8;
  var hungerFlash  = starving && (frame % 30 < 15);

  var _barX = 10, _barY = 50, _barW = 170, _barH = 10, _barR = 4, _barGap = 4;

  // ── HP bar ────────────────────────────────────────────────────────────────
  // Track
  ctx.fillStyle = 'rgba(10,20,8,0.85)';
  ctx.beginPath(); ctx.roundRect(_barX, _barY, _barW, _barH, _barR); ctx.fill();

  // HP fill colour — gen colour fading to pale ash at low HP, green tint if acid
  var _hpGenCol = getGenColor(generation);
  var _hpR = parseInt(_hpGenCol.slice(1,3),16);
  var _hpG = parseInt(_hpGenCol.slice(3,5),16);
  var _hpB = parseInt(_hpGenCol.slice(5,7),16);
  if (pAcid > 0.1) {
    var _at1 = Math.min(1, (pAcid - 0.1) / 0.4);
    _hpR = Math.round(_hpR + (0xc8 - _hpR) * _at1);
    _hpG = Math.round(_hpG + (0xf0 - _hpG) * _at1);
    _hpB = Math.round(_hpB + (0x20 - _hpB) * _at1);
  }
  if (pHP < 0.45) {
    var _hpt2 = Math.min(1, (0.45 - pHP) / 0.45);
    _hpR = Math.round(_hpR + (0xe8 - _hpR) * _hpt2);
    _hpG = Math.round(_hpG + (0xe0 - _hpG) * _hpt2);
    _hpB = Math.round(_hpB + (0xd8 - _hpB) * _hpt2);
  }
  var hpCol = 'rgb(' + _hpR + ',' + _hpG + ',' + _hpB + ')';
  var _hpFillW = Math.max(0, Math.round((_barW - 2) * pHP));
  if (_hpFillW > 0) {
    ctx.fillStyle = hpCol;
    ctx.beginPath(); ctx.roundRect(_barX + 1, _barY + 1, _hpFillW, _barH - 2, _barR - 1); ctx.fill();
    // Subtle highlight sheen on top half
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(_barX + 1, _barY + 1, _hpFillW, Math.floor((_barH - 2) / 2), _barR - 1); ctx.fill();
  }
  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(_barX + 0.5, _barY + 0.5, _barW - 1, _barH - 1, _barR); ctx.stroke();

  // ── Gut bar ───────────────────────────────────────────────────────────────
  var _gutY = _barY + _barH + _barGap;
  // Track
  ctx.fillStyle = 'rgba(10,20,8,0.85)';
  ctx.beginPath(); ctx.roundRect(_barX, _gutY, _barW, _barH, _barR); ctx.fill();

  // Gut fill colour
  var _gutAlpha, _gutR, _gutG, _gutB;
  if (gutIsFullHUD) {
    _gutR = hungerFlash ? 255 : 220; _gutG = hungerFlash ? 30 : 20; _gutB = 10;
    _gutAlpha = 1.0;
  } else if (starving) {
    _gutR = hungerFlash ? 255 : 200; _gutG = hungerFlash ? 30 : 20; _gutB = 10;
    _gutAlpha = 1.0;
  } else {
    _gutR = 90; _gutG = 52; _gutB = 14;
    _gutAlpha = 1.0;
  }
  var _gutFillW = Math.max(0, Math.round((_barW - 2) * gutFracHUD));
  if (_gutFillW > 0) {
    ctx.fillStyle = 'rgba(' + _gutR + ',' + _gutG + ',' + _gutB + ',' + _gutAlpha + ')';
    ctx.beginPath(); ctx.roundRect(_barX + 1, _gutY + 1, _gutFillW, _barH - 2, _barR - 1); ctx.fill();
    // Sheen
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.roundRect(_barX + 1, _gutY + 1, _gutFillW, Math.floor((_barH - 2) / 2), _barR - 1); ctx.fill();
  }
  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(_barX + 0.5, _gutY + 0.5, _barW - 1, _barH - 1, _barR); ctx.stroke();

  // Urgent state labels centred inside gut bar
  if (gutIsFullHUD) {
    var _poopFlash = frame % 30 < 15;
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = _poopFlash ? '#ffffff' : '#ffe0a0';
    ctx.fillText('💩 POOP!', _barX + _barW / 2, _gutY + _barH - 1);
  } else if (starving) {
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = hungerFlash ? '#ffffff' : '#ff9060';
    ctx.fillText('⚠ EAT!', _barX + _barW / 2, _gutY + _barH - 1);
  } else if (pAcid > 0.5) {
    var _acidFlash = pAcid > 0.7 && (frame % 20 < 10);
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = _acidFlash ? '#ffffff' : '#c8f090';
    ctx.fillText('⚗ ACID!', _barX + _barW / 2, _gutY + _barH - 1);
  }
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';

  // --- Safe sleep zone badge (visible while in tiers 2-3) ---
  // --- Offline drain notice ---
  if (window._offlineDrainMsg) {
    if (!window._offlineMsgFrame) window._offlineMsgFrame = frame;
    var _msgAge = frame - window._offlineMsgFrame;
    var _msgDur = 240; // 4 seconds at 60fps
    if (_msgAge > _msgDur) {
      window._offlineDrainMsg = null; window._offlineMsgFrame = 0;
    } else {
      // Split on ' · ' so each status item gets its own line
      var _rawMsg   = window._offlineDrainMsg;
      // First part is the header (everything up to and including the first ' — ')
      var _dashIdx  = _rawMsg.indexOf(' — ');
      var _header   = _dashIdx >= 0 ? _rawMsg.slice(0, _dashIdx + 3) : '';
      var _rest     = _dashIdx >= 0 ? _rawMsg.slice(_dashIdx + 3) : _rawMsg;
      var _lines    = _rest.split(' · ');
      if (_header) _lines.unshift(_header);

      var _lh    = 18;  // line height px
      var _pad   = 12;
      var _cardW = Math.min(W - 40, 380);
      var _cardH = _pad * 2 + _lines.length * _lh;
      var _cardX = W / 2 - _cardW / 2;
      var _cardY = H / 2 - _cardH / 2 - 20;

      // Fade out last 60 frames
      var _alpha = _msgAge > _msgDur - 60 ? (_msgDur - _msgAge) / 60 : 1;
      ctx.save();
      ctx.globalAlpha = _alpha;

      // Background card
      ctx.fillStyle = 'rgba(20,15,8,0.92)';
      ctx.beginPath();
      var _r = 8;
      ctx.moveTo(_cardX + _r, _cardY);
      ctx.lineTo(_cardX + _cardW - _r, _cardY);
      ctx.quadraticCurveTo(_cardX + _cardW, _cardY, _cardX + _cardW, _cardY + _r);
      ctx.lineTo(_cardX + _cardW, _cardY + _cardH - _r);
      ctx.quadraticCurveTo(_cardX + _cardW, _cardY + _cardH, _cardX + _cardW - _r, _cardY + _cardH);
      ctx.lineTo(_cardX + _r, _cardY + _cardH);
      ctx.quadraticCurveTo(_cardX, _cardY + _cardH, _cardX, _cardY + _cardH - _r);
      ctx.lineTo(_cardX, _cardY + _r);
      ctx.quadraticCurveTo(_cardX, _cardY, _cardX + _r, _cardY);
      ctx.closePath();
      ctx.fill();

      // Border
      ctx.strokeStyle = 'rgba(180,140,40,0.70)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = 'left';
      for (var _li = 0; _li < _lines.length; _li++) {
        var _ly = _cardY + _pad + _li * _lh + _lh * 0.75;
        if (_li === 0) {
          // Header line — brighter, bold
          ctx.fillStyle = '#ffe080';
          ctx.font = 'bold 11px sans-serif';
        } else {
          // Status lines — softer colour
          ctx.fillStyle = '#c8d8a8';
          ctx.font = '11px sans-serif';
        }
        ctx.fillText(_lines[_li], _cardX + _pad, _ly);
      }
      ctx.restore();
    }
  }

  // Sleep warning — tried to sleep in wrong tier
  if (window._sleepWarning && frame - window._sleepWarning < 120) {
    var warnAlpha = 1 - (frame - window._sleepWarning) / 120;
    ctx.globalAlpha = warnAlpha;
    ctx.fillStyle = 'rgba(180,60,20,0.92)';
    ctx.fillRect(W/2 - 110, H/2 - 20, 220, 28);
    ctx.fillStyle = '#ffddaa';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ Swim into the compost layer first!', W/2, H/2 - 2);
    ctx.globalAlpha = 1;
  }

  // ZZZ particles — convert world coords to screen coords (after camera restore)
  for (var zi2 = 0; zi2 < pZzz.length; zi2++) {
    var zp = pZzz[zi2];
    var zpScreenY = zp.wy - camY;
    var zpScreenX = zp.x - camX;
    if (zpScreenY < -20 || zpScreenY > H + 20) continue;
    ctx.globalAlpha = zp.alpha;
    ctx.fillStyle = '#aaddff';
    ctx.font = 'bold ' + Math.round(zp.size) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(zp.char, zpScreenX, zpScreenY);
  }
  ctx.globalAlpha = 1;


  // Long-press ring — gesture feedback
  drawLongPressRing();

  // Weather HUD — upper left
  drawWeatherHUD();
  drawDebugOverlay();
  // Queue system — pending cocoons and spectator HUD
  try { drawPendingWorms(); } catch(e) {}
  drawQueueHUD();
  // Weather location UI — one-time setup overlay
  // Death screen drawn on top of everything
  drawDeathScreen();
  // FEAT-2: Conflict overlay drawn on top of everything (blocks open if another device active)
  drawConflictOverlay();
}


// ── DEBUG overlay — shows KV state received from host ────────────────────────
// Only active when DEBUG_MODE = true. Remove before public launch.
var _dbgWorldState = {};   // last setWorldState payload received
var _dbgSessionTs  = 0;    // ts from last setSession
var _dbgTokenState = 'none'; // device token info from host

function drawDebugOverlay() {
  if (!DEBUG_MODE) return;
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  var lines = [
    'DBG user=' + (username || '?'),
    'karma=' + Math.floor(karma) + ' sesTs=' + (_dbgSessionTs ? new Date(_dbgSessionTs).toISOString().slice(11,19) : 'none'),
    'cast=' + castingEnrichment.toFixed(3) + ' scraps=' + scrapsLevel.toFixed(2),
    'token=' + _dbgTokenState,
    'conflict=' + deviceConflictActive,
  ];
  var pad = 6, lh = 14;
  var bw = 220, bh = pad*2 + lines.length * lh;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(4, 4, bw, bh);
  ctx.fillStyle = '#00ff88';
  for (var di = 0; di < lines.length; di++) {
    ctx.fillText(lines[di], 4 + pad, 4 + pad + lh * (di + 0.8));
  }
  ctx.restore();
}

// ── Weather HUD ───────────────────────────────────────────────────────────
function drawWeatherHUD() {
  var now    = new Date();
  var mo     = now.getMonth() + 1;   // 1–12
  var day    = now.getDate();
  var yr     = now.getFullYear();
  var dateStr = mo + '/' + day + '/' + yr;

  var tempF  = weatherTempF();
  var humPct = 'RH ' + Math.round(weather.humidity * 100) + '%';

  // Build line 1: date   line 2: temp / humidity
  var line1 = dateStr;
  var line2 = tempF + '°F  ' + humPct;

  ctx.save();
  ctx.textAlign = 'right';

  // Backdrop pill — anchored to upper right
  var padX = 8, padY = 4;
  ctx.font = 'bold 10px sans-serif';
  var w1 = ctx.measureText(line1).width;
  ctx.font = '10px sans-serif';
  var w2 = ctx.measureText(line2).width;
  var bw = Math.max(w1, w2) + padX * 2 + 4;
  var bh = 32;
  var bx = W - 6 - bw;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#0a1008';
  ctx.beginPath();
  ctx.roundRect(bx, 6, bw, bh, 5);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Date line
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#a0c880';
  ctx.fillText(line1, W - 6 - padX, 6 + padY + 10);

  // Conditions line
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#d0eab0';
  ctx.fillText(line2, W - 6 - padX, 6 + padY + 24);

  ctx.restore();
}
function drawPendingWorms() {
  if (!pendingWorms.length) return;
  var now = Date.now();
  for (var _di = 0; _di < pendingWorms.length; _di++) {
    var _dpw = pendingWorms[_di];
    var _sx = _dpw.x;
    var _sy = _dpw.y - camY;
    if (_sy < -60 || _sy > H + 60) continue;

    if (!_dpw.hatched) {
      // ── Pre-hatch: glowing pending cocoon ──────────────────────────────
      var _msL = Math.max(0, _dpw.hatchTs - now);
      var _secsL = Math.ceil(_msL / 1000);
      var _hFrac = 1 - Math.min(1, _msL / HATCH_DELAY_MS);
      var _pulse = Math.sin(frame * (0.06 + _hFrac * 0.12)) * 0.5 + 0.5;
      var _glowR = 16 + _hFrac * 20;
      var _glowA = 0.12 + _hFrac * 0.28 + _pulse * 0.12;
      var _eR = Math.round(160 + _hFrac * 80);
      var _eG = Math.round(220 - _hFrac * 60);
      var _eB = Math.round(255 - _hFrac * 160);

      ctx.save();
      var _gg = ctx.createRadialGradient(_sx, _sy, 1, _sx, _sy, _glowR);
      _gg.addColorStop(0, 'rgba('+_eR+','+_eG+','+_eB+','+_glowA+')');
      _gg.addColorStop(1, 'rgba('+_eR+','+_eG+','+_eB+',0)');
      ctx.fillStyle = _gg;
      ctx.beginPath(); ctx.arc(_sx, _sy, _glowR, 0, Math.PI*2); ctx.fill();
      ctx.translate(_sx, _sy);
      ctx.rotate(0.15 + Math.sin(frame * 0.04) * 0.05);
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 7.5, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgb('+_eR+','+_eG+','+_eB+')'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-1.5, -2, 1.8, 2.5, -0.3, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(0,-6.5); ctx.lineTo(0,6.5); ctx.stroke();
      ctx.restore();

      // Label pill + countdown
      ctx.save();
      var _pW = 110, _pH = 18;
      ctx.fillStyle = 'rgba(10,20,15,0.82)';
      ctx.beginPath(); ctx.roundRect(_sx-_pW/2, _sy-28, _pW, _pH, 5); ctx.fill();
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgb('+_eR+','+_eG+','+_eB+')';
      ctx.fillText(_dpw.username, _sx, _sy-15);
      var _urgF = _secsL <= 30 && (frame % 20 < 10);
      ctx.fillStyle = _urgF ? '#ff4040' : '#a0e8a0';
      ctx.font = 'bold 8px sans-serif';
      var _mStr = _secsL >= 60
        ? Math.floor(_secsL/60)+'m '+((_secsL%60)||'')+'s'
        : _secsL+'s';
      ctx.fillText('hatches in '+_mStr, _sx, _sy+22);
      ctx.restore();

    } else {
      // ── Post-hatch: ghost worm wandering uncontrolled ──────────────────
      if (!_dpw.segs) {
        _dpw.segs = [];
        for (var _gs = 0; _gs < 8; _gs++) {
          _dpw.segs.push({ x: _dpw.x + (Math.random()-0.5)*10, y: _dpw.y + _gs*4 });
        }
        _dpw.angle = 0;
      }
      _dpw.angle += 0.018;
      var _wb2 = getBin();
      var _wn = {
        x: _dpw.segs[0].x + Math.cos(_dpw.angle)*0.6 + (Math.random()-0.5)*0.3,
        y: _dpw.segs[0].y + Math.sin(_dpw.angle*0.7)*0.4
      };
      _wn.x = Math.max(_wb2.cx-_wb2.bw2+8, Math.min(_wb2.cx+_wb2.bw2-8, _wn.x));
      _wn.y = Math.max(2*H, Math.min(cSurf(), _wn.y));
      _dpw.segs.unshift(_wn);
      if (_dpw.segs.length > 8) _dpw.segs.pop();
      _dpw.x = _dpw.segs[0].x; _dpw.y = _dpw.segs[0].y;

      var _hFrac2 = 1 - (_dpw.gutFrac != null ? _dpw.gutFrac : 1.0);
      var _gR2 = Math.round(80 + _hFrac2*175);
      var _gG2 = Math.round(160 - _hFrac2*120);
      var _ghostA = 0.55 + Math.sin(frame*0.08)*0.15;

      for (var _gsi = 0; _gsi < _dpw.segs.length; _gsi++) {
        var _gseg = _dpw.segs[_gsi];
        var _gsx2 = _gseg.x, _gsy2 = _gseg.y - camY;
        var _gf2 = _gsi / (_dpw.segs.length - 1);
        ctx.save();
        ctx.globalAlpha = _ghostA * (1 - _gf2*0.5);
        ctx.fillStyle = 'rgb('+_gR2+','+_gG2+',60)';
        ctx.beginPath(); ctx.arc(_gsx2, _gsy2, 4*(1-_gf2*0.3), 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Name pill + hunger bar
      var _hsx2 = _dpw.segs[0].x, _hsy2 = _dpw.segs[0].y - camY;
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,15,0.82)';
      ctx.beginPath(); ctx.roundRect(_hsx2-52, _hsy2-26, 104, 16, 5); ctx.fill();
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = _hFrac2 > 0.7 ? '#ff6040' : '#c0e880';
      ctx.fillText(_dpw.username+(_hFrac2>0.7?' ⚠ STARVING':' — unclaimed'), _hsx2, _hsy2-14);
      var _hbW2 = 80;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(_hsx2-_hbW2/2, _hsy2-7, _hbW2, 4);
      ctx.fillStyle = 'rgb('+_gR2+','+_gG2+',60)';
      ctx.fillRect(_hsx2-_hbW2/2, _hsy2-7, _hbW2*(_dpw.gutFrac||0), 4);
      ctx.restore();
    }
  }

  // Toast: unclaimed death message (other player's worm)
  if (window._unclaimedDeathMsg && frame - (window._unclaimedDeathMsgT||0) < 240) {
    var _ua2 = Math.max(0, 1-(frame-window._unclaimedDeathMsgT)/240);
    ctx.save(); ctx.globalAlpha = _ua2;
    ctx.fillStyle = '#ff8040'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(window._unclaimedDeathMsg, W/2, H - 80);
    ctx.restore();
  }
}

function drawQueueHUD() {
  if (playerState !== 'queued') return;
  var _qnow = Date.now();
  var _myPW = _findPendingWorm(username);
  var _hH   = _myPW && _myPW.hatched;
  var _gFrc  = _myPW ? (_myPW.gutFrac != null ? _myPW.gutFrac : 1.0) : 0;
  var _msL2  = _myPW ? Math.max(0, _myPW.hatchTs - _qnow) : 0;
  var _sL2   = Math.ceil(_msL2/1000);

  var _qW = Math.min(W-32, 340);
  var _qH = _hH ? 160 : 130;
  var _qX = W/2 - _qW/2;
  var _qY = H - _qH - 24;

  ctx.fillStyle = 'rgba(8,18,10,0.92)';
  ctx.strokeStyle = _hH ? '#ff6040' : '#3a8840';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(_qX, _qY, _qW, _qH, 12); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';

  if (!_myPW) {
    // Waiting — no cocoon yet
    ctx.fillStyle = '#80c880'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText('🪱 In the Queue', W/2, _qY+28);
    ctx.fillStyle = '#607860'; ctx.font = '11px sans-serif';
    ctx.fillText('Position '+queuePosition+' of '+queueTotal, W/2, _qY+48);
    ctx.fillStyle = '#405040'; ctx.font = '10px sans-serif';
    ctx.fillText('When the current worm dies, your cocoon forms.', W/2, _qY+68);
    ctx.fillText('Watch the bin — you\'ll need to move fast.', W/2, _qY+84);

  } else if (!_hH) {
    // Cocoon forming — countdown
    var _uf2 = _sL2 <= 30 && (frame%20 < 10);
    ctx.fillStyle = _uf2 ? '#ff6040' : '#e0d060'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText('🥚 Your worm hatches in...', W/2, _qY+28);
    var _mStr2 = _sL2 >= 60
      ? Math.floor(_sL2/60)+':'+(('0'+(_sL2%60)).slice(-2))
      : '0:'+(('0'+_sL2).slice(-2));
    ctx.fillStyle = _uf2 ? '#ff4020' : '#ffffff'; ctx.font = 'bold 38px monospace';
    ctx.fillText(_mStr2, W/2, _qY+76);
    ctx.fillStyle = '#608060'; ctx.font = '10px sans-serif';
    ctx.fillText('It will be hungry. Feed it fast or it dies.', W/2, _qY+102);

  } else {
    // Hatched — claim it!
    var _hFrc2 = 1 - _gFrc;
    var _cf2   = frame%20 < 10;
    ctx.fillStyle = _cf2 ? '#ff6040' : '#ff9060'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('🪱 YOUR WORM IS ALIVE — TAP TO CLAIM!', W/2, _qY+26);

    var _gbW2 = _qW-40;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(_qX+20, _qY+40, _gbW2, 12);
    var _gutC = _gFrc>0.5?'#70c840':_gFrc>0.25?'#e0b030':'#e03020';
    ctx.fillStyle = _gutC;
    ctx.fillRect(_qX+20, _qY+40, _gbW2*_gFrc, 12);
    ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
    ctx.strokeRect(_qX+20, _qY+40, _gbW2, 12);
    ctx.fillStyle='#c0a060'; ctx.font='10px sans-serif';
    ctx.fillText('Gut: '+Math.round(_gFrc*100)+'% — burning fast', W/2, _qY+68);

    var _bW3=_qW-60, _bH3=36, _bX3=W/2-(_qW-60)/2, _bY3=_qY+80;
    var _bg3=ctx.createLinearGradient(_bX3,_bY3,_bX3,_bY3+_bH3);
    _bg3.addColorStop(0,_cf2?'#803010':'#602010');
    _bg3.addColorStop(1,_cf2?'#501808':'#401008');
    ctx.fillStyle=_bg3; ctx.strokeStyle=_cf2?'#ff6040':'#c04020'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.roundRect(_bX3,_bY3,_bW3,_bH3,8); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ffb090'; ctx.font='bold 13px sans-serif';
    ctx.fillText('🪱 TAP TO CLAIM YOUR WORM', W/2, _bY3+_bH3/2+5);
    window._claimBtn = { x:_bX3, y:_bY3, w:_bW3, h:_bH3 };
  }

  // "Your worm starved unclaimed" message
  if (window._unclaimedSelf && (frame-(window._unclaimedSelfT||0)) < 300) {
    var _ua3=Math.max(0,1-(frame-window._unclaimedSelfT)/300);
    ctx.save(); ctx.globalAlpha=_ua3;
    ctx.fillStyle='#ff6040'; ctx.font='bold 13px sans-serif';
    ctx.fillText('Your worm starved before you arrived...', W/2, _qY-20);
    ctx.restore();
  }
}

// FEAT-2: Conflict overlay — drawn when another device is already active
function drawConflictOverlay() {
  if (!deviceConflictActive) return;
  // Dim background
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Panel
  var _cW = Math.min(W * 0.85, 320), _cH = 160;
  var _cX = W/2 - _cW/2, _cY = H/2 - _cH/2;
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.roundRect(_cX, _cY, _cW, _cH, 12);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title
  ctx.fillStyle = '#f0e0b0';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Already Playing Elsewhere', W/2, _cY + 30);

  // Body text
  ctx.fillStyle = '#999';
  ctx.font = '12px sans-serif';
  ctx.fillText('Your worm is open on another device.', W/2, _cY + 56);
  ctx.fillText('Take over or wait for that session to close.', W/2, _cY + 74);

  // Buttons
  var _bW = (_cW - 48) / 2, _bH = 40;
  var _takeX = _cX + 16, _waitX = _cX + 16 + _bW + 16;
  var _btnY  = _cY + _cH - 56;

  // Take Over button
  ctx.fillStyle = '#4a7a3a';
  ctx.beginPath();
  ctx.roundRect(_takeX, _btnY, _bW, _bH, 8);
  ctx.fill();
  ctx.fillStyle = '#c8f0a0';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('Take Over', _takeX + _bW/2, _btnY + 25);

  // Wait button
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.roundRect(_waitX, _btnY, _bW, _bH, 8);
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#888';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('Wait', _waitX + _bW/2, _btnY + 25);

  ctx.textAlign = 'left';
}

function drawDeathScreen() {
  if (!deathScreen) return;
  deathFade = Math.min(1, deathFade + 0.025);
  var alpha = deathFade;

  // Natural death — auto-respawn after a short celebratory pause (3 seconds)
  if (deathCause === 'natural') {
    if (!window._naturalDeathTs) window._naturalDeathTs = Date.now();
    var elapsed = Date.now() - window._naturalDeathTs;
    if (elapsed >= 3000) {
      window._naturalDeathTs = null;
      generation++;  // earn next generation
      respawnPlayer(false);
      return;
    }
    // Green celebratory overlay
    ctx.globalAlpha = alpha * 0.82;
    ctx.fillStyle = '#020f02';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = alpha;
    var cx2 = W/2, cy2 = H/2;
    var panelW = Math.min(W * 0.85, 380), panelH = 200;
    var px = cx2 - panelW/2, py = cy2 - panelH/2;
    ctx.fillStyle = '#0a1f0a';
    ctx.strokeStyle = '#50c040';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#80ff80';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌱 Life Complete', cx2, py + 48);
    ctx.fillStyle = '#a0e0a0';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Your worm completed its natural lifespan.', cx2, py + 76);
    ctx.fillStyle = '#70b870';
    ctx.font = '11px sans-serif';
    ctx.fillText('A new worm hatches from the compost...', cx2, py + 96);
    ctx.fillStyle = '#ffd700';
    ctx.font = '12px sans-serif';
    ctx.fillText('☯ Karma kept: ' + Math.floor(karma), cx2, py + 120);
    // Next gen preview
    var nextGen = generation + 1;
    var nextCol = getGenColor(nextGen);
    var nextName = getGenName(nextGen);
    ctx.fillStyle = nextCol;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Next life: ' + nextName + '  ●', cx2, py + 138);
    // Countdown bar
    var barW = panelW * 0.7, barH = 8;
    var barX = cx2 - barW/2, barY = py + 148;
    ctx.fillStyle = '#1a3a1a';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 4); ctx.fill();
    ctx.fillStyle = '#50c040';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW * (elapsed / 3000), barH, 4); ctx.fill();
    ctx.fillStyle = '#609060';
    ctx.font = '10px sans-serif';
    ctx.fillText('Respawning...', cx2, barY + 22);
    ctx.globalAlpha = 1;
    return;
  }
  var alpha = deathFade;

  // Dark overlay
  ctx.globalAlpha = alpha * 0.82;
  ctx.fillStyle = '#0a0505';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  var cx2 = W/2, cy2 = H/2;
  var panelW = Math.min(W * 0.85, 380), panelH = 240;
  var px = cx2 - panelW/2, py = cy2 - panelH/2;

  // Panel
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#1a0808';
  ctx.strokeStyle = '#8b2020';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 14); ctx.fill(); ctx.stroke();

  // Title
  ctx.fillStyle = '#ff4040';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('💀 YOUR WORM DIED', cx2, py + 46);

  // Cause of death
  var _causeMap = {
    starvation:   { text: '💀 Starved to death',               sub: 'The gut ran dry. Find food before descending next time.' },
    hunger:       { text: '💀 Slowly starved',                 sub: 'Hunger wore the worm down. Keep that gut filled.' },
    constipation: { text: '💩 Died of constipation',          sub: 'Too full to move. Find compost and poop!' },
    acidity:      { text: '⚗ Dissolved by acid',              sub: 'Too many acidic scraps. Eat egg shells to neutralise.' },
    natural:      { text: '🌱 Full life, well lived',          sub: 'Your worm completed its natural lifespan. A new worm is ready.' },
  };
  var _cause = _causeMap[deathCause] || { text: '💀 HP depleted', sub: 'Something wore the worm down.' };
  ctx.fillStyle = '#e08060';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(_cause.text, cx2, py + 72);
  ctx.fillStyle = '#a08878';
  ctx.font = '11px sans-serif';
  ctx.fillText(_cause.sub, cx2, py + 89);

  // Karma
  ctx.fillStyle = '#ffd700';
  ctx.font = '12px sans-serif';
  ctx.fillText('☯ Karma: ' + Math.floor(karma), cx2, py + 110);

  // Single smart respawn button
  var myCocoons3    = cocoons.filter(function(c){ return c.owner === username; });
  var matureCocoons = myCocoons3.filter(function(c){ return c.matured; });
  var pendingCocoons = myCocoons3.filter(function(c){ return !c.matured; });
  var binFull       = cocoons.length >= COCOON_MAX * 4; // bin totally packed with other players' cocoons

  var btnW = Math.min(panelW * 0.8, 260), btnH = 44;
  var btnX = cx2 - btnW/2;
  var btnY = py + 126;

  if (binFull) {
    // Bin full — Join Queue is the primary action
    if (playerState !== 'queued') {
      var _jqGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
      _jqGrad.addColorStop(0, '#1a4a1a'); _jqGrad.addColorStop(1, '#0e2e0e');
      ctx.fillStyle = _jqGrad; ctx.strokeStyle = '#40a040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#90e890'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('🪱 Join the Queue', cx2, btnY + btnH/2 + 5);
      ctx.fillStyle = '#608060'; ctx.font = '10px sans-serif';
      ctx.fillText('Bin is full — wait for the next worm to die', cx2, btnY + btnH + 14);
      window._joinQueueBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
    } else {
      window._joinQueueBtn = null;
      ctx.fillStyle = '#444'; ctx.strokeStyle = '#2a5a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#70b870'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('\u2705 In the queue \u2014 watching the bin', cx2, btnY + btnH/2 + 5);
      ctx.fillStyle = '#507050'; ctx.font = '10px sans-serif';
      ctx.fillText('Position ' + queuePosition + ' of ' + queueTotal, cx2, btnY + btnH + 14);
    }
  } else if (matureCocoons.length > 0) {
    var grad1 = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    grad1.addColorStop(0, '#2a6a20'); grad1.addColorStop(1, '#1a4510');
    ctx.fillStyle = grad1; ctx.strokeStyle = '#50c040'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b0ffb0'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('🪱 Hatch from cocoon', cx2, btnY + btnH/2 + 5);
    if (pendingCocoons.length > 0) {
      ctx.fillStyle = '#80c880'; ctx.font = '10px sans-serif';
      ctx.fillText(pendingCocoons.length + ' more still maturing', cx2, btnY + btnH + 14);
    }
  } else {
    var grad2 = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    grad2.addColorStop(0, '#502010'); grad2.addColorStop(1, '#300c08');
    ctx.fillStyle = grad2; ctx.strokeStyle = '#c84020'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffb0a0'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('🪱 Respawn as baby worm', cx2, btnY + btnH/2 + 5);
    if (pendingCocoons.length > 0) {
      ctx.fillStyle = '#c8a060'; ctx.font = '10px sans-serif';
      ctx.fillText('🪱 ' + pendingCocoons.length + ' cocoon' + (pendingCocoons.length > 1 ? 's' : '') + ' still maturing', cx2, btnY + btnH + 14);
    }
  }

  ctx.globalAlpha = 1;
}

// ── Queue: update pending / unclaimed worms each frame ───────────────────
function updatePendingWorms() {
  var now = Date.now();
  for (var _ui = 0; _ui < pendingWorms.length; _ui++) {
    var _pw = pendingWorms[_ui];
    var _msLeft = _pw.hatchTs - now;

    // Client-side hatch fallback (server sends wormHatched but this catches lag)
    if (!_pw.hatched && _msLeft <= 0) {
      _pw.hatched = true;
      if (_pw.username === username && playerState === 'queued') {
        window._claimPrompt = frame;
      }
    }

    // If this is OUR hatched unclaimed worm — drain gut at 3× speed
    if (_pw.hatched && _pw.username === username && playerState === 'queued') {
      var _drainPF = (OFFLINE_DRAIN_PER_SEC_Q * UNCLAIMED_GUT_BURN) / 60;
      _pw.gutFrac = Math.max(0, (_pw.gutFrac != null ? _pw.gutFrac : 1.0) - _drainPF);
      if (_pw.gutFrac <= 0) {
        postToHost({ type: 'unclaimedWormDied', username: username, x: _pw.x, y: _pw.y });
        pendingWorms.splice(_ui, 1);
        _ui--;
        window._unclaimedSelf  = true;
        window._unclaimedSelfT = frame;
      }
    }
  }
}

// ── NPC Simulation (demo-only) — drives otherPlayers entries that have a .sim ──
// Each NPC gets a mini worm: segments, gut, HP, acid, sleep cycle, waypoint roam.
// NPCs eat nearby scraps, poop castings, sleep, wake — all using the same systems
// the real player uses. They never die; HP floors at 0.1.
// ── Per-worm personality ──────────────────────────────────────────────────
// Seeded from the worm's username so each named worm has a stable, distinct character
// across reloads (mulberry32 PRNG over a string hash). Drives the whole NPC behaviour set
// so the 25 demo worms read as individual players rather than one shared brain.
function _npcPersonality(name, idx) {
  var s = 0, u = name || ('w' + idx);
  for (var i = 0; i < u.length; i++) s = (Math.imul(s, 31) + u.charCodeAt(i)) >>> 0;
  function r() { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  return {
    speed:    0.78 + r() * 0.50,   // crawl speed
    dig:      r(),                  // 0..1 eagerness to dig & drain vs. linger up top feeding
    appetite: 0.45 + r() * 0.50,   // how full before it bothers digging; how far it chases food
    sleepy:   r(),                  // 0..1 nap frequency & length
    wiggle:   0.60 + r() * 0.90,   // head-wiggle amplitude
    restless: r(),                  // 0..1 re-targets & idle-pauses more
    turf:     0.10 + r() * 0.80    // preferred home-x fraction across the bin
  };
}
function updateNPCSims() {
  if (!window._demoMode) return;
  var b2 = getBinCached();

  // ── PERF/correctness: rebuild the carve-able path registry from LIVE paths only ──
  // pathRegistry never had a removal path. Each NPC sim pushes a fresh sim.path on init,
  // so re-inited sims (presence re-sends recreate sims) leaked dead arrays into the
  // registry forever. Every per-frame consumer — the Y-bucket index rebuild, the clog
  // render, nearestPathIdx — walked that growing junk (progressive lag over a session),
  // and stale tunnels polluted routing so drops/junctions attached to tubes that no longer
  // exist. Reset to just the player here; each active (non-dormant) sim re-registers its own
  // path below, so dead/dormant paths fall out and the registry stays bounded to NPC_SIM_CAP+1.
  pathRegistry.length = 1;        // keep pPath at index 0
  _pPathBucketsDirty = true;      // purge stale points from the Y-bucket index this frame

  // ── Thin the herd ──────────────────────────────────────────────────────
  // A single page can't carry a whole server's worth of worms. We SIMULATE (and draw)
  // at most NPC_SIM_CAP of them; the rest are marked dormant and skipped here AND in the
  // draw loops, so sim cost + the shared drop/clog/junction scans scale to the cap.
  // We do NOT remove dormant entries: the teaser re-sends presence for every NPC ~every
  // 2s, so a removed one would be re-added without a .sim and render as a GHOST worm.
  // Demo-only (this whole function is _demoMode-gated); real presence is untouched.
  var _simActive = 0;
  for (var _oi = 0; _oi < otherPlayers.length; _oi++) {
    var opp = otherPlayers[_oi];
    var sim = opp.sim;
    if (!sim) continue; // real player / presence-only — skip
    _simActive++;
    if (_simActive > NPC_SIM_CAP) { opp._dormant = true; continue; } // over cap — don't simulate or draw
    opp._dormant = false;

    // ── Init segments on first tick ────────────────────────────────────────
    if (!sim.segs || !sim.segs.length) {
      sim.segs = [];
      sim.hist = [];
      sim.path = [];   // this NPC's own tunnel trail — never shares pPath
      // (registered every frame below, after the per-frame registry reset at the top)
      // Spawn x arrives as xr*W (a fraction of the VIEWPORT), but the bin is sized to WORLD_W
      // and centered — so on any screen narrower than WORLD_W every worm bunches into a sliver
      // of the bin and then clamps to the wall. Remap the spawn fraction across the actual bin
      // interior so worms spawn spread out across the whole bin width.
      var _b0 = getBinCached();
      var _sxr = Math.max(0, Math.min(1, W ? opp.x / W : 0.5));
      opp.x = (_b0.cx - _b0.bw2 + sim.sr) + _sxr * (_b0.bw - sim.sr * 2);
      for (var _si = 0; _si < sim.nSeg; _si++) {
        sim.segs.push({ x: opp.x - _si * sim.sr * 2, y: opp.y });
        sim.hist.push({ x: opp.x - _si * sim.sr * 2, y: opp.y });
      }
      sim.per = _npcPersonality(opp.username, _oi);
    }

    // Re-register this active NPC's tunnel for routing + render this frame (registry was
    // reset to [pPath] at the top). Each active sim is visited once, so a plain push is safe.
    if (sim.path) pathRegistry.push(sim.path);

    // ── Tube fade + clog lifecycle (mirrors the player's tubes) ──────────────
    // NPC tunnels fill back in over time. When a CLOGGED point fades to alpha 0 it
    // bursts its clog back into poop drops — exactly like the player's tubes. Runs
    // for awake AND sleeping NPCs so tubes always progress toward closing.
    // While ASLEEP the tunnel fills in fast (0.003/frame, every frame) so it visibly
    // closes behind a sleeping worm — exactly like the player's sleep fade. Awake, it
    // decays at the slow background rate, throttled to every 10th frame.
    var _npcFade = sim.sleeping ? 0.003 : (TUNNEL_DECAY_UNCONNECTED * 10);
    if (sim.path && sim.path.length && (sim.sleeping || frame % 10 === 0)) {
      for (var _ntd = 0; _ntd < sim.path.length; _ntd++) {
        var _ntp = sim.path[_ntd];
        if (!_ntp || _ntp.ti !== 2) continue;
        if (_ntp.alpha == null) _ntp.alpha = 1;
        var _ntPrev = _ntp.alpha;
        _ntp.alpha = Math.max(0, _ntp.alpha - _npcFade);
        // Clog self-clears once no fresh poop has landed for ~30s (same gate as player).
        if (_ntp.clog && (frame - (_ntp.clogTs || 0)) > 1800) {
          var _ntClogDecay = (0.00001 + castingEnrichment * 0.00003) * 10;
          _ntp.clog = Math.max(0, _ntp.clog - _ntClogDecay);
        }
        // Tube faded with clog still present. On the PLAYER's tube this bursts the clog
        // back into poop drops so it gets another shot at draining — but NPC tubes are
        // DEAD-ENDS with no sump/drain. A burst here just re-attaches to the same dead end
        // and re-deposits (which re-solidifies the point to alpha 1.0), so it bursts again
        // next fade — an endless drop source (the "tea regenerating in NPC tubes" mess).
        // Instead let faded NPC clog decompose silently into castings — the same fate as
        // poop that falls past the sump floor. No new drops, so the loop can't close.
        if (_ntPrev > 0 && _ntp.alpha === 0 && (_ntp.clog || 0) > 0) {
          castingEnrichment = Math.min(1, castingEnrichment + 0.0005);
          _ntp.clog = 0; // cleared as castings — no burst, no re-deposit loop
        }
      }
    }

    // ── Sleep cycle ────────────────────────────────────────────────────────
    sim.sleepTimer = (sim.sleepTimer || 0) - 1;
    sim.wakeTimer  = (sim.wakeTimer  || 0) - 1;
    if (sim.sleeping) {
      sim.sleepCurl = Math.min(1, (sim.sleepCurl || 0) + 0.03);
      var _scx = sim.segs[0].x, _scy = sim.segs[0].y;
      for (var _sc = 0; _sc < sim.segs.length; _sc++) {
        var _ca = (_sc / sim.segs.length) * Math.PI * 2 * 1.5 * sim.sleepCurl;
        var _cr = sim.sr * 1.2 * sim.sleepCurl * Math.min(1, _sc / 3);
        sim.segs[_sc].x += (_scx + Math.cos(_ca) * _cr - sim.segs[_sc].x) * 0.14;
        sim.segs[_sc].y += (_scy + Math.sin(_ca) * _cr * 0.6 - sim.segs[_sc].y) * 0.14;
      }
      if (inCompost(sim.segs[0].y)) sim.hp = Math.min(1, sim.hp + 0.00002);
      if (sim.wakeTimer <= 0) { sim.sleeping = false; sim.sleepCurl = 0; var _slp = sim.per ? sim.per.sleepy : 0.5; sim.sleepTimer = (3600 - _slp * 2400) + Math.random() * 2400; sim._pathLastX = null; sim._pathLastY = null; }
      opp.sleeping = true;
      opp.x = sim.segs[0].x; opp.y = sim.segs[0].y;
      // ZZZ particles for sleeping NPCs
      if ((frame + _oi * 23) % 90 === 0) {
        pZzz.push({ x: sim.segs[0].x + (Math.random()-0.5)*sim.sr*2, wy: sim.segs[0].y - sim.sr*2, vy: -0.5, alpha: 1, size: 8 + Math.random()*6, char: ['z','z','Z'][Math.floor(Math.random()*3)] });
      }
      continue;
    }
    opp.sleeping = false;
    sim.sleepCurl = Math.max(0, (sim.sleepCurl || 0) - 0.05);
    // Trigger sleep only in compost layer
    if (sim.sleepTimer <= 0 && inCompost(sim.segs[0].y)) {
      var _slp2 = sim.per ? sim.per.sleepy : 0.5; sim.sleeping = true; sim.wakeTimer = (600 + _slp2 * 1400) + Math.random() * 1400; continue;
    }

    // ── Goal-directed AI — eat in the food layer, dig DOWN to drain, climb back, repeat ──
    // Mirrors how a player tends the bin: forage for scraps up in tier 1, then dig a
    // vertical channel down through the compost to the sump to drain, then climb back up
    // to feed again. Each worm gets a ROLE and a DESYNCED timer so the bin always shows a
    // believable mix — several feeding up top, one or two digging, one draining — instead
    // of every worm marching to the sump at once.
    var _binL = b2.cx - b2.bw2 + sim.sr, _binR = b2.cx + b2.bw2 - sim.sr;
    var _fTop  = H + H * 0.22;              // food layer (tier 1) — where ti:1 scraps live
    var _fBot  = 2 * H - sim.sr - 6;        // just above the compost boundary
    var _sumpY = cSurf() - sim.sr - 4;        // just above the sump floor
    if (!sim.per) sim.per = _npcPersonality(opp.username, _oi); // safety if segs pre-existed
    var _per = sim.per;
    if (!sim.aiState) { sim.aiState = 'forage'; sim.aiTimer = Math.floor(Math.random() * 600); }
    sim.aiTimer = (sim.aiTimer || 0) + 1;
    sim.gutMax  = 4 + Math.floor((sim.sr - 4) / 3 * 4);
    var _turfX  = _binL + _per.turf * (_binR - _binL);  // this worm's home patch
    var _wx, _wy;
    if (sim.aiState === 'forage') {
      // Head for the nearest uneaten food scrap (tier 1); else roam the food layer.
      var _bfx = null, _bfy = null, _bfd = Infinity;
      for (var _fsi = 0; _fsi < scraps.length; _fsi++) {
        var _fs = scraps[_fsi];
        if (_fs.eaten || _fs.ti !== 1 || _fs.tutProtected) continue;  // leave the player's staged food
        var _fdx = _fs.x - sim.segs[0].x, _fdy = _fs.y - sim.segs[0].y;
        var _fd2 = _fdx * _fdx + _fdy * _fdy;
        if (_fd2 < _bfd) { _bfd = _fd2; _bfx = _fs.x; _bfy = _fs.y; }
      }
      var _chase = H * (0.9 + _per.appetite * 0.9);  // hungrier worms chase food from farther
      if (_bfx != null && _bfd < _chase * _chase) {
        _wx = _bfx; _wy = _bfy;                       // go eat
      } else {
        // Roam this worm's home turf; restless worms re-pick more often and range wider.
        var _refresh = 220 - Math.floor(_per.restless * 130);
        if (sim._fgx == null || sim.aiTimer % _refresh === 0) {
          var _spread = (_binR - _binL) * (0.12 + _per.restless * 0.28);
          sim._fgx = Math.max(_binL, Math.min(_binR, _turfX + (Math.random() - 0.5) * 2 * _spread));
          sim._fgy = _fTop + Math.random() * (_fBot - _fTop);
        }
        _wx = sim._fgx; _wy = sim._fgy;               // roam the food layer
      }
      // Occasional idle pause — fidgety worms stop to nose around more than calm ones.
      if (sim._pause == null) sim._pause = 0;
      if (sim._pause <= 0 && Math.random() < 0.0016 * (0.4 + _per.restless)) sim._pause = 24 + Math.floor(Math.random() * 46);
      // Decide to drain only occasionally (Poisson-style) so worms stay DESYNCED and most are
      // feeding at any given moment — tenders dig rarely, drillers more often. A hard cap makes
      // a worm that can't find food still drain eventually so nobody loiters forever.
      var _minForage = Math.floor(1500 - _per.dig * 1050);
      var _digProb   = 0.0008 + _per.dig * 0.0042;
      var _fed       = sim.gut >= sim.gutMax * (0.4 + _per.appetite * 0.35);
      var _hardCap   = Math.floor(2900 - _per.dig * 1500);
      if ((sim.aiTimer > _minForage && _fed && Math.random() < _digProb) || sim.aiTimer > _hardCap) {
        sim.aiState = 'dig'; sim.aiTimer = 0;
        sim._digX = Math.max(_binL, Math.min(_binR, sim.segs[0].x + (Math.random() - 0.5) * sim.sr * 3));
      }
    } else if (sim.aiState === 'dig') {
      // Drive straight down a fixed column to the sump → carves a vertical drainage channel.
      _wx = sim._digX; _wy = _sumpY;
      if (sim.segs[0].y >= _sumpY - sim.sr) { sim.aiState = 'drain'; sim.aiTimer = 0; }
      else if (sim.aiTimer > 1100) { sim.aiState = 'return'; sim.aiTimer = 0; } // safety
    } else if (sim.aiState === 'drain') {
      // Hold at the sump — eager diggers work the drain longer than homebodies.
      _wx = sim._digX; _wy = _sumpY;
      if (sim.aiTimer > 60 + _per.dig * 130) { sim.aiState = 'return'; sim.aiTimer = 0; }
    } else { // 'return'
      // Climb back up toward this worm's home turf, then forage again.
      _wx = _turfX + (Math.random() - 0.5) * sim.sr * 2; _wy = _fBot;
      if (sim.segs[0].y <= _fBot) {
        sim.aiState = 'forage'; sim.aiTimer = 0; sim._fgx = null;
      }
    }
    var _wdx = _wx - sim.segs[0].x, _wdy = _wy - sim.segs[0].y;
    var _wd  = Math.sqrt(_wdx * _wdx + _wdy * _wdy);

    // ── Eat nearby scraps — steer toward them too ─────────────────────────
    sim.gutMax = 4 + Math.floor((sim.sr - 4) / 3 * 4);
    if (sim.gut < sim.gutMax) {
      for (var _sci = 0; _sci < scraps.length; _sci++) {
        var _s = scraps[_sci];
        if (_s.eaten || _s.ti !== 1 || _s.tutProtected) continue;  // leave the player's staged food
        var _sdx = sim.segs[0].x - _s.x, _sdy = sim.segs[0].y - _s.y;
        if (Math.sqrt(_sdx * _sdx + _sdy * _sdy) < sim.sr * 3) {
          _s.hp -= 0.04;
          if (_s.hp <= 0) {
            _s.eaten = true;
            sim.gut = Math.min(sim.gutMax, sim.gut + 0.5);
            if (_s.t && _s.t.name === 'egg_shell') sim.acid = Math.max(0, sim.acid - 0.15);
            else if (_s.t && _s.t.acid) sim.acid = Math.min(1, sim.acid + _s.t.acid * 0.01);
          }
          if (sim.aiState === 'forage') {
            _wx = _s.x; _wy = _s.y;
            _wdx = _wx - sim.segs[0].x; _wdy = _wy - sim.segs[0].y;
            _wd  = Math.sqrt(_wdx * _wdx + _wdy * _wdy);
          }
          break;
        }
      }
    }

    // ── Poop when gut >80% in compost ────────────────────────────────────
    sim.poopTimer = (sim.poopTimer || 0) - 1;
    if (sim.gut >= sim.gutMax * 0.8 && sim.poopTimer <= 0 && inCompost(sim.segs[0].y) && drops.length < MAX_DROPS * 0.8) {
      // Poop as a tube-routing isPoop drop (like the player) so NPC waste flows into
      // whichever tube is nearest — its own, another NPC's, or the player's tunnels.
      var _npGutFrac = sim.gutMax > 0 ? sim.gut / sim.gutMax : 0;
      var _ptail = sim.segs[Math.max(0, sim.segs.length - 2)];
      dropsPush({
        x:              _ptail.x + (Math.random() - 0.5) * 6,
        y:              _ptail.y,
        vy:             0.8 + Math.random() * 0.5,
        sz:             sim.sr * (0.5 + Math.random() * 0.4),
        active:         true,
        isPoop:         true,
        clogAmt:        0.12 + _npGutFrac * 0.16,
        enteredCompost: inCompost(_ptail.y)
      });
      sim.gut = Math.max(0, sim.gut - sim.gutMax * 0.6);
      sim.poopTimer = 300 + Math.random() * 600;
      sim.poopFlash = 30;
    }

    // ── HP/acid bleed (NPCs never die) ───────────────────────────────────
    sim.acid = Math.max(0, sim.acid - 0.0001);
    if (sim.acid > 0.3) sim.hp = Math.max(0.1, sim.hp - 0.0001);
    if (sim.gut <= 0)   sim.hp = Math.max(0.1, sim.hp - 0.0001);

    // ── Move head toward target ──────────────────────────────────────────
    if (sim._pause == null) sim._pause = 0;
    if (sim._pause > 0) sim._pause--;
    if (_wd > 2) {
      var _dn = _wd || 1;
      var _fx = _wdx / _dn, _fy = _wdy / _dn;
      var _px = -_fy, _py = _fx;
      var _sa = Math.sin(frame * 0.07 + _oi * 1.3) * (sim.aiState === 'dig' ? 0.025 : 0.08) * _per.wiggle;
      // Per-worm crawl speed; an idle pause slows it to a near-stop for a beat.
      var _spd = 0.35 * _per.speed * (sim._pause > 0 ? 0.18 : 1);
      sim.segs[0].x += _fx * _spd + _px * _sa;
      sim.segs[0].y += _fy * _spd + _py * _sa;
    }
    sim.segs[0].x = Math.max(b2.cx - b2.bw2 + sim.sr, Math.min(b2.cx + b2.bw2 - sim.sr, sim.segs[0].x));
    sim.segs[0].y = Math.max(H * 0.8, Math.min(cSurf() - sim.sr, sim.segs[0].y));

    // ── Segment chain — history ring buffer ──────────────────────────────
    sim.hist.push({ x: sim.segs[0].x, y: sim.segs[0].y });
    var _spacing = sim.sr * 1.4;
    var _needed  = sim.nSeg * Math.ceil(_spacing) + 100;
    while (sim.hist.length > _needed) sim.hist.shift();
    for (var _i = 1; _i < sim.segs.length; _i++) {
      var _tgt = _i * _spacing, _cum = 0, _placed = false;
      for (var _j = sim.hist.length - 1; _j > 0; _j--) {
        var _ddx = sim.hist[_j].x - sim.hist[_j-1].x, _ddy = sim.hist[_j].y - sim.hist[_j-1].y;
        _cum += Math.sqrt(_ddx * _ddx + _ddy * _ddy);
        if (_cum >= _tgt) { sim.segs[_i].x = sim.hist[_j].x; sim.segs[_i].y = sim.hist[_j].y; _placed = true; break; }
      }
      if (!_placed && sim.hist.length) { sim.segs[_i].x = sim.hist[0].x; sim.segs[_i].y = sim.hist[0].y; }
    }

    // ── Carve tunnel as NPC moves through compost ────────────────────────
    // Each NPC carves into its OWN path array (sim.path), registered in pathRegistry
    // so drops route through it. As it roams it auto-junctions into nearby tubes on
    // any other path (player or another NPC) — see the auto-junction block below.
    var _nHx = sim.segs[0].x, _nHy = sim.segs[0].y;
    var _nmx = _nHx - (sim._lastX || _nHx), _nmy = _nHy - (sim._lastY || _nHy);
    var _nmoved = Math.sqrt(_nmx*_nmx + _nmy*_nmy);
    if (_nmoved > 0.1) {
      // Seed the carve anchor ONCE, then keep it stable (mirrors the player's pLastX).
      // The old code passed last-FRAME position as the anchor every frame, so dd was
      // always ~one frame of movement — below addPoint's min-distance — and the anchor
      // (only advanced on a successful carve) was deadlocked. NPCs never carved at all.
      // With a stable anchor, dd accumulates each frame until a point lands, then the
      // anchor advances to it — exactly how the player's tube carves.
      if (sim._pathLastX == null) { sim._pathLastX = _nHx; sim._pathLastY = _nHy; }
      var _carved = addPoint(sim.path, _nHx, _nHy, sim.sr * 0.85, sim._pathLastX, sim._pathLastY);
      if (_carved) {
        sim._pathLastX = _nHx; sim._pathLastY = _nHy;
        // ── NPC auto-junction — link this tube into a nearby tube on ANY other
        //    path (player or another NPC) as the NPC roams. Throttled per NPC.
        sim._jcool = (sim._jcool || 0) - 1;
        if (sim._jcool <= 0) {
          var _naProx = sim.sr * 2;
          var _naFoundArr = null, _naFoundIdx = -1, _naBestD = Infinity;
          // Spatial lookup: scan only the Y-buckets overlapping the proximity box instead of
          // every point in every path. This keeps the search O(local) so it can't ramp with
          // total tunnel length — the all-points version here was the main lag-over-time cause.
          var _najkMin = _pPathBucketKey(_nHy - _naProx), _najkMax = _pPathBucketKey(_nHy + _naProx);
          for (var _najk = _najkMin; _najk <= _najkMax; _najk++) {
            var _najBkt = _pPathBuckets[_najk];
            if (!_najBkt) continue;
            for (var _najbi = 0; _najbi < _najBkt.length; _najbi++) {
              var _naEnt = _najBkt[_najbi];
              if (_naEnt.arr === sim.path) continue; // never junction into own tube
              var _nap = _naEnt.arr[_naEnt.idx];
              if (!_nap) continue;
              var _naa = _nap.alpha != null ? _nap.alpha : 1;
              if (_naa <= 0) continue;
              var _nadx = Math.abs(_nap.x - _nHx), _nady = Math.abs(_nap.y - _nHy);
              if (_nadx > _naProx || _nady > _naProx) continue;
              var _naUsed = false;
              for (var _naui = 0; _naui < junctionUsedPoints.length; _naui++) {
                var _nau = junctionUsedPoints[_naui];
                if (Math.abs(_nau.x - _nap.x) < sim.sr * 3 && Math.abs(_nau.y - _nap.y) < sim.sr * 3) { _naUsed = true; break; }
              }
              if (_naUsed) continue;
              var _nad = _nadx + _nady;
              if (_nad < _naBestD) { _naBestD = _nad; _naFoundArr = _naEnt.arr; _naFoundIdx = _naEnt.idx; }
            }
          }
          if (_naFoundArr) {
            // Stamp a junction on the NPC's own tube targeting the foreign point, then
            // seal the segment (null) so the link reads as its own connector.
            sim.path.push({ x: _nHx, y: _nHy, r: sim.sr, ti: 2, junctionTarget: { arr: _naFoundArr, idx: _naFoundIdx } });
            sim.path.push(null);
            sim._pathLastX = null; sim._pathLastY = null;
            junctionUsedPoints.push({ x: _nHx, y: _nHy });
            if (junctionUsedPoints.length > 200) junctionUsedPoints.shift(); // bound growth
            sim._jcool = 240 + Math.floor(Math.random() * 240); // ~4-8s before the next auto-junction
          } else {
            // MISS: still set a cooldown so this scan can't run on every single carve. Without
            // this, a worm digging in open compost (no foreign tube nearby) left _jcool <= 0 and
            // re-scanned every carve — the frequency multiplier behind the lag-over-time.
            sim._jcool = 45 + Math.floor(Math.random() * 45);
          }
        }
      }
    }
    sim._lastX = _nHx; sim._lastY = _nHy;

    // ── Sync back to otherPlayers ─────────────────────────────────────────
    opp.x = sim.segs[0].x; opp.y = sim.segs[0].y;
    opp.targetX = sim.segs[0].x; opp.targetY = sim.segs[0].y;
  }
}

function loop() {
  window._loopRunning = true;
  if (!W || !H) { requestAnimationFrame(loop); return; }
  var _pt0 = _PERF ? performance.now() : 0;
  frame++;
  // dayTime changes by ~0.0000116 per frame — imperceptible to update once per second.
  // Throttle the new Date() allocation to every 60 frames instead of every frame.
  if (frame % 60 === 0) dayTime = getRealDayTime();
  tickWeather();
  if (frame % 600 === 0) updateWeatherSim();
  try { updateCocoons(); } catch(e) { showErr('updateCocoons: '+e.message); }
  try { updatePendingWorms(); } catch(e) { showErr('updatePendingWorms: '+e.message); }
  try { updatePlayer(); } catch(e) { showErr('updatePlayer: '+e.message); }
  try { updateNPCSims(); } catch(e) { showErr('updateNPCSims: '+e.message); }
  try { updatePhysics(); } catch(e) { showErr('updatePhysics: '+e.message); }
  // ── Drift + fade ALL ZZZ particles every frame (player AND NPC sleepers) ──
  // This used to live inside the player-sleep block, so NPC z's spawned while the player
  // was awake never faded and piled up forever. Running it here makes every z drift up and
  // fade at the same rate the player's always have.
  for (var _zzi = pZzz.length - 1; _zzi >= 0; _zzi--) {
    pZzz[_zzi].wy += pZzz[_zzi].vy;
    pZzz[_zzi].alpha -= 0.004;
    pZzz[_zzi].x += Math.sin(frame * 0.05 + _zzi) * 0.3;
    if (pZzz[_zzi].alpha <= 0) pZzz.splice(_zzi, 1);
  }
  // ── View mode camera — lerps camY toward viewCamY when free-scrolling ──
  if (viewMode) {
    var _camMax = cSurf() + H*0.25 - H + 120;
    viewCamY = Math.max(0, Math.min(_camMax, viewCamY));
    camY += (viewCamY - camY) * 0.12;
    camY = Math.round(camY);
  }
  var _pt1 = _PERF ? performance.now() : 0;
  try { draw(); } catch(e) { showErr('draw: '+e.message); }
  if (_PERF) {
    var _pt2 = performance.now();
    _perf.sim  = _perf.sim  * 0.9 + (_pt1 - _pt0) * 0.1;
    _perf.draw = _perf.draw * 0.9 + (_pt2 - _pt1) * 0.1;
    if (_perf.last) _perf.fps = _perf.fps * 0.9 + (1000 / Math.max(1, _pt2 - _perf.last)) * 0.1;
    _perf.last = _pt2;
    var _na = 0, _i; for (_i = 0; _i < otherPlayers.length; _i++) if (otherPlayers[_i].sim && !otherPlayers[_i]._dormant) _na++;
    var _txt = 'FPS ' + _perf.fps.toFixed(0) + '  sim ' + _perf.sim.toFixed(1) + '  draw ' + _perf.draw.toFixed(1) + '  npc ' + _na + '/' + otherPlayers.length + '  drops ' + drops.length;
    ctx.save(); ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    var _w = ctx.measureText(_txt).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(4, 4, _w, 18);
    ctx.fillStyle = (_perf.fps < 45 ? '#ff6b6b' : '#7CFC00'); ctx.fillText(_txt, 10, 17);
    ctx.restore();
  }
  requestAnimationFrame(loop);
}
function showErr(msg) {
  if (!window._lastErr || window._lastErr !== msg) {
    window._lastErr = msg;
    console.error(msg);
    var d = document.getElementById('_err');
    if (d) d.textContent = msg;
  }
}

function respawnPlayer(usedKarma) {
  var b0 = getBin();

  // Find oldest matured cocoon owned by player
  var hatchIdx = -1;
  var oldestLaid = Infinity;
  for (var ci2 = 0; ci2 < cocoons.length; ci2++) {
    var co2 = cocoons[ci2];
    if (co2.owner === username && co2.matured && co2.laid < oldestLaid) {
      hatchIdx = ci2; oldestLaid = co2.laid;
    }
  }

  var respawnX, respawnY;
  if (hatchIdx >= 0) {
    // Hatch from cocoon position
    respawnX = cocoons[hatchIdx].x;
    respawnY = cocoons[hatchIdx].y;
    cocoons.splice(hatchIdx, 1); // consume cocoon
    // Hatch with decent stats — you earned it
    pHP = 1.0;
    pGut = pGutMax * 0.25; // full health on hatch, gut at 25% — alive but hungry
    pSR = Math.max(4, Math.floor(pSR * 0.6)); // smaller but not tiny
    pSEG = Math.max(4, Math.floor(pSEG * 0.6));
    // Keep karma — cocoon hatch is a dignified respawn
  } else if (usedKarma) {
    // Legacy karma buyback (kept for NPC gifting flow later)
    respawnX = b0.cx;
    respawnY = H * 1.5;
    karma = Math.max(0, karma - DEATH_KARMA_COST);
    pHP = 1.0; pGut = pGutMax * 0.20; // full health, hungry
  } else {
    // Baby respawn — full reset except karma (karma always persists)
    respawnX = b0.cx;
    respawnY = H * 1.5;
    pGut = 0; pHP = 1.0;
    pEaten = 0; pSR = 4; pSEG = 4;
    bornTs = Date.now(); // new life — stamp birth time
    // Reset the worm state — bin world persists (persistent game)
  }

  pSegs = []; pHist = []; pPath = []; pLastX = -999; pLastY = -999;
  pAcid = 0;
  drainDownTimer = 0; drainUpTimer = 0; drainDownCooldown = 0;
  window._sumpHadDown = null; window._upDrainBonusFired = false;
  deathCause = '';
  for (var ri = 0; ri < 20; ri++) pHist.push({x: respawnX, y: respawnY});
  for (var ri = 0; ri < Math.max(4, pSEG); ri++) pSegs.push({x: respawnX - ri * pSR * 2, y: respawnY});
  mX = respawnX; mY = respawnY;
  camX = (W >= WORLD_W) ? 0 : Math.max(0, respawnX - W/2); // snap camera to worm on respawn
  deathScreen = false; deathFade = 0;
}

function tryLayCocoon() {
  if (!pSegs.length || deathScreen) return;
  var head = pSegs[0];
  var now = Date.now();

  // Must be in the dark compost zone (lower half of tier 2)
  if (head.y < (2*H + 0.70*(cSurf()-2*H))) { window._cocoonMsg = 'Must be deeper in the compost to lay'; window._cocoonMsgT = frame; return; }

  // Thresholds
  if (karma < COCOON_KARMA_REQ) { window._cocoonMsg = 'Need ' + COCOON_KARMA_REQ + ' karma (have ' + Math.floor(karma) + ')'; window._cocoonMsgT = frame; return; }

  // Weekly cooldown
  if (lastCocoonLaid > 0 && (now - lastCocoonLaid) < COCOON_WEEK_MS) {
    var daysLeft = Math.ceil((COCOON_WEEK_MS - (now - lastCocoonLaid)) / (24*60*60*1000));
    window._cocoonMsg = daysLeft + 'd until next cocoon'; window._cocoonMsgT = frame; return;
  }

  // Max cap
  var myCocoons = cocoons.filter(function(c) { return c.owner === username; });
  if (myCocoons.length >= COCOON_MAX) { window._cocoonMsg = 'Max cocoons banked (' + COCOON_MAX + ')'; window._cocoonMsgT = frame; return; }

  // Lay it
  cocoons.push({
    x: head.x + (Math.random()-0.5)*20,
    y: Math.max((2*H + 0.70*(cSurf()-2*H)), Math.min((2*H + 0.95*(cSurf()-2*H)), head.y + pSR + 8)),
    owner: username,
    laid: now,
    gifted: false,
    matured: false,
    pulse: 0
  });
  lastCocoonLaid = now;
  if (tutorial.scene) tutorial._cocoonDone = true;   // cocoon beat satisfied

  // Cost — hunger drain + brief slowdown
  pGut = Math.max(0, pGut - pGutMax * 0.20); // laying a cocoon costs gut energy
  window._cocoonMsg = '🪱 Cocoon laid!'; window._cocoonMsgT = frame;
}



function trySleep() {
  if (!pSegs.length) return;
  if (deathScreen) return;

  if (pSleeping) {
    // Final tutorial beat: don't let the player wake out of 'Look Around' or the
    // done card. They should scroll to finish, then go straight to the end screen —
    // waking here drops viewMode and the viewscroll beat could never complete.
    if (tutorial.active && tutorial.scene) {
      if (tutorial.done) { _tutFinish(); return; }                       // done card up — wake attempt ends the tutorial
      var _cs = tutorial.steps && tutorial.steps[tutorial.stepIndex];
      if (_cs && _cs.kind === 'viewscroll') return;                      // stay asleep — must scroll to finish
    }
    // Wake up — exit free-scroll, re-lock camera to worm
    pSleeping = false;
    pSleepCurl = 0;
    pZzz = [];
    pPath = []; pLastX = -999; pLastY = -999; // clear faded path, start fresh
    mX = pSegs[0].x;
    mY = pSegs[0].y;
    viewMode = false;
    return;
  }

  // Must be in tier 2 or deeper to sleep safely
  var tier = getTier(pSegs[0].y);
  if (tier < 2) {
    // Flash a warning — can't sleep here
    window._sleepWarning = frame;
    return;
  }

  // Lock position and begin sleep — enter free-scroll view mode
  pSleeping = true;
  pSleepX = pSegs[0].x;
  pSleepY = pSegs[0].y;
  pSleepCurl = 0;
  pZzz = [];
  viewMode = true;
  viewCamY = camY; // start scroll at current camera position
}

function tryPoop() {
  if (!pSegs.length) return;
  if (pGut <= 0) return; // nothing in the tank
  if (frame - pLastPoop < POOP_COOLDOWN) return;
  pLastPoop = frame;
  if (tutorial.scene) tutorial._reliefPooped = true;   // any poop relieves a full gut (tutorial relief beat)

  // Body size factor: pSEG goes 4→20, pSR goes 4→7
  // Tiny worm (4 segs) = very small deposits; fat worm (20 segs) = full size
  var bodyFrac = Math.max(0.1, (pSEG - 4) / 16); // 0 at min size, 1 at max
  var gutFrac = pGut / pGutMax;

  // numLumps and lumpSz kept for the poop drop size calculation below
  var numLumps = 1 + Math.floor(gutFrac * bodyFrac * 2);
  var lumpSz = 1.5 + bodyFrac * 2.5 + gutFrac * 2;

  // Spawn poop drops at the worm's tail segments regardless of tier.
  // Drops free-fall and let the tunnel-scan in updatePhysics() attach them
  // to the nearest path point naturally — same as tea. No forced pathIdx at spawn.
  // enteredCompost is pre-set when already in compost so pooled isn't double-counted.
  if (pSegs.length) {
    var _alreadyInCompost = inCompost(pSegs[0].y);
    for (var i = 0; i < numLumps; i++) {
      var _pseg = pSegs[Math.max(0, pSegs.length - 1 - i)];
      var _sz = lumpSz * (0.7 + Math.random() * 0.6);
      dropsPush({
        x:              _pseg.x + (Math.random()-0.5) * 6,
        y:              _pseg.y,
        vy:             0.8 + Math.random() * 0.5,
        sz:             _sz,
        active:         true,
        isPoop:         true,
        clogAmt:        0.12 + gutFrac * 0.16,
        enteredCompost: _alreadyInCompost
      });
    }
  }

  if (pGut > 0) {
    var sizeFrac = (pSEG - 4) / 16; // 0.0 at baby (4 segs), 1.0 at max (20 segs)
    var deposited = pGut * 0.5;
    // Poop karma: scales with gut fill and worm size, 1–40 range
    var poopScore = Math.max(1, Math.round(deposited * (1 + sizeFrac * 4)));
    karma += poopScore;
    pLastPoopScore = poopScore;

    // ── Tier 2 depth bonus — pooping deeper in compost gives extra karma ────
    var headTierP = getTier(pSegs[0].y);
    if (headTierP >= 2) {
      if (tutorial.scene) tutorial._compostPooped = true;   // poop beat — the rewarding compost poop landed
      var depthT = Math.min(1, (pSegs[0].y - 2*H) / (cSurf() - 2*H));
      var depthMult = 0.3 + Math.pow(depthT, 1.8) * 0.7;
      var enrichGain = deposited * 0.008 * depthMult * (1 + sizeFrac);
      castingEnrichment = Math.min(1, castingEnrichment + enrichGain);
      var bonusScore = Math.round(enrichGain * 1000 * (1 + castingEnrichment));
      karma += bonusScore;
    }

    pGut = pGut * 0.5;
  }

  pPooping = true;
  setTimeout(function() { pPooping = false; }, 400);

}

// Convert a CSS pixel position (relative to root) to logical canvas coordinates.
// Convert client coords → canvas screen coords, then add camera offset for world coords.
// _toCanvas returns screen-space coords. Add camX/camY to get world coords.
function _toCanvas(clientX, clientY) {
  var r = root.getBoundingClientRect();
  return {
    x: clientX - r.left,
    y: clientY - r.top
  };
}

root.addEventListener('mousemove', function(e) {
  var p = _toCanvas(e.clientX, e.clientY);
  mX = p.x - centreOffsetX + camX;
  mY = p.y + camY;
});

// Mouse wheel — scrolls the bin in viewMode
root.addEventListener('wheel', function(e) {
  if (!viewMode) return;
  e.preventDefault();
  viewCamY += e.deltaY * 0.8;
}, { passive: false });
root.addEventListener('click', function(e) {
  var _cp = _toCanvas(e.clientX, e.clientY);
  var cx = _cp.x - centreOffsetX + camX;
  var cy = _cp.y;
  if (!viewMode) { mX = cx + camX; mY = cy + camY; } // don't steer worm while scrolling

  

  // ── Claim worm button (queued state) ──────────────────────────────────
  if (playerState === 'queued' && window._claimBtn) {
    var _cb = window._claimBtn;
    if (cx >= _cb.x && cx <= _cb.x+_cb.w && cy >= _cb.y && cy <= _cb.y+_cb.h) {
      var _myPWC = _findPendingWorm(username);
      if (_myPWC && _myPWC.hatched) {
        postToHost({ type: 'claimWorm', username: username });
      }
      return;
    }
  }



  // Wake from sleep on any tap
  if (pSleeping) { trySleep(); return; }

  // FEAT-2: Conflict overlay — intercept tap to handle Take Over / Wait
  if (deviceConflictActive) {
    var _cW = Math.min(W * 0.85, 320), _cH = 160;
    var _cX = W/2 - _cW/2, _cY = H/2 - _cH/2;
    var _takeW = (_cW - 48) / 2, _takeH = 40;
    var _takeBtn  = {x: _cX + 16,             y: _cY + _cH - 56, w: _takeW, h: _takeH};
    var _waitBtn  = {x: _cX + 16 + _takeW + 16, y: _cY + _cH - 56, w: _takeW, h: _takeH};
    function _cInBox(b) { return cx >= b.x && cx <= b.x+b.w && cy >= b.y && cy <= b.y+b.h; }
    if (_cInBox(_takeBtn)) {
      // Player chose to take over — notify host, receive session
      deviceConflictActive = false;
      postToHost({ type: 'deviceTakeover' });
    }
    // Wait button: do nothing (dismiss overlay, let other device keep playing)
    if (_cInBox(_waitBtn)) {
      deviceConflictActive = false;
    }
    return;
  }

  // Tutorial done card — tap cuts straight to the end screen
  if (tutorial.done) { _tutFinish(); return; }

  // Death screen — single smart respawn button
  if (deathScreen) {
    var _panelH2 = 240, _btnW2 = Math.min(W * 0.85 * 0.8, 260), _btnH2 = 44;
    var _py2 = H/2 - _panelH2/2;
    var _btn2 = {x: W/2 - _btnW2/2, y: _py2 + 126, w: _btnW2, h: _btnH2};
    function _clickInBtn(b) { return cx >= b.x && cx <= b.x+b.w && cy >= b.y && cy <= b.y+b.h; }
    if (_clickInBtn(_btn2)) {
      var _binFull2 = cocoons.length >= COCOON_MAX * 4;
      if (_binFull2) {
        // Bin full — Join Queue (only if not already queued)
        if (playerState !== 'queued') {
          playerState = 'queued';
          postToHost({ type: 'joinQueue', username: username });
        }
      } else if (cocoons.some(function(c){ return c.owner===username && c.matured; })) {
        respawnPlayer(true);
      } else {
        respawnPlayer(false);
      }
    }
    return;
  }

});

// Touch: single finger = move worm, two fingers = poop
// ── Gesture state ─────────────────────────────────────────────────────────
// Strategy: resolve gestures in touchend/touchcancel, not touchstart.
// touchstart only records finger-down data. This avoids multi-finger conflicts
// where each finger fires a separate touchstart event sequentially.
var _gesture = {
  // Long-press (sleep)
  lpTimer:    null,
  lpStartX:   0,
  lpStartY:   0,
  lpActive:   false,
  lpStart:    0,
  lpDur:      600,

  // Peak finger count during this touch sequence (reset when all fingers lift)
  peakCount:  0,

  // Swipe-up (cocoon)
  swipeStartX: 0,
  swipeStartY: 0,
  swipeStartT: 0,
  swipeLive:   false,   // only true for single-finger sequences
};

// Draw long-press ring — called from draw() each frame
function drawLongPressRing() {
  if (!_gesture.lpActive) return;
  var prog = Math.min(1, (performance.now() - _gesture.lpStart) / _gesture.lpDur);
  var cx3 = _gesture.lpStartX, cy3 = _gesture.lpStartY;
  var r3 = 28;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx3, cy3, r3, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 0.90;
  ctx.strokeStyle = pSleeping ? '#88ffaa' : '#ffe066';
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx3, cy3, r3, -Math.PI/2, -Math.PI/2 + Math.PI*2*prog);
  ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pSleeping ? '☀️' : '😴', cx3, cy3);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function _cancelLP() {
  if (_gesture.lpTimer) { clearTimeout(_gesture.lpTimer); _gesture.lpTimer = null; }
  _gesture.lpActive = false;
}

root.addEventListener('touchmove', function(e) {
  e.preventDefault();
  var _tp = _toCanvas(e.touches[0].clientX, e.touches[0].clientY);
  var tx = _tp.x;
  var ty = _tp.y;

  if (viewMode && pSleeping) {
    // Drag to scroll — move viewCamY opposite to finger direction
    if (_gesture._viewDragLastY != null) {
      viewCamY -= (ty - _gesture._viewDragLastY);
    }
    _gesture._viewDragLastY = ty;
    // Cancel the wake long-press if finger drifts more than 15px
    if (_gesture.lpActive) {
      var _vdx = tx - _gesture.lpStartX;
      var _vdy = ty - _gesture.lpStartY;
      if (Math.sqrt(_vdx*_vdx + _vdy*_vdy) > 15) _cancelLP();
    }
    return;
  }

  mX = tx - centreOffsetX + camX;
  mY = ty + camY;
  // Cancel long-press if first finger drifts > 15px
  if (_gesture.lpActive) {
    var dx3 = mX - _gesture.lpStartX;
    var dy3 = ty - _gesture.lpStartY;
    if (Math.sqrt(dx3*dx3 + dy3*dy3) > 15) _cancelLP();
  }
}, {passive: false});

root.addEventListener('touchstart', function(e) {
  e.preventDefault();
  var r   = root.getBoundingClientRect();
  var _tsp = _toCanvas(e.touches[0].clientX, e.touches[0].clientY);
  var tx  = _tsp.x;
  var ty  = _tsp.y;
  var now = performance.now();
  var n   = e.touches.length; // total fingers NOW on screen
  // Only steer on first finger — additional fingers are gestures (poop, avatar)
  // and must not jerk the worm toward the new touch point.
  if (n === 1) { mX = tx - centreOffsetX + camX; mY = ty + camY; }

  // Track peak finger count for this sequence
  if (n > _gesture.peakCount) _gesture.peakCount = n;

  // ── Claim worm button (queued state) ──────────────────────────────────
  if (playerState === 'queued' && window._claimBtn) {
    var _cbt = window._claimBtn;
    if (tx >= _cbt.x && tx <= _cbt.x+_cbt.w && ty >= _cbt.y && ty <= _cbt.y+_cbt.h) {
      var _myPWT = _findPendingWorm(username);
      if (_myPWT && _myPWT.hatched) {
        postToHost({ type: 'claimWorm', username: username });
      }
      return;
    }
  }

  // ── View mode (already sleeping) — seed drag tracking + long-press to wake ─
  if (viewMode && pSleeping) {
    _gesture._viewDragLastY = ty;
    _gesture._viewDragMoved = false;
    _gesture._viewTapStartY = ty;
    // Also start the long-press timer so a 600ms hold wakes the worm
    _gesture.lpStartX  = tx;
    _gesture.lpStartY  = ty;
    _gesture.lpStart   = now;
    _cancelLP();
    _gesture.lpActive  = true;
    _gesture.lpTimer   = setTimeout(function() {
      if (_gesture.lpActive) { _cancelLP(); trySleep(); }
    }, _gesture.lpDur);
    return;
  }

  // Tutorial done card — tap cuts straight to the end screen
  if (tutorial.done) { _tutFinish(); return; }

  // ── Death screen ────────────────────────────────────────────────────────
  if (deathScreen) {
    var _panelH3 = 240, _btnW3 = Math.min(W * 0.85 * 0.8, 260), _btnH3 = 44;
    var _py3 = H/2 - _panelH3/2;
    var _btn3 = {x: W/2-_btnW3/2, y: _py3+126, w: _btnW3, h: _btnH3};
    function _touchInBtn(b) { return tx>=b.x && tx<=b.x+b.w && ty>=b.y && ty<=b.y+b.h; }
    if (_touchInBtn(_btn3)) {
      var _binFull3 = cocoons.length >= COCOON_MAX * 4;
      if (_binFull3) {
        // Bin full — Join Queue (only if not already queued)
        if (playerState !== 'queued') {
          playerState = 'queued';
          postToHost({ type: 'joinQueue', username: username });
        }
      } else if (cocoons.some(function(c){ return c.owner===username && c.matured; })) {
        respawnPlayer(true);
      } else {
        respawnPlayer(false);
      }
    }
    return;
  }


  // ── Long-press + swipe tracking — only start on first finger down ───────
  if (n === 1) {
    _gesture.peakCount  = 1;
    _gesture.lpStartX   = tx;
    _gesture.lpStartY   = ty;
    _gesture.lpStart    = now;
    _cancelLP(); // clear any stale timer first
    _gesture.lpActive   = true;
    _gesture.swipeStartX = tx;
    _gesture.swipeStartY = ty;
    _gesture.swipeStartT = now;
    _gesture.swipeLive   = true;
    _gesture.lpTimer = setTimeout(function() {
      if (_gesture.lpActive) {
        _cancelLP();
        trySleep();
        // Mark that sleep was just triggered by long-press — the finger-lift
        // that immediately follows must not wake the worm again.
        _gesture._justSlept = true;
      }
    }, _gesture.lpDur);
  }

  // Cancel long-press the moment a second finger lands
  if (n >= 2) _cancelLP();

}, {passive: false});

root.addEventListener('touchend', function(e) {
  e.preventDefault();
  var r   = root.getBoundingClientRect();
  var now = performance.now();
  var remaining = e.touches.length; // fingers still down after this lift

  _cancelLP();

  // ── View mode — resolve tap-to-wake or end of scroll drag ───────────────
  if (viewMode && pSleeping && remaining === 0) {
    _gesture._viewDragLastY = null;
    _gesture._viewDragMoved = false;
    _gesture._viewTapStartY = null;
    _gesture.peakCount = 0;
    // Ignore the finger-lift that ended the long-press that triggered sleep
    if (_gesture._justSlept) {
      _gesture._justSlept = false;
      return;
    }
    // Wake is handled by the long-press timer in touchstart (same 600ms hold)
    // A short tap while sleeping just scrolls / does nothing — intentional.
    return;
  }

  // All fingers lifted — resolve gesture from peak count
  if (remaining === 0) {
    var peak = _gesture.peakCount;
    _gesture.peakCount = 0;

    // Single short tap on drain button (not a swipe, not sleeping)
    if (peak === 1 && _gesture.swipeLive) {
      // swipeLive is still true here for short taps — check travel distance
      var _te0 = _toCanvas(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      var ex0  = _te0.x;
      var ey0  = _te0.y;
      var dyT  = Math.abs(_gesture.swipeStartY - ey0);
      var dxT  = Math.abs(_gesture.swipeStartX - ex0);
      var dtT  = now - _gesture.swipeStartT;
      var isTap = dyT < 20 && dxT < 20 && dtT < 350;
    }

    if (peak === 3) {
      // ── Three-finger tap — avatar cycle ──────────────────────────────────
      avatarMode = (avatarMode + 1) % 3;

    } else if (peak === 2) {
      // ── Two-finger tap — poop ─────────────────────────────────────────────
      tryPoop();

    } else if (peak === 1 && _gesture.swipeLive) {
      // ── Single finger — check for swipe-up (cocoon) ───────────────────────
      var _te1 = _toCanvas(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      var ex  = _te1.x;
      var ey  = _te1.y;
      var dyS = _gesture.swipeStartY - ey;
      var dxS = Math.abs(ex - _gesture.swipeStartX);
      var dtS = now - _gesture.swipeStartT;
      if (dyS > 60 && dxS < 60 && dtS < 400) {
        tryLayCocoon();
      }
    }
    _gesture.swipeLive = false;
  }
}, {passive: false});

root.addEventListener('touchcancel', function() {
  _cancelLP();
  _gesture._justSlept = false;
  _gesture.peakCount = 0;
  _gesture.swipeLive = false;
}, {passive: false});

// ── Avatar display mode — toggle with N key ───────────────────────────────
// 0 = Snoo (drawn canvas Snoo, or real avatar when Devvit connected)
// 1 = Username text label
// 2 = Nothing (clean / immersive mode)
var avatarMode = 0;  // 0=Snoo 1=Names 2=Hidden

// ── Real Reddit avatar support ────────────────────────────────────────────
// TODO (Devvit integration): When wiring up the Devvit layer, do this server-side:
//
//   const user = await context.reddit.getCurrentUser();
//   const aboutRes = await fetch(`https://www.reddit.com/user/${user.username}/about.json`);
//   const avatarUrl = aboutRes.data?.subreddit?.icon_img || user.iconImg;
//   context.ui.webView.postMessage({ type: 'setPlayerAvatar', url: avatarUrl });
//
//   For other players, broadcast their avatar URLs via Devvit Realtime:
//   context.realtime.send('presence', { username, avatarUrl, ... });
//
// The listener below is ready to receive those messages and swap in real images.

var playerAvatarImg = null;   // loaded Image for the current player

// ── Debug mode — password-protected toggle ────────────────────────────────
// Type the secret sequence anywhere to open the password prompt.
// Password toggles DEBUG_MODE on/off without a reload.
// State persists in localStorage across refreshes during development.
// ⚠ Set DEBUG_PASSWORD to something strong before shipping.
var DEBUG_PASSWORD   = 'wigglers2025';      // ← change this before production
var DEBUG_TRIGGER    = '`';                 // ← backtick key opens the prompt
var DEBUG_MODE       = (function() {
  try { return localStorage.getItem('wigglers_debug') === '1'; } catch(e) { return false; }
})();

(function() {
  // ── Password prompt overlay ───────────────────────────────────────────
  function showDebugPrompt() {
    if (document.getElementById('_dbgOverlay')) return;

    var overlay = document.createElement('div');
    overlay.id = '_dbgOverlay';
    overlay.style.cssText = [
      'position:fixed','top:0','left:0','width:100%','height:100%',
      'background:rgba(0,0,0,0.72)','display:flex','align-items:center',
      'justify-content:center','z-index:99999','font-family:monospace'
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:#1a1a1a','border:2px solid #4caf50','border-radius:10px',
      'padding:28px 36px','min-width:300px','text-align:center','color:#e0e0e0',
      'box-shadow:0 0 40px rgba(76,175,80,0.35)'
    ].join(';');

    var title = document.createElement('div');
    title.textContent = '🐛 Debug Mode ' + (DEBUG_MODE ? 'DISABLE' : 'ENABLE');
    title.style.cssText = 'font-size:16px;font-weight:bold;margin-bottom:16px;color:#4caf50;letter-spacing:1px;';

    var input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Enter password…';
    input.style.cssText = [
      'width:100%','box-sizing:border-box','padding:9px 12px',
      'background:#111','border:1px solid #555','border-radius:6px',
      'color:#fff','font-size:15px','font-family:monospace','outline:none',
      'margin-bottom:14px'
    ].join(';');

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:#888;margin-bottom:14px;';
    hint.textContent = DEBUG_MODE ? 'Debug is currently ON' : 'Debug is currently OFF';

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    var btnOK = document.createElement('button');
    btnOK.textContent = 'Confirm';
    btnOK.style.cssText = [
      'padding:8px 22px','background:#4caf50','border:none','border-radius:6px',
      'color:#fff','font-size:14px','font-family:monospace','cursor:pointer'
    ].join(';');

    var btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = [
      'padding:8px 22px','background:#333','border:1px solid #555','border-radius:6px',
      'color:#aaa','font-size:14px','font-family:monospace','cursor:pointer'
    ].join(';');

    function closeOverlay() {
      document.body.removeChild(overlay);
    }

    function showToast(msg, color) {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = [
        'position:fixed','bottom:30px','left:50%','transform:translateX(-50%)',
        'background:' + (color || '#333'),'color:#fff','padding:10px 22px',
        'border-radius:8px','font-family:monospace','font-size:14px',
        'z-index:100000','pointer-events:none',
        'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
        'transition:opacity 0.4s'
      ].join(';');
      document.body.appendChild(t);
      setTimeout(function() { t.style.opacity = '0'; }, 1400);
      setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
    }

    function attempt() {
      if (input.value === DEBUG_PASSWORD) {
        DEBUG_MODE = !DEBUG_MODE;
        try { localStorage.setItem('wigglers_debug', DEBUG_MODE ? '1' : '0'); } catch(e2) {}
        closeOverlay();
        showToast(
          DEBUG_MODE ? '🐛 Debug mode ENABLED' : '✅ Debug mode DISABLED',
          DEBUG_MODE ? '#4caf50' : '#1976d2'
        );
      } else {
        input.value = '';
        input.placeholder = '✗ Wrong password';
        input.style.borderColor = '#e53935';
        setTimeout(function() {
          input.placeholder = 'Enter password…';
          input.style.borderColor = '#555';
        }, 1200);
      }
    }

    btnOK.addEventListener('click', attempt);
    btnCancel.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) closeOverlay(); });
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') attempt();
      if (ev.key === 'Escape') closeOverlay();
      ev.stopPropagation(); // don't let game keys fire while typing
    });

    box.appendChild(title);
    box.appendChild(hint);
    box.appendChild(input);
    box.appendChild(btnRow);
    btnRow.appendChild(btnOK);
    btnRow.appendChild(btnCancel);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(function() { input.focus(); }, 50);
  }

  // ── Trigger listener — backtick key anywhere ──────────────────────────
  window.addEventListener('keydown', function(ev) {
    if (ev.key === DEBUG_TRIGGER) {
      ev.preventDefault();
      showDebugPrompt();
    }
  }, true); // capture phase so it fires even when canvas has focus
})();

// Spacebar also triggers poop
window.addEventListener('keydown', function(e) {
  if (e.code === 'Space') { e.preventDefault(); tryPoop(); }
  if (e.code === 'KeyS') { e.preventDefault(); trySleep(); }
  if (e.code === 'KeyE') { e.preventDefault(); tryLayCocoon(); }
  if (e.code === 'KeyN') {
    avatarMode = (avatarMode + 1) % 3;
  }
  if (!DEBUG_MODE) return;
    // DEBUG — Shift+C wipes saved session and reloads fresh.
  if (e.code === 'KeyC' && e.shiftKey) { location.reload(); }
  // DEBUG — ] key increments generation
  if (e.code === 'BracketRight') { generation = Math.min(99, generation + 1); }
  // DEBUG — [ key decrements generation
  if (e.code === 'BracketLeft')  { generation = Math.max(0,  generation - 1); }
  // DEBUG — K key forces natural death (sets pEaten to cap)
  if (e.code === 'KeyK') { pEaten = 300000; }
  // DEBUG — A key toggles acid at 0.8
  if (e.code === 'KeyA') { pAcid = pAcid > 0.1 ? 0 : 0.8; }
});
window.addEventListener('resize', function() { setTimeout(resizeCanvas, 100); });

// ── Startup — wait briefly for Devvit host to deliver session, then fall back ─
// When running inside Reddit, the host fetches the KV-stored session and sends
// it via postMessage({ type: 'setSession', ... }) before the game starts.
// We wait up to 400ms for that message. If it arrives, setup() is called from
// the message handler above. If nothing arrives (local dev, plain HTML), we
// start immediately with whatever is in localStorage.
// Boot: always attempt Devvit handshake (works for web iframe AND mobile RN WebView).
// postToHost is safe to call anywhere — it's a no-op if no host is listening.
// The game starts via fallback timer regardless, so standalone mode still works.
(function() {
  // Always send ready — host will respond with setSession if it's listening
  postToHost({ type: 'ready' });
  // requestPresence is deferred: fired after setUsername arrives so the self-filter works.
  // See setUsername handler above.
  window._devvitSetupPending = true;

  // Start game after timeout whether or not host responds.
  // If host sends setSession before timeout, that triggers setup() early and cancels timer.
  window._devvitSetupTimer = setTimeout(function() {
    if (window._devvitSetupPending) {
      window._devvitSetupPending = false;
      setup(); loop();
    }
  }, 3000);

  // On mobile the bridge may not be ready immediately — retry ready a few times
  var _retries = 0;
  var _retryReady = setInterval(function() {
    if (!window._devvitSetupPending || _retries >= 5) {
      clearInterval(_retryReady);
      return;
    }
    postToHost({ type: 'ready' });
    _retries++;
  }, 500);
})();

