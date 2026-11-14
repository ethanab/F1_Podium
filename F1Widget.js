// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: flag-checkered;

/**
 * F1 Podium – widget iPhone pour Scriptable
 * -----------------------------------------
 *  • Podium illustré : P1 en grand au centre (photo + voiture + logo), P2 et P3
 *  • Fond du widget aux couleurs de l'écurie du vainqueur
 *  • Top 10 de la dernière course
 *  • Classement constructeurs (points de chaque écurie)
 *  • Date du prochain Grand Prix (+ compte à rebours)
 *
 * Données : API Jolpica F1 (compatible Ergast) – https://api.jolpi.ca
 * Taille conseillée : GRAND widget (toutes les infos).
 *  - Moyen : podium + P4–P10 + prochain GP
 *  - Petit : podium + prochain GP
 */

const API = "https://api.jolpi.ca/ergast/f1";
const LOCALE = "fr_FR";
const CACHE_FILE = "f1-podium-cache.json";
const REFRESH_MINUTES = 60;
const OPENF1 = "https://api.openf1.org/v1";

// Images des voitures (CDN formula1.com). Slug d'équipe utilisé par le site F1.
const CAR_SLUGS = {
  red_bull: "redbullracing",
  ferrari: "ferrari",
  mercedes: "mercedes",
  mclaren: "mclaren",
  aston_martin: "astonmartin",
  alpine: "alpine",
  williams: "williams",
  rb: "racingbulls",
  racing_bulls: "racingbulls",
  sauber: "kicksauber",
  kick_sauber: "kicksauber",
  audi: "audi",
  haas: "haasf1team",
  cadillac: "cadillac",
};
// Pour forcer une image de voiture : { mclaren: "https://…/ma-voiture.png" }
const CAR_IMAGE_OVERRIDES = {};
// Pour forcer un logo d'écurie : { ferrari: "https://…/logo.png" }
const TEAM_LOGO_OVERRIDES = {};
// false = fond sombre neutre au lieu de la couleur de l'écurie P1
const TEAM_BACKGROUND = true;

// Couleurs des écuries (clé = constructorId de l'API)
const TEAM_COLORS = {
  red_bull: "#3671C6",
  ferrari: "#E8002D",
  mercedes: "#27F4D2",
  mclaren: "#FF8000",
  aston_martin: "#229971",
  alpine: "#0093CC",
  williams: "#64C4FF",
  rb: "#6692FF",
  racing_bulls: "#6692FF",
  sauber: "#52E252",
  kick_sauber: "#52E252",
  audi: "#BB0A30",
  haas: "#B6BABD",
  cadillac: "#C9A44C",
};

// Noms courts pour gagner de la place
const TEAM_SHORT = {
  red_bull: "Red Bull",
  ferrari: "Ferrari",
  mercedes: "Mercedes",
  mclaren: "McLaren",
  aston_martin: "Aston Martin",
  alpine: "Alpine",
  williams: "Williams",
  rb: "Racing Bulls",
  racing_bulls: "Racing Bulls",
  sauber: "Sauber",
  kick_sauber: "Sauber",
  audi: "Audi",
  haas: "Haas",
  cadillac: "Cadillac",
};

const C = {
  bgTop: new Color("#15151E"),
  bgBottom: new Color("#000000"),
  red: new Color("#E10600"),
  accent: new Color("#FFFFFF", 0.72), // titres de section, lisibles sur tous les fonds
  text: Color.white(),
  dim: new Color("#FFFFFF", 0.62),
  gold: new Color("#FFD700"),
  silver: new Color("#C0C0C0"),
  bronze: new Color("#CD7F32"),
};

// ---------------------------------------------------------------- données

async function getJSON(path) {
  const req = new Request(`${API}/${path}`);
  req.timeoutInterval = 15;
  return await req.loadJSON();
}

function raceDate(r) {
  // r.date = "2026-11-22", r.time = "06:00:00Z" (parfois absent)
  return new Date(`${r.date}T${r.time || "12:00:00Z"}`);
}

function findNextRace(races, now) {
  return races.find((r) => raceDate(r) > now) || null;
}

