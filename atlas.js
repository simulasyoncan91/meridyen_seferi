// Atlas - Meridyen OS harita uygulamasi (eski adi "Harita Odasi").
// Dis kutuphane yok. Veri: atlas/*.json (Natural Earth, kamu mali; bkz. atlas/KAYNAK.md).
// Tarihi sekiller (atlas/donemler.json) ELLE cizilmis, KABA ve YAKLASIKTIR.
//
// Dort katman: Dunya, Turkiye, Sehir (secilen il ve komsulari), Bolge (coğrafi bolge).
// Zaman seridi: bir donem secilince harita o donemin kaba sekline gecer ve altta
// "bilginin siniri" notu gorunur.
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const KX = 0.78;                       // boylam olcegi (~ cos 39 derece)
  const DUNYA_KUTU = [-170, -58, 190, 84];
  const TR_KUTU = [25.4, 35.6, 45.0, 42.3];
  const BOLGE_RENK = { 'Marmara': '#3f6fa8', 'Ege': '#3f9c8c', 'Akdeniz': '#b5733f', 'İç Anadolu': '#a89a3f', 'Karadeniz': '#3f8f5a', 'Doğu Anadolu': '#8a5fb0', 'Güneydoğu Anadolu': '#b0525f' };
  const VARSAYILAN_BOLGE = 'İç Anadolu';
  const KATMANLAR = [['dunya', 'Dünya'], ['turkiye', 'Türkiye'], ['sehir', 'Şehir'], ['bolge', 'Bölge']];

  const veri = { dunya: null, cevre: null, turkiye: null, merkezler: null, donemler: null, eslesme: null };
  let yuklenme = null;

  function oku(ad) {
    return fetch('atlas/' + ad + '.json').then((r) => { if (!r.ok) throw new Error(ad + ' ' + r.status); return r.json(); });
  }
  function yukle() {
    if (!yuklenme) {
      yuklenme = Promise.all(['dunya', 'cevre', 'turkiye', 'merkezler', 'donemler', 'konu_donem'].map(oku)).then((d) => {
        veri.dunya = d[0]; veri.cevre = d[1]; veri.turkiye = d[2]; veri.merkezler = d[3];
        veri.donemler = d[4].donemler; veri.eslesme = d[5];
        veri.iller = {};
        veri.turkiye.iller.forEach((il) => { il.kutu = yolKutusu(il.d); veri.iller[il.plaka] = il; });
        veri.mer = {};
        veri.merkezler.merkezler.forEach((m) => { veri.mer[m.plaka] = m; });
        return veri;
      });
      yuklenme.catch(() => { yuklenme = null; });
    }
    return yuklenme;
  }
  function yolKutusu(d) {
    const s = d.match(/-?\d+(\.\d+)?/g) || [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i + 1 < s.length; i += 2) {
      const x = +s[i], y = +s[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }
  function yolNoktalari(d) {
    const s = d.match(/-?\d+(\.\d+)?/g) || [], p = [];
    for (let i = 0; i + 1 < s.length; i += 2) p.push([+s[i], +s[i + 1]]);
    return p;
  }
  function kesisir(a, b, pay) { return !(a[2] + pay < b[0] || b[2] + pay < a[0] || a[3] + pay < b[1] || b[3] + pay < a[1]); }
  function komsular(plaka) {
    const il = veri.iller[plaka], pa = yolNoktalari(il.d), sonuc = [];
    veri.turkiye.iller.forEach((o) => {
      if (o.plaka === plaka || !kesisir(il.kutu, o.kutu, 0.05)) return;
      const pb = yolNoktalari(o.d);
      let yakin = false;
      for (let i = 0; i < pa.length && !yakin; i++) {
        for (let j = 0; j < pb.length; j++) {
          const dx = pa[i][0] - pb[j][0], dy = pa[i][1] - pb[j][1];
          if (dx * dx + dy * dy < 0.0016) { yakin = true; break; }   // 0.04 derece
        }
      }
      if (yakin) sonuc.push(o.plaka);
    });
    return sonuc;
  }

  function svg(ad, o) {
    const e = document.createElementNS(NS, ad);
    for (const k in (o || {})) { const v = o[k]; if (v != null) e.setAttribute(k, v); }
    return e;
  }

  // ------------------------------------------------------------------ uygulama
  function kur(kap, api) {
    const el = api.el;
    const S = {
      katman: 'dunya', zaman: null, il: 34, bolge: VARSAYILAN_BOLGE, ulke: '', hedefNotu: '',
      v: { x: 0, y: 0, w: 100 }, hazir: false, kaldir: false
    };
    // ---- iskelet
    const katBar = el('div', { sinif: 'at-katman', role: 'tablist', 'aria-label': 'Harita katmanı' });
    const katDugme = {};
    KATMANLAR.forEach((k) => {
      const b = el('button', { sinif: 'at-dugme', role: 'tab', 'data-katman': k[0], onclick: () => katmanSec(k[0]), metin: k[1] });
      katDugme[k[0]] = b; katBar.appendChild(b);
    });
    const yolBtn = el('button', { sinif: 'at-dugme at-yol', onclick: () => api.yolHaritasi(), title: 'Üssün yol haritası ve karne (eski Harita Odası)', metin: 'Üs yol haritası' });
    katBar.appendChild(yolBtn);

    const harita = el('div', { sinif: 'at-harita' });
    const sv = svg('svg', { 'class': 'at-svg', role: 'img', tabindex: '0', 'aria-label': 'Harita' });
    const defs = svg('defs');
    const gDunya = svg('g', { 'class': 'at-dunya' }), gCevre = svg('g', { 'class': 'at-cevre' });
    const gOver = svg('g', { 'class': 'at-over' }), gTr = svg('g', { 'class': 'at-tr' });
    const gAgi = svg('g', { 'class': 'at-agi' }), gYer = svg('g', { 'class': 'at-yer' });
    sv.append(defs, gAgi, gDunya, gCevre, gOver, gTr, gYer);
    const etiket = el('div', { sinif: 'at-etiket', hidden: true });
    const zoomBar = el('div', { sinif: 'at-zoom' },
      el('button', { sinif: 'at-dugme', 'aria-label': 'Yakınlaştır', metin: '+', onclick: () => yaklas(0.6) }),
      el('button', { sinif: 'at-dugme', 'aria-label': 'Uzaklaştır', metin: '−', onclick: () => yaklas(1 / 0.6) }),
      el('button', { sinif: 'at-dugme', 'aria-label': 'Görünümü sıfırla', metin: '⟲', onclick: () => gorunumSifirla() }));
    harita.append(sv, etiket, zoomBar);

    const zamanSerit = el('div', { sinif: 'at-zaman', role: 'group', 'aria-label': 'Zaman çizelgesi' });
    const panel = el('div', { sinif: 'at-panel' });
    const sol = el('div', { sinif: 'at-sol' }, katBar, harita, zamanSerit);
    kap.textContent = '';
    kap.append(sol, panel);

    // ---- gorunum (viewBox)
    function boyut() { const r = sv.getBoundingClientRect(); return { w: Math.max(r.width, 50), h: Math.max(r.height, 50) }; }
    function uygula() {
      const b = boyut(), v = S.v, h = v.w * b.h / b.w;
      sv.setAttribute('viewBox', (v.x - v.w / 2) + ' ' + (v.y - h / 2) + ' ' + v.w + ' ' + h);
      const derece = v.w / KX;
      const fs = v.w / (b.w < 500 ? 38 : 62);
      sv.style.setProperty('--fs', fs + 'px');
      sv.style.setProperty('--r', (fs * 0.28) + 'px');
      gYer.querySelectorAll('text').forEach((t) => { t.setAttribute('font-size', fs); t.setAttribute('stroke-width', fs * 0.28); });
      gYer.querySelectorAll('circle').forEach((c) => c.setAttribute('r', fs * 0.3));
      // ayrintiya gore ulke verisi: yakin gorunumde 50m
      const yakin = derece < 46 && v.x / KX > CEV[0] + derece / 2 - 6 && v.x / KX < CEV[2] - derece / 2 + 6 && -v.y > CEV[1] + 2 && -v.y < CEV[3] - 2;
      gDunya.style.display = yakin ? 'none' : ''; gCevre.style.display = yakin ? '' : 'none';
      defs.querySelectorAll('clipPath').forEach((c) => { c.style.display = ''; });
      gOver.setAttribute('clip-path', 'url(#' + (yakin ? 'kara-c' : 'kara-d') + ')');
      etiketGuncelle(derece);
    }
    const CEV = [17, 28, 52, 48];
    function ortala(x0, y0, x1, y1, pay) {          // derece kutusu
      const b = boyut(), bw = (x1 - x0) * KX * (pay || 1.12), bh = (y1 - y0) * (pay || 1.12);
      S.v.w = Math.max(bw, bh * b.w / b.h);
      S.v.x = (x0 + x1) / 2 * KX; S.v.y = -(y0 + y1) / 2;
      uygula();
    }
    function yaklas(oran, mx, my) {
      const b = boyut(), v = S.v;
      const yeniW = Math.min(Math.max(v.w * oran, 0.5), 360 * KX * 1.25);
      const o = yeniW / v.w;
      if (mx == null) { mx = v.x; my = v.y; }
      S.v.x = mx + (v.x - mx) * o; S.v.y = my + (v.y - my) * o; S.v.w = yeniW;
      uygula();
    }
    function ekranToProj(cx, cy) {
      const r = sv.getBoundingClientRect(), v = S.v, h = v.w * r.height / r.width;
      return [v.x - v.w / 2 + (cx - r.left) / r.width * v.w, v.y - h / 2 + (cy - r.top) / r.height * h];
    }
    // ---- surukleme, sikistirma, tekerlek
    const ptr = new Map();
    let sonMesafe = 0, tasi = 0;
    sv.addEventListener('pointerdown', (e) => {
      sv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); tasi = 0;
      if (ptr.size === 2) { const p = [...ptr.values()]; sonMesafe = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); }
    });
    sv.addEventListener('pointermove', (e) => {
      const onc = ptr.get(e.pointerId);
      if (!onc) { ipucu(e); return; }
      const dx = e.clientX - onc[0], dy = e.clientY - onc[1];
      ptr.set(e.pointerId, [e.clientX, e.clientY]);
      const r = sv.getBoundingClientRect();
      if (ptr.size === 1) {
        tasi += Math.abs(dx) + Math.abs(dy);
        S.v.x -= dx / r.width * S.v.w; S.v.y -= dy / r.width * S.v.w;
        uygula();
      } else if (ptr.size === 2) {
        tasi += 10;
        const p = [...ptr.values()], m = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
        if (sonMesafe > 0 && m > 0) { const o = ekranToProj((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2); yaklas(sonMesafe / m, o[0], o[1]); }
        sonMesafe = m;
      }
    });
    function birak(e) {
      const var_ = ptr.has(e.pointerId);
      ptr.delete(e.pointerId); sonMesafe = 0;
      if (var_ && e.type === 'pointerup' && tasi < 8 && ptr.size === 0) {
        const h = document.elementFromPoint(e.clientX, e.clientY);
        dokun(h);
      }
    }
    sv.addEventListener('pointerup', birak); sv.addEventListener('pointercancel', birak);
    sv.addEventListener('wheel', (e) => { e.preventDefault(); const o = ekranToProj(e.clientX, e.clientY); yaklas(e.deltaY > 0 ? 1.25 : 0.8, o[0], o[1]); }, { passive: false });
    sv.addEventListener('keydown', (e) => {
      const adim = S.v.w * 0.1;
      if (e.key === '+' || e.key === '=') yaklas(0.7); else if (e.key === '-') yaklas(1 / 0.7);
      else if (e.key === 'ArrowLeft') { S.v.x -= adim; uygula(); } else if (e.key === 'ArrowRight') { S.v.x += adim; uygula(); }
      else if (e.key === 'ArrowUp') { S.v.y -= adim; uygula(); } else if (e.key === 'ArrowDown') { S.v.y += adim; uygula(); }
      else return;
      e.preventDefault();
    });
    function ipucu(e) {
      const h = e.target; let ad = '';
      if (h && h.getAttribute) ad = h.getAttribute('data-ad') || '';
      if (!ad) { etiket.hidden = true; return; }
      const r = harita.getBoundingClientRect();
      etiket.textContent = ad; etiket.hidden = false;
      etiket.style.left = Math.min(e.clientX - r.left + 12, r.width - 140) + 'px'; etiket.style.top = (e.clientY - r.top + 12) + 'px';
    }
    function dokun(h) {
      if (!h || !h.getAttribute) return;
      const pl = h.getAttribute('data-plaka'), ul = h.getAttribute('data-ulke');
      if (pl && (S.katman === 'turkiye' || S.katman === 'sehir' || S.katman === 'bolge') && !S.zaman) {
        S.il = +pl;
        if (S.katman === 'turkiye') { panelCiz(); ciz(false); } else if (S.katman === 'bolge') { S.bolge = veri.iller[S.il].bolge; ciz(true); panelCiz(); } else { ciz(true); panelCiz(); }
      } else if (ul && S.katman === 'dunya' && !S.zaman) { S.ulke = ul; panelCiz(); ciz(false); }
    }
    function etiketGuncelle() {}

    // ---- cizim
    function temelCiz() {
      [gDunya, gCevre, gOver, gTr, gYer, gAgi].forEach((g) => { g.textContent = ''; });
      defs.textContent = '';
      // graticule
      let dd = '';
      for (let lo = -180; lo <= 180; lo += 30) dd += 'M' + lo + ' -85L' + lo + ' 85';
      for (let la = -60; la <= 80; la += 30) dd += 'M-180 ' + (-la) + 'L180 ' + (-la);
      const gr = svg('path', { d: dd, 'class': 'at-izgara', 'vector-effect': 'non-scaling-stroke' });
      gAgi.setAttribute('transform', 'scale(' + KX + ' 1)'); gAgi.appendChild(gr);
      [[gDunya, veri.dunya.ulkeler, 'd'], [gCevre, veri.cevre.ulkeler, 'c']].forEach((t) => {
        const g = t[0], tum = [];
        g.setAttribute('transform', 'scale(' + KX + ' -1)');
        t[1].forEach((u) => {
          const p = svg('path', { d: u.d, 'class': 'at-ulke' + (u.ad === 'Türkiye' ? ' at-turkiye' : ''), 'data-ad': u.ad, 'data-ulke': u.ad, 'vector-effect': 'non-scaling-stroke' });
          g.appendChild(p); tum.push(u.d);
        });
        const cp = svg('clipPath', { id: 'kara-' + t[2] });
        cp.appendChild(svg('path', { d: tum.join('') }));
        defs.appendChild(cp);
      });
      gOver.setAttribute('transform', 'scale(' + KX + ' -1)');
      gTr.setAttribute('transform', 'scale(' + KX + ' -1)');
      gYer.setAttribute('transform', '');
    }
    function yerEkle(ad, lon, lat, sinif) {
      const g = svg('g', { 'class': 'at-nokta' + (sinif ? ' ' + sinif : '') });
      g.appendChild(svg('circle', { cx: lon * KX, cy: -lat, r: 0.3 }));
      const t = svg('text', { x: lon * KX + 0.5, y: -lat - 0.4 }); t.textContent = ad;
      g.appendChild(t); gYer.appendChild(g);
    }
    function ilYolu(il, sinif) {
      return svg('path', { d: il.d, 'class': 'at-il ' + (sinif || ''), 'data-plaka': il.plaka, 'data-ad': il.ad, 'vector-effect': 'non-scaling-stroke' });
    }
    function bolgeMerkezi(ad) {
      const l = veri.merkezler.merkezler.filter((m) => m.bolge === ad);
      return [l.reduce((s, m) => s + m.x, 0) / l.length, l.reduce((s, m) => s + m.y, 0) / l.length];
    }
    function ciz(yakinlas) {
      if (!S.hazir) return;
      gOver.textContent = ''; gTr.textContent = ''; gYer.textContent = '';
      Object.keys(katDugme).forEach((k) => { katDugme[k].classList.toggle('etkin', !S.zaman && k === S.katman); katDugme[k].setAttribute('aria-selected', String(!S.zaman && k === S.katman)); });
      zamanSerit.querySelectorAll('.at-dugme').forEach((b) => { const a = (b.getAttribute('data-donem') || '') === (S.zaman || ''); b.classList.toggle('etkin', a); b.setAttribute('aria-pressed', String(a)); });
      sv.setAttribute('aria-label', 'Harita: ' + (S.zaman ? donem(S.zaman).baslik : KATMANLAR.filter((k) => k[0] === S.katman)[0][1]));
      let kutu = null;
      if (S.zaman) { kutu = zamanCiz(); }
      else if (S.katman === 'dunya') {
        kutu = DUNYA_KUTU;
        if (S.ulke) gDunya.querySelectorAll('.at-ulke').forEach((p) => p.classList.toggle('sec', p.getAttribute('data-ulke') === S.ulke));
      } else if (S.katman === 'turkiye') {
        kutu = TR_KUTU;
        veri.turkiye.iller.forEach((il) => {
          const p = ilYolu(il, 'bolge-renk' + (il.plaka === S.il ? ' sec' : '')); p.style.setProperty('--bc', BOLGE_RENK[il.bolge]); gTr.appendChild(p);
        });
        veri.turkiye.bolgeler.forEach((b) => { const m = bolgeMerkezi(b); yerEkle(b, m[0], m[1], 'at-bolge-ad'); });
      } else if (S.katman === 'sehir') {
        const il = veri.iller[S.il], kom = komsular(S.il), k = il.kutu;
        veri.turkiye.iller.forEach((o) => {
          const sinif = o.plaka === S.il ? 'sec' : (kom.indexOf(o.plaka) >= 0 ? 'komsu' : 'uzak');
          gTr.appendChild(ilYolu(o, sinif));
        });
        const gor = (o) => o.plaka === S.il || kom.indexOf(o.plaka) >= 0;
        veri.merkezler.merkezler.filter(gor).forEach((m) => yerEkle(m.ad, m.x, m.y, m.plaka === S.il ? 'at-sec-nokta' : ''));
        const gen = Math.max(k[2] - k[0], (k[3] - k[1]) * 1.2);
        kutu = [(k[0] + k[2]) / 2 - gen * 1.1, (k[1] + k[3]) / 2 - gen * 0.9, (k[0] + k[2]) / 2 + gen * 1.1, (k[1] + k[3]) / 2 + gen * 0.9];
      } else if (S.katman === 'bolge') {
        const iller = veri.turkiye.iller.filter((i) => i.bolge === S.bolge);
        veri.turkiye.iller.forEach((o) => {
          const p = ilYolu(o, o.bolge === S.bolge ? 'bolge-sec' : 'uzak'); p.style.setProperty('--bc', BOLGE_RENK[o.bolge]); gTr.appendChild(p);
        });
        iller.forEach((i) => { const m = veri.mer[i.plaka]; yerEkle(i.ad, m.x, m.y); });
        let x0 = 99, y0 = 99, x1 = 0, y1 = 0;
        iller.forEach((i) => { x0 = Math.min(x0, i.kutu[0]); y0 = Math.min(y0, i.kutu[1]); x1 = Math.max(x1, i.kutu[2]); y1 = Math.max(y1, i.kutu[3]); });
        kutu = [x0 - 1, y0 - 0.6, x1 + 1, y1 + 0.6];
      }
      if (yakinlas !== false && kutu) ortala(kutu[0], kutu[1], kutu[2], kutu[3]);
      else uygula();
    }
    function donem(id) { return veri.donemler.filter((d) => d.id === id)[0]; }
    function zamanCiz() {
      const d = donem(S.zaman);
      d.alanlar.forEach((a) => {
        if (a.cokgen) {
          const nokta = a.cokgen.map((p) => p[0] + ' ' + p[1]).join('L');
          gOver.appendChild(svg('path', { d: 'M' + nokta + 'Z', 'class': 'at-alan alan-' + a.tur, 'data-ad': a.ad + ' (yaklaşık)', 'vector-effect': 'non-scaling-stroke' }));
        } else if (a.iller_haric) {
          veri.turkiye.iller.filter((i) => a.iller_haric.indexOf(i.plaka) < 0).forEach((i) => {
            gTr.appendChild(svg('path', { d: i.d, 'class': 'at-alan alan-' + a.tur + ' alan-il', 'data-ad': a.ad, 'vector-effect': 'non-scaling-stroke' }));
          });
        }
      });
      (d.yerler || []).forEach((y) => yerEkle(y.ad, y.x, y.y));
      return d.bbox;
    }

    // ---- paneller
    function katmanSec(k) { S.zaman = null; S.hedefNotu = ''; S.katman = k; ciz(true); panelCiz(); }
    function zamanSec(id) { S.zaman = id; S.hedefNotu = ''; ciz(true); panelCiz(); }
    function gorunumSifirla() { ciz(true); }
    function zamanSeridiKur() {
      zamanSerit.textContent = '';
      const sag = () => { const o = veri.donemler.map((d) => d.id), i = o.indexOf(S.zaman); return i; };
      zamanSerit.appendChild(el('button', { sinif: 'at-dugme at-ok', 'aria-label': 'Önceki dönem', metin: '‹', onclick: () => { const i = sag(); zamanSec(veri.donemler[i <= 0 ? veri.donemler.length - 1 : i - 1].id); } }));
      const liste = el('div', { sinif: 'at-donemler' });
      veri.donemler.forEach((d) => liste.appendChild(el('button', { sinif: 'at-dugme at-donem', 'data-donem': d.id, onclick: () => zamanSec(d.id), title: d.baslik },
        el('b', { metin: d.etiket }), el('small', { metin: d.kisa }))));
      zamanSerit.appendChild(liste);
      zamanSerit.appendChild(el('button', { sinif: 'at-dugme at-ok', 'aria-label': 'Sonraki dönem', metin: '›', onclick: () => { const i = sag(); zamanSec(veri.donemler[i < 0 || i >= veri.donemler.length - 1 ? 0 : i + 1].id); } }));
    }
    function sehirSecici() {
      const s = el('select', { sinif: 'at-secici', 'aria-label': 'İl seç' });
      veri.turkiye.iller.forEach((i) => { const o = el('option', { value: String(i.plaka), metin: (i.plaka < 10 ? '0' : '') + i.plaka + ' ' + i.ad }); if (i.plaka === S.il) o.selected = true; s.appendChild(o); });
      s.addEventListener('change', () => { S.il = +s.value; if (S.katman === 'sehir') ciz(true); panelCiz(); });
      return s;
    }
    function panelCiz() {
      panel.textContent = '';
      if (S.zaman) {
        const d = donem(S.zaman);
        panel.append(el('div', { sinif: 'at-rozet' }, el('b', { metin: 'KABA · YAKLAŞIK' }), ' Kesin sınır değildir.'),
          el('h2', { metin: d.baslik }), el('div', { sinif: 'soluk', metin: d.yil }));
        if (S.hedefNotu) panel.appendChild(el('div', { sinif: 'at-hedef', metin: S.hedefNotu }));
        panel.appendChild(el('p', { metin: d.ozet }));
        const lej = el('div', { sinif: 'at-lejant' });
        d.alanlar.forEach((a) => lej.appendChild(el('div', { sinif: 'at-lj' }, el('i', { sinif: 'alan-' + a.tur }), el('span', { metin: a.ad }))));
        panel.appendChild(lej);
        panel.appendChild(el('div', { sinif: 'at-sinir' },
          el('div', { sinif: 'etiket', metin: 'BİLGİNİN SINIRI' }),
          el('div', { sinif: 'at-belirsiz', metin: 'Belirsizlik: ' + d.belirsizlik }),
          el('p', { metin: d.sinir_notu })));
      } else if (S.katman === 'dunya') {
        panel.append(el('h2', { metin: 'Dünya' }),
          el('p', { metin: 'Ülke sınırları bugünkü durumu gösterir. Sürükle, iki parmakla yakınlaştır; bir ülkeye dokununca adı görünür.' }),
          S.ulke ? el('div', { sinif: 'at-secili', metin: 'Seçili: ' + S.ulke }) : '',
          el('p', { sinif: 'soluk', metin: 'Aşağıdaki zaman çizelgesinden bir dönem seçersen harita o dönemin kaba şekline geçer.' }));
      } else if (S.katman === 'turkiye') {
        const il = veri.iller[S.il];
        panel.append(el('h2', { metin: 'Türkiye' }),
          el('p', { metin: '81 il ve 7 coğrafi bölge. Renkler bölgeleri gösterir; bir ile dokun.' }),
          el('div', { sinif: 'at-secili' }, el('b', { metin: il.ad }), ' · ' + il.bolge + ' Bölgesi · plaka ' + il.plaka),
          sehirSecici(),
          el('button', { sinif: 'at-dugme birincil', onclick: () => katmanSec('sehir'), metin: il.ad + ' şehir görünümü' }));
      } else if (S.katman === 'sehir') {
        const il = veri.iller[S.il], kom = komsular(S.il).map((p) => veri.iller[p].ad).sort((a, b) => a.localeCompare(b, 'tr'));
        const m = veri.mer[S.il];
        panel.append(el('h2', { metin: il.ad }), el('div', { sinif: 'soluk', metin: il.bolge + ' Bölgesi · plaka ' + il.plaka }),
          sehirSecici(),
          el('p', { metin: 'İl merkezinin yaklaşık konumu: ' + m.y.toFixed(2) + '° K, ' + m.x.toFixed(2) + '° D.' }),
          el('p', { metin: 'Komşu iller: ' + (kom.length ? kom.join(', ') : 'yok (ada ya da sınır verisi yetersiz)') + '.' }),
          el('p', { sinif: 'soluk', metin: 'Komşuluk, sadeleştirilmiş sınır çizgilerinden hesaplanır; kıyıdaki küçük ayrıntılar eksik olabilir.' }));
      } else if (S.katman === 'bolge') {
        const chips = el('div', { sinif: 'at-chip' });
        veri.turkiye.bolgeler.forEach((b) => chips.appendChild(el('button', { sinif: 'at-dugme' + (b === S.bolge ? ' etkin' : ''), onclick: () => { S.bolge = b; ciz(true); panelCiz(); }, metin: b })));
        const iller = veri.turkiye.iller.filter((i) => i.bolge === S.bolge).map((i) => i.ad);
        panel.append(el('h2', { metin: S.bolge + (S.bolge.indexOf('Anadolu') >= 0 ? '' : ' Bölgesi') }), chips,
          el('p', { metin: iller.length + ' il: ' + iller.join(', ') + '.' }),
          el('p', { sinif: 'soluk', metin: 'Üssünün bölgesini oyun şimdilik tutmuyor (üs konumu yeryüzü, yeraltı gibi bir kuşak olarak saklanır; coğrafi koordinat yoktur). Bu yüzden bölgeyi sen seçersin; varsayılan ' + VARSAYILAN_BOLGE + '.' }));
      }
      panel.appendChild(el('div', { sinif: 'at-dip soluk', metin: 'Veri: Natural Earth (kamu malı). Tarihî şekiller elle çizilmiş kaba tahminlerdir.' }));
    }

    function ac(o) {
      o = o || {};
      return yukle().then(() => {
        if (!S.hazir) { temelCiz(); zamanSeridiKur(); S.hazir = true; }
        if (o.il) S.il = o.il;
        if (o.bolge) S.bolge = o.bolge;
        S.hedefNotu = o.not || '';
        if (o.donem && donem(o.donem)) { S.zaman = o.donem; }
        else if (o.katman) { S.zaman = null; S.katman = o.katman; }
        else if (o.sifirla) { S.zaman = null; }
        // yeni boyut icin bir kare bekle
        requestAnimationFrame(() => { ciz(true); panelCiz(); });
      }).catch((e) => {
        panel.textContent = '';
        panel.append(el('h2', { metin: 'Harita yüklenemedi' }), el('p', { metin: 'Atlas verisi (atlas/*.json) okunamadı. Dosya olarak değil, bir adresten (sunucu ya da yayın) aç.' }), el('p', { sinif: 'soluk', metin: String(e && e.message || e) }));
      });
    }
    if (window.ResizeObserver) new ResizeObserver(() => { if (S.hazir) uygula(); }).observe(harita);
    panel.append(el('div', { sinif: 'soluk', metin: 'Harita yükleniyor…' }));
    return { ac, durum: S, veri };
  }

  // Gorev baglami -> hedef (konu_donem.json)
  function hedefBul(gorev) {
    return yukle().then(() => {
      const e = veri.eslesme || {};
      const h = (e.gorevler || {})[gorev.kod] || (e.dersler || {})[gorev.ders] || null;
      if (!h) return null;
      const r = {};
      if (h.donem) r.donem = h.donem; if (h.katman) r.katman = h.katman;
      if (h.donem && h.yakin) r.not = 'Bu görevin konusu tam bu yıla değil, bu döneme yakın düşer; en yakın hazır dönem gösteriliyor.';
      else if (h.donem) r.not = 'Görevin dönemi: bu harita.';
      return r;
    }).catch(() => null);
  }

  window.OS_ATLAS = { kur: kur, hedefBul: hedefBul, yukle: yukle };
})();
