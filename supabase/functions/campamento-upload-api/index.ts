import { createClient } from "jsr:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const TZ="America/Santiago",enc=new TextEncoder();
const clean=(v:any)=>String(v??"").trim();
const normH=(v:any)=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
const rut=(v:any,dv:any=null)=>{const raw=clean(v).toUpperCase(),d=clean(dv).toUpperCase().replace(/[^0-9K]/g,"");let s=raw.replace(/[^0-9K]/g,"");if(d){let body=s;if(raw.includes("-")){body=raw.slice(0,raw.lastIndexOf("-")).replace(/[^0-9]/g,"")}return body?`${body}-${d}`:""}return s.length>1?s.slice(0,-1)+"-"+s.slice(-1):s};
const formatRut=(v:any)=>{const s=clean(v).toUpperCase().replace(/[^0-9K]/g,"");if(s.length<2)return clean(v)||"No informado";const num=s.slice(0,-1),dv=s.slice(-1);return `${num.replace(/\B(?=(\d{3})+(?!\d))/g,'.')}-${dv}`};
function validRut(v:any){const m=/^(\d{5,9})-([0-9K])$/.exec(rut(v));if(!m)return false;let sum=0,mult=2;for(let i=m[1].length-1;i>=0;i--){sum+=Number(m[1][i])*mult;mult=mult===7?2:mult+1}const n=11-(sum%11),expected=n===11?'0':n===10?'K':String(n);return m[2]===expected}
const now=()=>new Intl.DateTimeFormat("es-CL",{timeZone:TZ,dateStyle:"short",timeStyle:"medium"}).format(new Date());
async function cfg(keys:string[]){const {data,error}=await db.from("settings").select("key,value").in("key",keys);if(error)throw error;return Object.fromEntries((data??[]).map((r:any)=>[r.key,r.value]))}
async function sign(secret:string,msg:string){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=await crypto.subtle.sign("HMAC",k,enc.encode(msg));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function ub64(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return atob(s)}
async function isAdmin(req:Request){const h=req.headers.get("authorization")??"";if(!h.startsWith("Bearer "))return false;const [p,s]=h.slice(7).split(".");if(!p||!s)return false;try{if(Date.now()>JSON.parse(ub64(p)).exp)return false}catch{return false}const c=await cfg(["session_secret"]);return !!c.session_secret&&(await sign(c.session_secret,p))===s}
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store","x-content-type-options":"nosniff"};
const json=(data:any,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{...cors,...extra,"content-type":"application/json; charset=utf-8"}});
class ValidationError extends Error{}

const aliases={rut:["RUT","RUT TRABAJADOR"],dv:["DV","DIGITO VERIFICADOR","D V"],name:["NOMBRE COMPLETO","NOMBRE TRABAJADOR","TRABAJADOR","NOMBRE"],names:["NOMBRES"],ap1:["APELLIDO PATERNO","APELLIDO 1"],ap2:["APELLIDO MATERNO","APELLIDO 2"],turno:["TURNO","REGIMEN","SISTEMA TURNO"],estadoTurno:["ESTADO TURNO","ESTADO DEL TURNO"],module:["PABELLON TAB","PABELLON","MODULO"],room:["HABITACON TAB","HABITACION TAB","HABITACION","HAB"],bed:["CAMAS","CAMA"],empresa:["EMPRESA","EMPRESA CONTRATISTA","CONTRATISTA"],especialidad:["ESPECIALIDAD","AREA"],categoria:["ESPECIALIDAD CATEGORIA","CATEGORIA","CARGO"],sexo:["SEXO","GENERO"],ciudad:["CIUDAD DE RESIDENCIA","CIUDAD RESIDENCIA","CIUDAD","COMUNA DE RESIDENCIA","COMUNA RESIDENCIA","COMUNA"],region:["REGION DE RESIDENCIA","REGION RESIDENCIA","REGION"],residencia:["LUGAR DE RESIDENCIA","RESIDENCIA","DOMICILIO"],camp:["CAMPAMENTO"],roomType:["TIPO DE HABITACION","TIPO HABITACION"]};
function findIdx(h:string[],a:string[]){for(const x of a){const i=h.indexOf(normH(x));if(i>=0)return i}return -1}

