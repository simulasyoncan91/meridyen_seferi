// Meridyen OS - arayuz. Motor tek kaynak: burasi yalniz GOSTERIR ve
// tiklamayi motorun bekledigi METNE cevirir (bkz. ../MERIDYEN_OS.md).
(function () {
  'use strict';

  // ------------------------------------------------------------ yardimcilar
  const $ = (s, k) => (k || document).querySelector(s);
  function el(etiket, o) {
    const e = document.createElement(etiket);
    o = o || {};
    for (const k in o) {
      const v = o[k];
      if (v == null || v === false) continue;
      if (k === 'sinif') e.className = v;
      else if (k === 'metin') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  const dar = () => window.matchMedia('(max-width: 760px)').matches;
  const secenekMetni = (s) => (s && typeof s === 'object') ? (s.metin || s.ad || '') : String(s);
  const secenekAciklama = (s) => (s && typeof s === 'object') ? (s.aciklama || '') : '';

  // Simge: simgeler/<anahtar>.svg; yoksa ilk harf rozeti.
  function simge(anahtar, ad, boyut) {
    const kap = el('span', { sinif: 'sim' });
    const rozet = () => { kap.textContent = ''; kap.appendChild(el('span', { sinif: 'rozet', metin: (ad || anahtar || '?').charAt(0).toLocaleUpperCase('tr') })); };
    const img = el('img', { src: 'simgeler/' + anahtar + '.svg', alt: '', width: boyut || 40, height: boyut || 40, draggable: 'false' });
    img.addEventListener('error', rozet);
    kap.appendChild(img);
    return kap;
  }

  const VARSAYILAN_YERLER = [
    ['usta', 'Usta Çadırı'], ['komuta', 'Komuta Masası'], ['kronograf', 'Kronograf Odası'],
    ['tesis', 'Üssün Tesisleri'], ['gunluk', 'Kâşif Günlüğü'], ['iz', 'İz Sürme Masası'],
    ['harita', 'Harita Odası'], ['kisa', 'Kısa Sefer'], ['ayar', 'Teçhizat ve Ayarlar'],
    ['program', 'Okul Ders Programı'], ['geri', 'Geri Bildirim Gönder'], ['devret', 'Nöbeti Devret']
  ];
  const KISA_AD = { usta: 'Usta', komuta: 'Görevler', kronograf: 'Kronograf', tesis: 'Tesisler', gunluk: 'Günlük',
    iz: 'İz Sürme', harita: 'Atlas', kisa: 'Kısa Sefer', ayar: 'Ayarlar', program: 'Program', geri: 'Telsiz', devret: 'Devret' };

  // Motordan bagimsiz, yalniz OS'ta yasayan uygulamalar (olaylardan beslenir).
  const YEREL = [['arsiv', 'Arşiv'], ['posta', 'Posta']];
  KISA_AD.arsiv = 'Arşiv'; KISA_AD.posta = 'Posta';

  // ------------------------------------------------------------ durum
  const D = {
    mod: 'bos',        // bos | ana | app | gorev
    pano: null, ana: null,
    bekle: null,       // bekleyen girdi olayi
    aktif: null,       // canli denetim: {tur, n, sec(i), enter()}
    sonMenu: null, sonCoklu: null,
    tampon: null,      // pano sonrasi bekletilen metin olaylari
    uygAd: '',
    surum: '',         // Meridyen OS surumu (motor: pano.surum, rapor sayisindan turer)
    yeniYer: {},       // yeni acilan yerler (rihtimda "yeni" isareti, tiklaninca silinir)
    G: null            // gorev durumu
  };
  const tasiyici = window.OS_TASIYICI.sec(new URLSearchParams(location.search));

  // ------------------------------------------------------------ pencere yoneticisi
  const calisma = $('#calisma');
  const pencereler = {};
  let zSayac = 10;

  function pencereYap(id, baslik, govde, yer) {
    const bas = el('div', { sinif: 'pbaslik' },
      el('span', { sinif: 'ptitle', metin: baslik }),
      el('button', { sinif: 'pkapat', 'aria-label': 'Pencereyi gizle', metin: '×', onclick: () => gizle(id) }));
    const e = el('section', { sinif: 'pencere', 'data-id': id, role: 'dialog', 'aria-label': baslik }, bas, govde);
    e.style.left = yer.x + '%'; e.style.top = yer.y + '%'; e.style.width = yer.w + '%'; e.style.height = yer.h + '%';
    e.addEventListener('pointerdown', () => onde(id));
    surukle(e, bas);
    calisma.appendChild(e);
    const p = { id, el: e, bas, baslikEl: $('.ptitle', bas), govde, gizli: true, var: false };
    e.hidden = true;
    pencereler[id] = p;
    return p;
  }
  function surukle(e, tutac) {
    tutac.addEventListener('pointerdown', (ev) => {
      if (dar() || ev.target.closest('button')) return;
      const k = calisma.getBoundingClientRect(), r = e.getBoundingClientRect();
      const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
      tutac.setPointerCapture(ev.pointerId);
      const tasi = (m) => {
        const x = Math.min(Math.max(0, m.clientX - k.left - dx), k.width - 80);
        const y = Math.min(Math.max(0, m.clientY - k.top - dy), k.height - 44);
        e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = r.width + 'px'; e.style.height = r.height + 'px';
      };
      const bit = () => { tutac.removeEventListener('pointermove', tasi); tutac.removeEventListener('pointerup', bit); };
      tutac.addEventListener('pointermove', tasi); tutac.addEventListener('pointerup', bit);
    });
  }
  function onde(id) {
    const p = pencereler[id]; if (!p) return;
    zSayac++; p.el.style.zIndex = zSayac;
    Object.keys(pencereler).forEach((k) => pencereler[k].el.classList.toggle('onde', k === id));
    serit();
  }
  function goster(id) { const p = pencereler[id]; if (!p) return; p.var = true; p.gizli = false; p.el.hidden = false; onde(id); masaustu(); }
  function gizle(id) {
    const p = pencereler[id]; if (!p) return;
    p.gizli = true; p.el.hidden = true; p.el.classList.remove('onde');
    const acik = Object.keys(pencereler).filter((k) => !pencereler[k].gizli)
      .sort((a, b) => (Number(pencereler[a].el.style.zIndex) || 0) - (Number(pencereler[b].el.style.zIndex) || 0));
    if (acik.length) onde(acik[acik.length - 1]);
    serit(); masaustu();
  }
  function kaldir(id) { gizle(id); pencereler[id].var = false; serit(); }
  function masaustu() {
    const bos = Object.keys(pencereler).every((k) => pencereler[k].gizli);
    $('#masaustu').classList.toggle('on-plan', !bos);
  }
  function serit() {
    const s = $('#serit');
    const liste = Object.keys(pencereler).filter((k) => pencereler[k].var);
    s.hidden = liste.length === 0;
    s.textContent = '';
    liste.forEach((k) => {
      const p = pencereler[k];
      s.appendChild(el('button', {
        sinif: 'sekme' + (!p.gizli && p.el.classList.contains('onde') ? ' etkin' : '') + (p.gizli ? ' gizli' : ''),
        onclick: () => (p.gizli || !p.el.classList.contains('onde') ? goster(k) : gizle(k)),
        metin: p.baslikEl.textContent
      }));
    });
  }

  const konsolLog = el('div', { sinif: 'log', role: 'log', 'aria-live': 'polite' });
  const konsol = pencereYap('konsol', 'Konsol', el('div', { sinif: 'pgovde' }, konsolLog), { x: 2, y: 3, w: 48, h: 92 });
  const gorevGovde = el('div', { sinif: 'pgovde gorev' });
  const gorevPen = pencereYap('gorev', 'Görev', gorevGovde, { x: 6, y: 3, w: 88, h: 92 });
  const belgeGovde = el('div', { sinif: 'pgovde belge' });
  const belgePen = pencereYap('belge', 'Belge', belgeGovde, { x: 20, y: 8, w: 52, h: 80 });
  const atlasGovde = el('div', { sinif: 'pgovde atlas' });
  const atlasPen = pencereYap('atlas', 'Atlas', atlasGovde, { x: 3, y: 3, w: 94, h: 92 });
  let atlas = null, atlasHedef = null;
  function atlasAc(o) {
    if (!window.OS_ATLAS) { toast('hata', 'Atlas modülü yüklenemedi.', 'ATLAS'); return; }
    if (!atlas) atlas = window.OS_ATLAS.kur(atlasGovde, { el, yolHaritasi: atlasYolHaritasi });
    const hedef = o || atlasHedef; atlasHedef = null;
    goster('atlas');
    atlas.ac(hedef || {});
  }
  function atlasYolHaritasi() {
    const i = yerler.findIndex((y) => y.anahtar === 'harita');
    if (i >= 0 && D.mod === 'ana' && D.bekle && D.bekle.bicim === 'menu') { gizle('atlas'); dockSec(i); }
    else toast('bilgi', 'Üs yol haritası, ana ekrandayken (açık iş yokken) açılır.', 'ATLAS');
  }
  const arsivGovde = el('div', { sinif: 'pgovde arsiv' });
  const arsivPen = pencereYap('arsiv', 'Arşiv', arsivGovde, { x: 26, y: 5, w: 62, h: 88 });
  const postaGovde = el('div', { sinif: 'pgovde posta' });
  const postaPen = pencereYap('posta', 'Posta', postaGovde, { x: 34, y: 8, w: 60, h: 84 });
  let telsiz = null;
  if (window.OS_TELSIZ) {
    telsiz = window.OS_TELSIZ.kur({ el, pencereYap, goster, gizle, toast, pano: () => D.pano, geriBildirim: () => geriBildirimAc() });
  }
  function baslikYaz(p, b) { p.baslikEl.textContent = b; p.el.setAttribute('aria-label', b); }

  // ------------------------------------------------------------ metin olaylari -> DOM
  const RENK = { acik_sari: 'r-vurgu', sari: 'r-vurgu', acik_cam: 'r-cam', cam: 'r-cam', acik_mor: 'r-mor', mor: 'r-mor',
    gri: 'r-soluk', kirmizi: 'r-hata', acik_kirmizi: 'r-hata', yesil: 'r-basari', acik_yesil: 'r-basari',
    mavi: 'r-cam', acik_mavi: 'r-cam', beyaz: 'r-beyaz', kalin: 'r-kalin' };
  const renkSinif = (a) => (a || []).map((r) => RENK[r] || '').join(' ');
  function kaydir(log) { const k = log.closest('.akis, .pgovde'); if (k) k.scrollTop = k.scrollHeight; }

  function metinCiz(ev, log) {
    let n = null;
    switch (ev.t) {
      case 'yaz':
        if (!ev.metin) { n = el('div', { sinif: 'bosluk' }); break; }
        n = el('div', { sinif: 'satir ' + renkSinif(ev.renk), metin: (ev.tur === 'madde' ? '• ' : '') + ev.metin });
        if (ev.girinti) n.style.paddingLeft = Math.min(ev.girinti, 12) * 0.6 + 'em';
        break;
      case 'satir': n = el('div', { sinif: 'satir ham', metin: ev.metin || '' }); break;
      case 'baslik': n = el('h3', { sinif: 'baslik ' + renkSinif(ev.renk), metin: ev.metin }); break;
      case 'kutu':
        n = el('div', { sinif: 'kutu ' + renkSinif(ev.renk) },
          ev.etiket ? el('div', { sinif: 'etiket', metin: ev.etiket }) : null, el('div', { metin: ev.metin }));
        break;
      case 'iki_sutun':
        n = el('div', { sinif: 'iki' }, el('div', { metin: ev.sol || '' }), el('div', { metin: ev.sag || '' }));
        break;
      case 'ayrac': n = el('hr'); break;
      case 'bildirim': n = el('div', { sinif: 'satir not-' + ev.tur, metin: (ev.tur === 'basari' ? '✓ ' : ev.tur === 'hata' ? '✗ ' : 'ℹ ') + ev.metin }); break;
      case 'temizle': log.textContent = ''; return;
      default: return;
    }
    log.appendChild(n); kaydir(log);
  }
  const METIN_TURLERI = ['yaz', 'satir', 'baslik', 'kutu', 'iki_sutun', 'ayrac', 'bildirim', 'temizle'];

  // ------------------------------------------------------------ bildirimler
  function toast(tur, metin, etiket) {
    if (tasiyici.tekrar) return;            // tampon yeniden oynatilirken eski bildirimler gosterilmez
    const k = $('#bildirimler');
    const t = el('div', { sinif: 'toast t-' + tur, role: 'status', onclick: () => t.remove() },
      etiket ? el('div', { sinif: 'etiket', metin: etiket }) : null, el('div', { metin: metin }));
    k.appendChild(t);
    while (k.children.length > 4) k.firstChild.remove();
    setTimeout(() => t.remove(), tur === 'hata' ? 9000 : 6500);
  }
  function ortu(baslik, metin) {
    if (tasiyici.tekrar) return;
    const o = $('#ortu'), k = $('#ortu-kutu');
    k.className = ''; k.textContent = '';
    k.appendChild(el('div', { sinif: 'terfi-yildiz', metin: '★' }));
    k.appendChild(el('h2', { metin: baslik }));
    k.appendChild(el('p', { metin: metin }));
    const tamam = el('button', { sinif: 'dugme birincil', metin: 'Tamam', onclick: () => { o.hidden = true; } });
    k.appendChild(tamam); o.hidden = false; tamam.focus();
  }

  // ------------------------------------------------------------ durum cubugu
  function surumYaz(s) {
    D.surum = s || D.surum;
    const e = $('#d-surum'); if (!e) return;
    e.textContent = D.surum ? D.surum : '';
    e.hidden = !D.surum;
    e.title = D.surum ? 'Meridyen OS ' + D.surum + ': görev raporladıkça yeni yerler yüklenir.' : '';
  }
  function panoCiz(p) {
    if (p.surum) {
      const k = sisYukle();
      if (!k.bekleyen.length) { k.surum = p.surum; sisKaydet(); surumYaz(p.surum); }
      else surumYaz(k.surum || '');
    }
    const kim = $('#d-kimlik'); kim.textContent = '';
    kim.append(el('b', { metin: p.oyuncu || 'Kâşif' }), el('span', { sinif: 'rutbe', metin: p.rutbe || '', title: p.sonraki_rutbe ? 'Sıradaki rütbe: ' + p.sonraki_rutbe : '' }));
    const k = $('#d-kaynak'); k.textContent = '';
    const ad = p.kaynak_adlari || {};
    Object.keys(p.kaynaklar || {}).forEach((kod) => {
      k.appendChild(el('span', { sinif: 'cip' }, el('span', { sinif: 'soluk', metin: (ad[kod] || kod) + ' ' }), el('b', { metin: String(p.kaynaklar[kod]) })));
    });
    const b = $('#d-bolum'); b.textContent = '';
    const il = p.ilerleme || [0, 0], yuzde = il[1] ? Math.min(100, Math.round(il[0] / il[1] * 100)) : 0;
    b.append(el('span', { sinif: 'bolum-ad', metin: p.bolum || '' }),
      el('span', { sinif: 'ilerleme', role: 'progressbar', 'aria-valuenow': yuzde, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        el('i', { style: 'width:' + yuzde + '%' })),
      el('span', { sinif: 'soluk', metin: il[0] + '/' + il[1] }));
    if (p.zorluk_adi) b.appendChild(el('span', { sinif: 'cip kucuk', metin: p.zorluk_adi }));
  }

  // ------------------------------------------------------------ rihtim (dock)
  const dock = $('#dock');
  let yerler = VARSAYILAN_YERLER.map((y) => ({ anahtar: y[0], ad: y[1] })), kilitli = [];
  function dockCiz() {
    dock.textContent = '';
    const menuda = D.mod === 'ana' && D.bekle && D.bekle.bicim === 'menu';
    yerler.forEach((y, i) => {
      if (bekliyorMu(y.anahtar)) {
        dock.appendChild(el('button', { sinif: 'simge kilit', 'aria-label': y.ad + ' (güncellemeyle gelir)', title: 'Meridyen OS güncellemesiyle gelir',
          'data-anahtar': y.anahtar, onclick: () => sistemAc() },
          simge(y.anahtar, y.ad), el('span', { sinif: 'ad', metin: KISA_AD[y.anahtar] || y.ad }), el('span', { sinif: 'bdg yeni', metin: 'yükle' })));
        return;
      }
      const atl = y.anahtar === 'harita', tel = y.anahtar === 'geri';
      dock.appendChild(el('button', { sinif: 'simge' + (menuda || atl || tel ? '' : ' pasif'), title: atl ? 'Atlas: dünya, Türkiye, şehir, bölge ve tarih haritaları' : tel ? 'Telsiz: sınıf, okul, öğretmen ve arkadaşlarınla yaz; geliştiriciye geri bildirim gönder' : (y.aciklama || y.ad),
        'aria-label': atl ? 'Atlas' : tel ? 'Telsiz' : y.ad, 'data-anahtar': y.anahtar, onclick: () => (atl ? atlasAc() : tel ? telsizAc() : dockSec(i)) },
        simge(y.anahtar, atl ? 'Atlas' : y.ad), el('span', { sinif: 'ad', metin: KISA_AD[y.anahtar] || y.ad }),
        D.yeniYer[y.anahtar] ? el('span', { sinif: 'bdg yeni', metin: 'yeni' }) : null));
    });
    YEREL.forEach((y) => {
      const k = y[0] === 'posta' ? okunmamisSay() : 0;
      dock.appendChild(el('button', { sinif: 'simge yerel', title: y[1], 'aria-label': y[1] + (k ? ' (' + k + ' okunmamış)' : ''),
        'data-anahtar': y[0], onclick: () => yerelAc(y[0]) },
        simge(y[0], y[1]), el('span', { sinif: 'ad', metin: y[1] }),
        k ? el('span', { sinif: 'bdg', metin: String(k) }) : null));
    });
    kilitli.forEach((y) => {
      dock.appendChild(el('button', { sinif: 'simge kilit', 'aria-label': y.ad + ' (kilitli)', title: y.esik != null ? y.esik + ' görev raporlayınca açılır' : 'Görev raporladıkça açılır',
        onclick: () => toast('bilgi', y.ad + ': ' + (y.esik != null ? y.esik + ' görev raporlayınca açılır.' : 'görev raporladıkça açılır.'), 'KİLİTLİ') },
        simge('kilit', y.ad), el('span', { sinif: 'ad', metin: KISA_AD[y.anahtar] || y.ad })));
    });
  }
  function yerelAc(ad) {
    if (ad === 'arsiv') { arsivCiz(); goster('arsiv'); }
    else if (ad === 'posta') { postaCiz(); goster('posta'); }
  }
  // Telsiz her zaman acilir (menu bekleme kosulu yok): sunucuyla konusur, motoru beklemez.
  function telsizAc() { if (telsiz) telsiz.ac(); }
  // Geliştiriciye kanali: motorun mevcut "Geri Bildirim Gönder" yerini açar.
  function geriBildirimAc() {
    const i = yerler.findIndex((y) => y.anahtar === 'geri');
    if (i >= 0) dockSec(i);
  }
  function dockSec(i) {
    if (yerler[i] && bekliyorMu(yerler[i].anahtar)) { sistemAc(); return; }
    if (!(D.mod === 'ana' && D.bekle && D.bekle.bicim === 'menu')) {
      toast('bilgi', 'Önce açık olan işi bitir ya da Nöbeti Devret.', 'MEŞGUL'); return;
    }
    D.uygAd = yerler[i].ad;
    delete D.yeniYer[yerler[i].anahtar];
    gonder(String(i + 1));
  }

  function masaKarti(ana) {
    $('#m-alt').textContent = 'Bir uygulama seç: rıhtımdaki simgeler üssün yerleridir.';
    const h = $('#m-hedef'), kis = $('#m-kisisel'), hab = $('#m-haber');
    h.hidden = !ana.gunun_hedefi; h.textContent = ana.gunun_hedefi || '';
    kis.hidden = !ana.kisisel; kis.textContent = ana.kisisel || '';
    hab.hidden = !ana.haber; hab.textContent = '';
    if (ana.haber) hab.append(el('div', { sinif: 'etiket', metin: 'ÜSTEN HABER' }), el('div', { metin: ana.haber }));
  }

  // ------------------------------------------------------------ girdi gonderme
  function girdiKapat(metin) {
    $('#ortu').hidden = true;
    if (!belgePen.gizli) gizle('belge');
    D.bekle = null; D.aktif = null;
    document.querySelectorAll('.girdi-kutusu').forEach((g) => {
      if (metin == null) { g.remove(); return; }
      g.replaceWith(el('div', { sinif: 'yanki', metin: '› ' + (metin === '' ? '(Enter)' : metin) }));
    });
    if (D.mod === 'ana') { D.mod = 'app'; konsolHazirla(D.uygAd || 'Konsol'); }
    dockCiz();
  }
  function gonder(metin) {
    if (!D.bekle) return;
    girdiKapat(metin);
    tasiyici.girdiGonder(metin);
  }

  function girdiCiz(hedef, g) {
    const kutu = el('div', { sinif: 'girdi-kutusu' });
    const bicim = g.bicim || 'metin';
    const istem = (g.istem || '').replace(/\s+/g, ' ').trim();
    if (bicim === 'menu' && D.sonMenu) {
      const m = D.sonMenu;
      if (m.baslik) kutu.appendChild(el('div', { sinif: 'menu-baslik', metin: m.baslik }));
      const liste = el('div', { sinif: 'secenekler' });
      (m.secenekler || []).forEach((s, i) => {
        liste.appendChild(el('button', { sinif: 'dugme secenek', onclick: () => gonder(String(i + 1)) },
          el('span', { sinif: 'no', metin: String(i + 1) }),
          el('span', { sinif: 'sm' }, el('b', { metin: secenekMetni(s) }), secenekAciklama(s) ? el('small', { metin: secenekAciklama(s) }) : null)));
      });
      kutu.appendChild(liste);
      if (m.ipucu) kutu.appendChild(el('div', { sinif: 'soluk kucuk', metin: m.ipucu }));
      D.aktif = { tur: 'menu', n: (m.secenekler || []).length, sec: (i) => gonder(String(i + 1)) };
      if (m.gizli_var) kutu.appendChild(metinKutusu('Yazarak seç', 'Gönder', gonder));
    } else if (bicim === 'coklu' && D.sonCoklu) {
      const m = D.sonCoklu, kutular = [];
      if (m.baslik) kutu.appendChild(el('div', { sinif: 'menu-baslik', metin: m.baslik }));
      const liste = el('div', { sinif: 'secenekler' });
      (m.secenekler || []).forEach((s, i) => {
        const cb = el('input', { type: 'checkbox', id: 'cb' + i });
        kutular.push(cb);
        liste.appendChild(el('label', { sinif: 'dugme secenek onay', 'for': 'cb' + i }, cb,
          el('span', { sinif: 'sm' }, el('b', { metin: secenekMetni(s) }), secenekAciklama(s) ? el('small', { metin: secenekAciklama(s) }) : null)));
      });
      kutu.appendChild(liste);
      const yolla = () => gonder(kutular.map((c, i) => c.checked ? String(i + 1) : '').filter(Boolean).join(','));
      const ipucu = [m.ipucu, (m.en_az != null || m.en_cok != null) ? ('En az ' + (m.en_az || 0) + ', en çok ' + (m.en_cok || (m.secenekler || []).length) + ' seçim.') : ''].filter(Boolean).join(' ');
      if (ipucu) kutu.appendChild(el('div', { sinif: 'soluk kucuk', metin: ipucu }));
      kutu.appendChild(el('button', { sinif: 'dugme birincil', metin: 'Seçimi gönder', onclick: yolla }));
      D.aktif = { tur: 'coklu', enter: yolla };
    } else if (bicim === 'onay') {
      if (istem) kutu.appendChild(el('div', { sinif: 'istem', metin: istem.replace(/\s*\[[eEhH]\/[eEhH]\]\s*$/, '') }));
      const ev = el('button', { sinif: 'dugme birincil', metin: 'Evet', onclick: () => gonder('e') });
      kutu.appendChild(el('div', { sinif: 'dugme-sira' }, ev, el('button', { sinif: 'dugme', metin: 'Hayır', onclick: () => gonder('h') })));
      D.aktif = { tur: 'onay', n: 2, sec: (i) => gonder(i === 0 ? 'e' : 'h'), enter: () => gonder('') };
      setTimeout(() => ev.focus({ preventScroll: true }), 0);
    } else if (bicim === 'bekle') {
      const bt = el('button', { sinif: 'dugme birincil genis', metin: 'Devam  ⏎', onclick: () => gonder('') });
      kutu.appendChild(bt);
      D.aktif = { tur: 'bekle', enter: () => gonder('') };
      setTimeout(() => bt.focus({ preventScroll: true }), 0);
    } else {
      kutu.appendChild(metinKutusu(istem || 'Cevabın', 'Gönder', gonder, g.varsayilan));
      D.aktif = { tur: 'metin' };
    }
    hedef.appendChild(kutu);
    const ust = hedef.closest('.akis, .pgovde'); if (ust) ust.scrollTop = ust.scrollHeight;
    return kutu;
  }
  function metinKutusu(etiket, dugmeAd, yolla, varsayilan) {
    const inp = el('input', { type: 'text', sinif: 'metin', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      placeholder: varsayilan ? ('Boş bırakırsan: ' + varsayilan) : '', 'aria-label': etiket });
    const git = () => yolla(inp.value.trim());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); git(); } });
    const k = el('div', { sinif: 'metin-satir' }, el('label', { sinif: 'istem', metin: etiket }),
      el('div', { sinif: 'dugme-sira' }, inp, el('button', { sinif: 'dugme birincil', metin: dugmeAd, onclick: git })));
    if (!dar()) setTimeout(() => inp.focus({ preventScroll: true }), 0);
    return k;
  }

  // ------------------------------------------------------------ belge (genel)
  function belgeAc(ust, baslik, metin) {
    belgeGovde.textContent = '';
    belgeGovde.append(el('div', { sinif: 'etiket', metin: ust }), el('h2', { metin: baslik || 'Belge' }),
      el('div', { sinif: 'belge-metin', metin: metin || '' }));
    baslikYaz(belgePen, 'Belge · ' + (baslik || ust));
    goster('belge');
  }

  // ------------------------------------------------------------ Arsiv (dosya gezgini)
  // Veri motordan gelir (arsiv ve arsiv_ekle baglamlari; kayit Durum.arsiv'de durur).
  // Klasorler: Dersler / <ders> / <gorev basligi> / <kanit>, Raporlar, Gunluk / <gun>.
  const A = { kayit: [], gunluk: [], yol: [] };
  const anahtarOf = (k) => [k.tur, k.ders, k.baslik, k.etiket].join('|');
  const tr = (a, b) => String(a).localeCompare(String(b), 'tr');
  function arsivEkle(k) {
    if (!k || typeof k !== 'object') return;
    const a = anahtarOf(k), i = A.kayit.findIndex((x) => anahtarOf(x) === a);
    if (i >= 0) A.kayit[i] = k; else A.kayit.push(k);
    arsivYenile();
  }
  function arsivYenile() {
    if (!arsivPen.gizli) arsivCiz();
    if (!postaPen.gizli) postaCiz();
    dockCiz();
  }
  const SVG_KLASOR = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const SVG_DOSYA = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  function gunlukGunleri() {
    const gun = {};
    A.gunluk.forEach((s) => {
      const m = /^\[(\d\d\.\d\d) (\d\d:\d\d)\]\s*(.*)$/.exec(s);
      const g = m ? m[1] : 'Tarihsiz';
      (gun[g] = gun[g] || []).push(m ? m[2] + '  ' + m[3] : s);
    });
    return Object.keys(gun).reverse().map((g) => ({ gun: g, satirlar: gun[g] }));
  }
  function arsivOgeleri(yol) {
    const kanit = A.kayit.filter((k) => k.tur === 'kanit');
    const rapor = A.kayit.filter((k) => k.tur === 'rapor' || k.tur === 'karne').reverse();
    const gunler = gunlukGunleri();
    const say = (n) => n + (n === 1 ? ' öğe' : ' öğe');
    if (!yol.length) {
      return [
        { tur: 'klasor', ad: 'Dersler', alt: say(kanit.length), git: ['Dersler'] },
        { tur: 'klasor', ad: 'Raporlar', alt: say(rapor.length), git: ['Raporlar'] },
        { tur: 'klasor', ad: 'Günlük', alt: say(gunler.length) + ' (gün)', git: ['Günlük'] }];
    }
    if (yol[0] === 'Dersler') {
      const ders = kanit.filter((k) => yol.length < 2 || (k.ders || 'Diğer') === yol[1]);
      if (yol.length === 1 || yol.length === 2) {
        const alan = yol.length === 1 ? 'ders' : 'baslik', sayac = {};
        ders.forEach((k) => { const a = alan === 'ders' ? (k.ders || 'Diğer') : (k.baslik || 'Görev'); sayac[a] = (sayac[a] || 0) + 1; });
        return Object.keys(sayac).sort(tr).map((a) => ({ tur: 'klasor', ad: a, alt: say(sayac[a]) + (alan === 'ders' ? '' : ' kanıt'), git: yol.concat([a]) }));
      }
      return ders.filter((k) => (k.baslik || 'Görev') === yol[2]).map((k) => ({
        tur: 'dosya', ad: k.etiket || 'Kanıt', alt: k.tarih || '', ac: () => belgeAc('KANIT · ' + (k.ders || ''), (k.baslik || 'Görev') + ' · ' + (k.etiket || 'Kanıt'), k.metin) }));
    }
    if (yol[0] === 'Raporlar') {
      return rapor.map((k) => ({ tur: 'dosya', ad: (k.tur === 'karne' ? 'Karne · ' : '') + (k.baslik || 'Rapor'),
        alt: [k.ders, k.tarih].filter(Boolean).join(' · '),
        ac: () => belgeAc(k.tur === 'karne' ? 'KARNE' : 'GÖREV RAPORU', k.baslik || 'Rapor', (k.ders ? k.ders + '\n' : '') + (k.metin || '')) }));
    }
    if (yol[0] === 'Günlük') {
      return gunler.map((g) => ({ tur: 'dosya', ad: g.gun, alt: g.satirlar.length + ' kayıt',
        ac: () => belgeAc('KÂŞİF GÜNLÜĞÜ', g.gun, g.satirlar.join('\n')) }));
    }
    return [];
  }
  function arsivCiz() {
    const yol = A.yol, g = arsivGovde;
    g.textContent = '';
    const yukari = el('button', { sinif: 'dugme kucuk-d', metin: '‹ Yukarı', disabled: !yol.length, 'aria-label': 'Üst klasöre çık',
      onclick: () => { A.yol = A.yol.slice(0, -1); arsivCiz(); } });
    const kirinti = el('nav', { sinif: 'kirinti', 'aria-label': 'Konum' });
    kirinti.appendChild(el('button', { sinif: 'kir', metin: 'Arşiv', onclick: () => { A.yol = []; arsivCiz(); } }));
    yol.forEach((p, i) => {
      kirinti.append(el('span', { sinif: 'soluk', metin: '›' }),
        el('button', { sinif: 'kir', metin: p, onclick: () => { A.yol = A.yol.slice(0, i + 1); arsivCiz(); } }));
    });
    g.appendChild(el('div', { sinif: 'ar-bar' }, yukari, kirinti));
    const ogeler = arsivOgeleri(yol);
    const liste = el('div', { sinif: 'ar-liste', role: 'list' });
    ogeler.forEach((o) => {
      const dugme = el('button', { sinif: 'oge ' + o.tur, role: 'listitem',
        onclick: () => { if (o.tur === 'klasor') { A.yol = o.git; arsivCiz(); } else o.ac(); } },
        el('span', { sinif: 'oge-ik', html: o.tur === 'klasor' ? SVG_KLASOR : SVG_DOSYA }),
        el('span', { sinif: 'sm' }, el('b', { metin: o.ad }), o.alt ? el('small', { metin: o.alt }) : null));
      liste.appendChild(dugme);
    });
    if (!ogeler.length) {
      liste.appendChild(el('div', { sinif: 'bos-not soluk', metin: yol[0] === 'Günlük'
        ? 'Günlükte henüz kayıt yok.' : 'Burada henüz dosya yok. Kanıt açtıkça ve görev raporladıkça dosyalar buraya düşer.' }));
    }
    g.appendChild(liste);
    g.appendChild(el('div', { sinif: 'ar-durum soluk', metin: ogeler.length + ' öğe' }));
  }

  // ------------------------------------------------------------ Posta
  // Iletiler arsivdeki tur=posta kayitlaridir (etiket: "<kategori>:<kimlik>").
  // Okundu bilgisi yalniz bu tarayicida (localStorage); depo erisilemezse bellekte kalir.
  const P = { secili: null };
  const OKUNAN_ANAHTAR = 'meridyen-os-posta-okunan';
  const okunan = new Set();
  try { JSON.parse(localStorage.getItem(OKUNAN_ANAHTAR) || '[]').forEach((a) => okunan.add(a)); } catch (e) { /* depo yok */ }
  function okunanKaydet() { try { localStorage.setItem(OKUNAN_ANAHTAR, JSON.stringify(Array.from(okunan).slice(-400))); } catch (e) { /* depo yok */ } }
  const postalar = () => A.kayit.filter((k) => k.tur === 'posta').reverse();
  const okunmamisSay = () => postalar().filter((k) => !okunan.has(anahtarOf(k))).length;
  const POSTA_ETIKET = { haber: 'ÜSTEN HABER', bildiri: 'ÖĞRETMEN', terfi: 'TERFİ', guncelleme: 'GÜNCELLEME' };
  const postaTur = (k) => POSTA_ETIKET[String(k.etiket || '').split(':')[0]] || 'POSTA';
  function postaOku(k) {
    P.secili = anahtarOf(k);
    if (!okunan.has(P.secili)) { okunan.add(P.secili); okunanKaydet(); dockCiz(); }
    postaCiz();
  }
  function postaCiz() {
    const g = postaGovde, liste = postalar();
    g.textContent = '';
    const secili = liste.find((k) => anahtarOf(k) === P.secili) || null;
    g.classList.toggle('detay-acik', !!secili);
    const sol = el('div', { sinif: 'po-liste', role: 'list', 'aria-label': 'Gelen kutusu' });
    sol.appendChild(el('div', { sinif: 'po-ust' },
      el('b', { metin: 'Gelen kutusu' }),
      el('span', { sinif: 'soluk', metin: okunmamisSay() ? okunmamisSay() + ' okunmamış' : 'hepsi okundu' })));
    liste.forEach((k) => {
      const oku = okunan.has(anahtarOf(k));
      sol.appendChild(el('button', { sinif: 'ileti' + (oku ? '' : ' okunmamis') + (secili && secili === k ? ' secili' : ''), role: 'listitem',
        onclick: () => postaOku(k) },
        el('span', { sinif: 'nokta-ok', 'aria-label': oku ? 'okundu' : 'okunmamış' }),
        el('span', { sinif: 'sm' }, el('small', { sinif: 'gonderen', metin: (k.ders || 'Üs') + ' · ' + postaTur(k) }),
          el('b', { metin: k.baslik || '(konu yok)' }), el('small', { metin: k.tarih || '' }))));
    });
    if (!liste.length) sol.appendChild(el('div', { sinif: 'bos-not soluk', metin: 'Posta kutun boş. Komutan, öğretmenin ve üs bilgisayarı buraya yazar.' }));
    const sag = el('div', { sinif: 'po-oku' });
    if (secili) {
      sag.append(el('button', { sinif: 'dugme kucuk-d geri-liste', metin: '‹ Gelen kutusu', onclick: () => { P.secili = null; postaCiz(); } }),
        el('div', { sinif: 'etiket', metin: postaTur(secili) }), el('h2', { metin: secili.baslik || '' }),
        el('div', { sinif: 'soluk', metin: 'Gönderen: ' + (secili.ders || 'Üs') + (secili.tarih ? '  ·  ' + secili.tarih : '') }),
        el('div', { sinif: 'belge-metin', metin: secili.metin || '' }));
    } else {
      sag.appendChild(el('div', { sinif: 'bos-not soluk', metin: liste.length ? 'Okumak için bir ileti seç.' : '' }));
    }
    g.append(sol, sag);
  }

  // ------------------------------------------------------------ Sistem: guncellemeler ve gorunum
  // Kullanici (5 Kasim 2026): "Sistem otomatik guncellenmesin. Guncellerken
  // yeni sekmeler aciliyor ama arayuz hic degismiyor. Bazi arayuzler cok
  // iyidir, bazilarindan kurtulmak istersin."
  //  * Motor yeni yer acinca bu artik GUNCELLEME HAZIR olarak bekler; ogrenci
  //    "Simdi yukle" ya da "Sonra" der. Isteyen Sistem'den otomatige alir.
  //  * Guncellemeler yeni gorunum getirebilir; hicbiri zorla gelmez ve ogrenci
  //    istedigi an eskisine doner.
  //  * Bekleyen yer kilitli DEGILDIR: rihtimda gorunur, tiklayinca Sistem acilir;
  //    yuklemek tek tik. Yani ilerleme hic durmaz (oyunun "kilit yok" ilkesi).
  // Kayit yalniz bu tarayicida (localStorage, oyuncu adina gore); depo yoksa
  // bellekte kalir ve eski davranis (her sey kurulu) bozulmaz.
  const GORUNUMLER = [
    { kod: 'klasik', ad: 'Klasik', aciklama: 'Gece mavisi ve pirinç. İlk günkü Meridyen OS.', esik: 0 },
    { kod: 'gunduz', ad: 'Gündüz', aciklama: 'Açık renk; aydınlık sınıfta ve projeksiyonda rahat okunur.', esik: 0 },
    { kod: 'sade', ad: 'Sade', aciklama: 'Siyah zemin, büyük yazı, yüksek karşıtlık, hareketsiz.', esik: 0 },
    { kod: 'cam', ad: 'Cam', aciklama: 'Saydam pencereler, yüzen rıhtım, yumuşak köşeler.', esik: 1 },
    { kod: 'karo', ad: 'Karo', aciklama: 'Düz renkli karolar, keskin köşeler, renkli pencere başlıkları.', esik: 3 }
  ];
  const SIS_ONEK = 'meridyen-os-sistem:';
  const S = { anahtar: '', kayit: null };
  function sisBos() { return { kurulu: null, bekleyen: [], bekSurum: '', surum: '', sayi: 0, mod: 'sor', gorunum: 'klasik', denendi: [] }; }
  function sisYukle() {
    const ad = (D.pano && D.pano.oyuncu) || 'kasif';
    if (S.kayit && S.anahtar === ad) return S.kayit;
    let k = null;
    try { k = JSON.parse(localStorage.getItem(SIS_ONEK + ad) || 'null'); } catch (e) { k = null; }
    S.anahtar = ad; S.kayit = Object.assign(sisBos(), k && typeof k === 'object' ? k : {});
    gorunumUygula(S.kayit.gorunum);
    return S.kayit;
  }
  function sisKaydet() { try { localStorage.setItem(SIS_ONEK + S.anahtar, JSON.stringify(S.kayit)); } catch (e) { /* depo yok */ } }
  function gorunumAcik(g, k) { return (k || sisYukle()).sayi >= g.esik; }
  function gorunumUygula(kod) {
    const g = GORUNUMLER.find((x) => x.kod === kod) || GORUNUMLER[0];
    if (g.kod === 'klasik') document.documentElement.removeAttribute('data-gorunum');
    else document.documentElement.setAttribute('data-gorunum', g.kod);
    const renk = getComputedStyle(document.documentElement).getPropertyValue('--zemin').trim();
    const m = document.querySelector('meta[name="theme-color"]'); if (m && renk) m.setAttribute('content', renk);
  }
  function bekliyorMu(anahtar) { const k = S.kayit; return !!(k && k.bekleyen.some((y) => y.anahtar === anahtar)); }
  // Motorun gonderdigi acik yerlerle kaydi karsilastirir. Ilk kez gorulen
  // oyuncuda (eski kayitlar dahil) hepsi kurulu sayilir: kimse bir sey kaybetmez.
  function sisYerleriDenetle(liste, surum, guncellemeMi) {
    const k = sisYukle();
    if (!k.kurulu) {
      if (guncellemeMi) {
        // Temel yerler henuz bilinmiyor (ana menu gelmedi): yalniz gelenleri beklet.
        liste.forEach((y) => { if (!k.bekleyen.some((b) => b.anahtar === y.anahtar)) k.bekleyen.push(y); });
        if (surum) k.bekSurum = surum;
        sisKaydet(); if (k.mod === 'otomatik') guncellemeYukle(); else guncellemeHazir();
        sistemDugmesi(); return;
      }
      const bek = k.bekleyen.map((y) => y.anahtar);
      k.kurulu = liste.map((y) => y.anahtar).filter((a) => bek.indexOf(a) < 0);
      if (!k.bekleyen.length) k.surum = surum || D.surum || '';
      sisKaydet(); sistemDugmesi(); return;
    }
    let yeni = false;
    liste.forEach((y) => {
      if (k.kurulu.indexOf(y.anahtar) < 0 && !k.bekleyen.some((b) => b.anahtar === y.anahtar)) {
        k.bekleyen.push({ anahtar: y.anahtar, ad: y.ad || y.anahtar }); yeni = true;
      }
    });
    if (surum && k.bekleyen.length) k.bekSurum = surum;
    sisKaydet();
    if (yeni && k.mod === 'otomatik') guncellemeYukle(); else if (yeni) guncellemeHazir();
    sistemDugmesi();
  }
  function sistemDugmesi() {
    const b = $('#d-sistem'); if (!b) return;
    const n = (S.kayit && S.kayit.bekleyen.length) || 0;
    b.classList.toggle('hazir', n > 0);
    b.textContent = n ? 'Güncelleme hazır' : 'Sistem';
    b.setAttribute('aria-label', n ? 'Sistem: güncelleme hazır' : 'Sistem: güncellemeler ve görünüm');
  }
  function guncellemeHazir() {
    const k = sisYukle();
    toast('haber', 'Meridyen OS ' + (k.bekSurum || 'güncellemesi') + ' hazır: ' + k.bekleyen.map((y) => y.ad).join(', ') +
      '. Yüklemek için üstteki "Güncelleme hazır" düğmesine bas.', 'GÜNCELLEME HAZIR');
  }
  function guncellemeYukle() {
    const k = sisYukle(); if (!k.bekleyen.length) return;
    const yeniler = k.bekleyen.slice(), oncekiSayi = k.sayi;
    k.kurulu = (k.kurulu || []).concat(yeniler.map((y) => y.anahtar));
    k.bekleyen = []; k.sayi += 1; if (k.bekSurum) k.surum = k.bekSurum; k.bekSurum = '';
    sisKaydet();
    guncellemeAnimasyonu({ surum: k.surum || D.surum, yerler: yeniler });
    sistemDugmesi(); dockCiz();
    const gelen = GORUNUMLER.filter((g) => g.esik > oncekiSayi && g.esik <= k.sayi);
    if (gelen.length) setTimeout(() => yeniGorunumSor(gelen[0]), 2800);
  }
  function yeniGorunumSor(g) {
    if (tasiyici.tekrar) return;
    const o = $('#ortu'), kk = $('#ortu-kutu');
    kk.className = ''; kk.textContent = '';
    const k = sisYukle();
    kk.append(el('div', { sinif: 'etiket', metin: 'YENİ GÖRÜNÜM' }), el('h2', { metin: g.ad }), el('p', { metin: g.aciklama }),
      el('p', { sinif: 'soluk', metin: 'İstemezsen hiçbir şey değişmez. Denersen ve beğenmezsen Sistem penceresinden istediğin an eskisine dönersin.' }),
      el('div', { sinif: 'sis-dugmeler' },
        el('button', { sinif: 'dugme birincil', metin: 'Dene', onclick: () => { gorunumSec(g.kod); o.hidden = true; toast('bilgi', 'Beğenmezsen: Sistem → Görünüm → ' + (GORUNUMLER.find((x) => x.kod === k.onceki) || GORUNUMLER[0]).ad, 'GÖRÜNÜM'); } }),
        el('button', { sinif: 'dugme', metin: 'Eskisi kalsın', onclick: () => { o.hidden = true; } })));
    o.hidden = false;
  }
  function gorunumSec(kod) {
    const k = sisYukle();
    if (k.gorunum !== kod) k.onceki = k.gorunum;
    k.gorunum = kod; if (k.denendi.indexOf(kod) < 0) k.denendi.push(kod);
    sisKaydet(); gorunumUygula(kod);
  }
  function sistemAc() {
    const k = sisYukle();
    const o = $('#ortu'), kk = $('#ortu-kutu');
    kk.className = 'sistem'; kk.textContent = '';
    kk.append(el('h2', { metin: 'Sistem' }), el('p', { sinif: 'soluk', metin: 'Meridyen OS ' + (k.surum || D.surum || '') }));
    // Guncellemeler
    const gb = el('div', { sinif: 'sis-bolum' }, el('h3', { metin: 'GÜNCELLEMELER' }));
    if (k.bekleyen.length) {
      gb.append(el('p', { metin: (k.bekSurum ? 'Sürüm ' + k.bekSurum + ' hazır. ' : 'Güncelleme hazır. ') + 'Gelenler: ' + k.bekleyen.map((y) => y.ad).join(', ') + '.' }),
        el('div', { sinif: 'sis-dugmeler' },
          el('button', { sinif: 'dugme birincil', metin: 'Şimdi yükle', onclick: () => { o.hidden = true; guncellemeYukle(); } }),
          el('button', { sinif: 'dugme', metin: 'Sonra', onclick: () => { o.hidden = true; } })));
    } else gb.append(el('p', { sinif: 'soluk', metin: 'Sistem güncel. Görev raporladıkça yeni güncellemeler gelir.' }));
    const modSec = (mod, baslik, acik) => {
      const r = el('input', { type: 'radio', name: 'sis-mod', value: mod });
      r.checked = k.mod === mod;
      r.addEventListener('change', () => { k.mod = mod; sisKaydet(); if (mod === 'otomatik' && k.bekleyen.length) { o.hidden = true; guncellemeYukle(); } });
      return el('label', { sinif: 'sis-secenek' }, r, el('span', {}, el('b', { metin: baslik }), el('br'), el('span', { sinif: 'soluk', metin: acik })));
    };
    gb.append(modSec('sor', 'Bana sor', 'Güncelleme gelince haber ver; ne zaman yükleyeceğime ben karar vereyim.'),
      modSec('otomatik', 'Otomatik yükle', 'Gelir gelmez yüklensin.'));
    // Gorunum
    const vb = el('div', { sinif: 'sis-bolum' }, el('h3', { metin: 'GÖRÜNÜM' }));
    GORUNUMLER.forEach((g) => {
      const acik = gorunumAcik(g, k);
      const r = el('input', { type: 'radio', name: 'sis-gorunum', value: g.kod, disabled: !acik });
      r.checked = k.gorunum === g.kod;
      r.addEventListener('change', () => gorunumSec(g.kod));
      const kalan = g.esik - k.sayi;
      vb.appendChild(el('label', { sinif: 'sis-secenek' + (acik ? '' : ' kapali') }, r, el('span', { sinif: 'sis-ornek o-' + g.kod }),
        el('span', {}, el('b', { metin: g.ad }), el('br'),
          el('span', { sinif: 'soluk', metin: acik ? g.aciklama : g.aciklama + ' ' + kalan + ' güncelleme sonra gelir.' }))));
    });
    kk.append(gb, vb, el('div', { sinif: 'sis-dugmeler' }, el('button', { sinif: 'dugme', metin: 'Kapat', onclick: () => { o.hidden = true; } })));
    o.hidden = false;
    const ilk = kk.querySelector('input:checked') || kk.querySelector('button'); if (ilk) ilk.focus();
  }

  // ------------------------------------------------------------ Surum guncellemesi
  // Motor `guncelleme` baglami gonderir (kademeli acilista yeni yer); bu bir
  // yazilim guncellemesi gibi gorunur. prefers-reduced-motion: animasyon yok.
  let guncelZaman = null;
  function guncellemeGoster(ev) {
    // Motor yeni yer acti: Sistem'e "hazir" olarak duser (ya da otomatik yuklenir).
    sisYerleriDenetle((ev.yerler || []).map((y) => ({ anahtar: y.anahtar, ad: y.ad || y.anahtar })), ev.surum, true);
  }
  function guncellemeAnimasyonu(ev) {
    surumYaz(ev.surum);
    const adlar = (ev.yerler || []).map((y) => y.ad || y.anahtar);
    (ev.yerler || []).forEach((y) => { D.yeniYer[y.anahtar] = true; });
    if (tasiyici.tekrar) return;
    const kutu = $('#guncelleme'); if (!kutu) return;
    const azalt = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    kutu.textContent = '';
    const cubuk = el('i', { style: 'width:' + (azalt ? '100' : '0') + '%' });
    const durum = el('div', { sinif: 'gu-durum', metin: azalt ? 'Meridyen OS ' + ev.surum + ' yüklendi' : 'Güncelleniyor…' });
    kutu.append(el('div', { sinif: 'etiket', metin: 'MERİDYEN OS GÜNCELLEMESİ' }),
      el('div', { sinif: 'gu-baslik', metin: 'Sürüm ' + ev.surum }), durum,
      el('span', { sinif: 'ilerleme', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, cubuk),
      el('div', { sinif: 'soluk', metin: adlar.join(', ') }));
    kutu.hidden = false;
    clearTimeout(guncelZaman);
    if (!azalt) {
      requestAnimationFrame(() => requestAnimationFrame(() => { cubuk.style.width = '100%'; }));
      guncelZaman = setTimeout(() => { durum.textContent = 'Meridyen OS ' + ev.surum + ' yüklendi'; }, 1200);
      guncelZaman = setTimeout(() => { kutu.hidden = true; }, 2600);
    } else {
      guncelZaman = setTimeout(() => { kutu.hidden = true; }, 2400);
    }
    toast('basari', 'Meridyen OS ' + ev.surum + ' güncellemesi: ' + adlar.join(', ') + ' yüklendi', 'GÜNCELLEME');
    dockCiz();
  }

  // ------------------------------------------------------------ konsol
  function konsolHazirla(baslik) {
    konsolLog.textContent = '';
    baslikYaz(konsol, baslik || 'Konsol');
    goster('konsol');
  }
  function konsolaYaz(ev) {
    if (konsol.gizli) goster('konsol');
    metinCiz(ev, konsolLog);
  }

  // ------------------------------------------------------------ gorev penceresi
  function gorevBaslat(ev) {
    atlasHedef = null;
    if (window.OS_ATLAS && ['tarih', 'inkilap', 'cografya'].indexOf(ev.ders) >= 0) {
      window.OS_ATLAS.hedefBul(ev).then((h) => { if (h && D.G && D.G.k === ev) atlasHedef = h; });   // dock'tan Atlas acilinca bu gorevin donemine gecer
    }
    const G = D.G = { k: ev, kanitlar: {}, adim: null, sonuc: null, bitti: null, sustur: true };
    D.mod = 'gorev';
    gizle('konsol');
    baslikYaz(gorevPen, ev.baslik ? 'Görev · ' + ev.baslik : 'Görev ' + (ev.kod || ''));
    gorevGovde.textContent = '';
    G.sol = el('div', { sinif: 'g-sol' });
    G.sag = el('div', { sinif: 'g-sag' });
    G.adimKart = el('div', { sinif: 'adim-kart' });
    G.feed = el('div', { sinif: 'log' });
    G.akis = el('div', { sinif: 'akis' }, G.feed);
    G.girdiAlan = el('div', { sinif: 'g-girdi' });
    G.hamLog = el('div', { sinif: 'log' });
    G.hamKutu = el('details', { sinif: 'ham-kutu', hidden: true }, el('summary', { metin: 'Ekranın düz metni' }), G.hamLog);
    G.sag.append(G.adimKart, G.hamKutu, G.akis, G.girdiAlan);
    gorevGovde.append(G.sol, G.sag);
    (ev.kanitlar || []).forEach((k) => { G.kanitlar[k.sira] = Object.assign({ icerik: null }, k); });
    gorevSolCiz(); gorevSagCiz();
    goster('gorev');
  }
  function gorevSolCiz() {
    const G = D.G, k = G.k;
    G.sol.textContent = '';
    G.sol.appendChild(el('div', { sinif: 'g-ust' },
      el('div', { sinif: 'g-kod', metin: (k.kod || '') + (k.asama ? '  ·  ' + ({ anlatim: 'Anlatım', birlikte: 'Birlikte', serbest: 'Serbest' }[k.asama] || k.asama) : '') }),
      el('h2', { metin: k.baslik || 'Görev' }),
      el('div', { sinif: 'soluk', metin: [k.ders_adi, k.konu, k.kademe ? 'Kademe ' + k.kademe : ''].filter(Boolean).join('  ·  ') })));
    if (k.brifing) G.sol.appendChild(el('div', { sinif: 'brifing' }, el('div', { sinif: 'etiket', metin: 'BRİFİNG' }), el('div', { metin: k.brifing })));
    const dosya = el('div', { sinif: 'dosyalar' });
    dosya.appendChild(el('div', { sinif: 'etiket', metin: 'KANIT DOSYALARI' }));
    const ks = Object.keys(G.kanitlar);
    if (!ks.length) dosya.appendChild(el('div', { sinif: 'soluk', metin: 'Bu görevde kanıt dosyası yok.' }));
    ks.forEach((s) => {
      const kn = G.kanitlar[s];
      const acik = kn.acik || kn.icerik != null;
      dosya.appendChild(el('button', { sinif: 'dosya' + (acik ? ' acik' : ''), onclick: () => kanitSec(kn) },
        el('span', { sinif: 'no', metin: String(kn.sira) }),
        el('span', { sinif: 'sm' }, el('b', { metin: kn.etiket || 'Kanıt' }),
          el('small', { metin: acik ? 'Açık' : (kn.bedel ? 'Açmak ' + kn.bedel + ' dikkat harcar' : 'Ücretsiz') }))));
    });
    G.sol.appendChild(dosya);
    if (['tarih', 'inkilap', 'cografya'].indexOf(k.ders) >= 0) {
      G.sol.appendChild(el('button', { sinif: 'dugme atlas-dugme', onclick: () => atlastaAc(k), metin: "Atlas'ta aç  ·  haritada gör" }));
    }
    const tavan = k.dikkat && typeof k.dikkat === 'object' ? k.dikkat.tavan : null;
    const kd = G.adim && G.adim.kalan_dikkat != null ? G.adim.kalan_dikkat : (k.dikkat && typeof k.dikkat === 'object' ? k.dikkat.kalan : k.dikkat);
    G.sol.appendChild(el('div', { sinif: 'dikkat', metin: 'Dikkat: ' + (kd != null ? kd : '—') + (tavan != null && kd != null ? ' / ' + tavan : '') }));
  }
  function atlastaAc(k) {
    if (!window.OS_ATLAS) { toast('hata', 'Atlas modülü yüklenemedi.', 'ATLAS'); return; }
    window.OS_ATLAS.hedefBul(k).then((h) => atlasAc(h || {}));
  }
  function kanitSec(kn) {
    if (!D.G) return;
    if (kn.icerik != null) { belgeGoster(kn); return; }
    if (D.bekle && /[iİ]ncele/i.test(D.bekle.istem || '')) { gonder(String(kn.sira)); return; }
    const kom = D.G.adim && D.G.adim.komutlar || [];
    if (kn.acik && D.bekle && kom.some((c) => c.tus === 'd')) { gonder('d'); return; }   // defter: açık kanıtları yeniden gösterir
    toast('bilgi', 'Bu dosyayı şu an açamazsın. İnceleme aşamasında açabilirsin.', 'KANIT');
  }
  function belgeGoster(kn) {
    belgeGovde.textContent = '';
    belgeGovde.append(el('div', { sinif: 'etiket', metin: 'KANIT ' + kn.sira }), el('h2', { metin: kn.etiket || 'Belge' }),
      el('div', { sinif: 'belge-metin', metin: kn.icerik || '' }));
    baslikYaz(belgePen, 'Belge · ' + (kn.etiket || kn.sira));
    goster('belge');
  }
  function gorevSagCiz() {
    const G = D.G, a = G.adim;
    G.adimKart.textContent = '';
    if (G.bitti) {
      const b = G.bitti;
      G.adimKart.append(el('div', { sinif: 'etiket', metin: b.birakildi ? 'GÖREV BIRAKILDI' : 'GÖREV RAPORU' }),
        el('div', { sinif: 'sonuc-puan', metin: (b.puan != null ? b.puan : '—') + ' / ' + (b.azami_puan != null ? b.azami_puan : '—') + ' puan' }),
        el('div', { sinif: 'yildiz', 'aria-label': (b.yildiz || 0) + ' yıldız', metin: '★'.repeat(b.yildiz || 0) + '☆'.repeat(Math.max(0, 3 - (b.yildiz || 0))) }),
        el('div', { sinif: 'soluk', metin: b.birakildi ? 'Görev şimdilik bırakıldı.' : (b.tamamlandi ? 'Görev tamamlandı.' : 'Görev bitti.') }));
      return;
    }
    if (!a) {
      G.adimKart.append(el('div', { sinif: 'etiket', metin: 'İNCELEME' }),
        el('div', { metin: 'Brifingi oku, kanıt dosyalarına bak; hazır olunca göreve başla.' }));
      return;
    }
    const bitmis = G.sonuc && G.sonuc.sira === a.sira && G.sonuc.dogru;
    G.adimKart.append(
      el('div', { sinif: 'etiket', metin: 'ADIM ' + a.sira + ' / ' + a.toplam + (G.sonuc && G.sonuc.sira === a.sira ? '  ·  ' + (G.sonuc.dogru ? 'DOĞRU' : 'YANLIŞ') : '') }),
      el('span', { sinif: 'ilerleme', role: 'progressbar', 'aria-valuenow': a.sira, 'aria-valuemax': a.toplam },
        el('i', { style: 'width:' + Math.round((a.sira - (bitmis ? 0 : 1)) / a.toplam * 100) + '%' })),
      el('div', { sinif: 'soru', metin: a.soru }));
  }

  function sagaKaydir(G) {
    setTimeout(() => {
      if (D.G !== G) return;
      if (dar()) G.sag.scrollIntoView({ block: 'start' }); else G.sag.scrollTop = 0;
    }, 0);
  }
  function gorevGirdi(g) {
    const G = D.G;
    G.sustur = false;
    const alan = G.girdiAlan; alan.textContent = '';
    const istem = (g.istem || '').replace(/\s+/g, ' ').trim();
    const bicim = g.bicim || 'metin';
    if (G.bitti) { girdiCiz(alan, g); return; }
    if (bicim === 'metin' && /[iİ]ncele/i.test(istem)) {
      alan.appendChild(el('div', { sinif: 'girdi-kutusu' }, el('div', { sinif: 'istem', metin: 'Soldaki dosyalardan birini aç ya da göreve başla.' }),
        el('div', { sinif: 'komutlar' },
          el('button', { sinif: 'dugme birincil', onclick: () => gonder(''), metin: 'Göreve başla' }),
          el('button', { sinif: 'dugme', onclick: () => gonder('b'), metin: 'Brifing' }),
          el('button', { sinif: 'dugme', onclick: () => gonder('d'), metin: 'Defter' }),
          el('button', { sinif: 'dugme', onclick: () => gonder('?'), metin: 'Yardım' }),
          el('button', { sinif: 'dugme tehlike', onclick: () => gonder('x'), metin: 'Bırak' }))));
      D.aktif = { tur: 'metin', enter: () => gonder('') };
      return;
    }
    if (bicim === 'metin' && G.adim) {
      const a = G.adim, kutu = el('div', { sinif: 'girdi-kutusu' });
      const sik = a.secenekler || [];
      if (a.tur === 'secim' && sik.length) {
        const liste = el('div', { sinif: 'secenekler' });
        sik.forEach((s, i) => liste.appendChild(el('button', { sinif: 'dugme secenek', onclick: () => gonder(String(i + 1)) },
          el('span', { sinif: 'no', metin: String(i + 1) }), el('span', { sinif: 'sm' }, el('b', { metin: secenekMetni(s) })))));
        kutu.appendChild(liste);
        D.aktif = { tur: 'menu', n: sik.length, sec: (i) => gonder(String(i + 1)) };
      } else if (a.tur === 'coklu' && sik.length) {
        // motor: "1,3,5" ya da hicbiri icin "yok"
        const kutular = [], liste = el('div', { sinif: 'secenekler' });
        sik.forEach((s, i) => {
          const cb = el('input', { type: 'checkbox', id: 'ac' + i });
          kutular.push(cb);
          liste.appendChild(el('label', { sinif: 'dugme secenek onay', 'for': 'ac' + i }, cb,
            el('span', { sinif: 'sm' }, el('b', { metin: (i + 1) + ') ' + secenekMetni(s) }))));
        });
        kutu.appendChild(el('div', { sinif: 'soluk kucuk', metin: 'Doğru olanların hepsini işaretle; hiçbiri doğru değilse boş bırakıp gönder.' }));
        kutu.appendChild(liste);
        const yolla = () => { const l = kutular.map((c, i) => c.checked ? String(i + 1) : '').filter(Boolean); gonder(l.length ? l.join(',') : 'yok'); };
        kutu.appendChild(el('button', { sinif: 'dugme birincil', metin: 'Seçimi gönder', onclick: yolla }));
        D.aktif = { tur: 'coklu', enter: yolla };
      } else if (a.tur === 'sirala' && sik.length) {
        // motor: butun ogelerin sirasi "3,1,4,2"
        const sira = [], liste = el('div', { sinif: 'secenekler' }), secili = el('div', { sinif: 'sirali-onizleme soluk' });
        const btn = [];
        const tazele = () => {
          secili.textContent = sira.length ? 'Sıran: ' + sira.join(' → ') : 'Öğelere sırayla dokun: ilk dokunduğun en başa gelir.';
          btn.forEach((b, i) => { b.disabled = sira.indexOf(i + 1) >= 0; });
          git.disabled = sira.length !== sik.length;
        };
        sik.forEach((s, i) => {
          const b = el('button', { sinif: 'dugme secenek', onclick: () => { sira.push(i + 1); tazele(); } },
            el('span', { sinif: 'no', metin: String(i + 1) }), el('span', { sinif: 'sm' }, el('b', { metin: secenekMetni(s) })));
          btn.push(b); liste.appendChild(b);
        });
        const git = el('button', { sinif: 'dugme birincil', metin: 'Sırayı gönder', onclick: () => gonder(sira.join(',')) });
        const sifir = el('button', { sinif: 'dugme', metin: 'Sıfırla', onclick: () => { sira.length = 0; tazele(); } });
        kutu.append(secili, liste, el('div', { sinif: 'dugme-sira' }, git, sifir));
        tazele();
        D.aktif = { tur: 'sirala', enter: () => { if (!git.disabled) gonder(sira.join(',')); } };
      } else {
        const sayi = a.tur === 'sayi', esl = a.tur === 'eslestir';
        if (esl && sik.length) {
          const l = el('div', { sinif: 'secenekler' });
          sik.forEach((s, i) => l.appendChild(el('div', { sinif: 'dugme secenek', role: 'listitem' }, el('span', { sinif: 'no', metin: String(i + 1) }), el('span', { sinif: 'sm' }, el('b', { metin: secenekMetni(s) })))));
          kutu.appendChild(l);
        }
        const yer = sayi ? 'Sayıyı yaz' : esl ? 'Eşleşmeler: 1a, 2c, 3b' : 'Cevabını yaz';
        const inp = el('input', { type: 'text', inputmode: sayi ? 'decimal' : 'text', sinif: 'metin', autocomplete: 'off', spellcheck: 'false',
          'aria-label': 'Cevabın', placeholder: yer });
        const git = () => { if (inp.value.trim()) gonder(inp.value.trim()); else toast('bilgi', 'Önce bir cevap yaz.', 'BOŞ'); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); git(); } });
        if (esl) kutu.appendChild(el('div', { sinif: 'soluk kucuk', metin: 'Her sayıyı bir harfle eşle, virgülle ayır (örnek: 1a, 2c, 3b).' }));
        kutu.appendChild(el('div', { sinif: 'dugme-sira' }, inp, a.birim ? el('span', { sinif: 'birim', metin: a.birim }) : null,
          el('button', { sinif: 'dugme birincil', onclick: git, metin: 'Cevapla' })));
        D.aktif = { tur: 'metin' };
        if (!dar()) setTimeout(() => inp.focus({ preventScroll: true }), 0);
      }
      const kom = el('div', { sinif: 'komutlar' });
      (a.komutlar || []).forEach((c) => kom.appendChild(el('button', { sinif: 'dugme kucuk-d' + (c.tus === 'x' ? ' tehlike' : ''), onclick: () => gonder(c.tus), title: 'Tuş: ' + c.tus },
        c.ad + ' ', el('kbd', { metin: c.tus }))));
      if (kom.children.length) kutu.appendChild(kom);
      alan.appendChild(kutu);
      sagaKaydir(G);
      return;
    }
    girdiCiz(alan, g);
  }

  // ------------------------------------------------------------ olay yonlendirme
  function bagla(ev) {
    switch (ev.ad) {
      case 'pano':
        D.pano = ev; panoCiz(ev);
        if (D.mod === 'gorev' && D.G && D.G.bitti) bitiGorevKapat();
        else if (D.mod !== 'gorev') D.tampon = [];
        break;
      case 'ana_menu':
        D.tampon = null; D.mod = 'ana'; D.ana = ev; D.G = null;
        ['gorev', 'belge', 'konsol'].forEach(kaldir);
        yerler = (ev.yerler || []).slice(); kilitli = (ev.kilitli || []).slice();
        sisYerleriDenetle(yerler, D.pano && D.pano.surum);
        masaKarti(ev); dockCiz();
        break;
      case 'uygulama': break;
      case 'arsiv': A.kayit = (ev.kayitlar || []).filter((k) => k && typeof k === 'object'); A.gunluk = ev.gunluk || []; arsivYenile(); break;
      case 'arsiv_ekle': arsivEkle(ev); break;
      case 'guncelleme': guncellemeGoster(ev); break;
      case 'gorev_basla': tamponuBosalt(true); gorevBaslat(ev); break;
      case 'kanit': {
        const G = D.G; if (!G) break;
        const kn = G.kanitlar[ev.sira] || (G.kanitlar[ev.sira] = { sira: ev.sira });
        kn.icerik = ev.icerik; kn.etiket = ev.etiket || kn.etiket; kn.acik = true;
        gorevSolCiz(); belgeGoster(kn);
        break;
      }
      case 'adim': {
        const G = D.G; if (!G) break;
        G.adim = ev; G.sonuc = null; G.sustur = true;
        G.feed.textContent = ''; G.hamLog.textContent = ''; G.hamKutu.hidden = true;
        gorevSolCiz(); gorevSagCiz();
        sagaKaydir(G);
        break;
      }
      case 'adim_sonuc': {
        const G = D.G; if (!G) break;
        G.sonuc = ev; gorevSagCiz();
        toast(ev.dogru ? 'basari' : 'hata', ev.dogru ? 'Doğru cevap. +' + (ev.puan || 0) + ' puan' : 'Bu cevap tutmadı. Deneme: ' + (ev.deneme || 1), 'ADIM ' + ev.sira);
        break;
      }
      case 'gorev_bitti': {
        const G = D.G; if (!G) break;
        G.bitti = ev; G.sustur = false; gorevSagCiz();
        break;
      }
      default: break;
    }
  }
  function bitiGorevKapat() {
    D.G = null; D.mod = 'app';
    kaldir('gorev'); kaldir('belge');
    konsolHazirla(D.uygAd || 'Konsol');
  }
  function tamponuBosalt(at) {
    const t = D.tampon; D.tampon = null;
    if (!t || at) return;
    t.forEach((ev) => metinYonlendir(ev));
  }

  function metinYonlendir(ev) {
    if (ev.t === 'bildirim') toast(ev.tur, ev.metin);
    if (D.mod === 'ana') return;                 // masaustu kendi bilgisini baglamdan alir
    if (ev.t === 'kutu' && /ÜSTEN HABER/i.test(ev.etiket || '')) { toast('haber', ev.metin, 'ÜSTEN HABER'); return; }
    if (ev.t === 'kutu' && /TERF|RÜTBE/i.test(ev.etiket || '')) ortu(ev.etiket, ev.metin);
    if (D.mod === 'gorev' && D.G) {
      if (ev.t === 'temizle') return;
      if (D.G.sustur) { D.G.hamKutu.hidden = false; metinCiz(ev, D.G.hamLog); return; }
      metinCiz(ev, D.G.feed); return;
    }
    if (D.mod === 'bos') { D.mod = 'app'; konsolHazirla('Konsol'); }
    konsolaYaz(ev);
  }

  let ilkOlay = true;
  function olay(ev) {
    if (!ev || !ev.t) return;
    if (ilkOlay) { ilkOlay = false; if (ev.t !== 'sifirla') $('#m-alt').textContent = 'Üs bilgisayarı çalışıyor.'; }
    if (ev.t === 'sifirla') { sifirla(); return; }
    if (METIN_TURLERI.indexOf(ev.t) >= 0) {
      if (D.mod === 'gorev' && D.G && D.G.bitti && ev.t === 'temizle') { bitiGorevKapat(); return; }
      if (D.tampon && ev.t !== 'bildirim') { D.tampon.push(ev); return; }
      metinYonlendir(ev); return;
    }
    switch (ev.t) {
      case 'baglam': bagla(ev); return;
      case 'menu': case 'coklu':
        if (ev.t === 'menu') D.sonMenu = ev; else D.sonCoklu = ev;
        if (D.mod === 'gorev' && D.G && D.G.bitti) bitiGorevKapat();
        if (D.mod !== 'ana') tamponuBosalt(false);
        return;
      case 'girdi': girdiOlayi(ev); return;
      case 'girdi_alindi': if (D.bekle) girdiKapat(null); return;   // sunucu tamponu yeniden oynatilirken eski istekleri kapatir
      case 'bitti': toast('bilgi', 'Oyun kapandı.', 'OTURUM'); return;
      default: console.warn('Tanınmayan olay', ev);
    }
  }
  function girdiOlayi(g) {
    if (D.mod !== 'ana') tamponuBosalt(false);
    D.bekle = g;
    if (D.mod === 'ana' && g.bicim === 'menu') {
      D.aktif = { tur: 'menu', n: yerler.length, sec: dockSec };
      dockCiz(); return;
    }
    if (D.mod === 'ana') { D.mod = 'app'; konsolHazirla(D.uygAd || 'Konsol'); }
    if (D.mod === 'gorev' && D.G) { gorevGirdi(g); return; }
    if (D.mod === 'bos') { D.mod = 'app'; konsolHazirla('Konsol'); }
    if (konsol.gizli) goster('konsol');
    girdiCiz(konsolLog, g);
  }
  function sifirla() {
    D.mod = 'bos'; D.G = null; D.bekle = null; D.aktif = null; D.tampon = null;
    ['konsol', 'gorev', 'belge', 'arsiv', 'posta', 'atlas', 'telsiz'].forEach(kaldir);
    A.kayit = []; A.gunluk = []; A.yol = []; P.secili = null; D.yeniYer = {};
    S.kayit = null; S.anahtar = ''; sistemDugmesi();
    konsolLog.textContent = ''; $('#bildirimler').textContent = '';
    const gc = $('#guncelleme'); if (gc) gc.hidden = true;
    $('#m-hedef').hidden = $('#m-kisisel').hidden = $('#m-haber').hidden = true;
  }

  // ------------------------------------------------------------ klavye
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape') {
      if (!$('#ortu').hidden) { $('#ortu').hidden = true; return; }
      if (!belgePen.gizli) gizle('belge');
      return;
    }
    const tag = e.target && e.target.tagName;
    const yazi = (tag === 'INPUT' && e.target.type !== 'checkbox') || tag === 'TEXTAREA';
    if (yazi || !D.bekle || !D.aktif) return;
    if (/^[1-9]$/.test(e.key) && D.aktif.sec && Number(e.key) <= D.aktif.n) { e.preventDefault(); D.aktif.sec(Number(e.key) - 1); }
    else if (e.key === 'Enter' && D.aktif.enter && tag !== 'BUTTON') { e.preventDefault(); D.aktif.enter(); }
  });
  $('#ortu').addEventListener('click', (e) => { if (e.target.id === 'ortu') e.target.hidden = true; });

  // ------------------------------------------------------------ oynatici paneli (yalniz ornek)
  function oynaticiKur() {
    if (tasiyici.ad !== 'ornek') return;
    const o = $('#oynatici'); o.hidden = false;
    const cb = el('input', { type: 'checkbox', id: 'oto' });
    cb.checked = !!tasiyici.ayar.otomatik;
    cb.addEventListener('change', () => tasiyici.otomatigiAyarla(cb.checked));
    o.append(el('span', { sinif: 'soluk', metin: 'Örnek oynatıcı' }), el('label', { 'for': 'oto', sinif: 'oto' }, cb, ' Otomatik oynat'),
      el('button', { sinif: 'dugme kucuk-d', onclick: () => tasiyici.basaSar(), metin: 'Baştan' }));
  }

  // ------------------------------------------------------------ baslat
  window.addEventListener('error', (e) => { document.documentElement.setAttribute('data-js-hata', String(e.message)); });
  tasiyici.olayDinle(olay);
  tasiyici.durumDinle((m) => { if (m) $('#m-alt').textContent = m; });
  tasiyici.otomatik = (metin) => gonder(metin);
  surumYaz(''); dockCiz(); oynaticiKur(); masaustu();
  (function () { const b = $('#d-sistem'); if (b) b.addEventListener('click', sistemAc); sisYukle(); sistemDugmesi(); })();
  // Sinama/ekran goruntusu kolayligi: ?ac=arsiv|posta (ve ?yol=Dersler/Fizik) sayfa acilinca uygulamayi acar.
  (function () {
    const q = new URLSearchParams(location.search), ac = q.get('ac');
    if (ac === 'atlas') {
      const o = { katman: q.get('katman') || 'dunya' };
      if (q.get('donem')) o.donem = q.get('donem');
      if (q.get('il')) o.il = +q.get('il');
      setTimeout(() => atlasAc(o), 3500); setTimeout(() => atlasAc(o), 7000); return;
    }
    if (ac !== 'arsiv' && ac !== 'posta' && ac !== 'telsiz') return;
    // Yalniz ornek oynaticida: Telsiz'i sinif sunucusuyla denemek icin sahte pano kimligi
    // (?telsiz_sunucu=&telsiz_kod=&telsiz_kimlik=&telsiz_takma=&telsiz_sec=&telsiz_anahtar=).
    if (tasiyici.ad === 'ornek' && q.get('telsiz_sunucu')) {
      D.pano = Object.assign({}, D.pano || {}, { telsiz: { sunucu: q.get('telsiz_sunucu'), kod: q.get('telsiz_kod') || '', kimlik: q.get('telsiz_kimlik') || '', takma: q.get('telsiz_takma') || '' } });
      if (telsiz) telsiz.dene({ sec: q.get('telsiz_sec'), anahtar: q.get('telsiz_anahtar') });
    }
    if (q.get('yol')) A.yol = q.get('yol').split('/').filter(Boolean);
    setTimeout(() => (ac === 'telsiz' ? telsizAc() : yerelAc(ac)), 600);
  })();
  window.__os = { D, olay, gonder, tasiyici, A, P, atlasAc, telsiz, S, sistemAc, guncellemeYukle, gorunumSec };
  tasiyici.baslat();
})();
