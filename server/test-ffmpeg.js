#!/usr/bin/env node

/**
 * Test script to verify the exact filter_complex string from ffmpeg.js
 * against local test files, completely independent of the chat app.
 *
 * Run: node server/test-ffmpeg.js
 * Prerequisites: ffmpeg-static must be installed (npm install in server/)
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Set ffmpeg path just like the real ffmpeg.js does
ffmpeg.setFfmpegPath(ffmpegPath);

const OUTPUT_DIR = path.join(__dirname, 'public', 'videos');
const TEST_DIR = __dirname;

const bgTestFile = path.join(OUTPUT_DIR, '_test_bg.mp4');
const gifTestFile = path.join(OUTPUT_DIR, '_test_gif_converted.mp4');
const testOutput = path.join(OUTPUT_DIR, '_test_filter_output.mp4');

// Check if test files exist
if (!fs.existsSync(bgTestFile)) {
  console.error('ERROR: Test background file not found:', bgTestFile);
  console.error('Create a test file first:');
  console.error('  cd server/public/videos && ffmpeg -f lavfi -i color=c=blue:size=1080x1920:d=6 -c:v libx264 _test_bg.mp4');
  process.exit(1);
}
if (!fs.existsSync(gifTestFile)) {
  console.error('ERROR: Test GIF file not found:', gifTestFile);
  console.error('Create a test file first:');
  console.error('  cd server/public/videos && ffmpeg -f lavfi -i color=c=red:size=240x240:d=6 -c:v libx264 _test_gif_converted.mp4');
  process.exit(1);
}

// This is THE EXACT same filter_complex string that ffmpeg.js builds
// Copied from the actual ffmpeg.js code at the time of the bug report
const finalFilterComplex = [
  `[0:v]crop=ih*9/16:ih,scale=1080:1920:force_original_aspect_ratio=decrease,crop=1080:1920,setsar=1,setpts=PTS-STARTPTS[bg]`,
  `[1:v]format=yuva420p,scale=240:240:force_original_aspect_ratio=decrease,pad=240:240:(ow-iw)/2:(oh-ih)/2:color=black@0,fade=t=in:st=1:d=0.4:alpha=1,fade=t=out:st=5:d=0.4:alpha=1[react]`,
  `[bg][react]overlay=W-w-60:H-h-240:enable='between(t,1,5)'[v1]`,
].join(';');

const options = [
  '-t', '6',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-map', '[v1]',
  '-map', '2:a?',
  '-shortest',
  '-af', 'volume=1.5,afade=t=out:st=5:d=1',
];

const audioPath = path.join(__dirname, 'assets', 'audio', 'chill.mp3');

// Build the command exactly like ffmpeg.js does
const cmd = ffmpeg()
  .input(bgTestFile)
  .input(gifTestFile)
  .input(audioPath)
  .complexFilter([finalFilterComplex])
  .audioCodec('aac')
  .videoCodec('libx264')
  .outputOptions(options)
  .output(testOutput)
  .on('start', (fullCmd) => {
    console.log('\n========== ACTUAL FFMPEG COMMAND ==========');
    console.log(fullCmd);
    console.log('============================================\n');
  })
  .on('error', (err, stdout, stderr) => {
    console.error('\n========== FFMPEG ERROR ==========');
    console.error('Error:', err.message);
    console.error('stdout:', stdout);
    console.error('stderr:', stderr);
    console.error('====================================\n');
  })
  .on('end', () => {
    console.log('\n========== FFMPEG SUCCESS ==========');
    console.log('Output created at:', testOutput);
    console.log('=====================================\n');
  });

console.log('\nRunning test with filter_complex:');
console.log(finalFilterComplex);
console.log('\nInput files:');
console.log('  1:', bgTestFile);
console.log('  2:', gifTestFile);
console.log('  3:', audioPath);
console.log('\n');

// Run it
cmd.run();