"use strict";(()=>{"use strict";if(typeof window>"u"||window.__GARPI_UI_V31_A2__)return;window.__GARPI_UI_V31_A2__=!0;const VERSION="20260913-v31a21",q=(selector,root=document)=>root?.querySelector?.(selector)||null,qa=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]),text=value=>String(value??"").replace(/\s+/g," ").trim(),upper=value=>text(value).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""),esc=value=>text(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"),number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0},today=()=>typeof todayISO=="function"?todayISO():new Date().toISOString().slice(0,10);function addDays(iso,amount){const date=new Date(`${iso}T12:00:00`);return Number.isNaN(date.getTime())?iso:(date.setDate(date.getDate()+amount),date.toISOString().slice(0,10))}function planRows(start=today(),days=30){if(typeof planningRows!="function"||typeof A>"u"||!A?.data)return[];try{return planningRows(start,days,A.data)||[]}catch{return[]}}function sourceLabel(row){if(row?.capacity_available===!1)return"Sin fuente válida";const source=upper(row?.capacity_source);return source==="DAILY_CAPACITY"?"Capacidad diaria":source.includes("OPERATIONAL")||source.includes("UNIVERSE")||source.includes("UNIVERSO")?"Universo operacional":source?source.replaceAll("_"," ").toLowerCase():"Fuente canónica"}function pressureState(row){if(row?.capacity_available===!1||row?.committed_occupancy===null||row?.committed_occupancy===void 0)return"unavailable";const pct=number(row.committed_occupancy);return number(row.over)>0||pct>100?"over":pct>=100?"full":pct>=90?"critical":pct>=80?"attention":"normal"}function findPanel(root,pattern){const heading=qa("h1,h2,h3,h4",root).find(node=>pattern.test(text(node.textContent)));return heading?heading.closest("section,.panel,.v3-card,.ops-card,.bi-card")||heading.parentElement?.parentElement||heading.parentElement:null}function chartDom(panel){return!panel||!window.echarts?null:qa("div",panel).find(node=>{try{return!!window.echarts.getInstanceByDom?.(node)}catch{return!1}})||null}function decorateCapacityProvenance(){const current=planRows(today(),1)[0];if(!current)return;const source=sourceLabel(current),overview=q("#view-overview"),hero=q(".dc-hero",overview),intro=q(".dc-hero-top>div",hero);if(intro&&!q(".v31a2-overview-source",intro)){const tag=document.createElement("small");tag.className="v31a2-overview-source",tag.textContent=`Fuente de capacidad: ${source}`,intro.appendChild(tag)}[q("#view-overview"),q("#view-management")].filter(Boolean).forEach(view=>{qa("span,small,p,div",view).filter(node=>node.children.length===0&&/^(capacidad efectiva|capacidad operativa)$/i.test(text(node.textContent))).forEach(label=>{const parent=label.parentElement;if(!parent||q(":scope > .v31a2-source-tag",parent))return;const tag=document.createElement("small");tag.className="v31a2-source-tag",tag.textContent=`Fuente: ${source}`,parent.appendChild(tag)})});const previousStart=addDays(today(),-1),twoDays=planRows(previousStart,2),previous=twoDays.find(row=>row.date===previousStart),todayRow=twoDays.find(row=>row.date===today())||current;!previous||!todayRow||sourceLabel(previous)===sourceLabel(todayRow)||[q("#view-overview"),q("#view-management")].filter(Boolean).forEach(view=>{let banner=q(":scope > .v31a2-source-change",view);banner||(banner=document.createElement("div"),banner.className="v31a2-source-change",view.firstElementChild?view.firstElementChild.after(banner):view.prepend(banner)),banner.innerHTML=`
          <span aria-hidden="true">ⓘ</span>
          <div>
            <strong>Cambio de fuente de capacidad.</strong>
            ${esc(previous.date)}:
            ${esc(sourceLabel(previous))}
            ·
            ${esc(todayRow.date)}:
            ${esc(sourceLabel(todayRow))}.
            La capacidad no se replica automáticamente entre días.
          </div>
        `})}function makePercentSvg(rows){const xAt=index=>rows.length<=1?45:45+index/(rows.length-1)*900,yAt=pct=>205-Math.max(0,Math.min(110,pct))/110*187,lines=[];let currentPath=[];rows.forEach((row,index)=>{const value=row.committed_occupancy;if(value==null||!Number.isFinite(Number(value))){currentPath.length>1&&lines.push(currentPath),currentPath=[];return}currentPath.push([xAt(index),yAt(Number(value)),Number(value),row.date])}),currentPath.length>1&&lines.push(currentPath);const grid=[0,20,40,60,80,90,100].map(value=>{const y=yAt(value);return`
          <line
            x1="45"
            x2="945"
            y1="${y}"
            y2="${y}"
            class="${value===80?"v31a2-svg-threshold80":value===90?"v31a2-svg-threshold90":value===100?"v31a2-svg-threshold100":"v31a2-svg-grid"}"
          />
          <text
            x="4"
            y="${y+3}"
            class="v31a2-svg-label"
          >
            ${value}%
          </text>
        `}).join(""),paths=lines.map(points2=>`
        <polyline
          class="v31a2-svg-line"
          points="${points2.map(point=>`${point[0]},${point[1]}`).join(" ")}"
        />
      `).join(""),points=rows.map((row,index)=>{if(row.committed_occupancy===null||row.committed_occupancy===void 0||!Number.isFinite(Number(row.committed_occupancy)))return"";const value=Number(row.committed_occupancy);return`
          <circle
            class="v31a2-svg-point"
            cx="${xAt(index)}"
            cy="${yAt(value)}"
            r="4"
          >
            <title>
              ${esc(row.date)}
              · ${value.toLocaleString("es-CL",{maximumFractionDigits:1})}%
              · ${esc(sourceLabel(row))}
            </title>
          </circle>
        `}).join(""),dates=rows.map((row,index)=>{const step=Math.max(1,Math.floor(rows.length/6));if(index%step!==0&&index!==rows.length-1)return"";const parts=text(row.date).split("-"),label=parts.length===3?`${parts[2]}/${parts[1]}`:row.date;return`
            <text
              x="${xAt(index)}"
              y="229"
              text-anchor="middle"
              class="v31a2-svg-label"
            >
              ${esc(label)}
            </text>
          `}).join("");return`
      <svg
        viewBox="0 0 1000 250"
        role="img"
        aria-label="Porcentaje comprometido durante la ventana de planificación"
      >
        ${grid}

        <text
          x="941"
          y="${yAt(80)-5}"
          text-anchor="end"
          class="v31a2-svg-threshold-label"
        >
          Atención 80%
        </text>

        <text
          x="941"
          y="${yAt(90)-5}"
          text-anchor="end"
          class="v31a2-svg-threshold-label"
        >
          Crítico 90%
        </text>

        <text
          x="941"
          y="${yAt(100)-5}"
          text-anchor="end"
          class="v31a2-svg-threshold-label"
        >
          Capacidad 100%
        </text>

        ${paths}
        ${points}
        ${dates}
      </svg>
    `}function enhanceCapacityChart(){const planning=q("#view-planning");if(!planning)return;const panel=findPanel(planning,/capacidad y demanda proyectada/i);if(!panel)return;const rows=planRows(typeof A<"u"&&text(A.planStart)||today(),typeof A<"u"&&Number(A.planDays)||30);if(!rows.length)return;const dom=chartDom(panel);if(!dom)return;let mode=panel.dataset.v31a2CapacityMode||"percent";panel.dataset.v31a2CapacityMode=mode;let toolbar=q(".v31a2-chart-mode",panel);if(!toolbar){toolbar=document.createElement("div"),toolbar.className="v31a2-chart-mode",toolbar.innerHTML=`
        <button
          type="button"
          data-v31a2-capacity-mode="percent"
        >
          % compromiso
        </button>
        <button
          type="button"
          data-v31a2-capacity-mode="beds"
        >
          Camas
        </button>
      `;const heading=q("h2,h3,h4",panel);heading?heading.parentElement?.appendChild(toolbar):panel.prepend(toolbar)}let percent=q(".v31a2-percent-chart",panel);percent||(percent=document.createElement("div"),percent.className="v31a2-percent-chart",dom.before(percent));const signature=JSON.stringify(rows.map(row=>[row.date,row.committed_occupancy,row.capacity_source,row.capacity_available]));percent.dataset.signature!==signature&&(percent.dataset.signature=signature,percent.innerHTML=makePercentSvg(rows)),qa("[data-v31a2-capacity-mode]",toolbar).forEach(button=>{button.classList.toggle("active",button.dataset.v31a2CapacityMode===mode)});const percentMode=mode==="percent";if(percent.hidden=!percentMode,dom.classList.toggle("v31a2-original-chart-hidden",percentMode),!percentMode)try{window.echarts?.getInstanceByDom?.(dom)?.resize?.()}catch{}}function enhanceZeroFlow(){const planning=q("#view-planning");if(!planning)return;const rows=planRows(typeof A<"u"&&text(A.planStart)||today(),typeof A<"u"&&Number(A.planDays)||30);if(!rows.length)return;const isZero=rows.every(row=>number(row.up)===0&&number(row.down)===0),panel=findPanel(planning,/flujo de dotaci[oó]n/i);if(!panel)return;const dom=chartDom(panel);if(!dom)return;let state=q(".v31a2-empty-signal",panel);isZero?(dom.classList.add("v31a2-chart-suppressed"),state||(state=document.createElement("div"),state.className="v31a2-empty-signal",state.innerHTML=`
          <strong>✓ Sin movimientos programados</strong>
          <span>
            0 ingresos · 0 salidas durante la ventana seleccionada
          </span>
        `,dom.after(state))):(dom.classList.remove("v31a2-chart-suppressed"),state?.remove())}function enhanceActionState(){if(typeof A>"u")return;const control=q("#view-control-room");if(!control)return;const panel=findPanel(control,/estado de acciones/i);if(!panel)return;const actions=Array.isArray(A?.ops?.actions)?A.ops.actions:[],counts={pending:0,progress:0,resolved:0,canceled:0};actions.forEach(action=>{const status=upper(action.status);status.includes("RESUEL")?counts.resolved++:status.includes("CANCEL")?counts.canceled++:status.includes("GESTION")||status.includes("CURSO")?counts.progress++:counts.pending++});const unresolved=counts.pending+counts.progress+counts.canceled,dom=q("#opsActionsChart",panel)||chartDom(panel);if(!dom)return;let compact=q(".v31a2-action-summary",panel);if(unresolved===0){dom.classList.add("v31a2-chart-suppressed"),compact||(compact=document.createElement("div"),compact.className="v31a2-action-summary",dom.after(compact));const signature=`${counts.resolved}|${counts.pending}|${counts.progress}|${counts.canceled}`;compact.dataset.signature!==signature&&(compact.dataset.signature=signature,compact.innerHTML=`<strong>✓ ${counts.resolved} ${counts.resolved===1?"acción resuelta":"acciones resueltas"}</strong><span>Sin acciones pendientes, en gestión ni canceladas que requieran seguimiento.</span>`)}else dom.classList.remove("v31a2-chart-suppressed"),compact?.remove()}function enhanceRooms(){qa(".cc-room-card").forEach(card=>{const title=q(".cc-room-title",card);if(!title)return;const beds=qa(".cc-bed-btn",card),count=beds.length;let room=text(title.dataset.v31a2RoomName||title.textContent);if(!title.dataset.v31a2RoomName){const suffix=new RegExp(`${count}\\s*visible\\(s\\)\\s*$`,"i");room=room.replace(suffix,"").trim(),room=room.replace(/\s*visible\(s\)\s*$/i,"").trim(),title.dataset.v31a2RoomName=room}title.classList.add("v31a2-room-title"),title.innerHTML=`
        <span>${esc(room)}</span>
        <small>
          ${count}
          ${count===1?"cama":"camas"}
        </small>
      `,beds.forEach(button=>{let state=["occupied","free","reserved","blocked"].find(name=>button.classList.contains(name));state=state||"unknown",button.dataset.v31a2State=state;const labels={occupied:"Ocupada",free:"Libre",reserved:"Reservada",blocked:"Bloqueada",unknown:"Estado"};button.setAttribute("aria-label",`${text(button.textContent)} · ${labels[state]}`)})})}function findLabeledControl(root,pattern,selector){return qa("label",root).find(node=>pattern.test(text(node.textContent)))?.querySelector?.(selector)||null}function allOption(select){return select&&(Array.from(select.options||[]).find(option=>!text(option.value)||/^tod[oa]s?\b/i.test(text(option.textContent)))||select.options?.[0])||null}function activeOption(select){if(!select)return null;const option=select.options?.[select.selectedIndex];return!option||option===allOption(select)?null:option}function setSelect(select,option){!select||!option||select.value===option.value||(select.value=option.value,select.dispatchEvent(new Event("change",{bubbles:!0})))}function controlsForManagement(){const view=q("#view-management");return view?{view,shift:findLabeledControl(view,/^turno\b/i,"select"),company:findLabeledControl(view,/^empresa\b/i,"select"),module:findLabeledControl(view,/^m[oó]dulo\b/i,"select")}:null}function renderSelectionBar(){const controls=controlsForManagement();if(!controls)return;const{view,shift,company,module}=controls;let bar=q(".v31a2-selection-bar",view);if(!bar){bar=document.createElement("div"),bar.className="v31a2-selection-bar";const moduleContainer=module?.closest("section,.panel,.v3-card,.v3-filter-card");moduleContainer?moduleContainer.after(bar):view.firstElementChild?view.firstElementChild.after(bar):view.prepend(bar)}const active=[["shift","Turno",shift],["company","Empresa",company],["module","Módulo",module]].map(([key,label,select])=>{const option=activeOption(select);return option?{key,label,value:text(option.textContent)}:null}).filter(Boolean),workforce=view.dataset.v31a2Workforce;workforce&&active.push({key:"workforce",label:"Composición",value:workforce==="direct"?"MOD":workforce==="indirect"?"MOI":"Por definir"}),bar.innerHTML=`
      <span class="v31a2-selection-title">
        Contexto activo
      </span>

      ${active.length?active.map(item=>`
              <button
                type="button"
                class="v31a2-chip"
                data-v31a2-clear="${esc(item.key)}"
              >
                ${esc(item.label)}:
                ${esc(item.value)}
                <span aria-hidden="true">×</span>
              </button>
            `).join(""):`
              <span class="v31a2-selection-empty">
                Sin filtros activos
              </span>
            `}

      ${active.length?`
            <button
              type="button"
              class="v31a2-clear-all"
              data-v31a2-clear-all
            >
              Limpiar todo
            </button>
          `:""}
    `}function optionMatches(select,value){if(!select)return[];const haystack=upper(value);return Array.from(select.options||[]).filter(option=>option!==allOption(select)).filter(option=>{const label=upper(option.textContent);return label.length>=2&&haystack.includes(label)})}function optionFromClick(panel,target,select){if(!panel||!target||!select)return null;let node=target;for(;node&&node!==panel;){const matches=optionMatches(select,node.textContent);if(matches.length===1)return matches[0];node=node.parentElement}return null}function enhanceWorkforce(){const view=q("#view-management"),card=q(".v3-workforce-card",view);if(!view||!card)return;const items=[["direct","MOD"],["indirect","MOI"],["undefined","Por definir"]];items.forEach(([key,label])=>{const item=q(`.v3-workforce-summary .${key}`,card);item&&(item.classList.add("v31a2-workforce-selectable"),item.setAttribute("role","button"),item.setAttribute("tabindex","0"),item.setAttribute("aria-label",`Resaltar composición ${label}`))});const selected=view.dataset.v31a2Workforce;card.classList.toggle("v31a2-workforce-filtered",!!selected),items.forEach(([key])=>{q(`.v3-workforce-summary .${key}`,card)?.classList.toggle("v31a2-selected",selected===key)})}function events(){return typeof A<"u"&&Array.isArray(A?.ops?.plan_events)?[...A.ops.plan_events]:[]}function buildRoadmap(){const host=q("#opsPlanGantt");if(!host)return;const scroll=q(".v31-plan-scroll",host);if(!scroll)return;const start=typeof A<"u"&&text(A.planStart)||today(),days=typeof A<"u"?Math.min(31,Math.max(1,Number(A.planDays)||30)):30,rows=planRows(start,days);if(!rows.length)return;const planEvents=events(),signature=JSON.stringify({rows:rows.map(row=>[row.date,row.committed_occupancy,row.capacity_source,row.capacity_available]),events:planEvents.map(event=>[event.id,event.start_date,event.end_date,event.status,event.title])});let roadmap=q(".v31a2-roadmap",host);if(roadmap||(roadmap=document.createElement("div"),roadmap.className="v31a2-roadmap",scroll.before(roadmap)),roadmap.dataset.signature===signature)return;roadmap.dataset.signature=signature;const colWidth=38,pressureCells=rows.map((row,index)=>{const state=pressureState(row),value=row.committed_occupancy,pressure=value==null?100:Math.max(4,Math.min(100,Number(value))),parts=text(row.date).split("-"),dateLabel=parts.length===3?`${parts[2]}/${parts[1]}`:row.date;return`
          <button
            type="button"
            class="
              v31a2-pressure-cell
              ${state}
              ${row.date===today()?"is-today":""}
            "
            style="
              --pressure:${pressure}%;
              grid-column:${index+1};
            "
            data-v31a2-roadmap-date="${esc(row.date)}"
            title="${esc(`${row.date} · ${value==null?"N/D":`${Number(value).toLocaleString("es-CL",{maximumFractionDigits:1})}%`} · ${sourceLabel(row)}`)}"
          >
            <span>${esc(dateLabel)}</span>
          </button>
        `}).join(""),indexForDate=value=>{const exact=rows.findIndex(row=>row.date===value);return exact>=0?exact:value<rows[0].date?0:rows.length-1},eventRows=planEvents.length?planEvents.slice(0,8).map(event=>{const startIndex=indexForDate(text(event.start_date)),endIndex=indexForDate(text(event.end_date)||text(event.start_date)),span=Math.max(1,endIndex-startIndex+1),status=text(event.status).toLowerCase();return`
                <div
                  class="v31a2-event-track"
                  style="
                    grid-template-columns:
                    repeat(
                      ${rows.length},
                      ${colWidth}px
                    );
                  "
                >
                  <button
                    type="button"
                    class="v31a2-event-bar ${esc(status)}"
                    style="
                      grid-column:
                      ${startIndex+1}
                      / span ${span};
                    "
                    data-v31a2-roadmap-date="${esc(event.start_date)}"
                    title="${esc(event.title||"Hito")}"
                  >
                    ${esc(event.title||"Hito")}
                  </button>
                </div>
              `}).join(""):`
          <div class="v31a2-no-events">
            Sin hitos manuales en la ventana actual.
          </div>
        `;roadmap.innerHTML=`
      <div class="v31a2-roadmap-head">
        <strong>Roadmap operacional · ${rows.length} días</strong>
        <span>
          Presión de capacidad + hitos / dependencias
        </span>
      </div>

      <div class="v31a2-roadmap-scroll">
        <div
          class="v31a2-roadmap-inner"
          style="
            min-width:
            ${92+rows.length*colWidth}px;
          "
        >
          <div class="v31a2-roadmap-lane">
            <div class="v31a2-roadmap-label">
              Presión
            </div>

            <div
              class="v31a2-pressure-track"
              style="
                grid-template-columns:
                repeat(
                  ${rows.length},
                  ${colWidth}px
                );
              "
            >
              ${pressureCells}
            </div>
          </div>

          <div class="v31a2-roadmap-lane">
            <div class="v31a2-roadmap-label">
              Hitos
            </div>

            <div class="v31a2-event-stack">
              ${eventRows}
            </div>
          </div>
        </div>
      </div>
    `}function enhanceAll(){decorateCapacityProvenance(),enhanceCapacityChart(),enhanceZeroFlow(),enhanceActionState(),enhanceRooms(),enhanceWorkforce(),renderSelectionBar(),buildRoadmap()}let scheduled=!1;function schedule(){scheduled||(scheduled=!0,requestAnimationFrame(()=>{scheduled=!1,enhanceAll()}))}document.addEventListener("click",event=>{const mode=event.target.closest?.("[data-v31a2-capacity-mode]");if(mode){const panel=mode.closest("section,.panel,.v3-card,.ops-card,.bi-card");panel&&(panel.dataset.v31a2CapacityMode=mode.dataset.v31a2CapacityMode,schedule());return}const clear=event.target.closest?.("[data-v31a2-clear]");if(clear){const controls2=controlsForManagement();if(!controls2)return;const key=clear.dataset.v31a2Clear;if(key==="workforce")controls2.view.dataset.v31a2Workforce="";else{const select=controls2[key],option=allOption(select);select&&option&&(select.value=option.value,select.dispatchEvent(new Event("change",{bubbles:!0})))}schedule();return}if(event.target.closest?.("[data-v31a2-clear-all]")){const controls2=controlsForManagement();if(!controls2)return;[controls2.shift,controls2.company,controls2.module].forEach(select=>{const option=allOption(select);select&&option&&(select.value=option.value,select.dispatchEvent(new Event("change",{bubbles:!0})))}),controls2.view.dataset.v31a2Workforce="",schedule();return}const workforceItem=event.target.closest?.(".v3-workforce-summary > .direct,.v3-workforce-summary > .indirect,.v3-workforce-summary > .undefined");if(workforceItem){const view=q("#view-management");if(!view)return;const next=workforceItem.classList.contains("direct")?"direct":workforceItem.classList.contains("indirect")?"indirect":"undefined";view.dataset.v31a2Workforce=view.dataset.v31a2Workforce===next?"":next,schedule();return}const roadmapDate=event.target.closest?.("[data-v31a2-roadmap-date]")?.dataset?.v31a2RoadmapDate;if(roadmapDate){q(`.v31-plan-day[data-v31-plan-date="${CSS.escape(roadmapDate)}"]`)?.click?.();return}if(event.target.closest?.("button,a,input,select,textarea"))return;const controls=controlsForManagement();if(!controls)return;const target=event.target,pressure=findPanel(controls.view,/presi[oó]n de capacidad por m[oó]dulo|presi[oó]n operacional/i);if(pressure&&pressure.contains(target)){const option=optionFromClick(pressure,target,controls.module);if(option){setSelect(controls.module,option),schedule();return}}const companyPanel=findPanel(controls.view,/empresas en campamento/i);if(companyPanel&&companyPanel.contains(target)){const option=optionFromClick(companyPanel,target,controls.company);option&&(setSelect(controls.company,option),schedule())}},!0),document.addEventListener("keydown",event=>{if(event.key!=="Enter"&&event.key!==" ")return;const target=event.target;target?.classList?.contains("v31a2-workforce-selectable")&&(event.preventDefault(),target.click())}),document.addEventListener("change",event=>{event.target?.closest?.("#view-management,#view-planning")&&setTimeout(schedule,0)}),[q("#view-overview"),q("#view-management"),q("#view-planning"),q("#view-control-room")].filter(Boolean).forEach(view=>{new MutationObserver(schedule).observe(view,{childList:!0,subtree:!0})}),window.addEventListener("camp:advanced-render",()=>{setTimeout(schedule,0)}),window.addEventListener("resize",schedule,{passive:!0}),schedule(),setTimeout(schedule,120),setTimeout(schedule,700),window.GarpiUIV31A2=Object.freeze({VERSION,enhanceAll,buildRoadmap,renderSelectionBar})})();
