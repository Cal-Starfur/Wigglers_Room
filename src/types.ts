/**
 * types.ts — Wigglers Room
 * Single source of truth for all shared types.
 */

export interface WigglerPlayer {
  userId: string;
  username: string;
  x: number;
  y: number;
  color: string;
  score: number;
  wigglePhase: number;
  lastActiveAt: number;
  emote?: string;
}

export interface RoomObject {
  id: string;
  type: 'pellet' | 'powerup' | 'obstacle';
  x: number;
  y: number;
  value: number;
  spawnedAt: number;
}

export interface WigglersGameState {
  roomId: string;
  version: number;
  phase: GamePhase;
  players: Record<string, WigglerPlayer>;
  objects: RoomObject[];
  tickCount: number;
  startedAt: number;
  endsAt: number | null;
  lastTickAt: number;
}

export type GamePhase = 'lobby' | 'active' | 'results' | 'ended';

export interface UserPrefs {
  userId: string;
  wiggleColor: string;
  soundEnabled: boolean;
  controlScheme: 'arrows' | 'wasd' | 'touch';
  totalGamesPlayed: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: number;
  gamesPlayed: number;
}

export type ClientMessage =
  | { type: 'READY' }
  | { type: 'PLAYER_ACTION'; payload: PlayerAction }
  | { type: 'FETCH_LEADERBOARD' }
  | { type: 'UPDATE_PREFS'; payload: Partial<UserPrefs> };

export type ServerMessage =
  | { type: 'STATE_SYNC'; payload: WigglersGameState }
  | { type: 'ACTION_ACK'; success: boolean; error?: string }
  | { type: 'LEADERBOARD_DATA'; payload: LeaderboardEntry[] }
  | { type: 'TICK'; payload: { tickCount: number; timestamp: number } };

export type PlayerActionType = 'MOVE' | 'COLLECT' | 'EMOTE' | 'JOIN' | 'LEAVE';

export interface PlayerAction {
  type: PlayerActionType;
  data?: { x?: number; y?: number; objectId?: string; emote?: string; };
}

export interface GameActionInput {
  userId: string;
  action: PlayerAction;
}

export const RedisKeys = {
  roomState:   (roomId: string) => `wiggle:room:${roomId}:state`,
  leaderboard: (roomId: string) => `wiggle:room:${roomId}:lb`,
  globalLb:    ()               => `wiggle:global:lb`,
  roomLock:    (roomId: string) => `wiggle:room:${roomId}:lock`,
} as const;

export const KVKeys = {
  userPrefs: (userId: string) => `prefs:${userId}`,
} as const;