async function fetchData() {
  const now = new Date();
  const [resultsJ, standingsJ, scheduleJ] = await Promise.all([
    getJSON("current/last/results.json"),
    getJSON("current/constructorstandings.json"),
    getJSON("current/races.json?limit=100"),
  ]);

  const lastRace = resultsJ.MRData.RaceTable.Races[0] || null;
  const lists = standingsJ.MRData.StandingsTable.StandingsLists;
  const constructors = lists.length ? lists[0].ConstructorStandings : [];
  const season = scheduleJ.MRData.RaceTable.season;

  let nextRace = findNextRace(scheduleJ.MRData.RaceTable.Races, now);
  if (!nextRace) {
    // Saison terminée → premier GP de la saison suivante
    try {
      const nextJ = await getJSON(`${Number(season) + 1}/races.json?limit=100`);
      nextRace = findNextRace(nextJ.MRData.RaceTable.Races, now);
    } catch (e) {
      nextRace = null;
    }
  }

  const data = {
    fetchedAt: now.toISOString(),
    lastRace: lastRace && {
      name: lastRace.raceName,
      round: lastRace.round,
      season: lastRace.season,
      date: lastRace.date,
      results: lastRace.Results.slice(0, 10).map((r) => ({
        pos: r.position,
        number: r.number,
        given: r.Driver.givenName,
        code: r.Driver.code || r.Driver.familyName.slice(0, 3).toUpperCase(),
        name: r.Driver.familyName,
        teamId: r.Constructor.constructorId,
        points: Number(r.points),
        gap: r.Time ? r.Time.time : r.status,
      })),
    },
    constructors: constructors.map((c) => ({
      pos: c.position || c.positionText,
      teamId: c.Constructor.constructorId,
      name: TEAM_SHORT[c.Constructor.constructorId] || c.Constructor.name,
      points: Number(c.points),
    })),
    nextRace: nextRace && {
      name: nextRace.raceName,
      round: nextRace.round,
      season: nextRace.season,
      circuit: nextRace.Circuit.circuitName,
      country: nextRace.Circuit.Location.country,
      start: raceDate(nextRace).toISOString(),
      sprint: !!nextRace.Sprint,
    },
  };
  if (data.lastRace) await attachHeadshots(data.lastRace.results);
  return data;
}

// Photos des pilotes via OpenF1 (non bloquant si indisponible)
async function attachHeadshots(results) {
  try {
    const req = new Request(`${OPENF1}/drivers?session_key=latest`);
    req.timeoutInterval = 10;
    const drivers = await req.loadJSON();
    if (!Array.isArray(drivers)) return;
    for (const r of results) {
      const d = drivers.find((x) => String(x.driver_number) === String(r.number))
        || drivers.find((x) => x.name_acronym === r.code);
      if (d && d.headshot_url) r.headshot = d.headshot_url;
    }
  } catch (e) {}
}

// Cache local : le widget reste affiché même sans réseau
function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
}
function saveCache(data) {
  try { FileManager.local().writeString(cachePath(), JSON.stringify(data)); } catch (e) {}
}
function loadCache() {
  const fm = FileManager.local();
  const p = cachePath();
  if (!fm.fileExists(p)) return null;
  try { return JSON.parse(fm.readString(p)); } catch (e) { return null; }
}

async function getData() {
  try {
    const data = await fetchData();
    saveCache(data);
    return { data, offline: false };
  } catch (e) {
    const cached = loadCache();
    if (cached) return { data: cached, offline: true };
    throw e;
  }
}

// ---------------------------------------------------------------- utilitaires

function fmtDate(iso, format) {
  const df = new DateFormatter();
  df.locale = LOCALE;
  df.dateFormat = format;
  return df.string(new Date(iso));
}

