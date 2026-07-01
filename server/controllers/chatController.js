const { classifyIntent, generateCaptionVariants, pickFunniestCaption } = require('../services/gemini');
const { scrapeProduct } = require('../services/scraper');
const { understandProduct } = require('../services/understander');
const { fetchTalkingHeadVideo } = require('../services/pexels');
const { fetchReactionGif } = require('../services/giphy');
const { getAudioPath } = require('../services/audio');
const { generateVideo } = require('../services/ffmpeg');

const conversations = new Map();

// --- LOCAL PRE-CLASSIFICATION PATTERNS ---

const GREETING_PATTERNS = /^(hi|hello|hey|yo|sup|good morning|good evening|hey there|howdy|what's up|whats up)\b/i;
const CAPABILITY_PATTERNS = /(what can you do|who are you|help|what is this|how do you work|what do you do|show me|tell me about)/i;

const GREETING_POOL = [
  'Hey there! Got a product URL for me to whip up a quick video?',
  'Hi! What can I help you with today?',
  'Hello! Send me a product link and I’ll generate a UGC video for you.',
  'Hey! How can I assist you today?',
];

let greetingIndex = 0;
function nextGreeting() {
  const reply = GREETING_POOL[greetingIndex % GREETING_POOL.length];
  greetingIndex++;
  return reply;
}

const CAPABILITY_REPLY = 'I can generate UGC videos for you! Just send me a product URL and I\'ll create an engaging short-form marketing video.';

const DOMAIN_PATTERN = /\b(?:https?:\/\/|www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?\b/i;

function localClassify(message) {
  const normalized = message.trim().toLowerCase();
  
  // Greeting
  if (GREETING_PATTERNS.test(normalized)) {
    return { type: 'greeting', reply: nextGreeting() };
  }
  
  // Capability question
  if (CAPABILITY_PATTERNS.test(normalized)) {
    return { type: 'capability' };
  }
  
  // Domain-like URL present in message
  if (DOMAIN_PATTERN.test(message)) {
    const match = message.match(DOMAIN_PATTERN);
    return { type: 'product_request', url: match[0] };
  }
  
  return null;
}

// --- MAIN HANLDER ---

function getConversation(sessionId) {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, []);
  }
  return conversations.get(sessionId);
}

function sendStreamMessage(res, message) {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/x-ndjson');
  }
  res.write(JSON.stringify({ messages: [message] }) + '\n');
}

function replyJson(res, conversation, payload, streaming) {
  conversation.push(payload);
  if (streaming) {
    sendStreamMessage(res, payload);
    return res.end();
  }
  return res.json({ messages: [payload] });
}

