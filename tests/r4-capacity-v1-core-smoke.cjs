"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=
  path.resolve(
    __dirname,
    ".."
  );

const app2a=
  fs.readFileSync(
    path.join(
      root,
      "assets",
      "app-2a.js"
    ),
    "utf8"
  );

const semantic=
  fs.readFileSync(
    path.join(
      root,
      "assets",
      "semantic-model-runtime.js"
    ),
    "utf8"
  );

const forbidden=
  app2a+"\n"+semantic;

assert(
  !/daily_capacity_default/i.test(
    forbidden
  ),
  "daily_capacity_default remains active"
);

assert(
  !/\|\|\s*132\b/.test(
    forbidden
  ),
  "|| 132 remains active"
);

assert(
  !/\?\?\s*132\b/.test(
    forbidden
  ),
  "?? 132 remains active"
);

assert(
  !/Math\.max\(\s*132\b/.test(
    forbidden
  ),
  "Math.max(132...) remains active"
);

assert(
  semantic.includes(
    "resolveCapacityV1("
  ),
  "semantic runtime must delegate to canonical resolver"
);

const context={
  console,
  Map,
  Set,
  Math,
  Number,
  String,
  Array,
  Object,
  Date,

  todayISO:
    ()=>"2026-09-01",

  clean:
    v=>
      String(v??"")
        .trim(),

  plain:
    v=>
      String(v??"")
        .trim()
        .toUpperCase(),

  lkey:
    (m,r,b)=>
      [
        m,
        r,
        b
      ]
        .map(
          v=>
            String(v??"")
              .trim()
              .toUpperCase()
        )
        .join("|"),

  addDays:
    (iso,n)=>{
      const d=
        new Date(
          iso+"T12:00:00Z"
        );

      d.setUTCDate(
        d.getUTCDate()+n
      );

      return d
        .toISOString()
        .slice(0,10);
    },

  fmtShort:
    iso=>
      iso.slice(8,10)+
      "/"+
      iso.slice(5,7)
};

vm.createContext(context);

vm.runInContext(
  app2a+
  "\nthis.__r4={"+
  "operationalUniverseV1,"+
  "resolveCapacityV1,"+
  "effectiveCapacityV1,"+
  "forecast30"+
  "};",
  context
);

const inventory=[
  {
    module:"M1",
    room:"1",
    bed:"A"
  },
  {
    module:"M1",
    room:"1",
    bed:"B"
  },
  {
    module:"M1",
    room:"1",
    bed:"B"
  }
];

const base={
  workers:[],
  inventory,
  blocks:[],
  reservations:[],
  movements:[],
  capacities:[],
  settings:{}
};

const exactZero=
  context.__r4
    .resolveCapacityV1(
      "2026-09-01",
      {
        ...base,
        capacities:[
          {
            capacity_date:
              "2026-09-01",
            capacity:0
          }
        ]
      }
    );

assert.strictEqual(
  exactZero.capacity_available,
  true
);

assert.strictEqual(
  exactZero.capacity_source,
  "DAILY_CAPACITY"
);

assert.strictEqual(
  exactZero.base_capacity,
  0
);

const fallback=
  context.__r4
    .resolveCapacityV1(
      "2026-09-02",
      base
    );

assert.strictEqual(
  fallback.capacity_available,
  true
);

assert.strictEqual(
  fallback.capacity_source,
  "OPERATIONAL_UNIVERSE"
);

assert.strictEqual(
  fallback.base_capacity,
  2
);

const invalidExact=
  context.__r4
    .resolveCapacityV1(
      "2026-09-03",
      {
        ...base,
        capacities:[
          {
            capacity_date:
              "2026-09-03",
            capacity:""
          }
        ]
      }
    );

assert.strictEqual(
  invalidExact.capacity_available,
  false
);

assert.strictEqual(
  invalidExact.code,
  "CAPACITY_UNAVAILABLE"
);

assert.strictEqual(
  invalidExact.capacity_source,
  null
);

const unavailable=
  context.__r4
    .resolveCapacityV1(
      "2026-09-04",
      {
        ...base,
        inventory:[]
      }
    );

assert.strictEqual(
  unavailable.capacity_available,
  false
);

assert.strictEqual(
  unavailable.base_capacity,
  null
);

assert.strictEqual(
  unavailable.capacity_source,
  null
);

const blocked=
  context.__r4
    .effectiveCapacityV1(
      "2026-09-02",
      {
        ...base,
        blocks:[
          {
            module:"M1",
            room:"1",
            bed:"A",
            start_date:
              "2026-09-02",
            end_date:
              "2026-09-02",
            status:"ACTIVO"
          },
          {
            module:"M9",
            room:"9",
            bed:"Z",
            start_date:
              "2026-09-02",
            end_date:
              "2026-09-02",
            status:"ACTIVO"
          }
        ]
      }
    );

assert.strictEqual(
  blocked.base_capacity,
  2
);

assert.strictEqual(
  blocked.blocked,
  1
);

assert.strictEqual(
  blocked.capacity,
  1
);

const forecastUnavailable=
  context.__r4
    .forecast30({
      ...base,
      inventory:[]
    })[0];

assert.strictEqual(
  forecastUnavailable.capacity_available,
  false
);

assert.strictEqual(
  forecastUnavailable.capacity,
  null
);

assert.strictEqual(
  forecastUnavailable.free,
  null
);

assert.strictEqual(
  forecastUnavailable.pct,
  null
);

assert.strictEqual(
  forecastUnavailable.over,
  null
);

assert.strictEqual(
  forecastUnavailable.state,
  "unavailable"
);

console.log(
  "R4 CORE U01 resolver         : PASS"
);

console.log(
  "R4 CORE U02 exact zero       : PASS"
);

console.log(
  "R4 CORE U03 universe fallback: PASS"
);

console.log(
  "R4 CORE U04 unavailable      : PASS"
);

console.log(
  "R4 CORE U05 no legacy 132    : PASS"
);

console.log(
  "R4 CORE U06 blocks-after-base: PASS"
);

console.log(
  "R4 CORE U08 forecast closed  : PASS"
);

console.log(
  "R4 CAPACITY CORE SMOKE: PASS"
);
