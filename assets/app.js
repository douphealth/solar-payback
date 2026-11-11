import { DEFAULTS, calculateFinance, calculateScenarios, compareCapacities } from '../lib/finance.mjs';

const CITIES = {
  athens: { lat: 37.9838, lon: 23.7275, en: 'Athens, Greece', el: 'Αθήνα, Ελλάδα' },
  thessaloniki: { lat: 40.6401, lon: 22.9444, en: 'Thessaloniki, Greece', el: 'Θεσσαλονίκη, Ελλάδα' },
  patras: { lat: 38.2466, lon: 21.7346, en: 'Patras, Greece', el: 'Πάτρα, Ελλάδα' },
  heraklion: { lat: 35.3387, lon: 25.1442, en: 'Heraklion, Greece', el: 'Ηράκλειο, Ελλάδα' },
  larissa: { lat: 39.6390, lon: 22.4191, en: 'Larissa, Greece', el: 'Λάρισα, Ελλάδα' },
  ioannina: { lat: 39.6650, lon: 20.8537, en: 'Ioannina, Greece', el: 'Ιωάννινα, Ελλάδα' },
  chania: { lat: 35.5138, lon: 24.0180, en: 'Chania, Greece', el: 'Χανιά, Ελλάδα' },
  kalamata: { lat: 37.0389, lon: 22.1142, en: 'Kalamata, Greece', el: 'Καλαμάτα, Ελλάδα' },
  rhodes: { lat: 36.4349, lon: 28.2176, en: 'Rhodes, Greece', el: 'Ρόδος, Ελλάδα' },
};
const GREEK = {
  workspace:'ΧΩΡΟΣ ΕΡΓΑΣΙΑΣ', navOverview:'Επισκόπηση', navProduction:'Ηλιακή παραγωγή', navReturns:'Οικονομική απόδοση', navScenarios:'Σενάρια', navSources:'Μέθοδος & πηγές',
  dataPromise:'Βασισμένο σε επαληθεύσιμα δεδομένα, όχι σε υποσχέσεις πωλήσεων.', home:'Πίνακας', studio:'Ανάλυση επένδυσης Φ/Β', export:'Εξαγωγή ανάλυσης', waiting:'Αναμονή δεδομένων',
  eyebrow:'Η ΜΗΧΑΝΗ ΗΛΙΑΚΩΝ ΑΠΟΦΑΣΕΩΝ', heroSub:'Ένας σαφέστερος τρόπος να καταλάβεις τι μπορεί πράγματι να σου εξοικονομήσει ένα φωτοβολταϊκό. Ανεξάρτητα δεδομένα. Διαφανείς παραδοχές. Μακροχρόνια εικόνα.', configure:'Ρύθμιση συστήματος', officialData:'Μοντέλο παραγωγής: Ευρωπαϊκή Επιτροπή PVGIS',
  projection:'Η ΕΚΤΙΜΩΜΕΝΗ ΑΠΟΔΟΣΗ ΣΟΥ', decisionAtGlance:'Η απόφαση με μια ματιά.', payback:'Απλή απόσβεση', paybackDesc:'Πότε το σωρευτικό ταμειακό υπόλοιπο γίνεται θετικό', netValue:'Καθαρό όφελος 25ετίας', profitDesc:'Μετά την επένδυση και τα λειτουργικά κόστη', firstYearBenefit:'Όφελος πρώτου έτους', benefitDesc:'Εξοικονόμηση + εκτιμώμενα έσοδα εξαγωγής', annualProduction:'Ετήσια ηλιακή παραγωγή', generationDesc:'Ιστορική εκτίμηση ηλιοφάνειας PVGIS',
  resourceAnalysis:'ΑΝΑΛΥΣΗ ΗΛΙΑΚΟΥ ΔΥΝΑΜΙΚΟΥ', productionTitle:'Ένα έτος ηλιοφάνειας.', productionDesc:'Εκτιμώμενη μηνιαία παραγωγή για τη θέση και τον προσανατολισμό σου.', kwhYear:'kWh / έτος', solarGeneration:'Παραγωγή ενέργειας', loadingChart:'Εδώ θα εμφανιστούν τα δεδομένα παραγωγής PVGIS.', waitingModel:'Αναμονή για PVGIS',
  financialModel:'ΟΙΚΟΝΟΜΙΚΟ ΜΟΝΤΕΛΟ 25 ΕΤΩΝ', returnsTitle:'Η μακροχρόνια εικόνα.', returnsDesc:'Σωρευτική ροή μετά την εγκατάσταση, τη συντήρηση και την προγραμματισμένη αντικατάσταση inverter.', npv:'Καθαρή παρούσα αξία', npvDesc:'Μελλοντικές ροές προεξοφλημένες σε σημερινά ευρώ', discountPayback:'Προεξοφλημένη απόσβεση', loadingCash:'Εδώ θα εμφανιστεί η ετήσια πρόβλεψη.', cumulativeCash:'Σωρευτική καθαρή ταμειακή ροή', zeroLine:'Διακεκομμένη γραμμή = απόσβεση', showAnnual:'Προβολή αναλυτικών ετήσιων ροών', year:'Έτος', produced:'Παραγωγή', saved:'Εξοικ.', exported:'Εξαγωγή €', expenses:'Κόστη', netCash:'Καθαρή ροή', cumulative:'Σύνολο',
  sensitivity:'ΕΥΑΙΣΘΗΣΙΑ, ΟΧΙ ΒΕΒΑΙΟΤΗΤΑ', scenarioTitle:'Τι γίνεται αν αλλάξουν τα δεδομένα;', scenarioDesc:'Δοκίμασε διαφορετική παραγωγή και τιμή λιανικής. Πρόκειται για σενάρια, όχι πιθανότητες.', scenariosPending:'Αποτελέσματα μετά τον υπολογισμό PVGIS.', scenarioFoot:'Συντηρητικό: παραγωγή −10%, τιμή −20% · Θετικό: παραγωγή +10%, τιμή +20%',
  sizingKicker:'ΣΥΓΚΡΙΣΗ ΜΕΓΕΘΟΥΣ ΣΥΣΤΗΜΑΤΟΣ', sizingTitle:'Μεγαλύτερο σημαίνει καλύτερο;', sizingDesc:'Σύγκρινε κατά προσέγγιση αποδόσεις με γραμμική αναγωγή της παραγωγής PVGIS.', size:'Ισχύς', outputYear:'Ετήσιες kWh', invest:'Αρχικό κόστος', sizingPending:'Υπολόγισε ένα μοντέλο για σύγκριση.', sizingWarning:'Ενδεικτικά μόνο: inverter, στέγη, όρια σύνδεσης, τιμολόγια και προσφορές διαφέρουν.',
  modelInputs:'ΠΑΡΑΜΕΤΡΟΙ ΤΟΥ ΜΟΝΤΕΛΟΥ', tailor:'Προσαρμογή στα μέτρα σου.', reset:'Επαναφορά', locationTitle:'Θέση & στέγη', locationLabel:'Τοποθεσία', latitude:'Γεωγραφικό πλάτος', longitude:'Γεωγραφικό μήκος', useMyLocation:'Χρήση τοποθεσίας συσκευής', capacity:'Ισχύς Φ/Β (kWp)', systemLoss:'Απώλειες συστήματος (%)', tilt:'Κλίση στέγης (°)', orientation:'Προσανατολισμός (°)', electricityTitle:'Ρεύμα & κόστος', annualDemand:'Ετήσια κατανάλωση (kWh)', selfUse:'Άμεση ιδιοκατανάλωση (%)', selfUseTip:'Η άμεση ιδιοκατανάλωση είναι υπόθεση, όχι ωριαία προσομοίωση.', retailRate:'Αποφευγόμενη τιμή (€/kWh)', feedIn:'Αξία εξαγωγής (€/kWh)', priceTip:'Τα €0,24 είναι μέσος δείκτης 2026 στην Ελλάδα, όχι το οριακό σου τιμολόγιο. Τα €0,06 για εξαγωγή είναι ενδεικτικά. Αντικατάστησέ τα με τους πραγματικούς όρους.', installCost:'Κόστος €/kWp', subsidy:'Επιβεβαιωμένη επιδότηση (€)', totalInstalled:'Ενδεικτικό κόστος εγκατάστασης',
  advanced:'Προχωρημένες οικονομικές παραδοχές', maintenance:'Συντήρηση (% κεφαλαίου/έτος)', degradation:'Μείωση παραγωγής (%/έτος)', priceGrowth:'Μεταβολή λιανικής (%/έτος)', exportGrowth:'Μεταβολή εξαγωγής (%/έτος)', discount:'Προεξοφλητικό επιτόκιο (%)', horizon:'Έτη ανάλυσης', replacementYear:'Έτος αλλαγής inverter', replacementCost:'Κόστος αντικατάστασης (€)', calculate:'Ανανέωση ανάλυσης',
  whySelfConsumption:'ΓΙΑΤΙ ΜΕΤΡΑ Η ΙΔΙΟΚΑΤΑΝΑΛΩΣΗ', valueMore:'Δεν έχουν όλες οι ηλιακές kWh την ίδια αξία.', usedAtHome:'Χρήση στο σπίτι', sentToGrid:'Εξαγωγή στο δίκτυο', flowDesc:'Η ενέργεια που καταναλώνεται άμεσα αποφεύγει αγορές. Η εξαγόμενη αποζημιώνεται μόνο με την τιμή που έχεις δηλώσει.',
  trustLayer:'Η ΒΑΣΗ ΤΗΣ ΑΞΙΟΠΙΣΤΙΑΣ', methodTitle:'Μάθε την προέλευση κάθε αριθμού.', methodIntro:'Η ηλιακή παραγωγή προέρχεται από ανεξάρτητο επιστημονικό μοντέλο. Τα οικονομικά αποτελέσματα είναι προσομοίωση με μεταβλητές παραδοχές — όχι προσφορά ή εγγύηση.', sourceSolarTitle:'Ηλιακό δυναμικό', sourceSolarDesc:'PVGIS 5.3 της Ευρωπαϊκής Επιτροπής, με ιστορικά δορυφορικά και μετεωρολογικά δεδομένα. Η πραγματική σκίαση και ο εξοπλισμός διαφέρουν.', sourceDoc:'Επίσημη τεκμηρίωση ↗', sourcePricesTitle:'Δείκτες τιμής ρεύματος', sourcePricesDesc:'Η Eurostat προσφέρει πλαίσιο αναφοράς, όχι υποκατάστατο της πραγματικής αποφευγόμενης χρέωσης. Τιμές, πιστώσεις και κόστη αλλάζουν.', viewData:'Δεδομένα Eurostat ↗', sourceRulesTitle:'Ελληνικό πλαίσιο', sourceRulesDesc:'Το μοντέλο διαχωρίζει ιδιοκατανάλωση και εξαγωγή. Δεν υπόσχεται net metering, σταθερές τιμές ή μη επιβεβαιωμένες επιδοτήσεις.', readMinistry:'Υπουργείο Περιβάλλοντος ↗', disclaimer:'Περιορισμοί: Χρησιμοποιείται ομοιόμορφη μηνιαία ζήτηση και εκτιμώμενο ποσοστό ιδιοκατανάλωσης, όχι ωριαία προσομοίωση. Δεν περιλαμβάνονται μπαταρίες, δάνεια, φόροι, πάγια, δυναμικές τιμές εξαγωγής, εμπόδια/σκιάσεις στέγης ή όρια δικτύου. Απαιτείται αυτοψία και έγγραφη προσφορά πριν από επένδυση.', footerTagline:'Αποφάσεις ενέργειας με γνώση.', backTop:'Επιστροφή στην αρχή ↑',
};
const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EL_MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const $ = (id) => document.getElementById(id);
const form = $('modelForm');
const solarFields = ['lat','lon','capacity','loss','angle','aspect'];
const financialFields = Object.keys(DEFAULTS);
let lang = new URLSearchParams(location.search).get('lang') === 'el' ? 'el' :
  new URLSearchParams(location.search).get('lang') === 'en' ? 'en' :
  navigator.language.toLowerCase().startsWith('el') ? 'el' : 'en';
