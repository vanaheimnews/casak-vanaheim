# Vanaheim News: dokumentace projektu

Školní časopis **Vanaheim News** (www.vanaheim-news.cz). Nahrazuje původní WordPress. Běží zdarma na **Vercelu** (plán Hobby), platí se jen doména.

Dokument popisuje, jak web funguje, kde jsou data a jak se o web starat. Kapitola 8 popisuje incident z 31. 10. 2026, kdy se vyčerpal měsíční limit úložiště, a jeho řešení.

---

## 1. Přehled

| Co | Kde |
|---|---|
| Veřejný web | https://www.vanaheim-news.cz/ |
| Administrace | https://casak-vanaheim-git-main-vanaheim-news-projects.vercel.app (otevře `/admin`) |
| Kód | GitHub `vanaheimnews/casak-vanaheim`, větev `main` |
| Hosting | Vercel, projekt `casak-vanaheim`, tým `vanaheim-news-projects` |
| Data | Vercel Blob, úložiště `casak-vanaheim-blob` (veřejné, region FRA1) |

Web nemá žádný build ani framework. Je to čisté HTML, CSS a JavaScript plus pár serverových funkcí ve složce `api/`. **Každý push do `main` Vercel automaticky nasadí** (asi za 1 minutu).

```
 prohlížeč čtenáře                 Vercel                          Vercel Blob
 ─────────────────                 ──────                          ───────────
 index.html, article.html  ──►  statické soubory
 script.js, home-layout.js
        │  fetch /api/...
        └──────────────────────►  api/*.js (serverless)  ──►  articles.json, content.json,
                                  + CDN cache 5 min              taxonomy.json, images/, files/
 admin (jiná adresa) ─────────►  stejné api/*.js, ale s přihlášením, bez cache
```

---

## 2. Soubory v repozitáři

| Soubor | Účel |
|---|---|
| `index.html`, `script.js` | Veřejný web: Domů (bloky z editoru), Příspěvky (Filtrovat / Seřadit), O nás, Kontakt |
| `article.html` | Detail článku (`/article?id=…`), vykresluje rozložení z vizuálního editoru |
| `home-layout.js` | Vykreslování domovské stránky z bloků (sdílí ho web i admin) |
| `sanitize.js` | `VNSafe`: čištění HTML a odkazů a rozpoznání videí (YouTube, Vimeo, Instagram, TikTok, Spotify) |
| `style.css` | Styly webu i administrace |
| `admin/index.html`, `admin/admin.js` | Administrace a vizuální editor článků (velký soubor, rozdělený do sekcí s nadpisy) |
| `api/_lib.js` | Společné funkce serveru: přihlášení, **ukládání do Blobu**, tvar dat |
| `api/_taxonomy.js` | Logika seznamů štítků a autorů, bez přístupu k úložišti |
| `api/articles.js` | `/api/articles`: číst, vytvořit, upravit, smazat článek |
| `api/content.js` | `/api/content`: domovská stránka, O nás, tým, kontakty |
| `api/taxonomy.js` | `/api/taxonomy`: seznamy štítků a autorů (Upravit filtry) |
| `api/upload.js` | `/api/upload`: nahrání obrázku nebo PDF |
| `api/login.js`, `api/logout.js` | Přihlášení do adminu |
| `api/sitemap.js` | `/sitemap.xml` pro vyhledávače |
| `tools/dev/` | Lokální testovací server a testy (kapitola 10). Na web se nenasazuje |
| `vercel.json` | Přesměrování (vercel.app → doména, admin jen na své adrese) |
| `SETUP-ADMIN.md` | Jednorázové nastavení hesla a tokenu ve Vercelu |
| `.vercelignore` | Co se na web nenahrává (staré prototypy, dokumentace, `tools/`) |

Složky `editorial-news-feed-layout/`, `school-magazine/` a `vanaheim-news/` jsou staré prototypy. Na web se nenasazují.

---

## 3. Data

Všechna data jsou ve Vercel Blob, nikde jinde. Žádná databáze není.

