/**
 * utils/ticker.ts — Wigglers Room
 * Lazy-tick pattern for Devvit's serverless environment.
 */

import type { Context } from '@devvit/public-api';
import { GameLogic } from '../game/gameLogic.js';
import type { WigglersGameState } from '../types.js';

export const TICK_INTERVAL_MS = 500;
export const POLL_INTERVAL_MS = 2_000;
const MAX_CATCHUP_TICKS = 10;

export class Ticker {
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly context: Context) {}

  static elapsedTicks(state: WigglersGameState): number {
    const elapsed = Date.now() - state.lastTickAt;
    return Math.min(Math.floor(elapsed / TICK_INTERVAL_MS), MAX_CATCHUP_TICKS);
  }

  static catchUp(state: WigglersGameState): WigglersGameState {
    const ticks = Ticker.elapsedTicks(state);
    let current = state;
    for (let i = 0; i < ticks; i++) current = GameLogic.tick(current);
    return current;
  }

  startPolling(_roomId: string, onPoll: () => Promise<void>, intervalMs = POLL_INTERVAL_MS): void {
    if (this.pollHandle) return;
    this.pollHandle = setInterval(() => {
      onPoll().catch(err => console.error('[Ticker] Poll error:', err));
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollHandle) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }
}
