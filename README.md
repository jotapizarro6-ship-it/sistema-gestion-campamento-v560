# Sistema de Gestión de Campamento · Cloud v5.6.0

Interfaz web estática para GitHub Pages conectada a la base central PostgreSQL/Supabase del Sistema de Gestión de Campamento.

## Accesos

- `index.html`: consulta pública de alojamiento por RUT.
- `admin.html`: acceso administrativo protegido.

## Funciones administrativas

- Resumen operacional y KPI diarios.
- Centro de Gestión con mapa módulo / habitación / cama.
- Planificación de capacidad hasta 31 días.
- Dashboard gerencial avanzado y proyección de 30 días.
- Histórico completo, snapshots y cierre diario congelado.
- Movimientos (subidas/bajadas), reservas y bloqueos de camas.
- Trabajadores y consulta administrativa.
- Registro de consultas por RUT.
- Carga Excel transaccional.
- Camas-día, costos, excepciones/anomalías y drillthrough.
- Exportación CSV y respaldo cloud JSON.
- Capacidad diaria configurable.

## Seguridad

El repositorio no contiene contraseñas, service-role keys ni secretos de Supabase. Las operaciones de base pasan por funciones Supabase protegidas y las tablas mantienen RLS activo.