| Soubor v Blobu | Obsah |
|---|---|
| `articles.json` | Pole všech článků (i naplánovaných) |
| `content.json` | Domovská stránka (rozložení bloků, pozadí), O nás, tým, kontakty |
| `taxonomy.json` | Seznamy štítků a autorů: `{ "tags": [...], "authors": [...] }` |
| `images/…`, `files/…` | Nahrané obrázky a PDF (každý soubor má unikátní jméno) |
| `articles-….json`, `content-….json`, `taxonomy-….json` | **Staré kopie** z doby před opravou (kapitola 8). Slouží jako záloha. Nemazat |

Článek vypadá takto:

```json
{
  "id": "a-mcx3k2-9f8a7b",
  "title": "Název",
  "body": "prostý text (pro vyhledávače a úryvky)",
  "image": "https://…/images/…jpg",
  "tags": ["Humor", "Škola"],
  "authors": ["Jan Novák"],
  "tagsUnspecified": false,
  "date": "2026-10-30",
  "publishAt": "2026-10-30T08:00:00.000Z",
  "kind": "article",
  "elements": [ { "type": "text", "content": "<p>…</p>", "x": 40, "y": 24, "width": 640, "z": 1 } ],
  "background": { "color": "", "image": "" },
  "updatedAt": "…"
}
```

- **Naplánování:** článek s `publishAt` v budoucnosti veřejnost nevidí, dokud ten čas nenastane. Žádný cron není potřeba, kontroluje se to při každém načtení.
- **`elements`** je rozložení z vizuálního editoru: textové bloky, obrázky, PDF a videa s pozicí na stránce. Stránka je široká 820 px.

---

## 4. Veřejný web

- **Domů** zobrazuje bloky, které admin poskládal v „Správa domovské stránky“.
- **Příspěvky**:
  - **Filtrovat** otevře panel se štítky a autory. U každé položky je v závorce počet vydaných příspěvků, například *Humor (5)*.
  - Uvnitř jedné sekce platí „nebo“ (stačí jeden zaškrtnutý štítek). Mezi sekcemi platí „a“ (štítek a zároveň autor).
  - Položky s nulou jsou šedé. **Zrušit filtr** vše odškrtne.
  - **Seřadit:** Od nejnovějších (výchozí) nebo Od nejstarších. Funguje dohromady s filtrem.
- **Karta článku** ukazuje štítky. Když článku zmizel poslední štítek, protože ho admin smazal, karta ukáže šedé **„nespecifikováno“**. Není to skutečný štítek a ve filtrech se nikdy neobjeví.
- Prohlížeč si poslední data pamatuje (localStorage), takže se stránka při dalším otevření zobrazí hned a pak se obnoví ze serveru.
- Nový článek se na veřejném webu objeví **nejpozději zhruba za 5 minut**. Tolik trvá cache na Vercelu. V adminu je vidět hned.

---

## 5. Administrace

**Přihlášení:** jen na adrese administrace (kapitola 1). Ta je chráněná přihlášením k Vercel účtu (Deployment Protection) a navíc heslem `ADMIN_PASSWORD`. Na veřejné doméně admin nefunguje vůbec. Podrobnosti jsou v `SETUP-ADMIN.md`.

### Správa příspěvků
- Karty všech článků, i naplánovaných, s filtrem podle štítků a autorů. Počty tady zahrnují i naplánované články.
- **+ Nový příspěvek** nebo klik na kartu otevře **vizuální editor**:
  - Bloky (text, obrázek nebo PDF, video či příspěvek ze sociální sítě) se přetahují a mění jim velikost. Zarovnávací vodítka pomáhají s umístěním.
  - Formátování textu: písmo, velikost, B/I/U, barva, zarovnání, seznamy, odsazení. Nové formátování platí pro označený text, a to hned napoprvé.
  - Kopírování bloku: Ctrl+C a Ctrl+V.
  - Stránka se sama prodlužuje dolů jako ve Wordu.
  - Klik mimo blok výběr zruší.
  - Vlevo je panel **Data**: autoři, štítky (výběr ze seznamu), typ, datum a čas vydání (budoucí čas = naplánováno), náhledový obrázek.
  - **Vydat** uloží. **Zpět** zahodí změny. **Smazat** smaže článek.

