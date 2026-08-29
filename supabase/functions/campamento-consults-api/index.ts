import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false}}
);

const TZ="America/Santiago";
const enc=new TextEncoder();
const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization,content-type",
  "access-control-allow-methods":"GET,DELETE,OPTIONS",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json; charset=utf-8"}});

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
function boundedInt(value:string|null,fallback:number,min:number,max:number){
  const n=Number.parseInt(value??"",10);
  if(!Number.isFinite(n))return fallback;
  return Math.max(min,Math.min(max,n));
}
function validDateKey(value:string|null){
  const v=String(value??"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return "";
  const d=new Date(`${v}T12:00:00Z`);
  if(Number.isNaN(d.getTime()))return "";
  return d.toISOString().slice(0,10)===v?v:"";
}
function storedDatePatterns(dateKey:string){
  const [y,m,d]=dateKey.split("-");
  const yy=y.slice(-2);
  return [
    `${d}-${m}-${y} %`,
    `${d}-${m}-${y},%`,
    `${d}-${m}-${yy} %`,
    `${d}-${m}-${yy},%`
  ];
}
async function countForDate(dateKey:string){
  let total=0;
  for(const pattern of storedDatePatterns(dateKey)){
    const {count,error}=await db.from("consultation_log").select("id",{count:"exact",head:true}).like("consultado_at",pattern);
    if(error)throw error;
    total+=Number(count??0);
  }
  return total;
}
async function deleteForDate(dateKey:string){
  const ids=new Set<string>();
  for(const pattern of storedDatePatterns(dateKey)){
    const {data,error}=await db.from("consultation_log").delete().like("consultado_at",pattern).select("id");
    if(error)throw error;
    for(const row of data??[])ids.add(String((row as any).id));
  }
  return ids.size;
}
async function auditDelete(dateKey:string,deleted:number){
  const {error}=await db.from("audit_log").insert({
    occurred_at:new Date().toISOString(),
    profile:"ADMINISTRADOR",
    action:"DELETE_CONSULTATION_LOG_DATE",
    entity_type:"consultation_log",
    entity_id:dateKey,
    endpoint:"campamento-consults-api",
    result:"OK",
    details:{date:dateKey,deleted_count:deleted,timezone:TZ}
  });
  if(error)console.warn("No fue posible registrar auditoría de limpieza",error.message);
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    if(!["GET","DELETE"].includes(req.method))return json({ok:false,error:"Método no permitido"},405);
    if(!await isAdmin(req))return json({ok:false,error:"No autorizado"},401);

    const u=new URL(req.url);
    const action=u.searchParams.get("action")??"";

    if(req.method==="GET"&&action==="delete_preview"){
      const date=validDateKey(u.searchParams.get("date"));
      if(!date)return json({ok:false,error:"Fecha no válida"},400);
      const count=await countForDate(date);
      return json({ok:true,date,count,timezone:TZ});
    }

    if(req.method==="DELETE"){
      const date=validDateKey(u.searchParams.get("date"));
      if(!date)return json({ok:false,error:"Fecha no válida"},400);
      const deleted=await deleteForDate(date);
      await auditDelete(date,deleted);
      return json({ok:true,date,deleted,timezone:TZ});
    }

    const page=boundedInt(u.searchParams.get("page"),1,1,1000000);
    const pageSize=boundedInt(u.searchParams.get("page_size"),100,1,500);
    const from=(page-1)*pageSize;
    const to=from+pageSize-1;

    const {data,error,count}=await db
      .from("consultation_log")
      .select("consultado_at,rut,nombre,status,modulo,habitacion,cama,ip,user_agent",{count:"exact"})
      .order("id",{ascending:false})
      .range(from,to);
    if(error)throw error;

    const total=Number(count??0);
    return json({
      ok:true,
      data:data??[],
      total,
      page,
      page_size:pageSize,
      pages:Math.max(1,Math.ceil(total/pageSize))
    });
  }catch(e){
    console.error(e);
    return json({ok:false,error:"Error temporal del servidor",detail:e instanceof Error?e.message:String(e)},500);
  }
});
