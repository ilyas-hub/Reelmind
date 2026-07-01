# UGC Video Chat Generator

A ChatGPT-style chat app that generates 5–10s UGC marketing videos from product URLs.

## Setup

1. Fill API keys in `server/.env`:
   ```
   GEMINI_API_KEY=your_key
   PEXELS_API_KEY=your_key
   GIPHY_API_KEY=your_key
   PORT=3000
   ```

2. Install server deps (already installed):
   ```bash
   cd server
   npm install
   ```

3. Start the server:
   ```bash
   cd server
   npm run dev
   ```

4. Start the client:
   ```bash
   cd client
   npm run dev
   ```

5. Open `http://localhost:5173`.

## Features

- **Greeting / capability / other** → text replies.
- **Product URL** → scrapes the page, classifies intent with Gemini, fetches Pexels talking-head footage + Giphy reaction GIF, composites caption/audio/GIF bubble into a 9:16 video.

## Audio

Place short royalty-free MP3s in `server/assets/audio/` named by mood:
- `funny.mp3`
- `hype.mp3`
- `chill.mp3`
- `dramatic.mp3`
- `relatable.mp3`

If a mood file is missing, the pipeline falls back to silent audio so the video still renders.
