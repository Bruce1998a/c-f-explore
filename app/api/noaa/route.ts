const NOAA_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/sstoi.indices';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(NOAA_URL, {
      headers: { 'user-agent': 'C-F Explore climate dashboard' },
      cf: { cacheTtl: 21600, cacheEverything: true },
    } as RequestInit);

    if (!response.ok) throw new Error(`NOAA respondió ${response.status}`);
    const text = await response.text();
    const rows = text
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter((parts) => parts.length >= 10 && Number.isFinite(parts[0]))
      .map(([year, month, nino12, anom12, nino3, anom3, nino4, anom4, nino34, anom34]) => ({
        year, month, nino12, anom12, nino3, anom3, nino4, anom4, nino34, anom34,
      }));

    return Response.json(
      { source: 'NOAA Climate Prediction Center', sourceUrl: NOAA_URL, updatedAt: new Date().toISOString(), rows },
      { headers: { 'cache-control': 'public, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'No fue posible consultar NOAA' },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}
