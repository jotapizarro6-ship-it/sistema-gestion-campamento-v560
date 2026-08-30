(()=>{
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    const el=document.getElementById('publicDate');
    if(!el)return;
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const p=Object.fromEntries(parts.map(x=>[x.type,x.value])) as Record<string,string>;
    el.textContent=`${p.day??'--'}-${p.month??'--'}-${p.year??'----'}`;
  });
})();
