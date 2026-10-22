// Rezeki Hartanah — server-side SEO layer (Netlify Edge Function).
// For every public page it fetches the live content from Supabase and writes the page's real
// title, description, canonical, Open Graph tags, JSON-LD and visible content INTO the HTML,
// so Google, WhatsApp and Facebook see the right thing without running JavaScript.
// The browser app then takes over and keeps everything interactive.

const SITE = "https://rezekihartanah.com";
const SB = "https://dttxithovvlmgeyahllk.supabase.co";
const KEY = "sb_publishable_tfu0vwZQBNcTTTtc19Yv4g_VLDNNrw1";
const WA = "60179526848";
const TYPE = { condo: "Kondominium", serviced: "Serviced Residence", apartment: "Apartment", terrace: "Rumah Teres", semid: "Rumah Berkembar", bungalow: "Banglo", townhouse: "Townhouse", soho: "SOHO / SOVO", affordable: "Rumah Mampu Milik", land: "Tanah", shop: "Kedai / Shoplot", office: "Pejabat", factory: "Kilang / Gudang" };
const STATUS = { new: "Pelancaran baharu", construction: "Dalam pembinaan", completed: "Telah siap", upcoming: "Akan datang", soldout: "Habis dijual" };
const COM = ["land", "shop", "office", "factory"];
const DEFAULT_TITLE = "Rezeki Hartanah | Projek Hartanah Baharu & Siap";
const DEFAULT_DESC = "Bandingkan projek hartanah baharu, siap & komersial di Klang Valley: harga, saiz, ansuran bulanan, susun atur serta pembiayaan bank & LPPSA.";

