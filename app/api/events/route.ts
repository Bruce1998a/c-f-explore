const SHEET_ID = '1Nivv_cVrw0vfb2JOe6TSn-Enom0nhFgv83ZY9H1C1TM';
const SHEET_GID = '1075634200';

const QUERY = `select C, BG, P, L, count(B), sum(BV), sum(V), sum(AZ), sum(AV)
  where C is not null and BG is not null
  group by C, BG, P, L
  label count(B) 'eventos', sum(BV) 'impactadas', sum(V) 'fallecidas', sum(AZ) 'hectareas_quemadas', sum(AV) 'metros_vias'`;

export const dynamic = 'force-dynamic';

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else current += character;
  }
  cells.push(current);
  return cells;
}

const toNumber = (value: string) => Number(String(value || '0').replace(/\s/g, '').replace(',', '.')) || 0;

export async function GET() {
  const sourceUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}`;
  const queryUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}&tq=${encodeURIComponent(QUERY)}`;
  try {
    const response = await fetch(queryUrl, {
      headers: { 'user-agent': 'C-F Explore risk dashboard' },
      cf: { cacheTtl: 21600, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}`);
    const csv = await response.text();
    const rows = csv
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map(splitCsvLine)
      .filter((cells) => cells.length >= 9)
      .map(([province, year, month, event, events, impacted, deaths, burnedHectares, affectedRoadMeters]) => ({
        province,
        year: toNumber(year),
        month: toNumber(month),
        event,
        events: toNumber(events),
        impacted: toNumber(impacted),
        deaths: toNumber(deaths),
        burnedHectares: toNumber(burnedHectares),
        affectedRoadMeters: toNumber(affectedRoadMeters),
      }));

    return Response.json(
      { source: 'Secretaría Nacional de Gestión de Riesgos · Ecuador', sourceUrl, updatedAt: new Date().toISOString(), rows },
      { headers: { 'cache-control': 'public, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'No fue posible consultar la base de riesgos' },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}
