// Meridyen OS tasiyici soyutlamasi.
//
// Arayuz motoru dogrudan bilmez; yalniz su sozlesmeyi bilir:
//
//   tasiyici.olayDinle(fn)      motor olaylari fn(olay) ile gelir
//   tasiyici.girdiGonder(metin) kullanicinin cevabi (motorun bekledigi METIN)
//   tasiyici.baslat()           baglantiyi / oynaticiyi baslat
//   tasiyici.durumDinle(fn)     (istege bagli) yukleme/baglanti durumu metni
//   tasiyici.otomatik           (yalniz ornek) arayuzun atayacagi geri cagri
//
// Uc uygulama: ornek (kayit oynatici), pyodide (mobil/isci.js), sunucu (--web).
// Varsayilan, sayfadaki <meta name="os-tasiyici"> degeridir; ?ornek her zaman oynaticiyi acar.
(function () {
  'use strict';

  function temel(ad) {
    const t = {
      ad: ad,
      _olay: [], _durum: [],
      olayDinle(fn) { t._olay.push(fn); },
      durumDinle(fn) { t._durum.push(fn); },
      _yay(o) { t._olay.forEach(function (f) { try { f(o); } catch (e) { console.error('olay isleyici hatasi', e, o); } }); },
      _durumYay(m) { t._durum.forEach(function (f) { f(m); }); },
      baslat() {}, girdiGonder() {}
    };
    return t;
  }

  // ------------------------------------------------------------ (a) ornek
  // os/ornek_olaylar.json: [{"olay": {...}} | {"girdi": "..."}]
  // "olay" ogeleri sirayla yayilir. t=="girdi" yayilinca oynatici DURUR ve
  // kullanicinin tiklamasini bekler; otomatik kipte kayittaki {"girdi"}
  // degeri kullanilir.
  function ornek(secenek) {
    const t = temel('ornek');
    let dizi = [], i = 0, bekliyor = false, sayac = 0, zaman = null;
    t.otomatik = null;                    // arayuz atar: (metin) => arayuz.gonder(metin)
    t.ayar = { otomatik: !!secenek.otomatik, hiz: secenek.hiz, dur: secenek.dur };

    function planla(ms) { clearTimeout(zaman); zaman = setTimeout(adim, ms); }
    function adim() {
      if (t.ayar.dur && sayac >= t.ayar.dur) return;
      if (i >= dizi.length) { t._durumYay('Örnek akış bitti.'); return; }
      const oge = dizi[i];
      if (oge.olay) {
        i++; sayac++;
        t._yay(oge.olay);
        if (oge.olay.t === 'girdi') {
          bekliyor = true;
          if (t.ayar.otomatik) { clearTimeout(zaman); zaman = setTimeout(otomatikGonder, t.ayar.hiz * 2); }
          return;
        }
        planla(t.ayar.hiz);
      } else {
        i++; adim();                       // basibos "girdi" kaydi: atla
      }
    }
    function otomatikGonder() {
      if (!bekliyor) return;
      if (t.ayar.dur && sayac >= t.ayar.dur) return;   // dur: bu olayda kal (ekran goruntusu icin)
      const oge = dizi[i];
      const metin = oge && 'girdi' in oge ? String(oge.girdi) : '';
      if (t.otomatik) t.otomatik(metin); else t.girdiGonder(metin);
    }
    t.baslat = function () {
      return fetch(secenek.dosya || 'ornek_olaylar.json').then(function (r) {
        if (!r.ok) throw new Error('ornek_olaylar.json okunamadı (' + r.status + ')');
        return r.json();
      }).then(function (j) { dizi = j; i = 0; sayac = 0; bekliyor = false; planla(50); })
        .catch(function (e) { t._durumYay('Hata: ' + e.message); });
    };
    t.girdiGonder = function () {
      if (!bekliyor) return;
      bekliyor = false;
      if (dizi[i] && 'girdi' in dizi[i]) i++;   // kayittaki cevabi atla
      planla(t.ayar.hiz);
    };
    t.otomatigiAyarla = function (acik) {
      t.ayar.otomatik = acik;
      if (acik && bekliyor) { clearTimeout(zaman); zaman = setTimeout(otomatikGonder, t.ayar.hiz * 2); }
    };
    t.basaSar = function () { clearTimeout(zaman); i = 0; sayac = 0; bekliyor = false; t._yay({ t: 'sifirla' }); planla(50); };
    return t;
  }

  // ------------------------------------------------------------ (b) Pyodide
  // mobil/isci.js: Web Worker + Atomics.wait. Isci `basla` mesajinda
  // olayli:true alirsa olay kabugunu takar ve oyun olaylarini
  // {tur:"olay", veri} ile yollar. Girdi, mobil/index.html'deki gibi
  // paylasimli tampona yazilir.
  // Gerektirir: SharedArrayBuffer (COOP/COEP basliklari) ve https/localhost.
  //
  // KAYITLAR: mobil/index.html ile AYNI IndexedDB (meridyen-kayitlar /
  // kayitlar) kullanilir; iki sayfa birbirinin kaydini gorur. Kalicilik ana
  // is parcacigindadir (iscinin olay dongusu oyun boyunca bloklu; gerekce
  // isci.js'te).
  const KAYIT_DB = 'meridyen-kayitlar', KAYIT_DEPO = 'kayitlar';
  function kayitDeposu() {
    return new Promise(function (coz, sik) {
      const istek = indexedDB.open(KAYIT_DB, 1);
      istek.onupgradeneeded = function () {
        const db = istek.result;
        if (!db.objectStoreNames.contains(KAYIT_DEPO)) db.createObjectStore(KAYIT_DEPO);
      };
      istek.onsuccess = function () { coz(istek.result); };
      istek.onerror = function () { sik(istek.error); };
    });
  }
  // ESKI SURUM KAYITLARININ TASINMASI (9 Eylul yayini -> bu surum)
  // -------------------------------------------------------------
  // 9 Eylul yayini kayitlari Pyodide IDBFS ile tutuyordu: IndexedDB adi
  // "/kayitlar", deposu "FILE_DATA", anahtar "/kayitlar/<ad>", deger
  // {contents: Uint8Array, mode, timestamp}. Bu surum "meridyen-kayitlar"
  // kullaniyor. Tasima olmadan o surumu telefona kuran ogrenci guncelleme
  // gelince sifirdan baslardi. Burada eski depoda olup yenide OLMAYAN her
  // kayit bir kez kopyalanir; yenide ayni adli kayit varsa ona dokunulmaz.
  // Eski veritabani SILINMEZ (geri donus yolu kalsin). Tasima bitince
  // localStorage'a isaret konur; boylece yeni surumde silinen bir kayit
  // eski depodan geri dirilmez.
  var GOC_ISARETI = 'meridyen-idbfs-tasindi';
  function eskiKayitlariTasi(yeniDb, depoAdi) {
    try { if (localStorage.getItem(GOC_ISARETI)) return Promise.resolve(0); } catch (e) { /* depo yok */ }
    return new Promise(function (coz) {
      var istek;
      try { istek = indexedDB.open('/kayitlar'); } catch (e) { coz(0); return; }
      istek.onupgradeneeded = function () { istek.transaction.abort(); };  // eski veritabani yok: olusturma
      istek.onerror = function () { coz(0); };
      istek.onsuccess = function () {
        var eski = istek.result;
        if (!eski.objectStoreNames.contains('FILE_DATA')) { eski.close(); coz(0); return; }
        var okuma = eski.transaction('FILE_DATA', 'readonly').objectStore('FILE_DATA');
        var anahtarlar = okuma.getAllKeys(), degerler = okuma.getAll();
        degerler.onerror = function () { eski.close(); coz(0); };
        degerler.onsuccess = function () {
          eski.close();
          var bulunan = [];
          (anahtarlar.result || []).forEach(function (yol, i) {
            var d = degerler.result[i];
            var m = /^\/kayitlar\/([^\/]+)$/.exec(String(yol));
            if (!m || !d || !d.contents) return;                 // klasor girdisi ya da alt klasor
            try { bulunan.push({ ad: m[1], icerik: new TextDecoder('utf-8').decode(d.contents) }); } catch (e) { /* okunamadi */ }
          });
          var islem = yeniDb.transaction(depoAdi, 'readwrite'), depo = islem.objectStore(depoAdi), sayi = 0;
          bulunan.forEach(function (k) {
            var var_mi = depo.count(k.ad);
            var_mi.onsuccess = function () { if (!var_mi.result) { depo.put(k.icerik, k.ad); sayi++; } };
          });
          islem.oncomplete = function () {
            try { localStorage.setItem(GOC_ISARETI, String(Date.now())); } catch (e) { /* depo yok */ }
            coz(sayi);
          };
          islem.onerror = islem.onabort = function () { coz(0); };   // isaret konmaz: sonraki acilista yeniden denenir
        };
      };
    });
  }
  function kayitlariOku() {
    return kayitDeposu().then(function (db) {
      return eskiKayitlariTasi(db, KAYIT_DEPO).then(function () { return db; });
    }).then(function (db) {
      return new Promise(function (coz) {
        const depo = db.transaction(KAYIT_DEPO, 'readonly').objectStore(KAYIT_DEPO);
        const anahtarlar = depo.getAllKeys(), degerler = depo.getAll();
        degerler.onsuccess = function () {
          coz((anahtarlar.result || []).map(function (ad, i) { return { ad: String(ad), icerik: degerler.result[i] }; }));
        };
        degerler.onerror = function () { coz([]); };
      });
    }).catch(function () { return []; });
  }
  function kayitYaz(ad, icerik, silindi) {
    return kayitDeposu().then(function (db) {
      return new Promise(function (coz, sik) {
        const islem = db.transaction(KAYIT_DEPO, 'readwrite');
        const depo = islem.objectStore(KAYIT_DEPO);
        const istek = silindi ? depo.delete(ad) : depo.put(icerik, ad);
        istek.onerror = function () { sik(istek.error); };
        islem.onabort = function () { sik(islem.error); };
        islem.oncomplete = function () { coz(true); };
      });
    }).catch(function (e) { console.warn('kayıt yazılamadı', e); return false; });
  }
  // isci.js, depoda os/ ile ayni klasorde (yayin) ya da ../mobil/ altinda (depo).
  function isciYolu() { return /\/os\/(index\.html)?$/.test(location.pathname) ? '../mobil/isci.js' : 'isci.js'; }

  function pyodide(secenek) {
    const t = temel('pyodide');
    let isci = null, k32 = null, tbuf = null, saglam = true;
    t.baslat = function () {
      if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
        t._durumYay('Bu sayfa güvenli (https) ve COOP/COEP başlıklarıyla açılmalı; yoksa oyun motoru çalışmaz.');
        return;
      }
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
      kayitlariOku().then(function (kayitlar) {
        const kilit = new SharedArrayBuffer(8), tampon = new SharedArrayBuffer(4096);
        k32 = new Int32Array(kilit); tbuf = new Uint8Array(tampon);
        isci = new Worker(secenek.isci || isciYolu());
        isci.onerror = function (e) { t._durumYay('Oyun motoru açılamadı: ' + (e.message || 'işçi dosyası yok')); };
        isci.onmessage = function (e) {
          const m = e.data;
          if (m.tur === 'olay') t._yay(m.veri);
          else if (m.tur === 'durum') t._durumYay(m.metin);
          else if (m.tur === 'hazir') t._durumYay('');
          else if (m.tur === 'bitti') t._yay({ t: 'bitti' });
          else if (m.tur === 'kayit') {
            kayitYaz(m.ad, m.icerik, m.silindi).then(function (tamam) {
              if (!tamam && saglam) { saglam = false; t._durumYay('İlerleme kaydedilemiyor (gizli sekme ya da dolu depo olabilir).'); }
            });
          }
          else if (m.tur === 'hata') t._durumYay('Hata: ' + m.mesaj);
          // 'satir' ve 'istem' mesajlari olayli kipte gereksizdir.
        };
        t._durumYay('Oyun motoru indiriliyor…');
        isci.postMessage({ tur: 'basla', kilit: kilit, tampon: tampon, kayitlar: kayitlar, olayli: true });
      });
    };
    t.girdiGonder = function (metin) {
      const b = new TextEncoder().encode(String(metin)).subarray(0, 4000);
      tbuf.set(b); Atomics.store(k32, 1, b.length);
      Atomics.store(k32, 0, 1); Atomics.notify(k32, 0);
    };
    return t;
  }

  // ------------------------------------------------------------ (c) sunucu
  // `python main.py --web` (araclar/sunucu.py, oyun/motor/web_kabuk.py). Uc noktalar:
  //   GET  /api/olaylar?sonra=N  -> {"olaylar": [ {...}, ... ], "son": M}
  //   POST /api/girdi            govde {"metin": "..."}  -> {"alindi": true}
  function sunucu(secenek) {
    const t = temel('sunucu');
    const kok = secenek.kok || '';
    let son = 0, calisiyor = false, ilk = true;
    function yokla() {
      if (!calisiyor) return;
      fetch(kok + '/api/olaylar?sonra=' + son).then(function (r) { return r.json(); })
        .then(function (j) {
          // Ilk yanit (sayfa yenilendiyse) eski olaylari tasir: bildirim gostermeden oynat.
          t.tekrar = ilk && (j.olaylar || []).length > 1; ilk = false;
          if (j.bitti && !(j.olaylar || []).length) calisiyor = false;   // oyun kapandi: yoklamayi birak
          son = j.son; (j.olaylar || []).forEach(t._yay); t.tekrar = false;
        })
        .catch(function () { t._durumYay('Sunucuya ulaşılamıyor…'); })
        .then(function () { setTimeout(yokla, 400); });
    }
    t.baslat = function () { calisiyor = true; yokla(); };
    t.girdiGonder = function (metin) {
      fetch(kok + '/api/girdi', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metin: String(metin) }) }).catch(function () { t._durumYay('Cevap gönderilemedi.'); });
    };
    return t;
  }

  window.OS_TASIYICI = {
    sec(q) {
      const hiz = q.has('hiz') ? Math.max(0, parseInt(q.get('hiz'), 10) || 0) : 450;
      const meta = document.querySelector('meta[name="os-tasiyici"]');
      const varsayilan = meta ? meta.getAttribute('content') : 'pyodide';
      const ornekMi = q.has('ornek') || q.has('dosya') || q.has('otomatik');
      if (!ornekMi && (q.has('sunucu') || varsayilan === 'sunucu')) return sunucu({ kok: q.get('sunucu') || '' });
      if (!ornekMi && (q.has('pyodide') || varsayilan === 'pyodide')) return pyodide({});
      return ornek({ otomatik: q.has('otomatik'), hiz: hiz, dur: parseInt(q.get('dur'), 10) || 0, dosya: q.get('dosya') });
    }
  };
})();
