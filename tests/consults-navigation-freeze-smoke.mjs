import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const progressiveSrc=fs.readFileSync('assets/progressive-admin-render.js','utf8');
const consultSrc=fs.readFileSync('assets/consults-export-xlsx.js','utf8');
const responsiveSrc=fs.readFileSync('assets/responsive-admin.js','utf8');
const chartsSrc=fs.readFileSync('assets/echarts-layout-stabilizer.js','utf8');
const loaderSrc=fs.readFileSync('assets/app-4.js','utf8');

assert.ok(!/new\s+MutationObserver|MutationObserver\s*\(/.test(consultSrc),'Consultas RUT no debe depender de MutationObserver.');
assert.ok(!/new\s+MutationObserver|MutationObserver\s*\(/.test(responsiveSrc),'La capa responsiva no debe observar globalmente el DOM.');
assert.ok(!/new\s+MutationObserver|MutationObserver\s*\(/.test(chartsSrc),'El estabilizador ECharts no debe observar globalmente el DOM.');
assert.match(consultSrc,/const PAGE_SIZE=100/,'Consultas RUT debe mantener el DOM acotado por paginación.');
assert.match(consultSrc,/rows\.slice\(start,start\+PAGE_SIZE\)/,'Consultas RUT debe renderizar solo la página visible.');
assert.match(progressiveSrc,/__campSingleNavigationOwner=true/,'Debe existir un único propietario explícito de la navegación.');
assert.match(progressiveSrc,/requestAnimationFrame\(\(\)=>setTimeout\(fn,0\)\)/,'El render debe ceder un repintado al navegador antes del trabajo de la vista.');
assert.match(loaderSrc,/20260829-deepnav1/,'Los recursos corregidos deben usar una versión nueva para invalidar caché.');

class FakeClassList{
  constructor(...values){this.values=new Set(values)}
  toggle(name,on){if(on)this.values.add(name);else this.values.delete(name);return !!on}
  add(name){this.values.add(name)}
  remove(name){this.values.delete(name)}
  contains(name){return this.values.has(name)}
}
class FakeElement{
  constructor(id,classes=[]){this.id=id;this.classList=new FakeClassList(...classes);this.children=[];this.dataset={};this.textContent='';this.innerHTML=''}
}

const views={};
for(const name of ['overview','workers','consults','planning','management','exports'])views[name]=new FakeElement(`view-${name}`,['view',name==='workers'?'active':'']);
const navs={};
for(const name of Object.keys(views)){const n=new FakeElement(`nav-${name}`,['nav-btn',name==='workers'?'active':'']);n.dataset.view=name;n.textContent=name;navs[name]=n}
const sidebar=new FakeElement('sidebar');
const title=new FakeElement('pageTitle');
const rafQueue=[],timerQueue=[];
let taskCount=0,workerRenders=0,consultRenders=0,opsRenders=0,profileApplications=0;

const document={
  hidden:false,
  getElementById(id){if(id==='sidebar')return sidebar;if(id==='pageTitle')return title;for(const v of Object.values(views))if(v.id===id)return v;return null},
  querySelector(sel){if(sel==='.view.active')return Object.values(views).find(v=>v.classList.contains('active'))||null;const m=/^\.nav-btn\[data-view="([^"]+)"\]$/.exec(sel);return m?navs[m[1]]||null:null},
  querySelectorAll(sel){if(sel==='.view')return Object.values(views);if(sel==='.nav-btn')return Object.values(navs);return[]},
  addEventListener(){ }
};
const location={hash:'#workers'};
const history={replaceState(_a,_b,url){location.hash=String(url).startsWith('#')?String(url):`#${url}`}};
const A={data:{workers:[],inventory:[]},currentView:'workers'};

const context={
  console,
  window:null,
  document,
  location,
  history,
  A,
  performance:{now:()=>taskCount},
  CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},
  requestAnimationFrame(fn){rafQueue.push(fn);return rafQueue.length},
  setTimeout(fn){timerQueue.push(fn);return timerQueue.length},
  clearTimeout(){},
  renderOverview(){},renderControl(){},renderPlanning(){},renderManagement(){},renderHistory(){},renderMovements(){},renderReservations(){},renderBlocks(){},renderExcel(){},renderExports(){},
  renderWorkers(){workerRenders++},
  renderConsults(){consultRenders++},
  esc:v=>String(v??''),
  showMessage(){},
  switchView(view){
    A.currentView=view;
    for(const [name,el] of Object.entries(views))el.classList.toggle('active',name===view);
    for(const [name,el] of Object.entries(navs))el.classList.toggle('active',name===view);
    title.textContent=navs[view]?.textContent||'Administración';
    sidebar.classList.remove('open');
    history.replaceState(null,'',`#${view}`);
  }
};
context.window=context;
context.window.dispatchEvent=()=>true;
context.window.CampOps={applyProfileUi(){profileApplications++},renderOpsViews(){opsRenders++}};
context.globalThis=context;

vm.createContext(context);
vm.runInContext(progressiveSrc,context,{filename:'progressive-admin-render.js'});

function flush(max=10000){
  let n=0;
  while((rafQueue.length||timerQueue.length)&&n<max){
    const queue=rafQueue.length?rafQueue:timerQueue;
    const fn=queue.shift();taskCount++;fn();n++;
  }
  assert.ok(n<max,'La navegación generó una cola de tareas sin fin.');
}

// Cambio rápido antes del siguiente paint: el render obsoleto debe cancelarse.
context.switchView('workers');
context.switchView('consults');
flush();
assert.equal(workerRenders,0,'Una vista reemplazada antes del paint no debe renderizarse.');
assert.equal(consultRenders,1,'La vista final debe renderizarse exactamente una vez.');

// 200 ciclos completos reproducen repetidamente el caso reportado Trabajadores -> Consultas RUT.
for(let i=0;i<200;i++){
  context.switchView('workers');flush();
  context.switchView('consults');flush();
}
assert.equal(workerRenders,200,'Trabajadores debe renderizar una vez por navegación completa.');
assert.equal(consultRenders,201,'Consultas RUT debe renderizar una vez por navegación completa.');
assert.equal(opsRenders,0,'Trabajadores/Consultas RUT no deben disparar renderizadores operacionales o gráficos ocultos.');
assert.ok(profileApplications<=401,'La capa de perfil no debe ejecutarse en bucle.');
assert.equal(location.hash,'#consults');
assert.ok(views.consults.classList.contains('active'),'Consultas RUT debe quedar como única vista activa.');
assert.ok(!views.workers.classList.contains('active'),'Trabajadores debe quedar oculto tras navegar a Consultas RUT.');

console.log(`Consultas RUT navegación profunda: OK · 200 ciclos · ${taskCount} tareas finitas · render único · sin observers globales · paginación ${100}`);
