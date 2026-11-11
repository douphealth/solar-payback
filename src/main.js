import {DEFAULTS, MONTHS, validateInputs, calculateForecast, asCSV, solarSignature} from './engine.js';

const $ = id => document.getElementById(id);
const form = $('projectForm');
const numericFields = Object.keys(DEFAULTS).filter(k => typeof DEFAULTS[k] === 'number');
const locations = {
  athens: {lat:37.9838,lon:23.7275,name:'Athens, Greece'},
  london: {lat:51.5074,lon:-0.1278,name:'London, United Kingdom'},
  losangeles: {lat:34.0522,lon:-118.2437,name:'Los Angeles, United States'}
};
const EL = {
  navCalculator:'Υπολογιστής',navMethod:'Μεθοδολογία',navSources:'Πηγές δεδομένων',download:'Εξαγωγή CSV',
  heroKicker:'Η ΗΛΙΑΚΗ ΕΠΕΝΔΥΣΗ ΣΟΥ, ΧΩΡΙΣ ΑΣΑΦΕΙΕΣ',
  heroTitle:'Δες καθαρά <em>τι αποδίδει ο ήλιος.</em>',
  heroText:'Υπολόγισε την παραγωγή των φωτοβολταϊκών, πότε αποσβένεται η επένδυση και πώς κάθε παραδοχή μεταβάλλει την απόδοση.',
  trustJrc:'Ηλιακά δεδομένα Ευρωπαϊκής Επιτροπής',trustMath:'Διαφανές οικονομικό μοντέλο',trustPrivacy:'Χωρίς εγγραφή',
  workbench:'01 / ΤΟ ΕΡΓΑΛΕΙΟ',calculatorTitle:'Δημιούργησε το σενάριό σου',calculatorSubtitle:'Οι παραδοχές αριστερά. Η οικονομική εικόνα δεξιά.',
  yourProject:'ΤΟ ΕΡΓΟ ΣΟΥ',projectSettings:'Στοιχεία εγκατάστασης',locationTitle:'Τοποθεσία',findPlace:'Βρες την πόλη σου',searchPlaceholder:'Αναζήτηση πόλης ή περιοχής',
  latitude:'Γεωγραφικό πλάτος',longitude:'Γεωγραφικό μήκος',quickLocations:'Ενδεικτικές πόλεις',
  systemTitle:'Φωτοβολταϊκή εγκατάσταση',systemPower:'Ισχύς συστήματος (kWp)',systemLoss:'Απώλειες συστήματος (%)',tilt:'Κλίση πάνελ (°)',orientation:'Προσανατολισμός (°)',mounting:'Τύπος στήριξης',
  householdTitle:'Η κατανάλωσή σου',annualUse:'Ετήσια κατανάλωση (kWh)',loadProfile:'Εποχική κατανάλωση',selfUse:'Παραγωγή που καταναλώνεις επί τόπου',
  selfUseHint:'Εκτίμηση ταυτόχρονης χρήσης, με ανώτατο όριο τη μηνιαία κατανάλωση. Δεν είναι μετρημένη χρήση.',
  economicsTitle:'Οικονομικά στοιχεία',currency:'Νόμισμα (χωρίς αυτόματη μετατροπή)',installationCost:'Κόστος εγκατάστασης',grant:'Επιδότηση',importRate:'Τιμή αγοράς / kWh',exportRate:'Αποζημίωση έγχυσης / kWh',
  priceDisclaimer:'Τα αρχικά ποσά και οι τιμές ρεύματος είναι ενδεικτικά, όχι τρέχουσες προσφορές. Βάλε τις πραγματικές τιμές του συμβολαίου σου.',
  advanced:'Προχωρημένες παραδοχές',maintenance:'Ετήσια συντήρηση',insurance:'Ετήσια ασφάλιση',replacementYear:'Αλλαγή inverter (έτος)',replacementCost:'Κόστος αλλαγής',
  degradation:'Ετήσια υποβάθμιση πάνελ %',lifetime:'Διάρκεια επένδυσης (έτη)',priceIncrease:'Μεταβολή τιμής αγοράς %/έτος',exportIncrease:'Μεταβολή αποζημίωσης %/έτος',
  expenseIncrease:'Μεταβολή λειτουργικού κόστους %/έτος',discount:'Προεξοφλητικό επιτόκιο %',carbonIntensity:'Εκτιμώμενες εκπομπές δικτύου (kg CO₂/kWh)',
  calculate:'Υπολόγισε την απόσβεση',privacyNote:'Χωρίς σύνδεση. Οι ρυθμίσεις μένουν σε αυτόν τον browser· οι συντεταγμένες αποστέλλονται στο PVGIS μόνο για υπολογισμό.',
  yourAnalysis:'Η ΑΝΑΛΥΣΗ ΣΟΥ',financialPicture:'Η οικονομική εικόνα των φωτοβολταϊκών',pending:'Αναμονή δεδομένων',verified:'Επιβεβαιωμένα δεδομένα PVGIS',errorBadge:'Πηγή μη διαθέσιμη',
  paybackLabel:'Χρόνος απόσβεσης',paybackAwait:'Όταν η συσσωρευμένη ροή γίνει θετική',firstSavings:'Καθαρή ροή 1ου έτους',cashflowHint:'Μετά τα λειτουργικά κόστη',
  annualOutput:'Παραγωγή 1ου έτους',fromJrc:'Από μοντέλο PVGIS',npvLabel:'Καθαρή παρούσα αξία',npvHint:'Προεξοφλημένες ροές μείον αρχική επένδυση',
  energyProduction:'ΠΑΡΑΓΩΓΗ ΕΝΕΡΓΕΙΑΣ',monthlyProduction:'Μηνιαία παραγωγή',financialTrajectory:'ΟΙΚΟΝΟΜΙΚΗ ΠΟΡΕΙΑ',cumulativeCashflow:'Σωρευτική ροή',
  chartPending:'Η επαληθευμένη παραγωγή θα εμφανιστεί εδώ.',yearOne:'Τυπικό πρώτο έτος, χωρίς μελλοντική υποβάθμιση',cashflowFootnote:'Χωρίς προεξόφληση · κόστος εγκατάστασης στο έτος μηδέν',
  electricityFlows:'ΡΟΕΣ ΕΝΕΡΓΕΙΑΣ',whereEnergyGoes:'Πού πηγαίνει η ενέργεια',selfConsumed:'Ιδιοκατανάλωση',usedAtHome:'Χρήση στο σπίτι',sentToGrid:'Προς το δίκτυο',annualDemand:'Ετήσια κατανάλωση',
  energyNote:'Μηνιαία προσέγγιση με παραδοχή ιδιοκατανάλωσης, όχι ωριαία προσομοίωση.',investmentEconomics:'ΟΙΚΟΝΟΜΙΚΑ ΕΡΓΟΥ',behindReturn:'Ανάλυση απόδοσης',
  netUpfront:'Αρχικό κόστος μετά την επιδότηση',avoidedBills:'Αποφυγή αγορών 1ου έτους',exportIncome:'Έσοδα έγχυσης 1ου έτους',discountedPayback:'Προεξοφλημένη απόσβεση',lcoe:'Κόστος ανά παραγόμενη kWh',
  confidence:'ΠΩΣ ΜΕΤΑΒΑΛΛΕΤΑΙ',sensitivityTitle:'Αν αλλάξει η ηλιοφάνεια;',scenario:'ΥΠΟΘΕΤΙΚΟ ±10%',lowerYield:'10% λιγότερη παραγωγή',baseYield:'Βάση PVGIS',higherYield:'10% περισσότερη παραγωγή',
  sensitivityNote:'Υποθετική μεταβολή παραγωγής, όχι στατιστικό διάστημα εμπιστοσύνης.',decisionNotes:'ΣΗΜΕΙΩΣΕΙΣ ΑΠΟΦΑΣΗΣ',readTheFinePrint:'Τι να προσέξεις',
  insightsPending:'Ολοκλήρωσε έναν υπολογισμό για να δεις τις βασικές παραδοχές.',annualSchedule:'Αναλυτικές ταμειακές ροές ανά έτος',tableCaption:'Ετήσια παραγωγή, εξοικονόμηση και απόδοση',
  year:'Έτος',generation:'Παραγωγή',selfUsed:'Ιδιοκατανάλωση',export:'Έγχυση',billAvoidance:'Αποφυγή κόστους',exportCredit:'Έσοδα έγχυσης',netFlow:'Καθαρή ροή',cumulative:'Σωρευτικά',
  dataProvenance:'Προέλευση δεδομένων',provenancePending:'Δεν ολοκληρώθηκε ακόμη υπολογισμός PVGIS. Οι ενδεικτικές τιμές ρεύματος δεν είναι ζωντανά δεδομένα.',
  transparentMethod:'ΔΙΑΦΑΝΕΙΑ ΣΤΟΝ ΥΠΟΛΟΓΙΣΜΟ',methodTitle:'Μια αξιόπιστη πρόβλεψη <em>δείχνει τη μέθοδό της.</em>',
  methodSubtitle:'Η φυσική της ηλιακής παραγωγής και τα οικονομικά ενός νοικοκυριού έχουν διαφορετικές πηγές. Ο διαχωρισμός είναι ρητός.',
  solarData:'ΗΛΙΑΚΑ ΔΕΔΟΜΕΝΑ',householdData:'ΔΙΚΑ ΣΟΥ ΣΤΟΙΧΕΙΑ',cashflowData:'ΜΟΝΤΕΛΟ ΕΤΩΝ',
  methodOneTitle:'Τοποθεσία, όχι εικασίες.',methodOneBody:'Το PVGIS της Ευρωπαϊκής Επιτροπής υπολογίζει τυπική παραγωγή με βάση συντεταγμένες, προσανατολισμό και ιστορικές μετεωρολογικές καταγραφές.',
  methodTwoTitle:'Οι δικοί σου λογαριασμοί.',methodTwoBody:'Εσύ ορίζεις τιμές αγοράς και έγχυσης, κατανάλωση, ιδιοκατανάλωση και κόστος. Δεν εμφανίζονται ως επαληθευμένες τιμές παρόχου.',
  methodThreeTitle:'Κάθε έτος μετράει.',methodThreeBody:'Ο υπολογισμός περιλαμβάνει φθορά πάνελ, συντήρηση, αλλαγή inverter, αυξήσεις κόστους, προεξόφληση και έσοδα έγχυσης.',
  footerPitch:'Καλύτερες αποφάσεις, με καθαρή εικόνα.',sourceLabel:'ΕΠΙΣΗΜΑ ΔΕΔΟΜΕΝΑ & ΤΕΚΜΗΡΙΩΣΗ',
  footerCaveat:'Οι προβλέψεις είναι ενδεικτικές. Δεν αποτελούν εγγύηση παραγωγής, τιμής ρεύματος, επιδότησης ή επενδυτικής απόδοσης. Έλεγξε το τοπικό καθεστώς και προσφορές εγκαταστατών.',
  years:'έτη',notWithin:'Όχι σε',notRecovered:'Χωρίς απόσβεση μέσα σε',calculating:'Λήψη και επαλήθευση μηνιαίας παραγωγής από το PVGIS της Ευρωπαϊκής Επιτροπής…',
  successText:'Πραγματικά δεδομένα PVGIS φορτώθηκαν. Τα ποσά υπολογίζονται με τις δικές σου οικονομικές παραδοχές.',
  initialText:'Φορτώνεται ενδεικτικό σενάριο Αθήνας από την επίσημη υπηρεσία PVGIS. Μπορείς να αλλάξεις τις παραδοχές.',
  staleText:'Άλλαξαν τα στοιχεία ηλιακής εγκατάστασης. Πάτησε Υπολογισμός για νέα στοιχεία PVGIS.',
  changeFinance:'Τα οικονομικά ενημερώθηκαν χωρίς νέα κλήση στο PVGIS.',
  cannotLoad:'Το PVGIS δεν επέστρεψε επαληθεύσιμα δεδομένα. Δεν εμφανίζεται κατασκευασμένη εκτίμηση. Δοκίμασε ξανά.',
  findError:'Δεν βρέθηκαν πόλεις. Μπορείς να εισαγάγεις συντεταγμένες.',searchMore:'Πληκτρολόγησε τουλάχιστον δύο χαρακτήρες.',
  inputError:'Έλεγξε τα πεδία: ',notAvailable:'—',scenarioPeriod:'έτη',
  sourcePvgis:'PVGIS 5.3 · Ευρωπαϊκή Επιτροπή',locationManual:'Προσαρμοσμένες συντεταγμένες',
  notedSelfUse:'Η ιδιοκατανάλωση είναι δική σου παραδοχή και περιορίζεται από τη μηνιαία ζήτηση. Η πραγματική ταυτοχρονία απαιτεί ωριαίες μετρήσεις.',
  notedContracts:'Οι τιμές αγοράς και έγχυσης δεν ανακτώνται από παρόχους. Πρέπει να συμφωνούν με την τιμολόγηση και το τοπικό καθεστώς συμψηφισμού.',
  notedReplacement:'Έχει υπολογιστεί εφάπαξ αντικατάσταση inverter στο έτος ',
  notedWeather:'Το PVGIS υπολογίζει τυπική παραγωγή με βάση ιστορικό κλίμα, όχι εγγύηση για κάθε μελλοντικό έτος. Το ±10% είναι μόνο δοκιμή ευαισθησίας.',
  notedEmission:'Ο εκτιμώμενος αντίκτυπος εκπομπών είναι ',notAQuote:'Δεν είναι πιστοποιημένο αποτύπωμα· βασίζεται σε σταθερό συντελεστή που δίνεις εσύ.',
  sample:'Ενδεικτικό σενάριο',monthlyLabels:['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ']
};
const EN_DYNAMIC={years:'years',notWithin:'Not within',notRecovered:'No payback within',calculating:'Retrieving and validating monthly production from the European Commission PVGIS service…',
  successText:'PVGIS production data loaded. Financial outcomes use your own editable assumptions.',
  initialText:'Calculating an example Athens scenario using official PVGIS data. You can change any input.',
  staleText:'Solar system parameters changed. Run a new PVGIS calculation to refresh these results.',
  changeFinance:'Financial assumptions updated; the same verified PVGIS solar data was reused.',
  cannotLoad:'PVGIS has not supplied validated data. No synthetic solar estimate is shown. Please retry.',
  findError:'No matching city found. You can enter coordinates directly.',searchMore:'Enter at least two characters.',inputError:'Check input: ',
  sourcePvgis:'PVGIS 5.3 · European Commission',locationManual:'Custom coordinates',
  notedSelfUse:'The self-consumption fraction is your assumption, capped by monthly household demand. An actual load/PV match requires hourly meter readings.',
  notedContracts:'Grid and export rates are not retrieved from a supplier. Enter your own tariff and confirm the local net-billing or net-metering rules.',
  notedReplacement:'A one-time inverter replacement is included in year ',
  notedWeather:'PVGIS provides typical historical-climate production, not guaranteed future weather. ±10% is a sensitivity exercise, not a confidence interval.',
  notedEmission:'Illustrative lifecycle grid-emissions displacement is ',notAQuote:'It is not a verified footprint; it assumes your fixed grid-emissions factor.',
  sample:'Example scenario',monthlyLabels:MONTHS
};
let language = (navigator.language || '').toLowerCase().startsWith('el') ? 'el' : 'en';
let result = null, dataset = null, dataSignature = null, requestCounter = 0, activeController = null;
let locationName = DEFAULTS.location;
const t = key => (language==='el' ? EL[key] : EN_DYNAMIC[key]) ?? key;
const locale = () => language==='el' ? 'el-GR' : 'en-GB';
const number = (v,maximumFractionDigits=0) => new Intl.NumberFormat(locale(),{maximumFractionDigits}).format(v);
const money = (v, digits=0) => {const opts={style:'currency',currency:readCurrency(),minimumFractionDigits:digits,maximumFractionDigits:digits};return new Intl.NumberFormat(locale(),opts).format(v)};
function readCurrency(){return form.elements.currency.value || 'EUR'}
function payback(v, life){return v===null ? `${t('notWithin')} ${life} ${t('years')}` : `${number(v,1)} ${t('years')}`;}

