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
ff(['-f', 'lavfi', '-i', 'sine=f=220:d=2', 'music.mp3']);

const episode = {
  scenes: [{ id: 's1', title: 'S1', dialogues: [{ id: 'd1', audio: 'b_v', shotId: 'x2', offset: 0.5 }],
    shots: [
      { id: 'x1', shotType: 'Plan', clip: 'b_a', clipDuration: 4, duration: 5 },
      { id: 'x2', shotType: 'Plan', clip: 'b_n', clipDuration: 3, duration: 3, cut: 2.5 },
      { id: 'x3', shotType: 'Plan', refImage: 'b_i', duration: 2 },
      { id: 'x4', shotType: 'Plan', duration: 1.5 },
    ] }],
  music: { blob: 'b_m', volume: 0.3, loop: 'oui' },
};
const tl = buildTimeline(episode);
console.log('total', tl.total, tl.items.map((i) => i.type + ':' + i.duration).join(' '), 'voix', tl.voices);
for (const fmt of ['9:16', '16:9']) for (const fit of ['crop', 'pad']) {
  const args = buildFFmpegArgs(tl, { items: ['a.mp4', 'noaudio.mp4', 'img.png', null], hasAudio: [true, false, false, false], voices: ['voice.webm'], music: 'music.mp3' }, { format: fmt, fit, out: `out-${fmt.replace(':', 'x')}-${fit}.mp4` });
  execFileSync('ffmpeg', args.concat([]).map(String), { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'compact', `out-${fmt.replace(':', 'x')}-${fit}.mp4`], { cwd: dir }).toString().trim();
  console.log(fmt, fit, '→', probe.replace(/\n/g, ' | '));
}
// Sans musique ni voix
const tl2 = buildTimeline({ scenes: [{ id: 's', title: 's', dialogues: [], shots: [{ id: 'y', shotType: 'p', duration: 2 }] }] });
execFileSync('ffmpeg', buildFFmpegArgs(tl2, { items: [null], hasAudio: [false], voices: [] }, { out: 'blank.mp4' }), { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
console.log('blank OK', dir);
