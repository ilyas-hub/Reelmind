const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

function stripJsonFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

async function generateText(prompt) {
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

async function generateJson(prompt) {
  const text = await generateText(prompt);
  const cleaned = stripJsonFences(text);
  return JSON.parse(cleaned);
}

async function classifyIntent(message, history = []) {
  const historyText = history
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
    .join('\n');

  const prompt = `You are an intent classifier for a UGC video generator chatbot.
Classify the user's message into exactly one of: greeting | capability_question | product_request | other.

If product_request, also extract:
- productName (string)
- category (string)
- tone (one of: funny, relatable, aesthetic, dramatic)
- gifSearchTerm (string): a reaction GIF search term matching the tone, e.g. "confused math lady", "mind blown", "typing fast".

Respond ONLY with valid JSON, no markdown formatting, no backticks, no preamble. JSON schema:
{
  "intent": "greeting|capability_question|product_request|other",
  "reply?": "natural conversational reply (required for greeting/capability_question/other, optional for product_request)",
  "productName?": "string",
  "category?": "string",
  "tone?": "funny|relatable|aesthetic|dramatic",
  "gifSearchTerm?": "string"
}

${historyText ? `Conversation history:\n${historyText}\n` : ''}User message: ${message}`;

  return generateJson(prompt);
}

async function understandProduct(scraped) {
  const prompt = `You are a product marketer. Given scraped product info, infer structured fields for a UGC video.
Respond ONLY with valid JSON, no markdown formatting, no backticks, no preamble. JSON schema:
{
  "productName": "human-readable product name",
  "category": "short category",
  "tone": "funny|relatable|aesthetic|dramatic",
  "gifSearchTerm": "reaction gif search term matching tone"
}

Title: ${scraped.title}
Description: ${scraped.description}
Image: ${scraped.image}
Body: ${scraped.bodyText}
URL: ${scraped.url}`;

  return generateJson(prompt);
}

async function generateCaptionVariants({ productName, category, tone, count = 3 }) {
  const prompt = `You are a TikTok/UGC meme caption writer. Write ${count} punchy meme-style captions for ${productName} (${category || 'product'}), tone: ${tone || 'relatable'}.

Rules:
- ALL captions MUST start with "me when" or "POV:" or "when you're" — no generic "Check out" allowed.
- Reference the product name naturally.
- Max 2 lines each.
- Make each one distinct and punchy.

EXAMPLES (CORRECT):
- "me when i'm still logging calories manually instead of using calai.app"
- "POV: you open calai.app and it just tracks for you"

EXAMPLES (WRONG — NEVER USE):
- "Check out calai.app"
- "Download calai.app today"
- "Cal AI is the best"

Respond ONLY with valid JSON array of strings, no markdown, no backticks, no preamble.`

  const parsed = await generateJson(prompt);
  console.log('[CAPTION RAW]', parsed);
  const captions = Array.isArray(parsed) ? parsed : parsed.captions;
  return captions.filter((c) => typeof c === 'string' && c.trim().length > 0).slice(0, count);
}

async function pickFunniestCaption(captions) {
  if (!captions || captions.length === 0) return '';
  if (captions.length === 1) return captions[0];

  const list = captions.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const prompt = `You are a comedy judge for short-form UGC videos. Pick the FUNNIEST caption from the list below. Consider punchiness, meme potential, relatability, and how naturally it references the product.

${list}

Respond ONLY with valid JSON, no markdown, no backticks, no preamble. JSON schema:
{
  "winnerIndex": 0-based-number,
  "reason": "one sentence why"
}`;

  const result = await generateJson(prompt);
  console.log('[JUDGE RAW]', result);
  const index = typeof result.winnerIndex === 'number' ? result.winnerIndex : 0;
  return captions[index] || captions[0];
}

module.exports = { classifyIntent, understandProduct, generateCaptionVariants, pickFunniestCaption };
