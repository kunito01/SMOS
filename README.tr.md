<p align="center">
  <img src="./app/icon.svg" width="104" alt="Studio Map OS logosu" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>YARATICI PROJE İŞLETİM SİSTEMİ</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.es.md">Español</a> · <a href="./README.pt-BR.md">Português</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.ru.md">Русский</a> · <strong>Türkçe</strong> · <a href="./README.ko.md">한국어</a> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  <strong>Tek kişilik bir stüdyo, eksiksiz bir ekip gibi çalışsın.</strong><br />
  Bağımsız üreticiler ve tek kişilik şirketler için görsel, Local-First bir proje işletim sistemi.
</p>

<p align="center">
  <a href="https://kunito01.github.io/SMOS/login/"><img src="./docs/readme/live-demo.svg" alt="Canlı demoyu aç" /></a>
  <a href="https://github.com/kunito01/SMOS/releases/latest"><img src="./docs/readme/download-pwa.svg" alt="Taşınabilir PWA'yı indir" /></a>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="GitHub yıldızları" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="GitHub çatalları" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="GitHub sorunları" /></a>
  <img src="https://img.shields.io/badge/version-V_1.2-f7567c?style=flat-square" alt="Version V 1.2" />
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="Kurulabilir PWA" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="Local-First veriler" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-03b5aa?style=flat-square" alt="Apache License 2.0" /></a>
</p>

---

## Genel Bakış

Studio Map OS; markaları, proje gruplarını, projeleri, kişileri, yazılımları, maliyetleri, zaman çizelgelerini, yayın kontrol noktalarını ve arşivleri tek bir görsel çalışma alanında birleştirir. Bağımsız üreticilerin, yaratıcı süreci sıradan bir görev listesine indirgemeden birden fazla paralel projeyi yönetmesine yardımcı olur.

Mevcut sürüm, kurulabilir ve Local-First bir PWA'dır. İş verileri cihazda kalır, Web Crypto ile şifrelenir ve IndexedDB'de saklanır. Web App Manifest, Service Worker, çevrimdışı geri dönüş sayfası, uygulama simgeleri ve bağımsız paketleme iş akışı entegre edilmiştir. Yerel hesaplar, kurtarma anahtarları ve yedekler tarayıcıda yönetilir. Apple / iCloud oturumu, şifreli çalışma alanı verilerini isteğe bağlı olarak kullanıcının özel CloudKit veritabanı üzerinden eşitleyebilir; özel bir uzak iş backend'i veya uygulama tarafından yönetilen sunucu kimlik doğrulaması projeye dâhil değildir.

## V 1.2 yenilikleri

- **Birbirinden bağımsız iki hesap yolu** — tamamen yerel IndexedDB hesaplarını kullanmaya devam edin veya Apple / iCloud ile ayrı olarak oturum açın; iki yol birbirine bağlı değildir.
- **Şifreli CloudKit eşitlemesi** — cihazdaki şifreli kopyayı koruyup özel CloudKit veritabanıyla yalnızca şifreli metni eşitleyin; hesap bağlama, yazma kilitleri, change tag kontrolü ve açık yerel/bulut çakışma çözümü kullanın.
- **Daha güvenli cihaz kurtarma** — yalnızca bir kez gösterilen 16 haneli kurtarma anahtarı, cihaza bağlı dışa aktarılamayan Web Crypto anahtarı ve şifreli cihaz, çalışma alanı ve proje yedeklerini kullanın.
- **Görsel iş akışı oluşturucu** — bağlı düğümler, renkler, ekler, yakınlaştırma, proje bağlantıları, otomatik kaydetme ve bağımsız HTML paylaşımıyla yeniden kullanılabilir panolar oluşturun.
- **Daha kapsamlı proje teslimi** — iş akışlarını projelere bağlayın; Demo ve resmî yayın noktalarını, ödemeleri ve zaman çizelgelerini yönetin; paylaşılabilir HTML proje raporları dışa aktarın.
- **Bağlantılı maliyet kitaplıkları** — kişi ve yazılım maliyet şablonlarını yeniden kullanıp eşitleyin, dağılıma göre aşama bütçeleri hesaplayın ve yaklaşan abonelik ödemeleri için anımsatıcılar alın.
- **Daha güvenli düzenleme ve gezinme** — kaydedilmemiş değişiklik koruması, özel işlem onayları, geliştirilmiş arşiv ve depolama denetimleri ile daha açık kaydetme, silme, çıkış ve kurtarma durumları.
- **PWA ve uluslararası arayüz** — GitHub Pages/PWA, gezinme ve pencereler geliştirildi; on bir üretim diline on ikinci eğlencelik Sümer çivi yazısı seçeneği eklendi.

