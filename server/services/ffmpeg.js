const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

ffmpeg.setFfmpegPath(ffmpegPath);

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'videos').replace(/\\/g, '/');

const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Helvetica.ttc',
  'C:\\\\Windows\\\\Fonts\\\\arialbd.ttf',
  'C:\\\\Windows\\\\Fonts\\\\segoeui.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
];

function findFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (fileExists(candidate)) return candidate.replace(/\\/g, '/');
  }
  return null;
}

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

    const lines = splitCaption(caption.replace(/[\r\n]+/g, ' ').replace(/'/g, ''));
    const line1 = lines[0] || '';
    const line2 = lines[1] || '';
    const fontPath = findFont();
    const fontArg = fontPath ? `:fontfile=${fontPath}` : '';
    const textStyle = `fontcolor=white:fontsize=48:box=1:boxcolor=black@0.75:boxborderw=10:x=(w-text_w)/2`;

    const gifStart = 1;
    const gifEnd = Math.min(duration - 0.5, 5);

    const filterChain = [
      `[0:v]crop=ih*9/16:ih,scale=1080:1920:force_original_aspect_ratio=decrease,crop=1080:1920,setsar=1,setpts=PTS-STARTPTS[bg]`,
      `[1:v]format=yuva420p,scale=240:240:force_original_aspect_ratio=decrease,pad=240:240:(ow-iw)/2:(oh-ih)/2:color=black@0,fade=t=in:st=${gifStart}:d=0.4:alpha=1,fade=t=out:st=${gifEnd}:d=0.4:alpha=1[react]`,
      `[bg][react]overlay=W-w-60:H-h-240:enable='between(t,${gifStart},${gifEnd})'[v1]`,
    ];

    let lastLabel = 'v1';
    if (line1 && fontPath) {
      filterChain.push(`[${lastLabel}]drawtext=text='${line1}'${fontArg}:${textStyle}:y=(h*0.22)[v2]`);
      lastLabel = 'v2';
    }
    if (line2 && fontPath) {
      filterChain.push(`[${lastLabel}]drawtext=text='${line2}'${fontArg}:${textStyle}:y=(h*0.22+63)[v3]`);
      lastLabel = 'v3';
    }

    const finalFilterComplex = filterChain.join(';');

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
    [bgPath, gifPath, gifMp4Path, silentAudioPath].forEach((p) => {
      try { if (fileExists(p)) fs.unlinkSync(p); } catch {}
    });
  }
}

module.exports = { generateVideo };