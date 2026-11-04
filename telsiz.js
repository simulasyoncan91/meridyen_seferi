// Meridyen OS - Telsiz uygulamasi. Sunucu tarafi: araclar/telsiz.py (/telsiz/... uclari).
// os.js'ten ONCE yuklenir; os.js `OS_TELSIZ.kur(api)` ile baglar. Burasi yalniz
// GOSTERIR: suzgec, hiz siniri, saklama ve yetki kurallari sunucudadir.
// Guvenlik notlari:
//  * Mesajlar yalniz textContent ile yazilir (ham HTML yok).
//  * Ogretmen anahtari yalniz bellekte tutulur (depoya yazilmaz).
//  * Sunucuya gercek ad degil, motorun verdigi tuzlu ozet (pano.telsiz.kimlik) gider.
(function () {
  'use strict';

  const YOKLAMA_MS = 3000;
  const NEDEN = {
    sinif_yok: 'Sınıf kodu sunucuda bulunamadı.', kimlik_yok: 'Kimlik geçersiz.', sinif_dolu: 'Sınıf dolu.',
    kanal_yok: 'Bu kanal artık yok.', serbest_kapali: 'Öğretmen şu an yalnız hazır mesajlara izin veriyor.',
    cok_hizli: 'Biraz yavaş: birazdan tekrar dene.', suzuldu: 'Bu mesaj gönderilemez.', tekrar: 'Aynı mesajı yeni gönderdin.',
    ozel_kapali: 'Öğretmen özel kanal açmayı şu an kapattı.', hak_doldu: 'Özel kanal hakkın doldu. Birini kapat.',
    cok_kanal: 'Çok fazla kanaldasın.', bulunamadi: 'Bu numarada açık bir kanal yok.', kanal_dolu: 'Kanal dolu.',
    cok_deneme: 'Çok fazla yanlış numara denedin. Bir dakika bekle.', yetki_yok: 'Buna yetkin yok.',
    telsiz_kapali: 'Bu sunucuda Telsiz kapalı.'
  };

  function kur(api) {
    const el = api.el;
    const T = {
      kanallar: [], ben: '', ayar: { serbest: true, ozel_acik: true }, hak: { acilan: 0, azami: 3 }, hazir: [], azamiBoy: 200,
      secili: 'gelistirici', mesajlar: [], son: -1, uyari: '', zaman: null, hata: '', yukleniyor: false,
      ogr: null,       // ogretmen kipi: { anahtar, kanallar, bildirilen, ... }
      gorunum: 'kanal' // kanal | bildirilen (ogretmen)
    };
    const govde = el('div', { sinif: 'pgovde telsiz' });
    const pen = api.pencereYap('telsiz', 'Telsiz', govde, { x: 8, y: 5, w: 84, h: 88 });

    const kimlikAl = () => { const p = api.pano(); return (p && p.telsiz && p.telsiz.sunucu && p.telsiz.kimlik) ? p.telsiz : null; };

    // ------------------------------------------------------------ ag
    function istek(yontem, yol, veri) {
      const k = kimlikAl();
      if (!k) return Promise.resolve({ tamam: false, neden: 'sunucu_yok' });
      const temel = k.sunucu.replace(/\/+$/, '');
      const govdeVeri = Object.assign({ kod: k.kod, kimlik: k.kimlik, takma: k.takma }, veri || {});
      let adres = temel + yol, secenek = { method: yontem };
      if (yontem === 'GET') {
        const q = new URLSearchParams();
        // Ogretmen anahtari sorgu dizesinde (vekil/erisim kayitlarinda) degil, basliktadir.
        const anahtar = govdeVeri.anahtar;
        delete govdeVeri.anahtar;
        Object.keys(govdeVeri).forEach((a) => { if (govdeVeri[a] != null && govdeVeri[a] !== '') q.set(a, String(govdeVeri[a])); });
        adres += '?' + q.toString();
        if (anahtar) secenek.headers = { 'X-Ogretmen-Anahtari': String(anahtar) };
      } else {
        secenek.headers = { 'Content-Type': 'text/plain;charset=UTF-8' };    // basit istek: CORS on-denetimi yok
        secenek.body = JSON.stringify(govdeVeri);
      }
      return fetch(adres, secenek).then((r) => r.json()).catch(() => ({ tamam: false, neden: 'baglanti' }));
    }
    function ogrIstek(yontem, yol, veri) {
      return istek(yontem, yol, Object.assign({ anahtar: T.ogr ? T.ogr.anahtar : '' }, veri || {}));
    }
    const uyariMetni = (c) => c.uyari || NEDEN[c.neden] || (c.neden === 'baglanti' ? 'Sunucuya bağlanılamadı.' : 'Olmadı.');

    // ------------------------------------------------------------ durum yenileme
    function kanalYenile() {
      if (T.ogr) {
        return ogrIstek('GET', '/telsiz/ogretmen/kanallar').then((c) => {
          if (!c.tamam) { if (c.neden === 'yetki_yok') { T.ogr = null; T.hata = 'Öğretmen anahtarı geçersiz.'; } else T.hata = uyariMetni(c); return; }
          T.hata = ''; T.ogr.kanallar = c.kanallar; T.ogr.uyeler = c.uyeler; T.ogr.bildirilenSay = c.bildirilen; T.ogr.suzulen = c.suzulen;
          T.ayar = c.ayar;
        });
      }
      return istek('GET', '/telsiz/kanallar').then((c) => {
        if (!c.tamam) { T.hata = uyariMetni(c); return; }
        T.hata = ''; T.kanallar = c.kanallar; T.ben = c.ben; T.ayar = c.ayar; T.hak = c.hak; T.hazir = c.hazir; T.azamiBoy = c.azami_boy;
        if (!T.kanallar.some((k) => k.id === T.secili) && T.secili !== 'gelistirici') { T.secili = 'sinif'; T.mesajlar = []; T.son = -1; }
      });
    }
    function mesajYenile(bastan) {
      if (T.gorunum !== 'kanal' || T.secili === 'gelistirici') return Promise.resolve();
      const kanal = T.secili;
      if (bastan) { T.mesajlar = []; T.son = -1; }
      const yol = T.ogr ? '/telsiz/ogretmen/mesajlar' : '/telsiz/mesajlar';
      const f = T.ogr ? ogrIstek : istek;
      return f('GET', yol, { kanal: kanal, sonra: T.son }).then((c) => {
        if (kanal !== T.secili) return;
        if (!c.tamam) { if (c.neden === 'kanal_yok') { T.secili = T.ogr ? 'sinif' : 'sinif'; } return; }
        if (c.ayar) T.ayar = c.ayar;
        if (c.mesajlar.length) T.mesajlar = T.mesajlar.concat(c.mesajlar);
        T.son = Math.max(T.son, c.son);
      });
    }
    function yenile(bastan) {
      return kanalYenile().then(() => mesajYenile(bastan)).then(ciz);
    }
    function dongu() {
      clearTimeout(T.zaman);
      if (pen.gizli) return;
      T.zaman = setTimeout(() => { if (document.hidden) dongu(); else yenile(false).then(dongu); }, YOKLAMA_MS);
    }
    function ac() {
      T.hata = '';
      api.goster('telsiz');
      if (!kimlikAl()) { T.secili = 'gelistirici'; ciz(); return; }
      if (T.secili === 'gelistirici' && !T.ogr) T.secili = 'sinif';
      ciz();
      yenile(true).then(dongu);
    }
    const kapatSaat = () => clearTimeout(T.zaman);
    new MutationObserver(() => { if (pen.el.hidden) kapatSaat(); }).observe(pen.el, { attributes: true, attributeFilter: ['hidden'] });

    // ------------------------------------------------------------ eylemler
    function sec(id) {
      T.secili = id; T.gorunum = 'kanal'; T.uyari = '';
      govde.classList.add('detay-acik');
      yenile(true);
    }
    function yolla(veri) {
      const k = Object.assign({ kanal: T.secili }, veri);
      const p = T.ogr ? ogrIstek('POST', '/telsiz/ogretmen/gonder', k) : istek('POST', '/telsiz/gonder', k);
      return p.then((c) => {
        T.uyari = c.tamam ? '' : uyariMetni(c);
        return mesajYenile(false).then(ciz);
      });
    }
    function ozelAc() {
      istek('POST', '/telsiz/ozel_ac', {}).then((c) => {
        if (!c.tamam) { api.toast('hata', uyariMetni(c), 'TELSİZ'); return; }
        api.toast('basari', 'Kanal açıldı: ' + c.frekans + '. Arkadaşların bu numarayı girerek katılır.', 'TELSİZ');
        T.secili = c.frekans;
        yenile(true);
      });
    }
    function katil(girdi) {
      istek('POST', '/telsiz/katil', { frekans: girdi }).then((c) => {
        if (!c.tamam) { api.toast('hata', uyariMetni(c), 'TELSİZ'); return; }
        T.secili = c.frekans; T.gorunum = 'kanal';
        yenile(true);
      });
    }
    function ayril(k) {
      const yol = k.sahip ? '/telsiz/kapat' : '/telsiz/ayril';
      istek('POST', yol, { frekans: k.id }).then(() => { T.secili = 'sinif'; yenile(true); });
    }
    function bildir(m) {
      istek('POST', '/telsiz/bildir', { kanal: T.secili, no: m.no }).then((c) => {
        api.toast(c.tamam ? 'basari' : 'hata', c.tamam ? 'Bildirildi. Öğretmen bakacak.' : uyariMetni(c), 'TELSİZ');
      });
    }
    function paylas(f) {
      const metin = 'Meridyen Telsiz kanalı: ' + f;
      let tamam = false;
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(metin); tamam = true; } } catch (e) { /* pano yok */ }
      api.toast('bilgi', tamam ? 'Numara kopyalandı: ' + f : 'Numaran: ' + f + ' (arkadaşlarına söyle)', 'TELSİZ');
    }
    function ogretmenGir(anahtar) {
      T.ogr = { anahtar: anahtar, kanallar: [], bildirilen: [], uyeler: [] };
      T.secili = 'sinif'; T.gorunum = 'kanal'; T.hata = '';
      yenile(true);
    }
    function ogretmenCik() { T.ogr = null; T.secili = 'sinif'; T.gorunum = 'kanal'; yenile(true); }
    function ayarYap(alan, deger) {
      const v = {}; v[alan] = deger;
      ogrIstek('POST', '/telsiz/ogretmen/ayar', v).then(() => yenile(false));
    }
    function bildirilenYukle() {
      T.gorunum = 'bildirilen'; govde.classList.add('detay-acik');
      ogrIstek('GET', '/telsiz/ogretmen/bildirilen').then((c) => { T.ogr.bildirilen = c.bildirilen || []; ciz(); });
      ciz();
    }

    // ------------------------------------------------------------ cizim
    const saatYaz = (s) => { const d = new Date(s * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const kanalAdi = (k) => k.tur === 'ozel' ? (k.ad || 'Özel kanal') + ' · ' + k.id : k.ad;
    const IKON = { sinif: '📚', okul: '🏫', ogretmen: '🎓', ozel: '📻', gelistirici: '🛠' };

    function solCiz() {
      const sol = el('div', { sinif: 'tl-liste', role: 'list', 'aria-label': 'Telsiz kanalları' });
      sol.appendChild(el('div', { sinif: 'po-ust' }, el('b', { metin: T.ogr ? 'Öğretmen kipi' : 'Kanallar' }),
        el('span', { sinif: 'soluk', metin: T.ogr ? '' : (T.ben ? 'Takma adın: ' + T.ben : '') })));
      const liste = T.ogr ? T.ogr.kanallar : T.kanallar;
      liste.forEach((k) => {
        const secili = T.gorunum === 'kanal' && T.secili === k.id;
        sol.appendChild(el('button', { sinif: 'ileti kanal' + (secili ? ' secili' : ''), role: 'listitem', onclick: () => sec(k.id) },
          el('span', { sinif: 'tl-ik', 'aria-hidden': 'true', metin: IKON[k.tur] || '📻' }),
          el('span', { sinif: 'sm' }, el('b', { metin: kanalAdi(k) }),
            el('small', { metin: T.ogr ? (k.mesaj + ' mesaj' + (k.uyeler ? ' · ' + k.uyeler.length + ' kişi' : '')) : (k.tur === 'ozel' ? (k.uye + ' kişi' + (k.sahip ? ' · senin' : '')) : '') }))));
      });
      sol.appendChild(el('button', { sinif: 'ileti kanal' + (T.secili === 'gelistirici' && !T.ogr ? ' secili' : ''), role: 'listitem',
        onclick: () => sec('gelistirici') },
      el('span', { sinif: 'tl-ik', 'aria-hidden': 'true', metin: IKON.gelistirici }),
      el('span', { sinif: 'sm' }, el('b', { metin: 'Geliştiriciye' }), el('small', { metin: 'geri bildirim gönder' }))));
      if (kimlikAl() && !T.ogr) {
        const f = el('input', { type: 'text', inputmode: 'numeric', placeholder: '147.250', 'aria-label': 'Frekans numarası', maxlength: '8', sinif: 'tl-frekans' });
        const gir = () => { if (f.value.trim()) katil(f.value); };
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter') gir(); });
        sol.appendChild(el('div', { sinif: 'tl-arac' },
          el('div', { sinif: 'etiket', metin: 'ARKADAŞ KANALI (' + T.hak.acilan + '/' + T.hak.azami + ' açtın)' }),
          el('button', { sinif: 'dugme birincil', metin: 'Yeni özel kanal aç', onclick: ozelAc, disabled: T.ayar.ozel_acik ? null : '' }),
          T.ayar.ozel_acik ? null : el('small', { sinif: 'soluk', metin: 'Öğretmen şu an özel kanal açmayı kapattı.' }),
          el('div', { sinif: 'tl-sat' }, f, el('button', { sinif: 'dugme', metin: 'Gir', onclick: gir }))));
      }
      if (kimlikAl()) sol.appendChild(ogretmenAraci());
      return sol;
    }
    function ogretmenAraci() {
      const kap = el('div', { sinif: 'tl-arac ogr' });
      if (T.ogr) {
        const sayi = T.ogr.bildirilenSay || 0;
        kap.append(el('div', { sinif: 'etiket', metin: 'ÖĞRETMEN' }),
          el('button', { sinif: 'dugme' + (T.gorunum === 'bildirilen' ? ' birincil' : ''), metin: 'Bildirilenler (' + sayi + ')', onclick: bildirilenYukle }),
          el('label', { sinif: 'onay-sat' }, (() => { const c = el('input', { type: 'checkbox' }); c.checked = !!T.ayar.serbest; c.addEventListener('change', () => ayarYap('serbest', c.checked)); return c; })(), ' Serbest yazı açık'),
          el('label', { sinif: 'onay-sat' }, (() => { const c = el('input', { type: 'checkbox' }); c.checked = !!T.ayar.ozel_acik; c.addEventListener('change', () => ayarYap('ozel_acik', c.checked)); return c; })(), ' Özel kanal açılabilir'),
          el('small', { sinif: 'soluk', metin: 'Süzülen mesaj: ' + (T.ogr.suzulen || 0) + ' · Kayıtlı öğrenci: ' + (T.ogr.uyeler || []).length }),
          el('button', { sinif: 'dugme kucuk-d', metin: 'Öğretmen kipinden çık', onclick: ogretmenCik }));
      } else {
        const a = el('input', { type: 'password', placeholder: 'Sınıf anahtarı', 'aria-label': 'Öğretmen anahtarı', autocomplete: 'off', sinif: 'tl-frekans' });
        const gir = () => { if (a.value) ogretmenGir(a.value); };
        a.addEventListener('keydown', (e) => { if (e.key === 'Enter') gir(); });
        kap.append(el('details', null, el('summary', { metin: 'Öğretmen kipi' }),
          el('div', { sinif: 'tl-sat' }, a, el('button', { sinif: 'dugme', metin: 'Aç', onclick: gir }))));
      }
      return kap;
    }

    function gelistiriciCiz() {
      const sag = el('div', { sinif: 'tl-sag' });
      sag.append(el('button', { sinif: 'dugme kucuk-d geri-liste', metin: '‹ Kanallar', onclick: () => { govde.classList.remove('detay-acik'); } }),
        el('h2', { metin: 'Geliştiriciye' }),
        el('p', { metin: 'Oyunla ilgili bir hata, öneri ya da güzel bir fikrin mi var? Bir not yaz; ilerlemenle birlikte paketlenir ve geliştiriciye gider.' }),
        el('button', { sinif: 'dugme birincil', metin: 'Geri bildirim yaz', onclick: () => { api.gizle('telsiz'); api.geriBildirim(); } }));
      if (!kimlikAl()) {
        sag.append(el('div', { sinif: 'kutu' },
          el('div', { sinif: 'etiket', metin: 'SINIF SUNUCUSU YOK' }),
          el('div', { metin: 'Sınıf, okul, öğretmen ve arkadaş kanalları için okulun sınıf sunucusuna bağlanman gerekir. Bu cihazda sunucu ayarlı değil ya da bir sınıfa kayıtlı değilsin. Şimdilik yalnız geliştiriciye yazabilirsin.' })));
      }
      return sag;
    }

    function mesajCiz(m) {
      const benim = !!m.benim;
      const ogretmen = !!m.ogretmen;
      const satir = el('div', { sinif: 'tl-mesaj' + (benim ? ' benim' : '') + (ogretmen ? ' ogretmen' : ''), 'data-no': m.no },
        el('div', { sinif: 'tl-ust' }, el('b', { metin: ogretmen ? 'Öğretmen' : (m.takma || '?') }), el('small', { metin: saatYaz(m.t) }),
          m.hazir ? el('small', { sinif: 'soluk', metin: 'hazır' }) : null),
        el('div', { sinif: 'tl-metin', metin: m.metin }));
      if (T.ogr) {
        if (m.uid && !ogretmen) satir.firstChild.appendChild(el('small', { sinif: 'soluk', metin: '#' + m.uid }));
        satir.firstChild.appendChild(el('button', { sinif: 'tl-mini', metin: 'Sil', 'aria-label': 'Mesajı sil', onclick: () => {
          ogrIstek('POST', '/telsiz/ogretmen/mesaj_sil', { kanal: T.secili, no: m.no }).then(() => yenile(true));
        } }));
      } else if (!benim && !ogretmen) {
        satir.firstChild.appendChild(el('button', { sinif: 'tl-mini', metin: 'Bildir', 'aria-label': 'Mesajı öğretmene bildir', onclick: () => bildir(m) }));
      }
      return satir;
    }

    function kanalCiz() {
      const liste = T.ogr ? T.ogr.kanallar : T.kanallar;
      const k = liste.find((x) => x.id === T.secili) || { id: T.secili, ad: T.secili, tur: 'sinif' };
      const sag = el('div', { sinif: 'tl-sag' });
      const ust = el('div', { sinif: 'tl-baslik' },
        el('button', { sinif: 'dugme kucuk-d geri-liste', metin: '‹ Kanallar', onclick: () => { govde.classList.remove('detay-acik'); } }),
        el('h2', { metin: kanalAdi(k) }));
      sag.appendChild(ust);
      if (k.tur === 'ozel') {
        const bar = el('div', { sinif: 'tl-frekans-kart' },
          el('div', { sinif: 'etiket', metin: 'FREKANS' }), el('div', { sinif: 'tl-numara', metin: k.id }),
          el('small', { sinif: 'soluk', metin: (T.ogr ? (k.uyeler || []).join(', ') + ' · sahip: ' + (k.sahip || '?') : (k.uye || 1) + ' kişi') + ' · 48 saat sonra kendiliğinden kapanır' }));
        const dugmeler = el('div', { sinif: 'tl-sat' });
        if (!T.ogr) {
          dugmeler.append(el('button', { sinif: 'dugme', metin: 'Numarayı paylaş', onclick: () => paylas(k.id) }),
            el('button', { sinif: 'dugme kucuk-d', metin: k.sahip ? 'Kanalı kapat' : 'Kanaldan ayrıl', onclick: () => ayril(k) }));
        } else {
          dugmeler.append(el('button', { sinif: 'dugme kucuk-d', metin: 'Kanalı kapat', onclick: () => {
            ogrIstek('POST', '/telsiz/ogretmen/kapat', { frekans: k.id }).then(() => { T.secili = 'sinif'; yenile(true); });
          } }));
        }
        bar.appendChild(dugmeler);
        sag.appendChild(bar);
      }
      if (k.tur === 'okul') sag.appendChild(el('small', { sinif: 'soluk', metin: 'Okuldaki diğer sınıflar da bu kanalı görür.' }));
      if (k.tur === 'ogretmen' && !T.ogr) sag.appendChild(el('small', { sinif: 'soluk', metin: 'Yalnız sen ve öğretmenin görür; diğer öğrenciler göremez.' }));
      const akis = el('div', { sinif: 'tl-akis', role: 'log', 'aria-live': 'polite', 'aria-label': 'Mesajlar' });
      if (!T.mesajlar.length) akis.appendChild(el('div', { sinif: 'bos-not soluk', metin: 'Henüz mesaj yok. İlk sen yaz.' }));
      T.mesajlar.forEach((m) => akis.appendChild(mesajCiz(m)));
      sag.appendChild(akis);
      if (T.uyari) sag.appendChild(el('div', { sinif: 'tl-uyari', role: 'alert', metin: T.uyari }));
      // yazma alani
      const alt = el('div', { sinif: 'tl-yaz' });
      if (!T.ogr) {
        const hz = el('div', { sinif: 'tl-hazir' });
        T.hazir.forEach((h) => hz.appendChild(el('button', { sinif: 'dugme tl-chip', metin: h.metin, onclick: () => yolla({ hazir: h.id }) })));
        alt.appendChild(hz);
      }
      if (T.ogr || T.ayar.serbest) {
        const gir = el('input', { type: 'text', placeholder: T.ogr ? 'Öğretmen olarak yaz…' : 'Bir şey yaz… (kişisel bilgi paylaşma)', maxlength: String(T.azamiBoy || 200), 'aria-label': 'Mesaj', sinif: 'tl-giris' });
        const gonder = () => { const v = gir.value.trim(); if (!v) return; gir.value = ''; yolla({ metin: v }); };
        gir.addEventListener('keydown', (e) => { if (e.key === 'Enter') gonder(); });
        alt.appendChild(el('div', { sinif: 'tl-sat' }, gir, el('button', { sinif: 'dugme birincil', metin: 'Gönder', onclick: gonder })));
      } else {
        alt.appendChild(el('small', { sinif: 'soluk', metin: 'Öğretmenin şu an yalnız hazır mesajlara izin veriyor.' }));
      }
      sag.appendChild(alt);
      return sag;
    }

    function bildirilenCiz() {
      const sag = el('div', { sinif: 'tl-sag' });
      sag.append(el('button', { sinif: 'dugme kucuk-d geri-liste', metin: '‹ Kanallar', onclick: () => { govde.classList.remove('detay-acik'); } }),
        el('h2', { metin: 'Bildirilen mesajlar' }));
      const b = T.ogr.bildirilen || [];
      if (!b.length) sag.appendChild(el('div', { sinif: 'bos-not soluk', metin: 'Bildirilen mesaj yok.' }));
      b.forEach((x) => {
        sag.appendChild(el('div', { sinif: 'tl-mesaj bildirilen' },
          el('div', { sinif: 'tl-ust' }, el('b', { metin: x.takma }), el('small', { metin: x.kanal_ad + ' · ' + saatYaz(x.t) }),
            el('small', { sinif: 'soluk', metin: 'bildiren: ' + x.bildiren })),
          el('div', { sinif: 'tl-metin', metin: x.metin }),
          el('div', { sinif: 'tl-sat' },
            el('button', { sinif: 'dugme kucuk-d', metin: 'Mesajı sil', onclick: () => {
              ogrIstek('POST', '/telsiz/ogretmen/mesaj_sil', { kanal: x.kanal, no: x.mesaj_no })
                .then(() => ogrIstek('POST', '/telsiz/ogretmen/bildirilen_sil', { id: x.id })).then(bildirilenYukle);
            } }),
            el('button', { sinif: 'dugme kucuk-d', metin: 'Tamam, kaldır', onclick: () => {
              ogrIstek('POST', '/telsiz/ogretmen/bildirilen_sil', { id: x.id }).then(bildirilenYukle);
            } }))));
      });
      return sag;
    }

    function ciz() {
      const odak = document.activeElement;
      const yazilan = odak && odak.classList && odak.classList.contains('tl-giris') ? odak.value : null;
      const kaydir = govde.querySelector('.tl-akis');
      const dipte = !kaydir || kaydir.scrollHeight - kaydir.scrollTop - kaydir.clientHeight < 40;
      const detay = govde.classList.contains('detay-acik');
      govde.textContent = '';
      govde.classList.toggle('detay-acik', detay);
      if (T.hata) govde.appendChild(el('div', { sinif: 'tl-hata', role: 'alert', metin: T.hata }));
      govde.appendChild(solCiz());
      let sag;
      if (T.gorunum === 'bildirilen' && T.ogr) sag = bildirilenCiz();
      else if (T.secili === 'gelistirici' && !T.ogr) sag = gelistiriciCiz();
      else sag = kanalCiz();
      govde.appendChild(sag);
      const yeniAkis = govde.querySelector('.tl-akis');
      if (yeniAkis && dipte) yeniAkis.scrollTop = yeniAkis.scrollHeight;
      if (yazilan != null) { const g = govde.querySelector('.tl-giris'); if (g) { g.value = yazilan; g.focus(); } }
    }

    // Sinama kolayligi (yalniz ornek oynatici): kanal sec / ogretmen kipine gir.
    function dene(o) {
      if (o.anahtar) T.ogr = { anahtar: o.anahtar, kanallar: [], bildirilen: [], uyeler: [] };
      if (o.sec) T.secili = o.sec;
      if (o.sec === 'bildirilen') { T.secili = 'sinif'; kanalYenile().then(() => { bildirilenYukle(); }); }
    }
    return { ac: ac, ciz: ciz, durum: T, dene: dene };
  }

  window.OS_TELSIZ = { kur: kur };
})();