async function parseExcel(file:File){
  const started=performance.now(),ab=await file.arrayBuffer();
  if(ab.byteLength>15*1024*1024)throw new ValidationError("El archivo supera el máximo permitido de 15 MB.");
  const wb=XLSX.read(new Uint8Array(ab),{type:"array",cellDates:false});
  if(!wb.SheetNames.length)throw new ValidationError("El Excel no contiene hojas.");
  const ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false}) as any[][];
  let hr=-1;
  for(let i=0;i<Math.min(rows.length,20);i++){const h=(rows[i]??[]).map(normH);if(findIdx(h,aliases.rut)>=0&&(findIdx(h,aliases.module)>=0||findIdx(h,aliases.bed)>=0)){hr=i;break}}
  if(hr<0)for(let i=0;i<Math.min(rows.length,20);i++){const h=(rows[i]??[]).map(normH);if(findIdx(h,aliases.rut)>=0){hr=i;break}}
  if(hr<0)throw new ValidationError("No encontré la fila de encabezados ni la columna RUT.");
  const h=(rows[hr]??[]).map(normH),I:any={};for(const k of Object.keys(aliases))I[k]=findIdx(h,(aliases as any)[k]);
  if(I.rut<0||I.module<0||I.room<0||I.bed<0||I.estadoTurno<0)throw new ValidationError("Faltan columnas esenciales: RUT, módulo/pabellón, HABITACION TAB/HABITACON TAB, CAMAS o ESTADO TURNO.");
  const val=(row:any[],i:number)=>i>=0?clean(row[i]):"",W=new Map<string,any>(),B=new Map<string,any>(),normCache=new Map<string,string>(),stamp=now();
  const norm=(v:any)=>{const s=clean(v);let x=normCache.get(s);if(x===undefined){x=normH(s);normCache.set(s,x)}return x};
  let lastModule="",lastRoom="",lastCamp="",lastRoomType="",enTurnoRows=0,enTurnoRowsWithLocation=0;
  for(let n=hr+1;n<rows.length;n++){
    const row=rows[n]??[],estadoTurno=norm(val(row,I.estadoTurno)),inTurn=estadoTurno==="EN TURNO";
    const rawModule=val(row,I.module),rawRoom=val(row,I.room),bed=val(row,I.bed),rawCamp=val(row,I.camp),rawRoomType=val(row,I.roomType);
    if(rawModule){if(lastModule&&norm(rawModule)!==norm(lastModule))lastRoom="";lastModule=rawModule}
    const module=rawModule||(bed?lastModule:"");if(rawRoom)lastRoom=rawRoom;const room=rawRoom||(bed?lastRoom:"");
    if(rawCamp)lastCamp=rawCamp;const camp=rawCamp||(bed?lastCamp:"");if(rawRoomType)lastRoomType=rawRoomType;const roomType=rawRoomType||(bed?lastRoomType:"");
    if(inTurn){enTurnoRows++;if(module&&room&&bed){enTurnoRowsWithLocation++;const key=[norm(module),norm(room),norm(bed)].join("|");if(!B.has(key))B.set(key,{module,room,bed,room_type:roomType,camp,updated_at:stamp})}}
    if(!inTurn)continue;
    const r=rut(val(row,I.rut),val(row,I.dv));if(!r)continue;
    let name=val(row,I.name);if(!name)name=[val(row,I.names),val(row,I.ap1),val(row,I.ap2)].filter(Boolean).join(" ");
    if(!validRut(r)){
      const shownName=name||"Nombre no informado";
      throw new ValidationError(`Carga detenida por seguridad. RUT inválido: ${formatRut(r)} · Trabajador: ${shownName} · Fila Excel: ${n+1}. Corrige el RUT en la planilla y vuelve a cargarla. La base vigente no fue reemplazada.`);
    }
    if(!name)continue;
    const ciudad=val(row,I.ciudad),region=val(row,I.region),residencia=val(row,I.residencia)||[ciudad,region].filter(Boolean).join(" · ");
    const cand={rut:r,nombre:name,turno:val(row,I.turno),modulo:module||"",habitacion:room||"",cama:bed||"",empresa:val(row,I.empresa),especialidad:val(row,I.especialidad),categoria:val(row,I.categoria),sexo:val(row,I.sexo),residencia,updated_at:stamp},old=W.get(r),candAssigned=!!(module&&room&&bed),oldAssigned=!!(old&&old.modulo&&old.habitacion&&old.cama);if(!old||(!oldAssigned&&candAssigned))W.set(r,cand)
  }
  if(enTurnoRows===0)throw new ValidationError("La columna ESTADO TURNO no contiene filas con valor EN TURNO.");
  if(B.size===0)throw new ValidationError("El Excel no contiene inventario de camas válido para ESTADO TURNO = EN TURNO.");
  if(enTurnoRowsWithLocation!==enTurnoRows)throw new ValidationError(`Carga detenida por seguridad: ${enTurnoRows-enTurnoRowsWithLocation} fila(s) EN TURNO no tienen módulo, habitación o cama completos. La base vigente no fue reemplazada.`);
  const duplicateBedRows=enTurnoRowsWithLocation-B.size;
  if(duplicateBedRows>0)throw new ValidationError(`Carga detenida por seguridad: se detectaron ${duplicateBedRows} fila(s) EN TURNO que repiten una cama ya identificada. Se encontraron ${B.size} camas únicas entre ${enTurnoRowsWithLocation} filas con ubicación completa. Corrige las camas duplicadas y vuelve a cargar la planilla. La base vigente no fue reemplazada.`);
  if(W.size===0)throw new ValidationError("El Excel no contiene trabajadores EN TURNO válidos para cargar.");
  return {workers:[...W.values()],beds:[...B.values()],sheet:wb.SheetNames[0],en_turno_rows:enTurnoRows,inventory_beds:B.size,parse_ms:performance.now()-started};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  try{
    if(req.method!=="POST")return json({ok:false,error:"Método no permitido"},405);
    if(!await isAdmin(req))return json({ok:false,error:"No autorizado"},401);
    const f=await req.formData(),file=f.get("file");
    if(!(file instanceof File)||!file.name)return json({ok:false,error:"No se recibió un archivo Excel"},400);
    if(!/\.(xlsx|xlsm|xls)$/i.test(file.name))return json({ok:false,error:"Formato no permitido"},400);
    const parsed=await parseExcel(file),stamp=now(),dbStarted=performance.now();
    const q=await db.rpc("replace_current_assignment",{p_workers:parsed.workers,p_beds:parsed.beds,p_filename:file.name,p_imported_at:stamp});if(q.error)throw q.error;
    const dbMs=performance.now()-dbStarted;
    return json({ok:true,data:{...q.data,sheet:parsed.sheet,en_turno_rows:parsed.en_turno_rows,inventory_beds:parsed.inventory_beds,performance:{parse_ms:Math.round(parsed.parse_ms),database_ms:Math.round(dbMs)}}},200,{'server-timing':`excel;dur=${parsed.parse_ms.toFixed(1)}, dbreplace;dur=${dbMs.toFixed(1)}`,'x-camp-upload-engine':'v5'});
  }catch(e){console.error(e);if(e instanceof ValidationError)return json({ok:false,error:e.message},422);return json({ok:false,error:"Error temporal del servidor",detail:e instanceof Error?e.message:String(e)},500)}
});
