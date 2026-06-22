# ISS-19 — localStorage Race: Game Boots Before Devvit Responds

**Logged:** 2026-06-22 Session 25
**Priority:** P1 — root cause of all ISS-18 / FEAT-2 symptoms
**Blocks:** True shared world state, device conflict detection, multiplayer
**Status:** Spec complete. Do not touch code until July 1 (Codespaces reset).

---

## What is actually happening

Every time a player opens the post, game.js starts a 3-second countdown timer.
If Devvit has not delivered a session within 3 seconds, the game boots from
localStorage — the browser's local save on that specific device.

On Reddit mobile (iOS app), Devvit's response consistently arrives **after**
the 3-second window. This means:

- iPhone boots from iPhone's localStorage
- iPad boots from iPad's localStorage
- Neither device ever receives KV data as the authoritative session source
- The device conflict token is written to KV, but the game is already running
- `setSession` arrives late, finds `_devvitSetupPending = false`, and is silently ignored
- Both devices play independently, saving back to their own localStorage

This is why:
- Two devices show different karma (different localStorage saves)
- Weather was briefly appearing to sync (weekStartTs came via setWorldState which
  IS applied even after boot — but tLvl/castingEnrichment were being ignored
  because they came bundled with the late setSession)
- The conflict overlay never appeared (deviceConflict flag set in KV handler,
  but game already running when it arrived)
- All the ISS-18 fixes (stripping tLvl from session, reordering messages) were
  correct in isolation but irrelevant because the game never reached that path

---

## The exact race condition

```
T+0ms      game.js loads, sends 'ready' to main.tsx
T+0ms      _devvitSetupPending = true
T+0ms      3-second fallback timer starts
T+500ms    retry 'ready' (up to 5x)
T+3000ms   *** FALLBACK FIRES ***
           setup() called with loadSession() from localStorage
           loop() starts — game is now running
           _devvitSetupPending = false
           _loopRunning = true
T+3200ms   main.tsx finally delivers setWorldState + setSession
T+3200ms   setSession handler checks:
             _devvitSetupPending? NO → skip setup()
             deviceConflictActive? NO → skip takeover path
           → falls through, does nothing
T+3200ms   Game stays on localStorage session. KV data discarded.
```

---

## The fix — 3 targeted changes

### Change 1 — game.js: honour late-arriving setSession (main fix)

In the `setSession` handler, add a third branch after the two existing ones:

```
if (_devvitSetupPending) {
    // Normal path — Devvit responded before fallback timer
    _devvitSetupPending = false;
    clearTimeout(_devvitSetupTimer);
    setup(); loop();

} else if (_loopRunning && deviceConflictActive) {
    // Takeover path — already in conflict mode
    deviceConflictActive = false;
    setup();

} else if (_loopRunning && !_devvitSessionReceived) {
    // *** NEW BRANCH — Late Devvit response ***
    // Game booted from localStorage fallback but Devvit session just arrived.
    // The KV session is authoritative — re-run setup with it.
    // _devvitSessionReceived flag prevents double-applying if session arrives twice.
    _devvitSessionReceived = true;
    setup();
}
```

The key guard is `!_devvitSessionReceived` — if Devvit's session was already
applied (normal boot path), this branch never fires. If it was ignored (fallback
boot), it fires exactly once and re-runs setup with the authoritative KV data.

### Change 2 — game.js: set _devvitSessionReceived on normal boot path too

Currently `_devvitSessionReceived` is set to `true` at the top of the setSession
handler, before the branch check. That's correct — the flag means "we received
a setSession message", not "setup ran from KV". But setup() needs to know whether
it's running from localStorage (fallback) or KV (authoritative).

Add a second flag `_bootedFromKV = false` that gets set to `true` only when
setup() is triggered by a Devvit setSession (not the fallback timer):

In the normal setSession path:
```
_devvitSetupPending = false;
clearTimeout(_devvitSetupTimer);
_bootedFromKV = true;   // ← add this
setup(); loop();
```

