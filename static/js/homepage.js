function toggleMusic() {
  const music = document.getElementById('bg-music');
  const button = document.getElementById('music-toggle');

  if (music.paused) {
    music.play();
    button.textContent = '🎵 Music On';
  } else {
    music.pause();
    button.textContent = '🔇 Music Off';
  }
}