async function handleChat(req, res) {
  const { message, sessionId = 'default' } = req.body;
  const conversation = getConversation(sessionId);
  let streaming = false;

  // Try local pre-classification first
  const localResult = localClassify(message);

  if (localResult && localResult.type === 'greeting') {
    conversation.push({ role: 'user', content: message });
    return replyJson(res, conversation, {
      role: 'assistant',
      content: localResult.reply,
    }, streaming);
  }

  if (localResult && localResult.type === 'capability') {
    conversation.push({ role: 'user', content: message });
    return replyJson(res, conversation, {
      role: 'assistant',
      content: CAPABILITY_REPLY,
    }, streaming);
  }

  // If message contains a domain-like URL, skip Gemini and go straight to product request
  if (localResult && localResult.type === 'product_request') {
    const productUrl = localResult.url.startsWith('http') ? localResult.url : 'https://' + localResult.url;
    streaming = true;
    // Continue to product pipeline...
    return await handleProductRequest(res, req, conversation, productUrl, message, streaming);
  }

  // Fall through to Gemini intent classification
  conversation.push({ role: 'user', content: message });
  try {
    console.log('[INTENT] calling classifyIntent for:', message);
    const intentResult = await classifyIntent(message, conversation);
    console.log('[INTENT] result:', { message, intent: intentResult && intentResult.intent, raw: JSON.stringify(intentResult) });

    if (intentResult.intent === 'greeting' || intentResult.intent === 'other') {
      return replyJson(res, conversation, {
        role: 'assistant',
        content: intentResult.reply || 'Hey there! Send me a product URL and I\'ll make you a UGC video.',
      }, streaming);
    }

    if (intentResult.intent === 'capability_question') {
      return replyJson(res, conversation, {
        role: 'assistant',
        content: CAPABILITY_REPLY,
      }, streaming);
    }

    if (intentResult.intent !== 'product_request') {
      return replyJson(res, conversation, {
        role: 'assistant',
        content: 'I\'m not sure how to help with that. Try sending me a product URL!',
      }, streaming);
    }

    // Product request — continue to pipeline
    const urlMatch = message.match(/https?:\/\/[^\s]+|(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(?:\/[^\s]*)?/i);
    const productUrl = urlMatch ? urlMatch[0].trim() : null;
    if (!productUrl) {
      return replyJson(res, conversation, {
        role: 'assistant',
        content: 'I can generate a UGC video, but I need a product URL. Please paste one!',
      }, streaming);
    }
    streaming = true;
    return await handleProductRequest(res, req, conversation, productUrl, message, streaming);
  } catch (err) {
    console.log('[LLM ERROR]', err.message || err);
    return res.json({ messages: [{ role: 'assistant', content: 'I\'m having trouble understanding that right now. Could you rephrase?' }] });
  }
}

async function handleProductRequest(res, req, conversation, productUrl, message, streaming) {
  sendStreamMessage(res, { role: 'assistant', content: '', loadingStage: 'reading product page' });

  // 1. Try to scrape the product page
  let scraped;
  let scrapeFailed = false;
  try {
    scraped = await scrapeProduct(productUrl);
    console.log('[SCRAPE] status:', scraped.fallback ? 'FALLBACK' : 'OK', 'title:', (scraped.title || '').substring(0, 60), 'body length:', (scraped.bodyText || '').length);
    if (scraped.fallback) {
      // URL resolved but had no real content (blocking/JS/no metadata)
      console.log('[SCRAPE] fallback — site blocking or empty static HTML');
      scrapeFailed = true;
    }
  } catch (err) {
    console.error('[SCRAPE ERROR]', err.message || err);
    scrapeFailed = true;
  }

  // 2. Build a product descriptor — either from scraped data or from the URL itself
  let product;
  if (scrapeFailed) {
    // Use only the domain name as product identity — skip product understanding
    const domain = productUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    product = {
      productName: domain.replace(/\.\w+$/, ''),
      category: domain,
      tone: 'chill',
      gifSearchTerm: domain + ' meme'
    };
    console.log('[PRODUCT] using fallback from URL:', domain, '→', product.productName);
  } else {
    try {
      const understood = await understandProduct(scraped);
      product = understood;
      console.log('[PRODUCT] understood from scraped content:', product.productName, product.tone);
    } catch (err) {
      console.error('[UNDERSTAND ERROR]', err.message || err);
      const fallbackDomain = productUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      product = {
        productName: fallbackDomain.replace(/\.\w+$/, '') || 'Unknown product',
        category: fallbackDomain,
        tone: 'chill',
        gifSearchTerm: 'reaction'
      };
    }
  }

  sendStreamMessage(res, { role: 'assistant', content: '', loadingStage: 'picking footage' });

  let captionVariants;
  try {
    captionVariants = await generateCaptionVariants({
      productName: product.productName,
      category: product.category,
      tone: product.tone,
      count: 3,
    });
  } catch (err) {
    console.error('[CAPTION VARIANTS ERROR]', err.message || err);
    captionVariants = [];
  }

  try {
    product.caption = await pickFunniestCaption(captionVariants);
  } catch (err) {
    console.error('[CAPTION JUDGE ERROR]', err.message || err);
    product.caption = captionVariants[0] || `me when i'm still doing this manually instead of using ${product.productName}`;
  }

  let bgVideo;
  let gifUrl;
  try {
    [bgVideo, gifUrl] = await Promise.all([
      fetchTalkingHeadVideo(),
      fetchReactionGif(product.gifSearchTerm || 'reaction'),
    ]);
  } catch (err) {
    console.error('[ASSET FETCH ERROR]', err.message || err);
    sendStreamMessage(res, { role: 'assistant', content: 'I had trouble finding the right footage or reaction GIF. Want to try again?' });
    return res.end();
  }

  sendStreamMessage(res, { role: 'assistant', content: '', loadingStage: 'assembling video' });

  let videoFilename;
  try {
    const audioPath = getAudioPath(product.tone || 'chill');
    videoFilename = await generateVideo({
      backgroundUrl: bgVideo.url,
      gifUrl,
      audioPath,
      caption: product.caption || `me when i'm still doing this manually instead of using ${product.productName}`,
      duration: 6,
    });
  } catch (err) {
    console.error('[VIDEO GENERATION ERROR]', err.message || err);
    sendStreamMessage(res, { role: 'assistant', content: 'Oops, something went wrong while assembling your video. Want to try another URL?' });
    return res.end();
  }

  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const videoUrl = `${req.protocol}://${host}/videos/${videoFilename}`;
  const finalMessage = {
    role: 'assistant',
    content: `Here\'s your UGC video for **${product.productName}**!`,
    videoUrl,
  };
  conversation.push(finalMessage);
  sendStreamMessage(res, finalMessage);
  return res.end();
}

module.exports = { handleChat };