function applyTranslations(){
 document.documentElement.lang=language;
 document.querySelectorAll('[data-i18n]').forEach(el=>{const translation=language==='el'?EL[el.dataset.i18n]:null;
  if (translation!==undefined) el.textContent=translation; else if(el.dataset.originalText!==undefined) el.textContent=el.dataset.originalText;
 });
 document.querySelectorAll('[data-i18n-html]').forEach(el=>{if(language==='el')el.innerHTML=EL[el.dataset.i18nHtml];else el.innerHTML=el.dataset.originalHtml;});
 document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=language==='el'?EL[el.dataset.i18nPlaceholder]:el.dataset.originalPlaceholder;});
 const selectLabels={usageProfile:{flat:['Even across the year','Σταθερή όλο το έτος'],summer:['Higher in summer','Υψηλότερη το καλοκαίρι'],winter:['Higher in winter','Υψηλότερη τον χειμώνα']},
  mounting:{free:['Ventilated / free-standing','Αεριζόμενα / ελεύθερη στήριξη'],building:['Building-integrated','Ενσωματωμένα στη στέγη']},
  aspect:{'0':['South · 0°','Νότος · 0°'],'-45':['South-east · −45°','Νοτιοανατολικά · −45°'],'45':['South-west · +45°','Νοτιοδυτικά · +45°'],'-90':['East · −90°','Ανατολή · −90°'],'90':['West · +90°','Δύση · +90°'],'180':['North · 180°','Βορράς · 180°']}};
 for(const [id,values] of Object.entries(selectLabels)) for(const opt of form.elements[id].options){const labels=values[opt.value];if(labels)opt.textContent=labels[language==='el'?1:0];}
 $('languageToggle').textContent=language==='el'?'EN':'ΕΛ';
 $('selfUseOutput').textContent=`${form.elements.selfUsePct.value}%`;
 if(result)renderForecast(result);else if(!dataset)resetVisuals();
}
function serialize(){const input={};for(const key of numericFields) input[key]=Number(form.elements[key].value);for(const key of ['usageProfile','mounting','currency']) input[key]=form.elements[key].value;
 input.location=locationName;return validateInputs(input)}
