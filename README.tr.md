<h1 align="center">Valorant API (resmî olmayan) · ugiAPI</h1>

<p align="center">
  Valorant oyuncu verileri için ücretsiz REST API: <b>rank ve RR geçmişi, headshot % / ADR / ilk kill içeren maç geçmişi, kayıtlı maç istatistikleri, liderlik tablosu ve webhook'lar</b>.<br>
  Resmî JavaScript ve Python istemcileri dahil.
</p>

<p align="center">
  <a href="https://api.ugilabs.com/docs/"><img alt="Doküman" src="https://img.shields.io/badge/docs-api.ugilabs.com-10b981?style=for-the-badge"></a>
  <img alt="API sürümü" src="https://img.shields.io/badge/API-v1.2.0-3f3f46?style=for-the-badge">
  <a href="https://api.ugilabs.com/status"><img alt="Durum" src="https://img.shields.io/badge/status-live-10b981?style=for-the-badge"></a>
  <a href="LICENSE"><img alt="Lisans" src="https://img.shields.io/badge/license-MIT-3f3f46?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://api.ugilabs.com/docs/">Doküman</a> ·
  <a href="https://api.ugilabs.com/examples">Örnekler</a> ·
  <a href="https://api.ugilabs.com/openapi.json">OpenAPI</a> ·
  <a href="https://api.ugilabs.com/changelog">Sürüm notları</a> ·
  <a href="https://api.ugilabs.com/status">Durum</a> ·
  <a href="README.md">English</a>
</p>

---

## İçindekiler

