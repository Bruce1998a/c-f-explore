'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

type View = 'climate' | 'risk';
type ClimateKey = 'anom12' | 'anom3' | 'anom4' | 'anom34';
type RiskMetric = 'events' | 'impacted' | 'deaths' | 'burnedHectares' | 'affectedRoadKilometers';
type Grouping = 'province' | 'region' | 'month';
type LoadState = 'loading' | 'live' | 'fallback';

type NoaaRow = {
  year: number; month: number; nino12: number; anom12: number; nino3: number;
  anom3: number; nino4: number; anom4: number; nino34: number; anom34: number;
};

type EventRow = {
  province: string; year: number; month: number; event: string; events: number;
  impacted: number; deaths: number; burnedHectares: number; affectedRoadMeters: number;
};

type ChartSeries = { name: string; color: string; values: Array<number | null>; dashed?: boolean };
type ApiPayload<T> = { rows: T[]; updatedAt?: string };

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const INDEXES: Record<ClimateKey, { label: string; short: string }> = {
  anom34: { label: 'Niño 3.4 · anomalía', short: 'Niño 3.4' },
  anom12: { label: 'Niño 1+2 · anomalía', short: 'Niño 1+2' },
  anom3: { label: 'Niño 3 · anomalía', short: 'Niño 3' },
  anom4: { label: 'Niño 4 · anomalía', short: 'Niño 4' },
};

const METRICS: Record<RiskMetric, { label: string; unit: string; short: string }> = {
  events: { label: 'Número de eventos', unit: '', short: 'eventos' },
  impacted: { label: 'Personas impactadas', unit: '', short: 'personas' },
  deaths: { label: 'Personas fallecidas', unit: '', short: 'personas' },
  burnedHectares: { label: 'Cobertura vegetal quemada', unit: ' ha', short: 'hectáreas' },
  affectedRoadKilometers: { label: 'Vías afectadas', unit: ' km', short: 'kilómetros' },
};

const REGION_BY_PROVINCE: Record<string, string> = {
  azuay: 'Sierra', bolivar: 'Sierra', canar: 'Sierra', carchi: 'Sierra', chimborazo: 'Sierra',
  cotopaxi: 'Sierra', imbabura: 'Sierra', loja: 'Sierra', pichincha: 'Sierra', tungurahua: 'Sierra',
  'santo domingo de los tsachilas': 'Costa', 'el oro': 'Costa', esmeraldas: 'Costa', guayas: 'Costa',
  'los rios': 'Costa', manabi: 'Costa', 'santa elena': 'Costa',
  'morona santiago': 'Amazonía', napo: 'Amazonía', orellana: 'Amazonía', pastaza: 'Amazonía',
  sucumbios: 'Amazonía', 'zamora chinchipe': 'Amazonía', galapagos: 'Insular',
};

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const regionOf = (province: string) => REGION_BY_PROVINCE[normalize(province)] || 'Sin región';
const numeric = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1 });

function fallbackNoaa(): NoaaRow[] {
  const years: Record<number, number[]> = {
    1982: [-0.2, -0.1, 0.1, 0.2, 0.5, 0.7, 0.9, 1.3, 1.7, 2.0, 2.1, 2.2],
    1997: [-0.6, -0.4, -0.2, 0.1, 0.7, 1.2, 1.7, 2.0, 2.2, 2.3, 2.4, 2.3],
    2015: [0.5, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.1, 2.4, 2.5, 2.4],
    2025: [-0.7, -0.5, -0.3, -0.2, 0.0, 0.1, 0.0, -0.1, -0.1, -0.2, -0.3, -0.4],
  };
  return Object.entries(years).flatMap(([year, values]) => values.map((value, month) => ({
    year: Number(year), month: month + 1, nino12: 25 + value, anom12: value * 1.2,
    nino3: 26 + value, anom3: value * 1.05, nino4: 28 + value, anom4: value * .75,
    nino34: 27 + value, anom34: value,
  })));
}

