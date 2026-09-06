'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const androidRoot = path.join(root, 'android');

const contractPath = path.join(
  __dirname,
  'pilot-release-contract.json'
);

const versionPath = path.join(
  __dirname,
  'mobile-version.json'
);

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, 'utf8')
  );
}

function prepareInvocation(command, args) {
  const extension = path
    .extname(String(command))
    .toLowerCase();

  const isWindowsBatch =
    process.platform === 'win32' &&
    (
      extension === '.bat' ||
      extension === '.cmd'
    );

  if (!isWindowsBatch) {
    return {
      command,
      args
    };
  }

  const cmdExe =
    process.env.ComSpec ||
    process.env.COMSPEC ||
    'cmd.exe';

  const commandParts = [
    command,
    ...args
  ].map(value => {
    const text = String(value);

    if (/[\r\n"&|<>^%!]/.test(text)) {
      fail(
        'GARPI_PILOT_UNSAFE_WINDOWS_BATCH_ARGUMENT'
      );
    }

    return `"${text}"`;
  });

  return {
    command: cmdExe,
    args: [
      '/d',
      '/s',
      '/c',
      commandParts.join(' ')
    ]
  };
}

function run(command, args, options = {}) {
  const capture = Boolean(options.capture);

  const invocation = prepareInvocation(
    command,
    args
  );

  const result = spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      stdio: capture
        ? ['ignore', 'pipe', 'pipe']
        : 'inherit'
    }
  );

  if (result.error) {
    throw result.error;
  }

  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const combined = `${stdout}\n${stderr}`.trim();

  if (result.status !== 0) {
    fail(
      `${options.errorCode || 'GARPI_PILOT_COMMAND_FAILED'}: ` +
      `${command}` +
      (combined ? `\n${combined}` : '')
    );
  }

  return capture ? combined : '';
}

function git(args) {
  return run(
    'git',
    args,
    {
      capture: true,
      errorCode: 'GARPI_PILOT_GIT_FAILED'
    }
  );
}

function assertCleanWorktree(stage) {
  const status = git([
    'status',
    '--porcelain'
  ]);

  if (status) {
    fail(
      `GARPI_PILOT_WORKTREE_DIRTY_${stage.toUpperCase()}`
    );
  }
}

function assertIgnored(relativePath, errorCode) {
  const result = spawnSync(
    'git',
    [
      'check-ignore',
      '-q',
      '--no-index',
      relativePath
    ],
    {
      cwd: root,
      encoding: 'utf8'
    }
  );

  if (result.status !== 0) {
    fail(errorCode);
  }
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function normalizeDigest(value) {
  return String(value || '')
    .replace(/[^a-fA-F0-9]/g, '')
    .toLowerCase();
}

function readProperties(file) {
  const properties = {};

  for (
    const rawLine of fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
  ) {
    const line = rawLine.trim();

    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith('!')
    ) {
      continue;
    }

    const separator = line.search(/[=:]/);

    if (separator < 1) {
      fail(
        'GARPI_PILOT_SIGNING_PROPERTIES_MALFORMED'
      );
    }

    const key = line
      .slice(0, separator)
      .trim();

    const value = line
      .slice(separator + 1)
      .trim();

    properties[key] = value;
  }

  return properties;
}

function isInsideRepository(file) {
  const relative = path.relative(
    root,
    path.resolve(file)
  );

  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function versionParts(value) {
  return String(value)
    .match(/\d+/g)
    ?.map(Number) || [];
}

function compareVersionsDescending(a, b) {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const length = Math.max(
    aa.length,
    bb.length
  );

  for (let i = 0; i < length; i += 1) {
    const av = aa[i] || 0;
    const bv = bb[i] || 0;

    if (av !== bv) {
      return bv - av;
    }
  }

  return 0;
}

function detectAndroidSdk() {
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          'Android',
          'Sdk'
        )
      : null
  ].filter(Boolean);

  const sdk = candidates.find(candidate =>
    fs.existsSync(candidate)
  );

  if (!sdk) {
    fail('GARPI_PILOT_ANDROID_SDK_MISSING');
  }

  return sdk;
}

