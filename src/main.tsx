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

import { Devvit, useWebView } from '@devvit/public-api';

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
const MSG_SET_WEATHER         = 'setWeather';
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
const KV_WEATHER       = (postId: string)   => `weather:${postId}`;
const WEATHER_TTL_MS   = 60 * 60 * 1000; // re-fetch Open-Meteo once per hour

// ─── Realtime channel helpers ─────────────────────────────────────────────────
const RT_WORLD    = (postId: string) => `world:${postId}`;
const RT_PRESENCE = (postId: string) => `presence:${postId}`;
const RT_FLOOD    = (postId: string) => `flood:${postId}`;

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
            // Get current user
            const user = await context.reddit.getCurrentUser();
            const username = user ? `u/${user.username}` : 'u/You';

            // Send username first so game knows who it is
            webView.postMessage({ type: MSG_SET_USERNAME, username });

            // Fetch avatar
            try {
              if (user?.username) {
                const aboutRes = await fetch(
                  `https://www.reddit.com/user/${user.username}/about.json`
                );
                const aboutData = await aboutRes.json();
                const avatarUrl = aboutData?.data?.icon_img
                  || aboutData?.data?.subreddit?.icon_img
                  || '';
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

            // ── Live weather via Open-Meteo (Nashville fallback) ─────────────
            // Cached in KV for WEATHER_TTL_MS to avoid hammering the API.
            // Free API, no key needed. Nashville coords as default.
            try {
              const LAT = 36.1627; const LON = -86.7816; // Nashville, TN
              const LOC_NAME = 'Nashville, TN';
              let weatherData: any = null;
              const cachedWeatherRaw = await kvStore.get(KV_WEATHER(roomId));
              if (cachedWeatherRaw) {
                const cached = typeof cachedWeatherRaw === 'string'
                  ? JSON.parse(cachedWeatherRaw) : cachedWeatherRaw;
                if (serverNow - (cached.fetchedAt ?? 0) < WEATHER_TTL_MS) {
                  weatherData = cached;
                }
              }
              if (!weatherData) {
                const weatherRes = await fetch(
                  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
                  `&current=temperature_2m,relative_humidity_2m,precipitation`
                );
                if (weatherRes.ok) {
                  const raw = await weatherRes.json();
                  const cur = raw?.current ?? {};
                  // Normalize to 0–1 ranges
                  // temp: -10°C → 0, 40°C → 1
                  const tempRaw = cur.temperature_2m ?? 18;
                  const humidRaw = cur.relative_humidity_2m ?? 62;
                  const precipRaw = cur.precipitation ?? 0;
                  weatherData = {
                    temp:     Math.max(0, Math.min(1, (tempRaw + 10) / 50)),
                    humidity: Math.max(0, Math.min(1, humidRaw / 100)),
                    precip:   Math.max(0, Math.min(1, precipRaw / 10)), // 10mm/h = max
                    locName:  LOC_NAME,
                    fetchedAt: serverNow,
                  };
                  await kvStore.put(KV_WEATHER(roomId), JSON.stringify(weatherData));
                }
              }
              if (weatherData) {
                webView.postMessage({
                  type:     MSG_SET_WEATHER,
                  humidity: weatherData.humidity,
                  temp:     weatherData.temp,
                  precip:   weatherData.precip,
                  locName:  weatherData.locName ?? LOC_NAME,
                });
              }
            } catch (e) {
              console.warn('[main] Weather fetch failed (using game default):', e);
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

            // ── Track weekly contributor ──────────────────────────────────────
            // Each player's weeklyContrib is included in worldUpdate so we can
            // accumulate a server-side leaderboard over the week.
            try {
              const contribUser = await context.reddit.getCurrentUser();
              const contribName = contribUser ? `u/${contribUser.username}` : null;
              if (contribName && typeof message.weeklyContrib === 'number' && message.weeklyContrib > 0) {
                const weekRaw = await kvStore.get(KV_WEEK(roomId));
                const weekData = weekRaw
                  ? (typeof weekRaw === 'string' ? JSON.parse(weekRaw) : weekRaw)
                  : { weekStartTs: serverNow, contributors: {} };
                weekData.contributors = weekData.contributors ?? {};
                // Update this player's contribution (take max seen this week)
                const prev = weekData.contributors[contribName] ?? 0;
                weekData.contributors[contribName] = Math.max(prev, message.weeklyContrib);
                await kvStore.put(KV_WEEK(roomId), JSON.stringify(weekData));
              }
            } catch (e) {
              console.warn('[main] Weekly contrib update failed:', e);
            }

            // ── Weekly leaderboard comment (fires when client sends weeklyDrain: true) ─
            if (message.weeklyDrain === true) {
              try {
                const weekRaw = await kvStore.get(KV_WEEK(roomId));
                const weekData = weekRaw
                  ? (typeof weekRaw === 'string' ? JSON.parse(weekRaw) : weekRaw)
                  : { weekStartTs: serverNow, contributors: {} };

                const contributors: Record<string, number> = weekData.contributors ?? {};
                const sorted = Object.entries(contributors)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10);

                if (sorted.length > 0) {
                  const medals = ['🥇', '🥈', '🥉'];
                  const weekDate = new Date(weekData.weekStartTs ?? serverNow)
                    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const tLvlPct  = Math.round((message.tLvl ?? 0) * 100);

                  let leaderboard = `🌿 **Weekly Worm Tea Harvest — Week of ${weekDate}**

`;
                  sorted.forEach(([name, contrib], i) => {
                    const medal  = medals[i] ?? `${i + 1}.`;
                    const pts    = Math.round(contrib * 1000);
                    leaderboard += `${medal} ${name} — ${pts} pts
`;
                  });
                  leaderboard +=
                    `
Total tea drained: ${tLvlPct}% 🫗  Next harvest in 7 days.

` +
                    `*Join the bin to grow your worm and earn tea karma!*`;

                  await context.reddit.submitComment({ id: roomId, text: leaderboard });
                }

                // Reset contributors for next week
                const newWeek = { weekStartTs: serverNow, contributors: {} };
                await kvStore.put(KV_WEEK(roomId), JSON.stringify(newWeek));
              } catch (e) {
                console.warn('[main] Weekly leaderboard post failed:', e);
              }
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
                player: {
                  username,
                  x:          message.x,
                  y:          message.y,
                  sleeping:   message.sleeping,
                  size:       message.size,
                  segs:       message.segs       ?? null,
                  generation: message.generation ?? 0,
                  hp:         message.hp         ?? 1,
                  gut:        message.gut         ?? 1,
                },
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
            // Save death state to KV
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
            // Post a death comment to the Reddit thread
            try {
              const causeEmoji: Record<string, string> = {
                starvation:   '🥺',
                acidity:      '🧪',
                constipation: '💩',
                flood:        '🌊',
                natural:      '🌿',
                drowning:     '🌊',
              };
              const causePhrase: Record<string, string> = {
                starvation:   'starved to death',
                acidity:      'dissolved in their own acid',
                constipation: 'died of constipation',
                flood:        'was swept away in a flood',
                natural:      'lived a full and enriching life',
                drowning:     'drowned in the sump',
              };
              const cause    = message.cause ?? 'unknown';
              const isOffline = message.offline === true;
              const emoji    = causeEmoji[cause]  ?? '💀';
              const phrase   = causePhrase[cause] ?? 'met their end';
              const gen      = message.generation ?? 0;
              const eaten    = message.pEaten     ?? 0;
              const karma    = message.karma      ?? 0;
              const genStr   = gen > 0 ? ` (Gen ${gen})` : '';
              const offlineStr = isOffline ? ' while they were away' : '';
              const commentBody =
                `${emoji} **${username}'s worm${genStr} ${phrase}${offlineStr}!**

` +
                `🍂 Scraps eaten: ${eaten.toLocaleString()} · ` +
                `🌿 Karma: ${karma.toLocaleString()}

` +
                `*Their worm will be reborn next time they visit the bin.*`;
              await context.reddit.submitComment({ id: roomId, text: commentBody });
            } catch (e) {
              console.warn('[main] Death comment post failed:', e);
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

    // ── Preview UI (shown before webview mounts) ───────────────────────────
    return (
      <vstack width="100%" height="100%" alignment="center middle" gap="medium">
        <image url="icon.png" imageWidth={80} imageHeight={80} />
        <text size="xlarge" weight="bold">Wigglers Room 🪱</text>
        <text size="small" color="neutral-content-weak">A living worm bin on Reddit</text>
        <button onPress={() => webView.mount()} appearance="primary">Enter the Bin</button>
      </vstack>
    );
  },
});

// ─── Subreddit menu item to create a new Wigglers Room post ──────────────────
Devvit.addMenuItem({
  label: '🪱 Create Wigglers Room',
  location: 'subreddit',
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
