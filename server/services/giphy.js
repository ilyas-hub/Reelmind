const axios = require('axios');

const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

async function searchGiphy(query) {
  const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
    params: {
      api_key: GIPHY_API_KEY,
      q: query,
      limit: 10,
      rating: 'pg',
    },
  });
  return response.data.data || [];
}

function uniqueGifs(gifs) {
  const seen = new Set();
  return gifs.filter((gif) => {
    if (seen.has(gif.id)) return false;
    seen.add(gif.id);
    return true;
  });
}

async function fetchReactionGif(searchTerm) {
  const queries = [
    searchTerm,
    `${searchTerm} meme`,
    `${searchTerm} reaction`,
    `${searchTerm} reaction 2026`,
  ];

  const results = await Promise.all(queries.map((q) => searchGiphy(q)));
  const combined = uniqueGifs(results.flat());

  if (combined.length === 0) {
    throw new Error('No Giphy GIFs found');
  }

  const gif = combined[Math.floor(Math.random() * combined.length)];
  return gif.images.original.mp4 || gif.images.original.url;
}

module.exports = { fetchReactionGif };
