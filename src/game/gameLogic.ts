/**
 * game/gameLogic.ts — Wigglers Room
 * PURE FUNCTIONS ONLY. No Redis, no KVStore, no Devvit API calls.
 */

import type {
  WigglersGameState, WigglerPlayer, RoomObject,
  GameActionInput, PlayerAction, GamePhase,
} from '../types.js';

const ROOM_WIDTH       = 100;
const ROOM_HEIGHT      = 100;
const MAX_PLAYERS      = 20;
const IDLE_TIMEOUT_MS  = 30_000;
const PELLET_VALUE     = 10;
const POWERUP_VALUE    = 50;
const GAME_DURATION_MS = 3 * 60 * 1000;
const MAX_OBJECTS      = 30;
const PLAYER_COLORS    = [
  '#FF6B6B','#FFD93D','#6BCB77','#4D96FF',
  '#C77DFF','#FF9F43','#00D2D3','#FF6B9D',
];

export class GameLogic {

  static initRoom(roomId: string): WigglersGameState {
    const now = Date.now();
    return {
      roomId, version: 1, phase: 'lobby',
      players: {}, objects: GameLogic.spawnInitialObjects(),
      tickCount: 0, startedAt: now, endsAt: null, lastTickAt: now,
    };
  }

  static addPlayer(state: WigglersGameState, userId: string, username: string): WigglersGameState {
    if (Object.keys(state.players).length >= MAX_PLAYERS) return state;
    if (state.players[userId]) return state;
    const colorIndex = Object.keys(state.players).length % PLAYER_COLORS.length;
    const newPlayer: WigglerPlayer = {
      userId, username,
      x: 10 + Math.random() * 80,
      y: 10 + Math.random() * 80,
      color: PLAYER_COLORS[colorIndex],
      score: 0,
      wigglePhase: Math.random() * Math.PI * 2,
      lastActiveAt: Date.now(),
    };
    const nextPhase: GamePhase =
      state.phase === 'lobby' && Object.keys(state.players).length + 1 >= 2
        ? 'active' : state.phase;
    return {
      ...state, phase: nextPhase,
      endsAt: nextPhase === 'active' && !state.endsAt ? Date.now() + GAME_DURATION_MS : state.endsAt,
      players: { ...state.players, [userId]: newPlayer },
      version: state.version + 1,
    };
  }

  static applyAction(state: WigglersGameState, input: GameActionInput): WigglersGameState {
    const { userId, action } = input;
    const player = state.players[userId];
    if (!player && action.type !== 'JOIN') return state;
    switch (action.type) {
      case 'MOVE':    return GameLogic.handleMove(state, userId, action);
      case 'COLLECT': return GameLogic.handleCollect(state, userId, action);
      case 'EMOTE':   return GameLogic.handleEmote(state, userId, action);
      case 'LEAVE':   return GameLogic.handleLeave(state, userId);
      default:        return state;
    }
  }

  static tick(state: WigglersGameState): WigglersGameState {
    const now = Date.now();
    const activePlayers = Object.fromEntries(
      Object.entries(state.players).filter(([, p]) => now - p.lastActiveAt < IDLE_TIMEOUT_MS)
    );
    const animatedPlayers: typeof activePlayers = {};
    for (const [id, p] of Object.entries(activePlayers)) {
      animatedPlayers[id] = { ...p, wigglePhase: (p.wigglePhase + 0.15) % (Math.PI * 2) };
    }
    let nextPhase: GamePhase = state.phase;
    if (state.phase === 'active' && state.endsAt && now >= state.endsAt) nextPhase = 'results';
    if (state.phase === 'results' && now >= (state.endsAt ?? 0) + 10_000) nextPhase = 'ended';
    const objects = state.objects.length < MAX_OBJECTS / 2
      ? [...state.objects, ...GameLogic.spawnInitialObjects(MAX_OBJECTS / 4)]
      : state.objects;
    return { ...state, phase: nextPhase, players: animatedPlayers, objects,
      tickCount: state.tickCount + 1, lastTickAt: now, version: state.version + 1 };
  }

  private static handleMove(state: WigglersGameState, userId: string, action: PlayerAction): WigglersGameState {
    const { x, y } = action.data ?? {};
    if (x === undefined || y === undefined) return state;
    return { ...state, version: state.version + 1, players: { ...state.players, [userId]: {
      ...state.players[userId],
      x: Math.max(0, Math.min(ROOM_WIDTH, x)),
      y: Math.max(0, Math.min(ROOM_HEIGHT, y)),
      lastActiveAt: Date.now(),
    }}};
  }

  private static handleCollect(state: WigglersGameState, userId: string, action: PlayerAction): WigglersGameState {
    const { objectId } = action.data ?? {};
    if (!objectId) return state;
    const object = state.objects.find(o => o.id === objectId);
    if (!object) return state;
    return { ...state, version: state.version + 1,
      players: { ...state.players, [userId]: {
        ...state.players[userId],
        score: state.players[userId].score + object.value,
        lastActiveAt: Date.now(),
      }},
      objects: state.objects.filter(o => o.id !== objectId),
    };
  }

  private static handleEmote(state: WigglersGameState, userId: string, action: PlayerAction): WigglersGameState {
    return { ...state, version: state.version + 1, players: { ...state.players, [userId]: {
      ...state.players[userId], emote: action.data?.emote, lastActiveAt: Date.now(),
    }}};
  }

  private static handleLeave(state: WigglersGameState, userId: string): WigglersGameState {
    const { [userId]: _removed, ...remaining } = state.players;
    return { ...state, version: state.version + 1, players: remaining };
  }

  private static spawnInitialObjects(count = MAX_OBJECTS): RoomObject[] {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => {
      const isPowerup = Math.random() < 0.1;
      return {
        id: `obj-${now}-${i}`,
        type: isPowerup ? 'powerup' : 'pellet',
        x: 5 + Math.random() * 90,
        y: 5 + Math.random() * 90,
        value: isPowerup ? POWERUP_VALUE : PELLET_VALUE,
        spawnedAt: now,
      } as RoomObject;
    });
  }

  static getSnapshot(state: WigglersGameState) {
    const sorted = Object.values(state.players)
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, ...p }));
    return { phase: state.phase, leaderboard: sorted, tickCount: state.tickCount };
  }
}
