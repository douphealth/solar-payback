import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateForecast, DEFAULTS, getMonthlyUsage, validateInputs, asCSV, solarSignature} from '../src/engine.js';
const production=Array(12).fill(500);
const input={...DEFAULTS,annualUsage:12000,selfUsePct:100,systemCost:5000,grant:0,annualMaintenance:0,
 annualInsurance:0,replacementYear:0,replacementCost:0,degradationPct:0,utilityEscalationPct:0,exportEscalationPct:0,
 discountPct:0,importRate:.2,exportRate:.1, lifetime:20};

test('generated, self-used and exported kWh conserve energy',()=>{
 const f=calculateForecast(production,{...input,annualUsage:3000,selfUsePct:70});
 assert.equal(f.annualProduction,6000);
 assert.equal(f.annualSelfUsed,3000);
 assert.equal(f.annualExported,3000);
 assert.equal(f.firstYearGrossSavings,900);
});
test('simple payback interpolates years exactly and NPV discounts independently',()=>{
 const f=calculateForecast(production,input);
 assert.equal(f.annualSavings,1200);
 assert.ok(Math.abs(f.paybackYears - 5000/1200)<1e-9);
 assert.ok(Math.abs(f.npv - (1200*20-5000))<1e-6);
 assert.equal(f.discountedPaybackYears,f.paybackYears);
});
test('grant reduces upfront but cannot exceed cost',()=>{
 const f=calculateForecast(production,{...input,grant:2000});
 assert.equal(f.upfront,3000);assert.equal(f.paybackYears,2.5);
 assert.throws(()=>calculateForecast(production,{...input,grant:6000}),/Grant/);
});
test('module degradation decreases year two generation; export and maintenance inflate separately',()=>{
 const f=calculateForecast(production,{...input,annualUsage:0,selfUsePct:0,degradationPct:1,
  exportEscalationPct:2,annualMaintenance:100,expenseEscalationPct:3});
 assert.ok(Math.abs(f.years[1].generation - 5940)<1e-9);
 assert.ok(Math.abs(f.years[1].exportRevenue - 5940*.102)<1e-8);
 assert.equal(f.years[1].annualOperatingCost,103);
});
test('replacement deducted only in specified year and can delay break-even',()=>{
 const f=calculateForecast(production,{...input,replacementYear:3,replacementCost:3000});
 assert.equal(f.years[2].replacement,3000);
 assert.equal(f.years[3].replacement,0);
 assert.ok(f.paybackYears > 5000/1200);
});
test('if cashflow never recovers cost, payback is null, not a fake number',()=>{
 const f=calculateForecast(Array(12).fill(0),input);
 assert.equal(f.paybackYears,null);assert.equal(f.discountedPaybackYears,null);
 assert.equal(f.lcoe,null);
});
test('zero-upfront systems have a mathematically immediate payback',()=>{
 const f=calculateForecast(production,{...input,systemCost:0,grant:0});
 assert.equal(f.paybackYears,0);
});
test('monthly annual demand is conserved for every profile',()=>{
 for(const p of ['flat','summer','winter']) assert.ok(Math.abs(getMonthlyUsage(6754,p).reduce((a,b)=>a+b,0)-6754)<1e-8);
});
test('invalid readings cannot enter the forecast',()=>{
 assert.throws(()=>calculateForecast([1,2],input),/12/);
 assert.throws(()=>calculateForecast([NaN,...Array(11).fill(2)],input),/12/);
 assert.throws(()=>validateInputs({...input,importRate:-1}),/importRate/);
 assert.throws(()=>validateInputs({...input,usageProfile:'not-real'}),/profile/);
});
test('yearly data are exportable, with each output year',()=>{
 const f=calculateForecast(production,{...input,lifetime:2});
 assert.equal(asCSV(f).trim().split('\n').length,3);
});
test('solar signatures do not include financial fields',()=>{
 assert.equal(solarSignature(input),solarSignature({...input,importRate:.4}));
 assert.notEqual(solarSignature(input),solarSignature({...input,slope:40}));
});
test('payback must survive a later replacement cost, not just cross temporarily',()=>{
 const f=calculateForecast(production,{...input,systemCost:1000,lifetime:5,replacementYear:3,replacementCost:10000});
 assert.equal(f.paybackYears,null);
 const g=calculateForecast(production,{...input,systemCost:1000,lifetime:10,replacementYear:3,replacementCost:4500});
 assert.ok(g.paybackYears>3);
});
