// Lecteur de prévisualisation : enchaîne clips, images fixes et cartons noirs,
// et joue les voix et la musique aux bons moments. Navigation temporelle libre.
import { blobURL } from './db.js';

export class Preview {
  constructor(stage, timeline, { onTime = () => {}, onState = () => {} } = {}) {
    Object.assign(this, { stage, tl: timeline, onTime, onState });
    this.t = 0; this.playing = false; this.current = -1; this.raf = null;
    this.video = document.createElement('video'); this.video.playsInline = true; this.video.preload = 'auto';
    this.img = document.createElement('img'); this.img.alt = '';
    this.blank = document.createElement('div'); this.blank.className = 'blank-card';
    this.ovl = document.createElement('img'); this.ovl.className = 'ovl'; this.ovl.alt = '';
    this.audios = [];
  }

  async init() {
    this.urls = await Promise.all(this.tl.items.map((it) => (it.blob ? blobURL(it.blob) : null)));
    this.ovlUrls = await Promise.all(this.tl.items.map((it) => (it.overlay ? blobURL(it.overlay.blob) : null)));
    for (const v of this.tl.voices) this.audios.push({ start: v.start, el: new Audio(await blobURL(v.blob)), loop: false, volume: 1 });
    if (this.tl.music) {
      const a = new Audio(await blobURL(this.tl.music.blob));
      this.audios.push({ start: 0, el: a, loop: this.tl.music.loop, volume: Math.min(1, this.tl.music.volume) });
    }
    await this.seek(0);
  }

  indexAt(t) {
    const items = this.tl.items;
    for (let i = 0; i < items.length; i++) if (t < items[i].start + items[i].duration) return i;
    return items.length - 1;
  }

  async show(i, offset) {
    const it = this.tl.items[i];
    if (!it) return;
    if (i !== this.current) {
      this.current = i;
      this.video.pause();
      if (it.type === 'clip') {
        this.video.src = this.urls[i];
        this.stage.replaceChildren(this.video);
        await new Promise((r) => { if (this.video.readyState >= 1) r(); else { this.video.onloadedmetadata = r; this.video.onerror = r; } });
      } else if (it.type === 'image') { this.img.src = this.urls[i]; this.stage.replaceChildren(this.img); }
      else { this.blank.textContent = it.label; this.stage.replaceChildren(this.blank); }
      if (it.overlay && this.ovlUrls[i]) {
        this.ovl.src = this.ovlUrls[i];
        this.ovl.dataset.pos = it.overlay.position;
        this.ovl.style.width = `${it.overlay.width}%`;
        this.stage.append(this.ovl);
      }
    }
    if (it.type === 'clip') {
      try { this.video.currentTime = offset; } catch { /* ignoré */ }
      if (this.playing) this.video.play().catch(() => {});
    }
  }

  syncAudio() {
    for (const a of this.audios) {
      const local = this.t - a.start;
      const dur = a.el.duration || 0;
      const inside = local >= 0 && (a.loop || local < dur);
      a.el.volume = a.volume;
      if (this.playing && inside) {
        const target = a.loop && dur ? local % dur : local;
        if (a.el.paused) { try { a.el.currentTime = target; } catch { /* ignoré */ } a.el.loop = a.loop; a.el.play().catch(() => {}); }
      } else if (!a.el.paused) a.el.pause();
    }
  }

  async seek(t) {
    this.t = Math.max(0, Math.min(t, this.tl.total));
    for (const a of this.audios) a.el.pause();
    const i = this.indexAt(this.t);
    await this.show(i, this.t - (this.tl.items[i]?.start || 0));
    this.syncAudio();
    this.onTime(this.t);
  }

  play() {
    if (!this.tl.items.length) return;
    if (this.t >= this.tl.total - 0.05) this.t = 0;
    this.playing = true; this.onState(true);
    this.seek(this.t);
    let last = performance.now();
    const tick = async (now) => {
      if (!this.playing) return;
      const it = this.tl.items[this.current];
      if (it?.type === 'clip' && !this.video.paused) this.t = it.start + this.video.currentTime;
      else this.t += (now - last) / 1000;
      last = now;
      if (it && this.t >= it.start + it.duration - 0.02) {
        if (this.current >= this.tl.items.length - 1) { this.t = this.tl.total; this.pause(); this.onTime(this.t); return; }
        await this.show(this.current + 1, 0);
        last = performance.now();
      }
      this.syncAudio();
      this.onTime(this.t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false; this.onState(false);
    cancelAnimationFrame(this.raf);
    this.video.pause();
    for (const a of this.audios) a.el.pause();
  }

  destroy() { this.pause(); this.audios = []; }
}
