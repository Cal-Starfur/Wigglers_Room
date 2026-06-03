document.getElementById('loading').classList.add('hidden');
document.getElementById('game-canvas').style.display = 'block';

var canvas = document.getElementById('game-canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
var ctx = canvas.getContext('2d');
ctx.fillStyle = '#0d1117';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#6BCB77';
ctx.font = '24px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Wigglers Room Ready!', canvas.width/2, canvas.height/2);
