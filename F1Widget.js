// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: flag-checkered;

/**
 * F1 Podium – widget iPhone pour Scriptable
 * -----------------------------------------
 *  • Top 10 de la dernière course
 *  • Classement constructeurs (points de chaque écurie)
 *  • Date du prochain Grand Prix (+ compte à rebours)
 *
 * Données : API Jolpica F1 (compatible Ergast) – https://api.jolpi.ca
 * Taille conseillée : GRAND widget (toutes les infos).
 *  - Moyen : top 10 + prochain GP
 *  - Petit : podium + prochain GP
 */

const API = "https://api.jolpi.ca/ergast/f1";
const LOCALE = "fr_FR";
const CACHE_FILE = "f1-podium-cache.json";
const REFRESH_MINUTES = 60;

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
  text: Color.white(),
  dim: new Color("#9A9AA5"),
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

  return {
    fetchedAt: now.toISOString(),
    lastRace: lastRace && {
      name: lastRace.raceName,
      round: lastRace.round,
      season: lastRace.season,
      date: lastRace.date,
      results: lastRace.Results.slice(0, 10).map((r) => ({
        pos: r.position,
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
  addText(stack, title.toUpperCase(), Font.heavySystemFont(fs - 3), C.red, { scale: false });
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
  box.cornerRadius = 8;
  box.setPadding(5, 8, 5, 8);
  box.centerAlignContent();
  const nr = data.nextRace;
  if (!nr) {
    addText(box, "Prochain GP : calendrier indisponible", Font.mediumSystemFont(fs - 1), C.dim);
    return;
  }
  const left = box.addStack();
  left.layoutVertically();
  addText(left, compact ? "PROCHAIN" : "PROCHAIN GRAND PRIX", Font.heavySystemFont(fs - 4), C.red, { scale: false });
  addText(left, shortRaceName(nr.name) + (nr.sprint && !compact ? " · Sprint" : ""), Font.boldSystemFont(fs), C.text);
  addText(left, fmtDate(nr.start, compact ? "EEE d MMM HH:mm" : "EEEE d MMMM · HH:mm"), Font.mediumSystemFont(fs - 2), C.dim);
  box.addSpacer();
  addText(box, countdown(nr.start), Font.heavyMonospacedSystemFont(fs + 2), C.text, { right: true, scale: false });
}

function footer(w, offline, fetchedAt) {
  if (!offline) return;
  w.addSpacer(2);
  const row = w.addStack();
  row.addSpacer();
  addText(row, `hors ligne · màj ${fmtDate(fetchedAt, "d MMM HH:mm")}`, Font.italicSystemFont(8), C.dim);
}

// ---------------------------------------------------------------- widgets

function baseWidget() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.bgTop, C.bgBottom];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = "https://www.formula1.com/en/results";
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60000);
  return w;
}

function largeWidget(data, offline) {
  const w = baseWidget();
  w.setPadding(12, 12, 10, 12);
  const fs = 12;
  header(w, data, 14);
  w.addSpacer(8);

  const cols = w.addStack();
  cols.layoutHorizontally();
  cols.topAlignContent();

  const left = cols.addStack();
  left.layoutVertically();
  left.spacing = 2.5;
  sectionTitle(left, "Top 10", fs);
  (data.lastRace ? data.lastRace.results : []).forEach((r) => driverRow(left, r, fs, true));

  cols.addSpacer(12);

  const right = cols.addStack();
  right.layoutVertically();
  right.spacing = 2.5;
  sectionTitle(right, "Constructeurs", fs);
  data.constructors.slice(0, 11).forEach((c) => constructorRow(right, c, fs));

  w.addSpacer();
  nextRaceBlock(w, data, 13, false);
  footer(w, offline, data.fetchedAt);
  return w;
}

function mediumWidget(data, offline) {
  const w = baseWidget();
  w.setPadding(10, 12, 8, 12);
  const fs = 10;
  header(w, data, 12);
  w.addSpacer(5);
  const cols = w.addStack();
  const results = data.lastRace ? data.lastRace.results : [];
  [results.slice(0, 5), results.slice(5, 10)].forEach((chunk, i) => {
    if (i) cols.addSpacer(10);
    const col = cols.addStack();
    col.layoutVertically();
    col.spacing = 1.5;
    chunk.forEach((r) => driverRow(col, r, fs, false));
  });
  w.addSpacer();
  nextRaceBlock(w, data, 11, true);
  footer(w, offline, data.fetchedAt);
  return w;
}

function smallWidget(data, offline) {
  const w = baseWidget();
  w.setPadding(10, 10, 8, 10);
  const fs = 11;
  const lr = data.lastRace;
  addText(w, lr ? shortRaceName(lr.name) : "F1", Font.heavySystemFont(fs), C.red);
  w.addSpacer(4);
  const col = w.addStack();
  col.layoutVertically();
  col.spacing = 2;
  (lr ? lr.results.slice(0, 3) : []).forEach((r) => driverRow(col, r, fs, false));
  w.addSpacer();
  const nr = data.nextRace;
  if (nr) {
    addText(w, shortRaceName(nr.name), Font.boldSystemFont(fs - 1), C.text);
    const row = w.addStack();
    addText(row, fmtDate(nr.start, "d MMM HH:mm"), Font.mediumSystemFont(fs - 2), C.dim);
    row.addSpacer();
    addText(row, countdown(nr.start), Font.heavyMonospacedSystemFont(fs - 1), C.text, { scale: false });
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
    widget =
      family === "small" ? smallWidget(data, offline)
      : family === "medium" ? mediumWidget(data, offline)
      : largeWidget(data, offline);
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
