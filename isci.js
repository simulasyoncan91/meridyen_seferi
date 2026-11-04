// Meridyen Seferi - mobil isci.
//
// Oyun BURADA kosar: Pyodide (tarayicida CPython/WASM) + oyunun kendi
// Python kodu. Tek satir Python yeniden yazilmadi.
//
// EN KRITIK NOKTA -- senkron input():
// `oturum.py` senkron calisir; `input()` cagirip cevabi bekler. Tarayici
// ise asenkron. Ikisini bulusturmak icin oyun bir Web Worker'da kosar ve
// cevap beklerken `Atomics.wait` ile GERCEKTEN BLOKLANIR. Ana is parcacigi
// (sayfa) cevabi paylasimli tampona yazip isciyi uyandirir.
//
// Boylece: Python tarafi hic degismez, sayfa donmaz.
// Gerektirdigi sey: SharedArrayBuffer -> sunucu COOP/COEP basliklari
// vermek zorunda (bkz. araclar/mobil_paket.py ciktisi).

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let py = null;
let kilit = null;          // Int32Array: [0]=uyandirma bayragi, [1]=cevap uzunlugu
let tampon = null;         // Uint8Array: cevabin baytlari
let ekranGenisligi = 60;   // karakter; sayfa olcup bildirir
let sinifSunucusu = "";    // bos = ag yok; mobil/ayarlar.json'dan gelir
let olayli = false;        // true: Meridyen OS sayfasi (olay kabugu); false: eski terminal gorunumu

function bildir(veri) { postMessage(veri); }

function girdiBekle(istem) {
  bildir({ tur: "istem", istem: String(istem) });
  Atomics.store(kilit, 0, 0);
  Atomics.wait(kilit, 0, 0);
  const uzunluk = Atomics.load(kilit, 1);
  // TextDecoder PAYLASIMLI tampon kabul etmiyor ("must not be shared"),
  // once siradan bir diziye kopyalanmali. Tek satir ama olmadan calismaz.
  return new TextDecoder().decode(new Uint8Array(tampon.subarray(0, uzunluk)));
}

// AG -- neden burada ve neden senkron XHR
// ---------------------------------------
// Oyun `ag.gonder(...)` cagirir ve cevabi BEKLER (bkz. oyun/motor/ag.py).
// Girdi icin Atomics dansi gerekti cunku cevap kullanicidan geliyordu;
// burada gerek YOK: senkron XMLHttpRequest ana is parcaciginda yasak ama
// WEB WORKER icinde serbest. Zaten bloklanmasi gereken bir is parcacigi.
//
// Basarisizlik sessiz: sinifta ag kesilir, oyun durmamali.
function agIstek(adres, govde, zamanAsimi) {
  try {
    const x = new XMLHttpRequest();
    x.open(govde ? "POST" : "GET", adres, false);   // false = senkron
    x.timeout = Math.max(1, zamanAsimi | 0) * 1000;
    if (govde) x.setRequestHeader("Content-Type", "application/json");
    x.send(govde || null);
    if (x.status < 200 || x.status >= 300) return "";
    return x.responseText || "";
  } catch (err) {
    return "";
  }
}

// KAYIT KALICILIGI -- neden IDBFS DEGIL
// ------------------------------------
// Once IDBFS kullaniliyordu: sanal dosya sistemi `FS.syncfs` ile
// IndexedDB'ye esitleniyordu. CALISMIYORDU ve sebebi yapisal:
//
// Oyun tek bir `runPython` cagrisinin icinde bastan sona kosuyor ve
// cevap beklerken `Atomics.wait` ile BLOKLANIYOR. Yani bu iscinin olay
// dongusu oyun boyunca hic sira almiyor. `syncfs` eszamansiz -- geri
// cagrisi calisamiyor. Ayni sebeple ana is parcacigindan gonderilen
// "kaydet" mesaji da oyun bitene kadar islenmiyor.
//
// Sonuc: oyun "Kaydedildi" yaziyor, IndexedDB bos kaliyordu. Kayit
// yalnizca oyun TEMIZ KAPANINCA iniyordu. Telefonda bu istisna degil
// kural; Android arka plandaki sekmeyi kendi karariyla oldurur.
// (9 Eylul 2026'da olculdu: FILE_DATA deposu bos.)
//
// Cozum: dosya sistemi sirandan (bellekte) kaliyor, kaliciligi ANA IS
// PARCACIGI yapiyor. Isci kayit yazilinca dosyayi SENKRON okuyup
// (`FS.readFile` senkron) mesajla gonderiyor; ana is parcacigi bloke
// olmadigi icin IndexedDB'ye rahatca yaziyor. Beklemeye gerek yok.
function kayitlariKur(kayitlar) {
  py.FS.mkdirTree("/kayitlar");
  for (const k of kayitlar || []) {
    try {
      py.FS.writeFile("/kayitlar/" + k.ad, k.icerik);
    } catch (err) {
      bildir({ tur: "durum", metin: "Bir kayıt okunamadı: " + k.ad });
    }
  }
}

function kayitBildir(yol, silindi) {
  const ad = String(yol).split("/").pop();
  if (silindi) {
    bildir({ tur: "kayit", ad: ad, silindi: true });
    return;
  }
  try {
    // Metin olarak okunuyor: kayitlar JSON ve IndexedDB'de de metin
    // olarak duruyor -- ikili veriye gerek yok.
    bildir({ tur: "kayit", ad: ad,
             icerik: py.FS.readFile(String(yol), { encoding: "utf8" }) });
  } catch (err) {
    bildir({ tur: "durum", metin: "Kayıt yazılamadı: " + ad });
  }
}