function saveSettings(){try{const s=serialize();localStorage.setItem('solarpayback-settings-v1',JSON.stringify(s));}catch{/* invalid or disabled storage: do not persist */}}
function restoreSettings(){try{const str=localStorage.getItem('solarpayback-settings-v1');if(!str)return;
 const stored=validateInputs(JSON.parse(str));for(const [k,v] of Object.entries(stored)) if(form.elements[k]) form.elements[k].value=String(v);locationName=typeof stored.location==='string'?stored.location:DEFAULTS.location;
 }catch{/* invalid/stale settings ignored */}}
function showLocation(){ $('selectedLocation').textContent=locationName+(locationName===DEFAULTS.location?' · '+t('sample'):'');}
function setStatus(message,state='pending'){$('statusMessage').textContent=message;$('statusBanner').dataset.state=state;
 $('sourceBadge').dataset.state=state;$('sourceBadge').lastElementChild.textContent=state==='verified'?(language==='el'?EL.verified:'Verified PVGIS data'):state==='error'?(language==='el'?EL.errorBadge:'Source unavailable'):(language==='el'?EL.pending:'Awaiting verified data');}
function setFormError(message){$('formError').hidden=!message;$('formError').textContent=message||''}
function setBusy(busy){$('calculateBtn').disabled=busy;$('calculateBtn').setAttribute('aria-busy',String(busy));
 $('calculateBtnText').textContent=busy?(language==='el'?'Υπολογισμός…':'Calculating…'):(language==='el'?EL.calculate:'Calculate solar payback');}
