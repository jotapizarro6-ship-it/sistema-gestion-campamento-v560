import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false}}
);

const SUPABASE_ORIGIN=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
const STATE_API=`${SUPABASE_ORIGIN}/functions/v1/campamento-v560-fast`;
const enc=new TextEncoder();
const RULE_KEY="workforce_classification_rules";
const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization,content-type",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};
const json=(data:any,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json; charset=utf-8",...extra}});

async function cfg(keys:string[]){
  const {data,error}=await db.from("settings").select("key,value").in("key",keys);
  if(error)throw error;
  return Object.fromEntries((data??[]).map((r:any)=>[r.key,r.value]));
}
async function sign(secret:string,msg:string){
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const buf=await crypto.subtle.sign("HMAC",key,enc.encode(msg));
  return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function ub64(s:string){
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  return atob(s);
}
async function isAdmin(req:Request){
  const h=req.headers.get("authorization")??"";
  if(!h.startsWith("Bearer "))return false;
  const [payload,signature]=h.slice(7).split(".");
  if(!payload||!signature)return false;
  try{
    const parsed=JSON.parse(ub64(payload));
    if(Date.now()>Number(parsed.exp||0))return false;
  }catch{return false}
  const c=await cfg(["session_secret"]);
  return !!c.session_secret&&(await sign(c.session_secret,payload))===signature;
}
function fold(v:any){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim().replace(/\s+/g," ")}
function parseRules(raw:any){try{const x=JSON.parse(String(raw??"{}"));return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}catch{return {}}}
function validClass(v:any){const x=String(v??"").toUpperCase();return ["DIRECTA","INDIRECTA","POR_DEFINIR"].includes(x)?x:""}
async function saveRules(rules:Record<string,string>){const {error}=await db.from("settings").upsert({key:RULE_KEY,value:JSON.stringify(rules)},{onConflict:"key"});if(error)throw error}
async function audit(category:string,classification:string){
  const {error}=await db.from("audit_log").insert({occurred_at:new Date().toISOString(),profile:"ADMINISTRADOR",action:"UPDATE_WORKFORCE_CLASSIFICATION",entity_type:"workforce_category",entity_id:category,endpoint:"campamento-workforce-api",result:"OK",details:{classification}});
  if(error)console.warn("No fue posible registrar auditoría MOD/MOI",error.message);
}
async function reserveRevision(req:Request,expected:string){
  const auth=req.headers.get('authorization')||'';
  const q=new URLSearchParams({action:'claim_revision'});if(expected)q.set('expected',expected);
  const r=await fetch(`${STATE_API}?${q.toString()}`,{method:'POST',headers:{authorization:auth}});
  const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${r.status}`}}
  return {response:r,data};
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    if(!["GET","POST"].includes(req.method))return json({ok:false,error:"Método no permitido"},405);
    if(!await isAdmin(req))return json({ok:false,error:"No autorizado"},401);

    const u=new URL(req.url);
    const settings=await cfg([RULE_KEY]);
    const rules=parseRules(settings[RULE_KEY]);
    if(req.method==="GET")return json({ok:true,rules});

    const c=await reserveRevision(req,u.searchParams.get('state_version')||'');
    if(!c.response.ok)return json(c.data,c.response.status,{'x-camp-state-version':String(c.data?.current_state_version||c.data?.state_version||'')});

    const body=await req.json().catch(()=>({}));
    const category=String(body?.category??"").trim();
    const key=fold(category);
    const classification=validClass(body?.classification);
    if(!key||!classification)return json({ok:false,error:"Categoría o clasificación no válida"},400);
    rules[key]=classification;
    await saveRules(rules);
    await audit(category,classification);
    return json({ok:true,category,key,classification,rules});
  }catch(e){
    console.error(e);
    return json({ok:false,error:"Error temporal del servidor",detail:e instanceof Error?e.message:String(e)},500);
  }
});
