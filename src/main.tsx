

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

// Pulsing warm amber glow behind the icon — transparent SVG layered over the bg.
// Icon swelling is driven separately via iconSize state so it stays a native image tag.
// Wave multipliers are slow (0.05 / 0.04) so each 100ms tick is a tiny increment,
// giving a smooth ~12-second breath cycle despite the 10fps update rate.
function buildGlowDataUrl(tick: number): string {
  const glow = 0.28 + Math.sin(tick * 0.05) * 0.12;
  const sc   = 1 + Math.sin(tick * 0.05) * 0.032;
  const svg  =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<radialGradient id="g" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%"   stop-color="#d4a060" stop-opacity="${glow.toFixed(3)}"/>` +
    `<stop offset="60%"  stop-color="#c07820" stop-opacity="${(glow * 0.45).toFixed(3)}"/>` +
    `<stop offset="100%" stop-color="#804010" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<ellipse cx="256" cy="256" rx="${(160 * sc).toFixed(1)}" ry="${(145 * sc).toFixed(1)}" fill="url(#g)"/>` +
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

    // ── Preview animation state ────────────────────────────────────────────
    const [tick,      setTick]      = useState<number>(0);
    const [glowUrl,   setGlowUrl]   = useState<string>('');
    const [iconSize,  setIconSize]  = useState<number>(256);

    const anim = useInterval(() => {
      setTick((t: number) => {
        const next  = t + 1;
        const sc    = 1 + Math.sin(next * 0.05) * 0.032;  // same wave as glow, ~12s cycle
        setGlowUrl(buildGlowDataUrl(next));
        setIconSize(Math.round(256 * sc));
        return next;
      });
    }, 100);
    anim.start();

    // ── Preview UI (shown before webview mounts) ───────────────────────────
    return (
      <zstack width="100%" height="100%" alignment="center middle" onPress={() => webView.mount()}>
        <image url="preview-bg.png" imageWidth={512} imageHeight={512} resizeMode="cover" />
        {glowUrl ? (
          <image url={glowUrl} imageWidth={512} imageHeight={512} resizeMode="cover" />
        ) : null}
        <image url="icon.png" imageWidth={iconSize} imageHeight={iconSize} resizeMode="fit" />
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




