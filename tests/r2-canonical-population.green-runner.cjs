"use strict";

const fs=require("fs");
const path=require("path");

const ROOT=path.resolve(__dirname,"..");

function read(...parts){
  const file=path.join(ROOT,...parts);

  if(!fs.existsSync(file)){
    throw new Error("Missing file: "+file);
  }

  return fs
    .readFileSync(file,"utf8")
    .replace(/\r\n/g,"\n")
    .replace(/\r/g,"\n");
}

function compact(source){
  return source.replace(/\s+/g," ").trim();
}

function result(id,pass,evidence){
  return {
    id,
    pass:Boolean(pass),
    evidence:String(evidence)
  };
}

const contract=JSON.parse(
  read(
    "tests",
    "r2-canonical-population.contract.json"
  )
);

const semantic=compact(
  read(
    "assets",
    "semantic-model-runtime.js"
  )
);

const workforce=compact(
  read(
    "assets",
    "workforce-mod-moi.js"
  )
);

const decision=compact(
  read(
    "assets",
    "decision-cockpit.js"
  )
);

const bi=compact(
  read(
    "assets",
    "bi-dashboard.js"
  )
);

const resilience=compact(
  read(
    "assets",
    "resilience-runtime.js"
  )
);

const app4=compact(
  read(
    "assets",
    "app-4.js"
  )
);

if(
  contract.contract!==
  "GARPI_R2_CANONICAL_POPULATION"
){
  throw new Error(
    "Unexpected R2 contract identity."
  );
}

if(Number(contract.revision)!==1){
  throw new Error(
    "Unexpected R2 contract revision."
  );
}

if(
  !Array.isArray(contract.tests)||
  contract.tests.length!==10
){
  throw new Error(
    "R2 contract must contain 10 tests."
  );
}

const semanticRut=
  /typeof rutValid!=='function'\|\|!rutValid\(w\.rut\)/
    .test(semantic);

const semanticLocation=
  /k\.split\('\|'\)\.every\(Boolean\)/
    .test(semantic);

const semanticInventorySet=
  /const inventoryKeys=new Set\(\)/
    .test(semantic);

const semanticInventoryGate=
  /!inventoryKeys\.has\(k\)/
    .test(semantic);

const semanticAssigned=
  /assignedWorkers\.push\(w\)/
    .test(semantic);

const fastUsesAssigned=
  /function fastOccupiedWorkers\(data\)\{return getModel\(data\)\.assignedWorkers\}/
    .test(semantic);

const occupiedAlias=
  /occupiedWorkers=fastOccupiedWorkers/
    .test(semantic);

const workforceCanonical=
  /occupiedWorkers\(modelData\)/
    .test(workforce)&&
  /const base=canonicalWorkers\(workers,data\)/
    .test(workforce);

const workforceFailClosed=
  /if\(!modelData\|\|typeof occupiedWorkers!=='function'\)return \[\]/
    .test(workforce);

const decisionCanonical=
  /const canonicalWorkers=data=>typeof occupiedWorkers==='function'\?occupiedWorkers\(data\):\[\]/
    .test(decision)&&
  /const workerAssigned=data=>canonicalWorkers\(data\)/
    .test(decision)&&
  /const filteredWorkers=data=>canonicalWorkers\(data\)/
    .test(decision);

const biCanonical=
  /const workers=typeof occupiedWorkers==='function'\?occupiedWorkers\(data\):\[\]/
    .test(bi)&&
  /return workers\.filter\(w=>/
    .test(bi);

const fixedBusiness504=
  /\bEXPECTED_BEDS\b/
    .test(bi)||
  /inventoryGap\s*=\s*Math\.abs/i
    .test(bi);

const fixedGapIssue=
  /inventoryGap\s*\?\s*1\s*:\s*0/
    .test(bi);

const http504Preserved=
  /RETRYABLE_STATUS[^;]*\b504\b/
    .test(resilience);

const capacity132Preserved=
  /daily_capacity_default\s*\|\|\s*132/
    .test(semantic)||
  /\|\|\s*132\b/
    .test(semantic);

const cacheUpdated=
  /semantic-model-runtime\.js\?v=20260901-r2/
    .test(app4)&&
  /bi-dashboard\.js\?v=20260901-r2/
    .test(app4)&&
  /workforce-mod-moi\.js\?v=20260901-r2/
    .test(app4)&&
  /decision-cockpit\.js\?v=20260901-r2/
    .test(app4);

const results=[
  result(
    "R2-U01",
    semanticRut&&
    semanticLocation&&
    semanticInventorySet&&
    semanticInventoryGate,
    "canonical = valid RUT + complete bed + operational inventory"
  ),

  result(
    "R2-U02",
    semanticRut&&
    workforceCanonical,
    "invalid RUT excluded before workforce/MOD-MOI"
  ),

  result(
    "R2-U03",
    semanticLocation,
    "complete physical location remains mandatory"
  ),

  result(
    "R2-U04",
    semanticInventorySet&&
    semanticInventoryGate,
    "worker bed must exist in operational inventory"
  ),

  result(
    "R2-U05",
    semanticAssigned&&
    fastUsesAssigned&&
    occupiedAlias&&
    decisionCanonical&&
    biCanonical,
    "occupancy/dotation consumers share semantic assignedWorkers"
  ),

  result(
    "R2-U06",
    workforceCanonical&&
    workforceFailClosed,
    "MOD/MOI uses canonical population and fails closed"
  ),

  result(
    "R2-U07",
    !fixedBusiness504,
    "fixed business 504 assumption removed"
  ),

  result(
    "R2-U08",
    http504Preserved,
    "HTTP 504 retry semantics preserved"
  ),

  result(
    "R2-U09",
    !fixedBusiness504&&
    !fixedGapIssue,
    "quality no longer fails due to fixed inventory target"
  ),

  result(
    "R2-U10",
    capacity132Preserved&&
    cacheUpdated,
    "Capacity V1/132 untouched and new runtimes cache-busted"
  )
];

const passed=
  results.filter(x=>x.pass).length;

const failed=
  results.length-passed;

console.log("");
console.log(
  "======================================================"
);

console.log(
  "R2 CANONICAL POPULATION — GREEN"
);

console.log(
  "======================================================"
);

console.log("");

for(const r of results){
  console.log(
    r.id+
    " "+
    (r.pass?"PASS":"FAIL")+
    " :: "+
    r.evidence
  );
}

console.log("");
console.log("TOTAL : "+results.length);
console.log("PASS  : "+passed);
console.log("FAIL  : "+failed);
console.log("");

if(
  passed!==10||
  failed!==0
){
  console.error(
    "R2 GREEN CONTRACT: STOP"
  );

  process.exit(1);
}

console.log(
  "R2 GREEN CONTRACT: PASS"
);

console.log(
  "R2 GREEN STATUS: 10/10"
);

process.exit(0);