In the late-arrival branch:
```
_devvitSessionReceived = true;
_bootedFromKV = true;   // ← add this
setup();
```

In the fallback timer:
```
// _bootedFromKV stays false — this is the localStorage path
setup(); loop();
```

This gives a clean readable flag for the conflict detection and future
multiplayer work: `if (!_bootedFromKV) { /* still on localStorage */ }`.

### Change 3 — game.js: increase fallback timer from 3s to 8s

3 seconds is too tight for Reddit mobile on a slow connection. The Devvit
response arrives at ~3.2s in testing — just barely missing the window.

Increasing to 8 seconds gives Devvit time to respond on any reasonable
connection without making standalone mode feel sluggish (8s is still
acceptable for a dev tool; players inside Reddit will never hit this).

```js
// OLD
window._devvitSetupTimer = setTimeout(function() { ... }, 3000);

// NEW
window._devvitSetupTimer = setTimeout(function() { ... }, 8000);
```

Combined with Change 1, this is belt-and-suspenders: the longer timeout means
Devvit usually wins the race cleanly, and the late-arrival branch handles the
cases where it still doesn't.

---

## What this fixes

| Symptom | Root cause | After fix |
|---------|-----------|-----------|
| Two devices show different karma | Both booting from localStorage | Both re-setup from KV when Devvit responds |
| Conflict overlay never shows | setDeviceConflict arrives after game running, ignored | setSession re-runs setup, conflict check fires before game starts |
| Weather/weekStartTs appears to sync | setWorldState applied even on late arrival (partial fix) | Now fully consistent — full KV state loads |
| ISS-18 fixes had no effect | Game never reached the code paths we fixed | Now it does |
| scrapsLevel different between devices | spawnScraps ran before setWorldState arrived | setWorldState arrives before re-setup with 8s timer |

---

## What this does NOT fix

- **localStorage is still used for standalone/dev mode** — this is correct and
  intentional. The GitHub Pages build uses localStorage and always will.
- **Scraps layout still differs between devices** — positions are random at
  spawnScraps() time. Density matches via scrapsLevel. Layout would require
  storing full chunk list in KV. Not worth it.
- **Session save race (last-write-wins)** — if both devices are somehow both
  playing (conflict detection failed), they'll still corrupt each other's saves.
  FEAT-2 still needs to work after this fix to prevent that scenario entirely.

---

## Files touched

| File | Change | Lines affected |
|------|--------|---------------|
| `webroot/game.js` | Add late-arrival branch in setSession handler | ~370 |
| `webroot/game.js` | Add `_bootedFromKV` flag, set in 3 places | ~370, ~3240, boot IIFE |
| `webroot/game.js` | Increase fallback timer 3000 → 8000 | ~8935 |

**main.tsx: no changes needed.** The fix is entirely in game.js.

---

## Session 26 execution plan (July 1)

1. Bootstrap session-health, run health check
2. Read this spec
3. Apply the 3 changes above — they are small and surgical
4. Push to GitHub, wait for CI
5. Deploy via bridge (Codespaces resets July 1)
6. Create new Reddit post
7. Open on iPhone — wait 10 seconds — open on iPad
8. Expected: iPad shows "Already Playing Elsewhere" overlay
9. If yes: FEAT-2 is working. Remove debug overlay. Done.
10. If no: read `conflict=` in debug overlay on both devices to find next failure point

**Estimated time: 30 minutes from Codespaces restart to verified fix.**

---

## Why we stopped here

Codespaces core-hour limit hit 2026-06-22. No deploys possible until 2026-07-01.
The fix is fully understood and documented. Making further code changes without
being able to live-test on device would be risky — this is a timing-sensitive
boot sequence and any mistake would require another deploy slot.

The GitHub Pages build at `https://cal-starfur.github.io/Wigglers_Room/` can be
used to test standalone gameplay and debug overlay, but cannot reproduce the
Devvit/localStorage race because Pages always runs in standalone mode.
