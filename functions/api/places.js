function json(value, status=200) {return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=0, s-maxage=3600':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function onRequestGet({request}) {
  const q = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (q.length < 2 || q.length > 80 || /[<>\u0000-\u001f]/.test(q)) return json({error:'Enter a city or postal area (2–80 characters).'},400);
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search=new URLSearchParams({name:q,count:'7',language:'en',format:'json'}).toString();
  const abort=new AbortController(); const timer=setTimeout(()=>abort.abort(),8000);
  try {
    const r=await fetch(url,{signal:abort.signal,headers:{Accept:'application/json'}});
    if(!r.ok) return json({error:'Location service is unavailable. You can enter coordinates instead.'},503);
    const payload=await r.json();
    const results=(Array.isArray(payload.results)?payload.results:[]).filter(p=>
      typeof p.name==='string' && typeof p.latitude==='number' && typeof p.longitude==='number')
      .slice(0,7).map(p=>({name:[p.name,p.admin1,p.country].filter(Boolean).join(', '),lat:p.latitude,lon:p.longitude}));
    return json({results,source:'Open-Meteo Geocoding'});
  } catch {return json({error:'Location search failed. Enter coordinates manually.'},502);}
  finally {clearTimeout(timer);}
}