function countdown(iso) {
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "en cours";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `J-${d}${h ? ` ${h}h` : ""}`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h${String(m).padStart(2, "0")}`;
}

function teamColor(id) {
  return new Color(TEAM_COLORS[id] || "#888888");
}

function posColor(pos) {
  return { "1": C.gold, "2": C.silver, "3": C.bronze }[String(pos)] || C.dim;
}

function shortRaceName(name) {
  return name.replace(" Grand Prix", " GP");
}

function addText(stack, str, font, color, opts = {}) {
  const t = stack.addText(String(str));
  t.font = font;
  t.textColor = color || C.text;
  t.lineLimit = 1;
  if (opts.scale !== false) t.minimumScaleFactor = opts.scale || 0.6;
  if (opts.right) t.rightAlignText();
  return t;
}

function colorBar(stack, color, h = 10) {
  const bar = stack.addStack();
  bar.size = new Size(3, h);
  bar.backgroundColor = color;
  bar.cornerRadius = 1.5;
}

// ---------------------------------------------------------------- images

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Télécharge une image (essaie chaque URL dans l'ordre) avec cache disque
async function loadImage(urls) {
  const fm = FileManager.local();
  for (const url of urls.filter(Boolean)) {
    const p = fm.joinPath(fm.documentsDirectory(), `f1img-${hash(url)}`);
    try {
      if (fm.fileExists(p)) {
        const img = fm.readImage(p);
        if (img) return img;
      }
      const req = new Request(url);
      req.timeoutInterval = 10;
      const raw = await req.load();
      if (req.response && req.response.statusCode >= 400) continue;
      const img = Image.fromData(raw);
      if (!img) continue;
      fm.write(p, raw);
      return img;
    } catch (e) {}
  }
  return null;
}

function headshotUrls(url) {
  if (!url) return [];
  // Variante haute résolution d'abord, puis l'URL d'origine
  return [url.replace("/1col/", "/2col/"), url];
}

function carUrls(teamId, season) {
  if (CAR_IMAGE_OVERRIDES[teamId]) return [CAR_IMAGE_OVERRIDES[teamId]];
  const slug = CAR_SLUGS[teamId];
  if (!slug) return [];
  const y = Number(season) || new Date().getFullYear();
  return [y, y - 1].map((yr) =>
    `https://media.formula1.com/image/upload/c_fit,w_800/f_png/q_auto/v1740000000/common/f1/${yr}/${slug}/${yr}${slug}carright.webp`);
}

function logoUrls(teamId, season) {
  if (TEAM_LOGO_OVERRIDES[teamId]) return [TEAM_LOGO_OVERRIDES[teamId]];
  const slug = CAR_SLUGS[teamId];
  if (!slug) return [];
  const y = Number(season) || new Date().getFullYear();
  const base = "https://media.formula1.com/image/upload/c_fit,h_96/f_png/q_auto/v1740000000/common/f1";
  return [y, y - 1].flatMap((yr) => [
    `${base}/${yr}/${slug}/${yr}${slug}logowhite.webp`,
    `${base}/${yr}/${slug}/${yr}${slug}logo.webp`,
  ]);
}

async function loadPodiumImages(lastRace) {
  if (!lastRace) return null;
  const top3 = lastRace.results.slice(0, 3);
  const p1Team = top3[0] && top3[0].teamId;
  const [car, logo, ...heads] = await Promise.all([
    loadImage(carUrls(p1Team, lastRace.season)),
    loadImage(logoUrls(p1Team, lastRace.season)),
    ...top3.map((r) => loadImage(headshotUrls(r.headshot))),
  ]);
  return { car, logo, heads };
}

