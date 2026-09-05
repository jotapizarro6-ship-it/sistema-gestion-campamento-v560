'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const esbuild = require('esbuild');
const { patchNativeAdminAuth } = require('./native/patch-admin-auth.cjs');
const { patchNativeRuntimeEnv } = require('./native/patch-runtime-env.cjs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'mobile-dist');

const adminPath = path.join(root, 'admin.html');
const assetsPath = path.join(root, 'assets');
const versionPath = path.join(root, 'version.json');

const mobileVersionPath = path.join(
  root,
  'mobile',
  'mobile-version.json'
);

const nativeBootstrapPath = path.join(
  root,
  'mobile',
  'garpi-native-bootstrap.js'
);
const nativeRuntimeEntryPath = path.join(
  root,
  'mobile',
  'native',
  'runtime-entry.mjs'
);

const requireFile = file => {
  if (!fs.existsSync(file)) {
    throw new Error(`Required file missing: ${file}`);
  }
};

requireFile(adminPath);
requireFile(assetsPath);
requireFile(mobileVersionPath);
requireFile(nativeBootstrapPath);
requireFile(nativeRuntimeEntryPath);

const mobileVersion = JSON.parse(
  fs.readFileSync(mobileVersionPath, 'utf8')
);

fs.rmSync(out, {
  recursive: true,
  force: true
});

fs.mkdirSync(out, {
  recursive: true
});

fs.cpSync(
  assetsPath,
  path.join(out, 'assets'),
  {
    recursive: true
  }
);

const nativeRuntimeEnvPath = path.join(
  out,
  'assets',
  'garpi-runtime-env.js'
);

requireFile(nativeRuntimeEnvPath);

const nativeRuntimeEnvPatch =
  patchNativeRuntimeEnv(
    nativeRuntimeEnvPath
  );

const nativeAdminCorePath = path.join(
  out,
  'assets',
  'app-4-core.js'
);

requireFile(nativeAdminCorePath);

const nativeAuthPatch =
  patchNativeAdminAuth(
    nativeAdminCorePath
  );

const nativeRuntimeOutputPath = path.join(
  out,
  'assets',
  'garpi-native-runtime.js'
);

esbuild.buildSync({
  entryPoints: [nativeRuntimeEntryPath],
  outfile: nativeRuntimeOutputPath,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120'],
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  charset: 'utf8'
});

let html = fs.readFileSync(
  adminPath,
  'utf8'
);

const publicWorkerLink =
  '<a class="link-back" href="./">← Ir a consulta de trabajadores</a>';

if (!html.includes(publicWorkerLink)) {
  throw new Error(
    'Admin login public-worker link contract changed unexpectedly.'
  );
}

html = html.replace(
  publicWorkerLink,
  '<!-- GARPI Native: public worker link intentionally omitted -->'
);

const runtimeAnchor =
  '<script src="assets/garpi-runtime-env.js"></script>';

if (!html.includes(runtimeAnchor)) {
  throw new Error(
    'GARPI runtime anchor missing from admin.html.'
  );
}

html = html.replace(
  runtimeAnchor,
  '<script src="assets/garpi-native-bootstrap.js"></script>\n  ' +
    runtimeAnchor +
    '\n  <script src="assets/garpi-native-runtime.js"></script>'
);

const headMarker =
  '<meta name="garpi-client" content="GARPI Admin Android">';

if (!html.includes('</head>')) {
  throw new Error(
    'admin.html head closing tag missing.'
  );
}

html = html.replace(
  '</head>',
  `  ${headMarker}\n</head>`
);

fs.writeFileSync(
  path.join(out, 'index.html'),
  html,
  'utf8'
);

fs.copyFileSync(
  nativeBootstrapPath,
  path.join(
    out,
    'assets',
    'garpi-native-bootstrap.js'
  )
);

/*
 * GARPI Web/PWA and GARPI Native intentionally diverge here:
 *
 * Web keeps assets/ts/pwa/runtime.js and service-worker.js.
 * Android Capacitor shell must not register/install the PWA runtime.
 *
 * This changes ONLY the generated mobile copy of app-4.js.
 * The Web source remains byte-for-byte untouched.
 */
const app4Path = path.join(
  out,
  'assets',
  'app-4.js'
);

requireFile(app4Path);

let app4 = fs.readFileSync(
  app4Path,
  'utf8'
);

const pwaRuntimeLine =
  `document.write('<script src="assets/ts/pwa/runtime.js?v=20260830-modern1"></script>');`;

if (!app4.includes(pwaRuntimeLine)) {
  throw new Error(
    'Expected Web PWA runtime loader was not found in mobile app-4 copy.'
  );
}

app4 = app4.replace(
  pwaRuntimeLine,
  '/* GARPI Native: Web PWA runtime intentionally omitted. */'
);

fs.writeFileSync(
  app4Path,
  app4,
  'utf8'
);

if (fs.existsSync(versionPath)) {
  fs.copyFileSync(
    versionPath,
    path.join(out, 'web-version.json')
  );
}

const git = (...args) =>
  childProcess
    .execFileSync(
      'git',
      args,
      {
        cwd: root,
        encoding: 'utf8'
      }
    )
    .trim();

const buildIdentity = {
  product: 'GARPI Admin',
  client: 'android-capacitor',
  appId: 'cl.garpi.campamento.admin',
  versionName: mobileVersion.versionName,
  versionCode: mobileVersion.versionCode,
  schemaVersion: mobileVersion.schemaVersion,
  channel: mobileVersion.channel,
  backendContract: mobileVersion.backendContract,
  sourceGitSha: git('rev-parse', 'HEAD'),
  sourceGitTree: git('rev-parse', 'HEAD^{tree}'),
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(
  path.join(out, 'mobile-build.json'),
  JSON.stringify(buildIdentity, null, 2) + '\n',
  'utf8'
);

const forbiddenOutputs = [
  'service-worker.js',
  'manifest.webmanifest'
];

for (const relative of forbiddenOutputs) {
  if (fs.existsSync(path.join(out, relative))) {
    throw new Error(
      `Forbidden native shell artifact present: ${relative}`
    );
  }
}

const mobileIndex = fs.readFileSync(
  path.join(out, 'index.html'),
  'utf8'
);

if (
  !mobileIndex.includes(
    'GARPI Admin Android'
  )
) {
  throw new Error(
    'Native client marker missing.'
  );
}

if (
  mobileIndex.includes(
    '← Ir a consulta de trabajadores'
  )
) {
  throw new Error(
    'Public worker navigation leaked into Android admin shell.'
  );
}

const mobileApp4 = fs.readFileSync(
  app4Path,
  'utf8'
);

if (
  mobileApp4.includes(
    'assets/ts/pwa/runtime.js'
  )
) {
  throw new Error(
    'Web PWA runtime leaked into Android shell.'
  );
}

if (!fs.existsSync(nativeRuntimeOutputPath)) {
  throw new Error(
    'Native secure runtime bundle was not generated.'
  );
}

if (
  !mobileIndex.includes(
    'assets/garpi-native-runtime.js'
  )
) {
  throw new Error(
    'Native secure runtime script was not injected.'
  );
}

console.log('GARPI MOBILE BUILD: OK');
console.log(`WEB DIR       : ${out}`);
console.log(`APP ID        : ${buildIdentity.appId}`);
console.log(`VERSION       : ${buildIdentity.versionName}`);
console.log(`VERSION CODE  : ${buildIdentity.versionCode}`);
console.log(`SCHEMA        : ${buildIdentity.schemaVersion}`);
console.log(`CHANNEL       : ${buildIdentity.channel}`);
console.log(`SOURCE SHA    : ${buildIdentity.sourceGitSha}`);
console.log('PWA RUNTIME   : OMITTED');
console.log('SERVICE WORKER: OMITTED');
console.log('PUBLIC PAGE   : OMITTED');
console.log('NATIVE RUNTIME: BUNDLED');
console.log('NATIVE AUTH   : SECURE STORAGE');
console.log('NATIVE BACKEND: PRODUCTION');
