/**
 * main.tsx — Wigglers Room (Devvit host)
 * 
 * Responsibilities:
 *  1. On post open → load player worm session from KV → postMessage setSession
 *  2. On post open → load shared world state from KV → postMessage setWorldState
 *  3. On post open → fetch Reddit username + avatar → postMessage setUsername / setPlayerAvatar
 *  4. Listen for saveSession from webview → write to KV
 *  5. Listen for worldUpdate from webview → write shared world KV + broadcast via Realtime
 *  6. Listen for presenceUpdate → broadcast to all viewers
 *  7. Listen for playerDied → record in KV
 *  8. Listen for floodAck, claimWorm, joinQueue, unclaimedWormDied → relay or store
 *  9. Subscribe to Realtime → forward world/presence updates to webview
 *
 * KV key structure:
 *   worm:{username}          — per-player worm session JSON
 *   world:{postId}           — shared world state JSON (tLvl, pooled, castingEnrichment, scrapsLevel)
 *   cocoons:{postId}         — all players' cocoons JSON array
 *   week:{postId}            — { weekStartTs, pot, contributors }
 *   queue:{postId}           — pending worm queue JSON array
 */

import { Devvit, useWebView, useChannel, useState, useInterval } from '@devvit/public-api';

// ─── Message type constants ───────────────────────────────────────────────────
// Inbound (webview → host)
const MSG_SAVE_SESSION        = 'saveSession';
const MSG_WORLD_UPDATE        = 'worldUpdate';
const MSG_PRESENCE_UPDATE     = 'presenceUpdate';
const MSG_PLAYER_DIED         = 'playerDied';
const MSG_REQUEST_PRESENCE    = 'requestPresence';
const MSG_CLAIM_WORM          = 'claimWorm';
const MSG_JOIN_QUEUE          = 'joinQueue';
const MSG_FLOOD_ACK           = 'floodAck';
const MSG_UNCLAIMED_WORM_DIED = 'unclaimedWormDied';
const MSG_READY               = 'ready';

// Outbound (host → webview)
const MSG_SET_USERNAME        = 'setUsername';
const MSG_SET_SESSION         = 'setSession';
const MSG_SET_PLAYER_AVATAR   = 'setPlayerAvatar';
const MSG_SET_WORLD_STATE     = 'setWorldState';
const MSG_SET_PRESENCE        = 'setPresence';
const MSG_SET_FLOOD           = 'setFlood';
const MSG_WORM_CLAIMED        = 'wormClaimed';

// ─── KV key helpers ───────────────────────────────────────────────────────────
const KV_WORM_SESSION  = (username: string) => `worm:${username}`;
const KV_WORLD         = (postId: string)   => `world:${postId}`;
const KV_COCOONS       = (postId: string)   => `cocoons:${postId}`;
const KV_QUEUE         = (postId: string)   => `queue:${postId}`;
const KV_WEEK          = (postId: string)   => `week:${postId}`;

// ─── Realtime channel helpers ─────────────────────────────────────────────────
// useChannel requires names with only [a-zA-Z0-9_] — no colons allowed.
// postId is 't3_xxxxxxx' (base36) — safe after replacing non-alphanumeric with _.
const safeId   = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
const RT_WORLD    = (postId: string) => `world_${safeId(postId)}`;
const RT_PRESENCE = (postId: string) => `presence_${safeId(postId)}`;
const RT_FLOOD    = (postId: string) => `flood_${safeId(postId)}`;

// ─── Anti-cheat clamp helpers ─────────────────────────────────────────────────
const SCORE_MAX       = 9_999_999;
const KARMA_MAX       = 99_999;
const PSR_MAX         = 7;
const PSEG_MAX        = 20;
const COCOON_MAX      = 3;
const COCOON_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // reject cocoons backdated > 2 weeks

function clampSession(session: any, serverNow: number): any {
  if (!session || typeof session !== 'object') return session;
  const s = { ...session };
  if (typeof s.score === 'number')  s.score  = Math.max(0, Math.min(SCORE_MAX, Math.floor(s.score)));
  if (typeof s.karma === 'number')  s.karma  = Math.max(0, Math.min(KARMA_MAX, Math.floor(s.karma)));
  if (typeof s.pSR   === 'number')  s.pSR    = Math.max(0, Math.min(PSR_MAX,   s.pSR));
  if (typeof s.pSEG  === 'number')  s.pSEG   = Math.max(1, Math.min(PSEG_MAX,  Math.floor(s.pSEG)));
  if (typeof s.pHP   === 'number')  s.pHP    = Math.max(0, Math.min(1, s.pHP));
  if (typeof s.pGut  === 'number')  s.pGut   = Math.max(0, s.pGut);
  // Never trust client weekStartTs — always preserve server value if exists
  // Validate cocoon timestamps — reject backdated ones
  if (Array.isArray(s.cocoons)) {
    s.cocoons = s.cocoons
      .slice(0, COCOON_MAX)
      .filter((c: any) => {
        if (!c || typeof c.laid !== 'number') return false;
        // Reject laid timestamps older than 2 weeks from server time
        return (serverNow - c.laid) <= COCOON_MAX_AGE_MS;
      });
  }
  // Never allow client to set lastFloodTs — that's server-authoritative
  // (keep the field but don't update it from client saves)
  return s;
}

// ─── Devvit configuration ─────────────────────────────────────────────────────
Devvit.configure({
  redditAPI: true,
  redis: true,
  kvStore: true,
  realtime: true,
});