function resetVisuals(){for(const id of ['paybackValue','savingsValue','productionValue','npvValue','selfUsedValue','exportedValue','usageValue','ringPercent','upfrontValue','avoidedValue','exportValue','discountedPaybackValue','lcoeValue','lowPayback','basePayback','highPayback']) $(id).textContent='—';
 $('monthlyChart').replaceChildren(createPlaceholder());$('cashChart').replaceChildren(createPlaceholder());$('energyRing').style.background='conic-gradient(#36545b 0%,#36545b 100%)';
 $('cashflowBody').replaceChildren();$('insightsList').replaceChildren(createPlaceholder(true));$('exportBtn').disabled=true;
 $('provenanceText').textContent=language==='el'?EL.provenancePending:'No PVGIS calculation has completed yet. Example prices are assumptions, not live tariff data.';
}
function createPlaceholder(insights=false){const el=document.createElement('p');el.className='chart-placeholder';el.textContent=language==='el'?(insights?EL.insightsPending:EL.chartPending):(insights?'Complete a calculation to see the key assumptions that shape the result.':'Verified production data will appear here.');return el}
function clearSolar(){requestCounter++;if(activeController)activeController.abort();activeController=null;dataset=null;dataSignature=null;result=null;
 resetVisuals();setStatus(t('staleText'),'pending');}
