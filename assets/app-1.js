'use strict';

const WEB_API='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-web-api';
const ADV_API='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-v560-raw';
const TZ='America/Santiago';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=(v)=>String(v??'').trim();
const plain=(v)=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const loc=(v,k='x')=>{let s=plain(v);if(!s)return'';if(k==='room'){const n=Number(s.replace(',','.'));if(Number.isFinite(n))return Number.isInteger(n)?String(n):String(n).replace(/\.0+$/,'')}if(k==='bed')s=s.replace(/^CAMA\s+/,'');return s};
const lkey=(m,r,b)=>`${loc(m,'module')}|${loc(r,'room')}|${loc(b,'bed')}`;
const fmtInt=(v)=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:0}).format(Number(v)||0);
const fmt1=(v)=>new Intl.NumberFormat('es-CL',{minimumFractionDigits:0,maximumFractionDigits:1}).format(Number(v)||0);
const fmtCLP=(v)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(v)||0);
const dateParts=()=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
const todayISO=()=>{const p=dateParts();return `${p.year}-${p.month}-${p.day}`};
const addDays=(iso,n)=>{const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const fmtDate=(iso)=>{if(!iso)return'—';const [y,m,d]=String(iso).slice(0,10).split('-');return y&&m&&d?`${d}-${m}-${y}`:String(iso)};
const fmtShort=(iso)=>{if(!iso)return'';const [y,m,d]=String(iso).slice(0,10).split('-');return `${d}/${m}`};
const normalizeRut=(v)=>{let s=clean(v).toUpperCase().replace(/\./g,'').replace(/\s+/g,'').replace(/[^0-9K-]/g,'');if(!s.includes('-')&&s.length>1)s=s.slice(0,-1)+'-'+s.slice(-1);return s};
const formatRut=(v)=>{const r=normalizeRut(v);const [num,dv]=r.split('-');if(!num)return r;return `${num.replace(/\B(?=(\d{3})+(?!\d))/g,'.')}${dv?'-'+dv:''}`};
function rutDV(num){let s=1,m=0;for(;num;num=Math.floor(num/10))s=(s+num%10*(9-m++%6))%11;return s?'K':'0'}
function rutValid(v){const r=normalizeRut(v),m=r.match(/^(\d{5,9})-([0-9K])$/);return !!m&&rutDV(Number(m[1]))===m[2]}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function htmlNotice(text,type='info'){return `<div class="notice ${type}">${esc(text)}</div>`}
function download(name,content,type='application/json;charset=utf-8'){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function toCSV(rows,columns){const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;return '\ufeff'+[columns.map(c=>q(c.label)).join(','),...rows.map(r=>columns.map(c=>q(typeof c.get==='function'?c.get(r):r[c.key])).join(','))].join('\n')}

async function webApi(action,{method='GET',body=null,token=null,file=null}={}){
  const headers={};if(token)headers.Authorization=`Bearer ${token}`;let payload;
  if(file){payload=new FormData();payload.append('file',file)}else if(method!=='GET'){headers['Content-Type']='application/json';payload=JSON.stringify(body??{})}
  const res=await fetch(`${WEB_API}?action=${encodeURIComponent(action)}`,{method,headers,body:payload});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${res.status}`}}
  if(!res.ok||data?.ok===false){const e=new Error(data?.error||`Error HTTP ${res.status}`);e.status=res.status;throw e}return data;
}
async function advApi(action,{method='GET',body=null,token=null}={}){
  const headers={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
  const res=await fetch(`${ADV_API}?action=${encodeURIComponent(action)}`,{method,headers,body:method==='GET'?undefined:JSON.stringify(body??{})});
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${res.status}`}}
  if(res.status===401){sessionStorage.removeItem('camp_admin_token');const e=new Error('Sesión expirada. Vuelve a ingresar.');e.status=401;throw e}
  if(!res.ok||data?.ok===false){const e=new Error(data?.error||data?.detail||`Error HTTP ${res.status}`);e.status=res.status;throw e}return data;
}

function initPublic(){
  const form=$('#workerLookupForm');if(!form)return;
  const input=$('#workerRut'),out=$('#workerLookupResult');
  input.addEventListener('input',()=>{input.value=formatRut(input.value)});
  form.addEventListener('submit',async e=>{e.preventDefault();const r=normalizeRut(input.value);out.innerHTML=htmlNotice('Consultando asignación…','info');
    try{
      const data=await webApi('lookup',{method:'POST',body:{rut:r}}),st=data.status,w=data.worker;
      if(st==='RUT_INVALIDO'){out.innerHTML=htmlNotice('RUT no válido. Revisa que esté escrito correctamente.','error');return}
      if(st==='NO_ENCONTRADO'){out.innerHTML=htmlNotice('RUT no encontrado. Contacta a Administración de Campamento.','error');return}
      if(st==='SIN_ASIGNACION'||!w){out.innerHTML=`${htmlNotice('Tu registro está activo, pero todavía no tienes una habitación asignada.','warn')}${w?.nombre?`<p><strong>${esc(w.nombre)}</strong></p>`:''}`;return}
      out.innerHTML=`<div class="notice ok"><strong>${esc(w.nombre||'Trabajador')}</strong><div class="assignment-grid"><div class="assignment-item"><small>Módulo</small><b>${esc(w.modulo||'—')}</b></div><div class="assignment-item"><small>Habitación</small><b>${esc(w.habitacion||'—')}</b></div><div class="assignment-item"><small>Cama</small><b>${esc(w.cama||'—')}</b></div><div class="assignment-item"><small>Turno</small><b>${esc(w.turno||'—')}</b></div></div></div>`;
    }catch(err){out.innerHTML=htmlNotice(err.message||'No fue posible realizar la consulta.','error')}
  });
}