let solar = null;
let result = null;
let loadedKey = null;
let requestSeq = 0;
let controller = null;
let timer = null;
let loading = false;
const originalEnglish = new Map([...document.querySelectorAll('[data-i18n]')].map((el) => [el, el.textContent]));
const locale = () => lang === 'el' ? 'el-GR' : 'en-GB';
const euro = (n, maximumFractionDigits = 0) => new Intl.NumberFormat(locale(), { style:'currency', currency:'EUR', maximumFractionDigits }).format(n);
const number = (n, digits = 0) => new Intl.NumberFormat(locale(), {maximumFractionDigits:digits}).format(n);
const compact = (n) => {
  const absolute = Math.abs(n);
  if (absolute >= 1_000_000) return `${number(n/1_000_000,1)}M`;
  if (absolute >= 1_000) return `${number(n/1_000,1)}k`;
  return number(n);
};
const yearsLabel = (n) => n === null ? (lang === 'el' ? 'Δεν αποσβένεται' : 'Not reached') : `${number(n,1)} ${lang === 'el' ? 'έτη' : 'yrs'}`;
function setText(id, value) { $(id).textContent = value; }
function status(message, type='') { const el = $('formStatus'); el.textContent = message; el.className = `form-status ${type}`; }
function providerBadge(message, type='') { $('sourceBadge').dataset.state = type; setText('sourceBadgeLabel',message); }