// ─── Preview animation helpers ────────────────────────────────────────────────
//
// The preview screen (shown in the Reddit feed before the user taps to play)
// shows 33 trash items falling over a dark earth-tone background with a warm
// amber glow. Items are pure SVG shapes — no external asset dependencies.
// Interval slowed to 500ms (2fps) to minimise Chrome hover-flicker from
// data:image/svg+xml URL churn. The canvas preview in game.js takes over at
// 60fps once the user taps and the webview mounts.

const TRASH_LAYOUT = [
  { name: 'whole_tomato',   x:  19, yOff:  26, r: 22, rot: -0.15 },
  { name: 'banana_peel',    x:  28, yOff: 362, r: 20, rot: -0.66 },
  { name: 'bread_crust',    x:  30, yOff: 158, r: 24, rot: -0.24 },
  { name: 'banana_peel',    x:  43, yOff: 471, r: 28, rot:  0.96 },
  { name: 'banana_peel',    x:  86, yOff:  40, r: 23, rot: -0.07 },
  { name: 'tea_bag',        x: 100, yOff: 470, r: 24, rot:  0.80 },
  { name: 'lettuce',        x: 115, yOff: 350, r: 24, rot: -0.34 },
  { name: 'newspaper',      x: 118, yOff: 255, r: 25, rot:  0.10 },
  { name: 'overripe_fruit', x: 156, yOff: 163, r: 38, rot:  0.62 },
  { name: 'egg_shell',      x: 191, yOff: 361, r: 24, rot: -0.54 },
  { name: 'watermelon',     x: 194, yOff: 462, r: 17, rot: -0.62 },
  { name: 'apple_core',     x: 198, yOff:  51, r: 20, rot:  0.20 },
  { name: 'whole_tomato',   x: 202, yOff: 278, r: 25, rot: -0.81 },
  { name: 'egg_shell',      x: 231, yOff: 244, r: 14, rot: -0.30 },
  { name: 'watermelon',     x: 238, yOff:  30, r: 22, rot: -0.62 },
  { name: 'egg_shell',      x: 246, yOff: 135, r: 10, rot:  0.40 },
  { name: 'banana_peel',    x: 246, yOff: 226, r: 17, rot: -0.96 },
  { name: 'corn_cob',       x: 252, yOff: 386, r: 20, rot:  0.20 },
  { name: 'banana_peel',    x: 274, yOff: 478, r: 29, rot:  0.08 },
  { name: 'newspaper',      x: 324, yOff: 271, r: 26, rot:  0.87 },
  { name: 'banana_peel',    x: 329, yOff:  30, r: 29, rot:  0.08 },
  { name: 'egg_shell',      x: 332, yOff: 382, r: 22, rot: -0.47 },
  { name: 'whole_tomato',   x: 336, yOff: 470, r: 14, rot:  0.30 },
  { name: 'tea_bag',        x: 346, yOff: 183, r: 18, rot:  0.80 },
  { name: 'banana_peel',    x: 394, yOff: 141, r: 20, rot:  0.10 },
  { name: 'lettuce',        x: 403, yOff: 387, r: 26, rot: -0.77 },
  { name: 'bread_crust',    x: 410, yOff: 290, r: 26, rot: -0.67 },
  { name: 'whole_tomato',   x: 414, yOff:  15, r: 20, rot: -0.10 },
  { name: 'potato',         x: 451, yOff:  52, r: 16, rot:  0.30 },
  { name: 'egg_shell',      x: 464, yOff: 256, r: 26, rot: -0.47 },
  { name: 'pizza',          x: 464, yOff: 368, r: 25, rot: -0.53 },
  { name: 'bread_crust',    x: 468, yOff: 464, r: 22, rot: -0.24 },
  { name: 'lettuce',        x: 490, yOff: 173, r: 20, rot: -0.25 },
];

const FALL_SPEED = 2;
const TILE_H = 512;

function svgPizza(r: number): string {
  const r09 = r * 0.9; const r085 = r * 0.85; const r072 = r * 0.72;
  const r062 = r * 0.62; const r065 = r * 0.65;
  return (
    `<polygon points="0,${-r09} ${-r085},${r072} ${r085},${r072}" fill="#d4936a"/>` +
    `<polygon points="0,${-r062} ${-r065},${r062} ${r065},${r062}" fill="#f0c888"/>` +
    `<ellipse cx="${-r*0.15}" cy="${r*0.1}" rx="${r*0.32}" ry="${r*0.22}" transform="rotate(17)" fill="#c03020"/>` +
    `<ellipse cx="${r*0.2}" cy="${-r*0.15}" rx="${r*0.2}" ry="${r*0.16}" transform="rotate(-29)" fill="#c03020"/>` +
    `<ellipse cx="${r*0.05}" cy="${r*0.05}" rx="${r*0.18}" ry="${r*0.12}" transform="rotate(46)" fill="#f0d060"/>` +
    `<ellipse cx="${-r*0.28}" cy="${-r*0.08}" rx="${r*0.13}" ry="${r*0.09}" transform="rotate(-17)" fill="#f0d060"/>` +
    `<circle cx="${-r*0.05}" cy="${-r*0.28}" r="${r*0.12}" fill="#8a2010"/>` +
    `<circle cx="${r*0.3}" cy="${r*0.28}" r="${r*0.09}" fill="#8a2010"/>` +
    `<line x1="${-r085}" y1="${r072}" x2="${r085}" y2="${r072}" stroke="#b87040" stroke-width="${r*0.09}" stroke-linecap="round"/>`
  );
}

