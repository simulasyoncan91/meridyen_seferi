# Oyunu yayına koymak

Bu klasörü olduğu gibi bir yere yükle. Toplam boyut 500 KB'nin altında.

## En kolayı: Netlify Drop (hesap bile gerekmiyor)

1. https://app.netlify.com/drop adresini aç.
2. BU KLASÖRÜ sayfaya sürükle bırak.
3. Sana `https://...netlify.app` diye bir adres verir.
4. O adresi telefonda aç.

`_headers` dosyası gerekli ayarı kendisi yapıyor, elle bir şey yok.

## Cloudflare Pages

Aynı `_headers` dosyasını okur. Ücretsiz, sınırsız trafik.

## Vercel

`vercel.json` dosyası hazır.

## Kendi sunucun varsa

nginx:

    add_header Cross-Origin-Opener-Policy same-origin;
    add_header Cross-Origin-Embedder-Policy credentialless;

Apache:

    Header set Cross-Origin-Opener-Policy "same-origin"
    Header set Cross-Origin-Embedder-Policy "credentialless"

## Çalıştı mı, nasıl anlarım

Adresi telefonda aç: giriş sayfası **Meridyen OS** (üssün bilgisayarı).
Eski düz terminal görünümü `/eski.html` adresinde durur. Kayıtlar iki
görünümde ortaktır.

OS'ta açılışta üstte "Oyun motoru indiriliyor…" yazar. Sol altta küçük bir yazı görünür:

* **"çevrimdışı hazır"** -> her şey tamam. Oyun telefona kaydedildi,
  bundan sonra internet olmasa da açılır.
* **"çevrimdışı hazır değil"** -> oyun çalışır ama her açılışta yeniden
  iner. Dokununca sebebini söyler.

Sayfa açılıp da ilk soruda kilitleniyorsa başlıklar gelmiyordur.

## Telefona kurmak (öğrencilere söylenecek)

Adresi tarayıcıda aç, menüden **"Ana ekrana ekle"** de. Uygulama gibi
açılır ve internet gerekmez.

## Sınıf kodu kullanacaksan

`ayarlar.json` içindeki `sinif_sunucusu` alanına sınıf sunucusunun
adresini yaz (bkz. `SINIF_KURULUMU.md`). Boş bırakılırsa oyun tek başına
çalışır; sınıf kodu ve el kaldırma kapalı olur.

**Sunucu da https olmalı:** sayfa https ise tarayıcı http bir adrese
bağlanmayı reddeder.