- [Hızlı başlangıç](#hızlı-başlangıç)
- [API anahtarı alma](#api-anahtarı-alma)
- [Uç noktalar](#uç-noktalar)
- [İstemciler (JavaScript, Python)](#istemciler)
- [Paketler ve limitler](#paketler-ve-limitler)
- [Yanıt başlıkları](#yanıt-başlıkları)
- [Hatalar](#hatalar)
- [Webhook'lar](#webhooklar)
- [Kurallar](#kurallar)
- [Yasal](#yasal)

## Hızlı başlangıç

```bash
curl "https://api.ugilabs.com/v1/rank/eu/Isim/Etiket" \
  -H "Authorization: Bearer API_ANAHTARINIZ"
```

```json
{
  "status": 200,
  "data": {
    "name": "Isim",
    "tag": "Etiket",
    "puuid": "6f1d2c3b-…",
    "current_data": { "currenttier": 21, "currenttierpatched": "Ascendant 1", "ranking_in_tier": 47, "wins": 31, "games": 58 },
    "peak": { "tier": 22, "tier_patched": "Ascendant 2", "source": "win" },
    "by_season": [ … ]
  }
}
```

**JavaScript** (Node.js 18+, bağımlılık yok)

```bash
npm install github:bnsware/valorant-api-unofficial
```

```js
import { UgiApi } from 'ugiapi';

const api = new UgiApi({ apiKey: process.env.UGIAPI_KEY });
const { data } = await api.getMatches({ region: 'eu', name: 'Isim', tag: 'Etiket', mode: 'competitive', size: 5 });
for (const m of data.matches) console.log(m.map_details?.name, m.player.stats.kills, m.player.combat?.headshot_pct);
```

**Python** (3.8+)

```bash
pip install "git+https://github.com/bnsware/valorant-api-unofficial#subdirectory=python"
```

```python
from ugiapi import UgiApi

api = UgiApi("API_ANAHTARINIZ")
ozet = api.get_stored_matches("eu", "Isim", "Etiket", mode="competitive").data["summary"]
print(ozet["win_pct"], ozet["kd"], ozet["headshot_pct"], ozet["adr"])
```

## API anahtarı alma

1. Geliştirici paneline gidin: **https://api.ugilabs.com/panel/**
2. Discord ile giriş yapın.
3. Anahtar oluşturun. Anahtarı sunucunuzun IP adreslerine ya da sitenizin origin'lerine kısıtlayabilirsiniz.

Anahtarı `Authorization: Bearer API_ANAHTARINIZ` (önerilen) ya da `X-API-Key: API_ANAHTARINIZ` başlığıyla gönderin. `?api_key=` de çalışır (Twitch botları için işe yarar) ama loglarda görünür.

> Anahtarınızı herkese açık koda, tarayıcıya giden JavaScript'e ya da ekran görüntüsüne koymayın. Sızarsa panelden yenileyin.

## Uç noktalar

Taban adres: `https://api.ugilabs.com` · tüm uç noktalar `GET` · bölgeler: `eu`, `na`, `ap`, `kr`, `br`, `latam`

Riot ID alan her yolun `/v1/by-puuid/…` altında bir PUUID sürümü de vardır.

| Uç nokta | Ne döner |
| --- | --- |
| `/v1/account/{name}/{tag}` | PUUID, Riot ID, hesap seviyesi, oyuncu kartı ve unvan |
| `/v1/rank/{region}/{name}/{tag}` | Güncel kademe ve RR, bu act'teki galibiyet ve maç sayısı, **tüm zamanların zirvesi** ve act bazlı özet |
| `/v1/rank-history/{region}/{name}/{tag}` | Son 1–10 rekabetçi maç: kazanılan RR, önceki/sonraki kademe ve RR, performans bonusu, **RR iadeleri**, **düşüş koruması** |
| `/v1/matches/{region}/{name}/{tag}` | K/D/A, **headshot %, ADR, ilk kill/ölüm ve ekonomi** ile son maçlar. `?mode=` ile filtreleyin, `?start=` ile sayfalayın |
| `/v1/stored-matches/{region}/{name}/{tag}` | Maç depomuzdan uzun dönem maç listesi: filtreler (mod, harita, ajan, act), sayfalama ve **özet** (kazanma %, K/D, HS %, ADR, ACS). **Riot sorgu maliyeti yok** |
| `/v1/match/{matchId}` | Maçın tamamı: tüm oyuncular, istatistik ve isabet/hasar sayıları, takımlar, ilk kill bilgili turlar |
| `/v1/leaderboard/{region}` | Rekabetçi liderlik tablosu (act, sayfa, isimle arama) |
| `/v1/content` | Ajanlar, haritalar, act'ler, oyun modları, oyuncu kartları ve unvanlar (`en-US`, `tr-TR`) |
| `/v1/status/{region}` | Riot servis durumu (**anahtar gerekmez**) |

`mode` değerleri: `competitive`, `unrated`, `swiftplay`, `spikerush`, `deathmatch`, `teamdeathmatch`, `premier`, `escalation`, `replication`, `snowball`, `newmap`, `custom`.

Tüm parametreler ve alanlar: **https://api.ugilabs.com/docs/** · makinece okunabilir: [`openapi.json`](openapi.json) (OpenAPI 3.1; Postman'e aktarın ya da kendi istemcinizi üretin).

## İstemciler

| Dil | Klasör | Kurulum |
| --- | --- | --- |
| JavaScript / TypeScript | [`js/`](js/) | `npm install github:bnsware/valorant-api-unofficial` |
| Python | [`python/`](python/) | `pip install "git+https://github.com/bnsware/valorant-api-unofficial#subdirectory=python"` |

İki istemci de:

- tüm uç noktaları tipleriyle kapsar (TypeScript tanımları dahil)
- `{ data, meta }` döndürür: `meta` önbellek durumunu, kalan istekleri, Riot sorgu bütçesini ve çağrının maliyetini taşır
- `429`/`503` yanıtlarını `Retry-After` ile otomatik tekrar dener (günlük kota hatalarında asla)
- ETag destekler (`304 Not Modified`)
- sabit bir `code` ve `request_id` içeren tipli hata fırlatır
- webhook imza doğrulayıcısı içerir

Örnekler: [Discord botu](js/examples/discord-bot.js) · [oyuncu istatistikleri](js/examples/player-stats.js) · [webhook sunucusu](js/examples/webhook-server.js) · [Python Discord botu](python/examples/discord_bot.py) · [Python oyuncu istatistikleri](python/examples/player_stats.py) · [Flask webhook](python/examples/webhook_flask.py)

Başka bir dil mi kullanıyorsunuz? [`openapi.json`](openapi.json) dosyasından [OpenAPI Generator](https://openapi-generator.tech/) ile istemci üretebilirsiniz.

## Paketler ve limitler

| | Basic | Advanced | Premium |
| --- | :-: | :-: | :-: |
| İstek başına maç (`/v1/matches`) | 5 | 10 | 20 |
| Sayfa başına kayıtlı maç | 20 | 50 | 100 |
| Webhook | – | ✓ | ✓ |
| `?force=true` (önbelleği atla) | – | – | ✓ |

Her anahtarın **dakikalık** ve **günlük** istek limiti ile bir **Riot sorgu bütçesi** vardır: yalnız önbellekte olmayan sorgular bütçeden düşer. Veriler ortak önbellekten sunulur; canlı verinin (rank, rank geçmişi, maç listesi) ne kadar taze olduğu paketinize bağlıdır. Güncel rakamlar: **https://api.ugilabs.com/docs/#rate-limiting**.

## Yanıt başlıkları

| Başlık | Anlamı |
| --- | --- |
| `X-Cache`, `Age`, `X-Cache-TTL` | Önbellekten mi geldi, verinin yaşı, paketiniz için kaç saniye daha taze sayılacağı |
| `ETag` / `If-None-Match` | ETag'i geri gönderin, veri değişmediyse `304 Not Modified` alırsınız |
| `X-RateLimit-Limit / -Remaining / -Reset` | Dakikalık istek limiti (günlük için `-Daily-*`) |
| `X-RateLimit-Upstream-*` | Riot sorgu bütçesi (dakika ve gün) |
| `X-Upstream-Cost` | Bu isteğin harcadığı Riot sorgusu (`0` = önbellekten) |
| `RateLimit-Policy`, `RateLimit` | Aynı limitler IETF biçiminde: `"minute"`, `"day"`, `"riot-minute"`, `"riot-day"` pencereleri |
| `Retry-After` | `429` ve `503` yanıtlarında beklenecek saniye |
| `X-Request-Id` | Destek isterken bunu da gönderin |

## Hatalar

```json
{ "status": 404, "error": "Player not found", "code": "player_not_found", "request_id": "ab85df05829198f2" }
```

Mesaja göre değil, `code` alanına göre dallanın.

| HTTP | Kodlar |
| :-: | --- |
| 400 | `bad_request`, `missing_parameters`, `invalid_region`, `invalid_name`, `invalid_tag`, `invalid_puuid`, `invalid_match_id`, `invalid_act`, `invalid_locale`, `invalid_mode`, `invalid_map`, `invalid_agent`, `invalid_parameter`, `force_not_allowed` |
| 401 | `api_key_missing`, `api_key_invalid` |
| 403 | `ip_not_allowed`, `origin_not_allowed` |
| 404 | `player_not_found`, `not_found`, `endpoint_not_found` |
| 429 | `rate_limited`, `daily_quota_exceeded`, `user_daily_quota_exceeded`, `upstream_budget_exceeded` — `Retry-After` kadar bekleyin |
| 503 | `service_unavailable`, `maintenance` — `Retry-After` kadar bekleyin |

## Webhook'lar

Sürekli sorgulamak yerine biz size haber verelim. Paneldeki **https://api.ugilabs.com/panel/webhooks** sayfasından takip edilecek oyuncuları ekleyin; şu olaylarda imzalı bir `POST` alırsınız:

- `match.new` — oyuncu bir maçı bitirdi (K/D/A, ajan, harita ve sonuçla)
- `rank.changed` — kademe ya da RR değişti
- `account.level_changed`
- `webhook.test`

Her gönderimi doğrulayın: `X-UGI-Signature: sha256=HMAC_SHA256(secret, X-UGI-Timestamp + "." + ham_gövde)`. 5 dakikadan eski zaman damgalarını reddedin, 5 saniye içinde `2xx` dönün ve daha önce işlediğiniz `X-UGI-Delivery` kimliklerini atlayın. İki istemcide de doğrulayıcı var:

```js
import { verifyWebhook } from 'ugiapi';
const ok = await verifyWebhook({ secret, body: hamGovde, signature: req.headers['x-ugi-signature'], timestamp: req.headers['x-ugi-timestamp'] });
```

## Kurallar

ugiAPI'yi kullanarak [Kullanım Koşulları](https://api.ugilabs.com/legal/terms)'nı kabul etmiş olursunuz. Kısaca:

- API anahtarınızı üçüncü kişilerle paylaşmayın.
- Anahtarınıza tanımlı hız ve kota sınırlarını aşmaya çalışmayın.
- Hizmeti yasa dışı amaçlarla kullanmayın.
- Sistemi tersine mühendislikle çözmeye veya kötüye kullanmaya çalışmayın.
- Verileri diğer oyuncuları taciz etmek, takip etmek veya onlara zarar vermek için kullanmayın.

## Yasal

ugiAPI, Riot Games tarafından desteklenmemektedir ve Riot Games'in ya da Riot Games mülklerinin üretimi veya yönetimiyle resmî olarak ilgili kimsenin görüşlerini yansıtmaz. Riot Games, Valorant ve ilgili tüm mülkler Riot Games, Inc.'in ticari markaları veya tescilli ticari markalarıdır.

Bu repodaki istemci kodu [MIT Lisansı](LICENSE) ile yayınlanmıştır. API'nin kendisi "olduğu gibi" sunulur; çalışma süresi veya verilerin doğruluğu garanti edilmez.

Ajan, harita ve rank görselleri [valorant-api.com](https://valorant-api.com) kaynaklıdır.