function detectBuildTools(sdk) {
  const buildToolsRoot = path.join(
    sdk,
    'build-tools'
  );

  if (!fs.existsSync(buildToolsRoot)) {
    fail('GARPI_PILOT_BUILD_TOOLS_MISSING');
  }

  const versions = fs
    .readdirSync(buildToolsRoot)
    .filter(name =>
      fs
        .statSync(
          path.join(buildToolsRoot, name)
        )
        .isDirectory()
    )
    .sort(compareVersionsDescending);

  for (const version of versions) {
    const dir = path.join(
      buildToolsRoot,
      version
    );

    const aapt = path.join(
      dir,
      process.platform === 'win32'
        ? 'aapt.exe'
        : 'aapt'
    );

    const apksigner = path.join(
      dir,
      process.platform === 'win32'
        ? 'apksigner.bat'
        : 'apksigner'
    );

    if (
      fs.existsSync(aapt) &&
      fs.existsSync(apksigner)
    ) {
      return {
        version,
        aapt,
        apksigner
      };
    }
  }

  fail('GARPI_PILOT_BUILD_TOOLS_INCOMPLETE');
}
const contract = readJson(contractPath);
const mobileVersion = readJson(versionPath);

if (contract.schemaVersion !== 1) {
  fail(
    'GARPI_PILOT_CONTRACT_SCHEMA_UNSUPPORTED'
  );
}

if (
  !/^[a-zA-Z0-9._]+$/.test(
    String(contract.packageId || '')
  )
) {
  fail('GARPI_PILOT_PACKAGE_INVALID');
}

if (
  mobileVersion.channel !==
  contract.requiredChannel
) {
  fail(
    `GARPI_PILOT_CHANNEL_INVALID: ` +
    `${mobileVersion.channel}`
  );
}

if (
  !/^\d+\.\d+\.\d+-pilot\.\d+$/.test(
    String(mobileVersion.versionName)
  )
) {
  fail(
    `GARPI_PILOT_VERSION_NAME_INVALID: ` +
    `${mobileVersion.versionName}`
  );
}

if (
  !Number.isInteger(mobileVersion.versionCode) ||
  mobileVersion.versionCode <
    contract.minimumVersionCode
) {
  fail(
    `GARPI_PILOT_VERSION_CODE_INVALID: ` +
    `${mobileVersion.versionCode}`
  );
}

const expectedCert = normalizeDigest(
  contract.expectedCertificateSha256
);

if (!/^[a-f0-9]{64}$/.test(expectedCert)) {
  fail(
    'GARPI_PILOT_CERT_CONTRACT_INVALID'
  );
}

const signingPropertiesPath = path.join(
  androidRoot,
  'signing.properties'
);

if (!fs.existsSync(signingPropertiesPath)) {
  fail(
    'GARPI_PILOT_SIGNING_PROPERTIES_MISSING'
  );
}

assertIgnored(
  'android/signing.properties',
  'GARPI_PILOT_SIGNING_PROPERTIES_NOT_IGNORED'
);

assertIgnored(
  `${contract.artifactRoot}/probe.txt`,
  'GARPI_PILOT_ARTIFACT_ROOT_NOT_IGNORED'
);

const trackedSigning = git([
  'ls-files',
  'android/signing.properties'
]);

if (trackedSigning) {
  fail(
    'GARPI_PILOT_SIGNING_PROPERTIES_TRACKED'
  );
}

const signingProperties = readProperties(
  signingPropertiesPath
);

if (
  Object.prototype.hasOwnProperty.call(
    signingProperties,
    'storePassword'
  ) ||
  Object.prototype.hasOwnProperty.call(
    signingProperties,
    'keyPassword'
  )
) {
  fail(
    'GARPI_PILOT_PASSWORD_FOUND_IN_SIGNING_PROPERTIES'
  );
}

if (
  !signingProperties.storeFile ||
  !signingProperties.keyAlias
) {
  fail(
    'GARPI_PILOT_SIGNING_PROPERTIES_INCOMPLETE'
  );
}

const signingStoreFile = path.isAbsolute(
  signingProperties.storeFile
)
  ? path.normalize(
      signingProperties.storeFile
    )
  : path.resolve(
      androidRoot,
      signingProperties.storeFile
    );

if (!fs.existsSync(signingStoreFile)) {
  fail('GARPI_PILOT_KEYSTORE_MISSING');
}

if (isInsideRepository(signingStoreFile)) {
  fail(
    'GARPI_PILOT_KEYSTORE_MUST_BE_EXTERNAL'
  );
}