function applyLanguage() {
  document.documentElement.lang = lang;
  for (const [el, english] of originalEnglish.entries()) {
    if (el.id === 'heroTitle') {
      el.innerHTML = lang === 'el' ? 'Άσε τον ήλιο<br><em>να δουλέψει για σένα.</em>' : 'Make the sun<br><em>work for you.</em>';
    } else {
      el.textContent = lang === 'el' ? (GREEK[el.dataset.i18n] || english) : english;
    }
  }
  setText('languageLabel', lang === 'el' ? 'English' : 'Ελληνικά');
  renderLocation();
  if (result) renderResult();
  else if (!loading) providerBadge(lang === 'el' ? 'Αναμονή δεδομένων' : 'Awaiting solar data');
}

function readModel() {
  const entries = Object.fromEntries(financialFields.map((key) => [key, Number(form.elements.namedItem(key)?.value)]));
  if (financialFields.some((key) => !form.elements.namedItem(key) || String(form.elements.namedItem(key).value).trim() === '')) {
    throw new Error(lang === 'el' ? 'Συμπλήρωσε όλα τα οικονομικά πεδία.' : 'Fill in all required financial fields.');
  }
  return entries;
}
function readSolar() {
  const fields = {};
  for (const key of solarFields) {
    const element = $(key);
    if (element.value.trim() === '') throw new Error(`${key}: ${lang === 'el' ? 'λείπει τιμή' : 'value required'}`);
    fields[key] = Number(element.value);
  }
  if (fields.lat < -90 || fields.lat > 90 || fields.lon < -180 || fields.lon > 180 ||
      fields.capacity < .1 || fields.capacity > 1000 || fields.loss < 0 || fields.loss > 45 ||
      fields.angle < 0 || fields.angle > 90 || fields.aspect < -180 || fields.aspect > 180 ||
      Object.values(fields).some((x) => !Number.isFinite(x))) {
    throw new Error(lang === 'el' ? 'Μη έγκυρη γεωγραφική θέση ή παράμετροι στέγης.' : 'Invalid coordinates or roof parameters.');
  }
  return fields;
}
function solarKey(value) { return solarFields.map((key) => Number(value[key].toFixed(5))).join('|'); }
function renderLocation() {
  const city = CITIES[$('city').value];
  setText('projectLocation', city ? city[lang] : (lang === 'el' ? 'Προσαρμοσμένη τοποθεσία' : 'Custom location'));
  setText('projectSize', `${number(Number($('capacity').value) || 0,1)} kWp`);
  const lat = Number($('lat').value), lon = Number($('lon').value);
  setText('heroLocation', `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'} / ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`);
  const installed = Number($('capacity').value) * Number($('costPerKw').value);
  setText('estimatedCost', Number.isFinite(installed) && installed >= 0 ? euro(installed) : '—');
}
function emptyResults() {
  result = null;
  for (const id of ['metricPayback','metricProfit','metricBenefit','metricGeneration','metricNpv','metricDiscPayback','chartAnnual','bestMonth','directEnergy','exportEnergy']) setText(id,'—');
  setText('metricPaybackUnit','');setText('metricKwh','');
  $('productionChart').innerHTML = `<div class="chart-placeholder">${lang === 'el' ? 'Αναμονή για επαληθευμένα δεδομένα παραγωγής.' : 'Waiting for verified solar yield data.'}</div>`;
  $('cashChart').innerHTML = `<div class="chart-placeholder">${lang === 'el' ? 'Η οικονομική ανάλυση θα εμφανιστεί εδώ.' : 'Financial projections will appear here.'}</div>`;
  $('scenarios').innerHTML = `<div class="chart-placeholder">${lang === 'el' ? 'Αναμονή PVGIS' : 'Awaiting PVGIS'}</div>`;
  $('annualTable').replaceChildren();
  $('sizingTable').innerHTML = `<tr><td colspan="5" class="empty-cell">${lang === 'el' ? 'Δεν υπάρχουν ακόμη δεδομένα' : 'No solar model loaded yet'}</td></tr>`;
  $('exportButton').disabled = true;
}
function renderProduction(monthly) {
  const highest = Math.max(...monthly, 1);
  const months = lang === 'el' ? EL_MONTHS : EN_MONTHS;
  const chart = $('productionChart');
  chart.replaceChildren();
  monthly.forEach((kwh, i) => {
    const column = document.createElement('div'); column.className = 'chart-col';
    column.title = `${months[i]}: ${number(kwh)} kWh`;
    column.setAttribute('aria-label', column.title);
    const track = document.createElement('div'); track.className = 'bar-track';
    const bar = document.createElement('div'); bar.className = 'bar-inner';
    bar.style.height = `${100*kwh/highest}%`;
    track.append(bar);
    const month = document.createElement('span'); month.className = 'bar-month'; month.textContent = months[i];
    column.append(track, month);chart.append(column);
  });
  const index = monthly.indexOf(Math.max(...monthly));
  setText('bestMonth', `${lang === 'el' ? 'Καλύτερος μήνας' : 'Peak month'}: ${months[index]} · ${number(monthly[index])} kWh`);
}
function cashSVG(model) {
  const W=740,H=231,L=60,R=15,T=15,B=32;
  const points=[{year:0,cumulative:-model.netCost},...model.flows];
  const vals=points.map((x)=>x.cumulative);
  const lo=Math.min(...vals,0), hi=Math.max(...vals,0), span=Math.max(hi-lo,1);
  const min=lo-span*.12, max=hi+span*.12, x=(yr)=>L+yr/model.config.years*(W-L-R), y=(v)=>T+(max-v)/(max-min)*(H-T-B);
  const line=points.map((p,i)=>`${i?'L':'M'}${x(p.year).toFixed(2)},${y(p.cumulative).toFixed(2)}`).join(' ');
  const area=`${line} L${x(model.config.years).toFixed(2)},${y(min).toFixed(2)} L${x(0).toFixed(2)},${y(min).toFixed(2)} Z`;
  const grid=[0,.25,.5,.75,1].map((f)=>{
    const v=min+(max-min)*f, yy=y(v).toFixed(2);
    return `<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#e9eee9" stroke-width="1"/><text x="${L-10}" y="${Number(yy)+4}" text-anchor="end" fill="#91a098" font-size="10">${compact(v)}</text>`;
  }).join('');
  const steps=[0,Math.round(model.config.years*.2),Math.round(model.config.years*.4),Math.round(model.config.years*.6),Math.round(model.config.years*.8),model.config.years];
  const ticks=steps.map((v)=>`<text x="${x(v).toFixed(2)}" y="${H-8}" text-anchor="middle" fill="#91a098" font-size="10">${v}</text>`).join('');
  const zeroy=y(0).toFixed(2);
  const end=points.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${lang === 'el' ? 'Σωρευτική ροή ανά έτος' : 'Cumulative cash flow by year'}">
    <defs><linearGradient id="cashShade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b2d78c" stop-opacity=".45"/><stop offset="1" stop-color="#ebf4df" stop-opacity=".04"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#cashShade)"/><line x1="${L}" x2="${W-R}" y1="${zeroy}" y2="${zeroy}" stroke="#9bae91" stroke-dasharray="5 5" stroke-width="1.5"/>
    <path d="${line}" fill="none" stroke="#7fa656" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(end.year)}" cy="${y(end.cumulative)}" r="5.5" fill="#476e3c" stroke="white" stroke-width="3"/>${ticks}</svg>`;
}
function renderCash(model) {
  $('cashChart').innerHTML = cashSVG(model);
  const tbody=$('annualTable'); tbody.replaceChildren();
  for (const yr of model.flows) {
    const row=document.createElement('tr');
    const parts=[yr.year,number(yr.production),euro(yr.billSavings),euro(yr.exportRevenue),euro(yr.maintenance+yr.replacement),euro(yr.net),euro(yr.cumulative)];
    parts.forEach((part)=>{const td=document.createElement('td');td.textContent=part;row.append(td);});
    tbody.append(row);
  }
}
function renderScenarios(model) {
  const scenarios=calculateScenarios(solar.monthly.map((m)=>m.kwh),model.config);
  $('scenarios').replaceChildren();
  const labels=lang==='el' ? ['Συντηρητικό','Βασικό','Θετικό'] : ['Cautious','Base case','Upside'];
  const badges=lang==='el' ? ['−10% / −20%','Αρχικές παραδοχές','+10% / +20%'] : ['−10% / −20%','Current assumptions','+10% / +20%'];
  scenarios.forEach((s,i)=>{
    const card=document.createElement('div');card.className=`scenario-card ${s.id}`;
    const name=document.createElement('span');name.className='scenario-title';name.textContent=labels[i];
    const cash=document.createElement('strong');cash.textContent=euro(s.result.totalProfit);
    const desc=document.createElement('small');desc.textContent=lang==='el' ? 'Καθαρό κέρδος ορίζοντα' : 'Lifetime net profit';
    const mark=document.createElement('span');mark.className='scenario-flag';mark.textContent=badges[i];
    const pay=document.createElement('small');pay.textContent=`${lang==='el'?'Απόσβεση':'Payback'}: ${yearsLabel(s.result.simplePayback)}`;
    card.append(name,cash,desc,mark,pay);$('scenarios').append(card);
  });
}
function renderSizing(model) {
  const candidates=[3,4,5,6,8,10,model.config.capacity].filter((n,i,arr)=>arr.indexOf(n)===i).sort((a,b)=>a-b);
  const results=compareCapacities(solar.monthly.map((m)=>m.kwh),model.config,candidates);
  const tbody=$('sizingTable');tbody.replaceChildren();
  results.forEach(({capacity,result:r})=>{
    const row=document.createElement('tr');if(Math.abs(capacity-model.config.capacity)<.00001) row.className='selected-row';
    [number(capacity,1)+' kWp',number(r.annualKwh)+' kWh',euro(r.netCost),yearsLabel(r.simplePayback),euro(r.totalProfit)].forEach((text)=>{const td=document.createElement('td');td.textContent=text;row.append(td);});
    tbody.append(row);
  });
}
function renderResult() {
  if (!solar) return;
  try { result=calculateFinance(solar.monthly.map((x)=>x.kwh),readModel()); }
  catch (error) { emptyResults();status(error.message,'error');return; }
  const m=result;
  setText('metricPayback', m.simplePayback===null?(lang==='el'?'Πέρα από τον ορίζοντα':'Not reached'):number(m.simplePayback,1));
  setText('metricPaybackUnit',m.simplePayback===null?'':lang==='el'?'έτη':'years');
  setText('metricProfit',euro(m.totalProfit));
  setText('metricBenefit',euro(m.firstYear.benefit));
  setText('metricGeneration',number(m.annualKwh));
  setText('metricKwh','kWh');
  setText('chartAnnual',number(m.annualKwh));
  setText('metricNpv',euro(m.npv));
  setText('metricDiscPayback',yearsLabel(m.discountedPayback));
  setText('directEnergy',`${number(m.firstYear.consumed)} kWh`);
  setText('exportEnergy',`${number(m.firstYear.exported)} kWh`);
  setText('datasetLabel',solar.dataset);
  renderProduction(solar.monthly.map((x)=>x.kwh));renderCash(m);renderScenarios(m);renderSizing(m);
  const span=solar.weatherPeriod.from&&solar.weatherPeriod.to?`${solar.weatherPeriod.from}–${solar.weatherPeriod.to}`:'';
  providerBadge(`PVGIS 5.3 · ${span || (lang==='el'?'Επαληθευμένο':'Verified')}`,'live');
  $('exportButton').disabled=false;
  status(lang==='el' ? 'Η ανάλυση ενημερώθηκε με δεδομένα PVGIS.' : 'Analysis updated with PVGIS data.','success');
}