### Upravit filtry (štítky a autoři)
- Štítky a autory lze **vytvářet jen tady**. V editoru se už nepíšou ručně, jen vybírají ze seznamu.
- Klik na položku nabídne **Upravit** (přejmenování) a **Smazat**.
- **Přidat:** když název už existuje, i s jinou velikostí písmen, nepřidá se a nad polem se ukáže červené **„duplikát“**.
- **Přejmenování** se propíše do všech článků.
- **Smazání** odebere štítek ze všech článků. Článek, kterému žádný štítek nezbude, ukáže „nespecifikováno“.
- U autorů funguje mazání stejně, jen bez náhradního textu.
- Název „nespecifikováno“ je vyhrazený, takový štítek nejde vytvořit.

### Ostatní záložky
- **Správa domovské stránky:** skládání bloků (text nebo karta článku ve velikosti A až D), pozadí. Změny se projeví na webu až po **Uložit stránku**.
- **Správa O nás** a **Správa Kontaktů:** text, tým, kontakty.

---

## 6. Ukládání dat do Blobu (`api/_lib.js`)

Úložiště Blob nemá databázové transakce. Proto má každý soubor (`articles.json`, `content.json`, `taxonomy.json`) **jedno pevné jméno a přepisuje se**:

- **Čtení:** `head()` zjistí aktuální verzi (ETag). To je levná „simple“ operace. Pak se stáhne `…/articles.json?v=<ETag>`. Každá verze má vlastní adresu, takže cache nikdy nevrátí stará data a opakované čtení stejné verze je zdarma. Běžící funkce si navíc stažená data drží v paměti, dokud se verze nezmění.
- **Zápis:** `put(…, { allowOverwrite: true, ifMatch: <ETag, který byl přečten> })`. Uloží se jen tehdy, když mezitím nikdo jiný neuložil. Jinak server změnu zopakuje na novějších datech, nejvýš 8×, s krátkými náhodnými pauzami. **Souběžné ukládání dvou adminů se proto nikdy nepřepíše.** Kdyby to ani tak nevyšlo, admin dostane hlášku „Data se právě měnila z jiného místa, zkuste to prosím znovu.“ a nic se neztratí.
- **Kaskáda u štítků** (přejmenování a smazání) nejdřív zapíše články, pak seznam. Když se zápis seznamu nepovede, články se vrátí do původního stavu.
- **Veřejné odpovědi** (`/api/articles`, `/api/content`, `/api/taxonomy` na veřejné doméně) drží CDN Vercelu 5 minut. Většina návštěv proto vůbec nesáhne do úložiště.
- **Veřejný výpis článků** obsahuje jen to, co potřebují karty: název, obrázek, datum, štítky, autory a úryvek textu. Celý článek se načítá zvlášť (`?id=`).
- **Migrace:** když pevný soubor ještě neexistuje, první čtení zkopíruje nejnovější starou kopii (`articles-….json`). Na to stačí jedno volání `list()`. Staré kopie zůstanou jako záloha.

---

## 7. Limity plánu Hobby (zdarma)

| Položka | Limit za měsíc | Co ji spotřebovává |
|---|---|---|
| Advanced operations | **2 000** | každé nahrání souboru (`put`), výpis souborů (`list`), **i prohlížení úložiště v dashboardu Vercelu** |
| Simple operations | 10 000 | `head()`, čtení souboru, který není v cache |
| Data transfer | 10 GB | stahování z Blobu (obrázky, JSON) |
| Storage | 1 GB | velikost úložiště (teď kolem 70 MB) |

**Při překročení Vercel úložiště zablokuje na 30 dní.** Každé čtení pak vrací chybu 403, web nenačte články a admin nic neuloží. Data se nesmažou. Vercel posílá e-mail, když se limit blíží.

**Odhad běžného provozu po opravě** (kolem 8 článků měsíčně):

