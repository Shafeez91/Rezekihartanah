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
  if (cache.seed && Date.now() - cache.at < 60000) return cache.seed;
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
  const live = ps.filter((p) => !p.redirectTo && p.status !== "soldout" || p.status === "soldout");
  return live;
}
const crumbs = (items) => ({ "@type": "BreadcrumbList", "itemListElement": items.map(([n, u], i) => ({ "@type": "ListItem", "position": i + 1, "name": n, "item": u })) });

function projectPage(p, d) {
  const rate = num(d.settings && d.settings.rate) || 3.6;
  const name = String(p.name || p.slug).trim(), areaS = String(p.area || "").trim(), area = areaS + (p.state ? ", " + p.state : "");
  const typ = TYPE[p.type] || "Hartanah", inName = areaS && name.toLowerCase().includes(areaS.toLowerCase());
  const price = p.pmin ? " dari " + rmShort(p.pmin) : "", BR = " | Rezeki Hartanah";
  const cands = [`${name} | ${typ}${price}${inName ? "" : " di " + areaS}`, `${name} | ${typ}${price}`, p.pmin ? `${name} | Harga dari ${rmShort(p.pmin)}` : "", inName ? "" : `${name} | ${typ} di ${areaS}`, `${name} | ${typ}`, name].filter(Boolean);
  let title = String(p.metaTitle || "").trim();
  if (!title) { title = cands.find((c) => c.length >= 30 && c.length <= 60) || cands.find((c) => c.length <= 60) || clip(name, 60); if (title.length < 30 && title.length + BR.length <= 60) title += BR; }
  const mo = monthly(p, rate), devS = p.dev ? " oleh " + p.dev : "";
  const head = [[typ.toLowerCase() + devS, sizeTxt(p), bedTxt(p)], [typ.toLowerCase() + devS, sizeTxt(p)], [typ.toLowerCase(), sizeTxt(p)], [typ.toLowerCase()]].map((a) => `${name}${inName ? (p.state ? ", " + p.state : "") : " di " + area}: ${a.filter(Boolean).join(", ")}.`);
  const tail = p.pmin ? [` Harga dari ${rm(p.pmin)}, ansuran ~${rm(mo)}/bln.`, ` Harga dari ${rm(p.pmin)}.`] : [""];
  let auto = ""; for (const h of head) { for (const t of tail) { if ((h + t).length <= 160) { auto = h + t; break; } } if (auto) break; }
  if (!auto) auto = head[head.length - 1];
  for (const add of [" Semak unit & pembiayaan LPPSA.", " WhatsApp kami untuk lawatan."]) if (auto.length < 110 && auto.length + add.length <= 160) auto += add;
  const desc = clip(String(p.metaDesc || "").trim() || auto, 160);
  const url = SITE + "/listings/" + p.slug, imgs = photos(p);
  const hl = (p.hl || []).map(String).filter(Boolean), fac = (p.fac || []).map(String).filter(Boolean);
  const faqs = [];
  if (p.pmin) faqs.push([`Berapa harga ${name}?`, `Harga ${name} bermula dari ${rm(p.pmin)}${p.pmax && p.pmax > p.pmin ? " hingga " + rm(p.pmax) : ""}. Harga tertakluk kepada perubahan dan unit tersedia.`]);
  faqs.push([`Di mana ${name}?`, `${name} terletak di ${area}.${p.tod ? " Projek ini berdekatan dengan transit awam." : ""}`]);
  if (p.smin) faqs.push([`Berapa saiz unit ${name}?`, `Saiz unit ${name} ialah ${sizeTxt(p)}${bedTxt(p) ? " dengan " + bedTxt(p) : ""}.`]);
  if (p.pmin) faqs.push([`Berapa ansuran bulanan ${name}?`, `Anggaran ansuran ${name} ialah sekitar ${rm(mo)} sebulan bagi harga ${rm(p.pmin)} (anggaran pembiayaan penuh ${rate}% setahun, 35 tahun). Hubungi kami untuk semakan kelayakan bank & LPPSA.`]);
  const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : undefined);
  const graph = [
    { "@type": "RealEstateListing", "@id": url + "#listing", "url": url, "name": name, "description": desc, "inLanguage": "ms-MY", "image": imgs.length ? imgs : undefined, "datePosted": day(p.createdAt), "dateModified": day(p.contentAt || p.updatedAt || p.createdAt),
      "mainEntityOfPage": { "@type": "WebPage", "@id": url, "url": url, "name": title },
      "offers": p.pmin ? { "@type": "AggregateOffer", "priceCurrency": "MYR", "lowPrice": p.pmin, "highPrice": p.pmax || p.pmin, "availability": p.status === "soldout" ? "https://schema.org/SoldOut" : p.status === "upcoming" ? "https://schema.org/PreOrder" : "https://schema.org/InStock", "offerCount": p.units || undefined, "seller": { "@id": SITE + "/#agent" } } : undefined,
      "about": { "@type": COM.includes(p.type) ? "Place" : "Residence", "name": name, "image": imgs[0], "address": { "@type": "PostalAddress", "addressLocality": areaS, "addressRegion": p.state || undefined, "addressCountry": "MY" }, "floorSize": p.smin ? { "@type": "QuantitativeValue", "minValue": p.smin, "maxValue": p.smax || p.smin, "unitCode": "FTK" } : undefined, "numberOfRooms": p.bmax ? { "@type": "QuantitativeValue", "minValue": p.bmin, "maxValue": p.bmax } : undefined, "amenityFeature": fac.slice(0, 20).map((f) => ({ "@type": "LocationFeatureSpecification", "name": f, "value": true })) } },
    { "@type": "FAQPage", "@id": url + "#faq", "mainEntity": faqs.map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } })) },
    crumbs([["Rezeki Hartanah", SITE + "/"], ["Hartanah", SITE + "/projek"], [areaS, SITE + "/hartanah/" + slugify(areaS)], [name, url]]),
  ];
  const facts = [["Pemaju", p.dev], ["Jenis", typ], ["Kawasan", area], ["Status", STATUS[p.status] || ""], ["Harga", p.pmin ? rm(p.pmin) + (p.pmax && p.pmax > p.pmin ? " – " + rm(p.pmax) : "") : ""], ["Ansuran / bulan (anggaran)", p.pmin ? "~" + rm(mo) : ""], ["Saiz", sizeTxt(p)], ["Bilik", bedTxt(p)], ["Jumlah unit", p.units ? num(p.units).toLocaleString() : ""], ["Jangkaan siap", p.completion]].filter((f) => f[1]);
  const body = `<article class="ssr"><nav aria-label="Breadcrumb"><a href="/">Utama</a> › <a href="/projek">Hartanah</a> › <a href="/hartanah/${esc(slugify(areaS))}">${esc(areaS)}</a> › ${esc(name)}</nav>
<h1>${esc(name)}</h1><p>${esc(typ)}${p.dev ? " oleh " + esc(p.dev) : ""} · ${esc(area)}${STATUS[p.status] ? " · " + esc(STATUS[p.status]) : ""}</p>
${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(name + ", " + area)}" width="1200" height="800" loading="eager">` : ""}
${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
<h2>Fakta utama</h2><dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
${hl.length ? `<h2>Kenapa projek ini</h2><ul>${hl.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
${fac.length ? `<h2>Kemudahan</h2><ul>${fac.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
<h2>Soalan lazim</h2>${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}
<p><a href="https://wa.me/${WA}?text=${encodeURIComponent("Hi, saya berminat dengan " + name + ".")}">WhatsApp kami tentang ${esc(name)}</a></p></article>`;
  return { title, desc, url, image: imgs[0], graph, body, robots: p.noindex ? "noindex, follow" : "" };
}

function listBody(h1, intro, list, d) {
  const rate = num(d.settings && d.settings.rate) || 3.6;
  return `<section class="ssr"><h1>${esc(h1)}</h1>${intro ? `<p>${esc(intro)}</p>` : ""}<ul>${list.map((p) => `<li><a href="/listings/${esc(p.slug)}">${esc(p.name)}</a> — ${esc(TYPE[p.type] || "Hartanah")}, ${esc(p.area)}${p.pmin ? ", harga dari " + esc(rm(p.pmin)) + " (~" + esc(rm(monthly(p, rate))) + "/bln)" : ""}</li>`).join("")}</ul></section>`;
}
function itemList(url, list, name) {
  return { "@type": "ItemList", "@id": url + "#list", "name": name, "numberOfItems": list.length, "itemListElement": list.slice(0, 100).map((p, i) => ({ "@type": "ListItem", "position": i + 1, "url": SITE + "/listings/" + p.slug, "name": p.name })) };
}

function resolve(pathname, d) {
  const ps = visible(d), posts = (d.posts || []).filter((a) => a && a.slug), areas = [...new Set(ps.map((p) => String(p.area || "").trim()).filter(Boolean))].sort();
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const ok = (s) => ({ status: 200, ...s });
  if (!seg.length) {
    const areasHtml = `<h2>Layari ikut kawasan</h2><ul>${areas.map((a) => `<li><a href="/hartanah/${esc(slugify(a))}">Hartanah di ${esc(a)}</a></li>`).join("")}</ul>`;
    const postsHtml = posts.length ? `<h2>Blog & panduan</h2><ul>${posts.slice(0, 20).map((a) => `<li><a href="/blog/${esc(a.slug)}">${esc(a.title || a.slug)}</a></li>`).join("")}</ul>` : "";
    return ok({ title: DEFAULT_TITLE, desc: DEFAULT_DESC, url: SITE + "/", body: listBody("Semua hartanah Klang Valley, satu tempat.", "Bandingkan harga, saiz, susun atur dan ansuran bulanan projek baharu, siap, tanah dan komersial — kemudian terus berbincang dengan kami.", ps, d).replace("</section>", areasHtml + postsHtml + "</section>"), graph: [itemList(SITE + "/", ps, "Projek hartanah Rezeki Hartanah")] });
  }
  if (seg[0] === "listings" && seg[1]) {
    const p = ps.find((x) => x.slug === seg[1]) || ps.find((x) => slugify(String(x.name || "").replace(/@/g, " ")) === seg[1]);
    if (!p) return { status: 404, title: "Projek tidak dijumpai | Rezeki Hartanah", desc: "Projek ini tiada atau telah dikeluarkan.", url: SITE + "/", robots: "noindex, follow", body: `<section class="ssr"><h1>Projek tidak dijumpai</h1><p><a href="/projek">Lihat semua projek</a></p></section>`, graph: [] };
    if (p.slug !== seg[1]) return { status: 301, location: "/listings/" + p.slug };
    return ok(projectPage(p, d));
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
  if (seg[0] === "privasi") return ok({ title: "Notis Privasi | Rezeki Hartanah", desc: "Cara Rezeki Hartanah mengumpul, menggunakan dan melindungi data peribadi anda di bawah PDPA 2010.", url: SITE + "/privasi", robots: "noindex, follow", body: "", graph: [] });
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
  for (const [k, v] of [["og:title", page.title], ["og:description", page.desc], ["og:url", page.url], ["og:image", image], ["og:image:alt", page.title]]) set(new RegExp(`<meta property="${k}"[^>]*>`), `<meta property="${k}" content="${esc(v)}">`);
  for (const [k, v] of [["twitter:title", page.title], ["twitter:description", page.desc], ["twitter:image", image]]) set(new RegExp(`<meta name="${k}"[^>]*>`), `<meta name="${k}" content="${esc(v)}">`);
  const graph = page.graph && page.graph.length ? ld({ "@context": "https://schema.org", "@graph": page.graph }) : "";
  const seedJs = `<script>window.__HKV_SEED=${JSON.stringify(d).replace(/</g, "\\u003c")};</script>`;
  const css = `<style>.ssr{max-width:1180px;margin:0 auto;padding:28px 18px;line-height:1.6}.ssr img{max-width:100%;height:auto;border-radius:14px}.ssr dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}.ssr dt{font-weight:700}</style>`;
  html = html.replace("</head>", graph + "\n" + seedJs + "\n" + css + "\n</head>");
  if (page.body) html = html.replace(/<main id="app"([^>]*)><\/main>/, `<main id="app"$1>${page.body}</main>`);
  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.delete("content-length");
  return new Response(html, { status: page.status, headers });
};

export const config = { path: "/*", excludedPath: ["/admin", "/admin/*", "/_blob/*", "/sitemap*", "/*.png", "/*.jpg", "/*.svg", "/*.txt", "/*.webmanifest", "/*.html"] };
