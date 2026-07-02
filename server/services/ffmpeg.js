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

function generateAss(text, duration) {
  const escaped = text.replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
  const marginV = Math.round(1920 * 0.22);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&HBB000000,0,0,0,0,100,100,0,0,3,0,0,8,10,10,${marginV},1

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

async function generateVideo({ backgroundUrl, gifUrl, audioPath, caption, duration = 6 }) {
  ensureDir(OUTPUT_DIR);
  const id = uuidv4();
  const bgPath = `${OUTPUT_DIR}/${id}_bg.mp4`;
  const gifPath = `${OUTPUT_DIR}/${id}_gif.mp4`;
  const gifMp4Path = `${OUTPUT_DIR}/${id}_gif_converted.mp4`;
  const outputPath = `${OUTPUT_DIR}/${id}.mp4`;
  const silentAudioPath = `${OUTPUT_DIR}/${id}_silent.aac`;
  const assFilename = `${id}.ass`;
  const assCwdPath = path.resolve(process.cwd(), assFilename);

  try {
    await Promise.all([downloadFile(backgroundUrl, bgPath), downloadFile(gifUrl, gifPath)]);

    // Convert GIF to looping MP4 with transparency preserved where possible
    await new Promise((resolve, reject) => {
      ffmpeg(gifPath)
        .outputOptions([
          '-movflags', 'faststart',
          '-pix_fmt', 'yuva420p',
          '-vf', 'scale=240:240:force_original_aspect_ratio=decrease,pad=240:240:(ow-iw)/2:(oh-ih)/2:black@0',
          '-loop', '0',
        ])
        .output(gifMp4Path)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const lines = splitCaption(caption.replace(/[\r\n]+/g, ' '));
    const text = lines.join('\n');

    if (text) {
      fs.writeFileSync(assCwdPath, generateAss(text, duration));
    }

    const gifStart = 1;
    const gifEnd = Math.min(duration - 0.5, 5);

    // Build single filter chain with subtitles instead of drawtext
    const filterChain = [
      `[0:v]crop=ih*9/16:ih,scale=1080:1920,crop=1080:1920,setsar=1,setpts=PTS-STARTPTS[bg]`,
      `[1:v]format=yuva420p,scale=240:240,pad=240:240:(ow-iw)/2:(oh-ih)/2:color=black@0,fade=t=in:st=${gifStart}:d=0.4:alpha=1,fade=t=out:st=${gifEnd}:d=0.4:alpha=1[react]`,
      `[bg][react]overlay=W-w-60:H-h-240:enable='between(t,${gifStart},${gifEnd})'[v1]`,
    ];

    if (text) {
      filterChain.push(`[v1]ass=${assFilename}[vout]`);
    }

    const finalFilterComplex = filterChain.join(';');
    const lastLabel = text ? 'vout' : 'v1';

    console.log('\n=== FILTER COMPLEX ===\n' + JSON.stringify(finalFilterComplex));
    const finalAudioPath = fileExists(audioPath) ? audioPath.replace(/\\/g, '/') : await ensureSilentAudio(duration, silentAudioPath);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(bgPath)
        .input(gifMp4Path)
        .input(finalAudioPath)
        .complexFilter([finalFilterComplex])
        .audioCodec('aac')
        .videoCodec('libx264')
        .outputOptions([
          '-t', String(duration),
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-map', `[${lastLabel}]`,
          '-map', '2:a?',
          '-shortest',
          '-af', `volume=1.5,afade=t=out:st=${duration - 1}:d=1`,
        ])
        .output(outputPath)
        .on('start', (fullCmd) => console.log('[FFMPEG] COMMAND:', fullCmd))
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    return `${id}.mp4`;
  } finally {
    [bgPath, gifPath, gifMp4Path, assCwdPath, silentAudioPath].forEach((p) => {
      try { if (fileExists(p)) fs.unlinkSync(p); } catch {}
    });
  }
}

module.exports = { generateVideo };