## Ekran Görüntüleri

![01 — Oturum açma ve şifrelenmiş tam site yedeğine erişim](./docs/screenshots/01.png)

![02 — Tüm projeler dizini ve görsel proje kartları](./docs/screenshots/02.png)

![03 — Kişi, yazılım ve maliyet şablonu kitaplıkları](./docs/screenshots/03.png)

## Temel Yetenekler

| Proje yönetimi | Yerel veri denetimi |
| --- | --- |
| Stüdyo geneli, marka ve proje grubu pano kapsamları | Yerel hesaplar ve çalışma alanı kurtarma anahtarları |
| Proje durumu, aşamalar, görevler, zaman çizelgeleri ve yayınlar | Şifrelenmiş IndexedDB çalışma alanı kayıtları |
| Aşama bütçeleri, alacaklar ve çoklu para birimi toplamları | Şifrelenmiş cihaz, çalışma alanı ve proje yedekleri |
| Kişi, yazılım aboneliği ve maliyet şablonu kitaplıkları | Eski tarayıcı verilerinin taşınması ve işlemsel kurtarma |
| Projeyi arşivleme, geri yükleme ve kalıcı olarak silme | Alan düzeyinde denetlenen salt okunur paylaşım anlık görüntüleri |
| Masaüstü, tablet ve dar mobil ekran düzenleri | Kurulabilir PWA, çevrimdışı geri dönüş sayfası ve on iki dil seçeneği |

## Başlıca Özellikler

- **Markalar ve proje grupları** — farklı markalar oluşturun ve yeniden kullanılabilir proje grubu türleriyle çalışmaları düzenleyin.
- **Proje çalışma alanları** — durumları, aşamaları, hedefleri, görevleri, kişileri, araçları, malzemeleri, sürümleri ve etkinlik kayıtlarını izleyin.
- **Görsel zaman çizelgeleri** — her proje için aşama tarihlerini, görevleri, sorumluları, araçları, notları ve özel satırları yapılandırın.
- **Yapılandırılmış bütçeler** — vergi ve beklenmeyen gider payı dâhil olmak üzere personel, seyahat, günlük gider, dış kaynak, ek maliyet ve yazılım kalemlerini aşama bazında planlayın.
- **Maliyetler ve alacaklar** — bütçeleri, gerçekleşen maliyetleri, yazılım aboneliklerini ve proje ödeme planlarını birleştirin.
- **Yeniden kullanılabilir kitaplıklar** — kişileri, yazılım araçlarını, abonelikleri ve maliyet şablonlarını yönetin.
- **Arşiv ve taşınabilirlik** — projeleri arşivleyin, tek bir projeyi dışa aktarın veya tarayıcıdaki tüm Studio Map OS verilerini yedekleyin.
- **Salt okunur paylaşım** — proje anlık görüntüsünün zaman çizelgelerini, teslimatları, kişileri, araçları, malzemeleri, sürümleri ve maliyet önizlemelerini içerip içermeyeceğini seçin.
- **Uluslararası arayüz** — İngilizce, Basitleştirilmiş Çince, Japonca, İspanyolca, Portekizce, Almanca, Fransızca, Rusça, Türkçe, Korece, Tayca veya açıkça akademik olmayan eğlencelik Sümer çivi yazısını kullanın.

## Teknoloji

- App Router ile Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB ve Local Storage

## PWA Desteği

Studio Map OS, eksiksiz bir PWA entegrasyon yapısı içerir:

