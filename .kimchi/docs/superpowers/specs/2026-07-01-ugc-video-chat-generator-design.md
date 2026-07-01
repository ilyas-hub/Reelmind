# UGC Video Chat Generator — Design Spec

## Goal
Build a ChatGPT-style single-page web app where users send messages and the assistant either replies conversationally (greetings, capability questions, other) or, when a product URL is detected, scrapes the page, understands the product, and assembles a 5–10s UGC-style marketing video returned inline.

## Architecture
- **Client** (`/client`): React (Vite) + Tailwind CSS v4. Full-height dark chat UI, message bubbles, inline `<video>` player sized 9:16, auto-scroll.
- **Server** (`/server`): Node.js + Express. Single chat endpoint orchestrates: intent classification → product scraping → LLM understanding → asset fetching (Pexels talking-head footage, Giphy reaction GIF, local audio clip) → ffmpeg compositing → serves public video URL.
- **State**: In-memory conversation array on server (per-session simple storage). MongoDB optional and not required.
- **External APIs**: Google Gemini (intent + structured product fields), Pexels (background talking-head video), Giphy (reaction GIF).

## Intent Detection (Google Gemini 2.0 Flash)
One LLM call per message classifies into:
- `greeting` — reply naturally, no video.
- `capability_question` — fixed reply about generating UGC videos from product URLs.
- `product_request` — message contains a product URL.
- `other` — reply conversationally.

For `product_request`, also extract:
- `productName`
- `category`
- `tone`: `funny` | `relatable` | `aesthetic` | `dramatic`
- `caption`: meme-style, 2 lines max, using "POV / me when / me acting like" templates referencing the product name naturally.
- `gifSearchTerm`: reaction term matching tone, e.g. "confused math lady", "mind blown", "typing fast".

## Product Understanding
Server fetches URL with `axios` + `cheerio`. Extracts:
- page title
- meta description
- OG image
- first ~2000 chars of body text

These fields are passed to the LLM to infer the structured fields above. If scraping fails, falls back to domain name + LLM inference.

## Video Assembly (5–10s, 9:16 vertical)
4 layers composited with `fluent-ffmpeg` into `/server/public/videos/<uuid>.mp4`:

1. **Background**: Talking-head / UGC creator video from Pexels. Search terms like "person talking casual indoor", "man reacting camera", "woman explaining phone". Trimmed to 6–8s, vertically cropped to 9:16.
2. **Text overlay**: Meme caption burned at top third, bold white sans-serif, centered, subtle fade-in.
3. **Audio**: One clip from `/server/assets/audio` selected by tone (funny, hype, chill, dramatic, relatable). Trimmed/looped to match video length, faded out.
4. **GIF**: Reaction GIF from Giphy converted to looping MP4 via ffmpeg, composited as a small circle (~120px) at bottom-right or center-right, circular mask, visible for middle 2–4s.

Output served as static file from `/server/public/videos`.

## Chat Behavior
- Conversation state stored in-memory as array of `{ role, content, videoUrl? }`.
- Loading states during pipeline: "reading product page" → "picking footage" → "assembling video".
- Errors return conversational messages, never stack traces.

## UI
- Full-height dark chat layout using Tailwind CSS.
- Message bubbles for user and assistant.
- Video messages render inline `<video controls>` at 9:16 aspect ratio like a phone reel.
- Auto-scroll to newest message.

## API Keys
Stored in `/server/.env`:
```
GEMINI_API_KEY=
PEXELS_API_KEY=
GIPHY_API_KEY=
```

## File Layout
```
server/
  index.js                 # Express entry, middleware, routes
  .env                     # API keys
  public/videos/           # generated MP4s
  assets/audio/            # royalty-free clips by mood
  routes/
    chat.js                # POST /api/chat
  services/
    gemini.js              # LLM calls
    scraper.js             # axios + cheerio
    pexels.js              # fetch talking-head video
    giphy.js               # fetch reaction GIF
    ffmpeg.js              # video compositing
  controllers/
    chatController.js      # orchestration + state

client/src/
  App.tsx                  # chat layout + state
  components/
    ChatMessage.tsx        # individual bubble + video player
    ChatInput.tsx          # message input + send
    LoadingBubble.tsx      # animated loading states
  types/
    chat.ts                # TypeScript message types
```

## Success Criteria
1. User can type "hi" and get a natural text reply.
2. User can type "What can you do?" and get the capability reply.
3. User can paste a product URL and after 10–30s see a generated UGC video inline.
4. Generated video has talking-head background, top caption, audio, and small circular reaction bubble.
5. Errors are surfaced as friendly chat messages.
6. UI is dark, full-height, with 9:16 video bubbles and auto-scroll.
