document.getElementById('status').textContent = 'JS works!';
setTimeout(() => {
  document.getElementById('status').textContent = 'Timeout fired!';
}, 2000);