function updateFromFinances(){if(!dataset)return;try{const input=serialize();if(solarSignature(input)!==dataSignature){clearSolar();return}
 result=calculateForecast(dataset.monthlyKwh,input);setFormError('');renderForecast(result);setStatus(t('changeFinance'),'verified');saveSettings();
 }catch(e){setFormError(t('inputError')+e.message);}}
function renderMonthChart(forecast){const root=$('monthlyChart');root.replaceChildren();const chart=document.createElement('div');chart.className='monthly-bars';
 const max=Math.max(1,...forecast.months.map(m=>m.generation)); const names=t('monthlyLabels');
 forecast.months.forEach((m,i)=>{const col=document.createElement('div');col.className='month-col';
  const wrap=document.createElement('div');wrap.className='month-bar-wrap';const bar=document.createElement('div');bar.className='month-bar';bar.style.height=`${Math.max(1,m.generation/max*92)}%`;bar.title=`${names[i]}: ${number(m.generation)} kWh`;wrap.append(bar);
  const label=document.createElement('span');label.className='month-label';label.textContent=names[i];col.append(wrap,label);chart.append(col);
 });root.append(chart);root.setAttribute('aria-label',forecast.months.map((m,i)=>`${names[i]} ${number(m.generation)} kWh`).join(', '));}