| Akce | Advanced operací |
|---|---|
| Nahrání obrázku nebo PDF | 1 |
| Uložení článku, domovské stránky nebo O nás | 1 |
| Změna v Upravit filtry | 1–2 |
| Čtení webu návštěvníkem | **0** |
| **8 článků × asi 10 obrázků + uložení** | **asi 120 z 2 000** |

**Pozor na:**
- **Prohlížení úložiště v dashboardu Vercelu** (Storage → Blob → Manage Blobs). Každé otevření nebo obnovení seznamu se počítá do limitu. Neotvírat zbytečně.
- **Hromadný import** (stovky obrázků najednou). Rozdělit do více měsíců, nebo ho dělat s dočasným plánem Pro.
- Velikost `articles.json`, teď kolem 1,2 MB: roste s každým článkem a ukrajuje z limitu přenosu. Díky cache a štíhlému výpisu to dlouho stačí. Až by se blížil limit 10 GB, dá se archiv rozdělit (třeba po rocích).

---

## 8. Incident 31. 10. 2026: vyčerpaný limit operací

### Co se stalo
Po importu příspěvků z původního webu skončilo uložení článku chybou **„Blob read of articles failed: HTTP 403“**. Pak přestal fungovat celý web, nejen admin. Dashboard Vercelu ukázal:

> *You have reached your usage limits for this store using the Hobby plan. Access resumes on 30.11.26.*
> Advanced Operations **2,1k / 2k** (ostatní v normě: Simple 699 / 10k, přenos 417 MB / 10 GB, úložiště 67 MB / 1 GB)

### Proč
Původní způsob ukládání (z doby před 31. 10.) zapisoval při **každém uložení nový soubor** `articles-<náhodné>.json`. Protože nevěděl, který je nejnovější, volal při **každém čtení** `list()`, a to je „advanced“ operace:

| Akce | Advanced operací (staré) |
|---|---|
| Jedno zobrazení webu (články + obsah + štítky) | asi 3 |
| Jedno uložení článku | asi 4–5 (`list` při čtení, `put`, `list` při úklidu, kontroly) |
| Nahrání obrázku | 1 |

Import celého roku a půl (desítky článků, stovky obrázků, opakované ukládání) spolu s běžnými návštěvami vyčerpal 2 000 operací za pár dní.

### Řešení (commity `6dca677` a `c4eb4f9`)
1. Pevná jména souborů se čtením přes `head()` a ETag, takže čtení **nestojí žádnou advanced operaci** (kapitola 6).
2. Zápis jednou podmíněnou operací `put` (**1 operace** místo 4–5), navíc s ochranou proti souběžnému ukládání.
3. CDN cache na 5 minut pro veřejné odpovědi a paměťová cache ve funkcích.
4. Štíhlý veřejný výpis článků (méně přenesených dat).
5. Knihovna `@vercel/blob` aktualizována z 0.27 na 2.x (kvůli `head`, `ifMatch` a `allowOverwrite`).
6. Automatická migrace starých kopií při prvním čtení.

### Co musí udělat správce
Opravený kód je nasazený, ale **dokud je úložiště zablokované, nefunguje nic**. Možnosti:
- **Počkat do 30. 11. 2026.** Pak se vše samo rozběhne a data se převedou do nového formátu.
- **Dočasně přejít na Pro** (nejdřív zkusit Pro trial zdarma, jinak asi 20 USD za měsíc). Úložiště se odemkne hned. **Zpět na Hobby přejít až kolem 30. 11.**, aby se úložiště nezablokovalo znovu (na Hobby se znovu počítá už vyčerpaný limit).

### Po odemčení zkontrolovat
- Otevřít web a admin a ověřit, že jsou všechny články na místě. **Uložení, které skončilo chybou 403, se neprovedlo:** příspěvek vydat znovu.
- Ověřit, že import doběhl celý. Limit mohl dojít uprostřed.
- V Blobu by se měly objevit soubory `articles.json`, `content.json` a `taxonomy.json` s pevným jménem. Staré kopie (`articles-….json` atd.) ponechat jako zálohu.

---

## 9. Provoz a údržba