function svgBananaPeel(r: number): string {
  const lobeAngles = [-0.7, 0.2, 1.1, 2.0];
  const lobeCols = ['#d4a808', '#c09808', '#e8c010', '#b88800'];
  let s = '';
  for (let i = 0; i < 4; i++) {
    const deg = lobeAngles[i] * 180 / Math.PI;
    s += `<g transform="rotate(${deg.toFixed(1)})">` +
      `<path d="M 0,0 C ${r*0.2},${-r*0.3} ${r*0.5},${-r*1.0} ${r*0.15},${-r*1.1} C ${-r*0.2},${-r*1.0} ${-r*0.4},${-r*0.4} 0,0 Z" fill="${lobeCols[i]}"/>` +
      `<path d="M 0,${-r*0.05} C ${r*0.1},${-r*0.3} ${r*0.3},${-r*0.85} ${r*0.1},${-r*0.95} C ${-r*0.1},${-r*0.82} ${-r*0.22},${-r*0.32} 0,${-r*0.05} Z" fill="#f5e090"/>` +
      `</g>`;
  }
  s += `<circle cx="0" cy="0" r="${r*0.15}" fill="#5a3a00"/>`;
  return s;
}

function svgAppleCore(r: number): string {
  return (
    `<ellipse cx="0" cy="0" rx="${r*0.38}" ry="${r*0.9}" fill="#d4c8a0"/>` +
    `<ellipse cx="${-r*0.25}" cy="${-r*0.3}" rx="${r*0.22}" ry="${r*0.35}" transform="rotate(23)" fill="#d83020"/>` +
    `<ellipse cx="${r*0.22}" cy="${r*0.2}" rx="${r*0.18}" ry="${r*0.28}" transform="rotate(-17)" fill="#d83020"/>` +
    `<ellipse cx="${-r*0.12}" cy="${-r*0.12}" rx="${r*0.06}" ry="${r*0.1}" transform="rotate(11)" fill="#3a2008"/>` +
    `<ellipse cx="0" cy="${r*0.06}" rx="${r*0.06}" ry="${r*0.1}" transform="rotate(11)" fill="#3a2008"/>` +
    `<ellipse cx="${r*0.12}" cy="${r*0.24}" rx="${r*0.06}" ry="${r*0.1}" transform="rotate(11)" fill="#3a2008"/>` +
    `<line x1="0" y1="${-r*0.9}" x2="${r*0.08}" y2="${-r*1.15}" stroke="#5a3010" stroke-width="${r*0.1}" stroke-linecap="round"/>` +
    `<line x1="${-r*0.12}" y1="${r*0.88}" x2="${r*0.12}" y2="${r*0.95}" stroke="#5a3010" stroke-width="${r*0.08}" stroke-linecap="round"/>`
  );
}

function svgLettuce(r: number): string {
  return (
    `<ellipse cx="0" cy="${r*0.1}" rx="${r*0.88}" ry="${r*0.72}" fill="#3a9020"/>` +
    `<ellipse cx="${-r*0.3}" cy="${-r*0.1}" rx="${r*0.55}" ry="${r*0.45}" fill="#50b830"/>` +
    `<ellipse cx="${r*0.25}" cy="${-r*0.05}" rx="${r*0.48}" ry="${r*0.4}" fill="#60c838"/>` +
    `<ellipse cx="0" cy="${-r*0.15}" rx="${r*0.35}" ry="${r*0.3}" fill="#78e040"/>` +
    `<line x1="0" y1="${-r*0.55}" x2="0" y2="${r*0.55}" stroke="#286010" stroke-width="${r*0.06}" stroke-linecap="round"/>` +
    `<line x1="0" y1="${-r*0.2}" x2="${-r*0.5}" y2="${r*0.1}" stroke="#286010" stroke-width="${r*0.03}" stroke-linecap="round"/>` +
    `<line x1="0" y1="${r*0.1}" x2="${r*0.5}" y2="${r*0.35}" stroke="#286010" stroke-width="${r*0.03}" stroke-linecap="round"/>`
  );
}

function svgEggShell(r: number): string {
  return (
    `<path d="M ${-r*0.75},${r*0.1} C ${-r*0.8},${r*0.8} ${r*0.8},${r*0.8} ${r*0.75},${r*0.1} Z" fill="#ede8d8"/>` +
    `<ellipse cx="0" cy="${r*0.5}" rx="${r*0.3}" ry="${r*0.2}" fill="#d4a820"/>` +
    `<g transform="rotate(-20)">` +
    `<path d="M ${-r*0.6},${-r*0.8} C ${-r*0.72},${-r*0.1} ${r*0.72},${-r*0.1} ${r*0.6},${-r*0.8} Z" fill="#f0ead8"/>` +
    `<polyline points="${-r*0.6},${-r*0.8} ${-r*0.3},${-r*0.65} ${-r*0.1},${-r*0.78} ${r*0.15},${-r*0.6} ${r*0.35},${-r*0.72} ${r*0.6},${-r*0.8}" fill="none" stroke="#c8c0a8" stroke-width="${r*0.05}"/>` +
    `</g>`
  );
}

function svgTeaBag(r: number): string {
  const rr = r * 0.12;
  return (
    `<rect x="${-r*0.55}" y="${r*0.0}" width="${r*1.1}" height="${r*0.85}" rx="${rr}" fill="#c8a060"/>` +
    `<ellipse cx="0" cy="${r*0.45}" rx="${r*0.32}" ry="${r*0.25}" fill="#7a4820"/>` +
    `<rect x="${-r*0.22}" y="${-r*0.88}" width="${r*0.44}" height="${r*0.28}" rx="${r*0.06}" fill="#e8e0c8"/>` +
    `<path d="M 0,${-r*0.6} Q ${r*0.3},${-r*0.35} ${r*0.05},0" fill="none" stroke="#a08060" stroke-width="${r*0.05}" stroke-linecap="round"/>` +
    `<line x1="${-r*0.1}" y1="${-r*0.6}" x2="${r*0.1}" y2="${-r*0.6}" stroke="#888" stroke-width="${r*0.07}" stroke-linecap="round"/>`
  );
}

