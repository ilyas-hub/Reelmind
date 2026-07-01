const axios = require('axios');

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

const SEARCH_TERMS = [
  'person talking casual indoor',
  'man reacting camera',
  'woman explaining phone',
  'creator talking to camera',
  'person sitting talking camera',
];

async function fetchTalkingHeadVideo() {
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const response = await axios.get('https://api.pexels.com/videos/search', {
    headers: { Authorization: PEXELS_API_KEY },
    params: { query: term, orientation: 'portrait', per_page: 10 },
  });

  const videos = response.data.videos;
  if (!videos || videos.length === 0) {
    throw new Error('No Pexels videos found');
  }

  const video = videos[Math.floor(Math.random() * videos.length)];
  const hdFile = video.video_files.find(f => f.quality === 'hd') || video.video_files[0];

  return {
    url: hdFile.link,
    duration: video.duration,
    width: video.width,
    height: video.height,
  };
}

module.exports = { fetchTalkingHeadVideo };