### Proměnné prostředí (Vercel → Settings → Environment Variables)
| Proměnná | Účel |
|---|---|
| `ADMIN_PASSWORD` | Heslo do adminu. Změna odhlásí všechna zařízení |
| `BLOB_READ_WRITE_TOKEN` | Přístup k Blobu (Vercel ho přidá sám při připojení úložiště) |
| `SESSION_SECRET` | Volitelné: přídavné tajemství pro podpis přihlášení |
| `ADMIN_HOST` | Volitelné: jiná adresa adminu (po přejmenování projektu nebo týmu) |

Po změně proměnné je potřeba nové nasazení (Deployments → ⋯ → Redeploy).

### Zálohy a obnova
- **Ruční záloha:** stáhnout `articles.json` a `content.json` ze stránky úložiště v dashboardu. Jedno stažení stojí jen pár operací, ale nedělat to často, viz kapitola 7.
- **Obnova:** nahrát zálohu pod přesně stejným jménem (`articles.json`) a přepsat stávající soubor. Staré kopie `articles-….json` z doby před 31. 10. jsou plnohodnotná záloha stavu k danému okamžiku.

### Když něco nefunguje
| Příznak | Příčina a řešení |
|---|---|
| Chyba 403 při čtení nebo ukládání, web bez článků | Vyčerpaný limit Blobu (kapitola 7 a 8). V dashboardu je červený pruh s datem odemčení |
| „Vypršela platnost přihlášení“ | Přihlásit se znovu, rozpracovaná práce v editoru zůstane |
| „Data se právě měnila z jiného místa…“ | Někdo jiný ukládal ve stejnou chvíli. Kliknout znovu |
| Nový článek není na webu | Počkat 5 minut (cache). Zkontrolovat datum vydání, jestli není v budoucnosti |
| Admin na veřejné doméně přesměruje na úvod | Je to záměr, admin běží jen na své adrese (kapitola 1) |

---

## 10. Vývoj a testování

Vývoj byl veden pomocí Claude Code. Pro další úpravy stačí jakýkoli editor a Node.js 20 nebo novější. Na původním počítači nebyl Node v PATH, použil se ten, který je přibalený k editoru Cursor: `…\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe`.

**Lokální test bez rizika pro ostrá data**, spuštěný z kořene repozitáře:

```bash
node --import ./tools/dev/register.mjs tools/dev/devserver.mjs
```

- Web běží na http://localhost:8765 a admin na http://localhost:8765/admin s heslem `test`.
- Spouští se **skutečné** soubory `api/*.js`, jen místo Vercel Blob se použije úložiště v paměti (`tools/dev/fake-blob.mjs`). Po restartu se smaže.
- Na http://localhost:8765/__ops je vidět, kolik simple a advanced operací co stálo. Hodí se při změnách ukládání.
- Lokálně jsou web i admin na stejné adrese. Po přihlášení proto i veřejná stránka dostává data jako admin, včetně naplánovaných článků.

**Testy logiky štítků a autorů:**

```bash
node tools/dev/taxonomy.test.mjs
```

**Kontrola syntaxe** před pushem: `node --check api/articles.js` a podobně pro změněné soubory.

**Nasazení:** commit a push do `main` (Vercel nasadí sám). Na každou změnu ukládání (kapitola 6) dát zvláštní pozor a vyzkoušet ji lokálně. Chyba tam může vyčerpat limit nebo poškodit data.

---

## 11. Známé limity a možná vylepšení

- **Formátování přes klávesy Ctrl+B, I a U v textu** vkládá značky `<b>`, `<i>` a `<u>`. Tlačítka v liště je umí zrušit, ale vypínání stylu pro celý blok (ne pro označený text) je nemusí všechny odstranit.
- **Editor domovské stránky** sdílí lištu formátování s editorem článků. Dvě okrajové situace (rychlé přepínání bloků během načítání) se nijak nevyřešily.
- **Velikost `articles.json`** roste (kapitola 7). Při velkém množství článků zvážit rozdělení po rocích.
- **Hlídání limitu:** Vercel posílá e-mail, když se limit blíží. Stojí za to mít jako kontaktní e-mail účtu adresu, kterou někdo čte.