- `standalone` görüntüleme moduna ve başlangıç URL'si olarak `/login` adresine sahip bir Web App Manifest.
- 192×192, 512×512, maskelenebilir ve Apple Touch simgeleri.
- Serwist destekli otomatik Service Worker kaydı ve çalışma zamanı önbelleğe alma.
- Kök sayfa, giriş, kayıt, çevrimdışı sayfa, manifest, marka varlığı ve PWA simgeleri için ön önbelleğe alma.
- `/offline` adresinde belge gezinmesi için bir geri dönüş sayfası.
- iOS ana ekran meta verileri, tema renkleri ve `viewport-fit=cover`.
- Bağımsız Next.js sunucusunu, statik varlıkları ve bir başlatma betiğini içeren taşınabilir PWA paketi.

> [!NOTE]
> Geliştirme modu, eski önbelleklerin geliştirmeyi etkilemesini önlemek için Service Worker'ı devre dışı bırakır. Yerel Apple ID kimlik doğrulaması tam olarak [https://localhost:3305](https://localhost:3305) HTTPS kaynağını kullanmalıdır; HTTP ve diğer yerel bağlantı noktaları desteklenmez.

## Başlarken

### Gereksinimler

- Node.js 20 LTS önerilir
- npm
- Web Crypto ve IndexedDB desteğine sahip modern bir tarayıcı

### Kurulum ve Çalıştırma

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev -- --port 3305
```

İlk yerel hesabı oluşturmak için [https://localhost:3305/register](https://localhost:3305/register) adresini açın.

İlk kullanımda:

1. Bir ad, e-posta adresi ve en az sekiz karakterden oluşan bir parola girin.
2. Yeni bir çalışma alanı oluşturun.
3. Oluşturulan 16 haneli çalışma alanı kurtarma anahtarını hemen kopyalayın veya indirin.
4. Çalışma alanına girmeden önce kurtarma anahtarının güvenli biçimde saklandığını onaylayın.

> [!IMPORTANT]
> Kurtarma anahtarı, hesapla birlikte düz metin olarak saklanmaz. Parola ve kurtarma anahtarının ikisi de kaybedilir ve kullanılabilir bir yedek kalmazsa çalışma alanı verileri kurtarılamayabilir.

Mevcut yerel hesaplar [https://localhost:3305/login](https://localhost:3305/login) adresinden oturum açabilir. Herhangi bir parolayı kabul eden önceden yapılandırılmış bir hesap yoktur.

### Üretim Modu ve PWA Doğrulaması

```bash
npm run build
```

Üretim PWA'sını dağıtılmış HTTPS sitesi üzerinden doğrulayın. Yerel Apple ID kimlik doğrulaması için yalnızca yukarıdaki HTTPS geliştirme sunucusunu kullanın ve [https://localhost:3305/login](https://localhost:3305/login) adresini açın. HTTP ve diğer yerel bağlantı noktaları desteklenmez.

### Taşınabilir PWA Paketi Oluşturma

```bash
npm run package:pwa
```

Paket `output/pwa/studio-map-os-pwa/` konumuna yazılır. Bağımsız sunucuyu, PWA varlıklarını ve Windows (`START_STUDIO_MAP_OS.bat`), macOS (`START_STUDIO_MAP_OS.command`) ile Linux/macOS terminalleri (`START_STUDIO_MAP_OS.sh`) için başlatma betiklerini içerir. Bu başlatıcılar tek başına Apple ID ile uyumlu bir HTTPS kaynağı sağlamaz; yerel Apple ID kimlik doğrulaması [https://localhost:3305](https://localhost:3305) adresini kullanmalıdır.

## Ana Rotalar

| Rota | Amaç |
| --- | --- |
| `/register` | Yerel hesap ve çalışma alanı oluşturun veya şifrelenmiş bir yedekle mevcut bir çalışma alanına katılın |
| `/login` | Yerel hesabın kilidini açın, Apple / iCloud kullanın veya tam cihaz yedeğini geri yükleyin |
| `/offline` | Service Worker gezinmesi başarısız olduğunda kullanılan belge geri dönüş sayfası |
| `/dashboard` | Stüdyo genel görünümü, kapsamlar, ölçümler ve proje haritaları |
| `/companies` | Marka ve proje grubu yönetimi |
| `/company/?companyId=...` | Marka ayrıntıları ve bağlantılı proje özetleri |
| `/projects` | Tüm etkin projeler |
| `/project/?projectId=...` | Proje durumu, zaman çizelgesi, yayınlar, alacaklar ve ayarlar |
| `/project-costs/?projectId=...` | Proje bütçesi ve maliyet ayrıntıları |
| `/project-share/?projectId=...` | Salt okunur paylaşım alanı ayarları |
| `/costs` | Stüdyo düzeyinde maliyet toplamları ve görüntüleme para birimi ayarları |
| `/libraries` | Kişi, yazılım aboneliği ve maliyet şablonu kitaplıkları |
| `/workflow` | Yeniden kullanılabilir görsel iş akışı panoları, ekler, proje bağlantıları ve HTML paylaşımı |
| `/archive` | Arşivlenmiş projeler, şifreli yedekler ve yerel/CloudKit depolama denetimleri |
| `/share/?token=...` | Yerel salt okunur proje anlık görüntüsü |

## Veri ve Güvenlik Modeli

```text
React sayfaları
    ↓