if (
  !process.env.GARPI_ANDROID_STORE_PASSWORD ||
  !process.env.GARPI_ANDROID_KEY_PASSWORD
) {
  fail(
    'GARPI_PILOT_SIGNING_ENV_MISSING'
  );
}

assertCleanWorktree('prebuild');

const head = git([
  'rev-parse',
  'HEAD'
]);

const tree = git([
  'show',
  '-s',
  '--format=%T',
  'HEAD'
]);

const branch = git([
  'branch',
  '--show-current'
]);

if (!branch) {
  fail('GARPI_PILOT_DETACHED_HEAD');
}

const nodeMajor = Number(
  process.versions.node.split('.')[0]
);

if (nodeMajor < 22) {
  fail(
    `GARPI_PILOT_NODE_UNSUPPORTED: ` +
    `${process.versions.node}`
  );
}

const sdk = detectAndroidSdk();
const buildTools = detectBuildTools(sdk);

const gradleWrapper = path.join(
  androidRoot,
  process.platform === 'win32'
    ? 'gradlew.bat'
    : 'gradlew'
);

const gradleVersion = run(
  gradleWrapper,
  [
    '-p',
    'android',
    '--version'
  ],
  {
    capture: true,
    errorCode:
      'GARPI_PILOT_GRADLE_VERSION_FAILED'
  }
);

const jvmLine = gradleVersion
  .split(/\r?\n/)
  .find(line =>
    /^(Launcher JVM|JVM):/i.test(
      line.trim()
    )
  );

if (
  !jvmLine ||
  !/\b21(?:[.\s]|$)/.test(jvmLine)
) {
  fail(
    `GARPI_PILOT_JDK21_REQUIRED: ` +
    `${jvmLine || 'JVM unknown'}`
  );
}

console.log('');
console.log('GARPI PILOT RELEASE');
console.log(
  `Version      : ${mobileVersion.versionName}`
);
console.log(
  `VersionCode  : ${mobileVersion.versionCode}`
);
console.log(
  `Channel      : ${mobileVersion.channel}`
);
console.log(`Commit       : ${head}`);
console.log(
  `Build Tools  : ${buildTools.version}`
);
console.log('');

const npmCommand =
  process.platform === 'win32'
    ? 'npm.cmd'
    : 'npm';

run(
  npmCommand,
  [
    'run',
    'mobile:sync'
  ],
  {
    errorCode:
      'GARPI_PILOT_MOBILE_SYNC_FAILED'
  }
);

run(
  gradleWrapper,
  [
    '-p',
    'android',
    ':app:assembleRelease'
  ],
  {
    errorCode:
      'GARPI_PILOT_ASSEMBLE_RELEASE_FAILED'
  }
);

const apkPath = path.join(
  androidRoot,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk'
);

if (!fs.existsSync(apkPath)) {
  fail('GARPI_PILOT_APK_MISSING');
}

const badging = run(
  buildTools.aapt,
  [
    'dump',
    'badging',
    apkPath
  ],
  {
    capture: true,
    errorCode: 'GARPI_PILOT_AAPT_FAILED'
  }
);

const packageMatch = badging.match(
  /package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/
);

if (!packageMatch) {
  fail('GARPI_PILOT_BADGING_UNREADABLE');
}

const actualPackage = packageMatch[1];
const actualVersionCode = packageMatch[2];
const actualVersionName = packageMatch[3];

if (actualPackage !== contract.packageId) {
  fail(
    `GARPI_PILOT_PACKAGE_MISMATCH: ` +
    `${actualPackage}`
  );
}

if (
  Number(actualVersionCode) !==
  mobileVersion.versionCode
) {
  fail(
    `GARPI_PILOT_VERSION_CODE_MISMATCH: ` +
    `${actualVersionCode}`
  );
}

if (
  actualVersionName !==
  mobileVersion.versionName
) {
  fail(
    `GARPI_PILOT_VERSION_NAME_MISMATCH: ` +
    `${actualVersionName}`
  );
}

if (/application-debuggable/i.test(badging)) {
  fail('GARPI_PILOT_APK_DEBUGGABLE');
}
const signature = run(
  buildTools.apksigner,
  [
    'verify',
    '--verbose',
    '--print-certs',
    apkPath
  ],
  {
    capture: true,
    errorCode:
      'GARPI_PILOT_APKSIGNER_FAILED'
  }
);