// Dessine le podium : P2 | P1 (grand, voiture derrière) | P3
function drawPodium(results, imgs) {
  const W = 320, H = 116;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const slots = [
    { r: results[1], cx: W / 2 - 108, stepW: 100, stepH: 21, headH: 54, nameFs: 10, medal: C.silver, img: imgs && imgs.heads[1] },
    { r: results[0], cx: W / 2, stepW: 112, stepH: 30, headH: 74, nameFs: 15, medal: C.gold, img: imgs && imgs.heads[0] },
    { r: results[2], cx: W / 2 + 108, stepW: 100, stepH: 16, headH: 50, nameFs: 10, medal: C.bronze, img: imgs && imgs.heads[2] },
  ];

  // 1) Voiture du vainqueur, derrière le P1
  const p1 = slots[1];
  const p1StepTop = H - p1.stepH;
  if (p1.r) {
    const car = imgs && imgs.car;
    if (car) {
      let cw = 250, ch = (cw * car.size.height) / car.size.width;
      if (ch > 64) { ch = 64; cw = (ch * car.size.width) / car.size.height; }
      ctx.drawImageInRect(car, new Rect((W - cw) / 2, p1StepTop - ch + 4, cw, ch));
    } else {
      // Repli : halo aux couleurs de l'écurie
      ctx.setFillColor(new Color(TEAM_COLORS[p1.r.teamId] || "#888888", 0.35));
      ctx.fillEllipse(new Rect(W / 2 - 110, p1StepTop - 50, 220, 56));
    }
  }

  for (const s of slots) {
    if (!s.r) continue;
    const team = TEAM_COLORS[s.r.teamId] || "#888888";
    const stepTop = H - s.stepH;

    // 2) Photo du pilote (ou pastille de repli)
    const headTop = stepTop - s.headH;
    if (s !== p1) {
      ctx.setFillColor(new Color(team, 0.3));
      ctx.fillEllipse(new Rect(s.cx - s.headH * 0.5, headTop + s.headH * 0.12, s.headH, s.headH * 0.88));
    }
    if (s.img) {
      const iw = (s.headH * s.img.size.width) / s.img.size.height;
      ctx.drawImageInRect(s.img, new Rect(s.cx - iw / 2, headTop, iw, s.headH));
    } else {
      const d = s.headH * 0.8;
      ctx.setFillColor(new Color(team));
      ctx.fillEllipse(new Rect(s.cx - d / 2, stepTop - d - 2, d, d));
      ctx.setFont(Font.heavySystemFont(d * 0.32));
      ctx.setTextColor(Color.white());
      ctx.setTextAlignedCenter();
      ctx.drawTextInRect(s.r.code, new Rect(s.cx - d / 2, stepTop - d / 2 - d * 0.22, d, d * 0.5));
    }

    // 3) Marche du podium aux couleurs de l'écurie + nom
    ctx.setFillColor(new Color(team, 0.9));
    ctx.fillRect(new Rect(s.cx - s.stepW / 2, stepTop, s.stepW, s.stepH));
    ctx.setFillColor(new Color("#000000", 0.25));
    ctx.fillRect(new Rect(s.cx - s.stepW / 2, stepTop, s.stepW, s.stepH));
    const name = s.r.name.toUpperCase();
    const fs = Math.min(s.nameFs, (s.stepW - 8) / (name.length * 0.68));
    ctx.setFont(Font.heavySystemFont(fs));
    ctx.setTextColor(Color.white());
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(name, new Rect(s.cx - s.stepW / 2, stepTop + (s.stepH - fs * 1.25) / 2, s.stepW, fs * 1.3));

    // 4) Médaille avec la position
    const m = s === p1 ? 20 : 16;
    const mx = s.cx - s.stepW / 2 + 4, my = stepTop - m - 3;
    ctx.setFillColor(s.medal);
    ctx.fillEllipse(new Rect(mx, my, m, m));
    ctx.setFont(Font.heavySystemFont(m * 0.6));
    ctx.setTextColor(new Color("#15151E"));
    ctx.drawTextInRect(s.r.pos, new Rect(mx, my + m * 0.14, m, m * 0.8));
  }
  // 5) Logo de l'écurie du vainqueur (en haut à droite, au-dessus du P3)
  if (p1.r) {
    const logo = imgs && imgs.logo;
    const boxW = 84, boxH = 26, bx = W - boxW - 2, by = 2;
    if (logo) {
      let lw = boxW, lh = (lw * logo.size.height) / logo.size.width;
      if (lh > boxH) { lh = boxH; lw = (lh * logo.size.width) / logo.size.height; }
      ctx.drawImageInRect(logo, new Rect(bx + (boxW - lw) / 2, by + (boxH - lh) / 2, lw, lh));
    } else {
      // Repli : badge texte avec le nom de l'écurie
      const label = (TEAM_SHORT[p1.r.teamId] || p1.r.teamId).toUpperCase();
      ctx.setFillColor(new Color("#000000", 0.35));
      ctx.fillRect(new Rect(bx, by + 3, boxW, boxH - 6));
      ctx.setFillColor(new Color(TEAM_COLORS[p1.r.teamId] || "#888888"));
      ctx.fillRect(new Rect(bx, by + 3, 3, boxH - 6));
      const lfs = Math.min(10, (boxW - 10) / (label.length * 0.68));
      ctx.setFont(Font.heavySystemFont(lfs));
      ctx.setTextColor(Color.white());
      ctx.setTextAlignedCenter();
      ctx.drawTextInRect(label, new Rect(bx + 3, by + (boxH - lfs * 1.25) / 2, boxW - 3, lfs * 1.3));
    }
  }
  return ctx.getImage();
}

function widgetContentWidth(padding) {
  const sw = Device.screenSize().width;
  return Math.min(Math.round(sw * 0.865), 364) - padding;
}

function addPodium(stack, data, imgs, width) {
  if (!data.lastRace) return;
  const img = stack.addImage(drawPodium(data.lastRace.results, imgs));
  img.imageSize = new Size(width, (width * 116) / 320);
  img.centerAlignImage();
}

// ---------------------------------------------------------------- blocs UI

