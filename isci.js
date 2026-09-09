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

async function kayitlariYukle() {
  py.FS.mkdirTree("/kayitlar");
  py.FS.mount(py.FS.filesystems.IDBFS, {}, "/kayitlar");
  await new Promise((c, r) => py.FS.syncfs(true, (e) => (e ? r(e) : c())));
}

async function kayitlariYaz() {
  await new Promise((c, r) => py.FS.syncfs(false, (e) => (e ? r(e) : c())));
}

const BASLANGIC = `
import sys, os
sys.path.insert(0, "/home/pyodide")
os.environ["MERIDYEN_KAYIT"] = "/kayitlar"
os.environ["OYUN_TEMIZLEME"] = "0"

import json

import kopru
from oyun.motor import ag, terminal as ekran

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


ag.ag_ata(TarayiciAgi())
if AG_SUNUCUSU:
    ag.sunucu_ata(AG_SUNUCUSU)

ekran.kabuk_ata(TarayiciKabugu())
"hazir"
`;

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tur === "basla") {
      kilit = new Int32Array(m.kilit);
      tampon = new Uint8Array(m.tampon);
      bildir({ tur: "durum", metin: "Oyun motoru indiriliyor…" });
      py = await loadPyodide();
      bildir({ tur: "durum", metin: "Oyun dosyaları açılıyor…" });
      const zip = await (await fetch("oyun_paketi.zip")).arrayBuffer();
      py.unpackArchive(zip, "zip");
      bildir({ tur: "durum", metin: "Kayıtlar okunuyor…" });
      await kayitlariYukle();
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
        ag_istek: agIstek,
        sinif_sunucusu: () => sinifSunucusu,
      });
      py.runPython(BASLANGIC);
      bildir({ tur: "hazir" });
      // Oyun burada baslar ve BITENE KADAR bu cagri donmez.
      try {
        py.runPython("from oyun.motor import oyun as _o; _o.basla()");
      } finally {
        await kayitlariYaz();
        bildir({ tur: "bitti" });
      }
    } else if (m.tur === "genislik") {
      ekranGenisligi = Math.max(30, Math.min(92, m.deger | 0));
    } else if (m.tur === "kaydet") {
      // Ogrenci sekmeyi kapatirsa kayip olmasin diye ara sira cagrilir.
      if (py) await kayitlariYaz();
    }
  } catch (err) {
    bildir({ tur: "hata", mesaj: String(err && err.message ? err.message : err) });
  }
};