if (!/^Verifies$/m.test(signature)) {
  fail(
    'GARPI_PILOT_SIGNATURE_INVALID'
  );
}

if (
  !/Verified using v2 scheme .*:\s*true/i.test(
    signature
  )
) {
  fail(
    'GARPI_PILOT_SIGNATURE_V2_REQUIRED'
  );
}

const signerCountMatch = signature.match(
  /Number of signers:\s*(\d+)/i
);

if (
  !signerCountMatch ||
  Number(signerCountMatch[1]) !== 1
) {
  fail(
    'GARPI_PILOT_SIGNER_COUNT_INVALID'
  );
}

const signerDnMatch = signature.match(
  /Signer #1 certificate DN:\s*(.+)/i
);

const actualSignerDn = signerDnMatch
  ? signerDnMatch[1].trim()
  : '';

if (
  actualSignerDn !==
  contract.expectedSignerDn
) {
  fail(
    `GARPI_PILOT_SIGNER_DN_MISMATCH: ` +
    `${actualSignerDn || 'missing'}`
  );
}

const certMatch = signature.match(
  /Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/i
);

if (!certMatch) {
  fail(
    'GARPI_PILOT_CERT_DIGEST_MISSING'
  );
}

const actualCert = normalizeDigest(
  certMatch[1]
);

if (actualCert !== expectedCert) {
  fail(
    `GARPI_PILOT_CERT_DIGEST_MISMATCH: ` +
    `${actualCert}`
  );
}

assertCleanWorktree('postbuild');

const artifactRoot = path.join(
  root,
  contract.artifactRoot
);

const releaseId =
  `${mobileVersion.versionName}-vc` +
  `${mobileVersion.versionCode}`;

const releaseDir = path.join(
  artifactRoot,
  releaseId
);

if (fs.existsSync(releaseDir)) {
  fail(
    `GARPI_PILOT_RELEASE_ALREADY_EXISTS: ` +
    `${releaseId}`
  );
}

fs.mkdirSync(
  releaseDir,
  {
    recursive: true
  }
);

const artifactFileName =
  `garpi-admin-${releaseId}.apk`;

const artifactPath = path.join(
  releaseDir,
  artifactFileName
);

const sourceApkSha256 = sha256File(
  apkPath
);

fs.copyFileSync(
  apkPath,
  artifactPath
);

const artifactSha256 = sha256File(
  artifactPath
);

if (sourceApkSha256 !== artifactSha256) {
  fail(
    'GARPI_PILOT_ARTIFACT_COPY_HASH_MISMATCH'
  );
}

const artifactStat = fs.statSync(
  artifactPath
);

const manifest = {
  schemaVersion: 1,
  releaseId,
  generatedAtUtc:
    new Date().toISOString(),

  distributable: true,

  application: {
    packageId: contract.packageId,
    versionName:
      mobileVersion.versionName,
    versionCode:
      mobileVersion.versionCode,
    channel:
      mobileVersion.channel,
    backendContract:
      mobileVersion.backendContract
  },

  source: {
    branch,
    commit: head,
    tree,
    worktreeClean: true
  },

  signing: {
    signerDn:
      contract.expectedSignerDn,
    certificateSha256:
      actualCert,
    signerCount: 1,
    apkSignatureV2: true,
    debuggable: false
  },

  artifact: {
    fileName:
      artifactFileName,
    sizeBytes:
      artifactStat.size,
    sha256:
      artifactSha256
  },

  inputs: {
    mobileVersionSha256:
      sha256File(versionPath),
    releaseContractSha256:
      sha256File(contractPath)
  },

  tooling: {
    node:
      process.versions.node,
    androidBuildTools:
      buildTools.version,
    gradleJvm:
      jvmLine.trim()
  }
};

const manifestPath = path.join(
  releaseDir,
  'pilot-release-manifest.json'
);

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(
    manifest,
    null,
    2
  )}\n`,
  'utf8'
);

console.log('');
console.log(
  'GARPI PILOT RELEASE: OK'
);
console.log(
  `Release ID    : ${releaseId}`
);
console.log(
  `APK SHA-256   : ${artifactSha256}`
);
console.log(
  `Cert SHA-256  : ${actualCert}`
);
console.log(
  `Manifest      : ${path.relative(
    root,
    manifestPath
  )}`
);
console.log('');