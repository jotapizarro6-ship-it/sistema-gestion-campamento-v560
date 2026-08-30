# Decision Cockpit · 2026-08-30

Modernización progresiva de **Resumen Operativo** y **Dashboard Gerencial** orientada a toma de decisiones rápida.

## Principios

- Una sola fuente de verdad: `A.data` y `analytics()` existentes.
- No se elimina información: el análisis anterior queda bajo `Ver análisis ... completo`.
- Resumen Operativo prioriza estado actual, capacidad, movimientos, alertas y proyección.
- Dashboard Gerencial prioriza cambios, riesgo, MOD/MOI y foco ejecutivo.
- Filtros y dimensiones se reutilizan para evitar gráficos duplicados.
- Costos no configurados no ocupan espacio con tarjetas en $0.
- Drill-down abre detalle sólo cuando se solicita.
- Sin cambios de Supabase, RLS, HMAC, concurrencia ni datos productivos.

## Compatibilidad

La capa se carga después del núcleo y envuelve `renderOverview` / `renderManagement`. Los renderizadores anteriores siguen ejecutándose y su contenido se mueve a un `<details>` plegable. Un `MutationObserver` captura paneles tardíos (integridad, MOD/MOI, secciones avanzadas, informe ejecutivo) para preservarlos en el análisis completo.

## Responsive

Se valida en 320, 360, 375, 390, 412 y 430 px, además del pipeline general de escritorio.

## PWA

Versión objetivo: `5.6.1-modern.9`. El service worker precachea los nuevos recursos de interfaz, sin cachear APIs de Supabase ni habilitar replay de mutaciones.
