/**
 * data/dataManager.ts — Wigglers Room
 * ALL Redis and KVStore I/O lives here. No game logic, no UI.
 */

import type { RedisClient, KVStore } from '@devvit/public-api';
import { GameLogic } from '../game/gameLogic.js';
import { RedisKeys, KVKeys, type WigglersGameState, type UserPrefs, type LeaderboardEntry } from '../types.js';

const DEFAULT_USER_PREFS = (userId: string): UserPrefs => ({
  userId, wiggleColor: '#6BCB77', soundEnabled: true,
  controlScheme: 'arrows', totalGamesPlayed: 0,
});

const ROOM_STATE_TTL_SECONDS = 60 * 60 * 24;

export class DataManager {
  constructor(private readonly redis: RedisClient, private readonly kvStore: KVStore) {}

  async loadOrInitRoom(roomId: string): Promise<WigglersGameState> {
    const key = RedisKeys.roomState(roomId);
    try {
      const raw = await this.redis.get(key);
      if (raw) return JSON.parse(raw) as WigglersGameState;
    } catch (err) { console.error('[DataManager] Redis read error:', err); }
    const freshState = GameLogic.initRoom(roomId);
    await this.saveRoomState(roomId, freshState);
    return freshState;
  }

  async saveRoomState(roomId: string, state: WigglersGameState): Promise<void> {
    try {
      const expiration = new Date(Date.now() + ROOM_STATE_TTL_SECONDS * 1000);
      await this.redis.set(RedisKeys.roomState(roomId), JSON.stringify(state), { expiration });
    } catch (err) { console.error('[DataManager] Redis write error:', err); }
  }

  async casRoomState(roomId: string, expectedVersion: number, nextState: WigglersGameState): Promise<WigglersGameState> {
    const raw = await this.redis.get(RedisKeys.roomState(roomId));
    if (!raw) { await this.saveRoomState(roomId, nextState); return nextState; }
    const current = JSON.parse(raw) as WigglersGameState;
    if (current.version !== expectedVersion) return current;
    await this.saveRoomState(roomId, nextState);
    return nextState;
  }

  async updateLeaderboard(roomId: string, userId: string, score: number): Promise<void> {
    try {
      await this.redis.zAdd(RedisKeys.leaderboard(roomId), { score, member: userId });
      await this.redis.zAdd(RedisKeys.globalLb(), { score, member: userId });
    } catch (err) { console.error('[DataManager] Leaderboard update error:', err); }
  }

  async getLeaderboard(roomId: string, topN = 10): Promise<LeaderboardEntry[]> {
    try {
      const entries = await this.redis.zRange(RedisKeys.leaderboard(roomId), 0, topN - 1, { reverse: true, by: 'rank' });
      return entries.map((entry, i) => ({ rank: i + 1, userId: entry.member, username: entry.member, score: entry.score, gamesPlayed: 0 }));
    } catch (err) { console.error('[DataManager] Leaderboard read error:', err); return []; }
  }

  async getPlayerRank(roomId: string, userId: string): Promise<number | null> {
    try {
      const rank = await this.redis.zRank(RedisKeys.leaderboard(roomId), userId);
      return (rank !== undefined && rank !== null) ? rank + 1 : null;
    } catch { return null; }
  }

  async loadUserPrefs(userId: string): Promise<UserPrefs> {
    try {
      const raw = await this.kvStore.get<string>(KVKeys.userPrefs(userId));
      if (raw) return JSON.parse(raw) as UserPrefs;
    } catch (err) { console.error('[DataManager] KVStore read error:', err); }
    return DEFAULT_USER_PREFS(userId);
  }

  async saveUserPrefs(userId: string, prefs: UserPrefs): Promise<void> {
    try { await this.kvStore.put(KVKeys.userPrefs(userId), JSON.stringify(prefs)); }
    catch (err) { console.error('[DataManager] KVStore write error:', err); }
  }

  async incrementGamesPlayed(userId: string): Promise<void> {
    const prefs = await this.loadUserPrefs(userId);
    await this.saveUserPrefs(userId, { ...prefs, totalGamesPlayed: prefs.totalGamesPlayed + 1 });
  }

  async acquireLock(roomId: string, ttlSeconds = 5): Promise<boolean> {
    try {
      const expiration = new Date(Date.now() + ttlSeconds * 1000);
      const result = await this.redis.set(RedisKeys.roomLock(roomId), '1', { expiration, nx: true });
      return result === 'OK';
    } catch { return false; }
  }

  async releaseLock(roomId: string): Promise<void> {
    await this.redis.del(RedisKeys.roomLock(roomId));
  }
}
