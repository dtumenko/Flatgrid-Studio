/* =============================================================
   WebM → MP4

   Playwright records VP8 in a WebM container, which is fine on the
   web and awkward everywhere else — Premiere, Keynote, Behance and
   Instagram all want H.264. Playwright ships its own ffmpeg for the
   screencast, so the encoder is already on disk; this just points
   at it rather than asking for a separate install.

   node to-mp4.js  →  out/flatgrid-walkthrough.mp4
   ============================================================= */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'out');

/* Playwright's own ffmpeg is built --disable-everything with only VP8 and
   the WebM muxer turned on — it records, it cannot transcode. ffmpeg-static
   ships a full build, which is what H.264 in MP4 needs. */
const ffmpeg = require('ffmpeg-static');
if (!ffmpeg || !fs.existsSync(ffmpeg)) {
  console.error('no ffmpeg binary; run: npm i ffmpeg-static');
  process.exit(1);
}

const webm = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm')).sort().pop();
if (!webm) { console.error('nothing recorded yet'); process.exit(1); }

const src = path.join(OUT, webm);
const dst = path.join(OUT, 'flatgrid-walkthrough.mp4');

execFileSync(ffmpeg, [
  '-y',
  '-i', src,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '19',              // visually lossless for flat colour and fine grain
  '-pix_fmt', 'yuv420p',     // the only chroma format every player agrees on
  '-movflags', '+faststart', // metadata first, so it streams rather than buffers
  '-r', '30',
  '-vf', 'scale=1920:1080:flags=lanczos',
  '-an',
  dst,
], { stdio: ['ignore', 'ignore', 'pipe'] });

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log('source :', webm, mb(src), 'MB');
console.log('output :', dst, mb(dst), 'MB');