async function loadSolar() {
  clearTimeout(timer);
  let params;
  try {
    params=readSolar();
    readModel(); // basic field completeness; full financial model validates after loading
  } catch (error) {
    if (controller) controller.abort();
    solar=null;loadedKey=null;emptyResults();status(error.message,'error');providerBadge(lang==='el'?'Μη έγκυρα στοιχεία':'Invalid inputs','error');return;
  }
  renderLocation();
  const key=solarKey(params);
  if (solar && loadedKey===key) {renderResult();return;}
  if (controller) controller.abort();
  controller=new AbortController();
  const sequence=++requestSeq;
  solar=null;loadedKey=null;emptyResults();loading=true;
  providerBadge(lang==='el'?'Ανάκτηση PVGIS…':'Fetching PVGIS…');
  status(lang==='el'?'Ανάκτηση επίσημου μοντέλου παραγωγής…':'Requesting independent solar-production estimates…');
  $('runButton').disabled=true;
  const query=new URLSearchParams({ lat:params.lat,lon:params.lon,peakpower:params.capacity,loss:params.loss,angle:params.angle,aspect:params.aspect });
  try {
    const resp=await fetch(`/api/solar?${query.toString()}`,{signal:controller.signal,headers:{Accept:'application/json'}});
    const json=await resp.json().catch(()=>({}));
    if (!resp.ok) throw new Error(json.error || (resp.status===404?'Cloudflare Pages Functions are required for PVGIS access.':`PVGIS request failed (${resp.status})`));
    if (!Array.isArray(json.monthly) || json.monthly.length!==12 || json.monthly.some((row)=>!Number.isFinite(row.kwh))) throw new Error('PVGIS produced invalid monthly data');
    if (sequence!==requestSeq) return;
    solar=json;loadedKey=key;renderResult();
  } catch (error) {
    if (sequence!==requestSeq || error.name==='AbortError') return;
    solar=null;loadedKey=null;emptyResults();
    providerBadge(lang==='el'?'PVGIS εκτός σύνδεσης':'PVGIS unavailable','error');
    status(`${error.message}. ${lang==='el'?'Δεν εμφανίζονται εικονικά αποτελέσματα. Δοκίμασε ξανά.':'No fabricated results are shown. Retry later.'}`,'error');
  } finally { if(sequence===requestSeq){loading=false;$('runButton').disabled=false;} }
}
function changed(event) {
  renderLocation();
  const name=event.target?.name;
  if (solarFields.includes(name)) {
    let key;
    try {key=solarKey(readSolar());}catch{key=null;}
    if (key!==loadedKey) {
      // Invalidate in-flight work immediately; an older response must never
      // render against newly edited roof inputs during the debounce window.
      if (controller) controller.abort();
      requestSeq++;
      loading=false;
      $('runButton').disabled=false;
      solar=null;loadedKey=null;emptyResults();
      providerBadge(lang==='el'?'Αλλαγή ηλιακού μοντέλου':'Solar model changed');
      status(lang==='el'?'Οι αλλαγές ηλιακού συστήματος απαιτούν νέο μοντέλο PVGIS.':'Solar configuration changed. Recomputing source data…');
      clearTimeout(timer);timer=setTimeout(loadSolar,850);
      return;
    }
  }
  if (solar) renderResult();
}
function locationChange() {
  const place=CITIES[$('city').value];
  if (place) { $('lat').value=place.lat;$('lon').value=place.lon; }
  renderLocation();changed({target:{name:'lat'}});
}
function setCustomLocation() {
  $('city').value='custom';renderLocation();
}
function csvCell(value) { return `"${String(value??'').replaceAll('"','""')}"`; }
function exportCsv() {
  if (!result||!solar)return;
  const m=result;
  const rows=[
    ['Helios / Solar payback analysis',''],['Data source',solar.provider],['PVGIS version',solar.version],
    ['PVGIS dataset',solar.dataset],['Historical weather start',solar.weatherPeriod.from],['Historical weather end',solar.weatherPeriod.to],
    ['Retrieved UTC',solar.retrievedAt],['Latitude',solar.inputs.lat],['Longitude',solar.inputs.lon],
    ...Object.entries(m.config),['First-year solar production (kWh)',m.annualKwh],['Upfront cost after grant (EUR)',m.netCost],
    ['Simple payback (years)',m.simplePayback??'Not reached'],['Discounted payback (years)',m.discountedPayback??'Not reached'],
    ['Lifetime net profit (EUR)',m.totalProfit],['Net present value (EUR)',m.npv],['LCOE (EUR/kWh)',m.lcoe],[],
    ['Month','Year-one production kWh','Direct use kWh','Export kWh','Grid imports kWh'],
    ...m.monthly.map((r,i)=>[i+1,r.generation,r.consumed,r.exported,r.imported]),[],
    ['Year','Production kWh','Direct use kWh','Export kWh','Bill savings EUR','Export revenue EUR','O&M EUR','Inverter EUR','Net cash EUR','Cumulative EUR'],
    ...m.flows.map((r)=>[r.year,r.production,r.consumed,r.exported,r.billSavings,r.exportRevenue,r.maintenance,r.replacement,r.net,r.cumulative]),[],
    ['Model caveat','Annual monthly demand treated as uniform; self-consumption is a user assumption; no hourly matching, tax, finance, battery or fixed utility fees.'],
  ];
  const csv='\ufeff'+rows.map((row)=>row.map(csvCell).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='helios-solar-analysis.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
function reset() {
  clearTimeout(timer);if (controller) controller.abort();
  form.reset();$('city').value='athens';locationChange();
  status(lang==='el'?'Επαναφέρθηκαν οι αρχικές παραδοχές.':'Default assumptions restored.');
}
function applyURL() {
  const params=new URLSearchParams(location.search);
  for (const name of [...solarFields,...financialFields]) {
    if (!params.has(name)) continue;
    const elem=form.elements.namedItem(name);
    const val=params.get(name);
    if (elem && val!=='' && Number.isFinite(Number(val))) elem.value=val;
  }
  const city=params.get('city');
  if (city==='custom'||(!city && (params.has('lat')||params.has('lon')))) $('city').value='custom';
  else if (city && CITIES[city]) $('city').value=city;
}

$('languageToggle').addEventListener('click',()=>{lang=lang==='en'?'el':'en';applyLanguage();});
$('exportButton').addEventListener('click',exportCsv);
$('resetButton').addEventListener('click',reset);
$('city').addEventListener('change',locationChange);
$('lat').addEventListener('input',setCustomLocation);
$('lon').addEventListener('input',setCustomLocation);
form.addEventListener('input',changed);
form.addEventListener('change',(event)=>{if(event.target.id!=='city')changed(event);});
form.addEventListener('submit',(event)=>{event.preventDefault();loadSolar();});
$('geolocate').addEventListener('click',()=>{
  if (!navigator.geolocation){status(lang==='el'?'Η συσκευή δεν υποστηρίζει γεωεντοπισμό.':'Geolocation unavailable on this device.','error');return;}
  status(lang==='el'?'Αναμονή άδειας τοποθεσίας…':'Waiting for location permission…');
  navigator.geolocation.getCurrentPosition(({coords})=>{
    $('lat').value=coords.latitude.toFixed(5);$('lon').value=coords.longitude.toFixed(5);
    setCustomLocation();changed({target:{name:'lat'}});
  },()=>status(lang==='el'?'Δεν δόθηκε πρόσβαση τοποθεσίας. Βάλε συντεταγμένες χειροκίνητα.':'Location permission unavailable. Enter coordinates manually.','error'),{timeout:10000,maximumAge:300000});
});
const sections=[...document.querySelectorAll('.side-nav a')];
if ('IntersectionObserver' in window) {
  const observer=new IntersectionObserver((items)=>{
    for(const item of items) if(item.isIntersecting){sections.forEach((a)=>a.classList.toggle('active',a.hash==='#'+item.target.id));}
  },{rootMargin:'-15% 0px -72% 0px'});
  for(const a of sections){const target=document.querySelector(a.hash);if(target)observer.observe(target);}
}
applyURL();applyLanguage();renderLocation();emptyResults();loadSolar();
