const path = require('path');

const AUDIO_MAP = {
  funny: 'funny.mp3',
  hype: 'hype.mp3',
  chill: 'chill.mp3',
  dramatic: 'dramatic.mp3',
  relatable: 'relatable.mp3',
};

function getAudioPath(tone) {
  const file = AUDIO_MAP[tone] || AUDIO_MAP.chill;
  return path.join(__dirname, '..', 'assets', 'audio', file);
}

module.exports = { getAudioPath };