function header(w, data, fs) {
  const row = w.addStack();
  row.centerAlignContent();
  const badge = row.addStack();
  badge.backgroundColor = C.red;
  badge.cornerRadius = 4;
  badge.setPadding(1, 5, 1, 5);
  addText(badge, "F1", Font.heavySystemFont(fs), Color.white(), { scale: false });
  row.addSpacer(6);
  const lr = data.lastRace;
  addText(row, lr ? shortRaceName(lr.name) : "Aucune course", Font.boldSystemFont(fs), C.text);
  row.addSpacer();
  if (lr) addText(row, `R${lr.round} · ${fmtDate(lr.date + "T12:00:00Z", "d MMM")}`, Font.mediumSystemFont(fs - 2), C.dim);
}

function sectionTitle(stack, title, fs) {
  addText(stack, title.toUpperCase(), Font.heavySystemFont(fs - 3), C.accent, { scale: false });
  stack.addSpacer(3);
}

function driverRow(col, r, fs, showGap) {
  const row = col.addStack();
  row.centerAlignContent();
  const pos = row.addStack();
  pos.size = new Size(fs * 1.4, 0);
  addText(pos, r.pos, Font.boldMonospacedSystemFont(fs - 1), posColor(r.pos), { scale: false });
  colorBar(row, teamColor(r.teamId), fs);
  row.addSpacer(4);
  addText(row, showGap ? r.code : r.name, Font.semiboldSystemFont(fs), C.text);
  row.addSpacer();
  if (showGap) {
    const gap = r.pos === "1" ? r.gap : (r.gap || "").replace(/^\+?/, "+");
    addText(row, gap, Font.regularMonospacedSystemFont(fs - 3), C.dim, { right: true, scale: 0.5 });
  } else {
    addText(row, `${r.points}`, Font.mediumMonospacedSystemFont(fs - 2), C.dim, { right: true });
  }
}

function constructorRow(col, c, fs) {
  const row = col.addStack();
  row.centerAlignContent();
  const pos = row.addStack();
  pos.size = new Size(fs * 1.4, 0);
  addText(pos, c.pos, Font.boldMonospacedSystemFont(fs - 1), posColor(c.pos), { scale: false });
  colorBar(row, teamColor(c.teamId), fs);
  row.addSpacer(4);
  addText(row, c.name, Font.semiboldSystemFont(fs), C.text);
  row.addSpacer(4);
  addText(row, `${c.points}`, Font.boldMonospacedSystemFont(fs - 1), C.text, { right: true, scale: false });
}

function nextRaceBlock(w, data, fs, compact) {
  const box = w.addStack();
  box.backgroundColor = new Color("#FFFFFF", 0.08);
  box.cornerRadius = 7;
  box.setPadding(4, 8, 4, 8);
  box.centerAlignContent();
  const nr = data.nextRace;
  if (!nr) {
    addText(box, "Prochain GP : calendrier indisponible", Font.mediumSystemFont(fs - 1), C.dim);
    return;
  }
  addText(box, compact ? "NEXT" : "PROCHAIN GP", Font.heavySystemFont(fs - 3), C.accent, { scale: false });
  box.addSpacer(6);
  addText(box, shortRaceName(nr.name) + (nr.sprint && !compact ? " · Sprint" : ""), Font.boldSystemFont(fs), C.text);
  box.addSpacer(6);
  addText(box, fmtDate(nr.start, compact ? "d MMM HH:mm" : "EEE d MMM · HH:mm"), Font.mediumSystemFont(fs - 2), C.dim);
  box.addSpacer();
  addText(box, countdown(nr.start), Font.heavyMonospacedSystemFont(fs), C.text, { right: true, scale: false });
}

function footer(w, offline, fetchedAt) {
  if (!offline) return;
  w.addSpacer(2);
  const row = w.addStack();
  row.addSpacer();
  addText(row, `hors ligne · màj ${fmtDate(fetchedAt, "d MMM HH:mm")}`, Font.italicSystemFont(8), C.dim);
}

// ---------------------------------------------------------------- widgets

// Assombrit une couleur hex (factor 0..1) pour garder le texte blanc lisible
function shade(hex, factor) {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (v) => Math.round(v * factor).toString(16).padStart(2, "0");
  return "#" + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

function baseWidget(data) {
  const w = new ListWidget();
  const g = new LinearGradient();
  const p1 = data && data.lastRace && data.lastRace.results[0];
  const team = p1 && TEAM_COLORS[p1.teamId];
  if (TEAM_BACKGROUND && team) {
    g.colors = [new Color(shade(team, 0.62)), new Color(shade(team, 0.28)), new Color("#050507")];
    g.locations = [0, 0.5, 1];
  } else {
    g.colors = [C.bgTop, C.bgBottom];
    g.locations = [0, 1];
  }
  w.backgroundGradient = g;
  w.url = "https://www.formula1.com/en/results";
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60000);
  return w;
}

