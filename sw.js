// Cevrimdisi calisma. Ilk aciliisdan sonra internet gerekmez.
//
// SURUM: uygulama dosyalarindan biri degisince buradaki sayiyi artir.
// Artirmazsan eski onbellek silinmez; sorun cikarmaz ama gereksiz yer tutar.
const AD = "meridyen-v2";

const KENDI = [
  "./", "./index.html", "./isci.js", "./oyun_paketi.zip",
  "./manifest.webmanifest", "./simge.svg", "./simge-192.png", "./simge-512.png",
  "./ayarlar.json",
];

self.addEventListener("install", (e) => {
  // Tek bir dosya inmezse addAll komple duser ve servis isci hic kurulmaz.
  // Oyunun calismasi icin hepsi sart degil; teker teker deniyoruz.
  e.waitUntil(
    caches.open(AD)
      .then((c) => Promise.all(KENDI.map((y) => c.add(y).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== AD).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

// NEDEN IKI AYRI STRATEJI
// -----------------------
// Pyodide CDN'den geliyor ve ~7-10 MB. Bir kez iner, bir daha degismez
// (surum URL'de sabit). Onbellekten verilir -- ogrenci hucresel veri
// kullaniyorsa bu fark eder.
//
// Uygulama dosyalari (index.html, isci.js, oyun_paketi.zip) ise kucuk ve
// DEGISIR. Once onbellege bakarsak sinifta bir hatayi duzeltip dagittigimizda
// ogrencinin telefonunda eski surum kalir. Bu yuzden once aga bakiliyor,
// ag yoksa onbellege dusuluyor. Cevrimdisi yine calisir.
self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  const kendi = istek.url.startsWith(self.location.origin);

  if (kendi) {
    e.respondWith(
      fetch(istek)
        .then((yanit) => {
          if (yanit && yanit.ok) {
            const kopya = yanit.clone();
            caches.open(AD).then((c) => c.put(istek, kopya)).catch(() => {});
          }
          return yanit;
        })
        .catch(() => caches.match(istek).then((b) => b || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(istek).then((bulunan) => {
      if (bulunan) return bulunan;
      return fetch(istek).then((yanit) => {
        if (yanit && yanit.ok && istek.url.includes("pyodide")) {
          const kopya = yanit.clone();
          caches.open(AD).then((c) => c.put(istek, kopya)).catch(() => {});
        }
        return yanit;
      });
    })
  );
});