function renderCashChart(forecast){const wrap=$('cashChart');wrap.replaceChildren();const svgNS='http://www.w3.org/2000/svg';const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 560 220');svg.setAttribute('role','img');svg.setAttribute('aria-label',language==='el'?'Γράφημα σωρευτικών ταμειακών ροών':'Cumulative cash-flow line chart');
 const width=560,height=220,left=55,right=14,top=19,bottom=25;
 const values=[-forecast.upfront,...forecast.years.map(y=>y.cumulative)];let min=Math.min(0,...values),max=Math.max(0,...values);if(min===max){min-=1;max+=1}const padding=(max-min)*.13;min-=padding;max+=padding;
 const x=i=>left+i/(values.length-1)*(width-left-right);const y=v=>top+(max-v)/(max-min)*(height-top-bottom);
 const node=(tag,attrs,parent=svg)=>{const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));parent.append(n);return n};
 for(let i=0;i<4;i++){const value=min+(max-min)*i/3;node('line',{x1:left,y1:y(value),x2:width-right,y2:y(value),class:'gridline'});const label=node('text',{x:left-8,y:y(value)+4,'text-anchor':'end'});label.textContent=number(value/1000,1)+'k';}
 node('line',{x1:left,y1:y(0),x2:width-right,y2:y(0),class:'baseline'});
 const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
 const defs=node('defs',{});const gradient=node('linearGradient',{id:'areaFill',x1:'0',y1:'0',x2:'0',y2:'1'},defs);node('stop',{offset:'0%','stop-color':'#dbac75','stop-opacity':'.3'},gradient);node('stop',{offset:'100%','stop-color':'#dbac75','stop-opacity':'0'},gradient);
 node('polygon',{points:`${x(0)},${y(min)} ${points} ${x(values.length-1)},${y(min)}`,fill:'url(#areaFill)'});
 node('polyline',{points,class:'line'});
 for(let i=0;i<values.length;i++) if(i===0||i===values.length-1||i%5===0||i===Math.ceil(forecast.paybackYears??-1)){
   const dot=node('circle',{cx:x(i),cy:y(values[i]),r:3.5});const title=node('title',{},dot);title.textContent=`${language==='el'?'Έτος':'Year'} ${i}: ${money(values[i])}`;
 }
 for(const i of [0,Math.round((values.length-1)/2),values.length-1]){const label=node('text',{x:x(i),y:height-3,'text-anchor':'middle'});label.textContent=i===0?'0':String(i)+'y'}
 wrap.append(svg);
}
function renderInsights(forecast){const list=$('insightsList');list.replaceChildren();const notes=[t('notedSelfUse'),t('notedContracts'),t('notedWeather')];
 if(forecast.inputs.replacementYear>0 && forecast.inputs.replacementYear<=forecast.inputs.lifetime && forecast.inputs.replacementCost>0){notes.push(t('notedReplacement')+forecast.inputs.replacementYear+'.')}
 if(forecast.inputs.co2KgPerKwh>0) notes.push(t('notedEmission')+`${number(forecast.estimatedCo2Kg/1000,1)} t CO₂. `+t('notAQuote'));
 for(const note of notes){const row=document.createElement('div');row.className='insight-row';const mark=document.createElement('span');mark.className='insight-icon';mark.textContent='i';mark.setAttribute('aria-hidden','true');const text=document.createElement('span');text.textContent=note;row.append(mark,text);list.append(row);}}
