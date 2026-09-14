import assert from "node:assert/strict";
import fs from "node:fs";

const admin = fs.readFileSync("admin.html", "utf8");
const sw = fs.readFileSync("service-worker.js", "utf8");
const js = fs.readFileSync("assets/ui-v3-1-a2.js", "utf8");
const css = fs.readFileSync("assets/ui-v3-1-a2.css", "utf8");

assert.match(
  admin,
  /ui-v3-1-a2\.css\?v=20260913-v31a21/
);

assert.match(
  admin,
  /ui-v3-1-a2\.js\?v=20260913-v31a21/
);

assert.match(
  sw,
  /ui-v3-2-a1/
);

assert.match(
  js,
  /20260913-v31a21/
);

assert.match(
  js,
  /#view-control-room/
);

assert.doesNotMatch(
  js,
  /#view-command/
);

assert.match(
  js,
  /#opsActionsChart/
);

assert.match(
  js,
  /v31a2-action-summary/
);

assert.match(
  js,
  /v31a2-overview-source/
);

assert.match(
  js,
  /Fuente de capacidad/
);

assert.match(
  css,
  /v31a2-overview-source/
);

console.log("UI V3.1 A2.1 static contract: OK");