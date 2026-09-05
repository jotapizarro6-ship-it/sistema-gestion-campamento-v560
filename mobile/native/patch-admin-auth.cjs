'use strict';

const fs = require('fs');

function replaceExactOnce(
  text,
  oldText,
  newText,
  label
) {
  const first = text.indexOf(oldText);

  if (first < 0) {
    throw new Error(
      `GARPI_NATIVE_AUTH_PATCH_MISSING:${label}`
    );
  }

  const second = text.indexOf(
    oldText,
    first + oldText.length
  );

  if (second >= 0) {
    throw new Error(
      `GARPI_NATIVE_AUTH_PATCH_MULTIPLE:${label}`
    );
  }

  return (
    text.slice(0, first) +
    newText +
    text.slice(first + oldText.length)
  );
}

function patchNativeAdminAuth(filePath) {
  let text = fs.readFileSync(
    filePath,
    'utf8'
  );

  const logoutOld =
    "function logoutAdmin(){sessionStorage.removeItem('camp_admin_token');A.token=null;A.data=null;$('#adminApp')?.classList.add('hidden');$('#adminLoginScreen')?.classList.remove('hidden');if($('#adminPassword'))$('#adminPassword').value=''}";

  const logoutNew =
    "async function logoutAdmin(){A.token=null;A.data=null;$('#adminApp')?.classList.add('hidden');$('#adminLoginScreen')?.classList.remove('hidden');if($('#adminPassword'))$('#adminPassword').value='';const msg=$('#adminLoginMessage');try{const nativeFoundation=window.GARPI_NATIVE_FOUNDATION;if(!nativeFoundation)throw new Error('GARPI_NATIVE_FOUNDATION_MISSING');await nativeFoundation.ready;await nativeFoundation.purgeAfterLogout();if(msg)msg.innerHTML=''}catch(err){if(msg)msg.innerHTML=htmlNotice('No se pudo limpiar la sesión segura local. Reinicia la aplicación antes de volver a ingresar.','error')}}";

  text = replaceExactOnce(
    text,
    logoutOld,
    logoutNew,
    'LOGOUT'
  );

  const loginOld =
    "$('#adminLoginForm').addEventListener('submit',async e=>{e.preventDefault();const msg=$('#adminLoginMessage'),pwd=$('#adminPassword').value;msg.innerHTML=htmlNotice('Verificando acceso…','info');try{const r=await webApi('admin_login',{method:'POST',body:{password:pwd}});A.token=r.token;sessionStorage.setItem('camp_admin_token',A.token);msg.innerHTML='';$('#adminLoginScreen').classList.add('hidden');$('#adminApp').classList.remove('hidden');const hash=location.hash.slice(1);switchView($(`.nav-btn[data-view=\"${hash}\"]`)?hash:'overview');await loadAll()}catch(err){msg.innerHTML=htmlNotice(err.message||'Contraseña incorrecta.','error')}});";

  const loginNew =
    "$('#adminLoginForm').addEventListener('submit',async e=>{e.preventDefault();const msg=$('#adminLoginMessage'),pwd=$('#adminPassword').value;msg.innerHTML=htmlNotice('Verificando acceso…','info');try{const r=await webApi('admin_login',{method:'POST',body:{password:pwd}});const nativeFoundation=window.GARPI_NATIVE_FOUNDATION;if(!nativeFoundation)throw new Error('GARPI_NATIVE_FOUNDATION_MISSING');await nativeFoundation.ready;A.token=r.token;await nativeFoundation.session.setAdminToken(A.token);if($('#adminPassword'))$('#adminPassword').value='';msg.innerHTML='';$('#adminLoginScreen').classList.add('hidden');$('#adminApp').classList.remove('hidden');const hash=location.hash.slice(1);switchView($(`.nav-btn[data-view=\"${hash}\"]`)?hash:'overview');await loadAll()}catch(err){A.token=null;if($('#adminPassword'))$('#adminPassword').value='';msg.innerHTML=htmlNotice(err.message||'No se pudo iniciar la sesión segura.','error')}});";

  text = replaceExactOnce(
    text,
    loginOld,
    loginNew,
    'LOGIN'
  );

  const restoreOld =
    "const existing=sessionStorage.getItem('camp_admin_token');if(existing){A.token=existing;$('#adminLoginScreen').classList.add('hidden');$('#adminApp').classList.remove('hidden');const hash=location.hash.slice(1);switchView($(`.nav-btn[data-view=\"${hash}\"]`)?hash:'overview');loadAll().catch(()=>logoutAdmin())}";

  const restoreNew =
    "void(async()=>{const nativeFoundation=window.GARPI_NATIVE_FOUNDATION;if(!nativeFoundation)throw new Error('GARPI_NATIVE_FOUNDATION_MISSING');await nativeFoundation.ready;const existing=await nativeFoundation.session.getAdminToken();if(!existing)return;A.token=existing;$('#adminLoginScreen').classList.add('hidden');$('#adminApp').classList.remove('hidden');const hash=location.hash.slice(1);switchView($(`.nav-btn[data-view=\"${hash}\"]`)?hash:'overview');try{await loadAll()}catch(err){await logoutAdmin()}})().catch(()=>{A.token=null;A.data=null;$('#adminApp')?.classList.add('hidden');$('#adminLoginScreen')?.classList.remove('hidden');const msg=$('#adminLoginMessage');if(msg)msg.innerHTML=htmlNotice('No se pudo restaurar la sesión segura. Ingresa nuevamente.','error')})";

  text = replaceExactOnce(
    text,
    restoreOld,
    restoreNew,
    'RESTORE'
  );

  const sessionStorageCount = (
    text.match(/\bsessionStorage\b/g) || []
  ).length;

  const legacyTokenKeyCount = (
    text.match(/camp_admin_token/g) || []
  ).length;

  if (sessionStorageCount !== 0) {
    throw new Error(
      'GARPI_NATIVE_AUTH_SESSION_STORAGE_REMAINS'
    );
  }

  if (legacyTokenKeyCount !== 0) {
    throw new Error(
      'GARPI_NATIVE_AUTH_LEGACY_TOKEN_KEY_REMAINS'
    );
  }

  const requiredMarkers = [
    'GARPI_NATIVE_FOUNDATION',
    'setAdminToken',
    'getAdminToken',
    'purgeAfterLogout'
  ];

  for (const marker of requiredMarkers) {
    if (!text.includes(marker)) {
      throw new Error(
        `GARPI_NATIVE_AUTH_MARKER_MISSING:${marker}`
      );
    }
  }

  fs.writeFileSync(
    filePath,
    text,
    'utf8'
  );

  return Object.freeze({
    secureAuth: true,
    sessionStorageOccurrences: sessionStorageCount,
    legacyTokenKeyOccurrences: legacyTokenKeyCount
  });
}

module.exports = {
  patchNativeAdminAuth
};
