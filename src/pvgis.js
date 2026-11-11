/** PVGIS 5.3 parsing is deliberately strict: never substitute invented irradiation data. */
export function parsePvgis(body) {
  const items = body?.outputs?.monthly?.fixed;
  if (!Array.isArray(items) || items.length !== 12) throw new TypeError('PVGIS did not return 12 monthly PV output records');
  const values = Array(12).fill(null);
  for (const item of items) {
    const month = Number(item?.month);
    const energy = Number(item?.E_m);
    if (!Number.isInteger(month) || month < 1 || month > 12 || values[month - 1] !== null ||
      !Number.isFinite(energy) || energy < 0) throw new TypeError('Invalid PVGIS monthly energy value');
    values[month - 1] = energy;
  }
  if (values.some(n => n === null)) throw new TypeError('Missing month in PVGIS output');
  const annualKwh = values.reduce((total, v) => total + v, 0);
  const reportedAnnual = Number(body?.outputs?.totals?.fixed?.E_y);
  if (Number.isFinite(reportedAnnual) && reportedAnnual > 0 && Math.abs(reportedAnnual - annualKwh) / reportedAnnual > .04) {
    throw new TypeError('PVGIS yearly and monthly energy values disagree');
  }
  const radiationDatabase = body?.inputs?.meteo_data?.radiation_db;
  return {
    monthlyKwh: values, annualKwh: Math.round(annualKwh * 10) / 10,
    dataset: typeof radiationDatabase === 'string' ? radiationDatabase : 'PVGIS 5.3 (dataset unspecified)',
    source: 'European Commission JRC · PVGIS 5.3',
    dataPeriod: 'Climatological historical series (typically 2005–2023; region-dependent)',
    documentation: 'https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en'
  };
}

export function parseSolarQuery(searchParams) {
  const numeric = {lat:[-90,90],lon:[-180,180],peakKw:[.1,1000],slope:[0,90],aspect:[-180,180],loss:[0,50]};
  const result = {};
  for (const [field, bounds] of Object.entries(numeric)) {
    const raw = searchParams.get(field);
    if (raw === null || raw.trim() === '' || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) throw new RangeError(`Invalid ${field}`);
    const value = Number(raw);
    if (!Number.isFinite(value) || value < bounds[0] || value > bounds[1]) throw new RangeError(`Out of range: ${field}`);
    result[field] = value;
  }
  const mounting = searchParams.get('mounting') || 'free';
  if (!['free','building'].includes(mounting)) throw new RangeError('Invalid mounting');
  result.mounting = mounting;
  return result;
}

export function createPvgisUrl(input) {
  const u = new URL('https://re.jrc.ec.europa.eu/api/v5_3/PVcalc');
  const params = {lat:input.lat,lon:input.lon,peakpower:input.peakKw,angle:input.slope,
    aspect:input.aspect,loss:input.loss,mountingplace:input.mounting,pvtechchoice:'crystSi',
    usehorizon:1,outputformat:'json'};
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u;
}
