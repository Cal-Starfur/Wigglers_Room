// ============================================================================
// WIGGLERS ROOM — TUTORIAL MODULE  (extracted from demo-game.js @ 82e7066)
// Self-contained standalone code: the `tutorial` state object + 8 functions +
// spawnTutorialScene (with its nested _tutFood helper).
// NOTE: this is the BASE-INDEPENDENT half. The ~20 inline hooks that weave into
// core functions are catalogued in the HOOKS MANIFEST at the bottom of this file.
// ============================================================================

// ── Block 1: tutorial state object + ?tut= URL gate (demo lines 75-106) ──
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

// ── Block 2: tutorial functions (demo lines 108-451) ──
//   tutorialClampTarget, _tutStepDone, tutorialStep, drawTutorialPanel,
//   drawTutorialDone, _tutFinish, drawTutorialHighlight
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
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 10);
  else ctx.rect(cardX, cardY, cardW, cardH);
  // Outer amber halo (wide, low alpha) — replaces shadowBlur (amber = glow token)
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,176,48,0.18)';
  ctx.lineWidth = 9;
  ctx.stroke();
  // Card fill — covers the inner half of the halo, leaving an outer glow ring
  ctx.fillStyle = 'rgba(12,28,12,0.92)';
  ctx.fill();
  // Sharp amber border
  ctx.strokeStyle = 'rgba(255,176,48,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

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
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px, py, panelW, panelH, 14); else ctx.rect(px, py, panelW, panelH);
  // Outer amber halo — replaces shadowBlur
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,176,48,0.20)';
  ctx.lineWidth = 12;
  ctx.stroke();
  // Panel fill
  ctx.fillStyle = '#0a1f0a';
  ctx.fill();
  // Sharp amber border
  ctx.strokeStyle = 'rgba(255,176,48,0.6)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
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
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(_bz.cx - _bz.bw2, _lineSY);
      ctx.lineTo(_bz.cx + _bz.bw2, _lineSY);
      // Outer amber halo — replaces shadowBlur
      ctx.strokeStyle = 'rgba(255,176,48,' + (0.22 + 0.12 * pulse) + ')';
      ctx.lineWidth = (3 + 4 * _prox) + 8;
      ctx.stroke();
      // Sharp line
      ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.55 + 0.4 * pulse + 0.3 * _prox) + ')';
      ctx.lineWidth = 3 + 4 * _prox;
      ctx.stroke();
      ctx.restore();
    }
  } else if (onScreen) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(tx, ty, ringR, 0, Math.PI * 2);
    // Outer amber halo — replaces shadowBlur
    ctx.strokeStyle = 'rgba(255,176,48,' + (0.22 + 0.12 * pulse) + ')';
    ctx.lineWidth = (2.5 + 5 * _prox) + 7;
    ctx.stroke();
    // Sharp ring
    ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.55 + 0.4 * pulse + 0.3 * _prox) + ')';
    ctx.lineWidth = 2.5 + 5 * _prox;
    ctx.stroke();
    ctx.restore();

    // Precise aim point — a crisp dot at the exact target centre so the player
    // knows where to place their steering point (critical for the sump drain holds:
    // put your point on the dot at the floor and the hold connects).
    if (tgt._tutBeacon && !tgt._zoneR) {   // precise dot for point beacons only — zones get the big ring, no dot
      ctx.save();
      var _dotR = 3.5 + 0.6 * pulse + 1.5 * _prox;
      // Amber halo behind the dot — replaces shadowBlur
      ctx.fillStyle = 'rgba(255,176,48,' + (0.30 + 0.15 * pulse) + ')';
      ctx.beginPath();
      ctx.arc(tx, ty, _dotR + 4, 0, Math.PI * 2);
      ctx.fill();
      // Sharp white centre
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tx, ty, _dotR, 0, Math.PI * 2);
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
    // Amber halo triangle (scaled up, low alpha) — replaces shadowBlur
    ctx.fillStyle = 'rgba(255,176,48,0.30)';
    ctx.beginPath();
    ctx.moveTo(aSize * 1.45, 0);
    ctx.lineTo(-aSize * 1.0, aSize * 1.0);
    ctx.lineTo(-aSize * 1.0, -aSize * 1.0);
    ctx.closePath();
    ctx.fill();
    // Sharp arrow
    ctx.fillStyle = 'rgba(255,176,48,1)';
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
      ctx.beginPath();
      ctx.arc(_ex.x, _exy, _exR, 0, Math.PI * 2);
      // Outer amber halo — replaces shadowBlur
      ctx.strokeStyle = 'rgba(255,176,48,' + (0.20 + 0.12 * pulse) + ')';
      ctx.lineWidth = 2.5 + 7;
      ctx.stroke();
      // Sharp ring
      ctx.strokeStyle = 'rgba(255,176,48,' + Math.min(1, 0.45 + 0.35 * pulse) + ')';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Block 3: spawnTutorialScene + nested _tutFood (demo lines 2189-2314) ──
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

