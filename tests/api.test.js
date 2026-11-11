import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePvgis,parseSolarQuery,createPvgisUrl} from '../src/pvgis.js';
import {onRequestGet as fetchSolar} from '../functions/api/solar.js';
import {onRequestGet as fetchPlaces} from '../functions/api/places.js';
const parsed={outputs:{monthly:{fixed:Array.from({length:12},(_,i)=>({month:i+1,E_m:100}))},totals:{fixed:{E_y:1200}}},inputs:{meteo_data:{radiation_db:'PVGIS-SARAH3',year_min:2005,year_max:2023}}};
const query='lat=37.98&lon=23.72&peakKw=5&slope=30&aspect=0&loss=14&mounting=free';

test('PVGIS parser accepts all twelve official E_m records and their source metadata',()=>{
 const result=parsePvgis(parsed);assert.equal(result.annualKwh,1200);assert.equal(result.monthlyKwh[0],100);assert.equal(result.dataset,'PVGIS-SARAH3');assert.equal(result.dataPeriod,'2005–2023');
});
test('PVGIS parsing rejects mismatched annual energy and duplicate months',()=>{
 assert.throws(()=>parsePvgis({...parsed,outputs:{...parsed.outputs,totals:{fixed:{E_y:3000}}}}),/disagree/);
 assert.throws(()=>parsePvgis({...parsed,outputs:{...parsed.outputs,monthly:{fixed:Array.from({length:12},()=>({month:1,E_m:100}))}}}),/Invalid/);
});
test('API parameters are strictly bounded and pass to PVGIS with safe URL',()=>{
 const params=parseSolarQuery(new URLSearchParams(query)); const url=createPvgisUrl(params);
 assert.equal(url.origin,'https://re.jrc.ec.europa.eu'); assert.equal(url.searchParams.get('peakpower'),'5');
 assert.equal(url.searchParams.get('aspect'),'0');
 assert.throws(()=>parseSolarQuery(new URLSearchParams(query.replace('lat=37.98','lat=1000'))),/range/);
 assert.throws(()=>parseSolarQuery(new URLSearchParams(query.replace('peakKw=5','peakKw=Infinity'))),/Invalid/);
});
test('solar API returns 400 for invalid query without calling external network',async()=>{
 const r=await fetchSolar({request:new Request('https://example.com/api/solar?lat=999')});
 assert.equal(r.status,400);
});
test('solar API normalizes upstream data without exposing a raw dump',async()=>{
 const old=globalThis.fetch; globalThis.fetch=async()=>new Response(JSON.stringify(parsed),{status:200,headers:{'content-type':'application/json'}});
 try {const r=await fetchSolar({request:new Request('https://example.com/api/solar?'+query)});
   assert.equal(r.status,200);const d=await r.json();assert.equal(d.annualKwh,1200);assert.equal(d.inputs.slope,30);assert.ok(d.fetchedAt);assert.ok(!d.outputs);
 } finally {globalThis.fetch=old;}
});
test('solar API fails closed when upstream is unavailable',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:529});
 try {const r=await fetchSolar({request:new Request('https://example.com/api/solar?'+query)});
 assert.equal(r.status,503);assert.match((await r.json()).error,/busy/);}
 finally{globalThis.fetch=old;}
});
test('location endpoint validates search and normalizes valid geocoding responses',async()=>{
 const bad=await fetchPlaces({request:new Request('https://example.com/api/places?q=x')});assert.equal(bad.status,400);
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({results:[{name:'Athens',admin1:'Attica',country:'Greece',latitude:37.98,longitude:23.72}]}));
 try{const r=await fetchPlaces({request:new Request('https://example.com/api/places?q=Athens')});
 assert.equal(r.status,200);assert.equal((await r.json()).results[0].name,'Athens, Attica, Greece');}
 finally{globalThis.fetch=old;}
});

test('PVGIS temporal metadata never invents historical years',()=>{
 const result=parsePvgis({...parsed,inputs:{meteo_data:{radiation_db:'PVGIS-ERA5'}}});
 assert.match(result.dataPeriod,/exact years not supplied/);
 assert.equal(result.annualIrradiationKwhM2,null);
 const enriched=parsePvgis({...parsed,outputs:{...parsed.outputs,totals:{fixed:{E_y:1200,'H(i)_y':1700}}}});
 assert.equal(enriched.annualIrradiationKwhM2,1700);
});
