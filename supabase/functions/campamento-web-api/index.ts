const UPSTREAM='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-api';
const UPLOAD_UPSTREAM='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-upload-api';
const STATE_UPSTREAM='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-v560-fast';
const CONCURRENCY_ACTIONS=new Set(['save_worker','upload_excel']);
const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization,content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff'
};
function normalizeRut(v:any){let s=String(v??'').trim().toUpperCase().replace(/[^0-9K]/g,'');if(s.length>1)s=s.slice(0,-1)+'-'+s.slice(-1);return s}
function validRut(v:any){const m=/^(\d{5,9})-([0-9K])$/.exec(normalizeRut(v));if(!m)return false;let sum=0,mult=2;for(let i=m[1].length-1;i>=0;i--){sum+=Number(m[1][i])*mult;mult=mult===7?2:mult+1}const n=11-(sum%11),expected=n===11?'0':n===10?'K':String(n);return m[2]===expected}
function json(data:any,status=200,extra:Record<string,string>={}){return new Response(JSON.stringify(data),{status,headers:{...cors,'content-type':'application/json; charset=utf-8',...extra}})}
async function reserveRevision(req:Request,expected:string){
  const auth=req.headers.get('authorization')||'';
  const q=new URLSearchParams({action:'claim_revision'});if(expected)q.set('expected',expected);
  const r=await fetch(`${STATE_UPSTREAM}?${q.toString()}`,{method:'POST',headers:{authorization:auth}});
  const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${r.status}`}}
  return {response:r,data};
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    const u=new URL(req.url),action=u.searchParams.get('action')||'',base=action==='upload_excel'?UPLOAD_UPSTREAM:UPSTREAM,target=base+u.search;
    if(req.method==='POST'&&CONCURRENCY_ACTIONS.has(action)){
      const c=await reserveRevision(req,u.searchParams.get('state_version')||'');
      if(!c.response.ok)return json(c.data,c.response.status,{'x-camp-state-version':String(c.data?.current_state_version||c.data?.state_version||'')});
    }
    const h=new Headers();
    const auth=req.headers.get('authorization');if(auth)h.set('authorization',auth);
    const ct=req.headers.get('content-type');if(ct)h.set('content-type',ct);
    const ua=req.headers.get('user-agent');if(ua)h.set('user-agent',ua);
    const xff=req.headers.get('x-forwarded-for');if(xff)h.set('x-forwarded-for',xff);
    const init:any={method:req.method,headers:h};
    if(req.method!=='GET'&&req.method!=='HEAD'){
      if((action==='lookup'||action==='save_worker')&&(ct||'').toLowerCase().includes('application/json')){
        const b=await req.json().catch(()=>({}));
        if('rut' in b){
          b.rut=normalizeRut(b.rut);
          if(!validRut(b.rut)){
            const payload=action==='lookup'?{ok:true,status:'RUT_INVALIDO',worker:null}:{ok:false,error:'RUT no válido'};
            return json(payload,action==='lookup'?200:400);
          }
        }
        h.set('content-type','application/json');init.body=JSON.stringify(b);
      }else init.body=await req.arrayBuffer();
    }
    const r=await fetch(target,init);const body=await r.arrayBuffer();const out=new Headers(cors);out.set('content-type',r.headers.get('content-type')||'application/json; charset=utf-8');return new Response(body,{status:r.status,headers:out});
  }catch(e){console.error(e);return json({ok:false,error:'Error temporal del servidor',detail:e instanceof Error?e.message:String(e)},500)}
});