// ============================================================================
// HOOKS MANIFEST — inline edits the tutorial requires inside CORE functions.
// These must be re-applied to whatever base the demo runs on. Anchors below are
// the demo-game.js call sites; on a different base, find the equivalent spot.
// ----------------------------------------------------------------------------
// setup()            : `if (tutorial.scene) { spawnTutorialScene(); } else { spawnScraps(); }`
// updatePlayer()     : HP floor safety  -> `if (tutorial.live && tutorial.active && ... pHP < 0.08) pHP = 0.08;`
// updatePlayer()     : while sleeping   -> `tutorialStep();`  (so the final sleep beat advances)
// updatePlayer()     : pre-move         -> `tutorialStep();`  then leash clamp:
//                       `if (tutorial.debug && tutorial.active && !tutorial.leash) tutorial.leash = {...}`
//                       `var _mt = tutorialClampTarget(mX, mY);`  (replaces raw mX,mY read)
// eat logic          : `var _tutStepNow = tutorial.scene ? tutorial.steps[tutorial.stepIndex] : null;`
//                       scrap-lock gate: `if (tutorial.scene && !(... 'freeplay') && (tutorial.live || s.tutProtected) && s !== tutorial.target && !_openExtra) continue;`
//                       refuel beat: `if (s._refuelTut) tutorial._refuelAte = true;`
// down-drain fire    : `if (tutorial.scene) tutorial._downDrainDone = true;`
// up-drain fire      : `if (tutorial.scene) tutorial._upDrainArmed = true;`
// updatePhysics()    : `if (tutorial.active) { castingEnrichment = 0; }`
// draw()             : `drawTutorialHighlight(); drawTutorialPanel(); drawTutorialDone();`
//                       + debug leash ring: `if (tutorial.debug && tutorial.leash && tutorial.leash.type === 'radius') {...}`
// cocoon-lay         : `if (tutorial.scene) tutorial._cocoonDone = true;`
// sleep/wake handler : `if (tutorial.active && tutorial.scene) { if (tutorial.done) { _tutFinish(); return; } ... }`
// poop (relief)      : `if (tutorial.scene) tutorial._reliefPooped = true;`
// poop (compost)     : `if (tutorial.scene) tutorial._compostPooped = true;`
// gesture/tap (x2)   : `if (tutorial.done) { _tutFinish(); return; }`
// ----------------------------------------------------------------------------
// External symbols the tutorial reads/writes on the base game:
//   head, mX, mY, camY, frame, karma, pSR, pSleeping, pSleepX/Y, viewMode, viewCamY,
//   pPath, scraps, cSurf(), inCompost(), getTier(), spawnScraps(), scrapsLevel,
//   scrapsEmpty, username, ctx (canvas2d), W, H, showDemoEnd() [end-screen handoff]
// ============================================================================
