import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const SUPABASE_ORIGIN=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
const STATE_API=`${SUPABASE_ORIGIN}/functions/v1/campamento-v560-fast`;
const enc=new TextEncoder();
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store","x-content-type-options":"nosniff"};
const json=(data:any,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json; charset=utf-8",...extra}});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);
const integer=(v:any,min=0,max=100000)=>Math.min(max,Math.max(min,Math.trunc(Number(v)||0)));
const date=(v:any)=>{const s=clean(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null};
const profile=(v:any)=>["ADMINISTRADOR","OPERADOR","JEFATURA"].includes(clean(v,20).toUpperCase())?clean(v,20).toUpperCase():"ADMINISTRADOR";
async function bodyJSON(req:Request){return await req.json().catch(()=>({}))}
async function cfg(keys:string[]){const {data,error}=await db.from("settings").select("key,value").in("key",keys);if(error)throw error;return Object.fromEntries((data??[]).map((r:any)=>[r.key,r.value]))}
async function sign(secret:string,msg:string){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=await crypto.subtle.sign("HMAC",k,enc.encode(msg));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function ub64(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return atob(s)}
async function isAdmin(req:Request){const h=req.headers.get("authorization")??"";if(!h.startsWith("Bearer "))return false;const [p,s]=h.slice(7).split(".");if(!p||!s)return false;try{if(Date.now()>JSON.parse(ub64(p)).exp)return false}catch{return false}const c=await cfg(["session_secret"]);return !!c.session_secret&&(await sign(c.session_secret,p))===s}
function safeDetails(v:any){if(!v||typeof v!=="object"||Array.isArray(v))return {};const out:any={};for(const [k,val] of Object.entries(v).slice(0,20)){const key=clean(k,50);if(!key)continue;if(typeof val==="number"||typeof val==="boolean"||val===null)out[key]=val;else out[key]=clean(val,300)}return out}
async function audit(p:string,action:string,entityType="",entityId="",endpoint="",result="OK",details:any={}){const {error}=await db.from("audit_log").insert({profile:profile(p),action:clean(action,80),entity_type:clean(entityType,50),entity_id:clean(entityId,80),endpoint:clean(endpoint,100),result:clean(result,20)||"OK",details:safeDetails(details)});if(error)console.error("audit",error)}
async function reserveRevision(req:Request,expected:string){const auth=req.headers.get('authorization')||'';const q=new URLSearchParams({action:'claim_revision'});if(expected)q.set('expected',expected);const r=await fetch(`${STATE_API}?${q.toString()}`,{method:'POST',headers:{authorization:auth}});const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${r.status}`}}return {response:r,data}}

Deno.serve(async(req:Request)=>{try{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(!await isAdmin(req))return json({ok:false,error:"No autorizado"},401);
  const u=new URL(req.url),action=u.searchParams.get("action")??"";

  if(req.method==="GET"&&action==="ping")return json({ok:true,data:{service:"campamento-control-api",time:new Date().toISOString()}});
  if(req.method==="GET"&&action==="state"){
    const [a,p,s,l]=await Promise.all([
      db.from("operational_actions").select("*").order("created_at",{ascending:false}).limit(500),
      db.from("master_plan_events").select("*").order("start_date",{ascending:true}).limit(500),
      db.from("what_if_scenarios").select("*").order("created_at",{ascending:false}).limit(100),
      db.from("audit_log").select("id,occurred_at,profile,action,entity_type,entity_id,endpoint,result,details").order("occurred_at",{ascending:false}).limit(500)
    ]);
    for(const q of [a,p,s,l])if(q.error)throw q.error;
    return json({ok:true,data:{actions:a.data??[],plan_events:p.data??[],scenarios:s.data??[],audit:l.data??[]}})
  }

  if(req.method!=="POST")return json({ok:false,error:"Método no permitido"},405);
  if(action!=="audit"){
    const c=await reserveRevision(req,u.searchParams.get('state_version')||'');
    if(!c.response.ok)return json(c.data,c.response.status,{'x-camp-state-version':String(c.data?.current_state_version||c.data?.state_version||'')});
  }
  const b=await bodyJSON(req),p=profile(b.profile);

  if(action==="action_create"){
    const title=clean(b.title,160);if(!title)return json({ok:false,error:"El título de la acción es obligatorio"},400);
    const severity=["INFO","ATENCION","CRITICO"].includes(clean(b.severity,20).toUpperCase())?clean(b.severity,20).toUpperCase():"ATENCION";
    const status=["PENDIENTE","EN_GESTION","RESUELTO","CANCELADO"].includes(clean(b.status,20).toUpperCase())?clean(b.status,20).toUpperCase():"PENDIENTE";
    const row={title,detail:clean(b.detail,1200),category:clean(b.category,80)||"OPERACIONAL",severity,status,owner_name:clean(b.owner_name,120),due_date:date(b.due_date),related_date:date(b.related_date),source_type:clean(b.source_type,50)||"MANUAL",source_key:clean(b.source_key,160)||null,resolution_note:clean(b.resolution_note,1000)};
    const q=await db.from("operational_actions").insert(row).select("*").single();if(q.error)throw q.error;await audit(p,"CREAR_ACCION","operational_action",String(q.data.id),action,"OK",{severity,status,category:row.category});return json({ok:true,data:q.data})
  }
  if(action==="action_update"){
    const id=integer(b.id,1,2147483647);if(!id)return json({ok:false,error:"Acción inválida"},400);const patch:any={updated_at:new Date().toISOString()};
    if(b.status!==undefined){const v=clean(b.status,20).toUpperCase();if(!["PENDIENTE","EN_GESTION","RESUELTO","CANCELADO"].includes(v))return json({ok:false,error:"Estado inválido"},400);patch.status=v;if(v==="RESUELTO")patch.resolved_at=new Date().toISOString()}
    if(b.owner_name!==undefined)patch.owner_name=clean(b.owner_name,120);if(b.due_date!==undefined)patch.due_date=date(b.due_date);if(b.resolution_note!==undefined)patch.resolution_note=clean(b.resolution_note,1000);if(b.title!==undefined&&clean(b.title,160))patch.title=clean(b.title,160);if(b.detail!==undefined)patch.detail=clean(b.detail,1200);
    const q=await db.from("operational_actions").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;await audit(p,"ACTUALIZAR_ACCION","operational_action",String(id),action,"OK",{status:q.data.status});return json({ok:true,data:q.data})
  }
  if(action==="action_delete"){
    const id=integer(b.id,1,2147483647);if(!id)return json({ok:false,error:"Acción inválida"},400);const q=await db.from("operational_actions").delete().eq("id",id);if(q.error)throw q.error;await audit(p,"ELIMINAR_ACCION","operational_action",String(id),action);return json({ok:true})
  }

  if(action==="plan_create"){
    const title=clean(b.title,160),start=date(b.start_date);if(!title||!start)return json({ok:false,error:"Título y fecha de inicio son obligatorios"},400);
    const impact=["INFORMATIVO","SUBIDA","BAJADA","CAPACIDAD_MAS","CAPACIDAD_MENOS"].includes(clean(b.impact_type,30).toUpperCase())?clean(b.impact_type,30).toUpperCase():"INFORMATIVO";
    const status=["PLANIFICADO","EN_CURSO","COMPLETADO","CANCELADO"].includes(clean(b.status,20).toUpperCase())?clean(b.status,20).toUpperCase():"PLANIFICADO";
    const end=date(b.end_date);if(end&&end<start)return json({ok:false,error:"La fecha final no puede ser anterior al inicio"},400);
    const row={title,category:clean(b.category,80)||"HITO",start_date:start,end_date:end,impact_type:impact,impact_value:integer(b.impact_value,0,10000),owner_name:clean(b.owner_name,120),status,dependency_id:b.dependency_id?integer(b.dependency_id,1,2147483647):null,notes:clean(b.notes,1500)};
    const q=await db.from("master_plan_events").insert(row).select("*").single();if(q.error)throw q.error;await audit(p,"CREAR_HITO","master_plan_event",String(q.data.id),action,"OK",{impact_type:impact,impact_value:row.impact_value,start_date:start});return json({ok:true,data:q.data})
  }
  if(action==="plan_update"){
    const id=integer(b.id,1,2147483647);if(!id)return json({ok:false,error:"Hito inválido"},400);const patch:any={updated_at:new Date().toISOString()};
    for(const k of ["title","category","owner_name","notes"]){if(b[k]!==undefined)patch[k]=clean(b[k],k==="notes"?1500:160)}
    if(b.start_date!==undefined)patch.start_date=date(b.start_date);if(b.end_date!==undefined)patch.end_date=date(b.end_date);if(b.impact_value!==undefined)patch.impact_value=integer(b.impact_value,0,10000);if(b.dependency_id!==undefined)patch.dependency_id=b.dependency_id?integer(b.dependency_id,1,2147483647):null;
    if(b.impact_type!==undefined){const v=clean(b.impact_type,30).toUpperCase();if(!["INFORMATIVO","SUBIDA","BAJADA","CAPACIDAD_MAS","CAPACIDAD_MENOS"].includes(v))return json({ok:false,error:"Impacto inválido"},400);patch.impact_type=v}
    if(b.status!==undefined){const v=clean(b.status,20).toUpperCase();if(!["PLANIFICADO","EN_CURSO","COMPLETADO","CANCELADO"].includes(v))return json({ok:false,error:"Estado inválido"},400);patch.status=v}
    const q=await db.from("master_plan_events").update(patch).eq("id",id).select("*").single();if(q.error)throw q.error;await audit(p,"ACTUALIZAR_HITO","master_plan_event",String(id),action,"OK",{status:q.data.status,impact_type:q.data.impact_type});return json({ok:true,data:q.data})
  }
  if(action==="plan_delete"){
    const id=integer(b.id,1,2147483647);if(!id)return json({ok:false,error:"Hito inválido"},400);const q=await db.from("master_plan_events").delete().eq("id",id);if(q.error)throw q.error;await audit(p,"ELIMINAR_HITO","master_plan_event",String(id),action);return json({ok:true})
  }

  if(action==="scenario_save"){
    const name=clean(b.name,160),base=date(b.base_date);if(!name||!base)return json({ok:false,error:"Nombre y fecha base son obligatorios"},400);const days=integer(b.days,1,31);const assumptions=Array.isArray(b.assumptions)?b.assumptions.slice(0,100).map((x:any)=>({type:clean(x?.type,30).toUpperCase(),date:date(x?.date),end_date:date(x?.end_date),value:integer(x?.value,0,10000),label:clean(x?.label,160)})).filter((x:any)=>x.date&&["SUBIDA","BAJADA","CAPACIDAD_MAS","CAPACIDAD_MENOS"].includes(x.type)):[];const summary=safeDetails(b.summary);
    let q:any;if(b.id){const id=integer(b.id,1,2147483647);q=await db.from("what_if_scenarios").update({name,base_date:base,days,assumptions,summary,created_by_profile:p,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(q.error)throw q.error;await audit(p,"ACTUALIZAR_ESCENARIO","what_if_scenario",String(id),action,"OK",{name,days,assumptions:assumptions.length})}else{q=await db.from("what_if_scenarios").insert({name,base_date:base,days,assumptions,summary,created_by_profile:p}).select("*").single();if(q.error)throw q.error;await audit(p,"GUARDAR_ESCENARIO","what_if_scenario",String(q.data.id),action,"OK",{name,days,assumptions:assumptions.length})}return json({ok:true,data:q.data})
  }
  if(action==="scenario_delete"){
    const id=integer(b.id,1,2147483647);if(!id)return json({ok:false,error:"Escenario inválido"},400);const q=await db.from("what_if_scenarios").delete().eq("id",id);if(q.error)throw q.error;await audit(p,"ELIMINAR_ESCENARIO","what_if_scenario",String(id),action);return json({ok:true})
  }

  if(action==="audit"){await audit(p,clean(b.action,80)||"ACCION_FRONTEND",clean(b.entity_type,50),clean(b.entity_id,80),clean(b.endpoint,100),clean(b.result,20)||"OK",b.details);return json({ok:true})}
  return json({ok:false,error:"Ruta no encontrada"},404)
}catch(e){console.error(e);return json({ok:false,error:"Error temporal del servidor",detail:e instanceof Error?e.message:String(e)},500)}});
