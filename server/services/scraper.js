const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeProduct(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(html);
    const title = $('title').first().text().trim() || '';
    const description = $('meta[name="description"]').attr('content') ||
                        $('meta[property="og:description"]').attr('content') || '';
    const image = $('meta[property="og:image"]').attr('content') || '';
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000);

    return { title, description, image, bodyText, url };
  } catch (err) {
    const code = err && err.code;
    const isNetworkError = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'].includes(code);
    if (isNetworkError || err.message.includes('timeout')) {
      throw new Error(`Could not reach ${url}`);
    }

    let domain = url;
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // keep raw url as title
    }
    return {
      title: domain,
      description: '',
      image: '',
      bodyText: `Product page at ${domain}`,
      url,
      fallback: true,
    };
  }
}

module.exports = { scrapeProduct };