const FALLBACK_EVENTS: EventRow[] = [
  ['Pichincha',2025,8,'Incendio Forestal',23,214,0,1380,0], ['Loja',2025,9,'Incendio Forestal',19,86,0,2440,0],
  ['Azuay',2025,9,'Incendio Forestal',16,92,0,1870,0], ['Imbabura',2025,8,'Incendio Forestal',13,41,0,795,0],
  ['Chimborazo',2025,10,'Incendio Forestal',11,63,0,1120,0], ['Guayas',2025,3,'Inundación',47,12450,2,0,38_000],
  ['Los Ríos',2025,3,'Inundación',31,8620,1,0,21_000], ['Manabí',2025,2,'Inundación',29,5170,0,0,17_000],
  ['Esmeraldas',2024,2,'Inundación',22,3200,1,0,14_000], ['Napo',2024,6,'Deslizamiento',17,740,3,0,26_000],
  ['Morona Santiago',2024,7,'Deslizamiento',14,460,2,0,18_000], ['El Oro',2024,3,'Vendaval',21,980,0,0,0],
  ['Cotopaxi',2023,7,'Actividad Volcánica',9,1720,0,0,0], ['Tungurahua',2023,5,'Deslizamiento',12,390,1,0,11_000],
  ['Galápagos',2023,10,'Incendio Forestal',4,0,0,37,0], ['Sucumbíos',2023,4,'Inundación',18,2630,0,0,9_000],
].map(([province,year,month,event,events,impacted,deaths,burnedHectares,affectedRoadMeters]) => ({
  province: String(province), year: Number(year), month: Number(month), event: String(event), events: Number(events),
  impacted: Number(impacted), deaths: Number(deaths), burnedHectares: Number(burnedHectares), affectedRoadMeters: Number(affectedRoadMeters),
}));