function svgNewspaper(r: number): string {
  return (
    `<polygon points="${-r*0.9},${-r*0.7} ${-r*0.5},${-r*0.95} ${r*0.3},${-r*0.88} ${r*0.95},${-r*0.55} ${r*0.85},${r*0.4} ${r*0.4},${r*0.92} ${-r*0.4},${r*0.88} ${-r*0.92},${r*0.5}" fill="#d8d4b8"/>` +
    `<line x1="${-r*0.7}" y1="${-r*0.44}" x2="${r*0.68}" y2="${-r*0.44}" stroke="#888070" stroke-width="${r*0.04}"/>` +
    `<line x1="${-r*0.7}" y1="${-r*0.22}" x2="${r*0.66}" y2="${-r*0.21}" stroke="#888070" stroke-width="${r*0.04}"/>` +
    `<line x1="${-r*0.7}" y1="${r*0.0}" x2="${r*0.70}" y2="${r*0.01}" stroke="#888070" stroke-width="${r*0.04}"/>` +
    `<line x1="${-r*0.7}" y1="${r*0.22}" x2="${r*0.65}" y2="${r*0.23}" stroke="#888070" stroke-width="${r*0.04}"/>` +
    `<line x1="${-r*0.7}" y1="${r*0.44}" x2="${r*0.67}" y2="${r*0.43}" stroke="#888070" stroke-width="${r*0.04}"/>` +
    `<rect x="${-r*0.65}" y="${-r*0.62}" width="${r*1.3}" height="${r*0.18}" fill="#555048"/>` +
    `<line x1="${-r*0.8}" y1="${-r*0.2}" x2="${r*0.8}" y2="${r*0.1}" stroke="#a8a490" stroke-width="${r*0.06}"/>`
  );
}

function svgWatermelon(r: number): string {
  return (
    `<polygon points="0,${-r*0.15} ${-r*0.95},${r*0.82} ${r*0.95},${r*0.82}" fill="#3a8818"/>` +
    `<polygon points="0,${-r*0.08} ${-r*0.82},${r*0.75} ${r*0.82},${r*0.75}" fill="#e8f4d8"/>` +
    `<polygon points="0,${r*0.05} ${-r*0.68},${r*0.72} ${r*0.68},${r*0.72}" fill="#e82840"/>` +
    `<ellipse cx="${-r*0.28}" cy="${r*0.38}" rx="${r*0.04}" ry="${r*0.07}" transform="rotate(17)" fill="#1a1008"/>` +
    `<ellipse cx="${r*0.18}" cy="${r*0.28}" rx="${r*0.04}" ry="${r*0.07}" transform="rotate(17)" fill="#1a1008"/>` +
    `<ellipse cx="${-r*0.05}" cy="${r*0.52}" rx="${r*0.04}" ry="${r*0.07}" transform="rotate(17)" fill="#1a1008"/>` +
    `<ellipse cx="${r*0.4}" cy="${r*0.48}" rx="${r*0.04}" ry="${r*0.07}" transform="rotate(17)" fill="#1a1008"/>` +
    `<line x1="${-r*0.5}" y1="${r*0.42}" x2="${-r*0.72}" y2="${r*0.78}" stroke="#285a10" stroke-width="${r*0.06}"/>` +
    `<line x1="${r*0.38}" y1="${r*0.38}" x2="${r*0.58}" y2="${r*0.78}" stroke="#285a10" stroke-width="${r*0.06}"/>`
  );
}

function svgWholeTomato(r: number): string {
  let ribs = '';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    ribs += `<path d="M ${(ca*r*0.12).toFixed(1)},${(sa*r*0.12-r*0.72).toFixed(1)} C ${(ca*r*0.5).toFixed(1)},${(sa*r*0.2).toFixed(1)} ${(ca*r*0.6).toFixed(1)},${(sa*r*0.5).toFixed(1)} ${(ca*r*0.55).toFixed(1)},${(sa*r*0.88).toFixed(1)}" fill="none" stroke="#a01818" stroke-width="${(r*0.04).toFixed(1)}"/>`;
  }
  let calyx = '';
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 - Math.PI / 2;
    const a2 = a + 0.6;
    calyx += `<path d="M 0,${(-r*0.8).toFixed(1)} L ${(Math.cos(a)*r*0.32).toFixed(1)},${(Math.sin(a)*r*0.2-r*0.82).toFixed(1)} L ${(Math.cos(a2)*r*0.1).toFixed(1)},${(Math.sin(a2)*r*0.1-r*0.82).toFixed(1)} Z" fill="#286010"/>`;
  }
  return (
    `<path d="M ${-r*0.1},${-r*0.82} C ${r*0.65},${-r*0.78} ${r*0.95},${-r*0.18} ${r*0.92},${r*0.28} C ${r*0.85},${r*0.78} ${r*0.3},${r*0.95} 0,${r*0.95} C ${-r*0.35},${r*0.95} ${-r*0.88},${r*0.72} ${-r*0.92},${r*0.22} C ${-r*0.95},${-r*0.28} ${-r*0.65},${-r*0.8} ${-r*0.1},${-r*0.82} Z" fill="#d02020"/>` +
    `<ellipse cx="${-r*0.28}" cy="${-r*0.28}" rx="${r*0.3}" ry="${r*0.2}" fill="rgba(255,160,140,0.35)" transform="rotate(-29)"/>` +
    ribs + calyx
  );
}

