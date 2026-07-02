const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
ffmpeg.setFfmpegPath(ffmpegPath);

const OUTPUT_DIR = path.join(__dirname, 'public', 'videos').replace(/\\/g, '/');
const bgFile = path.join(OUTPUT_DIR, '_test_bg.mp4');
const testSub = path.join(OUTPUT_DIR, '_test_sub.ass');
const testOutput = path.join(OUTPUT_DIR, '_test_ass_out.mp4');

async function main() {
  if (!fs.existsSync(bgFile)) {
    await new Promise((r,j) => ffmpeg().input('color=c=blue:size=1080x1920:d=6').inputFormat('lavfi').videoCodec('libx264').outputOptions(['-pix_fmt','yuv420p','-t','6']).output(bgFile).on('end',r).on('error',j).run());
  }

  const text = 'hello world\\Ntest caption';
  fs.writeFileSync(testSub, `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&HBB000000,0,0,0,0,100,100,0,0,3,0,0,8,10,10,422,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,00:00:06.00,Default,,0,0,0,,${text}\n`);

  const fwdPath = testSub.replace(/\\/g, '/');
  console.log('Forward-slash path:', fwdPath);

  // Test 1: ass with single-quoted forward-slash path
  console.log('\n=== Test 1: ass with single-quoted forward-slash path ===');
  if (fs.existsSync(testOutput)) fs.unlinkSync(testOutput);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(bgFile)
        .videoCodec('libx264')
        .videoFilter(`ass='${fwdPath}'`)
        .outputOptions(['-t','6','-pix_fmt','yuv420p','-movflags','+faststart'])
        .output(testOutput)
        .on('start', cmd => console.log('CMD:', cmd))
        .on('end', () => { console.log('TEST 1 OK'); resolve(); })
        .on('error', e => { console.log('TEST 1 FAIL:', e.message); resolve(); })
        .run();
    });
  } catch(e) { console.log(e.message); }

  // Test 2: ass with escaped-colon forward-slash path (no quotes)
  console.log('\n=== Test 2: ass with escaped colon forward-slash path (no quotes) ===');
  if (fs.existsSync(testOutput)) fs.unlinkSync(testOutput);
  try {
    const escPath = fwdPath.replace(/:/g, '\\:');
    console.log('Escaped path:', escPath);
    await new Promise((resolve, reject) => {
      ffmpeg(bgFile)
        .videoCodec('libx264')
        .videoFilter(`ass=${escPath}`)
        .outputOptions(['-t','6','-pix_fmt','yuv420p','-movflags','+faststart'])
        .output(testOutput)
        .on('start', cmd => console.log('CMD:', cmd))
        .on('end', () => { console.log('TEST 2 OK'); resolve(); })
        .on('error', e => { console.log('TEST 2 FAIL:', e.message); resolve(); })
        .run();
    });
  } catch(e) { console.log(e.message); }

  // Test 3: drawtext with escaped text (our original working approach)
  console.log('\n=== Test 3: drawtext with inline text ===');
  if (fs.existsSync(testOutput)) fs.unlinkSync(testOutput);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(bgFile)
        .videoCodec('libx264')
        .videoFilter(`drawtext=text='hello world':fontfile=C:/Windows/Fonts/arialbd.ttf:fontcolor=white:fontsize=48:box=1:boxcolor=black@0.75:x=(w-text_w)/2:y=(h*0.22)`)
        .outputOptions(['-t','6','-pix_fmt','yuv420p','-movflags','+faststart'])
        .output(testOutput)
        .on('start', cmd => console.log('CMD:', cmd))
        .on('end', () => { console.log('TEST 3 OK'); resolve(); })
        .on('error', e => { console.log('TEST 3 FAIL:', e.message); resolve(); })
        .run();
    });
  } catch(e) { console.log(e.message); }

  // Cleanup
  if (fs.existsSync(testSub)) fs.unlinkSync(testSub);
  if (fs.existsSync(testOutput)) fs.unlinkSync(testOutput);
}

main();
