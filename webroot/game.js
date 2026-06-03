var canvas = document.getElementById('game-canvas');
var ctx = canvas.getContext('2d');
var state = null;
var myId = null;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

document.getElementById('loading').classList.add('hidden');
canvas.style.display = 'block';

function sendToServer(msg) {
  window.parent.postMessage(msg, '*');
}

window.addEventListener('message', function(e) {
  var msg = e.data;
  if (!msg || !msg.type) return;
  if (msg.type === 'STATE_SYNC') {
    var payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
    onStateSync(payload);
  }
  if (msg.type === 'LEADERBOARD_DATA') {
    var entries = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
    renderLeaderboard(entries);
  }
});

sendToServer({ type: 'READY' });

function onStateSync(newState) {
  state = newState;
  updateHUD();
  updateLeaderboard();
}

function updateHUD() {
  if (!state) return;
  var me = state.players[myId];
  document.getElementById('score-display').textContent = 'Score: ' + (me ? me.score : 0);
  document.getElementById('player-count').textContent = Object.keys(state.players).length + ' players';
  if (state.endsAt) {
    var remaining = Math.max(0, Math.floor((state.endsAt - Date.now()) / 1000));
    var m = Math.floor(remaining / 60);
    var s = remaining % 60;
    document.getElementById('timer-display').textContent = m + ':' + (s < 10 ? '0' : '') + s;
  }
}

function updateLeaderboard() {
  if (!state) return;
  var entries = Object.values(state.players).sort(function(a,b){ return b.score - a.score; }).slice(0,5);
  renderLeaderboard(entries.map(function(p,i){ return { rank: i+1, username: p.username, score: p.score }; }));
}

function renderLeaderboard(entries) {
  document.getElementById('lb-entries').innerHTML = entries.map(function(e) {
    return '<div class="lb-entry"><span class="lb-rank">' + e.rank + '</span><span class="lb-name">' + (e.username || 'player').slice(0,12) + '</span><span class="lb-score">' + e.score + '</span></div>';
  }).join('');
}

document.querySelectorAll('.emote-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    sendToServer({ type: 'PLAYER_ACTION', payload: { type: 'EMOTE', data: { emote: btn.dataset.emote } } });
  });
});

canvas.addEventListener('pointermove', function(e) {
  if (!state) return;
  sendToServer({ type: 'PLAYER_ACTION', payload: { type: 'MOVE', data: {
    x: (e.clientX / canvas.width) * 100,
    y: (e.clientY / canvas.height) * 100
  }}});
});

function render() {
  if (!state) { requestAnimationFrame(render); return; }
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (var x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (var y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  state.objects.forEach(function(obj) {
    var px = (obj.x/100)*W, py = (obj.y/100)*H;
    ctx.beginPath();
    ctx.arc(px, py, obj.type === 'powerup' ? 8 : 4, 0, Math.PI*2);
    ctx.fillStyle = obj.type === 'powerup' ? '#FFD93D' : '#6BCB77';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  Object.values(state.players).forEach(function(p) {
    var px = (p.x/100)*W, py = (p.y/100)*H;
    var wobble = Math.sin(p.wigglePhase) * 4;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(wobble * 0.1);
    ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2);
    ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-5,-4,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(5,-4,4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-4,-3,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(6,-3,2,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.username || p.userId, px, py+26);
  });

  updateHUD();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
setInterval(function() { sendToServer({ type: 'FETCH_LEADERBOARD' }); }, 10000);
