// Logique de montage, indépendante de l'interface (testable dans Node).
// 1) buildTimeline : calcule l'ordre, la durée et la position de chaque élément.
// 2) buildFFmpegArgs : produit la commande FFmpeg qui assemble la vidéo finale.

export const SIZES = {
  '9:16': { fast: [540, 960], hd: [720, 1280] },
  '16:9': { fast: [960, 540], hd: [1280, 720] },
};

const r3 = (x) => Math.round(x * 1000) / 1000;

export function usedDuration(shot) {
  const base = shot.clip ? (shot.clipDuration || Number(shot.duration) || 5) : (Number(shot.duration) || 5);
  const cut = Number(shot.cut);
  return r3(Math.max(0.5, cut > 0 ? Math.min(cut, base) : base));
}

// Timeline : un élément par plan. Type : 'clip' (vidéo), 'image' (image fixe = animatique) ou 'blank' (carton noir).
export function buildTimeline(episode, { includeMissing = true } = {}) {
  const items = [];
  let t = 0;
  for (const scene of episode.scenes) {
    for (const shot of scene.shots) {
      const type = shot.clip ? 'clip' : shot.refImage ? 'image' : 'blank';
      if (!includeMissing && type !== 'clip') continue;
      const d = usedDuration(shot);
      items.push({ type, shotId: shot.id, sceneId: scene.id, blob: shot.clip || shot.refImage || null, start: r3(t), duration: d, label: `${scene.title} · ${shot.shotType}` });
      t = r3(t + d);
    }
  }
  const byShot = Object.fromEntries(items.map((i) => [i.shotId, i]));
  const voices = [];
  for (const scene of episode.scenes) {
    for (const d of scene.dialogues) {
      const it = byShot[d.shotId];
      if (!d.audio || !it) continue;
      voices.push({ blob: d.audio, start: r3(it.start + Math.max(0, Number(d.offset) || 0)), dialogueId: d.id });
    }
  }
  const music = episode.music ? { blob: episode.music.blob, volume: Number(episode.music.volume ?? 0.25), loop: episode.music.loop !== 'non' } : null;
  return { items, voices, music, total: t };
}

// probe : { [indexItem]: true si le clip contient une piste audio }
export function buildFFmpegArgs(timeline, files, { format = '9:16', quality = 'fast', fit = 'crop', keepClipAudio = true, out = 'episode.mp4' } = {}) {
  const [W, H] = (SIZES[format] || SIZES['9:16'])[quality === 'hd' ? 'hd' : 'fast'];
  const args = ['-hide_banner'];
  const filters = [];
  let input = 0;
  const AF = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  const frame = fit === 'pad'
    ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;

  timeline.items.forEach((it, i) => {
    const d = it.duration;
    if (it.type === 'clip') {
      args.push('-i', files.items[i]);
      filters.push(`[${input}:v]trim=duration=${d},setpts=PTS-STARTPTS,fps=24,${frame},setsar=1,format=yuv420p[v${i}]`);
      if (keepClipAudio && files.hasAudio[i]) filters.push(`[${input}:a]atrim=duration=${d},asetpts=PTS-STARTPTS,${AF},apad,atrim=duration=${d}[a${i}]`);
      else filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${d}[a${i}]`);
      input++;
    } else if (it.type === 'image') {
      args.push('-loop', '1', '-framerate', '24', '-t', String(d), '-i', files.items[i]);
      filters.push(`[${input}:v]trim=duration=${d},setpts=PTS-STARTPTS,fps=24,${frame},setsar=1,format=yuv420p[v${i}]`);
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${d}[a${i}]`);
      input++;
    } else {
      filters.push(`color=c=black:s=${W}x${H}:r=24:d=${d},setsar=1,format=yuv420p[v${i}]`);
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${d}[a${i}]`);
    }
  });
  const n = timeline.items.length;
  filters.push(timeline.items.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${n}:v=1:a=1[vout][abase]`);

  const mix = ['[abase]'];
  timeline.voices.forEach((v, k) => {
    args.push('-i', files.voices[k]);
    const ms = Math.round(v.start * 1000);
    filters.push(`[${input}:a]${AF},adelay=${ms}|${ms},apad[d${k}]`);
    mix.push(`[d${k}]`);
    input++;
  });
  if (timeline.music && files.music) {
    if (timeline.music.loop) args.push('-stream_loop', '-1');
    args.push('-i', files.music);
    filters.push(`[${input}:a]${AF},atrim=duration=${timeline.total},volume=${timeline.music.volume},apad[mus]`);
    mix.push('[mus]');
    input++;
  }
  // apad + volume=N : mixage stable et compatible avec les anciennes versions de FFmpeg (WebAssembly)
  if (mix.length > 1) filters.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:dropout_transition=0,volume=${mix.length},alimiter=limit=0.95[aout]`);
  else filters.push('[abase]anull[aout]');

  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', quality === 'hd' ? '23' : '26', '-pix_fmt', 'yuv420p', '-r', '24',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-t', String(timeline.total), '-movflags', '+faststart', '-y', out);
  return args;
}

export function hasAudioStream(log) {
  return /Stream #\d+:\d+.*Audio:/.test(log);
}