function largeWidget(data, imgs, offline) {
  const w = baseWidget(data);
  const pad = 12;
  w.setPadding(10, pad, 10, pad);
  const fs = 10.5;
  header(w, data, 13);
  w.addSpacer(4);
  addPodium(w, data, imgs, widgetContentWidth(pad * 2));
  w.addSpacer(6);

  const cols = w.addStack();
  cols.layoutHorizontally();
  cols.topAlignContent();

  const left = cols.addStack();
  left.layoutVertically();
  left.spacing = 1.5;
  sectionTitle(left, "P4 – P10", fs);
  (data.lastRace ? data.lastRace.results.slice(3, 10) : []).forEach((r) => driverRow(left, r, fs, true));

  cols.addSpacer(12);

  const right = cols.addStack();
  right.layoutVertically();
  right.spacing = 1.5;
  sectionTitle(right, "Constructeurs", fs);
  data.constructors.slice(0, 11).forEach((c) => constructorRow(right, c, fs));

  w.addSpacer();
  nextRaceBlock(w, data, 11, false);
  footer(w, offline, data.fetchedAt);
  return w;
}

function mediumWidget(data, imgs, offline) {
  const w = baseWidget(data);
  w.setPadding(8, 10, 8, 10);
  const fs = 9;
  const row = w.addStack();
  row.centerAlignContent();
  const podiumW = Math.round(widgetContentWidth(20) * 0.6);
  const left = row.addStack();
  left.layoutVertically();
  const lr = data.lastRace;
  addText(left, lr ? shortRaceName(lr.name) : "F1", Font.heavySystemFont(10), C.text);
  left.addSpacer(2);
  addPodium(left, data, imgs, podiumW);
  row.addSpacer(8);
  const col = row.addStack();
  col.layoutVertically();
  col.spacing = 1;
  (lr ? lr.results.slice(3, 10) : []).forEach((r) => driverRow(col, r, fs, true));
  w.addSpacer();
  nextRaceBlock(w, data, 10, true);
  footer(w, offline, data.fetchedAt);
  return w;
}

function smallWidget(data, imgs, offline) {
  const w = baseWidget(data);
  w.setPadding(8, 8, 8, 8);
  const lr = data.lastRace;
  addText(w, lr ? shortRaceName(lr.name) : "F1", Font.heavySystemFont(10), C.text);
  w.addSpacer(2);
  addPodium(w, data, imgs, Math.round(Device.screenSize().width * 0.42) - 16);
  w.addSpacer();
  const nr = data.nextRace;
  if (nr) {
    addText(w, shortRaceName(nr.name), Font.boldSystemFont(10), C.text);
    const r = w.addStack();
    addText(r, fmtDate(nr.start, "d MMM HH:mm"), Font.mediumSystemFont(9), C.dim);
    r.addSpacer();
    addText(r, countdown(nr.start), Font.heavyMonospacedSystemFont(10), C.text, { scale: false });
  }
  footer(w, offline, data.fetchedAt);
  return w;
}

function errorWidget(msg) {
  const w = baseWidget();
  addText(w, "F1 Podium", Font.heavySystemFont(14), C.red);
  w.addSpacer(6);
  addText(w, "Impossible de charger les données.", Font.mediumSystemFont(11), C.text, { scale: false }).lineLimit = 0;
  w.addSpacer(4);
  addText(w, msg, Font.regularSystemFont(9), C.dim, { scale: false }).lineLimit = 3;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
  return w;
}

// ---------------------------------------------------------------- main

async function main() {
  const family = config.widgetFamily || "large";
  let widget;
  try {
    const { data, offline } = await getData();
    const imgs = await loadPodiumImages(data.lastRace);
    widget =
      family === "small" ? smallWidget(data, imgs, offline)
      : family === "medium" ? mediumWidget(data, imgs, offline)
      : largeWidget(data, imgs, offline);
  } catch (e) {
    widget = errorWidget(String(e && e.message ? e.message : e));
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentLarge();
  }
  Script.complete();
}

await main();
