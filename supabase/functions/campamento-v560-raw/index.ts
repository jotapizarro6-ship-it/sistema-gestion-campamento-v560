import { createClient } from "jsr:@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const TZ="America/Santiago",enc=new TextEncoder();
const clean=(v:any)=>String(v??"").trim();
const plain=(v:any)=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const loc=(v:any,k="x")=>{let s=plain(v);if(!s)return "";if(k==="room"){const n=Number(s.replace(",","."));if(Number.isFinite(n))return Number.isInteger(n)?String(n):String(n).replace(/\.0+$/,"")}if(k==="bed")s=s.replace(/^CAMA\s+/,"");return s};
const key=(m:any,r:any,b:any)=>`${loc(m,"module")}|${loc(r,"room")}|${loc(b,"bed")}`;
function today(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
const now=()=>new Intl.DateTimeFormat("es-CL",{timeZone:TZ,dateStyle:"short",timeStyle:"medium"}).format(new Date());
const validDate=(x:any)=>/^\d{4}-\d{2}-\d{2}$/.test(clean(x))&&!Number.isNaN(new Date(`${clean(x)}T00:00:00Z`).getTime());
async function cfg(keys:string[]){const {data,error}=await db.from("settings").select("key,value").in("key",keys);if(error)throw error;return Object.fromEntries((data??[]).map((r:any)=>[r.key,r.value]))}
async function sign(secret:string,msg:string){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=await crypto.subtle.sign("HMAC",k,enc.encode(msg));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function ub64(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return atob(s)}
async function admin(req:Request){const h=req.headers.get("authorization")||"";if(!h.startsWith("Bearer "))return false;const [p,s]=h.slice(7).split(".");if(!p||!s)return false;try{if(Date.now()>JSON.parse(ub64(p)).exp)return false}catch{return false}const c=await cfg(["session_secret"]);return !!c.session_secret&&(await sign(c.session_secret,p))===s}
const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store","x-content-type-options":"nosniff"};
const out=(x:any,status=200)=>new Response(JSON.stringify(x),{status,headers:{...headers,"content-type":"application/json; charset=utf-8"}});
async function body(req:Request){return await req.json().catch(()=>({}))}
async function rows(table:string,select="*",apply?:(q:any)=>any){let all:any[]=[];for(let i=0;i<20000;i+=1000){let q=db.from(table).select(select).range(i,i+999);if(apply)q=apply(q);const {data,error}=await q;if(error)throw error;all.push(...(data||[]));if((data||[]).length<1000)break}return all}
const active=(r:any)=>["PENDIENTE","CONFIRMADA"].includes(plain(r.status));
async function state(){const [workers,inventory,blocks,reservations,movements,capacities,snapshots,settingsRows,imports]=await Promise.all([rows("workers"),rows("bed_inventory"),rows("bed_blocks"),rows("reservations"),rows("movements"),rows("daily_capacity"),rows("daily_snapshots","*",q=>q.order("snapshot_date",{ascending:true})),rows("settings","key,value"),rows("import_history","*",q=>q.order("id",{ascending:false}))]);const settings=Object.fromEntries(settingsRows.filter((x:any)=>!["admin_password_hash","admin_password_salt","session_secret"].includes(x.key)).map((x:any)=>[x.key,x.value]));return {workers,inventory,blocks,reservations,movements,capacities,snapshots,settings,imports}}
function canonicalRut(v:any){
  const s=plain(v)
    .replace(/\./g,"")
    .replace(/-/g,"")
    .replace(/\s+/g,"");

  if(!/^\d{7,8}[0-9K]$/.test(s)){
    return "";
  }

  return `${s.slice(0,-1)}-${s.slice(-1)}`;
}

function validChileanRut(v:any){
  const rut=canonicalRut(v);

  if(!rut){
    return false;
  }

  const parts=rut.split("-");
  const body=parts[0];
  const supplied=parts[1];

  let sum=0;
  let multiplier=2;

  for(let i=body.length-1;i>=0;i--){
    sum+=Number(body[i])*multiplier;

    multiplier=
      multiplier===7
        ? 2
        : multiplier+1;
  }

  const remainder=11-(sum%11);

  const expected=
    remainder===11
      ? "0"
      : remainder===10
        ? "K"
        : String(remainder);

  return expected===supplied;
}

function canonicalPopulation(
  workers:any[],
  universeKeys:Set<string>
){
  const byBed=new Map<string,any>();

  for(const w of workers){
    const bedKey=key(
      w.modulo,
      w.habitacion,
      w.cama
    );

    if(
      !bedKey.split("|").every(Boolean) ||
      !universeKeys.has(bedKey) ||
      !validChileanRut(w.rut)
    ){
      continue;
    }

    if(!byBed.has(bedKey)){
      byBed.set(
        bedKey,
        {
          ...w,
          rut:canonicalRut(w.rut)
        }
      );
    }
  }

  return [...byBed.values()];
}

function physical(
  workers:any[],
  universeKeys:Set<string>
){
  return canonicalPopulation(
    workers,
    universeKeys
  ).length;
}
function operationalUniverse(inventory:any[]){
  const keys=new Set<string>();
  for(const b of inventory){
    const k=key(b.module,b.room,b.bed);
    if(k.split("|").every(Boolean))keys.add(k);
  }
  return {count:keys.size,keys};
}

function capFor(ds:string,capacities:any[],inventory:any[]){
  const universe=operationalUniverse(inventory);
  const exact=capacities.find(r=>clean(r.capacity_date)===ds);

  if(exact){
    if(exact.capacity===null||exact.capacity===undefined){
      throw new Error("CAPACITY_UNAVAILABLE");
    }

    const base=Number(exact.capacity);

    if(!Number.isFinite(base)||base<0){
      throw new Error("CAPACITY_UNAVAILABLE");
    }

    return {
      base,
      source:"DAILY_CAPACITY",
      universe
    };
  }

  if(universe.count>0){
    return {
      base:universe.count,
      source:"OPERATIONAL_UNIVERSE",
      universe
    };
  }

  throw new Error("CAPACITY_UNAVAILABLE");
}

async function revision(){
  const {data,error}=await db
    .from("settings")
    .select("value")
    .eq("key","operational_revision")
    .maybeSingle();

  if(error)throw error;

  const rawValue=clean(data?.value);

  if(!/^\d+$/.test(rawValue)){
    throw new Error("OPERATIONAL_REVISION_UNAVAILABLE");
  }

  return Number(rawValue);
}
function fulfilled(r:any,workers:any[],todayS:string){if(Number(r.bed_count||0)!==1||!clean(r.person_name)||clean(r.arrival_date)>todayS)return 0;const n=plain(r.person_name);if(clean(r.module)&&clean(r.room)&&clean(r.bed)){const w=workers.find(x=>key(x.modulo,x.habitacion,x.cama)===key(r.module,r.room,r.bed)&&clean(x.rut));return w&&plain(w.nombre)===n?1:0}return workers.some(w=>clean(w.rut)&&plain(w.nombre)===n)?1:0}
function reserved(ds:string,res:any[],workers:any[],todayS:string){let n=0;for(const r of res.filter(x=>active(x)&&clean(x.arrival_date)<=ds&&(!clean(x.departure_date)||clean(x.departure_date)>ds))){const c=Math.max(Number(r.bed_count||0),0);n+=Math.max(c-(ds>=todayS?fulfilled(r,workers,todayS):0),0)}return n}
async function snapshot(closeDay=false,force=false){
  const ds=today();

  const oldQ=await db
    .from("daily_snapshots")
    .select("*")
    .eq("snapshot_date",ds)
    .maybeSingle();

  if(oldQ.error)throw oldQ.error;

  if(
    oldQ.data&&
    clean(oldQ.data.closed_at)&&
    !force
  ){
    return oldQ.data;
  }

  const sourceRevisionBefore=await revision();
  const s=await state();
  const sourceRevisionAfter=await revision();

  if(sourceRevisionBefore!==sourceRevisionAfter){
    throw new Error(
      `STATE_CONFLICT current=${sourceRevisionAfter} expected=${sourceRevisionBefore}`
    );
  }

  const capacityInfo=capFor(
    ds,
    s.capacities,
    s.inventory
  );

  const blocked=new Set(
    s.blocks
      .filter(
        (x:any)=>
          plain(x.status)==="ACTIVO"&&
          clean(x.start_date)<=ds&&
          (
            !clean(x.end_date)||
            clean(x.end_date)>=ds
          )
      )
      .map(
        (x:any)=>
          key(x.module,x.room,x.bed)
      )
      .filter(
        (k:string)=>
          capacityInfo.universe.keys.has(k)
      )
  ).size;

  const base=capacityInfo.base;
  const capacity=Math.max(base-blocked,0);

    const canonicalWorkers=canonicalPopulation(
    s.workers,
    capacityInfo.universe.keys
  );

  const occupied=canonicalWorkers.length;

  const reservedN=reserved(ds,s.reservations,canonicalWorkers,ds);

  const free=Math.max(
    capacity-occupied-reservedN,
    0
  );

  const assigned=canonicalWorkers;

  const group=(
    field:string,
    missing:string
  )=>{
    const m=new Map<string,any>();

    for(const w of assigned){
      const rawValue=clean(w[field])||missing;
      const canonical=plain(rawValue);

      m.set(
        canonical,
        {
          label:rawValue,
          n:(m.get(canonical)?.n||0)+1
        }
      );
    }

    return [...m.values()].sort(
      (a,b)=>
        b.n-a.n||
        a.label.localeCompare(b.label)
    );
  };

  const moves=s.movements.filter(
    (x:any)=>
      clean(x.movement_date)===ds
  );

  const activeReservations=s.reservations.filter(
    (x:any)=>
      active(x)&&
      clean(x.arrival_date)<=ds&&
      (
        !clean(x.departure_date)||
        clean(x.departure_date)>ds
      )
  );

  const stamp=now();

  const occupancy=
    capacity>0
      ? Math.round(
          occupied/capacity*1000
        )/10
      : occupied>0
        ? 100
        : 0;

  const committed=occupied+reservedN;

  const committedOccupancy=
    capacity>0
      ? Math.round(
          committed/capacity*1000
        )/10
      : committed>0
        ? 100
        : 0;

  const beforeWriteRevision=await revision();

  if(beforeWriteRevision!==sourceRevisionAfter){
    throw new Error(
      `STATE_CONFLICT current=${beforeWriteRevision} expected=${sourceRevisionAfter}`
    );
  }

  const payload={
    snapshot_date:ds,

    base_capacity:base,
    blocked,
    capacity,

    occupied,
    reserved:reservedN,
    reserved_today:reservedN,
    free,

    occupancy,
    committed_occupancy:committedOccupancy,

    total_workers:canonicalWorkers.length,

    female:canonicalWorkers.filter(
      (x:any)=>
        plain(x.sexo).includes("FEM")
    ).length,

    male:canonicalWorkers.filter(
      (x:any)=>
        plain(x.sexo).includes("MASC")
    ).length,

    companies_json:JSON.stringify(
      group("empresa","SIN EMPRESA")
    ),

    shifts_json:JSON.stringify(
      group("turno","SIN TURNO")
    ),

    modules_json:JSON.stringify(
      group("modulo","SIN PABELLON")
    ),

    movements_json:JSON.stringify(moves),

    reservations_json:JSON.stringify(
      activeReservations
    ),

    capacity_source:capacityInfo.source,

    operational_universe_count:
      capacityInfo.universe.count,

    source_operational_revision:
      sourceRevisionAfter,

    semantic_version:
      "R4_CAPACITY_V1",

    created_at:
      oldQ.data?.created_at||
      stamp,

    updated_at:stamp,

    closed_at:
      closeDay
        ? stamp
        : (
            oldQ.data?.closed_at||
            ""
          )
  };

  const {data,error}=await db
    .from("daily_snapshots")
    .upsert(
      payload,
      {
        onConflict:"snapshot_date"
      }
    )
    .select("*")
    .single();

  if(error)throw error;

  return data;
}

async function addReservation(b:any){const arrival=clean(b.arrival_date),departure=clean(b.departure_date)||null,name=clean(b.person_name),count=Number(b.bed_count||1);let module=clean(b.module),room=clean(b.room),bed=clean(b.bed).toUpperCase();if(!arrival||!name)return {ok:false,error:"Fecha de llegada y nombre son obligatorios."};if(!validDate(arrival)||(departure&&!validDate(departure)))return {ok:false,error:"Las fechas de la reserva no son válidas."};if(departure&&departure<=arrival)return {ok:false,error:"La salida debe ser posterior a la llegada."};if(!Number.isInteger(count)||count<1||count>1000)return {ok:false,error:"La cantidad de camas debe estar entre 1 y 1.000."};if(bed&&(!module||!room))return {ok:false,error:"Si selecciona una cama exacta, debe indicar también módulo y habitación."};if(module&&room&&bed&&count!==1)return {ok:false,error:"Una reserva con cama exacta debe corresponder a 1 cama."};const s=await state();if(module&&room&&bed){const inv=s.inventory.find((x:any)=>key(x.module,x.room,x.bed)===key(module,room,bed));if(!inv)return {ok:false,error:"No fue posible identificar esa cama en el inventario actual."};module=inv.module;room=inv.room;bed=inv.bed;const occ=s.workers.find((x:any)=>clean(x.rut)&&key(x.modulo,x.habitacion,x.cama)===key(module,room,bed));if(occ)return {ok:false,error:`La cama indicada figura actualmente ocupada por ${occ.nombre||"un trabajador"}.`};const end=departure||"9999-12-31";if(s.blocks.some((x:any)=>plain(x.status)==="ACTIVO"&&key(x.module,x.room,x.bed)===key(module,room,bed)&&clean(x.start_date)<end&&(!clean(x.end_date)||clean(x.end_date)>=arrival)))return {ok:false,error:"Esa cama está fuera de servicio durante la reserva."};if(s.reservations.some((x:any)=>active(x)&&key(x.module,x.room,x.bed)===key(module,room,bed)&&clean(x.arrival_date)<end&&(!clean(x.departure_date)||clean(x.departure_date)>arrival)))return {ok:false,error:"Esa cama ya tiene una reserva que se cruza con las fechas indicadas."}}const stamp=now(),{data,error}=await db.from("reservations").insert({arrival_date:arrival,departure_date:departure,person_name:name,role_area:clean(b.role_area),module:module||null,room:room||null,bed:bed||null,bed_count:count,notes:clean(b.notes),status:"PENDIENTE",created_at:stamp,updated_at:stamp}).select("*").single();if(error)throw error;return {ok:true,data}}
async function addBlock(b:any){let module=clean(b.module),room=clean(b.room),bed=clean(b.bed).toUpperCase();const start=clean(b.start_date),end=clean(b.end_date)||null,reason=clean(b.reason)||"Fuera de servicio";if(!module||!room||!bed)return {ok:false,error:"Indica módulo, habitación y cama para el bloqueo."};if(!validDate(start)||(end&&!validDate(end)))return {ok:false,error:"Las fechas del bloqueo no son válidas."};if(end&&end<start)return {ok:false,error:"La fecha de término no puede ser anterior al inicio."};const s=await state(),inv=s.inventory.find((x:any)=>key(x.module,x.room,x.bed)===key(module,room,bed));if(!inv)return {ok:false,error:"No fue posible identificar esa cama en el inventario actual."};module=inv.module;room=inv.room;bed=inv.bed;if(start<=today()){const occ=s.workers.find((x:any)=>clean(x.rut)&&key(x.modulo,x.habitacion,x.cama)===key(module,room,bed));if(occ)return {ok:false,error:`No se puede bloquear desde hoy una cama ocupada por ${occ.nombre||"un trabajador"}.`}}const e=end||"9999-12-31";if(s.blocks.some((x:any)=>plain(x.status)==="ACTIVO"&&key(x.module,x.room,x.bed)===key(module,room,bed)&&clean(x.start_date)<=e&&(!clean(x.end_date)||clean(x.end_date)>=start)))return {ok:false,error:"Ya existe un bloqueo activo que se cruza con esas fechas."};const rr=s.reservations.find((x:any)=>active(x)&&key(x.module,x.room,x.bed)===key(module,room,bed)&&clean(x.arrival_date)<=e&&(!clean(x.departure_date)||clean(x.departure_date)>start));if(rr)return {ok:false,error:`No se puede bloquear: existe una reserva cruzada para ${rr.person_name}.`};const stamp=now(),{data,error}=await db.from("bed_blocks").insert({module,room,bed,start_date:start,end_date:end,reason,status:"ACTIVO",created_at:stamp,updated_at:stamp}).select("*").single();if(error)throw error;return {ok:true,data}}
Deno.serve(async(req:Request)=>{try{if(req.method==="OPTIONS")return new Response(null,{status:204,headers});if(!await admin(req))return out({ok:false,error:"No autorizado"},401);const a=new URL(req.url).searchParams.get("action")||"";
if(req.method==="GET"&&a==="advanced_state")return out({ok:true,data:await state()});
if(req.method==="POST"&&a==="add_movement"){const b=await body(req),d=clean(b.movement_date),n=Number(b.people_count),t=plain(b.movement_type||"SUBIDA");if(!validDate(d))return out({ok:false,error:"Indica una fecha válida para el movimiento."},400);if(!Number.isInteger(n)||n<0||n>10000)return out({ok:false,error:"La cantidad de personas debe estar entre 0 y 10.000."},400);if(!["SUBIDA","BAJADA"].includes(t))return out({ok:false,error:"El tipo de movimiento no es válido."},400);const {data,error}=await db.from("movements").insert({movement_date:d,movement_type:t,shift:clean(b.shift),company:clean(b.company),people_count:n,bus_time:clean(b.bus_time),bus:clean(b.bus),notes:clean(b.notes),created_at:now()}).select("*").single();if(error)throw error;return out({ok:true,data})}
if(req.method==="POST"&&a==="add_block"){const x=await addBlock(await body(req));return out(x,x.ok?200:400)}
if(req.method==="POST"&&a==="close_block"){const b=await body(req),{data,error}=await db.from("bed_blocks").update({status:"CERRADO",updated_at:now()}).eq("id",Number(b.id)).select("id,status").maybeSingle();if(error)throw error;return out({ok:!!data,data,error:data?null:"Bloqueo no encontrado"},data?200:404)}
if(req.method==="POST"&&a==="add_res_advanced"){const x=await addReservation(await body(req));return out(x,x.ok?200:400)}
if(req.method==="POST"&&a==="reservation_status"){const b=await body(req),status=plain(b.status||"ANULADA");if(!["PENDIENTE","CONFIRMADA","ANULADA","CANCELADA"].includes(status))return out({ok:false,error:"Estado de reserva no válido."},400);const {data,error}=await db.from("reservations").update({status,updated_at:now()}).eq("id",Number(b.id)).select("id,status").maybeSingle();if(error)throw error;return out({ok:!!data,data,error:data?null:"Reserva no encontrada"},data?200:404)}
if(req.method==="POST"&&a==="update_capacity"){const b=await body(req),d=clean(b.capacity_date)||today(),c=Number(b.capacity);if(!validDate(d))return out({ok:false,error:"La fecha de capacidad no es válida."},400);if(!Number.isInteger(c)||c<0||c>10000)return out({ok:false,error:"La capacidad debe estar entre 0 y 10.000 camas."},400);const {error}=await db.from("daily_capacity").upsert({capacity_date:d,capacity:c,updated_at:now()},{onConflict:"capacity_date"});if(error)throw error;return out({ok:true,data:{capacity_date:d,capacity:c}})}
if(req.method==="POST"&&a==="update_cost"){const b=await body(req),v=Number(b.cost_per_bed_day);if(!Number.isFinite(v)||v<0||v>100000000)return out({ok:false,error:"El costo por cama-día debe ser igual o mayor a $0."},400);const {error}=await db.from("settings").upsert({key:"cost_per_bed_day",value:String(v)},{onConflict:"key"});if(error)throw error;return out({ok:true,data:{cost_per_bed_day:v}})}
if(req.method==="POST"&&a==="snapshot_today")return out({ok:true,data:await snapshot(false,false)});
if(req.method==="POST"&&a==="close_day"){const b=await body(req),d=clean(b.snapshot_date)||today();if(d!==today())return out({ok:false,error:"Por seguridad, el cierre diario solo puede confirmarse para la fecha actual."},400);return out({ok:true,data:await snapshot(true,false),message:`Cierre operacional guardado para ${d}.`})}
if(req.method==="GET"&&a==="backup_json")return out({ok:true,data:{generated_at:now(),version:"cloud-v5.6.0",...(await state())}});
return out({ok:false,error:"Ruta no encontrada"},404)}
catch(e){
  console.error(e);

  const detail=
    e instanceof Error
      ? e.message
      : String(e);

  if(detail.includes("STATE_CONFLICT")){
    return out(
      {
        ok:false,
        code:"STATE_CONFLICT",
        error:
          "Los datos cambiaron durante la captura. Actualiza y vuelve a intentar.",
        detail
      },
      409
    );
  }

  if(
    detail.includes("CAPACITY_UNAVAILABLE")
  ){
    return out(
      {
        ok:false,
        code:"CAPACITY_UNAVAILABLE",
        error:
          "No fue posible resolver una capacidad operacional valida.",
        detail
      },
      422
    );
  }

  if(
    detail.includes(
      "OPERATIONAL_REVISION_UNAVAILABLE"
    )
  ){
    return out(
      {
        ok:false,
        code:"OPERATIONAL_REVISION_UNAVAILABLE",
        error:
          "No fue posible certificar la revision operacional.",
        detail
      },
      409
    );
  }

  return out(
    {
      ok:false,
      error:"Error temporal del servidor",
      detail
    },
    500
  );
}});
