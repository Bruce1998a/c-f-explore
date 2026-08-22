import { mkdir, writeFile } from 'node:fs/promises';

const NOAA_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/sstoi.indices';
const SHEET_ID = '1Nivv_cVrw0vfb2JOe6TSn-Enom0nhFgv83ZY9H1C1TM';
const SHEET_GID = '1075634200';
const QUERY = `select C, BG, P, L, count(B), sum(BV), sum(V), sum(AZ), sum(AV)
  where C is not null and BG is not null
  group by C, BG, P, L
  label count(B) 'eventos', sum(BV) 'impactadas', sum(V) 'fallecidas', sum(AZ) 'hectareas_quemadas', sum(AV) 'metros_vias'`;

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { cells.push(current); current = ''; }
    else current += character;
  }
  cells.push(current);
  return cells;
}

const toNumber = (value) => Number(String(value || '0').replace(/\s/g, '').replace(',', '.')) || 0;
const fetchText = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { 'user-agent': 'C-F Explore GitHub data updater' } });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  return response.text();
};

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
const updatedAt = new Date().toISOString();

const noaaText = await fetchText(NOAA_URL);
const noaaRows = noaaText.trim().split(/\r?\n/).slice(1)
  .map((line) => line.trim().split(/\s+/).map(Number))
  .filter((parts) => parts.length >= 10 && Number.isFinite(parts[0]))
  .map(([year, month, nino12, anom12, nino3, anom3, nino4, anom4, nino34, anom34]) => ({ year, month, nino12, anom12, nino3, anom3, nino4, anom4, nino34, anom34 }));

const queryUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}&tq=${encodeURIComponent(QUERY)}`;
const eventCsv = await fetchText(queryUrl);
const eventRows = eventCsv.split(/\r?\n/).slice(1).filter(Boolean).map(splitCsvLine).filter((cells) => cells.length >= 9)
  .map(([province, year, month, event, events, impacted, deaths, burnedHectares, affectedRoadMeters]) => ({
    province, year: toNumber(year), month: toNumber(month), event, events: toNumber(events), impacted: toNumber(impacted),
    deaths: toNumber(deaths), burnedHectares: toNumber(burnedHectares), affectedRoadMeters: toNumber(affectedRoadMeters),
  }));

await Promise.all([
  writeFile(new URL('../public/data/noaa.json', import.meta.url), JSON.stringify({ source: 'NOAA Climate Prediction Center', sourceUrl: NOAA_URL, updatedAt, rows: noaaRows })),
  writeFile(new URL('../public/data/events.json', import.meta.url), JSON.stringify({ source: 'Secretaría Nacional de Gestión de Riesgos · Ecuador', sourceUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}`, updatedAt, rows: eventRows })),
]);

console.log(`Actualizados ${noaaRows.length} registros NOAA y ${eventRows.length} agregados de riesgos.`);
