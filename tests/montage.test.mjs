// Test du montage avec FFmpeg natif : node tests/montage.test.mjs (nécessite ffmpeg installé)
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTimeline, buildFFmpegArgs } from '../js/montage.js';

const dir = mkdtempSync(join(tmpdir(), 'afro-'));
const ff = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { cwd: dir });
ff(['-f', 'lavfi', '-i', 'testsrc=s=1280x720:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', 'a.mp4']);
ff(['-f', 'lavfi', '-i', 'testsrc2=s=720x1280:r=25:d=3', '-c:v', 'libx264', 'noaudio.mp4']);
ff(['-f', 'lavfi', '-i', 'testsrc=s=800x600:d=1', '-frames:v', '1', 'img.png']);
ff(['-f', 'lavfi', '-i', 'sine=f=880:d=1.5', 'voice.webm']);
ff(['-f', 'lavfi', '-i', 'color=c=white@0.9:s=1200x500,format=rgba', '-frames:v', '1', 'formule.png']);
ff(['-f', 'lavfi', '-i', 'sine=f=220:d=2', 'music.mp3']);

const episode = {
  scenes: [{ id: 's1', title: 'S1', dialogues: [{ id: 'd1', audio: 'b_v', shotId: 'x2', offset: 0.5 }],
    shots: [
      { id: 'x1', shotType: 'Plan', clip: 'b_a', clipDuration: 4, duration: 5, overlay: { image: 'b_o', position: 'haut', width: 90 } },
      { id: 'x2', shotType: 'Plan', clip: 'b_n', clipDuration: 3, duration: 3, cut: 2.5 },
      { id: 'x3', shotType: 'Plan', refImage: 'b_i', duration: 2, overlay: { image: 'b_o', position: 'centre', width: 60 } },
      { id: 'x4', shotType: 'Plan', duration: 1.5, overlay: { image: 'b_o', position: 'bas', width: 100 } },
    ] }],
  music: { blob: 'b_m', volume: 0.3, loop: 'oui' },
};
const tl = buildTimeline(episode);
console.log('total', tl.total, tl.items.map((i) => i.type + ':' + i.duration).join(' '), 'voix', tl.voices);
for (const fmt of ['9:16', '16:9']) for (const fit of ['crop', 'pad']) {
  const args = buildFFmpegArgs(tl, { items: ['a.mp4', 'noaudio.mp4', 'img.png', null], overlays: ['formule.png', null, 'formule.png', 'formule.png'], hasAudio: [true, false, false, false], voices: ['voice.webm'], music: 'music.mp3' }, { format: fmt, fit, out: `out-${fmt.replace(':', 'x')}-${fit}.mp4` });
  execFileSync('ffmpeg', args.concat([]).map(String), { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'compact', `out-${fmt.replace(':', 'x')}-${fit}.mp4`], { cwd: dir }).toString().trim();
  console.log(fmt, fit, '→', probe.replace(/\n/g, ' | '));
}
// Sans musique ni voix
const tl2 = buildTimeline({ scenes: [{ id: 's', title: 's', dialogues: [], shots: [{ id: 'y', shotType: 'p', duration: 2 }] }] });
execFileSync('ffmpeg', buildFFmpegArgs(tl2, { items: [null], hasAudio: [false], voices: [] }, { out: 'blank.mp4' }), { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
// Vérifie que l'incrustation est visible : pixel blanc en haut du plan 1 (t = 1 s), absent sans incrustation (plan 2, t = 4,5 s)
const px = (t, y) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', 'out-9x16-crop.mp4', '-frames:v', '1', '-vf', `crop=2:2:270:${y}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { cwd: dir })[0];
console.log('incrustation haut (plan 1):', px(1, 80), '| sans incrustation (plan 2):', px(4.5, 80), '| centre (plan 3):', px(7, 480), '| bas (plan 4):', px(9.2, 880));
console.log('blank OK', dir);
