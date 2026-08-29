# Certificación de producción — 29-08-2026

## Base certificada

- Sistema: Gestión de Campamento v5.6.0
- Certificación sintética permanente: 2.000 trabajadores / 2.000 camas
- Datos sintéticos adicionales: 300 reservas, 180 movimientos, 120 bloqueos
- Producción: no se cargaron trabajadores ficticios ni se alteraron asignaciones reales para esta prueba

## Resultado de referencia

GitHub Actions validó el escenario 2.000 × 2.000 con resultado OK:

- Analytics inicial: 413,6 ms
- Modelo semántico: 167,9 ms
- Reutilización de caché: 0,14 ms
- Memoria incremental: +4,1 MB

## Protección incorporada

El pipeline de producción valida antes de publicar GitHub Pages:

1. Sintaxis JavaScript crítica.
2. Guardia de arquitectura y secretos del frontend.
3. Pruebas funcionales v5.6.0.
4. Pruebas de Centro de Control / What-if.
5. Pruebas de Integridad / Semáforo.
6. Certificación sintética 2.000 × 2.000.

El despliegue queda condicionado al éxito del job de verificación.

## Arquitectura que debe conservarse

- Frontend estático mediante GitHub Pages.
- Acceso a datos mediante Supabase Edge Functions.
- Sin acceso REST directo a tablas desde el navegador.
- Sin credenciales secretas ni claves de servicio en frontend.
- RLS y autenticación HMAC administrativa no deben debilitarse.
- Excel continúa siendo la fuente oficial de asignaciones cuando corresponde.

## Respaldo previo al endurecimiento

`backup-pre-hardening-ci-scale-20260829`

Este documento es de trazabilidad técnica y no contiene datos personales ni credenciales.