lib/api içindeki yerel bağdaştırıcılar
    ↓
Bellek içi iş veritabanı
    ↓
Web Crypto şifrelemesi
    ↓
IndexedDB kalıcılığı
```

- İş verileri çalışma alanına göre yalıtılır ve şifrelenmiş IndexedDB kayıtları olarak saklanır.
- Parola, korunan çalışma alanı ana anahtarının kilidini açar; ana anahtar oturum açıldıktan sonra yalnızca bellekte kullanılır.
- 16 haneli kurtarma anahtarı, çalışma alanı ana anahtarını kurtarabilir ve şifrelenmiş yedek dosyalarının kilidini açabilir.
- Çalışma alanı kayıtları ve yedek zarfları PBKDF2, HKDF ve AES-GCM dâhil olmak üzere tarayıcı şifrelemesini kullanır.
- Tam cihaz yedeği; yerel hesapları, çalışma alanlarını, tercihleri ve şifrelenmiş veritabanı anlık görüntülerini içerir. Çalışma alanı ve proje dışa aktarımları da şifrelenir.
- Tarayıcılar kalıcı depolama isteklerini reddedebilir; bu nedenle şifrelenmiş yedekler veri korumasının temel bir parçası olmaya devam eder.

> [!WARNING]
> Bu mekanizmalar bağımsız bir güvenlik denetiminden geçmemiştir. Profesyonel anahtar yönetiminin, sunucu yedeklerinin veya kurumsal kimlik sistemlerinin yerini tutmazlar.

## Çoklu Para Birimi Maliyetleri

Mevcut hesaplama ve görüntüleme para birimleri şunlardır:

- CNY — Çin yuanı
- USD — ABD doları
- JPY — Japon yeni
- EUR — Euro

Tarayıcı referans kurlarını doğrudan Frankfurter'ın ECB destekli hizmetinden alır; bu istek başarısız olursa tarayıcı önbelleğini veya yerleşik kurları kullanır. Döviz kurları ödeme veya finansal danışmanlık için değil, stüdyo içi tahminler için tasarlanmıştır.

## Yedek Dosyaları

| Tür | İçerik | Tipik dosya adı |
| --- | --- | --- |
| Tam cihaz yedeği | Tüm yerel hesaplar, çalışma alanları, tercihler ve şifrelenmiş veriler | `studio-map-os-*.smos-backup.json` |
| Çalışma alanı yedeği | Mevcut çalışma alanının iş verileri ve tercihleri | `studio-map-os-workspace-*.smos-backup.json` |
| Proje dosyası | Tek bir proje anlık görüntüsü | `studio-map-os-project-*.smos-project.json` |

Geri yüklemeden önce yedek türünü ve kurtarma anahtarını doğrulayın. Tam cihaz geri yüklemesi, mevcut tarayıcıdaki Studio Map OS verilerinin yerini alabilir.

## Herkese Açık Paylaşımın Mevcut Sınırları

Salt okunur paylaşım kayıtları şu anda oluşturuldukları tarayıcıda ve site origin'inde kalır. Bir paylaşım URL'si yerel olarak açılabilir, ancak veriler otomatik olarak uzak bir sunucuda yayımlanmaz. Bunun sonucunda:

- Bir bağlantı farklı bir tarayıcıda, site verileri temizlendikten sonra veya başka bir cihazda çalışmayabilir.
- Bu özellik henüz internette barındırılan herkese açık bir sayfaya eşdeğer değildir.
- Cihazlar arası paylaşım; uzak depolama, erişim denetimi ve erişim iptali altyapısı gerektirir.

## Uluslararasılaştırma

Arayüz on iki dil seçeneği sunar. Sümer çivi yazısı bilinçli olarak eğlence amaçlı bir sözde çeviridir: güvenlikle ilgili metinler İngilizce yönlendirmeyi korur; tarihler, sayılar, para birimleri ve simgeler İngilizce seçeneğiyle aynı biçimi ve normal Latin arayüz yazı tipini kullanır. Akademik kullanım için değildir. Diğer yerel ayarlar özel anahtar olmadığında İngilizceye döner.

## Proje Yapısı

```text
app/                  Next.js rotaları, Manifest, Service Worker ve statik PWA giriş noktaları
components/           Sayfalar, ürün modülleri, düzen ve paylaşılan UI
lib/api/              Yerel iş API'si bağdaştırıcıları
lib/i18n/             Arayüz sözlükleri ve alan etiketleri
lib/mock/             Demo başlangıç verileri ve toplama mantığı
lib/security/         Çalışma alanı ve genel paylaşım şifrelemesi
lib/storage/          IndexedDB ve kalıcı depolama desteği
lib/types/            Alan modelleri
lib/utils/            Bütçe, para birimi, aşama ve yayın yardımcıları
public/               Marka varlıkları, PWA simgeleri ve oluşturulan Worker paketleri
scripts/              Taşınabilir PWA derleme ve paketleme betikleri
```

## Kalite Kontrolleri

```bash
npm run lint
npx tsc --noEmit --incremental false
```

Depo henüz otomatik birim veya uçtan uca testler içermemektedir. Şifreleme, taşıma, kurtarma veya bütçe hesaplamalarındaki değişiklikler birleştirilmeden önce ek doğrulamadan geçirilmelidir.

## Mevcut Sınırlamalar

- İş API'leri hâlâ tarayıcıya yerel bağdaştırıcılardır; üretim sunucusu bağlı değildir.
- Yeni projeler tamamen boş bir şablonla başlamak yerine demo proje yapısının bazı bölümlerini devralır.
- Gerçekleşen maliyetler, malzemeler ve etkinlik kayıtları için düzenleme akışları tam olarak kullanıma sunulmamıştır.
- Proje grubu ayrıntıları, paylaşım iptali ve bağlantı süre sonu denetimlerinin hâlâ bağlanması gerekir.
- Tam sayfa yenilemesi, çalışma alanının parolayla yeniden açılmasını gerektirir.
- PWA desteği entegre edilmiştir; ancak otomatik Lighthouse, kurulum akışı ve çevrimdışı uçtan uca testleri henüz yapılandırılmamıştır.
- Önbelleğe alınmamış dinamik sayfalar ve canlı ağ uç noktaları çevrimdışıyken kullanılamayabilir; çevrimdışı geri dönüş sayfası ve yerel veriler uzak API'lerin yerini tutmaz.

## Katkıda Bulunma

Issues ve Pull Requests memnuniyetle karşılanır. Bir değişiklik göndermeden önce:

1. Etkilenen sayfayı, veri modelini veya taşıma kapsamını açıklayın.
2. Hem masaüstü hem de dar ekran düzenlerini kontrol edin.
3. ESLint ve TypeScript denetimini çalıştırın.
4. Veri biçimi değişiklikleri için geriye dönük uyumluluğu ve yedekten kurtarmayı belgelendirin.

## Lisans

Bu proje Apache License 2.0 kapsamında lisanslanmıştır. Ayrıntılar için [LICENSE](./LICENSE) dosyasına bakın. Lisans, koşulları uyarınca projenin kullanılmasına, kopyalanmasına, değiştirilmesine ve dağıtılmasına izin verir.

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. Tüm hakları saklıdır.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
