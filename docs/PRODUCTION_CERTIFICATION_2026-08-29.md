# Certificación de producción — 29-08-2026

## Base certificada

- Sistema: Gestión de Campamento v5.6.0
- Certificación sintética permanente: 2.000 trabajadores / 2.000 camas
- Datos sintéticos adicionales: 300 reservas, 180 movimientos, 120 bloqueos
- Producción: no se cargaron trabajadores ficticios ni se alteraron asignaciones reales para esta prueba

## Resultado certificado

GitHub Actions validó el escenario 2.000 × 2.000 con resultado OK en producción.

Ejecución de referencia de la certificación inicial:

- Analytics inicial: 413,6 ms
- Modelo semántico: 167,9 ms
- Reutilización de caché: 0,14 ms
- Memoria incremental: +4,1 MB

Última ejecución de producción observada durante el endurecimiento:

- Analytics inicial: 72,4 ms
- Modelo semántico: 9,2 ms
- Reutilización de caché: 0,11 ms
- Memoria incremental: +3,7 MB

Los tiempos pueden variar entre runners; el criterio permanente son los umbrales automáticos de la prueba y su resultado SUCCESS.

## Protección incorporada

El pipeline de producción valida antes de publicar GitHub Pages:

1. Sintaxis JavaScript crítica.
2. Guardia de arquitectura y secretos del frontend.
3. Pruebas funcionales v5.6.0.
4. Pruebas de Centro de Control / What-if.
5. Pruebas de Integridad / Semáforo.
6. Certificación sintética 2.000 × 2.000.

El despliegue queda condicionado al éxito del job de verificación. Las validaciones generales y de alto volumen también se ejecutan en ramas `dev-*` y pull requests hacia `main`.

## GitHub Pages / runtime CI

Acciones de publicación alineadas con Node 24:

- `actions/checkout@v6`
- `actions/setup-node@v7`
- `actions/configure-pages@v6`
- `actions/upload-pages-artifact@v5`
- `actions/deploy-pages@v5`

## Arquitectura que debe conservarse

- Frontend estático mediante GitHub Pages.
- Acceso a datos mediante Supabase Edge Functions.
- Sin acceso REST directo a tablas desde el navegador.
- Sin credenciales secretas ni claves de servicio en frontend.
- RLS y autenticación HMAC administrativa no deben debilitarse.
- Excel continúa siendo la fuente oficial de asignaciones cuando corresponde.

## Respaldos de esta etapa

- `backup-pre-hardening-ci-scale-20260829`
- `backup-post-hardening-certified-20260829`

Este documento es de trazabilidad técnica y no contiene datos personales ni credenciales.
