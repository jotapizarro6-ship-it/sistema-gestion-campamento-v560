import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const enc=new TextEncoder();
const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization,content-type",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json; charset=utf-8"}});
const clean=(v:any,max=120)=>String(v??"").trim().slice(0,max);
async function cfg(keys:string[]){const {data,error}=await db.from("settings").select("key,value").in("key",keys);if(error)throw error;return Object.fromEntries((data??[]).map((r:any)=>[r.key,r.value]))}
async function sign(secret:string,msg:string){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=await crypto.subtle.sign("HMAC",k,enc.encode(msg));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function ub64(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return atob(s)}
async function isAdmin(req:Request){const h=req.headers.get("authorization")??"";if(!h.startsWith("Bearer "))return false;const [p,s]=h.slice(7).split(".");if(!p||!s)return false;try{if(Date.now()>JSON.parse(ub64(p)).exp)return false}catch{return false}const c=await cfg(["session_secret"]);return !!c.session_secret&&(await sign(c.session_secret,p))===s}
async function audit(action:string,result="OK",details:any={}){const {error}=await db.from("audit_log").insert({profile:"ADMINISTRADOR",action,entity_type:"backup_restore_test",endpoint:"campamento-recovery-api",result,details});if(error)console.error("audit",error)}

Deno.serve(async(req:Request)=>{try{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(!await isAdmin(req))return json({ok:false,error:"No autorizado"},401);
  const u=new URL(req.url),action=u.searchParams.get("action")??"";
  if(req.method==="GET"&&action==="status"){
    const q=await db.from("backup_restore_tests").select("id,tested_at,backup_schema,status,tables_checked,source_rows,restored_rows,duration_ms,profile").order("tested_at",{ascending:false}).limit(20);
    if(q.error)throw q.error;
    return json({ok:true,data:{backup_schema:"backup_pre_integridad_20260828",tests:q.data??[]}})
  }
  if(req.method==="POST"&&action==="restore_test"){
    const b=await req.json().catch(()=>({}));
    if(clean(b.profile,20).toUpperCase()!=="ADMINISTRADOR")return json({ok:false,error:"Esta prueba requiere perfil Administrador"},403);
    const schema=clean(b.backup_schema,80)||"backup_pre_integridad_20260828";
    const q=await db.rpc("run_backup_restore_test",{p_backup_schema:schema,p_profile:"ADMINISTRADOR"});
    if(q.error)throw q.error;
    const result=q.data;
    await audit("PRUEBA_RECUPERACION_RESPALDO",result?.status||"OK",{backup_schema:schema,tables_checked:result?.tables_checked||0,source_rows:result?.source_rows||0,restored_rows:result?.restored_rows||0,duration_ms:result?.duration_ms||0});
    return json({ok:true,data:result})
  }
  return json({ok:false,error:"Ruta no encontrada"},404)
}catch(e){console.error(e);return json({ok:false,error:"Error temporal del servidor",detail:e instanceof Error?e.message:String(e)},500)}});
