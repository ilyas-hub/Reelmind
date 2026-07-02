const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

ffmpeg.setFfmpegPath(ffmpegPath);

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'videos').replace(/\\/g, '/');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise(async (resolve, reject) => {
    const writer = fs.createWriteStream(dest);
    try {
      const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 30000 });
      response.data.pipe(writer);
      writer.on('finish', () => resolve());
      writer.on('error', reject);
      response.data.on('error', reject);
    } catch (err) {
      writer.destroy();
      reject(err);
    }
  });
}

async function ensureSilentAudio(duration, dest) {
  if (fileExists(dest)) return dest;
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('anullsrc=r=44100:cl=stereo')
      .inputFormat('lavfi')
      .audioCodec('aac')
      .outputOptions(['-t', String(duration), '-ar', '44100', '-ac', '2'])
      .output(dest)
      .on('end', () => resolve(dest))
      .on('error', reject)
      .run();
  });
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function generateAss(text, duration, outW = 720, outH = 1280) {
  const escaped = text.replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
  const marginV = Math.round(outH * 0.22);
  const fontSize = Math.round(48 * (outW / 1080));
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${outW}
PlayResY: ${outH}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&HBB000000,0,0,0,0,100,100,0,0,3,0,0,8,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${formatTime(duration)},Default,,0,0,0,,${escaped}
`;
}

function splitCaption(caption, maxLength = 38) {
  const words = caption.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxLength && current.length > 0) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, 2);
}

function logMemory(label) {
  const mem = process.memoryUsage();
  console.log(`[MEMORY ${label}] rss=${Math.round(mem.rss / 1024 / 1024)}M heap=${Math.round(mem.heapUsed / 1024 / 1024)}M/${Math.round(mem.heapTotal / 1024 / 1024)}M ext=${Math.round(mem.external / 1024 / 1024)}M`);
}

const OUT_W = 720;
const OUT_H = 1280;

async function generateVideo({ backgroundUrl, gifUrl, audioPath, caption, duration = 6 }) {
  ensureDir(OUTPUT_DIR);
  logMemory('start');
  const id = uuidv4();
  const bgPath = `${OUTPUT_DIR}/${id}_bg.mp4`;
  const gifPath = `${OUTPUT_DIR}/${id}_gif.mp4`;
  const gifMp4Path = `${OUTPUT_DIR}/${id}_gif_converted.mp4`;
  const intermediatePath = `${OUTPUT_DIR}/${id}_intermediate.mp4`;
  const outputPath = `${OUTPUT_DIR}/${id}.mp4`;
  const silentAudioPath = `${OUTPUT_DIR}/${id}_silent.aac`;
  const assFilename = `${id}.ass`;
  const assCwdPath = path.resolve(process.cwd(), assFilename);

  try {
    await Promise.all([downloadFile(backgroundUrl, bgPath), downloadFile(gifUrl, gifPath)]);
    logMemory('downloads');

    // Convert GIF to looping MP4 with transparency preserved where possible
    await new Promise((resolve, reject) => {
      ffmpeg(gifPath)
        .outputOptions([
          '-movflags', 'faststart',
          '-pix_fmt', 'yuva420p',
          '-vf', `scale=160:160:force_original_aspect_ratio=decrease,pad=160:160:(ow-iw)/2:(oh-ih)/2:black@0`,
          '-loop', '0',
        ])
        .output(gifMp4Path)
        .on('start', (c) => console.log('[FFMPEG GIF]', c))
        .on('end', () => { logMemory('gif_convert'); resolve(); })
        .on('error', reject)
        .run();
    });

    const lines = splitCaption(caption.replace(/[\r\n]+/g, ' '));
    const text = lines.join('\n');

    if (text) {
      fs.writeFileSync(assCwdPath, generateAss(text, duration, OUT_W, OUT_H));
    }

    const gifStart = 1;
    const gifEnd = Math.min(duration - 0.5, 5);

    // Pass 1: Overlay GIF on background (no text, simpler filter chain)
    const pass1Filter = [
      `[0:v]crop=ih*9/16:ih,scale=${OUT_W}:${OUT_H},crop=${OUT_W}:${OUT_H},setsar=1,setpts=PTS-STARTPTS[bg]`,
      `[1:v]format=yuva420p,scale=160:160,pad=160:160:(ow-iw)/2:(oh-ih)/2:color=black@0,fade=t=in:st=${gifStart}:d=0.4:alpha=1,fade=t=out:st=${gifEnd}:d=0.4:alpha=1[react]`,
      `[bg][react]overlay=W-w-40:H-h-160:enable='between(t,${gifStart},${gifEnd})'[v1]`,
    ].join(';');

    console.log('\n=== PASS 1 FILTER ===\n' + pass1Filter);
    logMemory('before_pass1');

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(bgPath)
        .input(gifMp4Path)
        .complexFilter([pass1Filter])
        .videoCodec('libx264')
        .outputOptions([
          '-t', String(duration),
          '-pix_fmt', 'yuv420p',
          '-preset', 'ultrafast',
          '-movflags', '+faststart',
          '-map', '[v1]',
        ])
        .output(intermediatePath)
        .on('start', (c) => console.log('[FFMPEG PASS1]', c))
        .on('end', () => { logMemory('pass1_complete'); resolve(); })
        .on('error', reject)
        .run();
    });

    // Pass 2: Add text overlay via ASS subtitles + audio merge
    const finalAudioPath = fileExists(audioPath) ? audioPath.replace(/\\/g, '/') : await ensureSilentAudio(duration, silentAudioPath);
    logMemory('before_pass2');

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg(intermediatePath)
        .input(finalAudioPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-t', String(duration),
          '-pix_fmt', 'yuv420p',
          '-preset', 'ultrafast',
          '-movflags', '+faststart',
          '-shortest',
          '-af', `volume=1.5,afade=t=out:st=${duration - 1}:d=1`,
        ]);

      if (text) {
        cmd.videoFilter(`ass=${assFilename}`);
      }

      cmd
        .output(outputPath)
        .on('start', (c) => console.log('[FFMPEG PASS2]', c))
        .on('end', () => { logMemory('pass2_complete'); resolve(); })
        .on('error', reject)
        .run();
    });

    logMemory('done');
    return `${id}.mp4`;
  } finally {
    [bgPath, gifPath, gifMp4Path, intermediatePath, assCwdPath, silentAudioPath].forEach((p) => {
      try { if (fileExists(p)) fs.unlinkSync(p); } catch {}
    });
  }
}

module.exports = { generateVideo };