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

const app2b=
  fs.readFileSync(
    path.join(
      root,
      "assets",
      "app-2b.js"
    ),
    "utf8"
  );

const app3b=
  fs.readFileSync(
    path.join(
      root,
      "assets",
      "app-3b.js"
    ),
    "utf8"
  );

assert(
  !/Math\.max\(\s*132\b/.test(
    app2b
  ),
  "chart still contains Math.max(132...)"
);

for(
  const metric of
  [
    "RISK_DAYS_90",
    "PEAK_PRESSURE_PCT",
    "DEFICIT_DAYS",
    "MAX_DEFICIT_BEDS"
  ]
){
  assert(
    app2b.includes(metric),
    "missing metric "+
    metric
  );
}

assert(
  app2b.includes(
    "forecastCapacityComplete"
  ),
  "forecast completeness gate missing"
);

assert(
  app3b.includes(
    "capacity_available"
  ),
  "planning provenance missing"
);

assert(
  app3b.includes(
    "capacity_source"
  ),
  "planning source missing"
);

assert(
  app3b.includes(
    "renderManagementCapacityAvailable"
  ),
  "management availability guard missing"
);

const context={
  console,
  Set,
  Map,
  Math,
  Number,
  String,
  Array,
  Object,
  Date,

  clean:
    v=>
      String(v??"")
        .trim(),

  plain:
    v=>
      String(v??"")
        .trim()
        .toUpperCase(),

  loc:
    (v)=>
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

  todayISO:
    ()=>"2026-09-01",

  addDays:
    (iso,n)=>{
      const d=
        new Date(
          iso+
          "T12:00:00Z"
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
      iso.slice(5,7),

  fmtDate:
    v=>String(v),

  fmt1:
    v=>String(v),

  fmtInt:
    v=>String(v),

  esc:
    v=>String(v??"")
};

vm.createContext(context);

vm.runInContext(
  app2a+
  "\n"+
  app2b+
  "\n"+
  app3b+
  "\nthis.__r4b={planningRows,svgForecast};",
  context
);

const unavailable=
  {
    workers:[],
    inventory:[],
    blocks:[],
    reservations:[],
    movements:[],
    capacities:[],
    snapshots:[],
    settings:{}
  };

const row=
  context.__r4b
    .planningRows(
      "2026-09-01",
      1,
      unavailable
    )[0];

assert.strictEqual(
  row.capacity_available,
  false
);

assert.strictEqual(
  row.capacity_source,
  null
);

assert.strictEqual(
  row.capacity,
  null
);

assert.strictEqual(
  row.free,
  null
);

assert.strictEqual(
  row.committed_occupancy,
  null
);

assert.strictEqual(
  row.over,
  null
);

const chart=
  context.__r4b
    .svgForecast([
      {
        label:"01/09",
        capacity:null,
        capacity_available:false,
        physical:5,
        reserved:2,
        committed:7
      },
      {
        label:"02/09",
        capacity:10,
        capacity_available:true,
        physical:5,
        reserved:2,
        committed:7
      }
    ]);

assert(
  chart.includes(
    "CAPACIDAD NO DISPONIBLE"
  )
);

assert(
  !chart.includes(
    "NaN"
  )
);

console.log(
  "R4 B U07 planning provenance : PASS"
);

console.log(
  "R4 B U08 no fabricated metric: PASS"
);

console.log(
  "R4 B chart no 132 floor      : PASS"
);

console.log(
  "R4 B RISK_DAYS_90            : PASS"
);

console.log(
  "R4 B PEAK_PRESSURE_PCT        : PASS"
);

console.log(
  "R4 B DEFICIT_DAYS             : PASS"
);

console.log(
  "R4 B MAX_DEFICIT_BEDS         : PASS"
);

console.log(
  "R4 ANALYTICS/PLANNING SMOKE: PASS"
);
