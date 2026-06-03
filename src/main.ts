/**
 * main.ts — Wigglers Room
 * Entry point for the Devvit app.
 */

import Devvit, { Context } from '@devvit/public-api';
import { DataManager } from './data/dataManager.js';
import { GameLogic } from './game/gameLogic.js';
import { buildWebViewHTML } from './ui/uiComponent.js';
import { Ticker } from './utils/ticker.js';
import type { WigglersGameState, ClientMessage, ServerMessage } from './types.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
  kvStore: true,
  realtime: true,
});

Devvit.addCustomPostType({
  name: 'Wigglers Room',
  description: 'A wiggly multiplayer room game',
  height: 'tall',

  render: (context: Context) => {
    const { useState, useWebView, reddit, redis, kvStore, userId } = context;
    const dm = new DataManager(redis, kvStore);
    const postId = context.postId ?? 'unknown';
    const currentUserId = userId ?? 'anonymous';

    const [roomState, setRoomState] = useState<WigglersGameState>(async () => {
      return dm.loadOrInitRoom(postId);
    });

    const [userPrefs, setUserPrefs] = useState(async () => {
      return dm.loadUserPrefs(currentUserId);
    });

    const webView = useWebView<ClientMessage, ServerMessage>({
      url: 'index.html',
      async onMessage(message: ClientMessage, webViewContext) {
        switch (message.type) {
          case 'READY': {
            const freshState = await dm.loadOrInitRoom(postId);
            webViewContext.postMessage({ type: 'STATE_SYNC', payload: freshState });
            break;
          }
          case 'PLAYER_ACTION': {
            const caught = Ticker.catchUp(roomState);
            const nextState = GameLogic.applyAction(caught, { userId: currentUserId, action: message.payload });
            await dm.saveRoomState(postId, nextState);
            setRoomState(nextState);
            await context.realtime.send(`room:${postId}`, { type: 'STATE_SYNC', payload: nextState });
            webViewContext.postMessage({ type: 'ACTION_ACK', success: true });
            break;
          }
          case 'FETCH_LEADERBOARD': {
            const board = await dm.getLeaderboard(postId, 10);
            webViewContext.postMessage({ type: 'LEADERBOARD_DATA', payload: board });
            break;
          }
          case 'UPDATE_PREFS': {
            const updatedPrefs = { ...userPrefs, ...message.payload };
            await dm.saveUserPrefs(currentUserId, updatedPrefs);
            setUserPrefs(updatedPrefs);
            break;
          }
          default:
            console.warn('[main] Unknown message type:', (message as any).type);
        }
      },
      onUnmount() {
        console.log('[main] WebView unmounted for user:', currentUserId);
      },
    });

    const ticker = new Ticker(context);
    ticker.startPolling(postId, async () => {
      const latest = await dm.loadOrInitRoom(postId);
      if (latest.version !== roomState.version) {
        setRoomState(latest);
        webView.postMessage({ type: 'STATE_SYNC', payload: latest });
      }
    });

    return (
      <vstack width="100%" height="100%" alignment="center middle">
        <webview
          id="wigglers-webview"
          url="index.html"
          width="100%"
          height="100%"
          onMessage={webView.onMessage}
          grow
        />
      </vstack>
    );
  },
});

Devvit.addMenuItem({
  label: '🐛 Create Wigglers Room',
  location: 'subreddit',
  onPress: async (event, context) => {
    const { reddit, ui } = context;
    const subreddit = await reddit.getCurrentSubreddit();
    const post = await reddit.submitPost({
      title: "Wigglers Room 🐛 — Come Wiggle!",
      subredditName: subreddit.name,
      preview: (
        <vstack alignment="center middle" height="100%" width="100%">
          <text size="large">🐛 Loading Wigglers Room...</text>
        </vstack>
      ),
    });
    ui.showToast({ text: '🐛 Wigglers Room created!', appearance: 'success' });
    ui.navigateTo(post);
  },
});

export default Devvit;
