const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const OUTPUT_DIR = path.join(__dirname, 'public', 'videos').replace(/\\/g, '/');
const bgFile = path.join(OUTPUT_DIR, '_test_bg.mp4');
const gifConverted = path.join(OUTPUT_DIR, '_test_gif_converted.mp4');
const intPath = path.join(OUTPUT_DIR, '_test_int.mp4');
const testOutput = path.join(OUTPUT_DIR, '_test_out.mp4');
const testSub = path.join(OUTPUT_DIR, '_test_sub.ass');

async function main() {
  if (!fs.existsSync(bgFile)) {
    await new Promise((r,j) => ffmpeg().input('color=c=blue:size=1080x1920:d=6').inputFormat('lavfi').videoCodec('libx264').outputOptions(['-pix_fmt','yuv420p','-t','6']).output(bgFile).on('end',r).on('error',j).run());
  }
  if (!fs.existsSync(gifConverted)) {
    await new Promise((r,j) => ffmpeg().input('color=c=red:size=240x240:d=6').inputFormat('lavfi').outputOptions(['-pix_fmt','yuva420p','-vf','scale=240:240,pad=240:240:(ow-iw)/2:(oh-ih)/2:black@0','-loop','0']).output(gifConverted).on('end',r).on('error',j).run());
  }

  const duration=6,gifStart=1,gifEnd=5;

  // PASS 1
  console.log('=== PASS 1 ===');
  const p1 = [`[0:v]crop=ih*9/16:ih,scale=1080:1920,crop=1080:1920,setsar=1,setpts=PTS-STARTPTS[bg]`,`[1:v]format=yuva420p,scale=240:240,pad=240:240:(ow-iw)/2:(oh-ih)/2:color=black@0,fade=t=in:st=${gifStart}:d=0.4:alpha=1,fade=t=out:st=${gifEnd}:d=0.4:alpha=1[react]`,`[bg][react]overlay=W-w-60:H-h-240:enable='between(t,${gifStart},${gifEnd})'[v1]`].join(';');
  await new Promise((r,j) => ffmpeg().input(bgFile).input(gifConverted).complexFilter([p1]).videoCodec('libx264').outputOptions(['-t','6','-pix_fmt','yuv420p','-movflags','+faststart','-map','[v1]','-shortest']).output(intPath).on('end',()=>{console.log('PASS1 OK');r()}).on('error',j).run());

  // ASS subtitle
  const text='me when I try to manually log my\\Nentire days snacks vs. letting Cal AI';
  fs.writeFileSync(testSub, `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&HBB000000,0,0,0,0,100,100,0,0,3,0,0,8,10,10,422,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,00:00:06.00,Default,,0,0,0,,${text}\n`);
  console.log('ASS created:', testSub);

  // PASS 2
  console.log('\n=== PASS 2 ===');
  const silent = path.join(OUTPUT_DIR, '_test_silent.aac');
  if (!fs.existsSync(silent)) {
    await new Promise((r,j) => ffmpeg().input('anullsrc=r=44100:cl=stereo').inputFormat('lavfi').audioCodec('aac').outputOptions(['-t','6','-ar','44100','-ac','2']).output(silent).on('end',r).on('error',j).run());
  }

  await new Promise((r,j) => {
    const cmd = ffmpeg(intPath).input(silent).videoCodec('libx264').audioCodec('aac').outputOptions(['-t','6','-pix_fmt','yuv420p','-movflags','+faststart','-shortest','-af','volume=1.5,afade=t=out:st=5:d=1']);
    cmd.videoFilter(`ass='${testSub}'`);
    cmd.output(testOutput).on('start',c=>console.log('CMD:',c)).on('end',()=>{console.log('PASS2 OK');r()}).on('error',j).run();
  });

  console.log('SUCCESS');
  [intPath,silent,testSub,testOutput].forEach(p=>{try{fs.unlinkSync(p)}catch{}});
}

main();