function svgBreadCrust(r: number): string {
  return (
    `<rect x="${-r*0.8}" y="${-r*0.55}" width="${r*1.6}" height="${r*1.1}" rx="${r*0.22}" fill="#c89840"/>` +
    `<rect x="${-r*0.8}" y="${-r*0.55}" width="${r*1.6}" height="${r*0.38}" rx="${r*0.22}" fill="#8a5018"/>` +
    `<ellipse cx="${-r*0.2}" cy="${r*0.08}" rx="${r*0.35}" ry="${r*0.2}" fill="#e8c060" transform="rotate(-8)"/>` +
    `<ellipse cx="${r*0.3}" cy="${r*0.22}" rx="${r*0.22}" ry="${r*0.14}" fill="#e8c060" transform="rotate(5)"/>`
  );
}

function svgOverripeFruit(r: number): string {
  return (
    `<path d="M ${-r*0.1},${-r*0.88} C ${r*0.65},${-r*0.8} ${r*0.92},${-r*0.1} ${r*0.85},${r*0.5} C ${r*0.7},${r*0.92} ${-r*0.4},${r*0.88} ${-r*0.82},${r*0.55} C ${-r*1.0},${r*0.1} ${-r*0.75},${-r*0.62} ${-r*0.1},${-r*0.88} Z" fill="#6a1858"/>` +
    `<ellipse cx="${r*0.2}" cy="${r*0.3}" rx="${r*0.42}" ry="${r*0.28}" fill="#c03880" transform="rotate(29)"/>` +
    `<line x1="${-r*0.08}" y1="${-r*0.88}" x2="${r*0.04}" y2="${-r*1.1}" stroke="#3a1808" stroke-width="${r*0.1}" stroke-linecap="round"/>` +
    `<path d="M ${-r*0.5},${-r*0.3} C ${-r*0.2},${r*0.1} ${r*0.3},0 ${r*0.55},${r*0.4}" fill="none" stroke="rgba(100,10,60,0.4)" stroke-width="${r*0.05}"/>` +
    `<path d="M ${-r*0.6},${r*0.2} C ${-r*0.1},${r*0.5} ${r*0.2},${r*0.6} ${r*0.5},${r*0.62}" fill="none" stroke="rgba(100,10,60,0.4)" stroke-width="${r*0.05}"/>`
  );
}

function svgCornCob(r: number): string {
  let kernels = '';
  for (let row = -3; row <= 3; row++) {
    for (let col = 0; col < 4; col++) {
      const kx = (col - 1.5) * r * 0.18;
      const ky = row * r * 0.22;
      kernels += `<ellipse cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" rx="${(r*0.08).toFixed(1)}" ry="${(r*0.09).toFixed(1)}" fill="#f0cc50"/>`;
    }
  }
  let silk = '';
  for (let i = 0; i < 5; i++) {
    const sx = ((i - 2) * r * 0.08).toFixed(1);
    const sx2 = ((i - 2) * r * 0.12).toFixed(1);
    silk += `<line x1="${sx}" y1="${(-r*0.88).toFixed(1)}" x2="${sx2}" y2="${(-r*1.15).toFixed(1)}" stroke="#e8c878" stroke-width="${(r*0.03).toFixed(1)}" stroke-linecap="round"/>`;
  }
  return (
    `<ellipse cx="0" cy="0" rx="${r*0.42}" ry="${r*0.9}" fill="#d4a828"/>` +
    kernels + silk +
    `<path d="M ${-r*0.42},${r*0.78} C ${-r*0.6},${r*1.1} ${r*0.1},${r*1.2} ${r*0.3},${r*0.9} L ${r*0.42},${r*0.78} Z" fill="#78a028"/>`
  );
}

function svgPotato(r: number): string {
  return (
    `<path d="M ${-r*0.15},${-r*0.88} C ${r*0.6},${-r*0.82} ${r*0.95},${-r*0.2} ${r*0.9},${r*0.32} C ${r*0.82},${r*0.82} ${r*0.25},${r*0.95} ${-r*0.05},${r*0.92} C ${-r*0.42},${r*0.88} ${-r*0.92},${r*0.65} ${-r*0.88},${r*0.18} C ${-r*0.85},${-r*0.35} ${-r*0.62},${-r*0.85} ${-r*0.15},${-r*0.88} Z" fill="#b89858"/>` +
    `<ellipse cx="${r*0.22}" cy="${r*0.18}" rx="${r*0.28}" ry="${r*0.18}" fill="#8a6830" transform="rotate(12)"/>` +
    `<ellipse cx="${-r*0.28}" cy="${-r*0.2}" rx="${r*0.18}" ry="${r*0.12}" fill="#8a6830" transform="rotate(-15)"/>` +
    `<circle cx="${-r*0.05}" cy="${-r*0.6}" r="${r*0.07}" fill="#5a3810"/>` +
    `<circle cx="${r*0.45}" cy="${r*0.48}" r="${r*0.06}" fill="#5a3810"/>` +
    `<circle cx="${-r*0.5}" cy="${r*0.38}" r="${r*0.06}" fill="#5a3810"/>`
  );
}

function svgTrashShapes(name: string, r: number): string {
  switch (name) {
    case 'pizza':          return svgPizza(r);
    case 'banana_peel':    return svgBananaPeel(r);
    case 'apple_core':     return svgAppleCore(r);
    case 'lettuce':        return svgLettuce(r);
    case 'egg_shell':      return svgEggShell(r);
    case 'tea_bag':        return svgTeaBag(r);
    case 'newspaper':      return svgNewspaper(r);
    case 'watermelon':     return svgWatermelon(r);
    case 'whole_tomato':   return svgWholeTomato(r);
    case 'bread_crust':    return svgBreadCrust(r);
    case 'overripe_fruit': return svgOverripeFruit(r);
    case 'corn_cob':       return svgCornCob(r);
    case 'potato':         return svgPotato(r);
    default:               return `<circle cx="0" cy="0" r="${r}" fill="#8a6040"/>`;
  }
}