const BASLANGIC = `
import sys, os
sys.path.insert(0, "/home/pyodide")
os.environ["MERIDYEN_KAYIT"] = "/kayitlar"
os.environ["OYUN_TEMIZLEME"] = "0"

import json

import kopru
from oyun.motor import ag, durum as kayit_defteri, terminal as ekran

# Sinif sunucusu adresi. Dagitimin ayari; ogrenci yazmaz. Bos ise ag
# kapalidir ve oyun tek basina calisir (bkz. mobil/ayarlar.json).
AG_SUNUCUSU = kopru.sinif_sunucusu()


class TarayiciKabugu:
    """Oyunun ekrani ve klavyesi. TASARIM_NOTLARI §8: motor kalir, kabuk degisir."""

    # Harf harf yazim tarayicida her harf icin bir mesaj olurdu.
    yazim_hizi_destekli = False

    def bas(self, satir):
        kopru.satir_bas(str(satir))

    def oku(self, istem):
        return kopru.girdi_bekle(str(istem))

    def temizle(self):
        kopru.ekrani_temizle()
        return True

    def genislik(self):
        # Terminal 80 sutun varsayar; telefonda o kutulari tasirir.
        # Gercek deger yalnizca sayfada bilinir, oradan geliyor.
        return kopru.ekran_genisligi()


class TarayiciAgi:
    """Ag tasiyicisi. urllib yerine sayfanin XHR'i.

    Pyodide'de socket YOK; urllib calismaz. TASARIM_NOTLARI §8'in ag
    karsiligi: motor "ag.gonder" der, tasiyici degisir.

    DIKKAT: bu metin JS sablon dizgisinin (template literal) icinde
    yasiyor. Ters tirnak KULLANMA -- dizgiyi erken kapatir ve isci hic
    baslamaz. 8 Eylul'de bir kez oldu.
    """

    def gonder(self, adres, veri, zaman_asimi):
        govde = json.dumps(veri) if veri is not None else None
        ham = kopru.ag_istek(str(adres), govde, float(zaman_asimi))
        if not ham:
            return None
        try:
            return json.loads(ham)
        except ValueError:
            return None


kayit_defteri.kayit_kancasi_ata(kopru.kayit_bildir)

ag.ag_ata(TarayiciAgi())
if AG_SUNUCUSU:
    ag.sunucu_ata(AG_SUNUCUSU)

class OlayliTarayiciKabugu(TarayiciKabugu):
    """Meridyen OS icin: metin satiri yerine yapisal olay (bkz. MERIDYEN_OS.md).

    olay yontemi oldugu icin terminal islevleri olay gonderir. Eski
    sayfa (mobil/index.html) bu sinifi HIC kullanmaz: sayfa basla
    mesajinda olayli:true gondermedikce takilan kabuk eskisidir.
    """

    def olay(self, veri):
        kopru.olay(json.dumps(veri, ensure_ascii=False))

    def bas(self, satir):
        self.olay({"t": "satir", "metin": str(satir)})

    def temizle(self):
        return True


ekran.kabuk_ata(OlayliTarayiciKabugu() if kopru.olayli() else TarayiciKabugu())
"hazir"
`;

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tur === "basla") {
      kilit = new Int32Array(m.kilit);
      tampon = new Uint8Array(m.tampon);
      olayli = m.olayli === true;
      bildir({ tur: "durum", metin: "Oyun motoru indiriliyor…" });
      py = await loadPyodide();
      bildir({ tur: "durum", metin: "Oyun dosyaları açılıyor…" });
      const zip = await (await fetch("oyun_paketi.zip")).arrayBuffer();
      py.unpackArchive(zip, "zip");
      bildir({ tur: "durum", metin: "Kayıtlar okunuyor…" });
      kayitlariKur(m.kayitlar);
      // Sinif sunucusu ayari. Dosya yoksa ag kapali kalir -- oyun yine
      // calisir, yalnizca el kaldirma olmaz.
      try {
        const a = await (await fetch("ayarlar.json")).json();
        sinifSunucusu = String(a.sinif_sunucusu || "").trim();
      } catch (err) {
        sinifSunucusu = "";
      }
      py.registerJsModule("kopru", {
        girdi_bekle: girdiBekle,
        satir_bas: (s) => bildir({ tur: "satir", satir: String(s) }),
        ekrani_temizle: () => bildir({ tur: "temizle" }),
        ekran_genisligi: () => ekranGenisligi,
        olayli: () => olayli,
        olay: (s) => bildir({ tur: "olay", veri: JSON.parse(String(s)) }),
        ag_istek: agIstek,
        sinif_sunucusu: () => sinifSunucusu,
        // Kayit yazilir yazilmaz haber ver; bekleme YOK (bkz. yukarisi).
        kayit_bildir: kayitBildir,
      });
      py.runPython(BASLANGIC);
      bildir({ tur: "hazir" });
      // Oyun burada baslar ve BITENE KADAR bu cagri donmez.
      try {
        py.runPython("from oyun.motor import oyun as _o; _o.basla()");
      } finally {
        bildir({ tur: "bitti" });
      }
    } else if (m.tur === "genislik") {
      ekranGenisligi = Math.max(30, Math.min(92, m.deger | 0));
    }
  } catch (err) {
    bildir({ tur: "hata", mesaj: String(err && err.message ? err.message : err) });
  }
};