let cache = { at: 0, seed: null };
async function seed() {
  if (cache.seed && Date.now() - cache.at < 10000) return cache.seed; // short server cache: a saved change reaches Google-visible HTML within ~10 s
  const r = await fetch(SB + "/rest/v1/rpc/public_seed", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("seed " + r.status);
  const d = await r.json();
  cache = { at: Date.now(), seed: d };
  return d;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const rm = (n) => "RM" + Math.round(num(n)).toLocaleString("en-MY");
const rmShort = (n) => { n = num(n); if (!n) return ""; return n >= 1e6 ? "RM" + (Math.round(n / 1e5) / 10) + "j" : "RM" + Math.round(n / 1e3) + "k"; };
const clip = (s, n) => { s = String(s || "").trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…"; };
const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const pmt = (p, r, y) => { r = r / 100 / 12; const n = y * 12; return p ? (r ? p * r / (1 - Math.pow(1 + r, -n)) : p / n) : 0; };
const monthly = (p, rate) => num(p.mon) || Math.round(pmt(num(p.pmin), rate, 35));
const abs = (u) => (/^\/_blob\//.test(u) ? SITE + u : u);
const photos = (p) => { const ok = (v) => /^\/_blob\/[a-f0-9]{32}$/.test(v || ""); const a = (Array.isArray(p.photos) ? p.photos : []).filter(ok); if (!a.length && ok(p.image)) a.push(p.image); return a.map(abs); };
const sizeTxt = (p) => !p.smin ? "" : (p.smax && p.smax !== p.smin ? num(p.smin).toLocaleString() + "–" + num(p.smax).toLocaleString() + " sqft" : num(p.smin).toLocaleString() + " sqft");
const bedTxt = (p) => !p.bmax ? "" : ((p.bmin === 0 ? "Studio" : p.bmin) + (p.bmin === p.bmax ? "" : "–" + p.bmax) + " bilik");
const ld = (o) => `<script type="application/ld+json" id="ld-ssr">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

function visible(d) {
  const ps = (d.projects || []).filter((p) => p && p.slug && !p.deleted && p.published !== false && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug));
  return ps;
}
const crumbs = (items) => ({ "@type": "BreadcrumbList", "itemListElement": items.map(([n, u], i) => ({ "@type": "ListItem", "position": i + 1, "name": n, "item": u })) });

// ----- English versions (must match the website's SEO core exactly) -----
const trSrc = (p) => JSON.stringify({ summary: String(p.summary || ""), hl: (p.hl || []).map(String), fac: (p.fac || []).map(String) });
const trHash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
const enSig = (p) => { const e = (p.tr && p.tr.en) || {}; return trHash(String((p.tr && p.tr.h) || "") + "|" + JSON.stringify({ s: String(e.summary || ""), hl: (e.hl || []).map(String), fac: (e.fac || []).map(String), mt: String(p.metaTitleEn || ""), md: String(p.metaDescEn || "") })); };
const enStatus = (p) => { if (!p || !p.tr || !p.tr.en || p.tr.h !== trHash(trSrc(p))) return "missing"; if (String(p.summary || "").trim() && !String(p.tr.en.summary || "").trim()) return "missing"; return p.trEnOk && p.trEnOk === enSig(p) ? "verified" : "auto"; };
const enIndexable = (p) => !p.deleted && p.published !== false && !p.redirectTo && !p.noindex && enStatus(p) === "verified";
const pUrl = (p, lang) => SITE + (lang === "en" ? "/en/listings/" : "/listings/") + p.slug;
const alts = (p) => (enIndexable(p) ? [["ms", pUrl(p)], ["en", pUrl(p, "en")], ["x-default", pUrl(p)]] : []);
// text shown on a page in a language: the stored translation when it belongs to the current source text
// shared facility dictionary — identical to the website's (index.html), so Google sees the same names as visitors
/* ===== Shared facility-name dictionary (English ⇄ Bahasa Malaysia) =====
   Applied to every project's facilities on display, in both languages. The stored text is never changed.
   Proper names (e.g. "Straits Gate") are not in the list, so they stay as written. */
const FAC_DICT=[["Swimming Pool","Kolam Renang"],["Infinity Swimming Pool","Kolam Renang Infiniti"],["Infinity Pool","Kolam Infiniti"],["50-Metre Infinity Swimming Pool","Kolam Renang Infiniti 50 Meter"],["Lap Pool","Kolam Renang Pusingan"],["Rooftop Swimming Pool","Kolam Renang Bumbung"],
 ["Wading Pool","Kolam Renang Cetek"],["Kids Pool","Kolam Kanak-kanak"],["Children's Pool","Kolam Kanak-kanak"],["Spa Pool","Kolam Spa"],["Jacuzzi","Jakuzi"],["Wet Play Area","Kawasan Permainan Air"],["Water Features","Ciri Air"],["Water Feature","Ciri Air"],
 ["Recreational Pickleball Court","Gelanggang Pickleball Rekreasi"],["Pickleball Court","Gelanggang Pickleball"],["Indoor Basketball Court","Gelanggang Bola Keranjang Dalaman"],["Basketball Court","Gelanggang Bola Keranjang"],["Badminton Court","Gelanggang Badminton"],["Tennis Court","Gelanggang Tenis"],["Multipurpose Court","Gelanggang Serbaguna"],["Futsal Court","Gelanggang Futsal"],
 ["Gym Room","Bilik Gimnasium"],["Gymnasium","Gimnasium"],["Gym","Gimnasium"],["Outdoor Gym","Gimnasium Luar"],["Calisthenics Area","Kawasan Kalistenik"],["Jogging Path","Laluan Joging"],["Jogging Track","Trek Joging"],
 ["Yoga Deck","Dek Yoga"],["Yoga Room","Bilik Yoga"],["Yoga Studio","Studio Yoga"],["Yoga and Dance Room","Bilik Yoga dan Tarian"],["Meditation & Yoga Deck","Dek Meditasi & Yoga"],["Pilates Room","Bilik Pilates"],["Dance Studio","Studio Tarian"],
 ["Putting Green","Padang Latihan Golf (Putting Green)"],["Golf Simulator","Simulator Golf"],["Reflexology Path","Laluan Refleksologi"],["Reflex Path / Green","Laluan Refleksologi / Laman Hijau"],
 ["Playground","Taman Permainan"],["Children's Playground","Taman Permainan Kanak-kanak"],["Kids Playground","Taman Permainan Kanak-kanak"],["Tadika Outdoor Playground","Taman Permainan Luar Tadika"],["Kindergarten Outdoor Playground","Taman Permainan Luar Tadika"],["Snakes and Ladders Playground","Taman Permainan Ular Tangga"],
 ["Multipurpose Hall","Dewan Serbaguna"],["Multipurpose Hall & Pantry","Dewan Serbaguna & Pantri"],["Multipurpose Room","Bilik Serbaguna"],["Multipurpose Space","Ruang Serbaguna"],["Function Room","Bilik Majlis"],["Pre-Function Area","Ruang Pra-Majlis"],
 ["Wellness Centre & Game Room","Pusat Kesejahteraan & Bilik Permainan"],["Wellness Dome","Kubah Kesejahteraan"],["Wellness Garden","Taman Kesejahteraan"],["Library & AV Room","Perpustakaan & Bilik Audio Visual"],["Library","Perpustakaan"],["Multigenerational Gathering Space","Ruang Perhimpunan Pelbagai Generasi"],
 ["BBQ Area","Kawasan BBQ"],["BBQ Deck","Dek BBQ"],["BBQ Pavilion","Pavilion Barbeku"],["BBQ Pit","Tapak BBQ"],["Picnic Space","Ruang Berkelah"],["Picnic Area","Kawasan Berkelah"],["Picnic Meadow","Padang Berkelah"],["Enchanted Forest","Hutan Pesona"],
 ["Pavilion","Pavilion"],["Gazebos","Gazebo"],["Gazebo","Gazebo"],["Poolside Pavilion","Pavilion Tepi Kolam"],["Poolside Deck","Dek Tepi Kolam"],["Scent Sunken Lawn / Garden","Laman / Taman Wangian Rendah"],["Sunken Seat","Ruang Duduk Rendah"],["Gravel Swale","Alur Kerikil"],
 ["Open Lawn","Laman Terbuka"],["Green Lawn","Laman Hijau"],["Trellis","Teralis"],["Canopy Walkway","Laluan Berkanopi"],["Herb Farm","Kebun Herba"],["Herb Garden","Kebun Herba"],["Urban Farm","Kebun Bandar"],["Community Garden","Kebun Komuniti"],["Rooftop Urban Farming","Pertanian Bandar di Bumbung"],
 ["Seating Pods","Pod Tempat Duduk"],["Retail / Shop Lots","Runcit / Lot Kedai"],["Shop Lots","Lot Kedai"],["Convenience Shop Space","Ruang Kedai Serbaneka"],["Convenience Store","Kedai Serbaneka"],["Laundry Space","Ruang Dobi"],["Laundry Room","Bilik Dobi"],["Management Office","Pejabat Pengurusan"],
 ["Prayer Room (Surau)","Bilik Solat (Surau)"],["Prayer Room","Bilik Solat"],["Toilets & Changing Rooms","Tandas & Bilik Persalinan"],["Changing Room","Bilik Persalinan"],["Changing Rooms","Bilik Persalinan"],["Toilet","Tandas"],["Toilets","Tandas"],["Disabled Toilet","Tandas OKU"],
 ["Lift Lobby","Lobi Lif"],["Games Room","Bilik Permainan"],["Game Room","Bilik Permainan"],["Entertainment Room","Bilik Hiburan"],["Karaoke Room","Bilik Karaoke"],["Cinema Room","Bilik Pawagam"],["Mini Theatre","Teater Mini"],["Screening Room","Bilik Tayangan"],
 ["Co-Working Space","Ruang Kerja Bersama"],["Co-working Space","Ruang Kerja Bersama"],["Business Centre","Pusat Perniagaan"],["Study Room","Bilik Belajar"],["Reading Room","Bilik Bacaan"],["Private Dining Room","Bilik Makan Persendirian"],["Dining Facility","Kemudahan Ruang Makan"],["Dining Area","Ruang Makan"],
 ["Gourmet Kitchen","Dapur Gourmet"],["Show Kitchen","Dapur Pameran"],["Baking Facility","Kemudahan Membakar"],["Camping Zone","Zon Perkhemahan"],["Wetland Landscape","Landskap Tanah Bencah"],["Landscaped Gardens","Taman Berlandskap"],["Landscaped Garden","Taman Berlandskap"],
 ["Walking Paths","Laluan Pejalan Kaki"],["Walking Path","Laluan Pejalan Kaki"],["Lobby Lounge","Ruang Rehat Lobi"],["Lounge","Ruang Rehat"],["Sun Lounge","Ruang Rehat Berjemur"],["Outdoor Social Lounge","Ruang Sosial Luar"],["Waiting Lounge","Ruang Menunggu"],["Sky Lounge","Ruang Rehat Langit"],
 ["Guard House","Pondok Pengawal"],["Guardhouse","Pondok Pengawal"],["Drop-Off Lobby","Lobi Menurunkan Penumpang"],["Drop-off Area","Kawasan Menurunkan Penumpang"],["Drop-Off","Kawasan Menurunkan Penumpang"],["Drop Off","Kawasan Menurunkan Penumpang"],
 ["Food Collection Area","Kawasan Pengambilan Makanan"],["Bicycle Storage","Tempat Simpanan Basikal"],["Bicycle Parking","Tempat Letak Basikal"],["EV Charging Bay","Ruang Pengecasan Kenderaan Elektrik"],["EV Charging Station","Stesen Pengecasan Kenderaan Elektrik"],["EV Charging","Pengecasan Kenderaan Elektrik"],
 ["Delivery Parcel Room","Bilik Bungkusan Penghantaran"],["Parcel Room","Bilik Bungkusan"],["Parcel Locker","Loker Bungkusan"],["Mailroom","Bilik Mel"],["Main Entrance","Pintu Masuk Utama"],["Floating Deck","Dek Terapung"],["Sky Deck","Dek Langit"],["Urban Deck","Dek Bandar"],["Sky Garden","Taman Langit"],["Rooftop Garden","Taman Bumbung"],["Rooftop Facilities","Kemudahan Bumbung"],["Facilities Podium","Podium Kemudahan"],
 ["Lookout Point","Tempat Peninjau"],["Viewing Deck","Dek Pemandangan"],["Outdoor Seating Area","Kawasan Tempat Duduk Luar"],["Licence Plate Recognition System","Sistem Pengecaman Nombor Plat"],["Multi-tier Security System","Sistem Keselamatan Berbilang Lapis"],["24-hour Security","Keselamatan 24 Jam"],["CCTV","CCTV"],["Access Card System","Sistem Kad Akses"],
 ["Sauna","Sauna"],["Steam Room","Bilik Wap"],["Table Tennis","Tenis Meja"],["SPORTS & FITNESS","SUKAN & KECERGASAN"],["Kindergarten","Tadika"],["Mortuary","Bilik Jenazah"],["Bunga Peranakan Water Fountain","Pancutan Air Bunga Peranakan"],["Peranakan Shophouse Mural Art Wall","Dinding Seni Mural Rumah Kedai Peranakan"],["Pedestrian Walkway to Jalan 11","Laluan Pejalan Kaki ke Jalan 11"]];
const FAC_EN2MS=new Map(),FAC_MS2EN=new Map();for(const [en,ms] of FAC_DICT){const k=en.toLowerCase();if(!FAC_EN2MS.has(k))FAC_EN2MS.set(k,ms);const m=ms.toLowerCase();if(!FAC_MS2EN.has(m))FAC_MS2EN.set(m,en)}
const FAC_SFX_MS={"male":"Lelaki","female":"Wanita","men":"Lelaki","women":"Wanita"},FAC_SFX_EN={"lelaki":"Male","wanita":"Female","perempuan":"Female"};
/* translate one facility name into the page language; keeps numbering ("12. "), tower suffix ("Tower A" ⇄ "Menara A"), (Male)/(Female) and "– Name" suffixes */
function facTr(s,lang){const raw=String(s||"");if(!raw.trim())return raw;const toMs=lang!=="en",map=toMs?FAC_EN2MS:FAC_MS2EN;
  let m=raw.match(/^(\s*\d+\.\s*)?(.*?)\s*$/),pre=m[1]||"",body=m[2],post="";
  const dash=body.match(/^(.*?)(\s+[–—-]\s+.+)$/);if(dash&&map.has(dash[1].toLowerCase())){body=dash[1];post=dash[2]}
  const sx=body.match(/^(.*?)\s*\((male|female|men|women|lelaki|wanita|perempuan)\)$/i);if(sx){const t=(toMs?FAC_SFX_MS:FAC_SFX_EN)[sx[2].toLowerCase()];if(t){body=sx[1];post=` (${t})`+post}}
  const tw=body.match(/^(.*?)\s+(Tower|Menara|Block|Blok)\s+([A-Z0-9]{1,3})$/i);let tower="";if(tw){body=tw[1];tower=` ${toMs?(/block|blok/i.test(tw[2])?"Blok":"Menara"):(/block|blok/i.test(tw[2])?"Block":"Tower")} ${tw[3]}`}
  else{const tw2=body.match(/^(Tower|Menara)\s+([A-Z0-9]{1,3})\s+(.+)$/i);if(tw2){body=tw2[3];tower=` ${toMs?"Menara":"Tower"} ${tw2[2]}`}}
  const t=map.get(body.toLowerCase());if(!t)return raw;return pre+t+tower+post}
/* highlights: drop stray leading bullets ("•", "-", "*") that would show twice */
const hlClean=s=>String(s||"").replace(/^\s*[•·▪●\-\*]+\s*/,"");
function textFor(p, lang) {
  const v = p.tr && p.tr.h === trHash(trSrc(p)) && p.tr[lang]; const o = { summary: p.summary, hl: p.hl || [], fac: p.fac || [] };
  if (v) {
    if (typeof v.summary === "string" && v.summary.trim()) o.summary = v.summary;
    if (Array.isArray(v.hl) && v.hl.length === (p.hl || []).length) o.hl = v.hl.map(String);
    if (Array.isArray(v.fac) && v.fac.length === (p.fac || []).length) o.fac = v.fac.map(String);
  }
  o.hl = o.hl.map(hlClean); o.fac = o.fac.map((f) => facTr(f, lang === "en" ? "en" : "ms"));
  return o;
}
const TYPE_EN = { condo: "Condominium", serviced: "Serviced Residence", apartment: "Apartment", terrace: "Terrace House", semid: "Semi-D", bungalow: "Bungalow", townhouse: "Townhouse", soho: "SOHO / SOVO", affordable: "Affordable Home", land: "Land", shop: "Shop / Shoplot", office: "Office", factory: "Factory / Warehouse" };
const STATUS_EN = { new: "New launch", construction: "Under construction", completed: "Completed", upcoming: "Upcoming", soldout: "Sold out" };

function projectPage(p, d, lang) {
  const EN = lang === "en", L = (ms, en) => (EN ? en : ms);
  const rate = num(d.settings && d.settings.rate) || 3.6;
  const name = String(p.name || p.slug).trim(), areaS = String(p.area || "").trim(), area = areaS + (p.state ? ", " + p.state : "");
  const typ = (EN ? TYPE_EN : TYPE)[p.type] || L("Hartanah", "Property"), inName = areaS && name.toLowerCase().includes(areaS.toLowerCase());
  const st = (EN ? STATUS_EN : STATUS)[p.status] || "", DI = L(" di ", " in ");
  const sz = sizeTxt(p), bd = !p.bmax ? "" : ((p.bmin === 0 ? "Studio" : p.bmin) + (p.bmin === p.bmax ? "" : "–" + p.bmax) + L(" bilik", " bed"));
  const price = p.pmin ? L(" dari ", " from ") + rmShort(p.pmin).replace(/j$/, EN ? "m" : "j") : "", BR = " | Rezeki Hartanah";
  const cands = [`${name} | ${typ}${price}${inName ? "" : DI + areaS}`, `${name} | ${typ}${price}`, p.pmin ? `${name} | ${L("Harga dari", "Price from")} ${rmShort(p.pmin).replace(/j$/, EN ? "m" : "j")}` : "", inName ? "" : `${name} | ${typ}${DI}${areaS}`, `${name} | ${typ}`, name].filter(Boolean);
  let title = String((EN ? p.metaTitleEn : p.metaTitle) || "").trim();
  if (!title) { title = cands.find((c) => c.length >= 30 && c.length <= 60) || cands.find((c) => c.length <= 60) || clip(name, 60); if (title.length < 30 && title.length + BR.length <= 60) title += BR; }
  const mo = monthly(p, rate), devS = p.dev ? L(" oleh ", " by ") + p.dev : "";
  const head = [[typ.toLowerCase() + devS, sz, bd], [typ.toLowerCase() + devS, sz], [typ.toLowerCase(), sz], [typ.toLowerCase()]].map((a) => `${name}${inName ? (p.state ? ", " + p.state : "") : DI + area}: ${a.filter(Boolean).join(", ")}.`);
  const tail = p.pmin ? (EN ? [` Priced from ${rm(p.pmin)}, about ${rm(mo)}/month.`, ` Priced from ${rm(p.pmin)}.`] : [` Harga dari ${rm(p.pmin)}, ansuran ~${rm(mo)}/bln.`, ` Harga dari ${rm(p.pmin)}.`]) : [""];
  let auto = ""; for (const h of head) { for (const t of tail) { if ((h + t).length <= 160) { auto = h + t; break; } } if (auto) break; }
  if (!auto) auto = head[head.length - 1];
  for (const add of EN ? [" Check units & LPPSA financing.", " WhatsApp us to arrange a visit."] : [" Semak unit & pembiayaan LPPSA.", " WhatsApp kami untuk lawatan."]) if (auto.length < 110 && auto.length + add.length <= 160) auto += add;
  const desc = clip(String((EN ? p.metaDescEn : p.metaDesc) || "").trim() || auto, 160);
  const url = pUrl(p, EN ? "en" : "ms"), imgs = photos(p), share = imgs.length ? imgs[0] + "-og" : undefined;
  const tx = textFor(p, EN ? "en" : "ms");
  const hl = (tx.hl || []).map(String).filter(Boolean), fac = (tx.fac || []).map(String).filter(Boolean);
  const faqs = [];
  if (EN) {
    if (p.pmin) faqs.push([`How much is ${name}?`, `${name} starts from ${rm(p.pmin)}${p.pmax && p.pmax > p.pmin ? " up to " + rm(p.pmax) : ""}. Prices are subject to change and availability.`]);
    faqs.push([`Where is ${name}?`, `${name} is located in ${area}.${p.tod ? " The project is close to public transport." : ""}`]);
    if (p.smin) faqs.push([`What are the unit sizes at ${name}?`, `Units at ${name} are ${sz}${bd ? " with " + bd : ""}.`]);
    if (p.pmin) faqs.push([`What is the monthly instalment for ${name}?`, `The estimated instalment for ${name} is about ${rm(mo)} a month for a price of ${rm(p.pmin)} (estimate based on full financing at ${rate}% a year over 35 years). Contact us for a bank & LPPSA eligibility check.`]);
  } else {
    if (p.pmin) faqs.push([`Berapa harga ${name}?`, `Harga ${name} bermula dari ${rm(p.pmin)}${p.pmax && p.pmax > p.pmin ? " hingga " + rm(p.pmax) : ""}. Harga tertakluk kepada perubahan dan unit tersedia.`]);
    faqs.push([`Di mana ${name}?`, `${name} terletak di ${area}.${p.tod ? " Projek ini berdekatan dengan transit awam." : ""}`]);
    if (p.smin) faqs.push([`Berapa saiz unit ${name}?`, `Saiz unit ${name} ialah ${sz}${bd ? " dengan " + bd : ""}.`]);
    if (p.pmin) faqs.push([`Berapa ansuran bulanan ${name}?`, `Anggaran ansuran ${name} ialah sekitar ${rm(mo)} sebulan bagi harga ${rm(p.pmin)} (anggaran pembiayaan penuh ${rate}% setahun, 35 tahun). Hubungi kami untuk semakan kelayakan bank & LPPSA.`]);
  }
  const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : undefined);
  const areaUrl = SITE + "/hartanah/" + slugify(areaS);
  const graph = [
    { "@type": "RealEstateListing", "@id": url + "#listing", "url": url, "name": name, "description": desc, "inLanguage": EN ? "en-MY" : "ms-MY", "image": imgs.length ? imgs : undefined, "datePosted": day(p.createdAt), "dateModified": day(p.contentAt || p.updatedAt || p.createdAt),
      "mainEntityOfPage": { "@type": "WebPage", "@id": url, "url": url, "name": title, "inLanguage": EN ? "en-MY" : "ms-MY" },
      "offers": p.pmin ? { "@type": "AggregateOffer", "priceCurrency": "MYR", "lowPrice": p.pmin, "highPrice": p.pmax || p.pmin, "availability": p.status === "soldout" ? "https://schema.org/SoldOut" : p.status === "upcoming" ? "https://schema.org/PreOrder" : "https://schema.org/InStock", "offerCount": p.units || undefined, "seller": { "@id": SITE + "/#agent" } } : undefined,
      "about": { "@type": COM.includes(p.type) ? "Place" : "Residence", "name": name, "image": imgs[0], "address": { "@type": "PostalAddress", "addressLocality": areaS, "addressRegion": p.state || undefined, "addressCountry": "MY" }, "floorSize": p.smin ? { "@type": "QuantitativeValue", "minValue": p.smin, "maxValue": p.smax || p.smin, "unitCode": "FTK" } : undefined, "numberOfRooms": p.bmax ? { "@type": "QuantitativeValue", "minValue": p.bmin, "maxValue": p.bmax } : undefined, "amenityFeature": fac.slice(0, 20).map((f) => ({ "@type": "LocationFeatureSpecification", "name": f, "value": true })) } },
    { "@type": "FAQPage", "@id": url + "#faq", "inLanguage": EN ? "en-MY" : "ms-MY", "mainEntity": faqs.map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } })) },
    crumbs([["Rezeki Hartanah", SITE + "/"], [L("Hartanah", "Properties"), SITE + "/projek"], [areaS, areaUrl], [name, url]]),
  ];
  const facts = [[L("Pemaju", "Developer"), p.dev], [L("Jenis", "Type"), typ], [L("Kawasan", "Area"), area], ["Status", st], [L("Harga", "Price"), p.pmin ? rm(p.pmin) + (p.pmax && p.pmax > p.pmin ? " – " + rm(p.pmax) : "") : ""], [L("Ansuran / bulan (anggaran)", "Instalment / month (estimate)"), p.pmin ? "~" + rm(mo) : ""], [L("Saiz", "Size"), sz], [L("Bilik", "Bedrooms"), bd], [L("Jumlah unit", "Total units"), p.units ? num(p.units).toLocaleString() : ""], [L("Jangkaan siap", "Expected completion"), p.completion]].filter((f) => f[1]);
  const other = enIndexable(p) ? `<p><a href="${esc(EN ? pUrl(p) : pUrl(p, "en"))}" hreflang="${EN ? "ms" : "en"}" lang="${EN ? "ms" : "en"}">${EN ? "Baca dalam Bahasa Malaysia" : "Read in English"}</a></p>` : "";
  const body = `<article class="ssr" lang="${EN ? "en" : "ms"}"><nav aria-label="Breadcrumb"><a href="/">${L("Utama", "Home")}</a> › <a href="/projek">${L("Hartanah", "Properties")}</a> › <a href="/hartanah/${esc(slugify(areaS))}">${esc(areaS)}</a> › ${esc(name)}</nav>
<h1>${esc(name)}</h1><p>${esc(typ)}${p.dev ? L(" oleh ", " by ") + esc(p.dev) : ""} · ${esc(area)}${st ? " · " + esc(st) : ""}</p>
${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(name + ", " + area)}" width="1200" height="800" loading="eager">` : ""}
${tx.summary ? `<p>${esc(tx.summary)}</p>` : ""}
<h2>${L("Fakta utama", "Key facts")}</h2><dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
${hl.length ? `<h2>${L("Kenapa projek ini", "Why this project")}</h2><ul>${hl.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
${fac.length ? `<h2>${L("Kemudahan", "Facilities")}</h2><ul>${fac.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
<h2>${L("Soalan lazim", "Frequently asked questions")}</h2>${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}
${other}<p><a href="https://wa.me/${WA}?text=${encodeURIComponent(L("Hi, saya berminat dengan ", "Hi, I'm interested in ") + name + ".")}">${L("WhatsApp kami tentang ", "WhatsApp us about ")}${esc(name)}</a></p></article>`;
  const robots = p.noindex || (EN && !enIndexable(p)) ? "noindex, follow" : "";
  return { title, desc, url, image: share, graph, body, robots, lang: EN ? "en" : "ms", alts: alts(p) };
}

function listBody(h1, intro, list, d) {
  const rate = num(d.settings && d.settings.rate) || 3.6;
  return `<section class="ssr"><h1>${esc(h1)}</h1>${intro ? `<p>${esc(intro)}</p>` : ""}<ul>${list.map((p) => `<li><a href="/listings/${esc(p.slug)}">${esc(p.name)}</a> — ${esc(TYPE[p.type] || "Hartanah")}, ${esc(p.area)}${p.pmin ? ", harga dari " + esc(rm(p.pmin)) + " (~" + esc(rm(monthly(p, rate))) + "/bln)" : ""}</li>`).join("")}</ul></section>`;
}
function itemList(url, list, name) {
  return { "@type": "ItemList", "@id": url + "#list", "name": name, "numberOfItems": list.length, "itemListElement": list.slice(0, 100).map((p, i) => ({ "@type": "ListItem", "position": i + 1, "url": SITE + "/listings/" + p.slug, "name": p.name })) };
}

function resolve(pathname, d) {
  const all = visible(d), ps = all.filter((p) => !p.redirectTo), posts = (d.posts || []).filter((a) => a && a.slug), areas = [...new Set(ps.map((p) => String(p.area || "").trim()).filter(Boolean))].sort();
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const ok = (s) => ({ status: 200, ...s });
  if (!seg.length) {
    const areasHtml = `<h2>Layari ikut kawasan</h2><ul>${areas.map((a) => `<li><a href="/hartanah/${esc(slugify(a))}">Hartanah di ${esc(a)}</a></li>`).join("")}</ul>`;
    const postsHtml = posts.length ? `<h2>Blog & panduan</h2><ul>${posts.slice(0, 20).map((a) => `<li><a href="/blog/${esc(a.slug)}">${esc(a.title || a.slug)}</a></li>`).join("")}</ul>` : "";
    return ok({ title: DEFAULT_TITLE, desc: DEFAULT_DESC, url: SITE + "/", body: listBody("Semua hartanah Klang Valley, satu tempat.", "Bandingkan harga, saiz, susun atur dan ansuran bulanan projek baharu, siap, tanah dan komersial — kemudian terus berbincang dengan kami.", ps, d).replace("</section>", areasHtml + postsHtml + "</section>"), graph: [itemList(SITE + "/", ps, "Projek hartanah Rezeki Hartanah")] });
  }
  // /listings/:slug (BM, default) and /en/listings/:slug (English). Redirects go straight to the final URL in the same language.
  const isEn = seg[0] === "en" && seg[1] === "listings" && seg[2] && seg.length === 3;
  if ((seg[0] === "listings" && seg[1] && seg.length === 2) || isEn) {
    const slug = isEn ? seg[2] : seg[1], base = isEn ? "/en/listings/" : "/listings/";
    const nf = isEn
      ? { status: 404, title: "Project not found | Rezeki Hartanah", desc: "This project is not available or has been removed.", url: SITE + "/", robots: "noindex, follow", lang: "en", body: `<section class="ssr" lang="en"><h1>Project not found</h1><p><a href="/projek">See all projects</a></p></section>`, graph: [] }
      : { status: 404, title: "Projek tidak dijumpai | Rezeki Hartanah", desc: "Projek ini tiada atau telah dikeluarkan.", url: SITE + "/", robots: "noindex, follow", body: `<section class="ssr"><h1>Projek tidak dijumpai</h1><p><a href="/projek">Lihat semua projek</a></p></section>`, graph: [] };
    const p = all.find((x) => x.slug === slug) || ps.find((x) => slugify(String(x.name || "").replace(/@/g, " ")) === slug);
    if (p && p.redirectTo) { const t = ps.find((x) => x.slug === p.redirectTo && x.slug !== p.slug); return t ? { status: 301, location: base + t.slug } : nf; }
    if (!p) return nf;
    if (p.slug !== slug) return { status: 301, location: base + p.slug };
    return ok(projectPage(p, d, isEn ? "en" : "ms"));
  }
  if (seg[0] === "hartanah" && seg[1]) {
    const area = areas.find((a) => slugify(a) === seg[1]);
    if (!area) return { status: 404, title: "Kawasan tidak dijumpai | Rezeki Hartanah", desc: "", url: SITE + "/", robots: "noindex, follow", body: `<section class="ssr"><h1>Kawasan tidak dijumpai</h1></section>`, graph: [] };
    const list = ps.filter((p) => String(p.area || "").trim() === area), url = SITE + "/hartanah/" + seg[1];
    const pr = list.filter((p) => p.pmin).map((p) => p.pmin), lo = pr.length ? Math.min(...pr) : 0;
    const title = [`Hartanah di ${area} (${list.length} Projek) | Rezeki Hartanah`, `Hartanah di ${area}: ${list.length} Projek Baharu & Siap`, `Projek Hartanah di ${area} (${list.length})`].find((x) => x.length <= 60) || clip(`Hartanah di ${area}`, 60);
    return ok({ title, desc: clip(`Senarai ${list.length} projek hartanah di ${area}${lo ? ", harga dari " + rm(lo) : ""}: kondominium, serviced residence, rumah & komersial. Bandingkan harga, saiz dan ansuran, hubungi kami di WhatsApp.`, 160), url, body: listBody(`Hartanah di ${area}`, `${list.length} projek di ${area}: bandingkan harga, saiz dan ansuran bulanan.`, list, d), graph: [itemList(url, list, "Hartanah di " + area), crumbs([["Rezeki Hartanah", SITE + "/"], ["Hartanah", SITE + "/projek"], [area, url]])] });
  }
  if (seg[0] === "projek" && !seg[1]) {
    const url = SITE + "/projek";
    return ok({ title: `Semua ${ps.length} Projek Hartanah di Klang Valley | Direktori`, desc: clip(`Direktori ${ps.length} projek hartanah baharu dan siap di ${areas.length} kawasan Klang Valley, dengan harga, saiz dan anggaran ansuran bulanan.`, 160), url, body: listBody(`Semua projek hartanah (${ps.length})`, "", ps, d), graph: [itemList(url, ps, "Direktori projek"), crumbs([["Rezeki Hartanah", SITE + "/"], ["Hartanah", url]])] });
  }
  if (seg[0] === "blog" && seg[1]) {
    const a = posts.find((x) => x.slug === seg[1]);
    if (!a) return { status: 404, title: "Artikel tidak dijumpai | Rezeki Hartanah", desc: "", url: SITE + "/blog", robots: "noindex, follow", body: `<section class="ssr"><h1>Artikel tidak dijumpai</h1></section>`, graph: [] };
    const url = SITE + "/blog/" + a.slug, text = String(a.content || a.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const day = (v) => (v ? new Date(v).toISOString() : undefined);
    return ok({ title: clip(a.metaTitle || a.title || a.slug, 60), desc: clip(a.metaDesc || a.excerpt || text, 160), url, image: a.image ? abs(a.image) : undefined, robots: a.noindex ? "noindex, follow" : "", body: `<article class="ssr"><h1>${esc(a.title || a.slug)}</h1>${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ""}${text ? `<div>${esc(text)}</div>` : ""}</article>`, graph: [{ "@type": "BlogPosting", "@id": url + "#post", "headline": a.title, "url": url, "datePublished": day(a.publishAt || a.createdAt), "dateModified": day(a.contentAt || a.updatedAt), "author": { "@type": "Organization", "name": "Rezeki Hartanah" }, "publisher": { "@id": SITE + "/#agent" }, "image": a.image ? abs(a.image) : undefined, "inLanguage": "ms-MY" }, crumbs([["Rezeki Hartanah", SITE + "/"], ["Blog", SITE + "/blog"], [a.title || a.slug, url]])] });
  }
  if (seg[0] === "blog") return ok({ title: "Blog & Panduan Hartanah Klang Valley | Rezeki Hartanah", desc: "Panduan membeli rumah, pembiayaan bank & LPPSA, co-living dan berita projek hartanah di Klang Valley.", url: SITE + "/blog", body: `<section class="ssr"><h1>Blog & panduan</h1><ul>${posts.map((a) => `<li><a href="/blog/${esc(a.slug)}">${esc(a.title || a.slug)}</a></li>`).join("")}</ul></section>`, graph: [] });
  if (seg[0] === "co-living") return ok({ title: "Pengurusan Co-Living & Sewa Bilik di KL & Selangor | Rezeki Hartanah", desc: "Kami uruskan rumah anda sebagai co-living: persediaan bilik, saringan penyewa, kutipan sewa dan laporan bulanan. Pulangan sewa hingga 40% lebih tinggi.", url: SITE + "/co-living", body: `<section class="ssr"><h1>Pengurusan co-living & sewa bilik</h1><p>Rezeki Hartanah menguruskan rumah anda bilik demi bilik: persediaan & perabot, saringan penyewa, perjanjian sewa, kutipan sewa & bil utiliti, pembersihan & pembaikan dan laporan bulanan pemilik.</p></section>`, graph: [] });
  if (seg[0] === "privasi") return ok({ title: "Notis Privasi | Rezeki Hartanah", desc: "Cara Rezeki Hartanah mengumpul, menggunakan dan melindungi data peribadi anda di bawah PDPA 2010.", url: SITE + "/privasi", body: "", graph: [] });
  if (seg[0] === "simpanan") return ok({ title: "Simpanan | Rezeki Hartanah", desc: "", url: SITE + "/simpanan", robots: "noindex, follow", body: "", graph: [] });
  return { status: 404, title: "Halaman tidak dijumpai | Rezeki Hartanah", desc: "Halaman ini tiada atau telah dikeluarkan.", url: SITE + "/", robots: "noindex, follow", body: `<section class="ssr"><h1>404</h1><p>Halaman ini tidak dijumpai. <a href="/">Kembali ke laman utama</a></p></section>`, graph: [] };
}

const SKIP = /^\/(admin|_blob\/|sitemap|robots\.txt|favicon|og-image|apple-touch-icon|site\.webmanifest|assets\/|\.netlify)/;

export default async (request, context) => {
  const url = new URL(request.url);
  if (request.method !== "GET" || SKIP.test(url.pathname) || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return context.next();
  const res = await context.next();
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return res;
  let html = await res.text();
  let d;
  try { d = await seed(); } catch (_) { return new Response(html, { status: res.status, headers: res.headers }); }
  const page = resolve(url.pathname, d);
  if (page.status === 301) return Response.redirect(SITE + page.location, 301);
  const robots = page.robots || "index, follow, max-image-preview:large", image = page.image || SITE + "/og-image.jpg";
  const set = (re, tag) => { html = re.test(html) ? html.replace(re, tag) : html.replace("</head>", tag + "\n</head>"); };
  set(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  set(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(page.desc)}">`);
  set(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${esc(robots)}">`);
  set(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(page.url)}">`);
  html = html.replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?/g, "");
  if (page.alts && page.alts.length) html = html.replace("</head>", page.alts.map(([l, u]) => `<link rel="alternate" hreflang="${l}" href="${esc(u)}">`).join("\n") + "\n</head>");
  if (page.lang === "en") { html = html.replace(/<html lang="[^"]*"/, '<html lang="en"'); set(/<meta property="og:locale"[^>]*>/, '<meta property="og:locale" content="en_MY">'); }
  for (const [k, v] of [["og:title", page.title], ["og:description", page.desc], ["og:url", page.url], ["og:image", image], ["og:image:secure_url", image], ["og:image:type", "image/jpeg"], ["og:image:width", "1200"], ["og:image:height", "630"], ["og:image:alt", page.title]]) set(new RegExp(`<meta property="${k}"[^>]*>`), `<meta property="${k}" content="${esc(v)}">`);
  for (const [k, v] of [["twitter:title", page.title], ["twitter:description", page.desc], ["twitter:image", image]]) set(new RegExp(`<meta name="${k}"[^>]*>`), `<meta name="${k}" content="${esc(v)}">`);
  const graph = page.graph && page.graph.length ? ld({ "@context": "https://schema.org", "@graph": page.graph }) : "";
  const seedJs = `<script>window.__HKV_SEED=${JSON.stringify(d).replace(/</g, "\\u003c")};</script>`;
  // The server-written content is for Google, WhatsApp and visitors without JavaScript. The app replaces it within a moment,
// so it stays invisible while loading (no flash of plain text) and only fades in if the app has not taken over after 3 s.
const css = `<style>@keyframes ssrIn{to{opacity:1}}.ssr{opacity:0;animation:ssrIn .25s ease 3s forwards;max-width:1180px;margin:0 auto;padding:28px 18px;line-height:1.6}.ssr img{max-width:100%;height:auto;border-radius:14px}.ssr dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}.ssr dt{font-weight:700}</style><noscript><style>.ssr{opacity:1;animation:none}</style></noscript>`;
  html = html.replace("</head>", graph + "\n" + seedJs + "\n" + css + "\n</head>");
  if (page.body) html = html.replace(/<main id="app"([^>]*)><\/main>/, `<main id="app"$1>${page.body}</main>`);
  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.delete("content-length");
  return new Response(html, { status: page.status, headers });
};

export const config = { path: "/*", excludedPath: ["/admin", "/admin/*", "/_blob/*", "/sitemap*", "/*.png", "/*.jpg", "/*.svg", "/*.txt", "/*.webmanifest", "/*.html"] };