function renderTable(forecast){const body=$('cashflowBody');body.replaceChildren();for(const yr of forecast.years){const tr=document.createElement('tr');
 const values=[yr.year,number(yr.generation),number(yr.selfUsed),number(yr.exported),money(yr.avoidedPurchases),money(yr.exportRevenue),money(yr.cashflow),money(yr.cumulative)];
 for(const [i,value] of values.entries()){const cell=document.createElement(i===0?'th':'td');if(i===0)cell.scope='row';cell.textContent=String(value);tr.append(cell)}body.append(tr);}}
function renderForecast(forecast){
 $('paybackValue').textContent=payback(forecast.paybackYears,forecast.inputs.lifetime);
 $('savingsValue').textContent=money(forecast.annualSavings);
 $('productionValue').textContent=`${number(forecast.annualProduction)} kWh`;
 $('npvValue').textContent=money(forecast.npv);
 $('selfUsedValue').textContent=`${number(forecast.annualSelfUsed)} kWh`;
 $('exportedValue').textContent=`${number(forecast.annualExported)} kWh`;
 $('usageValue').textContent=`${number(forecast.inputs.annualUsage)} kWh`;
 const share=forecast.selfUseShare*100;$('ringPercent').textContent=`${number(share,1)}%`;
 $('energyRing').style.background=`conic-gradient(#66c9b4 0% ${share}%,#547987 ${share}% 100%)`;
 $('upfrontValue').textContent=money(forecast.upfront);
 $('avoidedValue').textContent=money(forecast.firstYearAvoided);
 $('exportValue').textContent=money(forecast.firstYearExportRevenue);
 $('discountedPaybackValue').textContent=payback(forecast.discountedPaybackYears,forecast.inputs.lifetime);
 $('lcoeValue').textContent=forecast.lcoe===null?'—':`${money(forecast.lcoe,3)}/kWh`;
 const downside=calculateForecast(dataset.monthlyKwh,forecast.inputs,.9),upside=calculateForecast(dataset.monthlyKwh,forecast.inputs,1.1);
 $('lowPayback').textContent=payback(downside.paybackYears,forecast.inputs.lifetime);
 $('basePayback').textContent=payback(forecast.paybackYears,forecast.inputs.lifetime);
 $('highPayback').textContent=payback(upside.paybackYears,forecast.inputs.lifetime);
 $('moneyUnit').textContent=readCurrency();
 renderMonthChart(forecast);renderCashChart(forecast);renderInsights(forecast);renderTable(forecast);
 const date=new Date(dataset.fetchedAt);const fetched=Number.isNaN(date.getTime())?'unknown':date.toISOString().slice(0,16).replace('T',' ')+' UTC';
 $('provenanceText').textContent=(language==='el'?
 `Παραγωγή: ${dataset.source}, βάση ${dataset.dataset}, ιστορικές κλιματολογικές τιμές (συνήθως 2005–2023). Ανάκτηση: ${fetched}. Οι τιμές ρεύματος, η ιδιοκατανάλωση, οι δαπάνες και ο συντελεστής CO₂ είναι μόνο παραδοχές χρήστη. Δεν περιλαμβάνονται φόροι ή χρηματοδότηση.`:
 `Solar production: ${dataset.source}; dataset ${dataset.dataset}; multi-year historic climate (typically 2005–2023). Retrieved ${fetched}. Tariffs, self-use, expenses and CO₂ factor are user assumptions, not live market feeds. No tax, financing, or battery model.`);
 $('exportBtn').disabled=false;
}
async function runCalculation(){let input;try{if(!form.checkValidity()){const invalid=form.querySelector(':invalid');if(invalid){invalid.focus();setFormError(t('inputError')+(invalid.labels?.[0]?.textContent||invalid.name));return}}input=serialize();setFormError('');}
 catch(e){setFormError(t('inputError')+e.message);return}
 const count=++requestCounter;if(activeController)activeController.abort();activeController=new AbortController();setBusy(true);setStatus(t('calculating'),'pending');
 const keys=['lat','lon','peakKw','slope','aspect','loss','mounting'];const qs=new URLSearchParams();for(const key of keys)qs.set(key,String(input[key]));
 try {const response=await fetch('/api/solar?'+qs,{signal:activeController.signal,headers:{Accept:'application/json'}});const body=await response.json();
  if(!response.ok) throw new Error(body?.error||'Solar service unavailable');
  if(count!==requestCounter)return;
  if(!Array.isArray(body.monthlyKwh)||body.monthlyKwh.length!==12||body.monthlyKwh.some(x=>!Number.isFinite(x)||x<0))throw new Error('Unverified monthly solar data');
  if(solarSignature(input)!==solarSignature(serialize()))return;
  dataset=body;dataSignature=solarSignature(input);result=calculateForecast(body.monthlyKwh,input);renderForecast(result);
  saveSettings();setStatus(t('successText'),'verified');
 }catch(e){if(count!==requestCounter||e?.name==='AbortError')return;dataset=null;dataSignature=null;result=null;resetVisuals();
  setStatus(t('cannotLoad')+(e?.message?' '+e.message:''),'error');
 }finally{if(count===requestCounter){setBusy(false);activeController=null}}
}
async function searchPlace(){const term=$('placeSearch').value.trim();const panel=$('placeResults');panel.replaceChildren();
 if(term.length<2){panel.hidden=false;const p=document.createElement('p');p.textContent=t('searchMore');panel.append(p);return}
 $('searchBtn').disabled=true;$('placeSearch').setAttribute('aria-expanded','true');
 try{const r=await fetch('/api/places?q='+encodeURIComponent(term));const body=await r.json();if(!r.ok)throw new Error(body.error||'Search unavailable');
  if(!body.results?.length){const p=document.createElement('p');p.textContent=t('findError');panel.append(p)}
  else for(const place of body.results){const btn=document.createElement('button');btn.type='button';btn.setAttribute('role','option');btn.textContent=place.name;
   btn.addEventListener('click',()=>chooseLocation(place));panel.append(btn)}
  panel.hidden=false;
 }catch(e){const p=document.createElement('p');p.textContent=e.message;panel.append(p);panel.hidden=false}
 finally{$('searchBtn').disabled=false}}
