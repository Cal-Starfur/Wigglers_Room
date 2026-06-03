import { Devvit, useState, useWebView } from '@devvit/public-api';
import { DataManager } from './data/dataManager.js';
import { GameLogic } from './game/gameLogic.js';
import { Ticker } from './utils/ticker.js';

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

  render: (context) => {
    const { redis, kvStore, postId, userId } = context;
    const dm = new DataManager(redis, kvStore);
    const roomId = postId ?? 'unknown';
    const currentUserId = userId ?? 'anonymous';

    const [roomStateJson, setRoomStateJson] = useState<string>(async () => {
      const state = await dm.loadOrInitRoom(roomId);
      return JSON.stringify(state);
    });

    const [userPrefsJson, setUserPrefsJson] = useState<string>(async () => {
      const prefs = await dm.loadUserPrefs(currentUserId);
      return JSON.stringify(prefs);
    });

    const webView = useWebView({
      url: 'index.html',

      async onMessage(message: any, webViewContext: any) {
        const roomState = JSON.parse(roomStateJson);
        const userPrefs = JSON.parse(userPrefsJson);

        switch (message.type) {
          case 'READY': {
            const freshState = await dm.loadOrInitRoom(roomId);
            webViewContext.postMessage({ type: 'STATE_SYNC', payload: JSON.stringify(freshState) });
            break;
          }
          case 'PLAYER_ACTION': {
            const caught = Ticker.catchUp(roomState);
            const nextState = GameLogic.applyAction(caught, {
              userId: currentUserId,
              action: message.payload,
            });
            await dm.saveRoomState(roomId, nextState);
            setRoomStateJson(JSON.stringify(nextState));
            await context.realtime.send(`room:${roomId}`, JSON.stringify({
              type: 'STATE_SYNC',
              payload: nextState,
            }));
            webViewContext.postMessage({ type: 'ACTION_ACK', success: true });
            break;
          }
          case 'FETCH_LEADERBOARD': {
            const board = await dm.getLeaderboard(roomId, 10);
            webViewContext.postMessage({ type: 'LEADERBOARD_DATA', payload: JSON.stringify(board) });
            break;
          }
          case 'UPDATE_PREFS': {
            const updatedPrefs = { ...userPrefs, ...message.payload };
            await dm.saveUserPrefs(currentUserId, updatedPrefs);
            setUserPrefsJson(JSON.stringify(updatedPrefs));
            break;
          }
          default:
            console.warn('[main] Unknown message type:', message.type);
        }
      },

      onUnmount() {
        console.log('[main] WebView unmounted for user:', currentUserId);
      },
    });

    const roomState = JSON.parse(roomStateJson);
    const ticker = new Ticker(context);
    ticker.startPolling(roomId, async () => {
      const latest = await dm.loadOrInitRoom(roomId);
      if (latest.version !== roomState.version) {
        setRoomStateJson(JSON.stringify(latest));
        webView.postMessage(JSON.stringify({ type: 'STATE_SYNC', payload: latest }));
      }
    });

    return (
      <vstack width="100%" height="100%" alignment="center middle">
        <webview
          id="wigglers-webview"
          url="index.html"
          width="100%"
          height="100%"
          grow
        />
      </vstack>
    );
  },
});

Devvit.addMenuItem({
  label: '🐛 Create Wigglers Room',
  location: 'subreddit',
  onPress: async (_event: any, context: any) => {
    const { reddit, ui } = context;
    const subreddit = await reddit.getCurrentSubreddit();
    const post = await reddit.submitPost({
      title: 'Wigglers Room 🐛 — Come Wiggle!',
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
