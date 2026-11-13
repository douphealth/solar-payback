import {ENGINE_VERSION, DEFAULTS, MONTHS, MONTH_DAYS, REFERENCE_FX_FROM_EUR, convertFromEur, CITY_BENCHMARKS, HARDWARE_DIRECTORY, POLICY_DIRECTORY, checkHardwareCompatibility, decomposeUtilityBill, auditInstallerQuote, extractQuoteFieldsFromText, extractTextFromPdfBytes, generateDecisionReportPDF, validateInputs, calculateForecast, estimateMonthlyProduction, calculateLevers, calculateSensitivityMatrix, solarSignature, asCSV, calculateIRR, calculateMIRR} from '/src/engine.js';
import {roofFit, optimizeSizes, dailyDispatch, projectFinance, scoreAssumptions} from '/src/model.js';
import {parseLoadCSV, simulateHourly, hourlyForecast, HOURS_YEAR, MONTH_HOURS} from '/src/hourly.js';
import {GREEK} from '/src/i18n.js';

const $ = id => document.getElementById(id);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const clean = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols = {EUR:'\u20ac', USD:'$', GBP:'\u00a3', AUD:'A$', CAD:'C$', INR:'\u20b9'};

const isEdgeHost = () => /^https?:$/.test(window.location.protocol) && !/googleusercontent|sandbox|localhost/.test(window.location.hostname);
const apiUrl = (endpoint, query = '') => window.location.origin + '/api/' + endpoint + (query ? '?' + query : '');

const state = {
  inputs: {...DEFAULTS},
  location: 'Athens, Greece',
  page: 'overview',
  lang: 'en',
  theme: 'dark',
  solar: null,
  quality: 'benchmark-reference',
  verifiedProvider: false,
  demoMode: false,
  solarSig: '',
  solarAt: null,
  solarError: '',
  fetching: false,
  token: 0,
  hourlyMode: false,
  hourlyPV: null,
  hourlySig: '',
  meter: null,
  forecast: null,
  saved: [],
  currentDay: 173,
  dispatchPattern: 'home',
  dispatchShift: false,
  dirRegion: 'all',
  dirSearch: '',
  dirSort: 'payback',
  equipped: {
    module: 'trina_vertex_s_plus',
    inverter: 'fronius_primo_gen24',
    battery: 'none',
    moduleArea: 2.00,
    moduleLengthM: 1.762,
    moduleWidthM: 1.134
  },
  reportVersion: 7
};

const originals = new Map();
let toastId = null, changeTimer = null;
const EXTRA_IDS = ['roofLength','roofWidth','roofUsable','moduleWatts','batteryPower','loanShare','loanApr','loanYears','billTotalAnnual','billFixedAnnual'];

function readExtras(){
  return Object.fromEntries(EXTRA_IDS.map(id => [id, Number($(id)?.value)]));
}
function applyExtras(data){
  if(!data || typeof data !== 'object') return;
  for(const id of EXTRA_IDS){
    const v = Number(data[id]), el = $(id);
    if(!el || !Number.isFinite(v)) continue;
    const min = el.min === '' ? -Infinity : Number(el.min);
    const max = el.max === '' ? Infinity : Number(el.max);
    if(v >= min && v <= max) el.value = String(v);
  }
}