function chooseLocation(place){form.elements.lat.value=Number(place.lat).toFixed(4);form.elements.lon.value=Number(place.lon).toFixed(4);locationName=place.name;
 showLocation();$('placeResults').hidden=true;$('placeSearch').setAttribute('aria-expanded','false');$('placeSearch').value='';clearSolar();saveSettings();}
function onInput(event){const el=event.target;if(!(el instanceof HTMLElement)||!el.name)return;
 if(el.name==='selfUsePct')$('selfUseOutput').textContent=el.value+'%';
 if(el.name==='lat'||el.name==='lon'){locationName=t('locationManual');showLocation()}
 saveSettings();if(el.hasAttribute('data-solar'))clearSolar();else updateFromFinances();}
function initialize(){
 document.querySelectorAll('[data-i18n]').forEach(el=>el.dataset.originalText=el.textContent);
 document.querySelectorAll('[data-i18n-html]').forEach(el=>el.dataset.originalHtml=el.innerHTML);
 document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.dataset.originalPlaceholder=el.placeholder);
 restoreSettings();applyTranslations();showLocation();
 $('languageToggle').addEventListener('click',()=>{language=language==='en'?'el':'en';applyTranslations();showLocation();if(!dataset)setStatus(t('staleText'),'pending');});
 form.addEventListener('submit',e=>{e.preventDefault();runCalculation()});
 form.addEventListener('input',onInput);form.addEventListener('change',onInput);
 document.querySelectorAll('[data-place]').forEach(el=>el.addEventListener('click',()=>chooseLocation(locations[el.dataset.place])));
 $('searchBtn').addEventListener('click',searchPlace);$('placeSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchPlace()}if(e.key==='Escape'){$('placeResults').hidden=true;}});
 $('exportBtn').addEventListener('click',()=>{if(!result||!dataset)return;
   const csv=asCSV(result);const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download='solar-payback-cashflow.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 setStatus(t('initialText'),'pending');runCalculation();
}
initialize();
