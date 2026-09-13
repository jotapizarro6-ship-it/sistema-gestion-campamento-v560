"use strict";(()=>{"use strict";if(typeof window>"u"||window.__GARPI_UI_V31_CLARITY__)return;window.__GARPI_UI_V31_CLARITY__=!0;const VERSION="20260913-v31a1",q=(selector,root=document)=>root?.querySelector?.(selector)||null,qa=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]),number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0},clean=value=>String(value??"").trim(),esc=value=>clean(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"),int=value=>Math.round(number(value)).toLocaleString("es-CL"),pct=value=>value==null||!Number.isFinite(Number(value))?"N/D":Number(value).toLocaleString("es-CL",{minimumFractionDigits:0,maximumFractionDigits:1})+"%";function formatDate(value){const raw=clean(value),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);return match?`${match[3]}-${match[2]}-${match[1]}`:raw||"Sin fecha"}function capacitySourceLabel(row){if(row?.capacity_available===!1)return"Sin fuente de capacidad válida";const source=clean(row?.capacity_source).toUpperCase();return source==="DAILY_CAPACITY"?"Capacidad diaria":source.includes("OPERATIONAL")||source.includes("UNIVERSE")||source.includes("UNIVERSO")?"Universo operacional":source?source.replaceAll("_"," ").toLowerCase():"Fuente canónica"}function pressureState(row){if(row?.capacity_available===!1||row?.committed_occupancy===null||row?.committed_occupancy===void 0)return"unavailable";const committed=number(row.committed_occupancy);return(row?.over===null||row?.over===void 0?0:number(row.over))>0||committed>100?"over":committed>=100?"full":committed>=90?"critical":committed>=80?"attention":"normal"}function planRows(){if(typeof planningRows!="function"||typeof A>"u"||!A?.data)return[];const start=clean(A.planStart)||(typeof todayISO=="function"?todayISO():new Date().toISOString().slice(0,10)),days=Math.min(31,Math.max(1,Number(A.planDays)||30));try{return planningRows(start,days,A.data)||[]}catch(error){return console.warn("GARPI V3.1: no fue posible construir planningRows",error),[]}}function planEvents(){return typeof A>"u"?[]:Array.isArray(A?.ops?.plan_events)?[...A.ops.plan_events]:[]}function eventOnDate(event,date){const start=clean(event?.start_date),end=clean(event?.end_date)||start;return!!(start&&start<=date&&end>=date)}function eventsForDate(events,date){return events.filter(event=>eventOnDate(event,date)).sort((a,b)=>clean(a.start_date).localeCompare(clean(b.start_date))||number(a.id)-number(b.id))}function openPlanDay(row,events){const dayEvents=eventsForDate(events,row.date),available=row.capacity_available!==!1,eventHTML=dayEvents.length?`
          <div class="v31-dialog-events">
            <h4>Hitos / eventos</h4>
            ${dayEvents.map(event=>`
              <div class="notice info">
                <strong>${esc(event.title||"Hito")}</strong><br>
                ${esc(event.status||"PLANIFICADO")}
                · ${esc(event.category||"HITO")}
                ${event.owner_name?`· ${esc(event.owner_name)}`:""}
              </div>
            `).join("")}
          </div>
        `:`
          <div class="notice ok">
            Sin hitos manuales para esta fecha.
          </div>
        `,html=`
      <div class="bi-dialog-grid">
        <div>
          <span>Fuente capacidad</span>
          <strong>${esc(capacitySourceLabel(row))}</strong>
        </div>
        <div>
          <span>Capacidad efectiva</span>
          <strong>${available?int(row.capacity):"N/D"}</strong>
        </div>
        <div>
          <span>Ocupación proyectada</span>
          <strong>${int(row.occupied)}</strong>
        </div>
        <div>
          <span>Reservas</span>
          <strong>${int(row.reserved)}</strong>
        </div>
        <div>
          <span>Comprometido</span>
          <strong>${pct(row.committed_occupancy)}</strong>
        </div>
        <div>
          <span>Libres</span>
          <strong>${available?int(row.free):"N/D"}</strong>
        </div>
        <div>
          <span>Déficit</span>
          <strong>${available?int(row.over):"N/D"}</strong>
        </div>
        <div>
          <span>Movimientos</span>
          <strong>
            ↑ ${int(row.up)}
            · ↓ ${int(row.down)}
          </strong>
        </div>
      </div>
      ${eventHTML}
    `;if(typeof showDialog=="function"){showDialog(`Plan Maestro · ${formatDate(row.date)}`,html);return}window.alert(`${formatDate(row.date)}
Capacidad: ${available?int(row.capacity):"N/D"}
Comprometido: ${pct(row.committed_occupancy)}`)}function renderPlanTimeline(force=!1){const host=q("#opsPlanGantt");if(!host)return;const rows=planRows(),events=planEvents(),signature=JSON.stringify({rows:rows.map(row=>[row.date,row.capacity,row.capacity_available,row.capacity_source,row.occupied,row.reserved,row.free,row.over,row.committed_occupancy]),events:events.map(event=>[event.id,event.start_date,event.end_date,event.status,event.title])});if(!force&&host.dataset.v31Signature===signature)return;host.dataset.v31Signature=signature;try{window.echarts?.getInstanceByDom?.(host)?.dispose?.()}catch{}if(host.classList.add("v31-plan-timeline-host"),!rows.length){host.innerHTML=`
        <div class="notice warn">
          No hay una ventana de planificación disponible.
        </div>
      `;return}const sourceLabels=rows.map(capacitySourceLabel),uniqueSources=Array.from(new Set(sourceLabels)),sourceNote=uniqueSources.length>1?`
          <div class="v31-plan-source-note">
            <span aria-hidden="true">ⓘ</span>
            <div>
              <strong>La fuente de capacidad cambia dentro de la ventana.</strong>
              Cada día muestra su fuente canónica.
              No se replica automáticamente la capacidad del día actual.
            </div>
          </div>
        `:`
          <div class="v31-plan-source-note">
            <span aria-hidden="true">ⓘ</span>
            <div>
              <strong>Fuente de capacidad:</strong>
              ${esc(uniqueSources[0])}.
            </div>
          </div>
        `;host.innerHTML=`
      <div class="v31-plan-shell">
        ${sourceNote}

        <div
          class="v31-plan-legend"
          aria-label="Umbrales de presión"
        >
          <span class="normal"><i></i>Normal &lt;80%</span>
          <span class="attention"><i></i>Atención ≥80%</span>
          <span class="critical"><i></i>Crítico ≥90%</span>
          <span class="full"><i></i>Capacidad ≥100%</span>
          <span class="unavailable"><i></i>Sin capacidad</span>
        </div>

        <div
          class="v31-plan-scroll"
          aria-label="Línea de tiempo de planificación"
        >
          ${rows.map(row=>{const state=pressureState(row),available=row.capacity_available!==!1,committed=row.committed_occupancy,width=committed==null?0:Math.min(100,Math.max(0,number(committed))),dayEvents=eventsForDate(events,row.date);return`
              <button
                type="button"
                class="v31-plan-day ${state}"
                data-v31-plan-date="${esc(row.date)}"
                aria-label="${esc(`${formatDate(row.date)}. ${capacitySourceLabel(row)}. Comprometido ${pct(committed)}. ${dayEvents.length} hito(s).`)}"
              >
                <span class="v31-plan-date">
                  ${esc(formatDate(row.date))}
                </span>

                <span class="v31-plan-source">
                  ${esc(capacitySourceLabel(row))}
                </span>

                <span
                  class="v31-plan-pressure"
                  aria-hidden="true"
                >
                  <i style="width:${width}%"></i>
                </span>

                <span class="v31-plan-metrics">
                  <span>
                    Cap.
                    <strong>
                      ${available?int(row.capacity):"N/D"}
                    </strong>
                  </span>

                  <span>
                    Comp.
                    <strong>
                      ${pct(committed)}
                    </strong>
                  </span>

                  <span>
                    Libres
                    <strong>
                      ${available?int(row.free):"N/D"}
                    </strong>
                  </span>

                  <span>
                    Déficit
                    <strong>
                      ${available?int(row.over):"N/D"}
                    </strong>
                  </span>
                </span>

                <span
                  class="v31-plan-events"
                  aria-label="${dayEvents.length} hito(s)"
                >
                  ${dayEvents.map(event=>`
                    <i
                      class="v31-plan-event-dot ${clean(event.status).toLowerCase()}"
                      title="${esc(event.title||"Hito")}"
                    ></i>
                  `).join("")}
                </span>
              </button>
            `}).join("")}
        </div>
      </div>
    `,qa("[data-v31-plan-date]",host).forEach(button=>{button.addEventListener("click",()=>{const row=rows.find(item=>item.date===button.dataset.v31PlanDate);row&&openPlanDay(row,events)})})}function closeAdvanced(){const details=q("#view-management > details.dc-legacy-details.v31-modal-open");details&&(details.classList.remove("v31-modal-open"),details.open=!1),document.body.classList.remove("v31-advanced-open")}function ensureAdvancedBar(details){const slot=q(".dc-legacy-slot",details);if(!slot)return null;let bar=q(":scope > .v31-advanced-bar",slot);return bar||(bar=document.createElement("div"),bar.className="v31-advanced-bar",bar.innerHTML=`
        <div>
          <strong>Herramientas avanzadas</strong>
          <small>
            Segundo nivel · fuera del flujo principal del dashboard
          </small>
        </div>

        <button
          type="button"
          class="v31-advanced-close"
          data-v31-close-advanced
        >
          Cerrar
        </button>
      `,slot.prepend(bar)),bar}function openAdvanced(target){const details=q("#view-management > details.dc-legacy-details");if(!details){typeof showMessage=="function"&&showMessage("La herramienta avanzada aún no está disponible.","info");return}ensureAdvancedBar(details),details.open=!0,details.classList.add("v31-modal-open"),document.body.classList.add("v31-advanced-open"),requestAnimationFrame(()=>{const slot=q(".dc-legacy-slot",details);(target==="cost"&&q("#costForm",details)||slot)?.scrollIntoView?.({block:"start",behavior:"smooth"})})}function markLegacy(){qa("#view-overview > details.dc-legacy-details").forEach(details=>{details.open=!1,details.classList.add("v31-primary-hidden")}),qa("#view-management > details.dc-legacy-details").forEach(details=>{details.classList.add("v31-advanced-source"),details.classList.contains("v31-modal-open")||(details.open=!1)})}function polishAdvancedHub(){const card=q("[data-v3-advanced]");if(!card)return;const title=q(".v3-card-head h3",card),description=q(".v3-card-head p",card);title&&(title.textContent="Herramientas especializadas"),description&&(description.textContent="Historial, costos, drillthrough y reportes se abren solo cuando los necesitas, sin repetir el dashboard principal.")}function installPlanHook(){const api=window.CampOpsECharts;if(!api||api.__garpiV31PlanningWrapped)return;const base=typeof api.renderPlanning=="function"?api.renderPlanning.bind(api):null;api.renderPlanning=function(){base&&base(),setTimeout(()=>{renderPlanTimeline(!0)},0)},api.__garpiV31PlanningWrapped=!0}let scheduled=!1;function scheduleEnhancement(){scheduled||(scheduled=!0,requestAnimationFrame(()=>{scheduled=!1,markLegacy(),polishAdvancedHub(),installPlanHook(),q("#opsPlanGantt")&&renderPlanTimeline()}))}document.addEventListener("click",event=>{const advancedButton=event.target.closest?.("[data-v3-open-advanced]");if(advancedButton){event.preventDefault(),event.stopPropagation(),event.stopImmediatePropagation(),openAdvanced(advancedButton.dataset.v3OpenAdvanced);return}event.target.closest?.("[data-v31-close-advanced]")&&(event.preventDefault(),closeAdvanced())},!0),document.addEventListener("keydown",event=>{event.key==="Escape"&&document.body.classList.contains("v31-advanced-open")&&closeAdvanced()});const observer=new MutationObserver(scheduleEnhancement);[q("#view-overview"),q("#view-management"),q("#view-planning")].filter(Boolean).forEach(view=>{observer.observe(view,{childList:!0,subtree:!1})}),window.addEventListener("camp:advanced-render",()=>{setTimeout(scheduleEnhancement,0)}),window.addEventListener("resize",()=>{q("#opsPlanGantt")&&scheduleEnhancement()},{passive:!0}),scheduleEnhancement(),setTimeout(scheduleEnhancement,50),setTimeout(scheduleEnhancement,400),window.GarpiUIV31Clarity=Object.freeze({VERSION,renderPlanTimeline,openAdvanced,closeAdvanced})})();