const DataCanvas = forwardRef<HTMLCanvasElement, {
  title: string; subtitle: string; labels: string[]; series: ChartSeries[]; kind: 'line' | 'bar'; unit: string;
}>(({ title, subtitle, labels, series, kind, unit }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const width = Math.max(320, canvas.parentElement?.clientWidth || 900);
      const height = 360;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.textBaseline = 'middle';
      context.fillStyle = '#072c35';
      context.font = '600 17px Georgia, serif';
      context.fillText(title, 18, 23);
      context.fillStyle = '#718384';
      context.font = '10px system-ui, sans-serif';
      context.fillText(subtitle, 18, 44);
      context.textAlign = 'right';
      context.fillStyle = '#072c35';
      context.font = '800 11px system-ui, sans-serif';
      context.fillText('C-F Explore', width - 18, 24);
      context.textAlign = 'left';

      const plot = { left: 56, right: width - 20, top: 68, bottom: 319 };
      const rawValues = series.flatMap((item) => item.values).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const minValue = rawValues.length ? Math.min(...rawValues) : 0;
      const maxValue = rawValues.length ? Math.max(...rawValues) : 1;
      const maximum = kind === 'bar' ? Math.max(1, maxValue * 1.14) : Math.max(1, Math.ceil(Math.max(Math.abs(minValue), Math.abs(maxValue)) * 2) / 2);
      const minimum = kind === 'bar' ? 0 : -maximum;
      const range = maximum - minimum || 1;
      const xFor = (index: number) => plot.left + (labels.length === 1 ? 0 : index * (plot.right - plot.left) / Math.max(1, labels.length - 1));
      const yFor = (value: number) => plot.bottom - ((value - minimum) / range) * (plot.bottom - plot.top);

      for (let index = 0; index <= 4; index += 1) {
        const value = maximum - (range * index / 4);
        const y = plot.top + (plot.bottom - plot.top) * index / 4;
        context.strokeStyle = '#e4ebe7';
        context.lineWidth = 1;
        context.beginPath(); context.moveTo(plot.left, y); context.lineTo(plot.right, y); context.stroke();
        context.fillStyle = '#819190';
        context.font = '9px system-ui, sans-serif';
        context.textAlign = 'right';
        context.fillText(`${numeric.format(value)}${unit}`, plot.left - 8, y);
      }

      if (kind === 'line' && minimum < 0 && maximum > 0) {
        context.strokeStyle = '#aebbb7'; context.setLineDash([4, 4]);
        context.beginPath(); context.moveTo(plot.left, yFor(0)); context.lineTo(plot.right, yFor(0)); context.stroke(); context.setLineDash([]);
      }

      if (kind === 'bar') {
        const slot = (plot.right - plot.left) / Math.max(1, labels.length);
        const barWidth = Math.max(5, Math.min(42, slot * .58 / Math.max(1, series.length)));
        series.forEach((item, seriesIndex) => item.values.forEach((value, index) => {
          if (value === null) return;
          const x = plot.left + slot * index + slot / 2 + (seriesIndex - (series.length - 1) / 2) * (barWidth + 3);
          const y = yFor(value);
          context.fillStyle = item.color;
          context.fillRect(x - barWidth / 2, y, barWidth, Math.max(2, plot.bottom - y));
        }));
      } else {
        series.forEach((item) => {
          context.strokeStyle = item.color; context.lineWidth = 2.5; context.lineJoin = 'round'; context.lineCap = 'round';
          context.setLineDash(item.dashed ? [7, 6] : []); context.beginPath();
          let started = false;
          item.values.forEach((value, index) => {
            if (value === null) { started = false; return; }
            const x = xFor(index); const y = yFor(value);
            if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
          });
          context.stroke(); context.setLineDash([]);
          item.values.forEach((value, index) => {
            if (value === null) return;
            context.beginPath(); context.arc(xFor(index), yFor(value), 3.2, 0, Math.PI * 2); context.fillStyle = item.color; context.fill();
          });
        });
      }

      context.textAlign = 'center';
      context.fillStyle = '#718384';
      context.font = '8px system-ui, sans-serif';
      const labelStep = width < 620 ? Math.ceil(labels.length / 6) : 1;
      labels.forEach((label, index) => {
        if (index % labelStep !== 0) return;
        const x = kind === 'bar'
          ? plot.left + ((plot.right - plot.left) / Math.max(1, labels.length)) * index + ((plot.right - plot.left) / Math.max(1, labels.length)) / 2
          : xFor(index);
        context.fillText(label.length > 14 ? `${label.slice(0, 13)}…` : label, x, 338);
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [kind, labels, series, subtitle, title, unit]);

  return <canvas ref={canvasRef} role="img" aria-label={`${title}. ${subtitle}`} />;
});
DataCanvas.displayName = 'DataCanvas';

export default function Explorer() {
  const [view, setView] = useState<View>('climate');
  const [noaaRows, setNoaaRows] = useState<NoaaRow[]>(fallbackNoaa);
  const [eventRows, setEventRows] = useState<EventRow[]>(FALLBACK_EVENTS);
  const [noaaState, setNoaaState] = useState<LoadState>('loading');
  const [eventState, setEventState] = useState<LoadState>('loading');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [climateIndex, setClimateIndex] = useState<ClimateKey>('anom34');
  const [year, setYear] = useState(2025);
  const [compareYear, setCompareYear] = useState(1997);
  const [event, setEvent] = useState('Incendio Forestal');
  const [eventYear, setEventYear] = useState('todos');
  const [province, setProvince] = useState('todas');
  const [region, setRegion] = useState('todas');
  const [metric, setMetric] = useState<RiskMetric>('burnedHectares');
  const [grouping, setGrouping] = useState<Grouping>('province');
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const readJson = async <T,>(url: string): Promise<ApiPayload<T>> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} no disponible`);
      return response.json() as Promise<ApiPayload<T>>;
    };
    const loadNoaa = async () => {
      let state: LoadState = 'live';
      let data: ApiPayload<NoaaRow>;
      try {
        if (BASE_PATH) throw new Error('GitHub Pages usa el snapshot actualizado');
        data = await readJson<NoaaRow>('/api/noaa');
      }
      catch {
        state = BASE_PATH ? 'live' : 'fallback';
        try { data = await readJson<NoaaRow>(`${BASE_PATH}/data/noaa.json`); } catch { setNoaaState('fallback'); return; }
      }
      if (!Array.isArray(data.rows) || !data.rows.length) { setNoaaState('fallback'); return; }
      setNoaaRows(data.rows);
      const years = [...new Set<number>(data.rows.map((row: NoaaRow) => row.year))].sort((a, b) => b - a);
      setYear(years[0]); setCompareYear(years.includes(1997) ? 1997 : years[1]);
      setUpdatedAt(data.updatedAt || ''); setNoaaState(state);
    };
    const loadEvents = async () => {
      let state: LoadState = 'live';
      let data: ApiPayload<EventRow>;
      try {
        if (BASE_PATH) throw new Error('GitHub Pages usa el snapshot actualizado');
        data = await readJson<EventRow>('/api/events');
      }
      catch {
        state = BASE_PATH ? 'live' : 'fallback';
        try { data = await readJson<EventRow>(`${BASE_PATH}/data/events.json`); } catch { setEventState('fallback'); return; }
      }
      if (!Array.isArray(data.rows) || !data.rows.length) { setEventState('fallback'); return; }
      setEventRows(data.rows); setUpdatedAt((current) => current || data.updatedAt || ''); setEventState(state);
    };
    void loadNoaa(); void loadEvents();
  }, []);

  const climateYears = useMemo(() => [...new Set(noaaRows.map((row) => row.year))].sort((a, b) => b - a), [noaaRows]);
  const climateSeries = useMemo(() => {
    const valuesFor = (selectedYear: number) => MONTHS.map((_, month) => noaaRows.find((row) => row.year === selectedYear && row.month === month + 1)?.[climateIndex] ?? null);
    return [
      { name: String(year), color: '#f36f50', values: valuesFor(year) },
      { name: String(compareYear), color: '#0b766f', values: valuesFor(compareYear), dashed: true },
    ];
  }, [climateIndex, compareYear, noaaRows, year]);

  const eventOptions = useMemo(() => [...new Set(eventRows.map((row) => row.event).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [eventRows]);
  const provinces = useMemo(() => [...new Set(eventRows.map((row) => row.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [eventRows]);
  const eventYears = useMemo(() => [...new Set(eventRows.map((row) => row.year).filter(Boolean))].sort((a, b) => b - a), [eventRows]);

  const riskSummary = useMemo(() => {
    const filtered = eventRows.filter((row) =>
      (event === 'todos' || normalize(row.event) === normalize(event)) &&
      (eventYear === 'todos' || row.year === Number(eventYear)) &&
      (province === 'todas' || normalize(row.province) === normalize(province)) &&
      (region === 'todas' || regionOf(row.province) === region)
    );
    const groups = new Map<string, { label: string; events: number; impacted: number; deaths: number; burnedHectares: number; affectedRoadKilometers: number }>();
    filtered.forEach((row) => {
      const label = grouping === 'province' ? row.province : grouping === 'region' ? regionOf(row.province) : MONTHS[Math.max(0, row.month - 1)] || 'Sin mes';
      const current = groups.get(label) || { label, events: 0, impacted: 0, deaths: 0, burnedHectares: 0, affectedRoadKilometers: 0 };
      current.events += row.events; current.impacted += row.impacted; current.deaths += row.deaths;
      current.burnedHectares += row.burnedHectares; current.affectedRoadKilometers += row.affectedRoadMeters / 1000;
      groups.set(label, current);
    });
    const result = [...groups.values()];
    if (grouping === 'month') result.sort((a, b) => MONTHS.indexOf(a.label) - MONTHS.indexOf(b.label));
    else result.sort((a, b) => b[metric] - a[metric]);
    return result.slice(0, grouping === 'province' ? 14 : 12);
  }, [event, eventRows, eventYear, grouping, metric, province, region]);

  const currentValues = climateSeries[0].values.filter((value): value is number => value !== null);
  const comparisonValues = climateSeries[1].values;
  const lastMonthIndex = climateSeries[0].values.reduce<number>((last, value, index) => value === null ? last : index, -1);
  const latestValue = lastMonthIndex >= 0 ? climateSeries[0].values[lastMonthIndex] : null;
  const comparisonValue = lastMonthIndex >= 0 ? comparisonValues[lastMonthIndex] : null;
  const peakValue = currentValues.length ? Math.max(...currentValues) : null;
  const riskTotal = riskSummary.reduce((sum, row) => sum + row[metric], 0);

  const status = view === 'climate' ? noaaState : eventState;
  const exportImage = () => {
    const canvas = chartRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `cf-explore-${view}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const exportCsv = () => {
    const rows = view === 'climate'
      ? [['Mes', String(year), String(compareYear)], ...MONTHS.map((month, index) => [month, climateSeries[0].values[index] ?? '', climateSeries[1].values[index] ?? ''])]
      : [['Grupo', 'Eventos', 'Personas impactadas', 'Fallecidas', 'Hectáreas quemadas', 'Kilómetros de vías'], ...riskSummary.map((row) => [row.label, row.events, row.impacted, row.deaths, row.burnedHectares, row.affectedRoadKilometers])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `cf-explore-${view}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <main className="shell" id="inicio">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="C-F Explore, inicio"><span className="brand-mark">C·F</span><span>Explore</span></a>
        <div className={`live-status ${status}`}><span />{status === 'live' ? 'Datos sincronizados' : status === 'loading' ? 'Conectando datos' : 'Datos de respaldo'}</div>
        <nav aria-label="Módulos de análisis">
          <button className={view === 'climate' ? 'nav-tab active' : 'nav-tab'} onClick={() => setView('climate')}>El Niño</button>
          <button className={view === 'risk' ? 'nav-tab active' : 'nav-tab'} onClick={() => setView('risk')}>Riesgos Ecuador</button>
          <button className="export-button" onClick={exportImage}>Descargar imagen</button>
        </nav>
      </header>

      <section className="hero">
        <div><p className="eyebrow">OBSERVATORIO CLIMÁTICO &amp; DE RIESGOS</p><h1>Datos que anticipan.<br /><em>Decisiones que protegen.</em></h1></div>
        <p className="hero-copy">Cruza la evolución de El Niño con eventos peligrosos registrados en Ecuador. Compara episodios, cambia variables y crea evidencia lista para compartir.</p>
      </section>

      <div className="module-switch" role="tablist" aria-label="Seleccionar módulo">
        <button role="tab" aria-selected={view === 'climate'} className={view === 'climate' ? 'selected' : ''} onClick={() => setView('climate')}><span>01</span><strong>Océano &amp; El Niño</strong><small>NOAA · desde 1982</small></button>
        <button role="tab" aria-selected={view === 'risk'} className={view === 'risk' ? 'selected' : ''} onClick={() => setView('risk')}><span>02</span><strong>Eventos peligrosos</strong><small>SNGR · Ecuador</small></button>
      </div>

      <section className="dashboard" id="explorar">
        <aside className="controls">
          <div className="controls-heading"><span className="kicker">CONFIGURAR VISTA</span><button type="button" aria-label="Restablecer filtros" onClick={() => {
            if (view === 'climate') { setClimateIndex('anom34'); setYear(climateYears[0]); setCompareYear(climateYears.includes(1997) ? 1997 : climateYears[1]); }
            else { setEvent('Incendio Forestal'); setEventYear('todos'); setProvince('todas'); setRegion('todas'); setMetric('burnedHectares'); setGrouping('province'); }
          }}>↻</button></div>

          {view === 'climate' ? <>
            <label>Índice oceánico<select value={climateIndex} onChange={(e) => setClimateIndex(e.target.value as ClimateKey)}>{Object.entries(INDEXES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
            <label>Año actual o reciente<select value={year} onChange={(e) => setYear(Number(e.target.value))}>{climateYears.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Comparar con<select value={compareYear} onChange={(e) => setCompareYear(Number(e.target.value))}>{climateYears.filter((item) => item !== year).map((item) => <option key={item}>{item}{[1982,1997,2015].includes(item) ? ' · Niño fuerte' : ''}</option>)}</select></label>
            <div className="filter-note"><span>Umbral orientativo</span><strong>±0.5 °C</strong><small>El gráfico conserva los valores mensuales originales de NOAA.</small></div>
          </> : <>
            <label>Evento<select value={event} onChange={(e) => setEvent(e.target.value)}><option value="todos">Todos los eventos</option>{eventOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Variable<select value={metric} onChange={(e) => setMetric(e.target.value as RiskMetric)}>{Object.entries(METRICS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
            <label>Agrupar por<select value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)}><option value="province">Provincia</option><option value="region">Región natural</option><option value="month">Mes</option></select></label>
            <label>Año<select value={eventYear} onChange={(e) => setEventYear(e.target.value)}><option value="todos">Todos los años</option>{eventYears.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Región<select value={region} onChange={(e) => setRegion(e.target.value)}><option value="todas">Todas las regiones</option>{['Costa','Sierra','Amazonía','Insular'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Provincia<select value={province} onChange={(e) => setProvince(e.target.value)}><option value="todas">Todas las provincias</option>{provinces.map((item) => <option key={item}>{item}</option>)}</select></label>
          </>}
          <button className="secondary-button" type="button" onClick={exportCsv}>Descargar tabla CSV <span>↓</span></button>
        </aside>

        <div className="analysis-stack">
          <article className="analysis-card">
            <div className="card-head">
              <div><span className="kicker">{view === 'climate' ? 'COMPARACIÓN MENSUAL' : 'ANÁLISIS TERRITORIAL'}</span><h2>{view === 'climate' ? 'Anomalía de temperatura del mar' : METRICS[metric].label}</h2></div>
              <div className="legend">{view === 'climate' ? <><span style={{ background:'#f36f50' }} />{year}<span className="dashed" style={{ background:'#0b766f' }} />{compareYear}</> : <><span style={{ background:'#f36f50' }} />{event === 'todos' ? 'Todos los eventos' : event}</>}</div>
            </div>
            <div className="canvas-wrap">
              <DataCanvas ref={chartRef} kind={view === 'climate' ? 'line' : 'bar'}
                title={view === 'climate' ? `${INDEXES[climateIndex].short}: ${year} frente a ${compareYear}` : `${METRICS[metric].label} por ${grouping === 'province' ? 'provincia' : grouping === 'region' ? 'región' : 'mes'}`}
                subtitle={view === 'climate' ? 'Anomalía mensual de TSM · °C' : `${event === 'todos' ? 'Todos los eventos' : event} · ${eventYear === 'todos' ? 'serie histórica' : eventYear}`}
                labels={view === 'climate' ? MONTHS : riskSummary.map((row) => row.label)}
                series={view === 'climate' ? climateSeries : [{ name: METRICS[metric].label, color: '#f36f50', values: riskSummary.map((row) => row[metric]) }]}
                unit={view === 'climate' ? '°' : METRICS[metric].unit.trim()} />
            </div>
            <div className="insight-row">
              {view === 'climate' ? <>
                <div className="metric"><span>ÚLTIMO REGISTRO</span><strong>{latestValue === null ? '—' : `${latestValue > 0 ? '+' : ''}${latestValue.toFixed(2)} °C`}</strong><small>{lastMonthIndex >= 0 ? `${MONTHS[lastMonthIndex]} ${year}` : 'sin dato'}</small></div>
                <div className="metric accent"><span>PICO DEL AÑO</span><strong>{peakValue === null ? '—' : `${peakValue > 0 ? '+' : ''}${peakValue.toFixed(2)} °C`}</strong><small>{INDEXES[climateIndex].short}</small></div>
                <p><span className="spark">✦</span><strong>Lectura rápida</strong>{latestValue !== null && comparisonValue !== null ? ` En el último mes disponible, ${year} está ${Math.abs(latestValue - comparisonValue).toFixed(2)} °C ${latestValue >= comparisonValue ? 'por encima' : 'por debajo'} de ${compareYear}.` : ' Selecciona dos años con datos coincidentes para comparar.'}</p>
              </> : <>
                <div className="metric"><span>TOTAL FILTRADO</span><strong>{numeric.format(riskTotal)}{METRICS[metric].unit}</strong><small>{METRICS[metric].short}</small></div>
                <div className="metric accent"><span>MAYOR VALOR</span><strong>{riskSummary[0]?.label || '—'}</strong><small>{riskSummary[0] ? `${numeric.format(riskSummary[0][metric])}${METRICS[metric].unit}` : 'sin registros'}</small></div>
                <p><span className="spark">✦</span><strong>Lectura rápida</strong>{riskSummary[0] ? ` ${riskSummary[0].label} concentra el mayor valor dentro de los filtros seleccionados.` : ' No hay datos para esta combinación de filtros.'}</p>
              </>}
            </div>
          </article>

          <article className="table-card">
            <div className="table-head"><div><span className="kicker">DATOS DE LA VISTA</span><h3>{view === 'climate' ? 'Valores mensuales comparados' : 'Resumen de resultados'}</h3></div><button onClick={exportCsv}>CSV ↓</button></div>
            <div className="table-scroll"><table>
              {view === 'climate' ? <><thead><tr><th>Mes</th><th>{year}</th><th>{compareYear}</th><th>Diferencia</th></tr></thead><tbody>{MONTHS.map((month, index) => {
                const left = climateSeries[0].values[index]; const right = climateSeries[1].values[index];
                return <tr key={month}><td>{month}</td><td>{left === null ? '—' : `${left.toFixed(2)} °C`}</td><td>{right === null ? '—' : `${right.toFixed(2)} °C`}</td><td>{left === null || right === null ? '—' : `${left - right > 0 ? '+' : ''}${(left - right).toFixed(2)} °C`}</td></tr>;
              })}</tbody></> : <><thead><tr><th>{grouping === 'province' ? 'Provincia' : grouping === 'region' ? 'Región' : 'Mes'}</th><th>Eventos</th><th>Impactadas</th><th>Fallecidas</th><th>Ha quemadas</th><th>Vías km</th></tr></thead><tbody>{riskSummary.map((row) => <tr key={row.label}><td>{row.label}</td><td>{numeric.format(row.events)}</td><td>{numeric.format(row.impacted)}</td><td>{numeric.format(row.deaths)}</td><td>{numeric.format(row.burnedHectares)}</td><td>{numeric.format(row.affectedRoadKilometers)}</td></tr>)}</tbody></>}
            </table></div>
          </article>
        </div>
      </section>

      <section className="source-strip" id="fuentes">
        <span>FUENTES ACTIVAS</span><a href="https://www.cpc.ncep.noaa.gov/data/indices/sstoi.indices" target="_blank" rel="noreferrer"><strong>NOAA · CPC</strong><small>Índices SST mensuales</small></a>
        <a href="https://docs.google.com/spreadsheets/d/1Nivv_cVrw0vfb2JOe6TSn-Enom0nhFgv83ZY9H1C1TM/edit?gid=1075634200" target="_blank" rel="noreferrer"><strong>SNGR · ECUADOR</strong><small>Base histórica 2010–2025</small></a>
        <span className="update-time">{updatedAt ? `Consulta: ${new Date(updatedAt).toLocaleDateString('es-EC')}` : 'Actualización automática cada 6 horas'}</span>
      </section>
    </main>
  );
}
