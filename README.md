# CapiProm — Sistema de gestión de crédito

MVP de originación, gestión de cartera y cobranza de crédito. Construido con **Next.js 15 (App Router) + Supabase + TypeScript**.

## Qué incluye

- **Landing pública** (`/`) con propuesta de valor y formulario de solicitud.
- **Solicitud de crédito** (`/solicitar`) — pública, sin login, escribe a la tabla `solicitudes`.
- **Acceso de operador** (`/login`) — Supabase Auth (email + contraseña).
- **Dashboard privado** (`/dashboard`), protegido por middleware:
  - **Resumen**: KPIs de cartera (créditos activos, saldo insoluto, por cobrar a 30 días, solicitudes nuevas) + próximos cupones.
  - **Cartera**: listado de créditos, **originación** (alta) con vista previa de la tabla de amortización, **detalle** con cambio de estatus, marcado de pagos y **bitácora de trazabilidad**.
  - **Solicitudes**: revisión y cambio de estatus de lo que entra por la landing.
  - **Flujos y cobranza**: calendario de cupones pendientes en toda la cartera, con filtros (vencido / 7 días / 30 días) y totales.

### Motor de amortización (lógica propia)
`src/lib/amortizacion.ts` genera la tabla de cupones con tres métodos:
- **Francés** (cuota fija)
- **Saldos insolutos** (capital fijo, interés decreciente)
- **Interés periódico** (bullet: solo interés, capital al final)

Soporta frecuencia mensual, quincenal y semanal. Sin DCF/IRR por ahora (puede sumarse después reusando el motor de Plinius).

## Puesta en marcha

### 1. Crea un proyecto en Supabase
En [supabase.com](https://supabase.com) → New Project. Copia la **Project URL** y la **anon key** (Settings → API).

### 2. Corre el schema
En el panel de Supabase → **SQL Editor**, pega y ejecuta el contenido de `supabase/schema.sql`. Esto crea las tablas (`solicitudes`, `creditos`, `amortizacion`, `bitacora`), la vista `v_proximos_cupones`, los triggers y las políticas RLS.

### 3. Crea el usuario operador
Supabase → **Authentication → Users → Add user** (email + contraseña). Con ese usuario entrarás en `/login`.

### 4. Variables de entorno
```bash
cp .env.example .env.local
```
Llena `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 5. Instala y corre
```bash
npm install
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000).

## Flujo de uso

1. Un prospecto entra a `/solicitar` y manda su solicitud.
2. El operador la ve en **Dashboard → Solicitudes** y la marca como aprobada.
3. En **Cartera → Originar crédito** captura los datos finales (tasa, método, frecuencia). Al guardar se genera automáticamente la tabla de amortización y un registro en bitácora.
4. Desde el detalle del crédito puede cambiar estatus (vigente, en mora, vencido, liquidado, cancelado), marcar cupones como pagados y revisar toda la trazabilidad.
5. **Flujos y cobranza** muestra qué se cobra y cuándo en toda la cartera.

## Deploy

Listo para Vercel: importa el repo, configura las dos variables de entorno y listo. El middleware y los server components funcionan sin configuración extra.

## Notas / siguientes pasos sugeridos

- **Conversión solicitud → crédito de un clic**: hoy se re-captura en Cartera; se puede pre-llenar el formulario desde la solicitud aprobada.
- **Alertas por correo** (Resend) sobre los cupones de `v_proximos_cupones`.
- **Valuación de cartera** (DCF/IRR/duration) reutilizando el motor de Plinius.
- **Roles** (admin vs. operador de consulta) vía columna en una tabla `perfiles` + RLS.
- **Exportación CSV** de cartera y flujos.