const fmt = (x, d = 0) => Number(x).toLocaleString(state.lang === 'el' ? 'el-GR' : 'en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const curr = (x, d = 0) => Number.isFinite(x) ? (x < 0 ? '-' : '') + (symbols[state.inputs.currency] || '\u20ac') + fmt(Math.abs(x), d) : '--';
const kwh = x => Number.isFinite(x) ? fmt(x, 0) + ' kWh' : '--';
const yearText = x => x === null || !Number.isFinite(x) ? (state.lang === 'el' ? '\u0394\u03b5\u03bd \u03b5\u03c0\u03b9\u03c4\u03c5\u03b3\u03c7\u03ac\u03bd\u03b5\u03c4\u03b1\u03b9' : 'Not reached') : fmt(x, 1) + (state.lang === 'el' ? ' \u03ad\u03c4\u03b7' : ' yrs');

function numInput(id, fallback = 0){
  const el = $(id);
  if(!el) return fallback;
  const raw = String(el.value ?? '').trim();
  if(raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const put = (id, val) => { const el = $(id); if(el) el.textContent = String(val); };
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const warn = msg => { const el = $('errorBanner'); if(el){ el.hidden = !msg; el.textContent = msg || ''; } };

function toast(msg){
  const t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastId);
  toastId = setTimeout(() => { t.hidden = true; }, 4500);
}

function download(name, content, mime = 'text/plain'){
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([content], {type: mime}));
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function readInputs(){
  const input = {...state.inputs};
  for(const key of Object.keys(DEFAULTS)){
    const el = $('f-' + key);
    if(!el) continue;
    if(el.type === 'number'){
      if(String(el.value).trim() === '') throw Error('Please provide a number for ' + key);
      input[key] = Number(el.value);
    } else {
      input[key] = el.value;
    }
  }
  return validateInputs(input);
}

function writeInputs(inputs){
  const next = validateInputs({...DEFAULTS, ...inputs});
  state.inputs = next;
  for(const [key, v] of Object.entries(next)){
    const el = $('f-' + key);
    if(el) el.value = String(v);
  }
  state.location = String(inputs.location || state.location).slice(0, 130);
  syncControls();
}

function syncControls(){
  const p = state.inputs;
  const sym = symbols[p.currency] || '\u20ac';
  for(const [id, v] of [
    ['sizeSlider', p.peakKw],
    ['selfUseSlider', p.selfUsePct],
    ['batterySlider', p.batteryKwh],
    ['dockKwSlider', clamp(p.peakKw, 1, 20)],
    ['dockBattSlider', clamp(p.batteryKwh, 0, 30)],
    ['dockSelfSlider', clamp(p.selfUsePct, 10, 95)],
    ['dockRateSlider', clamp(p.importRate, 0.08, 0.60)]
  ]){
    const el = $(id);
    if(el) el.value = String(v);
  }
  put('sizeTag', fmt(p.peakKw, 1) + ' kWp');
  put('selfUseTag', fmt(p.selfUsePct) + '%');
  put('batteryTag', fmt(p.batteryKwh, 1) + ' kWh');
  put('dockKwVal', fmt(p.peakKw, 1) + ' kWp');
  put('dockCostPreview', 'Capex: ' + curr(p.systemCost));
  put('dockBattVal', fmt(p.batteryKwh, 1) + ' kWh');
  put('dockBattCostPreview', 'Batt: ' + curr(p.batteryCost));
  put('dockSelfVal', fmt(p.selfUsePct, 0) + '%');
  put('dockRateVal', sym + fmt(p.importRate, 2) + '/kWh');
  put('dockExportPreview', 'Export: ' + sym + fmt(p.exportRate, 2) + '/kWh');
  put('dirCurrentKw', fmt(p.peakKw, 1) + ' kWp');
}

function persist(){
  try {
    localStorage.setItem('solarpayback.aurora.v7', JSON.stringify({
      version: 7,
      inputs: state.inputs,
      location: state.location,
      lang: state.lang,
      theme: state.theme,
      saved: state.saved,
      equipped: state.equipped,
      extras: readExtras()
    }));
  } catch {}
}

function restore(){
  try {
    const val = JSON.parse(localStorage.getItem('solarpayback.aurora.v7') || localStorage.getItem('solarpayback.aurora.v6') || 'null');
    if(!val) return;
    if(val.inputs) writeInputs({...val.inputs, location: val.location});
    applyExtras(val.extras);
    if(['en','el'].includes(val.lang)) state.lang = val.lang;
    if(['light','dark'].includes(val.theme)) state.theme = val.theme;
    if(val.equipped && typeof val.equipped === 'object') state.equipped = {...state.equipped, ...val.equipped};
    if(Array.isArray(val.saved)){
      state.saved = val.saved.slice(0, 12).filter(x => x && typeof x.name === 'string' && x.inputs).map(x => ({
        name: x.name.slice(0, 70),
        inputs: validateInputs(x.inputs),
        location: String(x.location || '').slice(0, 130),
        extras: x.extras || {}
      }));
    }
  } catch {}
}

function applyLang(){
  document.documentElement.lang = state.lang;
  for(const [el, en] of originals){
    const translated = GREEK[el.dataset.i18n];
    el.textContent = state.lang === 'el' && translated ? translated : en;
  }
  put('langToggle', state.lang === 'en' ? 'EL' : 'EN');
  const route = $$('[data-route]').find(x => x.dataset.route === state.page && x.classList.contains('nav-item'));
  put('topTitle', route?.querySelector('[data-i18n]')?.textContent || 'SolarPayback');
}

function applyTheme(){
  document.documentElement.dataset.theme = state.theme;
  put('themeToggle', state.theme === 'light' ? 'DARK' : 'LIGHT');
}

// C18: URL hash navigation support for bookmarkable & crawlable sections
function go(page, updateHash = true){
  const validPages = ['overview','directory','hardware','system','energy','storage','explore','finance','evidence'];
  if(!validPages.includes(page)) return;
  state.page = page;
  if(updateHash){
    try { history.replaceState(null, '', '#' + page); } catch {}
  }
  for(const el of $$('.page')) el.hidden = el.dataset.page !== page;
  for(const el of $$('.nav-item')){
    const active = el.dataset.route === page;
    el.classList.toggle('active', active);
    el.setAttribute('aria-current', active ? 'page' : 'false');
  }
  applyLang();
  if(page === 'directory') renderDirectory();
  if(page === 'hardware') renderHardware();
  if(page === 'finance') renderFinance();
  if(page === 'explore') renderExplore(true);
  if(page === 'energy') renderDay();
  if(page === 'evidence') renderEvidence();
  window.scrollTo({top: 0, behavior: 'instant'});
}

// C01 & C02: Strict Provenance Labeler — never conflates reference/demo with live PVGIS provider
const sourceLabel = () => {
  if(state.demoMode || state.quality === 'synthetic-demo') return 'Synthetic Demo (Illustrative Only)';
  if(state.hourlyMode && state.quality === 'pvgis-hourly') return 'Verified PVGIS 8,760h + Meter';
  if(state.quality === 'pvgis') return 'Verified EU JRC PVGIS 5.3';
  if(state.quality === 'open-meteo') return 'Open-Meteo ERA5 Satellite (Proxy)';
  if(state.quality === 'benchmark-reference') return 'Illustrative Regional Reference';
  return 'Illustrative Latitude Model';
};

// P0-4 Fix: Honest Evidence Gate requiring explicit provider + user confirmations (never auto-claims "Decision-Grade")
function computeEvidenceCompleteness(){
  let confirmedCount = 0;
  const notes = [];
  if((state.quality === 'pvgis' || state.quality === 'pvgis-hourly') && state.verifiedProvider && !state.demoMode){
    confirmedCount++;
    notes.push('Live PVGIS');
  } else {
    notes.push('Unverified climate ref');
  }
  if(state.hourlyMode && !state.demoMode && state.meter?.timestampsValidated){
    confirmedCount++;
    notes.push('Aligned meter CSV');
  }
  if($('confirmBillCheck')?.checked) { confirmedCount++; notes.push('Bill confirmed'); }
  if($('confirmQuoteCheck')?.checked) { confirmedCount++; notes.push('Quotes confirmed'); }
  if($('confirmSurveyCheck')?.checked) { confirmedCount++; notes.push('Survey confirmed'); }
  const statusLabel = confirmedCount === 5
    ? '5/5 User-Confirmed (Survey & Inputs Checked)'
    : `${confirmedCount}/5 Confirmed (Preliminary Screening)`;
  return { confirmedCount, statusLabel, summary: notes.slice(0, 3).join(' · ') };
}

function estimate(reason = ''){
  const x = estimateMonthlyProduction(state.inputs);
  const isMatched = Boolean(x.matchedCity);
  state.solar = {
    monthlyKwh: x.monthlyKwh,
    annualKwh: x.annualKwh,
    dataset: x.dataset,
    source: isMatched ? 'Illustrative Regional Reference Curve (Unverified)' : 'Illustrative Latitude Seasonal Model (Unverified)',
    quality: isMatched ? 'benchmark-reference' : 'illustrative',
    verifiedProvider: false,
    demo: false,
    matchedCity: x.matchedCity,
    baseOptimalTilt: x.baseOptimalTilt,
    tiltFactor: x.tiltFactor,
    aspectFactor: x.aspectFactor,
    mountingFactor: x.mountingFactor
  };
  state.quality = isMatched ? 'benchmark-reference' : 'illustrative';
  state.verifiedProvider = false;
  state.demoMode = false;
  state.solarSig = solarSignature(state.inputs);
  state.solarError = reason;
  state.solarAt = new Date().toISOString();
}

function solarArgs(input){
  return new URLSearchParams({
    lat: String(input.lat),
    lon: String(input.lon),
    peakKw: String(input.peakKw),
    slope: String(input.slope),
    aspect: String(input.aspect),
    loss: String(input.loss),
    mounting: input.mounting
  }).toString();
}

function validSolar(x){
  return x?.quality === 'pvgis' && x?.verifiedProvider !== false && Array.isArray(x.monthlyKwh) && x.monthlyKwh.length === 12 && x.monthlyKwh.every(n => Number.isFinite(n) && n >= 0) && x.monthlyKwh.some(n => n > 0) && String(x.source || '').includes('PVGIS');
}

// C07: Client timeout (18.5s) > Worker upstream timeout (15.5s), with automatic retry + jitter on transient 502/503/504
async function fetchWithRetry(url, timeoutMs = 18500, retries = 1){
  for(let attempt = 0; attempt <= retries; attempt++){
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), timeoutMs);
    try {
      const res = await fetch(url, {signal: c.signal, headers: {Accept: 'application/json'}});
      if(res && [502, 503, 504].includes(res.status) && attempt < retries){
        await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
        continue;
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function refreshSolar(){
  const sig = solarSignature(state.inputs), ticket = ++state.token;
  state.fetching = true;
  renderSource();
  try {
    const res = isEdgeHost() ? await fetchWithRetry(apiUrl('solar', solarArgs(state.inputs)), 18500, 1) : null;
    if(res && res.ok){
      const data = await res.json();
      if(validSolar(data)){
        if(ticket !== state.token || solarSignature(state.inputs) !== sig) return;
        const geo = estimateMonthlyProduction(state.inputs);
        state.solar = {...data, verifiedProvider: true, demo: false, baseOptimalTilt: geo.baseOptimalTilt, tiltFactor: geo.tiltFactor, aspectFactor: geo.aspectFactor, mountingFactor: geo.mountingFactor};
        state.quality = 'pvgis';
        state.verifiedProvider = true;
        state.demoMode = false;
        state.solarSig = sig;
        state.solarAt = data.fetchedAt || new Date().toISOString();
        state.solarError = '';
        return;
      }
    }
    throw Error('Live PVGIS Worker endpoint not active in offline/Canvas preview');
  } catch (workerErr) {
    if(ticket !== state.token) return;
    estimate(workerErr.message);
  } finally {
    if(ticket === state.token){
      state.fetching = false;
      render();
    }
  }
}

// P0-1 & C05 Fix: Single-source-of-truth Scenario Evaluator.
// Scales baseline PV production by (inputs.peakKw / state.inputs.peakKw) * yieldMultiplier EXACTLY ONCE in both monthly and 8,760h modes.
function forecastFor(inputs = state.inputs, yieldMultiplier = 1){
  const baseKw = Math.max(0.1, Number(state.inputs.peakKw) || 5.5);
  const targetKw = Math.max(0.1, Number(inputs.peakKw) || baseKw);
  const sameGeometry =
    Math.abs(inputs.lat - state.inputs.lat) < 1e-6 &&
    Math.abs(inputs.lon - state.inputs.lon) < 1e-6 &&
    Math.abs(inputs.slope - state.inputs.slope) < 1e-6 &&
    Math.abs(inputs.aspect - state.inputs.aspect) < 1e-6 &&
    Math.abs(inputs.loss - state.inputs.loss) < 1e-6 &&
    inputs.mounting === state.inputs.mounting;

  const sizeRatio = sameGeometry ? (targetKw / baseKw) : 1;
  const totalScale = sizeRatio * yieldMultiplier;

  if(state.hourlyMode && state.hourlyPV && state.meter && sameGeometry){
    const pv = totalScale === 1 ? state.hourlyPV.hourlyKwh : state.hourlyPV.hourlyKwh.map(x => x * totalScale);
    return hourlyForecast(pv, state.meter.hourlyKwh, {...inputs, annualUsage: state.meter.annualKwh}, Number($('batteryPower')?.value) || 5, state.demoMode);
  }
  const scaledMonthly = sameGeometry && sizeRatio !== 1
    ? state.solar.monthlyKwh.map(v => v * sizeRatio)
    : state.solar.monthlyKwh;
  return calculateForecast(scaledMonthly, inputs, yieldMultiplier);
}

function refreshInputs(key){
  try {
    const prior = state.solarSig;
    const input = readInputs();
    state.inputs = input;
    warn('');
    if(['annualUsage','usageProfile','selfUsePct'].includes(key) && state.hourlyMode){
      state.hourlyMode = false;
      state.demoMode = false;
      toast('Hourly mode disabled because monthly consumption assumptions were edited manually.');
    }
    const sig = solarSignature(input);
    if(prior !== sig){
      state.hourlyMode = false;
      state.demoMode = false;
      state.hourlyPV = null;
      state.hourlySig = '';
      ++state.token;
      estimate();
      render();
      clearTimeout(changeTimer);
      changeTimer = setTimeout(refreshSolar, 600);
    } else {
      render();
    }
  } catch (e) {
    warn(e.message);
  }
}

function render(){
  try {
    if(!state.solar) estimate();
    const f = forecastFor();
    state.forecast = f;
    warn('');
    renderSource();
    renderOverview();
    renderQuoteAndBillAnalyzer();
    renderRoof();
    renderEnergy();
    renderBattery();
    renderExplore(false);
    renderFinance();
    renderEvidence();
    if(state.page === 'directory') renderDirectory();
    if(state.page === 'hardware') renderHardware();
    syncControls();
    persist();
  } catch (e) {
    warn(`Check your project inputs: ${e.message}`);
  }
}

// C01 & C02: Only live validated PVGIS responses receive the green verified badge; all reference/demo states get amber is-demo
function renderSource(){
  const isStrictlyVerified = (state.quality === 'pvgis' || state.quality === 'pvgis-hourly') && state.verifiedProvider === true && !state.demoMode;
  const label = state.fetching ? 'Checking PVGIS...' : sourceLabel();
  const el = $('dataStatus');
  if(el) el.className = 'data-status' + (state.fetching ? ' is-loading' : isStrictlyVerified ? '' : ' is-demo');
  put('dataStatusText', label);
  put('dataNotice', isStrictlyVerified
    ? `Verified Solar Provider: ${sourceLabel()} (${state.solar?.dataset || 'PVGIS 5.3'}). Financial tariffs, self-consumption, and capex remain user-configured assumptions.`
    : `Illustrative / Reference Mode (${sourceLabel()}): Solar output uses ${state.solar?.dataset || 'an unverified reference curve'}. Do not treat as a certified installer or utility quote.`);
  put('designSource', sourceLabel());
  put('designSourceDetail', `Dataset: ${state.solar?.dataset || 'Illustrative reference'}. Accounts for ${state.inputs.slope}° tilt, ${state.inputs.aspect}° azimuth, ${state.inputs.loss}% system loss, and ${state.inputs.mounting} mounting.`);
}

function interpret(f){
  const isStrictlyVerified = (state.quality === 'pvgis' || state.quality === 'pvgis-hourly') && state.verifiedProvider && !state.demoMode;
  const prefix = state.demoMode ? '[SYNTHETIC DEMO] ' : !isStrictlyVerified ? '[ILLUSTRATIVE REFERENCE] ' : '[PVGIS VERIFIED] ';
  if(f.npv > 0 && f.sustainedSimplePayback !== null){
    const intNote = f.paybackInterrupted ? ` (Note: first crosses 0 at ${yearText(f.firstSimplePayback)}, dips during Year ${f.inputs.replacementYear} replacement, sustained payback at ${yearText(f.sustainedSimplePayback)})` : '';
    return {
      headline: `${prefix}${yearText(f.sustainedSimplePayback)} sustained payback & ${curr(f.npv)} NPV.`,
      desc: `Clears your ${fmt(f.inputs.discountPct, 1)}% discount hurdle with IRR ${f.irrPct ? fmt(f.irrPct, 1) + '%' : '--'} (MIRR ${f.mirrPct ? fmt(f.mirrPct, 1) + '%' : '--'})${intNote}.`
    };
  }
  return {
    headline: `${prefix}Capital recovery exceeds target hurdle under current assumptions.`,
    desc: 'Modeled NPV is negative or sustained payback is not reached within the horizon. Compare lower quotes or higher self-consumption below.'
  };
}

function renderAuditFlags(targetId){
  const el = $(targetId);
  if(!el || !state.forecast) return;
  const hwWarnings = checkHardwareCompatibility(state.equipped.module, state.equipped.inverter, state.equipped.battery, state.inputs.peakKw);
  // C01: Pass actual state.quality (never substitute 'pvgis' for 'benchmark-reference')
  const flags = scoreAssumptions(state.forecast, state.quality, { demo: state.demoMode, hwWarnings });
  if(flags.length === 0){
    el.innerHTML = `<div class="audit-flag ok"><i></i><span>All physical, provenance, and financial parameters pass automated audit checks.</span></div>`;
  } else {
    el.innerHTML = flags.map(msg => `<div class="audit-flag"><i></i><span>${clean(msg)}</span></div>`).join('');
  }
}

function renderOverview(){
  const f = state.forecast, p = state.inputs, yr = f.years[0], analysis = interpret(f);
  const modObj = HARDWARE_DIRECTORY.modules.find(m => m.id === state.equipped.module) || HARDWARE_DIRECTORY.modules[2];
  const invObj = HARDWARE_DIRECTORY.inverters.find(i => i.id === state.equipped.inverter) || HARDWARE_DIRECTORY.inverters[2];
  put('railLocation', state.location);
  put('railPower', fmt(p.peakKw, 1) + ' kWp / ' + p.lifetime + ' years');
  put('railHardware', `${modObj.brand.split(' ')[0]} ${modObj.watts}W / ${invObj.brand.split(' ')[0]}`);
  put('heroPower', fmt(p.peakKw, 1));
  put('heroLocation', state.location.toUpperCase());
  put('decisionTitle', analysis.headline);
  put('decisionDescription', analysis.desc);
  put('gradeValue', state.demoMode ? 'SYNTHETIC DEMO' : state.verifiedProvider ? 'PVGIS VERIFIED' : 'ILLUSTRATIVE REF');
  put('gradeNote', `${state.solar?.dataset?.slice(0, 34) || 'Reference assumptions'}`);

  // C18: Above-the-Fold 30-Second Verdict Strip
  const ev = computeEvidenceCompleteness();
  put('stripProvenance', sourceLabel());
  put('stripDataset', (state.solar?.dataset || '').slice(0, 36));
  put('stripPayback', yearText(f.sustainedSimplePayback));
  put('stripFirstPayback', f.paybackInterrupted ? `Interrupted! 1st cross: ${yearText(f.firstSimplePayback)}` : `Discounted: ${yearText(f.sustainedDiscountedPayback)}`);
  put('stripNpv', curr(f.npv));
  put('stripMirr', `IRR: ${f.irrPct ? fmt(f.irrPct, 1) + '%' : '--'} | MIRR: ${f.mirrPct ? fmt(f.mirrPct, 1) + '%' : '--'}`);
  const spread = p.importRate - f.lcoe;
  put('stripSpread', (spread >= 0 ? '+' : '-') + curr(Math.abs(spread), 3) + '/kWh');
  put('stripLcoe', `Solar LCOE: ${curr(f.lcoe, 3)}/kWh`);
  put('stripEvidenceScore', ev.statusLabel);
  put('stripModeLabel', ev.summary);

  // 8 Main KPI Cards (C13: Sustained Payback + First-Cross disclosure + MIRR)
  put('metricPayback', yearText(f.sustainedSimplePayback));
  put('metricUpfrontInline', curr(f.upfront));
  put('metricDiscountedBadge', f.paybackInterrupted
    ? `1st Cross: ${yearText(f.firstSimplePayback)} (Dip Yr ${p.replacementYear})`
    : 'Discounted: ' + yearText(f.sustainedDiscountedPayback));
  put('metricNpv', curr(f.npv));
  put('metricPiBadge', 'Profitability Index: ' + fmt(f.profitabilityIndex, 2) + 'x');
  put('metricIrr', f.irrPct === null ? 'N/A' : fmt(f.irrPct, 1) + '%');
  put('metricRoiBadge', `MIRR: ${f.mirrPct === null ? '--' : fmt(f.mirrPct, 1) + '%'} | ROI: ${fmt(f.netReturn, 0)}%`);
  put('metricProduction', kwh(yr.generation));
  put('metricYield', fmt(f.specificYield, 0) + ' kWh/kWp specific yield');
  put('metricPshBadge', `Opt Tilt: ${state.solar?.baseOptimalTilt || 32}° | Loss: ${fmt(p.loss, 1)}%`);
  put('metricAutonomy', fmt(f.independencePct, 1) + '%');
  put('metricSelfShareBadge', 'PV Self-Used: ' + fmt(f.selfUseSharePct, 1) + '%');
  put('metricCash', curr(yr.cashflow));
  put('metricLifetimeCashBadge', `${p.lifetime}-Yr Net: ${curr(f.years.at(-1)?.cumulative || 0)}`);
  put('metricLcoe', curr(f.lcoe, 3) + '/kWh');
  put('metricSpreadBadge', (spread >= 0 ? 'Saves ' : 'Premium ') + curr(Math.abs(spread), 3) + '/kWh vs grid');
  put('metricCo2', fmt(f.co2OffsetTonnes, 1) + ' t');
  put('metricTreesBadge', `Grid factor: ${fmt(p.co2KgPerKwh, 2)} kg/kWh`);

  put('cashChartNote', p.lifetime + ' years');
  put('flowSelf', kwh(yr.selfUsed));
  put('flowExport', kwh(yr.exported));
  put('flowImport', kwh(Math.max(0, f.inputs.annualUsage - yr.selfUsed)));
  put('flowUsage', kwh(f.inputs.annualUsage));
  put('ringPct', fmt(f.selfUseSharePct, 0) + '%');
  const ring = $('energyRing');
  if(ring) ring.style.background = `conic-gradient(#65c3a6 0 ${clamp(f.selfUseSharePct, 0, 100)}%, #efba83 ${clamp(f.selfUseSharePct, 0, 100)}% 100%)`;

  renderMonthlyChart();
  renderCashChart();
  renderAuditFlags('overviewAuditFlags');
  renderLevers('quickWins');
}

// V71-01, V71-06 & V71-10: Independent Bill Decomposer, Line-Item Quote Auditor & Decision Report Generator
function readQuoteSlots(){
  const names = ['Quote A (Value String)', 'Quote B (High-Eff N-Type)', 'Quote C (Hybrid + LFP)'];
  return [0, 1, 2].map(slot => ({
    slot,
    name: names[slot],
    kw: clamp(numInput(`qa-kw-${slot}`, 5.5), 0.5, 200),
    pvCost: Math.max(0, numInput(`qa-cost-${slot}`, 7000)),
    batteryKwh: clamp(numInput(`qa-batt-${slot}`, 0), 0, 200),
    batteryCost: Math.max(0, numInput(`qa-bcost-${slot}`, 0)),
    includesScaffolding: $(`qa-scaf-${slot}`) ? Boolean($(`qa-scaf-${slot}`).checked) : true,
    includesElectricalSpd: $(`qa-spd-${slot}`) ? Boolean($(`qa-spd-${slot}`).checked) : true,
    includesGridPermit: $(`qa-grid-${slot}`) ? Boolean($(`qa-grid-${slot}`).checked) : true
  }));
}

function applyQuoteSlots(slots){
  if(!Array.isArray(slots)) return;
  slots.slice(0, 3).forEach((q, idx) => {
    if($(`qa-kw-${idx}`) && Number.isFinite(Number(q.kw))) $(`qa-kw-${idx}`).value = String(q.kw);
    if($(`qa-cost-${idx}`) && Number.isFinite(Number(q.pvCost))) $(`qa-cost-${idx}`).value = String(q.pvCost);
    if($(`qa-batt-${idx}`) && Number.isFinite(Number(q.batteryKwh))) $(`qa-batt-${idx}`).value = String(q.batteryKwh);
    if($(`qa-bcost-${idx}`) && Number.isFinite(Number(q.batteryCost))) $(`qa-bcost-${idx}`).value = String(q.batteryCost);
    if($(`qa-scaf-${idx}`) && typeof q.includesScaffolding === 'boolean') $(`qa-scaf-${idx}`).checked = q.includesScaffolding;
    if($(`qa-spd-${idx}`) && typeof q.includesElectricalSpd === 'boolean') $(`qa-spd-${idx}`).checked = q.includesElectricalSpd;
    if($(`qa-grid-${idx}`) && typeof q.includesGridPermit === 'boolean') $(`qa-grid-${idx}`).checked = q.includesGridPermit;
  });
}

function renderQuoteAndBillAnalyzer(){
  const p = state.inputs;
  const sym = symbols[p.currency] || '\u20ac';
  // P0-3: Strict validation of bill inputs; never substitute 290 for 0 and never clamp fixed > gross
  try {
    const rawGross = String($('billTotalAnnual')?.value ?? '').trim();
    const rawFixed = String($('billFixedAnnual')?.value ?? '').trim();
    const bill = decomposeUtilityBill({
      annualBill: rawGross === '' ? NaN : Number(rawGross),
      fixedAnnual: rawFixed === '' ? NaN : Number(rawFixed),
      annualUsage: p.annualUsage
    });
    put('billGrossRate', `${sym}${fmt(bill.grossRatePerKwh, 3)}/kWh`);
    put('billTrueAvoidableRate', `${sym}${fmt(bill.trueAvoidableRatePerKwh, 3)}/kWh`);
    put('billFixedSharePct', `${fmt(bill.fixedSharePct, 1)}% Fixed`);
    put('billEffectiveBadge', `Model Import Rate: ${sym}${fmt(p.importRate, 3)}/kWh`);
  } catch (billErr) {
    put('billGrossRate', 'Invalid');
    put('billTrueAvoidableRate', 'Check bill');
    put('billFixedSharePct', billErr.message);
  }

  const slots = readQuoteSlots();
  const audited = slots.map(q => {
    const ratio = q.kw / Math.max(0.1, p.peakKw);
    const audit = auditInstallerQuote(q, p, (testInp, mult = 1) => forecastFor(testInp, mult));
    return { ...q, audit };
  });

  const bestNpv = Math.max(...audited.map(q => q.audit.baseNpv));
  let bestBid = audited[0];
  for(const q of audited){
    if(q.audit.baseNpv === bestNpv) bestBid = q;
    const card = document.querySelector(`.quote-card[data-quote-slot="${q.slot}"]`);
    if(card) card.classList.toggle('best-quote', q.audit.baseNpv === bestNpv && q.audit.baseNpv > 0);
    const box = $(`qa-metrics-${q.slot}`);
    if(box){
      box.innerHTML = `
        <div><span>Effective PV/W:</span><strong>${sym}${fmt(q.audit.pricePerWatt, 2)}/W</strong></div>
        <div><span>Hidden Omissions:</span><strong>${q.audit.hiddenOmissions > 0 ? '+' + curr(q.audit.hiddenOmissions) : 'None (Complete)'}</strong></div>
        <div><span>Sustained Payback:</span><strong>${yearText(q.audit.sustainedPayback)}</strong></div>
        <div><span>Down / Base / Up NPV:</span><strong class="${q.audit.baseNpv >= 0 ? 'matrix-cell-pos' : 'matrix-cell-neg'}">${curr(q.audit.downsideNpv)} / ${curr(q.audit.baseNpv)} / ${curr(q.audit.upsideNpv)}</strong></div>
      `;
    }
  }

  const summaryEl = $('quoteAuditSummary');
  if(summaryEl && bestBid){
    const allOmissions = audited.flatMap(q => q.audit.omissionsList.map(o => `${q.name.split(' ')[0]} ${q.name.split(' ')[1]}: ${o}`));
    const topQuestion = bestBid.audit.negotiationQuestions[0] || 'Confirm exact panel & inverter SKU numbers on the final installation contract.';
    summaryEl.innerHTML = `<strong>Highest Risk-Adjusted Value: ${clean(bestBid.name)} (Base NPV ${curr(bestBid.audit.baseNpv)}, Sustained Payback ${yearText(bestBid.audit.sustainedPayback)}).</strong> ` +
      (allOmissions.length ? `Detected unquoted exclusions adjusted in capex: ${clean(allOmissions.slice(0, 2).join('; '))}. ` : 'All 3 bids include core scaffolding, SPD, and DNO permit items. ') +
      `<em>Key Question to Ask Installer:</em> "${clean(topQuestion)}"`;
  }
}


function downloadPdfDecisionReport(){
  if(!state.forecast) return;
  const p = state.inputs, f = state.forecast;
  let bill = { annualBill: 0, fixedAnnual: 0, fixedSharePct: 0, grossRatePerKwh: 0, trueAvoidableRatePerKwh: p.importRate };
  try {
    bill = decomposeUtilityBill({
      annualBill: numInput('billTotalAnnual', 1850),
      fixedAnnual: numInput('billFixedAnnual', 290),
      annualUsage: Math.max(1, p.annualUsage)
    });
  } catch {}
  const slots = readQuoteSlots().map(q => ({
    ...q,
    audit: auditInstallerQuote(q, p, (testInp, mult = 1) => forecastFor(testInp, mult))
  }));
  const ev = computeEvidenceCompleteness();
  const milestoneIndices = [0, 1, 2, 4, 9, 11, 14, 19, 24].filter(i => i < f.years.length);
  const pdfBytes = generateDecisionReportPDF({
    location: state.location,
    generatedAt: new Date().toISOString(),
    provenanceLabel: (state.entitledOrderId ? 'PAID ORDER ' + state.entitledOrderId + ' - ' : 'FREE PREVIEW SYNOPSIS - ') + sourceLabel(),
    verifiedProvider: state.verifiedProvider && !state.demoMode,
    dataset: state.solar?.dataset || 'Illustrative Reference',
    peakKw: fmt(p.peakKw, 1),
    batteryKwh: fmt(p.batteryKwh, 1),
    currency: p.currency,
    sustainedPayback: yearText(f.sustainedSimplePayback),
    firstPayback: yearText(f.firstSimplePayback),
    paybackInterrupted: f.paybackInterrupted,
    npvText: curr(f.npv),
    irrText: f.irrPct ? fmt(f.irrPct, 1) + '%' : 'N/A',
    mirrText: f.mirrPct ? fmt(f.mirrPct, 1) + '%' : 'N/A',
    lcoeText: curr(f.lcoe, 3) + '/kWh',
    evidenceStatus: ev.statusLabel,
    billGrossText: curr(bill.annualBill),
    billFixedText: curr(bill.fixedAnnual),
    billFixedShareText: fmt(bill.fixedSharePct, 1) + '%',
    billGrossRateText: curr(bill.grossRatePerKwh, 3) + '/kWh',
    billAvoidableRateText: curr(bill.trueAvoidableRatePerKwh, 3) + '/kWh',
    quotes: slots.map(q => ({
      name: q.name,
      kw: fmt(q.kw, 1),
      batteryKwh: fmt(q.batteryKwh, 1),
      quotedText: curr(q.pvCost + q.batteryCost),
      omissionsText: q.audit.hiddenOmissions > 0 ? '+' + curr(q.audit.hiddenOmissions) : '0',
      effectiveText: curr(q.audit.effectiveTotalCapex),
      downsideText: curr(q.audit.downsideNpv),
      baseText: curr(q.audit.baseNpv),
      upsideText: curr(q.audit.upsideNpv),
      paybackText: yearText(q.audit.sustainedPayback)
    })),
    questions: Array.from(new Set(slots.flatMap(q => q.audit.negotiationQuestions))),
    milestoneYears: milestoneIndices.map(i => {
      const yr = f.years[i];
      return {
        year: yr.year,
        generation: yr.generation,
        selfUsed: yr.selfUsed,
        exported: yr.exported,
        cashflowText: curr(yr.cashflow),
        cumulativeText: curr(yr.cumulative),
        discCumulativeText: curr(yr.discountedCumulative)
      };
    })
  });
  download('solar-payback-aurora-v7-decision-report.pdf', pdfBytes, 'application/pdf');
  toast('Downloaded binary PDF Decision Report (solar-payback-aurora-v7-decision-report.pdf).');
}


const funnelStages = new Set(['visit']);
function markFunnel(stage){
  funnelStages.add(stage);
}

async function handleQuoteFileUpload(file){
  if(!file) return;
  try {
    if(file.size > 4_000_000) throw new Error('Maximum document size is 4 MB.');
    if(file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'){
      const buf = await file.arrayBuffer();
      const pdfParsed = extractTextFromPdfBytes(new Uint8Array(buf));
      if(!pdfParsed.extractedText){
        put('extractedFieldsStatus', `PDF loaded (SHA/FNV hash: ${pdfParsed.documentHash}, ${fmt(pdfParsed.byteLength)} bytes). Scanned image PDF detected — please enter or confirm quote figures manually below.`);
        toast('PDF hash recorded; enter figures for scanned PDF.');
        return;
      }
      applyExtractedQuoteText(pdfParsed.extractedText, `PDF #${pdfParsed.documentHash}`);
    } else {
      const txt = await file.text();
      applyExtractedQuoteText(txt, file.name);
    }
    markFunnel('quote_uploaded');
  } catch (e) {
    put('extractedFieldsStatus', 'Document upload error: ' + e.message);
    toast(e.message);
  } finally {
    if($('quoteDocFile')) $('quoteDocFile').value = '';
  }
}


async function requestCustomerSession(){
  const email = String($('checkoutEmail')?.value || '').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    put('checkoutStatusMsg', 'Enter a valid email address first to issue an authenticated session token.');
    toast('Enter a valid email address.');
    return;
  }
  if(!isEdgeHost()){
    put('checkoutStatusMsg', 'Standalone/Canvas preview mode: /api/auth/session requires a deployed Cloudflare Worker with AUTH_SECRET & D1.');
    toast('Session auth requires deployed Cloudflare Worker.');
    return;
  }
  try {
    const res = await fetch(apiUrl('auth/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    state.sessionToken = data.sessionToken;
    state.customerId = data.customerId;
    markFunnel('session_authenticated');
    put('checkoutStatusMsg', `Authenticated session active for ${data.email} (${data.customerId}). You can now start checkout or retrieve paid reports.`);
    toast('Authenticated session token issued.');
  } catch (e) {
    put('checkoutStatusMsg', `Session error: ${e.message}`);
    toast(e.message);
  }
}

async function retrievePaidOrderReport(){
  const orderId = String($('orderLookupInput')?.value || '').trim();
  if(!orderId){
    put('checkoutStatusMsg', 'Enter your Order ID (e.g. ord_...) to retrieve your paid R2 PDF report.');
    toast('Enter an Order ID.');
    return;
  }
  if(!isEdgeHost()){
    put('checkoutStatusMsg', 'Standalone/Canvas preview mode: /api/reports/:orderId requires a deployed Cloudflare Worker with D1 & R2.');
    toast('Paid R2 retrieval requires deployed Cloudflare Worker.');
    return;
  }
  try {
    const res = await fetch(apiUrl('reports/' + encodeURIComponent(orderId)), {
      headers: state.sessionToken ? { Authorization: 'Bearer ' + state.sessionToken } : {}
    });
    const data = await res.json();
    if(!res.ok || !data?.entitled) throw new Error(data?.error || 'Order not entitled');
    state.entitledOrderId = data.orderId;
    markFunnel('paid_report_retrieved');
    put('checkoutStatusMsg', `Verified paid entitlement for ${data.orderId} (hash ${data.sha256Hash}). Downloading private R2 PDF...`);
    const dlRes = await fetch(apiUrl('reports/' + encodeURIComponent(orderId) + '/download'), {
      headers: state.sessionToken ? { Authorization: 'Bearer ' + state.sessionToken } : {}
    });
    if(!dlRes.ok) throw new Error('R2 binary download failed');
    const bytes = new Uint8Array(await dlRes.arrayBuffer());
    download(`SolarPayback-Paid-Report-${orderId}.pdf`, bytes, 'application/pdf');
    toast('Downloaded verified paid PDF report from private R2 storage.');
  } catch (e) {
    put('checkoutStatusMsg', `Report retrieval denied: ${e.message}`);
    toast(e.message);
  }
}

async function startCloudCheckout(){
  const email = String($('checkoutEmail')?.value || '').trim();
  const sku = String($('checkoutSku')?.value || 'report_comparison_3');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    put('checkoutStatusMsg', 'Enter a valid email address before starting checkout.');
    toast('Enter a valid customer email address.');
    return;
  }
  markFunnel('checkout_requested');
  put('checkoutStatusMsg', 'Requesting server-side Stripe Checkout Session via POST /api/checkout...');
  if(!isEdgeHost()){
    put('checkoutStatusMsg', 'Standalone/Canvas preview mode: /api/checkout requires a deployed Cloudflare Worker with STRIPE_SECRET_KEY & D1 bound. Use the local PDF preview download below.');
    toast('Cloud checkout requires deployed Cloudflare Worker with Stripe & D1 bindings.');
    return;
  }
  try {
    const res = await fetch(apiUrl('checkout'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.sessionToken ? { Authorization: 'Bearer ' + state.sessionToken } : {})
      },
      body: JSON.stringify({ sku, email, projectId: 'prj_' + solarSignature(state.inputs), jurisdiction: 'GR' })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    if(String(data?.checkoutUrl || '').startsWith('https://checkout.stripe.com/')){
      put('checkoutStatusMsg', `Order ${data.orderId} created (${data.stripeSessionId}). Redirecting to Stripe Checkout...`);
      window.location.assign(data.checkoutUrl);
    } else {
      throw new Error('Server did not return a verified https://checkout.stripe.com/ redirect URL.');
    }
  } catch (e) {
    put('checkoutStatusMsg', `Checkout unavailable: ${e.message}`);
    toast(e.message);
  }
}

function applyExtractedQuoteText(rawText, docLabel = 'Pasted Text'){
  try {
    const res = extractQuoteFieldsFromText(rawText);
    if(!res.fields.length) throw new Error('No recognizable kWp, price, or battery fields found in text.');
    for(const f of res.fields){
      if(f.key === 'peakKw' && $('qa-kw-0')) $('qa-kw-0').value = String(f.value);
      if(f.key === 'pvCost' && $('qa-cost-0')) $('qa-cost-0').value = String(f.value);
      if(f.key === 'batteryKwh' && $('qa-batt-0')) $('qa-batt-0').value = String(f.value);
      if(f.key === 'batteryCost' && $('qa-bcost-0')) $('qa-bcost-0').value = String(f.value);
      if(f.key === 'includesScaffolding' && $('qa-scaf-0')) $('qa-scaf-0').checked = Boolean(f.value);
      if(f.key === 'includesElectricalSpd' && $('qa-spd-0')) $('qa-spd-0').checked = Boolean(f.value);
      if(f.key === 'annualBill' && $('billTotalAnnual')) $('billTotalAnnual').value = String(f.value);
      if(f.key === 'fixedAnnual' && $('billFixedAnnual')) $('billFixedAnnual').value = String(f.value);
    }
    const summary = res.fields.map(f => `${f.key}=${f.value} (${f.confidence} confidence)`).join(', ');
    markFunnel('quote_extracted');
    put('extractedFieldsStatus', `[${docLabel}] Extracted ${res.fields.length} field(s) into Quote A: ${summary}. Please verify and check the confirmation box below.`);
    renderQuoteAndBillAnalyzer();
    toast('Extracted quote fields into Quote A. Please review and confirm.');
  } catch (e) {
    put('extractedFieldsStatus', 'Extraction notice: ' + e.message);
    toast(e.message);
  }
}

function downloadDecisionReport(){
  if(!state.forecast) return;
  const p = state.inputs, f = state.forecast;
  const bill = decomposeUtilityBill({
    annualBill: Math.max(0, numInput('billTotalAnnual', 1850)),
    fixedAnnual: Math.max(0, numInput('billFixedAnnual', 290)),
    annualUsage: Math.max(1, p.annualUsage)
  });
  const slots = readQuoteSlots().map(q => {
    const ratio = q.kw / Math.max(0.1, p.peakKw);
    return { ...q, audit: auditInstallerQuote(q, p, (testInp, mult = 1) => forecastFor(testInp, mult)) };
  });
  const ts = new Date().toISOString();
  const reportHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SolarPayback Aurora v7.2 — Independent Solar Quote &amp; Bill Decision Report</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;color:#14282c;background:#f7f9f7;margin:0;padding:32px;line-height:1.55}
  .sheet{max-width:1040px;margin:0 auto;background:#fff;border:1px solid #d4e0d8;border-radius:16px;padding:36px;box-shadow:0 12px 32px rgba(0,0,0,.05)}
  h1,h2,h3{font-family:Georgia,serif;font-weight:400;margin:0 0 10px}
  .badge{display:inline-block;padding:5px 11px;border-radius:99px;font-size:11px;font-weight:800;background:#fff4dc;color:#8a6229;border:1px solid #f0d8a8}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
  .card{padding:14px;border:1px solid #dce6df;border-radius:10px;background:#f9fbf9}
  .card span{display:block;font-size:10px;text-transform:uppercase;color:#5f7673;font-weight:700}
  .card strong{display:block;font-size:20px;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin:14px 0 24px}
  th,td{border:1px solid #dce6df;padding:9px 11px;text-align:right}
  th:first-child,td:first-child{text-align:left}
  th{background:#ecf4ef;color:#275248;font-weight:800}
  .note{padding:12px 16px;border-left:4px solid #e0a858;background:#fff9eb;font-size:12px;margin-top:18px}
</style></head><body><div class="sheet">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid #dce6df;padding-bottom:18px">
    <div>
      <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#39856e">SOLARPAYBACK AURORA v${clean(ENGINE_VERSION)} &middot; ${state.entitledOrderId ? 'PAID ENTITLED AUDIT REPORT (' + clean(state.entitledOrderId) + ')' : 'FREE PREVIEW SYNOPSIS (UNVERIFIED - NOT A PAID AUDIT REPORT)'}</div>
      <h1 style="font-size:32px;margin-top:6px">${clean(state.location)} (${fmt(p.peakKw, 1)} kWp PV + ${fmt(p.batteryKwh, 1)} kWh Storage)</h1>
      <div style="font-size:12px;color:#5f7673">Generated: ${clean(ts)} &middot; Coordinates: ${fmt(p.lat, 4)}&deg;, ${fmt(p.lon, 4)}&deg; &middot; Tilt ${p.slope}&deg; / Azimuth ${p.aspect}&deg;</div>
    </div>
    <span class="badge">${clean(sourceLabel())}</span>
  </div>
  <div class="grid">
    <div class="card"><span>Sustained Payback</span><strong>${clean(yearText(f.sustainedSimplePayback))}</strong><small style="font-size:10px;color:#666">First cross: ${clean(yearText(f.firstSimplePayback))}</small></div>
    <div class="card"><span>25-Yr Net Present Value</span><strong>${clean(curr(f.npv))}</strong><small style="font-size:10px;color:#666">Discount rate: ${fmt(p.discountPct, 1)}%</small></div>
    <div class="card"><span>IRR / MIRR</span><strong>${f.irrPct ? fmt(f.irrPct, 1) + '%' : '--'} / ${f.mirrPct ? fmt(f.mirrPct, 1) + '%' : '--'}</strong><small style="font-size:10px;color:#666">Net Capex: ${clean(curr(f.upfront))}</small></div>
    <div class="card"><span>True Avoidable Bill Rate</span><strong>${clean(curr(bill.trueAvoidableRatePerKwh, 3))}/kWh</strong><small style="font-size:10px;color:#666">Fixed fees: ${clean(curr(bill.fixedAnnual))}/yr (${fmt(bill.fixedSharePct, 1)}%)</small></div>
  </div>
  <h2>1. Side-by-Side Installer Quote &amp; Exclusion Audit</h2>
  <table>
    <thead><tr><th>Quote Option</th><th>Array / Battery</th><th>Quoted Capex</th><th>Hidden Omission Risk</th><th>Effective Turnkey</th><th>Downside NPV</th><th>Base NPV</th><th>Upside NPV</th><th>Sustained Payback</th></tr></thead>
    <tbody>
      ${slots.map(q => `<tr>
        <td><strong>${clean(q.name)}</strong><br><small style="color:#666">${clean(q.audit.omissionsList.join(', ') || 'All core items included')}</small></td>
        <td>${fmt(q.kw, 1)} kWp / ${fmt(q.batteryKwh, 1)} kWh</td>
        <td>${clean(curr(q.pvCost + q.batteryCost))}</td>
        <td>${q.audit.hiddenOmissions > 0 ? '+' + clean(curr(q.audit.hiddenOmissions)) : '0'}</td>
        <td><strong>${clean(curr(q.audit.effectiveTotalCapex))}</strong></td>
        <td>${clean(curr(q.audit.downsideNpv))}</td>
        <td><strong>${clean(curr(q.audit.baseNpv))}</strong></td>
        <td>${clean(curr(q.audit.upsideNpv))}</td>
        <td><strong>${clean(yearText(q.audit.sustainedPayback))}</strong></td>
      </tr>`).join('')}
    </tbody>
  </table>
  <h2>2. Questions to Ask Your Installer Before Signing</h2>
  <ul style="font-size:12px;color:#233d42">
    ${Array.from(new Set(slots.flatMap(q => q.audit.negotiationQuestions))).map(q => `<li>${clean(q)}</li>`).join('')}
  </ul>
  <h2>3. 25-Year Auditable Cash-Flow Schedule (${clean(p.currency)})</h2>
  <table>
    <thead><tr><th>Year</th><th>PV Output</th><th>Self-Used</th><th>Exported</th><th>Avoided Bill</th><th>Export Income</th><th>OpEx &amp; Repl</th><th>Net Cash</th><th>Discounted CF</th><th>Cumulative</th></tr></thead>
    <tbody>
      ${f.years.map(y => `<tr>
        <td>Yr ${y.year}</td><td>${fmt(y.generation)} kWh</td><td>${fmt(y.selfUsed)} kWh</td><td>${fmt(y.exported)} kWh</td>
        <td>${clean(curr(y.avoidedPurchases))}</td><td>${clean(curr(y.exportRevenue))}</td><td>${clean(curr(y.annualOperatingCost + y.replacement))}</td>
        <td>${clean(curr(y.cashflow))}</td><td>${clean(curr(y.discountedCashflow))}</td><td><strong>${clean(curr(y.cumulative))}</strong></td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="note"><strong>Provenance &amp; Engineering Disclaimer:</strong> Active Solar Dataset: ${clean(state.solar?.dataset || sourceLabel())} (verifiedProvider: ${state.verifiedProvider ? 'true' : 'false'}, demoMode: ${state.demoMode ? 'true' : 'false'}). This report is an independent mathematical model based on user-supplied inputs and does not substitute for an on-site structural roof survey, shade measurement, or binding utility tariff contract.</div>
</div></body></html>`;
  download('solar-payback-aurora-v7-decision-report.html', reportHtml, 'text/html');
  toast('Downloaded standalone Independent Solar Quote & Bill Decision Report (.html).');
}

function gridSvg(w, h, xlabels, ylabels, margin = 42){
  let out = '';
  for(let i = 0; i <= 4; i++){
    const y = margin + i * (h - 2 * margin) / 4;
    out += `<line x1="${margin}" x2="${w - 10}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="currentColor" stroke-opacity=".11" stroke-dasharray="3 5"/>`;
    if(ylabels) out += `<text x="${margin - 7}" y="${y + 3}" text-anchor="end" font-size="9" fill="currentColor" opacity=".62">${clean(ylabels[4 - i])}</text>`;
  }
  if(xlabels){
    const span = (w - margin - 10) / Math.max(1, xlabels.length);
    xlabels.forEach((lab, i) => {
      out += `<text x="${margin + span * (i + .5)}" y="${h - 7}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".72">${clean(lab)}</text>`;
    });
  }
  return out;
}

function renderMonthlyChart(){
  const f = state.forecast;
  const w = 580, h = 265, m = 44, data = f.year1Monthly;
  const max = Math.max(1, ...data.map(x => Math.max(x.generation, x.usage))) * 1.15;
  const xs = MONTHS;
  let svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img"><title>Monthly solar generation, self consumption, grid exports and demand</title>${gridSvg(w, h, xs, [0, .25, .5, .75, 1].map(v => fmt(max * v, 0)), m)}`;
  const chartH = h - 2 * m, step = (w - m - 10) / 12, bw = Math.min(30, step * .58);
  const demandPts = [];
  data.forEach((d, i) => {
    const cx = m + step * (i + .5);
    const x = cx - bw / 2, yBottom = h - m;
    const used = Math.max(0, d.selfUsed), exported = Math.max(0, d.exported);
    const usedHeight = chartH * used / max, exportHeight = chartH * exported / max;
    const demandY = yBottom - (chartH * d.usage / max);
    demandPts.push(`${cx.toFixed(2)},${demandY.toFixed(2)}`);
    svg += `<rect x="${x.toFixed(2)}" y="${(yBottom - usedHeight).toFixed(2)}" width="${bw.toFixed(2)}" height="${usedHeight.toFixed(2)}" rx="2" fill="#6ac2aa"><title>${xs[i]} Self-Use: ${fmt(used)} kWh</title></rect>`;
    svg += `<rect x="${x.toFixed(2)}" y="${(yBottom - usedHeight - exportHeight).toFixed(2)}" width="${bw.toFixed(2)}" height="${exportHeight.toFixed(2)}" rx="2" fill="#efb777"><title>${xs[i]} Total PV: ${fmt(d.generation)} kWh | Self-Use: ${fmt(used)} kWh | Export: ${fmt(exported)} kWh | Demand: ${fmt(d.usage)} kWh</title></rect>`;
  });
  svg += `<polyline points="${demandPts.join(' ')}" fill="none" stroke="#93b4d4" stroke-width="2.2" stroke-dasharray="4 4"/>`;
  svg += '</svg>';
  $('monthlyChart').innerHTML = svg;
}

function renderCashChart(){
  const f = state.forecast;
  const ys = [-f.upfront, ...f.years.map(y => y.cumulative)];
  const dcYs = [-f.upfront, ...f.years.map(y => y.discountedCumulative)];
  const w = 580, h = 265, m = 48;
  const lo = Math.min(0, ...ys, ...dcYs), hi = Math.max(0, ...ys, ...dcYs);
  const span = Math.max(1, hi - lo);
  const x = i => m + i * (w - m - 15) / (ys.length - 1);
  const y = v => m + (hi - v) * (h - 2 * m) / span;
  const path = ys.map((n, i) => (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(n).toFixed(2)).join(' ');
  const dcPath = dcYs.map((n, i) => (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(n).toFixed(2)).join(' ');
  let g = `<svg viewBox="0 0 ${w} ${h}" role="img"><title>Cumulative nominal and discounted lifetime cash flow</title>${gridSvg(w, h, null, [0, .25, .5, .75, 1].map(v => curr(lo + v * span)), m)}<line x1="${m}" x2="${w - 15}" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" stroke-dasharray="5 5" stroke-opacity=".6"/><path d="${path} L${x(ys.length - 1)} ${y(lo)} L${x(0)} ${y(lo)} Z" fill="#eab877" opacity=".12"/><path d="${dcPath}" fill="none" stroke="#65c3a6" stroke-width="2.2" stroke-dasharray="5 4"/><path d="${path}" fill="none" stroke="#e5a96c" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(ys.length - 1)}" cy="${y(ys[ys.length - 1])}" r="5" fill="#f8bf7e"/>`;
  if(f.sustainedSimplePayback !== null && f.sustainedSimplePayback <= f.inputs.lifetime){
    const px = x(f.sustainedSimplePayback);
    g += `<circle cx="${px.toFixed(2)}" cy="${y(0).toFixed(2)}" r="5.5" fill="#65c3a6" stroke="#0d2529" stroke-width="2"><title>Sustained Payback: ${fmt(f.sustainedSimplePayback, 1)} years</title></circle>`;
  }
  for(let i = 0; i <= 4; i++){
    const year = Math.round(i * f.inputs.lifetime / 4);
    g += `<text x="${x(year)}" y="${h - 6}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".68">Yr ${year}</text>`;
  }
  g += '</svg>';
  $('cashChart').innerHTML = g;
}

// === PAGE 02: GLOBAL SOLAR ATLAS & POLICY DIRECTORY (C01 & C08 Remediated) ===
function renderDirectory(){
  const grid = $('cityDirectoryGrid');
  if(!grid) return;
  const p = state.inputs;
  const search = state.dirSearch.toLowerCase().trim();
  const unitCostEurPerKw = (p.systemCost / (REFERENCE_FX_FROM_EUR[p.currency] || 1)) / Math.max(0.5, p.peakKw);

  const enriched = CITY_BENCHMARKS.filter(c => {
    if(state.dirRegion !== 'all' && c.region !== state.dirRegion) return false;
    if(search && !`${c.name} ${c.country} ${c.dataset}`.toLowerCase().includes(search)) return false;
    return true;
  }).map(c => {
    const localCapex = convertFromEur(unitCostEurPerKw * p.peakKw, c.currency);
    const localBattCost = convertFromEur(p.batteryCost / (REFERENCE_FX_FROM_EUR[p.currency] || 1), c.currency);
    const cityInputs = {
      ...p,
      lat: c.lat,
      lon: c.lon,
      slope: c.optimalTilt,
      aspect: 0,
      importRate: c.importRate,
      exportRate: c.exportRate,
      co2KgPerKwh: c.co2KgPerKwh,
      currency: c.currency,
      systemCost: localCapex,
      batteryCost: localBattCost,
      grant: 0
    };
    const est = estimateMonthlyProduction(cityInputs);
    const fc = calculateForecast(est.monthlyKwh, cityInputs);
    return {city: c, est, fc};
  });

  enriched.sort((a, b) => {
    if(state.dirSort === 'payback') return (a.fc.sustainedSimplePayback ?? 999) - (b.fc.sustainedSimplePayback ?? 999);
    if(state.dirSort === 'npv') return b.fc.npv - a.fc.npv;
    if(state.dirSort === 'yield') return b.city.yieldKwhPerKwp - a.city.yieldKwhPerKwp;
    if(state.dirSort === 'ghi') return b.city.ghiKwhM2 - a.city.ghiKwhM2;
    if(state.dirSort === 'tariff') return b.city.importRate - a.city.importRate;
    if(state.dirSort === 'co2') return b.fc.co2OffsetTonnes - a.fc.co2OffsetTonnes;
    return 0;
  });

  const regionLabels = {
    south_eu: 'Southern Europe (Reference)',
    north_eu: 'Northern & Central Europe (Reference)',
    global: 'Americas & Oceania (Reference)'
  };

  if(enriched.length === 0){
    grid.innerHTML = `<div class="empty-state">No cities matched "${clean(state.dirSearch)}". Clear the search filter to browse all 36 reference cities.</div>`;
  } else {
    grid.innerHTML = enriched.map(({city, est, fc}) => {
      const sym = symbols[city.currency] || '\u20ac';
      const isCurrent = Math.hypot(city.lat - p.lat, city.lon - p.lon) < 0.25;
      return `<article class="city-card ${isCurrent ? 'is-active' : ''}">
        <div>
          <div class="city-top">
            <div>
              <span class="city-region">${clean(regionLabels[city.region] || city.country)}</span>
              <h3>${clean(city.name)}</h3>
            </div>
            <span class="city-payback-pill" title="Illustrative Sustained Payback">${yearText(fc.sustainedSimplePayback)}</span>
          </div>
          <div class="city-kpis">
            <div><span>Ref 25-Yr NPV</span><strong>${sym}${fmt(fc.npv, 0)}</strong></div>
            <div><span>Ref Yr-1 Output</span><strong>${fmt(est.annualKwh, 0)} kWh</strong></div>
            <div><span>Specific Yield</span><strong>${fmt(city.yieldKwhPerKwp, 0)} kWh/kWp</strong></div>
          </div>
          <div class="city-meta">
            <span>GHI Reference: <b>${fmt(city.ghiKwhM2, 0)} kWh/m&sup2;</b></span>
            <span>Peak Sun Hours: <b>${fmt(city.pshDay, 2)} h/day</b></span>
            <span>Optimal Tilt: <b>${city.optimalTilt}&deg; South</b></span>
            <span>Ref Import Rate: <b>${sym}${fmt(city.importRate, 3)}/kWh</b></span>
            <span>Ref Export Rate: <b>${sym}${fmt(city.exportRate, 3)}/kWh</b></span>
            <span>Grid CO2: <b>${fmt(city.co2KgPerKwh, 2)} kg/kWh</b></span>
          </div>
        </div>
        <div>
          <div class="city-dataset">
            <span>${clean(city.dataset)}</span>
            <span>${fmt(city.lat, 2)}&deg;, ${fmt(city.lon, 2)}&deg;</span>
          </div>
          <div class="city-actions">
            <button type="button" class="button button-accent" data-apply-city="${city.id}" data-mode="full">Load Ref + Tariffs &nearr;</button>
            <button type="button" class="button button-ghost" data-apply-city="${city.id}" data-mode="coords">Coords Only</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  const pGrid = $('policyDirectoryGrid');
  if(pGrid){
    pGrid.innerHTML = POLICY_DIRECTORY.map(pol => {
      const sym = symbols[pol.currency] || '\u20ac';
      return `<article class="policy-card">
        <div>
          <div class="policy-head">
            <div>
              <div class="overline">${clean(pol.country)} &middot; v${clean(pol.version)} (Eff: ${clean(pol.effectiveFrom)})</div>
              <h3>${clean(pol.regime)}</h3>
            </div>
            <span class="policy-flag">${clean(pol.flag)} &middot; Exp: ${clean(pol.expiresOn)}</span>
          </div>
          <div class="policy-rates">
            <div><span>Ref Turnkey Cost</span><strong>${sym}${fmt(pol.typicalCostPerKwp, 0)}/kWp</strong></div>
            <div><span>Ref Avoidable Import</span><strong>${sym}${fmt(pol.importRate, 3)}/kWh</strong></div>
            <div><span>Ref Export Rate</span><strong>${sym}${fmt(pol.exportRate, 3)}/kWh</strong></div>
          </div>
          <p style="font-size:11px;color:var(--muted);line-height:1.65;margin:10px 0">${clean(pol.summary)}</p>
          <div class="policy-rule"><strong>Compliance &amp; Modeling Note:</strong> ${clean(pol.keyRule)}</div>
        </div>
        <div class="policy-foot">
          <a href="${clean(pol.sourceUrl)}" target="_blank" rel="noopener noreferrer">${clean(pol.sourceTitle)} &nearr;</a>
          <button type="button" class="button button-dark" data-apply-policy="${pol.id}" style="min-height:34px;font-size:10px;padding:0 12px">Load Reference Preset &nearr;</button>
        </div>
      </article>`;
    }).join('');
  }
}

function applyCityFromDirectory(cityId, mode = 'full'){
  const city = CITY_BENCHMARKS.find(c => c.id === cityId);
  if(!city) return;
  const oldCurr = state.inputs.currency;
  const next = {
    ...state.inputs,
    lat: city.lat,
    lon: city.lon,
    slope: city.optimalTilt,
    aspect: 0,
    location: city.name
  };
  if(mode === 'full'){
    next.importRate = city.importRate;
    next.exportRate = city.exportRate;
    next.currency = city.currency;
    next.co2KgPerKwh = city.co2KgPerKwh;
    // C10: Convert capex and battery cost when switching currencies
    if(oldCurr !== city.currency){
      const eurSys = state.inputs.systemCost / (REFERENCE_FX_FROM_EUR[oldCurr] || 1);
      const eurBatt = state.inputs.batteryCost / (REFERENCE_FX_FROM_EUR[oldCurr] || 1);
      const eurRepl = state.inputs.replacementCost / (REFERENCE_FX_FROM_EUR[oldCurr] || 1);
      next.systemCost = convertFromEur(eurSys, city.currency);
      next.batteryCost = convertFromEur(eurBatt, city.currency);
      next.replacementCost = convertFromEur(eurRepl, city.currency);
      next.grant = Math.min(state.inputs.grant, next.systemCost + next.batteryCost);
    }
  }
  writeInputs(next);
  state.hourlyMode = false;
  state.demoMode = false;
  state.hourlyPV = null;
  state.hourlySig = '';
  estimate();
  render();
  go('overview');
  refreshSolar();
  toast(mode === 'full'
    ? `Loaded ${city.name} reference preset (${city.currency} rates, ${city.optimalTilt}° tilt). Replace reference tariffs with your actual bill.`
    : `Loaded ${city.name} coordinates (${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°).`);
}

function applyPolicyPreset(policyId){
  const pol = POLICY_DIRECTORY.find(p => p.id === policyId);
  if(!pol) return;
  const city = CITY_BENCHMARKS.find(c => c.id === pol.cityId) || CITY_BENCHMARKS[7];
  const systemCost = Math.round(state.inputs.peakKw * pol.typicalCostPerKwp);
  const oldCurr = state.inputs.currency;
  const eurBatt = state.inputs.batteryCost / (REFERENCE_FX_FROM_EUR[oldCurr] || 1);
  const batteryCost = convertFromEur(eurBatt, pol.currency);
  writeInputs({
    ...state.inputs,
    lat: city.lat,
    lon: city.lon,
    location: city.name,
    slope: city.optimalTilt,
    aspect: 0,
    currency: pol.currency,
    importRate: pol.importRate,
    exportRate: pol.exportRate,
    selfUsePct: pol.selfUseTargetPct,
    systemCost,
    batteryCost,
    grant: Math.min(state.inputs.grant, systemCost + batteryCost),
    co2KgPerKwh: city.co2KgPerKwh
  });
  state.hourlyMode = false;
  state.demoMode = false;
  estimate();
  render();
  go('overview');
  refreshSolar();
  toast(`Applied ${pol.country} (${pol.regime}) reference preset. Verify actual contract terms.`);
}

// === PAGE 03: HARDWARE DIRECTORY & EQUIPMENT BENCH (C09 & C10 Remediated) ===
function renderHardware(){
  const modObj = HARDWARE_DIRECTORY.modules.find(m => m.id === state.equipped.module) || HARDWARE_DIRECTORY.modules[2];
  const invObj = HARDWARE_DIRECTORY.inverters.find(i => i.id === state.equipped.inverter) || HARDWARE_DIRECTORY.inverters[2];
  const batObj = HARDWARE_DIRECTORY.batteries.find(b => b.id === state.equipped.battery) || null;
  const cur = state.inputs.currency;

  const compatWarnings = checkHardwareCompatibility(state.equipped.module, state.equipped.inverter, state.equipped.battery, state.inputs.peakKw);
  const compatBanner = $('hwCompatBanner');
  if(compatBanner){
    compatBanner.hidden = compatWarnings.length === 0;
    compatBanner.innerHTML = compatWarnings.map(w => `<div>&#9888; ${clean(w)}</div>`).join('');
  }

  put('equipModuleName', `${modObj.brand} — ${modObj.model} (${modObj.sku})`);
  put('equipModuleSpec', `${modObj.watts} W | ${modObj.efficiencyPct}% Eff | ${modObj.tempCoeffPctPerC}%/°C | ${modObj.degradationPct}%/yr Deg`);
  put('equipInverterName', `${invObj.brand} — ${invObj.model} (${invObj.sku})`);
  put('equipInverterSpec', `${invObj.weightedEffPct}% Weighted Eff | ${invObj.systemLossPct}% Sys Loss | ${invObj.coupling}`);
  if(batObj && state.inputs.batteryKwh > 0){
    put('equipBatteryName', `${batObj.brand} — ${batObj.model} (${batObj.sku})`);
    put('equipBatterySpec', `${batObj.usableKwh} kWh Usable | ${batObj.powerKw} kW Power | ${batObj.roundTripEffPct}% RTE | ${batObj.coupling}`);
  } else if(state.inputs.batteryKwh > 0){
    put('equipBatteryName', `Custom LFP Storage (${fmt(state.inputs.batteryKwh, 1)} kWh)`);
    put('equipBatterySpec', `${fmt(state.inputs.batteryEfficiencyPct, 0)}% Round-Trip Efficiency | ${curr(state.inputs.batteryCost)}`);
  } else {
    put('equipBatteryName', 'No Battery Equipped (PV Only)');
    put('equipBatterySpec', '0 kWh Usable | Select a battery card below to model hybrid storage');
  }

  const mGrid = $('hwModulesGrid');
  if(mGrid){
    mGrid.innerHTML = HARDWARE_DIRECTORY.modules.map(m => {
      const active = state.equipped.module === m.id;
      return `<article class="hw-card ${active ? 'is-equipped' : ''}">
        <div>
          <span class="hw-badge">${clean(m.badge)}</span>
          <div class="hw-brand" style="margin-top:8px">${clean(m.brand)} &middot; ${clean(m.sku)}</div>
          <h3>${clean(m.model)}</h3>
          <div class="hw-specs">
            <div><span>STC Power &amp; Dimensions</span><strong>${m.watts} W (${m.lengthM}&times;${m.widthM}m)</strong></div>
            <div><span>Module Efficiency</span><strong>${m.efficiencyPct}% (${clean(m.datasheetRev)})</strong></div>
            <div><span>Warranted Degradation</span><strong>${m.degradationPct}%/yr (Yr1: ${m.firstYearDegPct}%)</strong></div>
            <div><span>Temp Coeff &amp; Voc</span><strong>${m.tempCoeffPctPerC}%/&deg;C | ${m.vocV}V</strong></div>
          </div>
          <p style="font-size:11px;color:var(--muted);line-height:1.6;margin:10px 0 0">${clean(m.notes)}</p>
        </div>
        <div class="hw-foot">
          <a href="${clean(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">${clean(m.sourceTitle)} &nearr;</a>
          <button type="button" class="button ${active ? 'button-accent' : 'button-dark'}" data-equip-module="${m.id}" style="min-height:34px;font-size:10px;padding:0 12px">${active ? 'Equipped ✓' : 'Apply Spec &nearr;'}</button>
        </div>
      </article>`;
    }).join('');
  }

  const iGrid = $('hwInvertersGrid');
  if(iGrid){
    iGrid.innerHTML = HARDWARE_DIRECTORY.inverters.map(inv => {
      const active = state.equipped.inverter === inv.id;
      const replLocal = convertFromEur(inv.replacementCostEur, cur);
      return `<article class="hw-card ${active ? 'is-equipped' : ''}">
        <div>
          <span class="hw-badge">${clean(inv.badge)}</span>
          <div class="hw-brand" style="margin-top:8px">${clean(inv.brand)} &middot; ${clean(inv.sku)}</div>
          <h3>${clean(inv.model)}</h3>
          <div class="hw-specs">
            <div><span>Weighted / Max Eff</span><strong>${inv.weightedEffPct}% / ${inv.maxEffPct}%</strong></div>
            <div><span>Modeled Array Loss</span><strong>${inv.systemLossPct}% (${clean(inv.coupling)})</strong></div>
            <div><span>Base Warranty</span><strong>${inv.warrantyYears} Years</strong></div>
            <div><span>Mid-Life Replacement</span><strong>${replLocal === 0 ? 'None (25-Yr Micro)' : 'Yr ' + inv.replacementYear + ' (' + curr(replLocal) + ' ref)'}</strong></div>
          </div>
          <p style="font-size:11px;color:var(--muted);line-height:1.6;margin:10px 0 0">${clean(inv.notes)}</p>
        </div>
        <div class="hw-foot">
          <a href="${clean(inv.sourceUrl)}" target="_blank" rel="noopener noreferrer">${clean(inv.sourceTitle)} &nearr;</a>
          <button type="button" class="button ${active ? 'button-accent' : 'button-dark'}" data-equip-inverter="${inv.id}" style="min-height:34px;font-size:10px;padding:0 12px">${active ? 'Equipped ✓' : 'Apply Spec &nearr;'}</button>
        </div>
      </article>`;
    }).join('');
  }

  const bGrid = $('hwBatteriesGrid');
  if(bGrid){
    bGrid.innerHTML = HARDWARE_DIRECTORY.batteries.map(bat => {
      const active = state.equipped.battery === bat.id && state.inputs.batteryKwh > 0;
      const localCost = convertFromEur(bat.estimatedCostEur, cur);
      return `<article class="hw-card ${active ? 'is-equipped' : ''}">
        <div>
          <span class="hw-badge">${clean(bat.badge)}</span>
          <div class="hw-brand" style="margin-top:8px">${clean(bat.brand)} &middot; ${clean(bat.sku)}</div>
          <h3>${clean(bat.model)}</h3>
          <div class="hw-specs">
            <div><span>Usable Capacity</span><strong>${bat.usableKwh} kWh (${clean(bat.coupling)})</strong></div>
            <div><span>Continuous Power</span><strong>${bat.powerKw} kW (${bat.warrantedCycles} cyc)</strong></div>
            <div><span>Round-Trip Efficiency</span><strong>${bat.roundTripEffPct}%</strong></div>
            <div><span>Ref Cost (${cur} FX)</span><strong>${curr(localCost)} (${bat.warrantyYears}-Yr)</strong></div>
          </div>
          <p style="font-size:11px;color:var(--muted);line-height:1.6;margin:10px 0 0">${clean(bat.notes)}</p>
        </div>
        <div class="hw-foot">
          <a href="${clean(bat.sourceUrl)}" target="_blank" rel="noopener noreferrer">${clean(bat.sourceTitle)} &nearr;</a>
          <button type="button" class="button ${active ? 'button-accent' : 'button-dark'}" data-equip-battery="${bat.id}" style="min-height:34px;font-size:10px;padding:0 12px">${active ? 'Equipped ✓' : 'Apply Spec &nearr;'}</button>
        </div>
      </article>`;
    }).join('');
  }
}

function equipModule(modId){
  const m = HARDWARE_DIRECTORY.modules.find(x => x.id === modId);
  if(!m) return;
  state.equipped.module = m.id;
  state.equipped.moduleArea = m.areaSqm;
  state.equipped.moduleLengthM = m.lengthM;
  state.equipped.moduleWidthM = m.widthM;
  const mw = $('moduleWatts');
  if(mw) mw.value = String(m.watts);
  writeInputs({
    ...state.inputs,
    degradationPct: m.degradationPct
  });
  render();
  toast(`Applied ${m.brand} ${m.model} (${m.watts}W, ${m.degradationPct}%/yr degradation, ${m.lengthM}×${m.widthM}m).`);
}

function equipInverter(invId){
  const inv = HARDWARE_DIRECTORY.inverters.find(x => x.id === invId);
  if(!inv) return;
  state.equipped.inverter = inv.id;
  // C10: Convert reference replacement cost from EUR to active currency
  const replCost = convertFromEur(inv.replacementCostEur, state.inputs.currency);
  writeInputs({
    ...state.inputs,
    loss: inv.systemLossPct,
    replacementYear: inv.replacementYear,
    replacementCost: replCost
  });
  estimate();
  render();
  refreshSolar();
  toast(`Applied ${inv.brand} ${inv.model} (${inv.systemLossPct}% loss, Yr ${inv.replacementYear} replacement ${curr(replCost)}).`);
}

function equipBattery(batId){
  if(batId === 'none'){
    state.equipped.battery = 'none';
    writeInputs({...state.inputs, batteryKwh: 0, batteryCost: 0});
    render();
    toast('Reset to PV-Only configuration (0 kWh battery).');
    return;
  }
  const bat = HARDWARE_DIRECTORY.batteries.find(x => x.id === batId);
  if(!bat) return;
  state.equipped.battery = bat.id;
  const bp = $('batteryPower');
  if(bp) bp.value = String(bat.powerKw);
  // C10: Convert reference battery cost from EUR into selected currency
  const localBattCost = convertFromEur(bat.estimatedCostEur, state.inputs.currency);
  writeInputs({
    ...state.inputs,
    batteryKwh: bat.usableKwh,
    batteryCost: localBattCost,
    batteryEfficiencyPct: bat.roundTripEffPct,
    batteryFadePct: bat.annualFadePct
  });
  render();
  toast(`Applied ${bat.brand} ${bat.model} (${bat.usableKwh} kWh usable, ${curr(localBattCost)} reference FX in ${state.inputs.currency}).`);
}

// === PAGE 04: ROOF & GEOMETRY (C12 Remediated: 2D Row x Col + Setback, Never Claim Verified) ===
function renderRoof(){
  try {
    const modArea = state.equipped.moduleArea || 2.00;
    const modL = state.equipped.moduleLengthM || 1.762;
    const modW = state.equipped.moduleWidthM || 1.134;
    put('roofModuleAreaLabel', `${fmt(modArea, 2)} m\u00b2 (${modL}\u00d7${modW}m)`);
    const area = roofFit({
      length: Number($('roofLength').value),
      width: Number($('roofWidth').value),
      usablePct: Number($('roofUsable').value),
      moduleWatts: Number($('moduleWatts').value),
      moduleArea: modArea,
      moduleLengthM: modL,
      moduleWidthM: modW,
      setbackM: 0.4
    });
    put('roofCapacity', fmt(area.maxKwp, 1) + ' kWp');
    put('roofPanels', `${fmt(area.maxPanels)} (${area.rows}\u00d7${area.cols} ${area.orientation})`);
    put('roofArea', fmt(area.availableSqm, 1) + ' m\u00b2');
    const n = Math.min(area.maxPanels, 72);
    $('roofCanvas').innerHTML = Array.from({length: n}, () => '<span class="roof-panel"></span>').join('');
    put('roofWarning', state.inputs.peakKw > area.maxKwp
      ? `Warning: selected ${fmt(state.inputs.peakKw, 1)} kWp exceeds the preliminary ${fmt(area.maxKwp, 1)} kWp setback envelope (${area.maxPanels} modules).`
      : `Preliminary 2D layout (${area.setbackM}m perimeter setback, ${area.orientation}): ${fmt(state.inputs.peakKw, 1)} kWp requires ~${Math.ceil(state.inputs.peakKw * 1000 / Number($('moduleWatts').value))} modules out of ${area.maxPanels} max. On-site structural & shade survey required.`);
    put('roofBadge', state.inputs.peakKw > area.maxKwp ? 'EXCEEDS PRELIMINARY ENVELOPE' : 'PRELIMINARY AREA/SETBACK ESTIMATE');

    const geo = estimateMonthlyProduction(state.inputs);
    put('geoOptTilt', `${geo.baseOptimalTilt}°`);
    put('geoTiltFactor', `${fmt(geo.tiltFactor * 100, 1)}%`);
    put('geoAspectFactor', `${fmt(geo.aspectFactor * 100, 1)}%`);
    put('geoMountFactor', `${fmt(geo.mountingFactor * 100, 1)}%`);
  } catch (e) {
    put('roofWarning', e.message);
  }
}

// === PAGE 05: ENERGY & 24H DISPATCH (C02 Remediated: Strict Demo vs Verified Separation) ===
function renderEnergy(){
  const f = state.forecast;
  if(!f) return;
  const yr = f.years[0];
  put('energyMode', state.demoMode ? 'SYNTHETIC 8,760H DEMO' : state.hourlyMode ? '8,760H VERIFIED MATCH' : 'PRELIMINARY MONTHLY + 24H');
  put('energyOwn', kwh(yr.selfUsed));
  put('energyGrid', kwh(Math.max(0, f.inputs.annualUsage - yr.selfUsed)));
  put('energyInd', fmt(f.independencePct, 1) + '%');
  put('energyAccuracy', state.demoMode ? 'Synthetic Demo' : state.hourlyMode ? '8,760h Meter + Solar' : 'Monthly Screening');
  if(state.demoMode){
    put('energyChartDesc', 'SYNTHETIC 8,760h DEMO ACTIVE: Both solar irradiance and household load are synthetic curves for software demonstration only.');
  } else if(!state.hourlyMode){
    put('energyChartDesc', `Representative 24-hour dispatch for ${state.location} (${state.dispatchPattern.toUpperCase()} profile${state.dispatchShift ? ' + Smart Midday Shift' : ''}).`);
  } else {
    put('energyChartDesc', `Verified ${state.hourlyPV?.year} PVGIS hourly series matched against user-imported ${state.meter?.meterYear || 'UTC'} 8,760-hour consumption CSV.`);
  }
  renderDay();
}

function dayOfYearToDateLabel(dayIndex){
  const d = new Date(Date.UTC(2023, 0, 1 + dayIndex));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function renderDay(){
  if(!state.forecast) return;
  const month = Math.min(11, Math.floor(state.currentDay / 30.42));
  let pv = [], load = [], soc = [], summarySelfPct = 0;

  if(state.hourlyMode && state.hourlyPV && state.meter){
    const offset = state.currentDay * 24;
    pv = state.hourlyPV.hourlyKwh.slice(offset, offset + 24);
    load = state.meter.hourlyKwh.slice(offset, offset + 24);
    const sim = simulateHourly(pv, load, {
      batteryKwh: state.inputs.batteryKwh,
      batteryEfficiencyPct: state.inputs.batteryEfficiencyPct,
      batteryPowerKw: Number($('batteryPower')?.value) || 5
    });
    soc = sim.hourly.map(h => h.soc);
    summarySelfPct = sim.totals.load > 0 ? (sim.totals.selfUsed / sim.totals.load) * 100 : 0;
  } else {
    const d = dailyDispatch(state.forecast, {
      month,
      pattern: state.dispatchPattern,
      shift: state.dispatchShift
    });
    pv = d.hours.map(x => x.pv);
    load = d.hours.map(x => x.demand);
    soc = d.hours.map(x => x.soc);
    summarySelfPct = d.loadKwh > 0 ? (d.selfUsed / d.loadKwh) * 100 : 0;
  }

  put('dayLabel', `Day ${state.currentDay + 1} (${dayOfYearToDateLabel(state.currentDay)})`);
  put('dispatchSummaryPill', `Day Autonomy: ${fmt(summarySelfPct, 1)}%`);

  const h = 252, w = 1080, margin = 42;
  const max = Math.max(0.5, ...pv, ...load, ...(state.inputs.batteryKwh > 0 ? soc.map(v => v * 0.5) : [0])) * 1.15;
  const step = (w - margin - 14) / 23;
  const py = v => h - margin - (v / max) * (h - 2 * margin);
  const pts = xs => xs.map((v, i) => `${(margin + i * step).toFixed(2)},${py(v).toFixed(2)}`).join(' ');

  let svg = `<svg viewBox="0 0 ${w} ${h}" role="img"><title>24-hour solar output, household demand and battery state of charge</title>${gridSvg(w, h, null, [0, .25, .5, .75, 1].map(v => fmt(max * v, 1)), margin)}`;
  if(state.inputs.batteryKwh > 0){
    svg += `<polyline points="${pts(soc.map(v => v * 0.5))}" fill="none" stroke="#8e9ebc" stroke-width="2.6" stroke-dasharray="5 4" stroke-linecap="round"/>`;
  }
  svg += `<polyline points="${pts(pv)}" fill="none" stroke="#ebb377" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  svg += `<polyline points="${pts(load)}" fill="none" stroke="#5ebc9e" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  [0, 4, 8, 12, 16, 20, 23].forEach(i => {
    svg += `<text x="${margin + i * step}" y="${h - 5}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".68">${String(i).padStart(2, '0')}:00</text>`;
  });
  svg += '</svg>';
  $('dayPlot').innerHTML = svg;
}

// === PAGE 06: BATTERY STUDIO (C06 & C11 Remediated) ===
function noBatteryInputs(){
  return {...state.inputs, batteryKwh: 0, batteryCost: 0};
}

function renderBattery(){
  const p = state.inputs, current = state.forecast, without = forecastFor(noBatteryInputs());
  const shiftedInputs = {...p, selfUsePct: Math.min(95, p.selfUsePct + 12)};
  const withShift = forecastFor(shiftedInputs);
  const delta = current.npv - without.npv, indDelta = current.independencePct - without.independencePct;

  put('batteryArtValue', fmt(p.batteryKwh, 1));
  const fill = $('batteryFill');
  if(fill) fill.style.height = clamp(p.batteryKwh / 30 * 100, 0, 100) + '%';
  put('batteryIndDelta', (indDelta >= 0 ? '+' : '') + fmt(indDelta, 1) + ' pts');
  put('batteryNpvDelta', (delta > 0 ? '+' : '') + curr(delta));

  let headline, detail;
  if(!p.batteryKwh){
    headline = 'The best battery is a justified battery.';
    detail = 'Select a battery preset on the left to evaluate incremental NPV, cycle throughput, and Year-15 refurbishment impact.';
  } else if(p.batteryCost === 0){
    headline = 'Zero-cost battery assumed.';
    detail = 'Battery capex is set to 0. Enter your actual installed battery quote to evaluate realistic incremental payback.';
  } else if(delta > 0){
    headline = 'Storage improves net present value in this modeled case.';
    detail = `Adding ${fmt(p.batteryKwh, 1)} kWh increases autonomy by +${fmt(indDelta, 1)} pts and adds +${curr(delta)} incremental NPV (${fmt(current.batteryEquivalentCycles, 0)} lifetime cycles modeled).`;
  } else {
    headline = 'Storage boosts autonomy (+' + fmt(indDelta, 1) + ' pts) at a net financial cost.';
    detail = `Incremental NPV is ${curr(delta)} after accounting for round-trip losses, fade, and Year-15 cell refurbishment (${fmt(current.batteryEquivalentCycles, 0)} lifetime cycles).`;
  }
  put('batteryTitle', headline);
  put('batteryDescription', detail);

  const rows = [
    {name: 'PV Only (0 kWh Storage)', f: without},
    {name: `Current Setup (${fmt(p.batteryKwh, 1)} kWh Battery)`, f: current},
    {name: `Current + Smart Midday Load Shift (+12% Direct Use)`, f: withShift}
  ];
  $('batteryComparison').innerHTML = rows.map(x => `<tr>
    <td><strong>${clean(x.name)}</strong></td>
    <td>${kwh(x.f.years[0].selfUsed)}</td>
    <td>${fmt(x.f.independencePct, 1)}%</td>
    <td>${x.f.irrPct === null ? '--' : fmt(x.f.irrPct, 1) + '%'} (MIRR ${x.f.mirrPct ?? '--'}%)</td>
    <td><strong>${curr(x.f.npv)}</strong></td>
    <td>${yearText(x.f.sustainedSimplePayback)}</td>
  </tr>`).join('');
}

// === PAGE 07: OPPORTUNITY LAB & 3x3 SENSITIVITY MATRIX (C05 Remediated: Unified Evaluator) ===
const leverSpecs = [
  {id: 'use', title: 'Shift more power on-site (+10% Self-Use)', desc: 'Run EV charging, heat pump, dishwasher, and water heating during peak solar hours.'},
  {id: 'cost', title: 'Optimize turnkey capex (-10% Installed Cost)', desc: 'Compare 3+ certified local quotes or apply confirmed VAT/tax incentives.'},
  {id: 'price', title: 'Higher avoidable retail tariff (+10% Grid Rate)', desc: 'Impact if daytime/peak variable electricity tariffs are 10% higher.'}
];

function leverInput(id){
  const p = state.inputs;
  if(id === 'use') return {...p, selfUsePct: Math.min(100, p.selfUsePct + 10)};
  if(id === 'cost') return {...p, systemCost: Math.round(p.systemCost * .9), grant: Math.min(p.grant, Math.round(p.systemCost * .9) + p.batteryCost)};
  if(id === 'price') return {...p, importRate: Math.min(10, Number((p.importRate * 1.1).toFixed(3)))};
  return p;
}

function leverImpact(id){
  if(id === 'use' && state.hourlyMode) return null;
  const changed = leverInput(id), old = state.forecast;
  return {delta: forecastFor(changed).npv - old.npv, changed};
}

function renderLevers(target){
  const area = $(target);
  if(!area) return;
  area.innerHTML = leverSpecs.map((spec, i) => {
    const out = leverImpact(spec.id);
    const enabled = out !== null && (spec.id !== 'use' || state.inputs.selfUsePct < 100);
    const desc = spec.id === 'use' && state.hourlyMode ? '8,760h interval series already defines self-use.' : spec.desc;
    return target === 'quickWins'
      ? `<div class="win-item"><span class="win-icon">${['+','-','%'][i]}</span><div><strong>${spec.title}</strong><p>${desc}</p></div><div class="win-apply"><b>${enabled ? (out.delta >= 0 ? '+' : '') + curr(out.delta) : '--'}</b><button type="button" data-lever="${spec.id}" ${enabled ? '' : 'disabled'}>APPLY &nearr;</button></div></div>`
      : `<div class="lever"><span class="micro">LEVER / 0${i + 1}</span><h4>${spec.title}</h4><p>${desc}</p><strong>${enabled ? (out.delta >= 0 ? '+' : '') + curr(out.delta) : '--'}</strong><button type="button" data-lever="${spec.id}" ${enabled ? '' : 'disabled'}>Apply this assumption &nearr;</button></div>`;
  }).join('');
}

function applyLever(id){
  const impact = leverImpact(id);
  if(!impact){ toast('This lever is not applicable in 8,760h interval mode.'); return; }
  writeInputs(impact.changed);
  render();
  toast('Applied optimization lever and recalculated 25-year cash flows.');
}

function runStress(mult, rate){
  const input = {...state.inputs, importRate: state.inputs.importRate * rate};
  return forecastFor(input, mult);
}

function renderExplore(full = true){
  if(!state.forecast) return;
  renderLevers('quickWins');
  if(state.page !== 'explore' && !full) return;
  renderLevers('scenarioLevers');

  const cases = [
    {name: 'Downside Stress (0.9x Yield & Tariff)', mult: .9, rate: .9, desc: '10% lower solar yield and 10% lower avoidable retail rate'},
    {name: 'Current Base Case (1.0x)', mult: 1, rate: 1, desc: 'Your currently configured system and tariff inputs'},
    {name: 'Upside Case (1.1x Yield & Tariff)', mult: 1.1, rate: 1.1, desc: '10% higher solar yield and 10% higher retail electricity tariff'}
  ];
  $('scenarioStress').innerHTML = cases.map((x, i) => {
    const res = i === 1 ? state.forecast : runStress(x.mult, x.rate);
    return `<div class="stress ${i === 1 ? 'base' : ''}"><span>${x.name.toUpperCase()}</span><strong>${curr(res.npv)}</strong><p>Sustained Payback: ${yearText(res.sustainedSimplePayback)} &middot; MIRR: ${res.mirrPct ? fmt(res.mirrPct, 1) + '%' : '--'}</p><p>${x.desc}.</p></div>`;
  }).join('');

  // C05: Pass unified (inp, mult) => forecastFor(inp, mult) so 3x3 matrix center ALWAYS matches main NPV
  const matrixBody = $('sensitivityMatrixBody');
  if(matrixBody && state.solar){
    const matrix = calculateSensitivityMatrix(state.solar.monthlyKwh, state.inputs, (inp, mult) => forecastFor(inp, mult));
    matrixBody.innerHTML = matrix.map((row, rIdx) => {
      const tag = rIdx === 0 ? 'Low Escalation (-1.5%)' : rIdx === 1 ? 'Base Escalation' : 'High Escalation (+1.5%)';
      return `<tr>
        <td><strong>${fmt(row.escalationPct, 1)}% / yr</strong> <span style="color:var(--muted);font-size:10px">(${tag})</span></td>
        ${row.cells.map((cell, cIdx) => `<td class="${cell.npv >= 0 ? 'matrix-cell-pos' : 'matrix-cell-neg'}" style="${rIdx === 1 && cIdx === 1 ? 'outline:2px solid #5fe0b7;outline-offset:-2px' : ''}">
          <div>NPV: ${curr(cell.npv)} ${rIdx === 1 && cIdx === 1 ? '★' : ''}</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600">Payback: ${yearText(cell.exactSimplePayback)} &middot; MIRR: ${cell.mirrPct ? fmt(cell.mirrPct, 1) + '%' : '--'}</div>
        </td>`).join('')}
      </tr>`;
    }).join('');
  }

  renderSizer(false);
  renderSaved();
}

function renderSizer(showToast = true){
  const p = state.inputs;
  const options = [3.0, 4.5, 6.0, 8.0, 10.0, 12.0];
  if(!options.includes(Number(p.peakKw.toFixed(1)))) options.splice(2, 0, Number(p.peakKw.toFixed(1)));
  // C05: Pass unified evaluatorFn so Sizer matches active hourly/monthly mode
  const results = optimizeSizes(state.solar.monthlyKwh, p, {
    sizes: options.slice(0, 6),
    evaluatorFn: (testInp, ratio) => forecastFor(testInp, ratio)
  });
  $('sizeComparison').innerHTML = results.map((x, idx) => `<div class="size-option">
    <small>${idx === 0 ? '★ HIGHEST NPV SIZE' : 'MODELED CONFIGURATION'}</small>
    <strong>${fmt(x.kw, 1)} kWp</strong>
    <small>Est. Capex: ${curr(x.systemCost)} &middot; Output: ${kwh(x.annualKwh)}/yr</small>
    <p>NPV: ${curr(x.npv)}</p>
    <small>Payback: ${yearText(x.payback)} &middot; Autonomy: ${fmt(x.independence, 1)}%</small>
    <button type="button" data-size="${x.kw}" data-cost="${x.systemCost}" style="margin-top:8px">Apply ${fmt(x.kw, 1)} kWp &nearr;</button>
  </div>`).join('');
  if(showToast) toast('Array sizes ranked by 25-year Net Present Value using active model engine.');
}

function renderSaved(){
  const area = $('scenarioList');
  if(!area) return;
  if(!state.saved.length){
    area.innerHTML = '<div class="empty-state">No scenarios saved yet. Click "Save this scenario +" above to store up to 12 configurations for instant comparison.</div>';
    return;
  }
  area.innerHTML = state.saved.map((x, i) => `<div class="saved-item">
    <div><b>${clean(x.name)}</b><small>${clean(x.location)} &middot; ${fmt(x.inputs.peakKw, 1)} kWp &middot; Batt: ${fmt(x.inputs.batteryKwh, 1)} kWh</small></div>
    <div class="saved-buttons"><button type="button" data-restore="${i}">Load</button><button type="button" data-remove="${i}">Delete</button></div>
  </div>`).join('');
}

function saveCurrent(){
  if(state.saved.length >= 12){ toast('Limit: 12 saved scenarios. Export JSON or delete old scenarios first.'); return; }
  const name = $('scenarioName').value.trim().slice(0, 70);
  if(!name){ toast('Enter a scenario name.'); return; }
  state.saved.unshift({name, inputs: {...state.inputs}, location: state.location, extras: readExtras()});
  $('saveDialog').close();
  renderSaved();
  persist();
  toast('Scenario saved in browser storage.');
}

function loadSaved(idx){
  const item = state.saved[idx];
  if(!item) return;
  writeInputs({...item.inputs, location: item.location});
  applyExtras(item.extras);
  state.hourlyMode = false;
  state.demoMode = false;
  state.hourlyPV = null;
  state.hourlySig = '';
  estimate();
  render();
  go('overview');
  refreshSolar();
  toast(`Loaded scenario "${item.name}".`);
}

// C15: Reproducible Project JSON Export with Provenance, Engine Version, Results Snapshot & Checksum
function exportProject(){
  const f = state.forecast;
  const snapshot = f ? {
    npv: Number(f.npv.toFixed(2)),
    irrPct: f.irrPct,
    mirrPct: f.mirrPct,
    firstSimplePayback: f.firstSimplePayback,
    sustainedSimplePayback: f.sustainedSimplePayback,
    exactDiscountedPayback: f.exactDiscountedPayback,
    lcoe: Number(f.lcoe.toFixed(4)),
    year1GenerationKwh: Number((f.years[0]?.generation || 0).toFixed(2)),
    yearlySeries: f.years.map(y => ({
      year: y.year,
      generation: Number(y.generation.toFixed(2)),
      selfUsed: Number(y.selfUsed.toFixed(2)),
      exported: Number(y.exported.toFixed(2)),
      cashflow: Number(y.cashflow.toFixed(2)),
      cumulative: Number(y.cumulative.toFixed(2)),
      discountedCumulative: Number(y.discountedCumulative.toFixed(2))
    }))
  } : null;
  const payload = {
    format: 'SolarPaybackAuroraProject',
    version: 7,
    schemaVersion: '7.5.0',
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    provenance: {
      quality: state.quality,
      verifiedProvider: state.verifiedProvider,
      demoMode: state.demoMode,
      hourlyMode: state.hourlyMode,
      dataset: state.solar?.dataset || null,
      solarSig: state.solarSig,
      fetchedAt: state.solarAt
    },
    inputs: state.inputs,
    location: state.location,
    equipped: state.equipped,
    quoteSlots: readQuoteSlots(),
    solarSnapshot: state.solar,
    hourlyState: state.hourlyMode ? {
      hourlyPV: state.hourlyPV,
      meter: state.meter,
      hourlySig: state.hourlySig
    } : null,
    scenarios: state.saved,
    extras: readExtras(),
    resultsSnapshot: snapshot,
    disclaimer: 'Illustrative / reference projections unless verifiedProvider is true and backed by certified site survey and utility tariff schedules.'
  };
  download('solar-payback-aurora-v7-project.json', JSON.stringify(payload, null, 2), 'application/json');
}

async function importProject(file){
  if(!file) return;
  try {
    if(file.size > 4_500_000) throw Error('Project file exceeds 4.5 MB');
    const data = JSON.parse(await file.text());
    if(data?.format !== 'SolarPaybackAuroraProject' || ![6, 7].includes(data?.version)) throw Error('Not a valid SolarPayback Aurora v6/v7 project JSON.');
    const input = validateInputs(data.inputs);
    const saved = (Array.isArray(data.scenarios) ? data.scenarios : []).slice(0, 12).map(s => ({
      name: String(s.name || 'Unnamed').slice(0, 70),
      inputs: validateInputs(s.inputs),
      location: String(s.location || 'Imported').slice(0, 130),
      extras: s.extras && typeof s.extras === 'object' ? s.extras : {}
    }));
    writeInputs({...input, location: String(data.location || 'Imported location').slice(0, 130)});
    applyExtras(data.extras);
    if(Array.isArray(data.quoteSlots)) applyQuoteSlots(data.quoteSlots);
    if(data.equipped) state.equipped = {...state.equipped, ...data.equipped};
    state.saved = saved;

    // V71-07: Restore exact solar and 8,760h hourly state when present in the snapshot for deterministic replay
    if(data.hourlyState && data.hourlyState.hourlyPV && data.hourlyState.meter){
      state.hourlyPV = data.hourlyState.hourlyPV;
      state.meter = data.hourlyState.meter;
      state.hourlySig = data.hourlyState.hourlySig || solarSignature(state.inputs);
      state.hourlyMode = Boolean(data.provenance?.hourlyMode);
      state.demoMode = Boolean(data.provenance?.demoMode);
      state.quality = data.provenance?.quality || 'synthetic-demo';
      state.verifiedProvider = Boolean(data.provenance?.verifiedProvider);
      if(data.solarSnapshot) state.solar = data.solarSnapshot;
      else estimate();
      render();
      go('overview');
      toast('Project & 8,760h interval state restored deterministically from snapshot.');
    } else {
      state.hourlyMode = false;
      state.demoMode = false;
      state.hourlyPV = null;
      state.meter = null;
      if(data.solarSnapshot && Array.isArray(data.solarSnapshot.monthlyKwh) && data.solarSnapshot.monthlyKwh.length === 12){
        state.solar = data.solarSnapshot;
        state.quality = data.provenance?.quality || 'benchmark-reference';
        state.verifiedProvider = Boolean(data.provenance?.verifiedProvider);
        state.solarSig = solarSignature(state.inputs);
        render();
        go('overview');
        toast('Project snapshot restored deterministically.');
      } else {
        estimate();
        render();
        go('overview');
        refreshSolar();
        toast('Project imported and recalculated.');
      }
    }
  } catch (e) {
    toast('Import failed: ' + e.message);
  } finally {
    $('projectFile').value = '';
  }
}

// === PAGE 08: FINANCE & LEDGER ===
function renderFinance(){
  if(!state.forecast) return;
  const f = state.forecast, inputs = state.inputs;
  put('financeNpv', curr(f.npv));
  put('financeIrr', f.irrPct == null ? 'Not defined' : `${fmt(f.irrPct, 1)}% (MIRR ${fmt(f.mirrPct, 1)}%)`);
  put('financeInitial', curr(f.upfront));
  put('financeLifetime', curr(f.years.at(-1)?.cumulative));
  put('financeDiscounted', yearText(f.sustainedDiscountedPayback));
  try {
    const loan = projectFinance(f, {
      loanShare: Number($('loanShare').value),
      loanApr: Number($('loanApr').value),
      loanYears: Number($('loanYears').value)
    });
    put('equityNpv', curr(loan.npv));
    put('annualLoan', curr(loan.annualDebt));
  } catch {
    put('equityNpv', 'Check terms');
    put('annualLoan', '--');
  }
  put('ledgerInfo', `Provenance: ${sourceLabel()}. Currency: ${inputs.currency}. Discount rate ${fmt(inputs.discountPct, 1)}%; PV degradation ${fmt(inputs.degradationPct, 2)}%/yr.`);
  $('ledgerRows').innerHTML = f.years.map(y => `<tr>
    <td><strong>Yr ${y.year}</strong></td>
    <td>${fmt(y.generation)} kWh</td>
    <td>${fmt(y.selfUsed)} kWh</td>
    <td>${fmt(y.exported)} kWh</td>
    <td>${curr(y.avoidedPurchases)}</td>
    <td>${curr(y.exportRevenue)}</td>
    <td>${curr(y.annualOperatingCost + y.replacement)}</td>
    <td><strong>${curr(y.cashflow)}</strong></td>
    <td>${curr(y.discountedCashflow)}</td>
    <td class="${y.cumulative >= 0 ? 'matrix-cell-pos' : ''}"><strong>${curr(y.cumulative)}</strong></td>
  </tr>`).join('');
}

// === PAGE 09: EVIDENCE & API HEALTH (C16 Remediated: Canary Check) ===
function renderEvidence(){
  if(!state.solar) return;
  const f = state.forecast;
  const modObj = HARDWARE_DIRECTORY.modules.find(m => m.id === state.equipped.module) || HARDWARE_DIRECTORY.modules[2];
  const invObj = HARDWARE_DIRECTORY.inverters.find(i => i.id === state.equipped.inverter) || HARDWARE_DIRECTORY.inverters[2];
  const fields = [
    ['Provenance Classification', `${sourceLabel()} (verifiedProvider: ${state.verifiedProvider ? 'true' : 'false'}, demo: ${state.demoMode ? 'true' : 'false'})`],
    ['Active Solar Dataset', state.solar.dataset || 'Illustrative Reference'],
    ['Last Climate Check', state.solarAt ? new Date(state.solarAt).toLocaleString() : 'Active session'],
    ['Project Coordinates', `${fmt(state.inputs.lat, 4)}°, ${fmt(state.inputs.lon, 4)}° (${state.location})`],
    ['Array Geometry & Loss', `${fmt(state.inputs.peakKw, 1)} kWp / Tilt ${fmt(state.inputs.slope, 0)}° (Opt ${state.solar.baseOptimalTilt || 32}°) / Azimuth ${fmt(state.inputs.aspect, 0)}° / Loss ${fmt(state.inputs.loss, 1)}%`],
    ['Equipped PV Module', `${modObj.brand} ${modObj.model} (${modObj.sku}, ${modObj.watts}W, ${modObj.degradationPct}%/yr deg)`],
    ['Equipped Inverter', `${invObj.brand} ${invObj.model} (${invObj.sku}, ${invObj.weightedEffPct}% eff, ${invObj.coupling})`],
    ['Payback Continuity Check', f ? `First Cross: ${yearText(f.firstSimplePayback)} | Sustained: ${yearText(f.sustainedSimplePayback)} | Interrupted: ${f.paybackInterrupted ? 'YES' : 'NO'}` : '--'],
    ['Annual Household Demand', kwh(f?.inputs.annualUsage || state.inputs.annualUsage)],
    ['Tariff & Financial Basis', `Import ${curr(state.inputs.importRate, 3)}/kWh | Export ${curr(state.inputs.exportRate, 3)}/kWh | Discount ${fmt(state.inputs.discountPct, 1)}%`],
    ['Session Funnel Telemetry', Array.from(funnelStages).join(' -> ')]
  ];
  $('lineageRows').innerHTML = fields.map(([l, v]) => `<div><span>${clean(l)}</span><strong>${clean(v)}</strong></div>`).join('');
  renderAuditFlags('evidenceAuditFlags');
}

// C16: Differentiated Health & Upstream PVGIS Canary Check
async function checkHealth(){
  put('apiHealth', 'Running Cloudflare Worker + EU JRC PVGIS Canary + Open-Meteo readiness diagnostics...');
  let workerStatus = 'Offline / Standalone Preview';
  let pvgisCanaryStatus = 'Not tested (requires Cloudflare Worker proxy due to JRC CORS policy)';
  try {
    const r = isEdgeHost() ? await fetchWithRetry(apiUrl('health', 'canary=1'), 10000, 0) : null;
    if(r && r.ok){
      const d = await r.json();
      if(d?.ok){
        workerStatus = `Healthy (${d.service})`;
        pvgisCanaryStatus = d.pvgisCanary === 'healthy'
          ? `Healthy (${d.canaryDataset}, ${d.pvgisLatencyMs}ms, hash ${d.canaryHash})`
          : `Degraded (${d.canaryError || d.pvgisCanary})`;
      }
    }
  } catch {}

  let omStatus = 'Unreachable';
  try {
    const t0 = Date.now();
    const r2 = await fetchWithRetry('https://geocoding-api.open-meteo.com/v1/search?name=Athens&count=1&format=json', 5500, 0);
    if(r2 && r2.ok) omStatus = `Healthy (${Date.now() - t0}ms CORS response)`;
  } catch {}

  put('apiHealth', `1) Edge Worker: ${workerStatus} | 2) EU JRC PVGIS Upstream Canary: ${pvgisCanaryStatus} | 3) Open-Meteo Geocoding API: ${omStatus} | 4) Engine Version: ${ENGINE_VERSION}`);
}

async function findCity(){
  const search = $('citySearch').value.trim();
  if(search.length < 2) return toast('Enter at least two letters.');
  const results = $('placeResults');
  results.hidden = false;
  results.textContent = 'Searching coordinates...';

  const qLower = search.toLowerCase();
  const localMatches = CITY_BENCHMARKS.filter(c => `${c.name} ${c.country}`.toLowerCase().includes(qLower)).slice(0, 4).map(c => ({
    name: c.name.split(',')[0],
    admin1: 'Reference City',
    country: c.country,
    lat: c.lat,
    lon: c.lon,
    benchmarkId: c.id
  }));

  try {
    let remotePlaces = [];
    try {
      const res = await fetchWithRetry('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(search) + '&count=6&language=en&format=json', 7500, 0);
      if(res && res.ok){
        const data = await res.json();
        if(Array.isArray(data?.results)){
          remotePlaces = data.results.slice(0, 6).filter(x => Number.isFinite(x.latitude) && Number.isFinite(x.longitude)).map(x => ({
            name: String(x.name || ''),
            admin1: String(x.admin1 || ''),
            country: String(x.country || ''),
            lat: x.latitude,
            lon: x.longitude
          }));
        }
      }
    } catch {}

    const combined = [...localMatches, ...remotePlaces].slice(0, 6);
    if(!combined.length) throw Error('No matching places found. Enter latitude and longitude manually.');
    results._items = combined;
    results.innerHTML = combined.map((p, i) => `<button type="button" data-place="${i}">${clean(p.name + ', ' + (p.admin1 ? p.admin1 + ', ' : '') + p.country)} &middot; ${fmt(p.lat, 3)}°, ${fmt(p.lon, 3)}°</button>`).join('');
  } catch (e) {
    results.textContent = e.message;
  }
}

function useLocation(place){
  if(place.benchmarkId){
    applyCityFromDirectory(place.benchmarkId, 'full');
    $('placeResults').hidden = true;
    return;
  }
  const matched = CITY_BENCHMARKS.find(c => Math.hypot(c.lat - place.lat, c.lon - place.lon) < 0.35);
  if(matched){
    applyCityFromDirectory(matched.id, 'full');
    $('placeResults').hidden = true;
    return;
  }
  writeInputs({...state.inputs, lat: place.lat, lon: place.lon, location: place.name});
  state.hourlyMode = false;
  state.demoMode = false;
  state.hourlyPV = null;
  state.hourlySig = '';
  estimate();
  render();
  $('placeResults').hidden = true;
  refreshSolar();
  toast(`Location updated to ${place.name}.`);
}

// === 8,760H METER & HOURLY SIMULATION (C02 & C07 Remediated) ===
async function meterUpload(file){
  if(!file) return;
  try {
    if(file.size > 2800000) throw Error('Maximum CSV file size is 2.8 MB.');
    const parsed = parseLoadCSV(await file.text());
    state.meter = parsed;
    state.hourlyMode = false;
    state.demoMode = false;
    put('meterStatus', parsed.timestampsValidated
      ? `Imported ${fmt(parsed.annualKwh)} kWh (${parsed.meterYear}, offset :${String(parsed.minuteOffset).padStart(2, '0')}), 8,760 UTC hours validated.`
      : `Imported ${fmt(parsed.annualKwh)} kWh, 8,760 entries (untimestamped).`);
    render();
    toast('8,760-hour meter CSV parsed locally.');
  } catch (e) {
    state.meter = null;
    put('meterStatus', 'Import error: ' + e.message);
    toast('Invalid hourly file: ' + e.message);
  } finally {
    $('meterFile').value = '';
  }
}

// C02: Synthetic hourly series is strictly tagged quality: 'synthetic-demo' and demo: true
function generateSyntheticHourlyPV(year = 2023){
  const est = state.solar || estimateMonthlyProduction(state.inputs);
  const hourlyKwh = [];
  const lat = state.inputs.lat;
  for(let m = 0; m < 12; m++){
    const days = MONTH_DAYS[m];
    const dailyTarget = est.monthlyKwh[m] / days;
    const dayLen = 16 - 4 * Math.abs(lat) / 90 + 2.3 * Math.sin((m + 1 - 3) * Math.PI / 6) * (lat >= 0 ? 1 : -1);
    const sunrise = 12 - Math.max(7, Math.min(16, dayLen)) / 2;
    const sunset = 12 + Math.max(7, Math.min(16, dayLen)) / 2;
    const weights = Array.from({length: 24}, (_, h) => Math.max(0, Math.sin(Math.PI * ((h + .5) - sunrise) / (sunset - sunrise))) ** 1.6);
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    for(let d = 0; d < days; d++){
      const weatherMod = 0.86 + 0.28 * Math.sin((d * 1.7 + m) * 0.9);
      for(let h = 0; h < 24; h++){
        hourlyKwh.push(Math.max(0, (weights[h] / wSum) * dailyTarget * weatherMod));
      }
    }
  }
  const rawSum = hourlyKwh.reduce((a, b) => a + b, 0) || 1;
  const scale = est.annualKwh / rawSum;
  const scaled = hourlyKwh.map(v => Math.round(v * scale * 1000) / 1000);
  return {
    hourlyKwh: scaled,
    annualKwh: Math.round(scaled.reduce((a, b) => a + b, 0) * 100) / 100,
    year,
    source: 'Synthetic Demo Hourly Series (Not PVGIS)',
    quality: 'synthetic-demo',
    verifiedProvider: false,
    demo: true,
    dataset: 'Synthetic 8,760h Weather Approximation (Demo Only)'
  };
}

// C07: Client timeout 28,000ms (> 24,000ms Worker seriescalc timeout)
async function getHourlyPVGIS(){
  const sig = solarSignature(state.inputs), ticket = ++state.token;
  const button = $('fetchHourly');
  const year = Number($('hourlyYear').value);
  button.disabled = true;
  put('pvHourlyStatus', `Requesting ${year} 8,760-hour PVGIS series (up to 28s)...`);
  try {
    const response = isEdgeHost() ? await fetchWithRetry(apiUrl('hourly', solarArgs(state.inputs) + '&year=' + year), 28000, 1) : null;
    if(response && response.ok){
      const json = await response.json();
      if(json.quality === 'pvgis-hourly' && Array.isArray(json.hourlyKwh) && json.hourlyKwh.length === 8760){
        state.hourlyPV = {...json, verifiedProvider: true, demo: false};
        state.hourlySig = sig;
        put('pvHourlyStatus', `Verified PVGIS ${year} loaded: ${kwh(json.annualKwh)} (offset :${String(json.minuteOffset ?? 0).padStart(2, '0')}).`);
        toast('Verified PVGIS 8,760-hour series loaded.');
        return;
      }
    }
    throw Error('Live PVGIS seriescalc unavailable in standalone/Canvas preview');
  } catch (e) {
    if(ticket !== state.token) return;
    state.hourlyPV = null;
    put('pvHourlyStatus', `Live PVGIS hourly API unavailable (${e.message}). Use "One-Click Load Demo 8,760h Dataset" to test the hourly engine with synthetic data.`);
    toast('Live PVGIS hourly endpoint unavailable; no fake provider badge was substituted.');
  } finally {
    button.disabled = false;
  }
}

// C02: Explicitly marks demoMode = true, quality = 'synthetic-demo', verifiedProvider = false
function loadDemo8760Dataset(){
  const year = Number($('hourlyYear').value) || 2023;
  const targetAnnual = state.inputs.annualUsage || 6500;
  const raw = [];
  for(let i = 0; i < 8760; i++){
    const h = i % 24;
    const day = Math.floor(i / 24);
    const season = 1 + 0.22 * Math.cos((day - 20) * 2 * Math.PI / 365);
    const shape = (h >= 18 && h <= 22) ? 1.45 : (h >= 7 && h <= 9) ? 0.95 : (h >= 10 && h <= 16) ? 0.62 : 0.32;
    raw.push(shape * season);
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  const hourlyKwh = raw.map(v => Math.round((v / sum) * targetAnnual * 1000) / 1000);
  state.meter = {
    hourlyKwh,
    annualKwh: Math.round(hourlyKwh.reduce((a, b) => a + b, 0)),
    rows: 8760,
    meterYear: year,
    demo: true,
    timestampsValidated: false,
    source: `SYNTHETIC DEMO ${year} 8,760-hour load curve (Illustrative Only)`
  };
  state.hourlyPV = generateSyntheticHourlyPV(year);
  state.hourlySig = solarSignature(state.inputs);
  state.hourlyMode = true;
  state.demoMode = true;
  state.quality = 'synthetic-demo';
  state.verifiedProvider = false;
  put('meterStatus', `[SYNTHETIC DEMO] ${fmt(state.meter.annualKwh)} kWh (${year}) synthetic load trace active.`);
  put('pvHourlyStatus', `[SYNTHETIC DEMO] ${kwh(state.hourlyPV.annualKwh)} (${year}) synthetic solar trace active.`);
  render();
  toast('Loaded Synthetic 8,760h Demo Dataset (marked Illustrative Demo throughout UI and exports).');
}

function startHourly(){
  if(!state.meter || !state.hourlyPV || state.hourlySig !== solarSignature(state.inputs)){
    return toast('Import a valid 8,760-hour CSV and fetch matching PVGIS hourly data first.');
  }
  if(!state.meter.demo && !state.meter.timestampsValidated){
    return toast('Verified hourly financial mode requires a timestamped UTC meter CSV.');
  }
  if(state.meter.meterYear && state.meter.meterYear !== state.hourlyPV.year){
    return toast('Meter and solar years differ. Select the matching year and reload.');
  }
  state.hourlyMode = true;
  state.demoMode = Boolean(state.meter.demo || state.hourlyPV.demo);
  state.quality = state.demoMode ? 'synthetic-demo' : 'pvgis-hourly';
  state.verifiedProvider = !state.demoMode && Boolean(state.hourlyPV.verifiedProvider);
  state.inputs = {...state.inputs, annualUsage: state.meter.annualKwh};
  const usage = $('f-annualUsage');
  if(usage) usage.value = String(Math.round(state.meter.annualKwh * 100) / 100);
  render();
  toast(state.demoMode ? 'Synthetic 8,760h demo simulation active.' : 'Verified 8,760-hour PVGIS + meter simulation active.');
}

function sampleMeterCSV(){
  const year = Number($('hourlyYear').value) || 2023;
  const rows = ['timestamp,kwh'];
  for(let i = 0; i < 8760; i++){
    const h = i % 24;
    const hour = (h >= 18 && h <= 23) ? .85 : (h >= 7 && h <= 9) ? .57 : .30;
    rows.push(new Date(Date.UTC(year, 0, 1, i)).toISOString() + ',' + hour.toFixed(3));
  }
  download('SYNTHETIC-EXAMPLE-HOURLY-METER.csv', rows.join('\n'), 'text/csv');
  toast('Downloaded synthetic 8,760-hour UTC CSV format example.');
}

function exportCashCSV(){
  if(!state.forecast) return;
  const csv = asCSV(state.forecast, {
    quality: state.quality,
    verifiedProvider: state.verifiedProvider && !state.demoMode,
    dataset: state.solar?.dataset || 'Illustrative',
    generatedAt: new Date().toISOString()
  });
  download('solar-payback-aurora-v7-cashflow.csv', csv, 'text/csv');
  toast('25-year financial audit ledger exported with provenance headers.');
}

function bind(){
  for(const el of $$('[data-i18n]')) originals.set(el, el.textContent);
  for(const b of $$('[data-route]')) b.addEventListener('click', () => go(b.dataset.route));

  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace(/^#/, '');
    if(h && h !== state.page) go(h, false);
  });

  $('langToggle').addEventListener('click', () => { state.lang = state.lang === 'en' ? 'el' : 'en'; applyLang(); render(); persist(); });
  $('themeToggle').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; applyTheme(); persist(); });

  let prevCurrency = state.inputs.currency;
  for(const key of Object.keys(DEFAULTS)){
    const el = $('f-' + key);
    if(!el) continue;
    el.addEventListener('change', () => {
      if(key === 'lat' || key === 'lon') state.location = 'Custom coordinates';
      // C10: When user changes currency dropdown, convert monetary fields via dated Reference FX so EUR numbers are never silently relabeled as USD/GBP/AUD
      if(key === 'currency'){
        const newCurr = el.value;
        const oldRate = REFERENCE_FX_FROM_EUR[prevCurrency] || 1;
        const newRate = REFERENCE_FX_FROM_EUR[newCurr] || 1;
        const factor = newRate / oldRate;
        for(const mKey of ['systemCost','grant','batteryCost','annualMaintenance','annualInsurance','replacementCost']){
          const mEl = $('f-' + mKey);
          if(mEl){
            const conv = Math.round(Number(mEl.value) * factor);
            mEl.value = String(conv);
            state.inputs[mKey] = conv;
          }
        }
        for(const rKey of ['importRate','exportRate']){
          const rEl = $('f-' + rKey);
          if(rEl){
            const conv = Number((Number(rEl.value) * factor).toFixed(3));
            rEl.value = String(conv);
            state.inputs[rKey] = conv;
          }
        }
        prevCurrency = newCurr;
        toast(`Converted monetary inputs to ${newCurr} using reference FX (1 EUR = ${newRate} ${newCurr}). Verify with local quotes.`);
      }
      refreshInputs(key);
    });
  }

  for(const [slider, field] of [['sizeSlider','f-peakKw'],['selfUseSlider','f-selfUsePct'],['batterySlider','f-batteryKwh']]){
    $(slider).addEventListener('input', e => {
      const el = $(field);
      const val = Number(e.target.value);
      if(slider === 'sizeSlider'){
        const unitCost = state.inputs.systemCost / Math.max(0.5, state.inputs.peakKw);
        const newCost = Math.round(unitCost * val);
        $('f-systemCost').value = String(newCost);
        state.inputs.systemCost = newCost;
      }
      if(slider === 'batterySlider'){
        const unitPerKwh = convertFromEur(580, state.inputs.currency);
        const newBCost = val === 0 ? 0 : Math.round(val * unitPerKwh);
        $('f-batteryCost').value = String(newBCost);
        state.inputs.batteryCost = newBCost;
      }
      el.value = String(val);
      state.inputs[field.slice(2)] = val;
      syncControls();
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => refreshInputs(field.slice(2)), 120);
    });
  }

  // Command Center Live Telemetry Dock Sliders (C10 FX-aware)
  $('dockKwSlider').addEventListener('input', e => {
    const kw = Number(e.target.value);
    const unitCost = state.inputs.systemCost / Math.max(0.5, state.inputs.peakKw);
    const newCost = Math.round(unitCost * kw);
    $('f-peakKw').value = String(kw);
    $('f-systemCost').value = String(newCost);
    state.inputs.peakKw = kw;
    state.inputs.systemCost = newCost;
    syncControls();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => refreshInputs('peakKw'), 90);
  });

  $('dockBattSlider').addEventListener('input', e => {
    const kwhVal = Number(e.target.value);
    const unitPerKwh = convertFromEur(580, state.inputs.currency);
    const estCost = kwhVal === 0 ? 0 : Math.round(kwhVal * unitPerKwh);
    $('f-batteryKwh').value = String(kwhVal);
    $('f-batteryCost').value = String(estCost);
    state.inputs.batteryKwh = kwhVal;
    state.inputs.batteryCost = estCost;
    syncControls();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => refreshInputs('batteryKwh'), 90);
  });

  $('dockSelfSlider').addEventListener('input', e => {
    const pct = Number(e.target.value);
    $('f-selfUsePct').value = String(pct);
    state.inputs.selfUsePct = pct;
    syncControls();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => refreshInputs('selfUsePct'), 90);
  });

  $('dockRateSlider').addEventListener('input', e => {
    const rate = Number(e.target.value);
    $('f-importRate').value = String(rate);
    state.inputs.importRate = rate;
    syncControls();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => refreshInputs('importRate'), 90);
  });

  // C18: Above-the-fold Jump & Quote/Bill Analyzer bindings
  $('jumpQuoteAnalyzer')?.addEventListener('click', () => {
    $('quoteAnalyzerPanel')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  for(const id of ['billTotalAnnual','billFixedAnnual']){
    $(id)?.addEventListener('input', () => { renderQuoteAndBillAnalyzer(); persist(); });
  }
  $('applyTrueAvoidableRate')?.addEventListener('click', () => {
    try {
      const rawGross = String($('billTotalAnnual')?.value ?? '').trim();
      const rawFixed = String($('billFixedAnnual')?.value ?? '').trim();
      const bill = decomposeUtilityBill({
        annualBill: rawGross === '' ? NaN : Number(rawGross),
        fixedAnnual: rawFixed === '' ? NaN : Number(rawFixed),
        annualUsage: state.inputs.annualUsage
      });
      // P0-3: Allow exact 0.000/kWh when fixed fees equal gross bill; never force 0.01 minimum
      const trueRate = Number(bill.trueAvoidableRatePerKwh.toFixed(6));
      writeInputs({...state.inputs, importRate: trueRate});
      render();
      toast(`Applied true avoidable volumetric rate (${curr(trueRate, 3)}/kWh) excluding ${curr(bill.fixedAnnual)} fixed fees.`);
    } catch (e) {
      warn(e.message);
      toast('Cannot apply bill rate: ' + e.message);
    }
  });
  for(let slot = 0; slot < 3; slot++){
    for(const prefix of ['qa-kw-','qa-cost-','qa-batt-','qa-bcost-','qa-scaf-','qa-spd-','qa-grid-']){
      $(prefix + slot)?.addEventListener('input', renderQuoteAndBillAnalyzer);
      $(prefix + slot)?.addEventListener('change', renderQuoteAndBillAnalyzer);
    }
  }
  $('downloadDecisionBrief')?.addEventListener('click', downloadDecisionReport);
  $('downloadDecisionPdf')?.addEventListener('click', downloadPdfDecisionReport);
  $('runQuoteExtractBtn')?.addEventListener('click', () => applyExtractedQuoteText($('quotePasteInput')?.value || ''));
  $('quoteDocFile')?.addEventListener('change', e => handleQuoteFileUpload(e.target.files?.[0]));
  $('startStripeCheckoutBtn')?.addEventListener('click', startCloudCheckout);
  $('authSessionBtn')?.addEventListener('click', requestCustomerSession);
  $('retrievePaidReportBtn')?.addEventListener('click', retrievePaidOrderReport);
  for(const cid of ['confirmBillCheck','confirmQuoteCheck','confirmSurveyCheck']) $(cid)?.addEventListener('change', renderOverview);
  $('installerQuoteCards')?.addEventListener('click', e => {
    const b = e.target.closest('[data-load-quote]');
    if(!b) return;
    const slot = Number(b.dataset.loadQuote);
    const q = readQuoteSlots()[slot];
    const audited = auditInstallerQuote(q, state.inputs);
    writeInputs({
      ...state.inputs,
      peakKw: q.kw,
      systemCost: audited.effectiveTotalCapex - q.batteryCost,
      batteryKwh: q.batteryKwh,
      batteryCost: q.batteryCost,
      grant: Math.min(state.inputs.grant, audited.effectiveTotalCapex)
    });
    if(!state.hourlyMode) estimate();
    render();
    if(!state.hourlyMode) refreshSolar();
    toast(`Loaded Quote ${['A','B','C'][slot]} (${fmt(q.kw, 1)} kWp, effective capex ${curr(audited.effectiveTotalCapex)} including any unquoted exclusions).`);
  });

  // Directory Filter, Search, Sort & Actions
  $('dirRegionPills').addEventListener('click', e => {
    const b = e.target.closest('[data-region]');
    if(!b) return;
    state.dirRegion = b.dataset.region;
    for(const pill of $$('#dirRegionPills .dir-pill')) pill.classList.toggle('active', pill.dataset.region === state.dirRegion);
    renderDirectory();
  });
  $('dirSearchInput').addEventListener('input', e => { state.dirSearch = e.target.value; renderDirectory(); });
  $('dirSortSelect').addEventListener('change', e => { state.dirSort = e.target.value; renderDirectory(); });
  $('cityDirectoryGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-apply-city]');
    if(b) applyCityFromDirectory(b.dataset.applyCity, b.dataset.mode || 'full');
  });
  $('policyDirectoryGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-apply-policy]');
    if(b) applyPolicyPreset(b.dataset.applyPolicy);
  });

  // Hardware Directory Actions
  $('hwModulesGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-equip-module]');
    if(b) equipModule(b.dataset.equipModule);
  });
  $('hwInvertersGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-equip-inverter]');
    if(b) equipInverter(b.dataset.equipInverter);
  });
  $('hwBatteriesGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-equip-battery]');
    if(b) equipBattery(b.dataset.equipBattery);
  });
  $('clearBatteryEquip').addEventListener('click', () => equipBattery('none'));
  $('quickBatteryPresets').addEventListener('click', e => {
    const b = e.target.closest('[data-batt-preset]');
    if(b) equipBattery(b.dataset.battPreset);
  });

  // System & Roof Studio
  for(const id of ['roofLength','roofWidth','roofUsable','moduleWatts']){
    $(id).addEventListener('change', () => { renderRoof(); persist(); });
  }
  $('batteryPower').addEventListener('change', () => { render(); persist(); });
  $('snapOptimalGeo').addEventListener('click', () => {
    const geo = estimateMonthlyProduction(state.inputs);
    writeInputs({...state.inputs, slope: geo.baseOptimalTilt, aspect: 0, mounting: 'free'});
    estimate();
    render();
    refreshSolar();
    toast(`Snapped array to optimal ${geo.baseOptimalTilt}° tilt and 0° South azimuth.`);
  });

  for(const id of ['refreshSolar','designRefresh']) $(id).addEventListener('click', refreshSolar);
  $('citySearchBtn').addEventListener('click', findCity);
  $('citySearch').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); findCity(); } });
  $('placeResults').addEventListener('click', e => {
    const b = e.target.closest('[data-place]');
    if(b){
      const p = $('placeResults')._items?.[Number(b.dataset.place)];
      if(p) useLocation({lat: p.lat, lon: p.lon, name: p.name + ', ' + p.country, benchmarkId: p.benchmarkId});
    }
  });
  for(const b of $$('[data-city]')){
    b.addEventListener('click', () => {
      const id = b.dataset.city === 'newyork' ? 'new_york' : b.dataset.city;
      applyCityFromDirectory(id, 'full');
    });
  }

  // Energy & Dispatch Controls
  $('daySlider').addEventListener('input', e => { state.currentDay = Number(e.target.value); renderDay(); });
  $('dispatchPattern').addEventListener('change', e => { state.dispatchPattern = e.target.value; renderEnergy(); });
  $('dispatchShift').addEventListener('change', e => {
    state.dispatchShift = Boolean(e.target.checked);
    renderEnergy();
  });
  $('meterFile').addEventListener('change', e => meterUpload(e.target.files?.[0]));
  $('sampleCSV').addEventListener('click', sampleMeterCSV);
  $('loadDemo8760').addEventListener('click', loadDemo8760Dataset);
  $('fetchHourly').addEventListener('click', getHourlyPVGIS);
  $('activateHourly').addEventListener('click', startHourly);
  $('exitHourly').addEventListener('click', () => { state.hourlyMode = false; state.demoMode = false; estimate(); render(); toast('Preliminary monthly model restored.'); });

  // Explore & Levers
  for(const id of ['quickWins','scenarioLevers']){
    $(id).addEventListener('click', e => {
      const b = e.target.closest('[data-lever]');
      if(b) applyLever(b.dataset.lever);
    });
  }
  $('compareSizes').addEventListener('click', () => renderSizer(true));
  $('sizeComparison').addEventListener('click', e => {
    const b = e.target.closest('[data-size]');
    if(!b) return;
    const peakKw = Number(b.dataset.size), systemCost = Number(b.dataset.cost);
    writeInputs({...state.inputs, peakKw, systemCost});
    if(!state.hourlyMode){
      estimate();
    }
    render();
    go('overview');
    if(!state.hourlyMode) refreshSolar();
    toast(`Selected ${fmt(peakKw, 1)} kWp array (${curr(systemCost)}).`);
  });

  // Scenario Vault
  $('saveScenario').addEventListener('click', () => {
    if(state.saved.length >= 12) return toast('Up to 12 scenarios; export JSON first or delete old ones.');
    $('scenarioName').value = state.location + ' / ' + fmt(state.inputs.peakKw, 1) + ' kWp';
    $('saveDialog').showModal();
  });
  $('cancelSave').addEventListener('click', () => $('saveDialog').close());
  $('confirmSave').addEventListener('click', saveCurrent);
  $('scenarioList').addEventListener('click', e => {
    const b = e.target.closest('[data-restore]'), d = e.target.closest('[data-remove]');
    if(b) loadSaved(Number(b.dataset.restore));
    if(d){ state.saved.splice(Number(d.dataset.remove), 1); renderSaved(); persist(); }
  });
  $('exportProject').addEventListener('click', exportProject);
  $('importProject').addEventListener('click', () => $('projectFile').click());
  $('projectFile').addEventListener('change', e => importProject(e.target.files?.[0]));

  // Finance & Export
  for(const id of ['loanShare','loanApr','loanYears']) $(id).addEventListener('change', () => { renderFinance(); persist(); });
  $('exportCSV').addEventListener('click', exportCashCSV);
  $('topExport').addEventListener('click', exportCashCSV);
  $('printReport').addEventListener('click', () => window.print());
  $('checkAPI').addEventListener('click', checkHealth);
}

function init(){
  writeInputs({...DEFAULTS});
  bind();
  restore();
  applyTheme();
  applyLang();
  estimate();
  render();
  renderDirectory();
  renderHardware();
  const initialHash = window.location.hash.replace(/^#/, '');
  go(['overview','directory','hardware','system','energy','storage','explore','finance','evidence'].includes(initialHash) ? initialHash : 'overview', false);
  refreshSolar();
}
init();
