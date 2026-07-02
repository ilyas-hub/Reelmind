const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&HBB000000,0,0,0,0,100,100,0,0,3,0,0,8,10,10,422,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:06.00,Default,,0,0,0,,hello world
`;
fs.writeFileSync(path.resolve(process.cwd(), '_test_cmplx.ass'), assContent);

const outputDir = path.join(__dirname, 'public', 'videos').replace(/\\/g, '/');
const bgFile = path.join(outputDir, '_test_bg.mp4').replace(/\\/g, '/');
const outFile = path.join(outputDir, '_test_cmplx_out.mp4').replace(/\\/g, '/');

const filter = `[0:v]crop=ih*9/16:ih,scale=1080:1920,crop=1080:1920,setsar=1,setpts=PTS-STARTPTS[v0];[v0]ass=_test_cmplx.ass[vout]`;
console.log('FILTER:', filter);

new Promise((resolve, reject) => {
  ffmpeg()
    .input(bgFile)
    .complexFilter([filter])
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(['-t', '6', '-pix_fmt', 'yuv420p', '-map', '[vout]', '-shortest'])
    .output(outFile)
    .on('start', (c) => console.log('FFMPEG:', c))
    .on('end', () => { console.log('OK'); resolve(); })
    .on('error', (e) => { console.log('FAIL:', e.message); reject(e); })
    .run();
}).then(() => {
  fs.unlinkSync(path.resolve(process.cwd(), '_test_cmplx.ass'));
  fs.unlinkSync(outFile);
  console.log('cleaned');
}).catch(() => {
  fs.unlinkSync(path.resolve(process.cwd(), '_test_cmplx.ass'));
});
