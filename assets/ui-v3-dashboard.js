(() => {
  'use strict';

  const VERSION = '20260912-v3a10';

  const clean = value =>
    String(value == null ? '' : value).trim();

  const norm = value =>
    clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

  const number = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const int = value =>
    Math.round(number(value)).toLocaleString('es-CL');

  const pct = value =>
    `${number(value).toLocaleString(
      'es-CL',
      {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }
    )}%`;

  const esc = value =>
    clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  function hasBed(worker) {
    return Boolean(
      clean(worker?.rut) &&
      clean(worker?.modulo) &&
      clean(worker?.habitacion) &&
      clean(worker?.cama)
    );
  }

  function occupiedRows(data) {
    try {
      if (typeof occupiedWorkers === 'function') {
        return occupiedWorkers(data);
      }
    } catch (_) {}

    return (data?.workers || []).filter(hasBed);
  }

  function workforceTotals(rows) {
    try {
      const api = window.CampWorkforceMODMOI;

      if (api?.compute) {
        const model = api.compute(
          rows,
          api.state?.rules || {},
          {}
        );

        if (model?.totals) {
          return {
            total: number(model.totals.total),
            direct: number(model.totals.DIRECTA),
            indirect: number(model.totals.INDIRECTA),
            undefined: number(model.totals.POR_DEFINIR)
          };
        }
      }
    } catch (_) {}

    return {
      total: rows.length,
      direct: 0,
      indirect: 0,
      undefined: rows.length
    };
  }

  function companyRows(data, occupied) {
    const grouped = new Map();
    const registered = new Map();

    for (const worker of data?.workers || []) {
      const label =
        clean(worker.empresa) || 'SIN EMPRESA';

      registered.set(
        label,
        (registered.get(label) || 0) + 1
      );
    }

    for (const worker of occupied) {
      const label =
        clean(worker.empresa) || 'SIN EMPRESA';

      if (!grouped.has(label)) {
        grouped.set(label, []);
      }

      grouped.get(label).push(worker);
    }

    const campTotal =
      Math.max(occupied.length, 1);

    return [...grouped.entries()]
      .map(([label, workers]) => {
        const wf = workforceTotals(workers);

        const registeredCount =
          number(registered.get(label));

        const lodgingPct =
          registeredCount > 0
            ? workers.length /
              registeredCount *
              100
            : null;

        return {
          label,
          workers,
          count: workers.length,
          registered: registeredCount,
          lodgingPct,
          share:
            workers.length /
            campTotal *
            100,
          direct: wf.direct,
          indirect: wf.indirect,
          undefined: wf.undefined
        };
      })
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.label.localeCompare(
            b.label,
            'es'
          )
      );
  }

  function moduleRows(data, occupied, an) {
    const grouped = new Map();

    for (const worker of occupied) {
      const label =
        clean(worker.modulo) || 'SIN MODULO';

      if (!grouped.has(label)) {
        grouped.set(label, []);
      }

      grouped.get(label).push(worker);
    }

    const total = Math.max(occupied.length, 1);
    const hm = an?.hm?.modules || [];

    return [...grouped.entries()]
      .map(([label, workers]) => {
        const capacity =
          hm.find(
            row =>
              norm(row.label) ===
              norm(label)
          ) || {};

        return {
          label,
          workers,
          count: workers.length,
          share:
            workers.length / total * 100,
          occupied:
            number(capacity.occupied),
          reserved:
            number(capacity.reserved),
          blocked:
            number(capacity.blocked),
          free:
            number(capacity.free),
          capacity:
            number(capacity.capacity),
          pressure:
            number(capacity.pct)
        };
      })
      .sort(
        (a, b) =>
          b.count - a.count ||
          b.pressure - a.pressure ||
          a.label.localeCompare(
            b.label,
            'es'
          )
      );
  }

  function uniqueAlerts(an) {
    const seen = new Set();
    const rows = [];

    for (
      const item of [
        ...(an?.exceptions || []),
        ...(an?.anomalies || [])
      ]
    ) {
      const title =
        clean(item?.title) ||
        clean(item?.code) ||
        'Alerta operacional';

      const key = norm(title);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      rows.push({
        title,
        detail:
          clean(item?.detail) ||
          clean(item?.description) ||
          '',
        level:
          clean(item?.level).toLowerCase(),
        count:
          item?.count
      });
    }

    const priority = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3
    };

    return rows
      .sort(
        (a, b) =>
          (priority[a.level] ?? 9) -
          (priority[b.level] ?? 9)
      )
      .slice(0, 5);
  }

  function appState() {
    try {
      if (typeof A !== 'undefined') {
        return A;
      }
    } catch (_) {}

    return window.A || null;
  }

  function buildModel(data) {
    if (
      !data ||
      typeof analytics !== 'function'
    ) {
      return null;
    }

    const an = analytics(data);
    const occupied = occupiedRows(data);
    const companies =
      companyRows(data, occupied);
    const modules =
      moduleRows(data, occupied, an);

    const validCompanies =
      companies.filter(
        row =>
          norm(row.label) !==
          'SIN EMPRESA'
      );

    const rawForecast =
      (an.forecast || []).slice(0, 30);

    const forecast =
      rawForecast.filter(
        row =>
          row?.capacity_available !== false &&
          (
            row?.pct != null ||
            row?.committed_occupancy != null
          )
      );

    const peak =
      forecast.reduce(
        (best, row) =>
          number(
            row.pct ??
            row.committed_occupancy
          ) >
          number(
            best?.pct ??
            best?.committed_occupancy
          )
            ? row
            : best,
        forecast[0] || null
      );

    const days90 =
      forecast.filter(
        row =>
          number(
            row.pct ??
            row.committed_occupancy
          ) >= 90
      ).length;

    const over =
      forecast.filter(
        row =>
          number(row.over) > 0
      );

    let movement = {};

    try {
      if (typeof movementsOn === 'function') {
        movement =
          movementsOn(todayISO(), data) || {};
      }
    } catch (_) {}

    const movementUp =
      number(movement.SUBIDA);

    const movementDown =
      number(movement.BAJADA);

    let exceptionRows = [];

    try {
      if (
        typeof calcExceptions === 'function'
      ) {
        const result =
          calcExceptions(data, an);

        if (Array.isArray(result)) {
          exceptionRows = result;
        }
      }
    } catch (_) {}

    return {
      data,
      an,
      occupied,
      companies,
      validCompanies,
      modules,
      totalPeople: occupied.length,
      movementUp,
      movementDown,
      movements:
        movementUp + movementDown,
      forecast,
      peak,
      days90,
      over,
      alerts: uniqueAlerts({
        exceptions:
          exceptionRows.length
            ? exceptionRows
            : (an?.exceptions || []),
        anomalies:
          an?.anomalies || []
      })
    };
  }

  const v3FilterState = {
    company: '',
    shift: '',
    module: ''
  };

  const v3InsightState = {
    workforceDimension: 'company',
    showAllModules: false
  };

  function v3UniqueValues(rows, key) {
    return [
      ...new Set(
        (rows || [])
          .map(row => clean(row?.[key]))
          .filter(Boolean)
      )
    ].sort(
      (a, b) =>
        a.localeCompare(
          b,
          'es',
          {
            sensitivity: 'base'
          }
        )
    );
  }

  function v3OptionHTML(
    values,
    selected,
    emptyLabel
  ) {
    return [
      `<option value="">${esc(emptyLabel)}</option>`,
      ...values.map(value => `
        <option
          value="${esc(value)}"
          ${
            norm(value) === norm(selected)
              ? 'selected'
              : ''
          }
        >
          ${esc(value)}
        </option>
      `)
    ].join('');
  }

  function v3ScopedOccupied(model) {
    return (model.occupied || [])
      .filter(worker => {
        if (
          v3FilterState.company &&
          norm(worker.empresa) !==
            norm(v3FilterState.company)
        ) {
          return false;
        }

        if (
          v3FilterState.shift &&
          norm(worker.turno) !==
            norm(v3FilterState.shift)
        ) {
          return false;
        }

        if (
          v3FilterState.module &&
          norm(worker.modulo) !==
            norm(v3FilterState.module)
        ) {
          return false;
        }

        return true;
      });
  }

  function v3ScopedModel(model) {
    const occupied =
      v3ScopedOccupied(model);

    const companies =
      companyRows(
        model.data,
        occupied
      );

    const modules =
      moduleRows(
        model.data,
        occupied,
        model.an
      );

    return {
      ...model,
      occupied,
      companies,
      validCompanies:
        companies.filter(
          row =>
            norm(row.label) !==
            'SIN EMPRESA'
        ),
      modules,
      totalPeople: occupied.length
    };
  }

  function v3FilterBar(model) {
    const companies =
      v3UniqueValues(
        model.occupied,
        'empresa'
      ).filter(
        value =>
          norm(value) !==
          'SIN EMPRESA'
      );

    const shifts =
      v3UniqueValues(
        model.occupied,
        'turno'
      );

    const modules =
      v3UniqueValues(
        model.occupied,
        'modulo'
      );

    const scoped =
      v3ScopedOccupied(model);

    const active =
      Boolean(
        v3FilterState.company ||
        v3FilterState.shift ||
        v3FilterState.module
      );

    return `
      <section
        class="v3-filterbar"
        aria-label="Filtros de exploracion"
      >
        <div class="v3-filterbar-head">
          <div>
            <strong>Enfoque de exploraci\u00f3n</strong>
            <small>
              Los 8 KPI mantienen el total campamento.
              Los filtros ajustan empresas, m\u00f3dulos,
              trazabilidad y drill-down.
            </small>
          </div>

          <span
            class="v3-filter-scope"
            data-v3-scope
          >
            ${int(scoped.length)}
            persona(s) en foco
          </span>
        </div>

        <div class="v3-filter-controls">
          <label>
            <span>Fecha</span>
            <input
              id="v3FilterDate"
              type="date"
              value="${esc(todayISO())}"
              readonly
              aria-readonly="true"
              title="Fecha operativa actual"
            >
          </label>

          <label>
            <span>Turno</span>
            <select id="v3FilterShift">
              ${v3OptionHTML(
                shifts,
                v3FilterState.shift,
                'Todos los turnos'
              )}
            </select>
          </label>

          <label>
            <span>Empresa</span>
            <select id="v3FilterCompany">
              ${v3OptionHTML(
                companies,
                v3FilterState.company,
                'Todas las empresas'
              )}
            </select>
          </label>

          <label>
            <span>M\u00f3dulo</span>
            <select id="v3FilterModule">
              ${v3OptionHTML(
                modules,
                v3FilterState.module,
                'Todos los m\u00f3dulos'
              )}
            </select>
          </label>

          <div class="v3-filter-actions">
            <button
              type="button"
              class="btn btn-secondary"
              data-v3-reset-filters
              ${active ? '' : 'disabled'}
            >
              Limpiar
            </button>

            <button
              type="button"
              class="btn btn-primary"
              data-v3-open-map
            >
              Abrir mapa de camas
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function v3ModulePressureRows(model) {
    let rows =
      (model.an?.hm?.modules || [])
        .map(row => ({
          label:
            clean(row?.label) ||
            'SIN MODULO',
          capacity:
            number(row?.capacity),
          occupied:
            number(row?.occupied),
          reserved:
            number(row?.reserved),
          blocked:
            number(row?.blocked),
          free:
            number(row?.free),
          pressure:
            number(row?.pct)
        }))
        .sort(
          (a, b) =>
            b.pressure - a.pressure ||
            (
              b.occupied +
              b.reserved
            ) -
            (
              a.occupied +
              a.reserved
            ) ||
            a.label.localeCompare(
              b.label,
              'es'
            )
        );

    if (v3FilterState.module) {
      rows =
        rows.filter(
          row =>
            norm(row.label) ===
            norm(v3FilterState.module)
        );
    }

    return rows;
  }

  function v3ModulePressureCard(model) {
    const all =
      v3ModulePressureRows(model);

    const nonZero =
      all.filter(
        row =>
          row.pressure > 0 ||
          row.occupied > 0 ||
          row.reserved > 0 ||
          row.blocked > 0
      );

    const priority =
      (
        nonZero.length
          ? nonZero
          : all
      ).slice(0, 5);

    const rows =
      v3InsightState.showAllModules
        ? all
        : priority;

    const canToggle =
      all.length > priority.length;

    return `
      <section
        class="v3-card v3-pressure-card"
        data-v3-pressure-card
      >
        <div class="v3-card-head">
          <div>
            <h3>Presi\u00f3n de capacidad por m\u00f3dulo</h3>
            <p>
              Prioriza m\u00f3dulos con uso o compromiso.
              Empresa y turno no alteran esta presi\u00f3n
              f\u00edsica global.
            </p>
          </div>

          <span class="v3-tag">
            ${int(all.length)} M\u00d3DULOS
          </span>
        </div>

        <div class="v3-pressure-list">
          ${
            rows.length
              ? rows.map(row => {
                  const tone =
                    row.pressure >= 100
                      ? 'critical'
                      : row.pressure >= 90
                        ? 'critical'
                        : row.pressure >= 80
                          ? 'attention'
                          : 'normal';

                  return `
                    <button
                      type="button"
                      class="v3-pressure-row ${tone}"
                      data-v3-pressure-module="${esc(row.label)}"
                      data-v3-module="${esc(row.label)}"
                    >
                      <div class="v3-pressure-main">
                        <strong>${esc(row.label)}</strong>
                        <small>
                          ${int(row.occupied)} ocupadas
                          \u00b7 ${int(row.reserved)} reservadas
                          \u00b7 ${int(row.blocked)} fuera servicio
                          \u00b7 ${int(row.free)} libres
                        </small>
                      </div>

                      <div class="v3-pressure-meter">
                        <i
                          class="${tone}"
                          style="width:${Math.min(Math.max(row.pressure, 0), 100)}%"
                        ></i>
                      </div>

                      <b>${pct(row.pressure)}</b>
                    </button>
                  `;
                }).join('')
              : `
                <div class="v3-empty">
                  Sin informaci\u00f3n de presi\u00f3n por m\u00f3dulo.
                </div>
              `
          }
        </div>

        ${
          canToggle
            ? `
              <div class="v3-card-actions">
                <button
                  type="button"
                  class="btn btn-secondary"
                  data-v3-toggle-modules
                  aria-expanded="${
                    v3InsightState.showAllModules
                      ? 'true'
                      : 'false'
                  }"
                >
                  ${
                    v3InsightState.showAllModules
                      ? 'Ver prioritarios'
                      : `Ver todos (${int(all.length)})`
                  }
                </button>
              </div>
            `
            : ''
        }
      </section>
    `;
  }

  function v3WorkforceDimensionKey(
    worker,
    dimension
  ) {
    if (dimension === 'shift') {
      return (
        clean(worker.turno) ||
        'SIN TURNO'
      );
    }

    if (dimension === 'module') {
      return (
        clean(worker.modulo) ||
        'SIN MODULO'
      );
    }

    return (
      clean(worker.empresa) ||
      'SIN EMPRESA'
    );
  }

  function v3WorkforceDimensionRows(
    model,
    dimension
  ) {
    const workers =
      v3ScopedOccupied(model);

    const grouped =
      new Map();

    for (const worker of workers) {
      const label =
        v3WorkforceDimensionKey(
          worker,
          dimension
        );

      if (!grouped.has(label)) {
        grouped.set(label, []);
      }

      grouped
        .get(label)
        .push(worker);
    }

    return [...grouped.entries()]
      .map(([label, rows]) => {
        const totals =
          workforceTotals(rows);

        return {
          label,
          workers: rows,
          total:
            number(totals.total),
          direct:
            number(totals.direct),
          indirect:
            number(totals.indirect),
          undefined:
            number(totals.undefined)
        };
      })
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.label.localeCompare(
            b.label,
            'es'
          )
      );
  }

  function v3WorkforceCard(model) {
    const dimension =
      v3InsightState.workforceDimension;

    const scopedWorkers =
      v3ScopedOccupied(model);

    const totals =
      workforceTotals(scopedWorkers);

    const rows =
      v3WorkforceDimensionRows(
        model,
        dimension
      );

    const total =
      Math.max(
        number(totals.total),
        1
      );

    const dimensionLabel =
      dimension === 'shift'
        ? 'Turno'
        : dimension === 'module'
          ? 'M\u00f3dulo'
          : 'Empresa';

    return `
      <section
        class="v3-card v3-workforce-card"
        data-v3-workforce-card
      >
        <div class="v3-card-head">
          <div>
            <h3>Composici\u00f3n MOD / MOI</h3>
            <p>
              Personal alojando dentro del enfoque actual,
              clasificado con CampWorkforceMODMOI.
            </p>
          </div>

          <span class="v3-tag">
            ${int(totals.total)} PERSONAS
          </span>
        </div>

        <div
          class="v3-workforce-tabs"
          role="tablist"
          aria-label="Agrupar composici\u00f3n MOD MOI"
        >
          ${[
            ['company', 'Empresa'],
            ['shift', 'Turno'],
            ['module', 'M\u00f3dulo']
          ].map(([key, label]) => `
            <button
              type="button"
              role="tab"
              class="v3-workforce-tab ${
                dimension === key
                  ? 'active'
                  : ''
              }"
              data-v3-workforce-dim="${key}"
              aria-selected="${
                dimension === key
                  ? 'true'
                  : 'false'
              }"
            >
              ${label}
            </button>
          `).join('')}
        </div>

        <div class="v3-workforce-summary">
          <div class="direct">
            <span>MOD</span>
            <strong>${int(totals.direct)}</strong>
            <small>
              ${pct(
                number(totals.direct) /
                total *
                100
              )}
            </small>
          </div>

          <div class="indirect">
            <span>MOI</span>
            <strong>${int(totals.indirect)}</strong>
            <small>
              ${pct(
                number(totals.indirect) /
                total *
                100
              )}
            </small>
          </div>

          <div class="undefined">
            <span>Por definir</span>
            <strong>${int(totals.undefined)}</strong>
            <small>
              ${pct(
                number(totals.undefined) /
                total *
                100
              )}
            </small>
          </div>
        </div>

        <div class="v3-workforce-list">
          ${
            rows.length
              ? rows.map(row => {
                  const rowTotal =
                    Math.max(
                      row.total,
                      1
                    );

                  const directPct =
                    row.direct /
                    rowTotal *
                    100;

                  const indirectPct =
                    row.indirect /
                    rowTotal *
                    100;

                  const undefinedPct =
                    row.undefined /
                    rowTotal *
                    100;

                  return `
                    <button
                      type="button"
                      class="v3-workforce-row"
                      data-v3-workforce-row="${esc(row.label)}"
                      data-v3-workforce-row-dim="${dimension}"
                    >
                      <div class="v3-workforce-row-head">
                        <strong>${esc(row.label)}</strong>
                        <span>
                          ${int(row.total)}
                          persona(s)
                        </span>
                      </div>

                      <div
                        class="v3-workforce-stack"
                        aria-label="${esc(
                          `${dimensionLabel} ${row.label}: MOD ${row.direct}, MOI ${row.indirect}, por definir ${row.undefined}`
                        )}"
                      >
                        <i
                          class="direct"
                          style="width:${directPct}%"
                        ></i>
                        <i
                          class="indirect"
                          style="width:${indirectPct}%"
                        ></i>
                        <i
                          class="undefined"
                          style="width:${undefinedPct}%"
                        ></i>
                      </div>

                      <small>
                        MOD ${int(row.direct)}
                        \u00b7 MOI ${int(row.indirect)}
                        ${
                          row.undefined
                            ? `\u00b7 Por definir ${int(row.undefined)}`
                            : ''
                        }
                      </small>
                    </button>
                  `;
                }).join('')
              : `
                <div class="v3-empty">
                  Sin personal alojando dentro del enfoque actual.
                </div>
              `
          }
        </div>

        <div class="v3-legend">
          <span><i class="direct"></i> MOD</span>
          <span><i class="indirect"></i> MOI</span>
          <span><i class="undefined"></i> Por definir</span>
        </div>
      </section>
    `;
  }

  function v3HotelMapCard(model) {
    const api=
      window.GarpiControlCenterMap;

    if(
      !api?.snapshot ||
      !api?.bedMap ||
      !api?.detailHTML
    ) {
      return `
        <section
          class="v3-card v3-hotel-card"
          data-v3-hotel-map
        >
          <div class="v3-card-head">
            <div>
              <h3>Mapa hotel de camas</h3>
              <p>
                El mapa compartido del Centro de Gesti\u00f3n
                no est\u00e1 disponible en este contexto.
              </p>
            </div>
          </div>

          <div class="v3-card-actions">
            <button
              type="button"
              class="btn btn-primary"
              data-v3-open-map
            >
              Abrir mapa completo
            </button>
          </div>
        </section>
      `;
    }

    const state=
      appState();

    const requestedModule =
      v3FilterState.module ||
      clean(state?.mapModule) ||
      clean(
        model.an?.hm?.moduleNames?.[0]
      );

    const snapshot=
      api.snapshot(
        requestedModule
      );

    if(
      !snapshot ||
      !snapshot.moduleName
    ) {
      return `
        <section
          class="v3-card v3-hotel-card"
          data-v3-hotel-map
        >
          <div class="v3-card-head">
            <div>
              <h3>Mapa hotel de camas</h3>
              <p>
                No existe inventario de camas disponible.
              </p>
            </div>
          </div>
        </section>
      `;
    }

    const mod=
      snapshot.module || {};

    return `
      <section
        class="v3-card v3-hotel-card"
        data-v3-hotel-map
      >
        <div class="v3-card-head">
          <div>
            <h3>Mapa hotel de camas</h3>
            <p>
              M\u00f3dulo \u2192 habitaci\u00f3n \u2192 cama.
              Estados y detalle provienen del Centro de Gesti\u00f3n.
            </p>
          </div>

          <span class="v3-tag">
            ${int(snapshot.items.length)} CAMAS
          </span>
        </div>

        <div class="v3-hotel-toolbar">
          <label>
            <span>M\u00f3dulo</span>

            <select
              id="v3HotelModule"
              aria-label="M\u00f3dulo del mapa hotel"
            >
              ${snapshot.moduleNames
                .map(name => `
                  <option
                    value="${esc(name)}"
                    ${
                      norm(name) ===
                      norm(snapshot.moduleName)
                        ? 'selected'
                        : ''
                    }
                  >
                    ${esc(name)}
                  </option>
                `)
                .join('')}
            </select>
          </label>

          <div class="v3-hotel-status">
            <span class="occupied">
              Ocupadas ${int(mod.occupied)}
            </span>
            <span class="reserved">
              Reservadas ${int(mod.reserved)}
            </span>
            <span class="blocked">
              Bloqueadas ${int(mod.blocked)}
            </span>
            <span class="free">
              Libres ${int(mod.free)}
            </span>
          </div>
        </div>

        <div class="v3-hotel-layout">
          <div class="v3-hotel-map-body">
            ${api.bedMap(snapshot.items)}
          </div>

          <aside
            class="v3-hotel-detail"
            id="v3HotelDetail"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            ${api.detailHTML(null)}
          </aside>
        </div>

        <div class="v3-card-actions">
          <button
            type="button"
            class="btn btn-primary"
            data-v3-open-map
            data-v3-map-module="${esc(
              snapshot.moduleName
            )}"
          >
            Abrir mapa completo
          </button>
        </div>
      </section>
    `;
  }

  function v3CapacityCard(model) {
    const an = model.an;

    const available =
      an.capacityAvailable !== false &&
      an.status !== 'unavailable';

    return `
      <section class="v3-card v3-ops-card">
        <div class="v3-card-head">
          <div>
            <h3>Capacidad y ocupaci\u00f3n</h3>
            <p>
              Lectura compacta del contrato Capacity V1.
            </p>
          </div>

          <span
            class="v3-tag ${
              available
                ? ''
                : 'attention'
            }"
          >
            ${
              available
                ? 'OPERATIVA'
                : 'NO DISPONIBLE'
            }
          </span>
        </div>

        ${
          available
            ? `
              <div class="v3-ops-metrics">
                <div>
                  <span>Capacidad efectiva</span>
                  <strong>
                    ${int(an.effectiveCapacity)}
                  </strong>
                </div>

                <div>
                  <span>Ocupadas</span>
                  <strong>
                    ${int(an.occupied)}
                  </strong>
                </div>

                <div>
                  <span>Reservadas</span>
                  <strong>
                    ${int(an.reservedToday)}
                  </strong>
                </div>

                <div>
                  <span>Fuera servicio</span>
                  <strong>
                    ${int(an.blockedToday)}
                  </strong>
                </div>

                <div>
                  <span>Libres reales</span>
                  <strong>
                    ${int(an.free)}
                  </strong>
                </div>

                <div>
                  <span>Ocupaci\u00f3n f\u00edsica</span>
                  <strong>
                    ${pct(an.occupancyPct)}
                  </strong>
                </div>
              </div>
            `
            : `
              <div class="v3-empty">
                Capacidad no disponible.
                GARPI mantiene fail-closed:
                no fabrica camas libres ni porcentajes.
              </div>
            `
        }
      </section>
    `;
  }

  function v3MovementsCard(model) {
    return `
      <section class="v3-card v3-ops-card">
        <div class="v3-card-head">
          <div>
            <h3>Movimientos hoy</h3>
            <p>
              Fuente can\u00f3nica:
              movimientos operativos de la fecha.
            </p>
          </div>

          <span class="v3-tag">
            ${int(model.movements)} TOTAL
          </span>
        </div>

        <div class="v3-movement-grid">
          <div class="up">
            <span>Subidas</span>
            <strong>
              ${int(model.movementUp)}
            </strong>
          </div>

          <div class="down">
            <span>Bajadas</span>
            <strong>
              ${int(model.movementDown)}
            </strong>
          </div>
        </div>

        <div class="v3-card-actions">
          <button
            type="button"
            class="btn btn-secondary"
            data-v3-goto="movements"
          >
            Ver movimientos
          </button>

          <button
            type="button"
            class="btn btn-secondary"
            data-v3-open-map
          >
            Ver mapa de alojamiento
          </button>
        </div>
      </section>
    `;
  }

  function kpi(
    label,
    value,
    note,
    tone = ''
  ) {
    return `
      <article class="v3-kpi ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note || '&nbsp;'}</small>
      </article>
    `;
  }

  function executiveSummary(model) {
    const {
      an,
      totalPeople,
      validCompanies,
      companies,
      modules,
      days90,
      over
    } = model;

    const capacityAvailable =
      an.capacityAvailable !== false &&
      an.status !== 'unavailable';

    const topCompany =
      companies.find(
        row =>
          norm(row.label) !==
          'SIN EMPRESA'
      );

    const topModule = modules[0];

    const capacityText =
      !capacityAvailable
        ? 'Capacidad no disponible: GARPI mantiene modo fail-closed y no fabrica libres ni porcentajes.'
        : over.length
          ? `${over.length} dia(s) con deficit proyectado.`
          : days90
            ? `${days90} dia(s) alcanzan al menos 90% en la proyeccion.`
            : 'Sin deficit de capacidad proyectado en la ventana disponible.';

    const occupancyText =
      capacityAvailable
        ? `
          Ocupación física
          <strong>${pct(an.occupancyPct)}</strong>
          con
          <strong>${int(an.free)} camas libres efectivas</strong>.
        `
        : `
          Los indicadores dependientes de capacidad estan
          <strong>NO DISPONIBLES</strong>.
        `;

    return `
      <section class="v3-card v3-summary">
        <div class="v3-card-head">
          <div>
            <h3>Resumen ejecutivo</h3>
            <p>Lectura unica para decision, sin repetir los KPI superiores.</p>
          </div>
          <span class="v3-tag ${capacityAvailable ? '' : 'attention'}">
            ${capacityAvailable ? 'HOY' : 'CAPACIDAD INCOMPLETA'}
          </span>
        </div>

        <p>
          <strong>${int(totalPeople)} personas alojando</strong>
          en
          <strong>${int(validCompanies.length)} empresas</strong>.
          ${occupancyText}

          ${
            topCompany
              ? `La mayor presencia corresponde a <strong>${esc(topCompany.label)}</strong> con ${int(topCompany.count)} persona(s).`
              : ''
          }

          ${
            topModule
              ? `La mayor concentracion esta en <strong>${esc(topModule.label)}</strong> con ${int(topModule.count)} persona(s).`
              : ''
          }

          ${capacityText}
        </p>
      </section>
    `;
  }

  function focusCard(model) {
    if (!model.alerts.length) {
      return `
        <section class="v3-card">
          <div class="v3-card-head">
            <div>
              <h3>Foco ejecutivo</h3>
              <p>Excepciones priorizadas para revision.</p>
            </div>
            <span class="v3-tag good">SIN ALERTAS</span>
          </div>

          <div class="v3-empty-good">
            No se detectan excepciones relevantes en los datos actuales.
          </div>
        </section>
      `;
    }

    return `
      <section class="v3-card">
        <div class="v3-card-head">
          <div>
            <h3>Foco ejecutivo</h3>
            <p>Una sola lista priorizada de excepciones y anomalias.</p>
          </div>
          <span class="v3-tag attention">
            ${int(model.alerts.length)} ACTIVAS
          </span>
        </div>

        <div class="v3-alerts">
          ${model.alerts.map(item => `
            <div class="v3-alert ${esc(item.level)}">
              <i></i>
              <div>
                <strong>${esc(item.title)}</strong>
                <small>${esc(item.detail)}</small>
              </div>
              <b>
                ${
                  item.count == null
                    ? 'REVISAR'
                    : int(item.count)
                }
              </b>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function companyCard(model) {
    const rows = model.companies;
    const max =
      Math.max(
        ...rows.map(row => row.count),
        1
      );

    if (!rows.length) {
      return `
        <section class="v3-card v3-span-2">
          <div class="v3-card-head">
            <div>
              <h3>Empresas en campamento</h3>
              <p>Personal alojando por empresa.</p>
            </div>
          </div>
          <div class="v3-empty">
            Sin personal alojando para mostrar.
          </div>
        </section>
      `;
    }

    return `
      <section class="v3-card v3-span-2">
        <div class="v3-card-head">
          <div>
            <h3>Empresas en campamento</h3>
            <p>
              Cantidad alojando, participacion dentro del campamento y composicion MOD / MOI.
            </p>
          </div>
          <span class="v3-tag">
            ${int(model.validCompanies.length)} EMPRESAS
          </span>
        </div>

        <div class="v3-company-list">
          ${rows.map((row, index) => {
            const width =
              Math.max(
                row.count / max * 100,
                2
              );

            const directPct =
              row.count
                ? row.direct / row.count * 100
                : 0;

            const indirectPct =
              row.count
                ? row.indirect / row.count * 100
                : 0;

            const undefinedPct =
              Math.max(
                0,
                100 -
                directPct -
                indirectPct
              );

            return `
              <button
                type="button"
                class="v3-company-row"
                data-v3-company="${esc(row.label)}"
                aria-label="${esc(
                  `${row.label}: ${row.count} personas alojando, ${row.share.toFixed(1)} por ciento del campamento`
                )}"
              >
                <div class="v3-company-name">
                  <strong>${esc(row.label)}</strong>
                  <small>
                    ${int(row.count)} alojando de ${int(row.registered)} registrado(s)
                    ? ${
                      row.lodgingPct == null
                        ? 'proporcion no disponible'
                        : `${pct(row.lodgingPct)} de su dotación registrada en GARPI`
                    }
                  </small>
                </div>

                <div class="v3-company-track">
                  <div
                    class="v3-company-bar"
                    style="width:${width}%"
                  >
                    ${
                      directPct > 0
                        ? `<i class="direct" style="width:${directPct}%"></i>`
                        : ''
                    }
                    ${
                      indirectPct > 0
                        ? `<i class="indirect" style="width:${indirectPct}%"></i>`
                        : ''
                    }
                    ${
                      undefinedPct > 0
                        ? `<i class="undefined" style="width:${undefinedPct}%"></i>`
                        : ''
                    }
                  </div>
                </div>

                <div class="v3-company-meta">
                  <span>Campamento ${pct(row.share)}</span>
                  <span>MOD ${int(row.direct)}</span>
                  <span>MOI ${int(row.indirect)}</span>
                  ${
                    row.undefined
                      ? `<span>Por definir ${int(row.undefined)}</span>`
                      : ''
                  }
                </div>
              </button>
            `;
          }).join('')}
        </div>

        <div class="v3-legend">
          <span><i class="direct"></i> MOD</span>
          <span><i class="indirect"></i> MOI</span>
          <span><i class="undefined"></i> Por definir</span>
        </div>
      </section>
    `;
  }

  function moduleCard(model) {
    const rows =
      model.modules.filter(
        row =>
          row.count > 0
      );

    const total =
      Math.max(
        model.totalPeople,
        1
      );

    const max =
      Math.max(
        ...rows.map(
          row => row.count
        ),
        1
      );

    return `
      <section class="v3-card">
        <div class="v3-card-head">
          <div>
            <h3>Personal alojado por m\u00f3dulo</h3>
            <p>
              Cantidad y participaci\u00f3n del personal
              alojando dentro del enfoque actual.
            </p>
          </div>
          <span class="v3-tag">ALOJAMIENTO</span>
        </div>

        <div class="v3-module-list">
          ${
            rows.length
              ? rows.map(row => `
                <button
                  type="button"
                  class="v3-module-row"
                  data-v3-module="${esc(row.label)}"
                >
                  <div>
                    <strong>${esc(row.label)}</strong>
                    <small>
                      ${int(row.count)} persona(s)
                      \u00b7 ${pct(
                        row.count /
                        total *
                        100
                      )} del personal alojando
                    </small>
                  </div>

                  <div
                    class="v3-personnel-meter"
                    aria-hidden="true"
                  >
                    <i
                      style="width:${
                        row.count /
                        max *
                        100
                      }%"
                    ></i>
                  </div>

                  <b>
                    ${pct(
                      row.count /
                      total *
                      100
                    )}
                  </b>
                </button>
              `).join('')
              : `
                <div class="v3-empty">
                  Sin m\u00f3dulos ocupados actualmente.
                </div>
              `
          }
        </div>
      </section>
    `;
  }

  function forecastCard(model) {
    const rows = model.forecast;

    if (!rows.length) {
      return `
        <section class="v3-card">
          <div class="v3-card-head">
            <div>
              <h3>Ocupacion y proyeccion ? 30 dias</h3>
              <p>Sin datos disponibles para la ventana.</p>
            </div>
          </div>
        </section>
      `;
    }

    const max =
      Math.max(
        100,
        ...rows.map(
          row =>
            number(
              row.pct ??
              row.committed_occupancy
            )
        )
      );

    return `
      <section class="v3-card">
        <div class="v3-card-head">
          <div>
            <h3>Ocupacion y proyeccion ? 30 dias</h3>
            <p>Una unica visualizacion para capacidad comprometida y riesgo.</p>
          </div>
          <span class="v3-tag ${
            model.over.length
              ? 'critical'
              : model.days90
                ? 'attention'
                : 'good'
          }">
            ${
              model.over.length
                ? 'SOBRECUPO'
                : model.days90
                  ? 'ATENCION'
                  : 'NORMAL'
            }
          </span>
        </div>

        <div class="v3-forecast-scroll">
          <div class="v3-forecast">
            ${rows.map((row, index) => {
              const p =
                number(
                  row.pct ??
                  row.committed_occupancy
                );

              const height =
                Math.max(
                  5,
                  Math.min(
                    118,
                    p / max * 118
                  )
                );

              const tone =
                p >= 100
                  ? 'critical'
                  : p >= 90
                    ? 'attention'
                    : 'normal';

              const label =
                index === 0 ||
                index === rows.length - 1 ||
                index % 5 === 0
                  ? clean(row.label) ||
                    clean(row.date).slice(8)
                  : '';

              return `
                <button
                  type="button"
                  class="v3-day ${tone}"
                  data-v3-day="${esc(row.date)}"
                  title="${esc(
                    `${row.date} \u00b7 ${p.toFixed(1)}% \u00b7 ${number(row.free)} libres`
                  )}"
                >
                  <i style="height:${height}px"></i>
                  <span>${esc(label)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="v3-forecast-stats">
          <div>
            <span>Pico</span>
            <strong>
              ${pct(
                model.peak?.pct ??
                model.peak?.committed_occupancy
              )}
            </strong>
          </div>
          <div>
            <span>Dias >=90%</span>
            <strong>${int(model.days90)}</strong>
          </div>
          <div>
            <span>Sobrecupo</span>
            <strong>${int(model.over.length)}</strong>
          </div>
        </div>
      </section>
    `;
  }

  function traceCard() {
    return `
      <section class="v3-card v3-span-2">
        <div class="v3-card-head">
          <div>
            <h3>Trazabilidad de alojamiento</h3>
            <p>
              Busca por trabajador, RUT, empresa, módulo, habitacion o cama.
            </p>
          </div>
          <span class="v3-tag">TRABAJADOR ? CAMA</span>
        </div>

        <label class="v3-search">
          <span>Buscar alojamiento</span>
          <input
            id="v3TraceInput"
            type="search"
            autocomplete="off"
            placeholder="Nombre, RUT, empresa, módulo, habitacion o cama..."
          >
        </label>

        <div
          id="v3TraceResults"
          class="v3-trace-results"
          aria-live="polite"
        >
          <div class="v3-empty">
            Escribe al menos 2 caracteres para buscar.
          </div>
        </div>
      </section>
    `;
  }

  function v3AdvancedCard(model) {
    const costConfigured =
      number(model?.an?.cost) > 0;

    return `
      <section
        class="v3-card v3-advanced-card"
        data-v3-advanced
      >
        <div class="v3-card-head">
          <div>
            <h3>Advanced</h3>
            <p>
              Historial, costos, benchmark, drillthrough
              y reportes quedan en segundo nivel para
              mantener limpio el dashboard principal.
            </p>
          </div>

          <span class="v3-tag">
            SEGUNDO NIVEL
          </span>
        </div>

        <div class="v3-advanced-grid">
          <button
            type="button"
            class="v3-advanced-action"
            data-v3-open-advanced="analysis"
          >
            <span class="v3-advanced-icon" aria-hidden="true">
              A
            </span>

            <span class="v3-advanced-copy">
              <strong>An\u00e1lisis avanzado</strong>
              <small>
                Benchmark, dimensiones, drillthrough
                y herramientas gerenciales existentes.
              </small>
            </span>

            <span aria-hidden="true">\u2192</span>
          </button>

          <button
            type="button"
            class="v3-advanced-action"
            data-v3-open-advanced="cost"
          >
            <span class="v3-advanced-icon" aria-hidden="true">
              $
            </span>

            <span class="v3-advanced-copy">
              <strong>Costos y camas-d\u00eda</strong>
              <small>
                ${
                  costConfigured
                    ? 'Usa la tarifa y proyecciones can\u00f3nicas ya configuradas.'
                    : 'Abre la herramienta can\u00f3nica de tarifa y camas-d\u00eda.'
                }
              </small>
            </span>

            <span aria-hidden="true">\u2192</span>
          </button>

          <button
            type="button"
            class="v3-advanced-action"
            data-v3-goto="history"
          >
            <span class="v3-advanced-icon" aria-hidden="true">
              H
            </span>

            <span class="v3-advanced-copy">
              <strong>Hist\u00f3rico / cierre</strong>
              <small>
                Fotograf\u00edas, tendencia y cierre diario
                en la vista can\u00f3nica existente.
              </small>
            </span>

            <span aria-hidden="true">\u2192</span>
          </button>

          <button
            type="button"
            class="v3-advanced-action"
            data-v3-goto="exports"
          >
            <span class="v3-advanced-icon" aria-hidden="true">
              R
            </span>

            <span class="v3-advanced-copy">
              <strong>Reportes / respaldo</strong>
              <small>
                CSV, respaldo y herramientas de reporte
                sin duplicar la l\u00f3gica de exportaci\u00f3n.
              </small>
            </span>

            <span aria-hidden="true">\u2192</span>
          </button>
        </div>

        <div class="v3-advanced-note">
          <strong>Fuente \u00fanica:</strong>
          estas acciones reutilizan las vistas y c\u00e1lculos
          existentes; V3 no crea un segundo motor anal\u00edtico.
        </div>
      </section>
    `;
  }

  function v3OpenLegacyAdvanced(
    root,
    target
  ) {
    const view =
      root.closest('#view-management') ||
      document.getElementById(
        'view-management'
      );

    const details =
      view?.querySelector(
        ':scope > details.dc-legacy-details'
      );

    if (!details) {
      return false;
    }

    details.open = true;

    details.classList.add(
      'is-open'
    );

    const targetNode =
      target === 'cost'
        ? (
            details.querySelector(
              '#costForm'
            ) ||
            details.querySelector(
              '.dc-legacy-slot'
            )
          )
        : (
            details.querySelector(
              '.dc-legacy-toolbar'
            ) ||
            details.querySelector(
              '.dc-legacy-slot'
            )
          );

    requestAnimationFrame(
      () => {
        targetNode
          ?.scrollIntoView?.({
            behavior: 'smooth',
            block: 'start'
          });

        const focusTarget =
          target === 'cost'
            ? (
                details.querySelector(
                  '#costForm input, #costForm button, #costForm select'
                ) ||
                details.querySelector(
                  '[data-dc-close-legacy]'
                ) ||
                details.querySelector(
                  'summary'
                )
              )
            : (
                details.querySelector(
                  '[data-dc-close-legacy]'
                ) ||
                details.querySelector(
                  'summary'
                )
              );

        try {
          focusTarget?.focus?.({
            preventScroll: true
          });
        } catch (_) {
          focusTarget?.focus?.();
        }
      }
    );

    return true;
  }

  function dashboardHTML(model) {
    const an = model.an;

    const capacityAvailable =
      an.capacityAvailable !== false &&
      an.status !== 'unavailable';

    const occupancyTone =
      !capacityAvailable
        ? 'attention'
        : number(an.occupancyPct) >= 90
          ? 'critical'
          : number(an.occupancyPct) >= 80
            ? 'attention'
            : '';

    const occupancyValue =
      capacityAvailable
        ? pct(an.occupancyPct)
        : 'NO DISPONIBLE';

    const freeValue =
      capacityAvailable
        ? int(an.free)
        : 'NO DISPONIBLE';

    const blockedValue =
      an.blockedToday == null
        ? '-'
        : int(an.blockedToday);

    const scoped =
      v3ScopedModel(model);

    return `
      <div class="v3-management">
        <section class="v3-hero">
          <div>
            <span class="v3-eyebrow">GARPI \u00b7 DECISION OPERACIONAL</span>
            <h2>Dashboard Gerencial</h2>
            <p>
              Situación actual, empresas, alojamiento, capacidad y proyeccion sin repetir informacion.
            </p>
          </div>

          <div class="v3-hero-actions">
            <button
              type="button"
              class="btn btn-secondary"
              data-v3-goto="control"
            >
              Ver alojamiento
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              data-v3-goto="planning"
            >
              Ver planificacion
            </button>
          </div>
        </section>

        ${v3FilterBar(model)}

        <section
          class="v3-kpi-grid"
          aria-label="Indicadores principales"
        >
          ${kpi(
            'Camas ocupadas',
            int(an.occupied),
            capacityAvailable
              ? `${pct(an.occupancyPct)} físico`
              : 'ocupacion conocida ? capacidad no disponible',
            occupancyTone
          )}

          ${kpi(
            'Camas libres',
            freeValue,
            capacityAvailable
              ? 'disponibilidad efectiva'
              : 'Capacity V1 ? fail-closed',
            capacityAvailable
              ? ''
              : 'attention'
          )}

          ${kpi(
            'Ocupación física',
            occupancyValue,
            capacityAvailable
              ? `${int(an.occupied)} / ${int(an.effectiveCapacity)}`
              : 'porcentaje no disponible',
            occupancyTone
          )}

          ${kpi(
            'Reservadas hoy',
            int(an.reservedToday),
            'vigentes no materializadas'
          )}

          ${kpi(
            'Fuera de servicio',
            blockedValue,
            an.blockedToday == null
              ? 'dato no disponible'
              : 'descontadas de capacidad',
            an.blockedToday == null ||
            number(an.blockedToday) > 0
              ? 'attention'
              : ''
          )}

          ${kpi(
            'Movimientos hoy',
            int(model.movements),
            `suben ${int(model.movementUp)} \u00b7 bajan ${int(model.movementDown)}`
          )}

          ${kpi(
            'Empresas alojando',
            int(model.validCompanies.length),
            'con personal en campamento'
          )}

          ${kpi(
            'Personal alojando',
            int(model.totalPeople),
            'personal en campamento'
          )}
        </section>

        <div class="v3-ops-grid">
          ${v3CapacityCard(model)}
          ${v3MovementsCard(model)}
        </div>

        <div class="v3-grid">
          ${executiveSummary(model)}
          ${focusCard(model)}
          ${companyCard(scoped)}
          ${v3ModulePressureCard(model)}
          ${v3HotelMapCard(model)}
          ${moduleCard(scoped)}
          ${v3WorkforceCard(model)}
          ${forecastCard(model)}
          ${traceCard()}
          ${v3AdvancedCard(model)}
        </div>
      </div>
    `;
  }

  function workerTable(rows) {
    return `
      <div class="v3-dialog-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Trabajador</th>
              <th>RUT</th>
              <th>Empresa</th>
              <th>Turno</th>
              <th>Modulo</th>
              <th>Hab.</th>
              <th>Cama</th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice(0, 300).map(worker => `
              <tr>
                <td>${esc(worker.nombre)}</td>
                <td>${esc(worker.rut)}</td>
                <td>${esc(worker.empresa)}</td>
                <td>${esc(worker.turno)}</td>
                <td>${esc(worker.modulo)}</td>
                <td>${esc(worker.habitacion)}</td>
                <td>${esc(worker.cama)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function openWorkers(title, rows) {
    if (typeof showDialog === 'function') {
      showDialog(
        title,
        workerTable(rows)
      );
    }
  }

  function renderTrace(root, model, query) {
    const host =
      root.querySelector('#v3TraceResults');

    if (!host) {
      return;
    }

    const q = norm(query);

    if (q.length < 2) {
      host.innerHTML = `
        <div class="v3-empty">
          Escribe al menos 2 caracteres para buscar.
        </div>
      `;
      return;
    }

    const rows =
      model.occupied
        .filter(worker => {
          const haystack = [
            worker.rut,
            worker.nombre,
            worker.empresa,
            worker.turno,
            worker.modulo,
            worker.habitacion,
            worker.cama,
            worker.especialidad,
            worker.categoria
          ]
            .map(norm)
            .join(' ');

          return haystack.includes(q);
        })
        .slice(0, 20);

    host.innerHTML =
      rows.length
        ? rows.map(worker => `
          <article class="v3-trace-card">
            <div>
              <strong>${esc(worker.nombre || 'Trabajador')}</strong>
              <small>
                ${esc(worker.rut)} \u00b7 ${esc(worker.empresa || 'SIN EMPRESA')}
              </small>
            </div>

            <div class="v3-trace-bed">
              <span>${esc(worker.modulo || '?')}</span>
              <span>Hab. ${esc(worker.habitacion || '?')}</span>
              <strong>Cama ${esc(worker.cama || '?')}</strong>
            </div>
          </article>
        `).join('')
        : `
          <div class="v3-empty">
            No se encontraron personas alojando para esa busqueda.
          </div>
        `;
  }

  function bind(root, model) {
    const companyFilter =
      root.querySelector(
        '#v3FilterCompany'
      );

    const shiftFilter =
      root.querySelector(
        '#v3FilterShift'
      );

    const moduleFilter =
      root.querySelector(
        '#v3FilterModule'
      );

    companyFilter?.addEventListener(
      'change',
      event => {
        v3FilterState.company =
          clean(event.target.value);

        render();
      }
    );

    shiftFilter?.addEventListener(
      'change',
      event => {
        v3FilterState.shift =
          clean(event.target.value);

        render();
      }
    );

    moduleFilter?.addEventListener(
      'change',
      event => {
        v3FilterState.module =
          clean(event.target.value);

        render();
      }
    );

    root
      .querySelector(
        '[data-v3-reset-filters]'
      )
      ?.addEventListener(
        'click',
        () => {
          v3FilterState.company = '';
          v3FilterState.shift = '';
          v3FilterState.module = '';

          render();
        }
      );

    const hotelModule=
      root.querySelector(
        '#v3HotelModule'
      );

    hotelModule?.addEventListener(
      'change',
      event => {
        const state=
          appState();

        if(!state){
          return;
        }

        state.mapModule=
          clean(event.target.value);

        state.controlBedKey='';

        render();
      }
    );

    root
      .querySelectorAll(
        '[data-v3-hotel-map] [data-cc-bed]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const api=
              window.GarpiControlCenterMap;

            const state=
              appState();

            if(
              !api?.snapshot ||
              !api?.detailHTML ||
              !api?.bedKey ||
              !state
            ){
              return;
            }

            const moduleName=
              clean(
                root.querySelector(
                  '#v3HotelModule'
                )?.value
              ) ||
              clean(state.mapModule);

            const snapshot=
              api.snapshot(
                moduleName
              );

            const key=
              clean(
                button.dataset.ccBed
              );

            const item=
              snapshot?.items?.find(
                row=>
                  api.bedKey(row)===key
              );

            if(!item){
              return;
            }

            state.mapModule=
              snapshot.moduleName;

            state.controlBedKey=
              key;

            root
              .querySelectorAll(
                '[data-v3-hotel-map] [data-cc-bed]'
              )
              .forEach(node => {
                const active=
                  node.dataset.ccBed ===
                  key;

                node.classList.toggle(
                  'selected',
                  active
                );

                node.setAttribute(
                  'aria-pressed',
                  active
                    ? 'true'
                    : 'false'
                );
              });

            const detail=
              root.querySelector(
                '#v3HotelDetail'
              );

            if(detail){
              detail.innerHTML=
                api.detailHTML(item);
            }
          }
        );
      });

    root
      .querySelectorAll(
        '[data-v3-open-map]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const state =
              appState();

            const targetModule =
              clean(
                button.dataset.v3MapModule
              ) ||
              v3FilterState.module ||
              clean(state?.mapModule) ||
              model.modules?.[0]?.label ||
              '';

            if (
              state &&
              targetModule
            ) {
              state.mapModule =
                targetModule;
            }

            if (
              typeof switchView ===
              'function'
            ) {
              switchView('control');
            }
          }
        );
      });

    root
      .querySelectorAll(
        '[data-v3-workforce-dim]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const next =
              clean(
                button.dataset.v3WorkforceDim
              );

            if (
              ![
                'company',
                'shift',
                'module'
              ].includes(next)
            ) {
              return;
            }

            v3InsightState.workforceDimension =
              next;

            render();
          }
        );
      });

    root
      .querySelector(
        '[data-v3-toggle-modules]'
      )
      ?.addEventListener(
        'click',
        () => {
          v3InsightState.showAllModules =
            !v3InsightState.showAllModules;

          render();
        }
      );

    root
      .querySelectorAll(
        '[data-v3-workforce-row]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const dimension =
              clean(
                button.dataset.v3WorkforceRowDim
              );

            const label =
              clean(
                button.dataset.v3WorkforceRow
              );

            const rows =
              v3ScopedOccupied(model)
                .filter(worker =>
                  norm(
                    v3WorkforceDimensionKey(
                      worker,
                      dimension
                    )
                  ) ===
                  norm(label)
                );

            if (rows.length) {
              openWorkers(
                `${
                  dimension === 'shift'
                    ? 'Turno'
                    : dimension === 'module'
                      ? 'M\u00f3dulo'
                      : 'Empresa'
                } \u00b7 ${label}`,
                rows
              );
            }
          }
        );
      });

    root
      .querySelectorAll(
        '[data-v3-open-advanced]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            v3OpenLegacyAdvanced(
              root,
              clean(
                button.dataset.v3OpenAdvanced
              )
            );
          }
        );
      });

    root
      .querySelectorAll('[data-v3-goto]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            if (
              typeof switchView ===
              'function'
            ) {
              switchView(
                button.dataset.v3Goto
              );
            }
          }
        );
      });

    root
      .querySelectorAll('[data-v3-company]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const scoped =
              v3ScopedModel(model);

            const row =
              scoped.companies.find(
                item =>
                  norm(item.label) ===
                  norm(
                    button.dataset.v3Company
                  )
              );

            if (row) {
              openWorkers(
                `Empresa ? ${row.label}`,
                row.workers
              );
            }
          }
        );
      });

    root
      .querySelectorAll('[data-v3-module]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const scoped =
              v3ScopedModel(model);

            const row =
              scoped.modules.find(
                item =>
                  norm(item.label) ===
                  norm(
                    button.dataset.v3Module
                  )
              );

            if (row) {
              openWorkers(
                `Modulo ? ${row.label}`,
                row.workers
              );
            }
          }
        );
      });

    root
      .querySelectorAll('[data-v3-day]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const row =
              model.forecast.find(
                item =>
                  clean(item.date) ===
                  clean(
                    button.dataset.v3Day
                  )
              );

            if (
              row &&
              typeof showDialog ===
              'function'
            ) {
              showDialog(
                `Proyeccion ? ${esc(row.date)}`,
                `
                  <div class="bi-dialog-grid">
                    <div>
                      <span>Capacidad efectiva</span>
                      <strong>${int(row.capacity)}</strong>
                    </div>
                    <div>
                      <span>Ocupadas</span>
                      <strong>${int(row.occupied ?? row.physical)}</strong>
                    </div>
                    <div>
                      <span>Reservadas</span>
                      <strong>${int(row.reserved)}</strong>
                    </div>
                    <div>
                      <span>Comprometidas</span>
                      <strong>${int(row.committed ?? (number(row.occupied ?? row.physical) + number(row.reserved)))}</strong>
                    </div>
                    <div>
                      <span>Libres</span>
                      <strong>${int(row.free)}</strong>
                    </div>
                    <div>
                      <span>Deficit</span>
                      <strong>${int(row.over)}</strong>
                    </div>
                  </div>
                `
              );
            }
          }
        );
      });

    const input =
      root.querySelector('#v3TraceInput');

    let timer = null;

    input?.addEventListener(
      'input',
      event => {
        clearTimeout(timer);

        timer = setTimeout(
          () => {
            renderTrace(
              root,
              v3ScopedModel(model),
              event.target.value
            );
          },
          90
        );
      }
    );
  }

  function render() {
    const state = appState();

    if (
      !state?.data ||
      state.currentView !== 'management'
    ) {
      return;
    }

    const view =
      document.getElementById(
        'view-management'
      );

    if (!view) {
      return;
    }

    const details =
      view.querySelector(
        ':scope > details.dc-legacy-details'
      );

    const primary =
      [...view.children].find(
        node =>
          node !== details
      );

    if (!primary) {
      return;
    }

    const model =
      buildModel(state.data);

    if (!model) {
      return;
    }

    primary.className = 'v3-shell';
    primary.dataset.uiV3 = 'management';
    primary.innerHTML =
      dashboardHTML(model);

    bind(primary, model);
  }

  const base =
    typeof renderManagement === 'function'
      ? renderManagement
      : (
          typeof window.renderManagement === 'function'
            ? window.renderManagement
            : null
        );

  if (
    base &&
    !base.__garpiUiV3
  ) {
    const wrapped = function() {
      const result =
        base.apply(this, arguments);

      try {
        render();
      } catch (error) {
        console.warn(
          'GARPI UI V3 management fallback',
          error
        );
      }

      return result;
    };

    wrapped.__garpiUiV3 = true;

    window.renderManagement = wrapped;

    try {
      renderManagement = wrapped;
    } catch (_) {}
  }

  window.GarpiUIV3 = {
    VERSION,
    buildModel,
    render
  };

  setTimeout(
    () => {
      const state = appState();

      if (
        state?.currentView === 'management' &&
        typeof renderManagement === 'function'
      ) {
        renderManagement();
      }
    },
    0
  );
})();