function buildBgDataUrl(tick: number): string {
  const totalFall = tick * FALL_SPEED;
  const glow  = 0.28 + Math.sin(tick * 0.25) * 0.12;
  const sc    = 1    + Math.sin(tick * 0.25) * 0.032;
  const glowRx  = (160 * sc).toFixed(1);
  const glowRy  = (145 * sc).toFixed(1);
  const glowOp  = glow.toFixed(3);
  const glowOp2 = (glow * 0.45).toFixed(3);

  let items = '';
  for (const item of TRASH_LAYOUT) {
    const rawY = (item.yOff + totalFall) % TILE_H;
    const rot  = (item.rot * 180 / Math.PI).toFixed(2);
    const r    = item.r;
    items += `<g transform="translate(${item.x},${rawY.toFixed(1)}) rotate(${rot})">` +
      svgTrashShapes(item.name, r) + `</g>`;
    const wrapY = rawY - TILE_H;
    items += `<g transform="translate(${item.x},${wrapY.toFixed(1)}) rotate(${rot})">` +
      svgTrashShapes(item.name, r) + `</g>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<defs>` +
    `<radialGradient id="vig" cx="50%" cy="50%" r="72%">` +
    `<stop offset="35%" stop-color="#000" stop-opacity="0"/>` +
    `<stop offset="100%" stop-color="#000" stop-opacity="0.72"/>` +
    `</radialGradient>` +
    `<radialGradient id="glow" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%"   stop-color="#d4a060" stop-opacity="${glowOp}"/>` +
    `<stop offset="60%"  stop-color="#c07820" stop-opacity="${glowOp2}"/>` +
    `<stop offset="100%" stop-color="#804010" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="512" height="512" fill="#2a1a0a"/>` +
    items +
    `<rect width="512" height="512" fill="url(#vig)"/>` +
    `<ellipse cx="256" cy="256" rx="${glowRx}" ry="${glowRy}" fill="url(#glow)"/>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

Devvit.addCustomPostType({
  name: 'Wigglers Room',
  description: 'A worm bin composting simulation — grow your worm on Reddit',
  height: 'tall',

  render: (context) => {
    const { kvStore, postId, userId, realtime } = context;
    const roomId = postId ?? 'unknown';

    const webView = useWebView({
      url: 'index.html',

      async onMessage(rawMessage: any) {
        // Unwrap Devvit message envelope if present
        let message: any;
        if (rawMessage?.type === 'devvit-message' && rawMessage?.data?.message) {
          message = typeof rawMessage.data.message === 'string'
            ? JSON.parse(rawMessage.data.message)
            : rawMessage.data.message;
        } else {
          message = rawMessage;
        }

        if (!message || !message.type) return;
        const serverNow = Date.now();

        switch (message.type) {

          // ── Game ready — send all initial state ──────────────────────────
          case MSG_READY: {
            // Get current user — try getCurrentUser() first, fall back to currentUser
            let user = await context.reddit.getCurrentUser().catch(() => null);
            if (!user) {
              // Mobile app sometimes needs currentUser hook value instead
              try { user = await context.reddit.getCurrentUser(); } catch (_) {}
            }

            // context.username is synchronously available — most reliable on mobile
            const contextUsername = (context as any).username || (context as any).userId || null;
            const username = user
              ? `u/${user.username}`
              : contextUsername
                ? `u/${contextUsername}`
                : 'u/You';

            // Send username first so game knows who it is
            webView.postMessage({ type: MSG_SET_USERNAME, username });

            // Fetch avatar — use Devvit's getSnoovatarUrl() method
            try {
              if (user) {
                const avatarUrl = await user.getSnoovatarUrl();
                if (avatarUrl) {
                  webView.postMessage({ type: MSG_SET_PLAYER_AVATAR, url: avatarUrl });
                }
              }
            } catch (e) {
              console.warn('[main] Avatar fetch failed:', e);
            }

            // Load player worm session from KV
            try {
              const raw = await kvStore.get(KV_WORM_SESSION(username));
              if (raw) {
                const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
                // Apply offline drain by preserving ts — game client handles the math
                webView.postMessage({ type: MSG_SET_SESSION, session, username });
              } else {
                // New player — send empty session signal so game uses defaults
                webView.postMessage({ type: MSG_SET_SESSION, session: null, username });
              }
            } catch (e) {
              console.warn('[main] Session load failed:', e);
              webView.postMessage({ type: MSG_SET_SESSION, session: null, username });
            }

            // Load shared world state
            try {
              const worldRaw = await kvStore.get(KV_WORLD(roomId));
              if (worldRaw) {
                const world = typeof worldRaw === 'string' ? JSON.parse(worldRaw) : worldRaw;
                webView.postMessage({ type: MSG_SET_WORLD_STATE, ...world });
              }
            } catch (e) {
              console.warn('[main] World state load failed:', e);
            }

            // Load and send pending worm queue
            try {
              const queueRaw = await kvStore.get(KV_QUEUE(roomId));
              const queue = queueRaw
                ? (typeof queueRaw === 'string' ? JSON.parse(queueRaw) : queueRaw)
                : [];
              if (queue.length > 0) {
                webView.postMessage({ type: MSG_SET_PRESENCE, players: queue });
              }
            } catch (e) {
              console.warn('[main] Queue load failed:', e);
            }
            break;
          }

          // ── Save worm session ────────────────────────────────────────────
          case MSG_SAVE_SESSION: {
            const user = await context.reddit.getCurrentUser();
            const username = user ? `u/${user.username}` : null;
            if (!username || !message.data) break;

            const clamped = clampSession(message.data, serverNow);

            // Preserve server-authoritative fields from existing save
            try {
              const existingRaw = await kvStore.get(KV_WORM_SESSION(username));
              if (existingRaw) {
                const existing = typeof existingRaw === 'string'
                  ? JSON.parse(existingRaw)
                  : existingRaw;
                // Server owns weekStartTs and lastFloodTs — client cannot overwrite
                if (existing.weekStartTs) clamped.weekStartTs = existing.weekStartTs;
                if (existing.lastFloodTs) clamped.lastFloodTs = existing.lastFloodTs;
              }
            } catch (e) {
              console.warn('[main] Existing session read failed during save:', e);
            }

            // Update save timestamp to server time
            clamped.ts = serverNow;

            await kvStore.put(KV_WORM_SESSION(username), JSON.stringify(clamped));
            break;
          }

          // ── World state update (tea level, compost richness, etc.) ───────
          case MSG_WORLD_UPDATE: {
            try {
              const worldData = {
                tLvl:              typeof message.tLvl === 'number'              ? Math.max(0, Math.min(1, message.tLvl))              : 0,
                pooled:            typeof message.pooled === 'number'            ? Math.max(0, Math.min(1, message.pooled))            : 0,
                castingEnrichment: typeof message.castingEnrichment === 'number' ? Math.max(0, Math.min(1, message.castingEnrichment)) : 0,
                scrapsLevel:       typeof message.scrapsLevel === 'number'       ? Math.max(0, Math.min(1, message.scrapsLevel))       : 1,
                updatedAt: serverNow,
              };
              await kvStore.put(KV_WORLD(roomId), JSON.stringify(worldData));
              // Broadcast to all other viewers
              await realtime.send(RT_WORLD(roomId), JSON.stringify({
                type: MSG_SET_WORLD_STATE,
                ...worldData,
              }));
            } catch (e) {
              console.warn('[main] World update failed:', e);
            }
            break;
          }

          // ── Presence update (worm position broadcast) ────────────────────
          case MSG_PRESENCE_UPDATE: {
            try {
              const user = await context.reddit.getCurrentUser();
              const username = user ? `u/${user.username}` : null;
              if (!username) break;
              await realtime.send(RT_PRESENCE(roomId), JSON.stringify({
                type: MSG_SET_PRESENCE,
                players: [{
                  username,
                  x:        message.x,
                  y:        message.y,
                  sleeping: message.sleeping,
                  size:     message.size,
                }],
              }));
            } catch (e) {
              // Presence updates are fire-and-forget — don't warn on failure
            }
            break;
          }

          // ── Player died ──────────────────────────────────────────────────
          case MSG_PLAYER_DIED: {
            const user = await context.reddit.getCurrentUser();
            const username = user ? `u/${user.username}` : null;
            if (!username) break;
            try {
              const raw = await kvStore.get(KV_WORM_SESSION(username));
              if (raw) {
                const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
                session.pHP = 0;
                session.deathCause = message.cause ?? '';
                session.ts = serverNow;
                await kvStore.put(KV_WORM_SESSION(username), JSON.stringify(session));
              }
            } catch (e) {
              console.warn('[main] playerDied save failed:', e);
            }

            // ── Post headstone comment to the thread ───────────────────────
            try {
              const cause  = message.cause ?? 'unknown';
              const karma  = Math.floor(message.karma ?? 0);
              const gen    = message.generation ?? 0;
              const eaten  = Math.min(300000, Math.max(0, message.pEaten ?? 0));
              const uname  = message.username ?? username;

              // Headstone dates — real timestamps from the client
              const bornTs  = message.bornTs ? new Date(message.bornTs) : null;
              const diedTs  = message.diedTs ? new Date(message.diedTs) : new Date(serverNow);
              const fmtDate = (d: Date) =>
                `${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
              const yearsStr = bornTs
                ? `${fmtDate(bornTs)} — ${fmtDate(diedTs)}`
                : fmtDate(diedTs);

              // Generation roman numeral + ordinal life label
              const roman    = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
              const genLabel = roman[gen] ?? String(gen + 1);
              const lifeOrd  = gen === 0 ? '1st' : gen === 1 ? '2nd' : gen === 2 ? '3rd' : `${gen + 1}th`;

              // Cause → epitaph
              const causeLines: Record<string, [string, string]> = {
                starvation:   ['Starved to death',                '"The gut ran dry."'],
                hunger:       ['Slowly starved',                  '"Hunger wore the worm down."'],
                constipation: ['Died of constipation',           '"Too full to move."'],
                acidity:      ['Dissolved by acid',              '"Too many acidic scraps."'],
                flood:        ['Drowned in the flood',           '"The worm tea overflowed."'],
                drowning:     ['Suffocated in waterlogged soil', '"The compost was too saturated."'],
                natural:      ['Completed a full natural life',  '"A life well lived in the bin."'],
              };
              const [causeText, epitaph] = causeLines[cause] ?? ['HP depleted', '"Something wore the worm down."'];

              const pct      = Math.round((eaten / 300000) * 100);
              const biteStr  = eaten.toLocaleString();

              const comment =
`⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛

🪦

**HERE LIES**
**${uname}'s worm**
*Gen ${genLabel} · ${lifeOrd} life*

🌱 ${yearsStr} 🌱

*${causeText}*
*${epitaph}*

☯ **${karma} karma** earned in life
*Ate ${biteStr} / 300,000 bites · ${pct}% of a full life*

⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛`;

              await context.reddit.submitComment({ id: roomId, text: comment });
            } catch (commentErr) {
              console.warn('[main] death headstone comment failed:', commentErr);
            }
            break;
          }

          // ── Flood acknowledged by client (used for server-side flood ts) ─
          case MSG_FLOOD_ACK: {
            // No action needed — flood events are broadcast by server, not client
            break;
          }

          // ── Claim worm from queue ────────────────────────────────────────
          case MSG_CLAIM_WORM: {
            try {
              const user = await context.reddit.getCurrentUser();
              const username = user ? `u/${user.username}` : null;
              if (!username || !message.username) break;
              // Broadcast claim to all viewers so the worm gets removed from their queue
              await realtime.send(RT_PRESENCE(roomId), JSON.stringify({
                type: MSG_WORM_CLAIMED,
                claimedBy: username,
                wormUsername: message.username,
              }));
            } catch (e) {
              console.warn('[main] claimWorm broadcast failed:', e);
            }
            break;
          }

          // ── Join queue (player requesting a pending worm slot) ───────────
          case MSG_JOIN_QUEUE: {
            try {
              const user = await context.reddit.getCurrentUser();
              const username = user ? `u/${user.username}` : null;
              if (!username) break;
              const queueRaw = await kvStore.get(KV_QUEUE(roomId));
              const queue: any[] = queueRaw
                ? (typeof queueRaw === 'string' ? JSON.parse(queueRaw) : queueRaw)
                : [];
              // Add if not already queued
              if (!queue.find((q: any) => q.username === username)) {
                queue.push({ username, joinedAt: serverNow });
                await kvStore.put(KV_QUEUE(roomId), JSON.stringify(queue));
              }
            } catch (e) {
              console.warn('[main] joinQueue failed:', e);
            }
            break;
          }

          // ── Unclaimed worm died (remove from queue) ──────────────────────
          case MSG_UNCLAIMED_WORM_DIED: {
            try {
              if (!message.username) break;
              const queueRaw = await kvStore.get(KV_QUEUE(roomId));
              if (!queueRaw) break;
              const queue: any[] = typeof queueRaw === 'string'
                ? JSON.parse(queueRaw)
                : queueRaw;
              const filtered = queue.filter((q: any) => q.username !== message.username);
              await kvStore.put(KV_QUEUE(roomId), JSON.stringify(filtered));
            } catch (e) {
              console.warn('[main] unclaimedWormDied cleanup failed:', e);
            }
            break;
          }

          // ── Request presence (ask for current player list) ───────────────
          case MSG_REQUEST_PRESENCE: {
            try {
              const queueRaw = await kvStore.get(KV_QUEUE(roomId));
              const queue = queueRaw
                ? (typeof queueRaw === 'string' ? JSON.parse(queueRaw) : queueRaw)
                : [];
              webView.postMessage({ type: MSG_SET_PRESENCE, players: queue });
            } catch (e) {
              console.warn('[main] requestPresence failed:', e);
            }
            break;
          }

          default:
            console.warn('[main] Unknown message type:', message.type);
        }
      },

      onUnmount() {
        console.log('[main] WebView unmounted');
      },
    });

    // ── Realtime channel subscriptions ────────────────────────────────────
    // Forward broadcasts from any player's host to this viewer's webview.
    // Must be declared after webView so the closure captures it correctly.
    // Channel names must be [a-zA-Z0-9_] only — no colons.
    const presenceChannel = useChannel({
      name: RT_PRESENCE(roomId),
      onMessage: (msg: any) => {
        try { webView.postMessage(msg); } catch (_) {}
      },
    });
    presenceChannel.subscribe();

    const worldChannel = useChannel({
      name: RT_WORLD(roomId),
      onMessage: (msg: any) => {
        try { webView.postMessage(msg); } catch (_) {}
      },
    });
    worldChannel.subscribe();

    const floodChannel = useChannel({
      name: RT_FLOOD(roomId),
      onMessage: (msg: any) => {
        try { webView.postMessage(msg); } catch (_) {}
      },
    });
    floodChannel.subscribe();

    // ── Preview animation ─────────────────────────────────────────────────────
    // Interval slowed to 500ms (2fps) — reduces data:image/svg+xml URL churn
    // which is the root cause of Chrome hover-flicker. At 2fps the fall speed
    // is 4px/s (barely perceptible drift), but no flicker on hover.
    // The canvas preview in game.js (requestAnimationFrame) takes over at 60fps
    // the moment the user taps and the webview mounts.
    const [tick,  setTick]  = useState<number>(0);
    const [bgUrl, setBgUrl] = useState<string>(() => buildBgDataUrl(0));

    const anim = useInterval(() => {
      setTick((t: number) => {
        const next = t + 1;
        setBgUrl(buildBgDataUrl(next));
        return next;
      });
    }, 500);
    anim.start();

    return (
      <zstack width="100%" height="100%" alignment="center middle" onPress={() => webView.mount()}>
        <image url={bgUrl} imageWidth={512} imageHeight={512} resizeMode="cover" />
        <image url="icon.png" imageWidth={256} imageHeight={256} resizeMode="fit" />
      </zstack>
    );
  },
});

// ─── Subreddit menu item to create a new Wigglers Room post ──────────────────
Devvit.addMenuItem({
  label: '🪱 Create Wigglers Room',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event: any, context: any) => {
    const { reddit, ui } = context;
    const subreddit = await reddit.getCurrentSubreddit();
    const post = await reddit.submitPost({
      title: 'Wigglers Room 🪱 — Grow your worm!',
      subredditName: subreddit.name,
      preview: (
        <vstack alignment="center middle" height="100%" width="100%">
          <text size="large">🪱 Loading Wigglers Room...</text>
        </vstack>
      ),
    });
    ui.showToast({ text: '🪱 Wigglers Room created!', appearance: 'success' });
    ui.navigateTo(post);
  },
});

export default Devvit;

