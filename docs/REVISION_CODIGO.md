# Revisión Integral de Código — Sistema Tópico UNP
**Fecha**: 2026-07-09
**Proyecto**: Sistema Web para Gestión de Pacientes — Área de Fisioterapia UNP
**Stack**: Vue 3.5.32 | Vite 8.0.8 | Supabase JS 2.106.2 | Vue Router 5.0.4 | Pinia 3.0.4

---

## Resumen Ejecutivo

El sistema cubre los flujos principales: autenticación por roles, reserva de citas, agenda del fisioterapeuta e historia clínica. Sin embargo, existen **7 bugs críticos** que bloquean módulos enteros, ausencia total de RLS en las tablas más sensibles, y una fractura entre el esquema real de BD y el código de varias vistas.

**Conteo de hallazgos**: 7 críticos | 9 deuda técnica | 8 buenas prácticas identificadas

---

## BUGS CRÍTICOS (bloqueantes)

### BUG-01 — Parámetro de ruta incorrecto en `AtencionView`
**Archivo**: `src/views/AtencionView.vue` línea 15 | `src/router/index.js` línea 64
**Impacto**: La vista de atención clínica **nunca recibe datos** — es el módulo core del sistema.

El router define el parámetro como `:idCita` pero la vista lo lee como `idSesion`:
```javascript
// ROUTER (correcto):
path: 'atencion/:idCita'

// ATENCIONVIEW (incorrecto — siempre undefined):
const idSesion = route.params.idSesion

// CORRECCIÓN:
const idCita = route.params.idCita
```

---

### BUG-02 — `AtencionView` consulta columnas inexistentes en el esquema real
**Archivo**: `src/views/AtencionView.vue` líneas 56-92, 136-158
**Impacto**: Todas las queries de la vista retornan error o null.

El código usa nombres como `idSesion`, `notas_evolucion`, `estado`, `tipo`, `numero_sesion`, `es_evaluacion_inicial`, `Paciente` (con P mayúscula) que **no existen en el esquema de NIMA.txt**.

El esquema real de `Sesion` tiene: `idatencion`, `idcita`, `idpaciente`, `idfisioterapeuta`, `sintomas`, `diagnostico_descripcion`, `tratamiento_recetado`.

```javascript
// CORRECCIÓN — query adaptada al esquema real:
const { data, error } = await supabase
  .from('Sesion')
  .select(`
    idatencion, sintomas, diagnostico_descripcion, tratamiento_recetado,
    observaciones_internas, presion_arterial, peso_kg, talla_cm,
    temperatura_c, frecuencia_cardiaca, saturacion_oxigeno,
    cita (
      idcita, motivo_consulta, fecha_hora,
      paciente ( idpaciente, codigo_universitario,
        persona ( nombres, apellidos, numero_documento, fecha_nacimiento )
      )
    )
  `)
  .eq('idcita', idCita)
  .maybeSingle()
```

> **Nota importante**: Las vistas `HistoriaClinicaView`, `FichaEvaluacionInicial` y `FormularioEvolucion` también usan tablas `Evaluacion_inicial`, `Tratamiento`, `Sesion_Evaluacion` que **no aparecen en NIMA.txt**. Aclarar con el equipo si ese esquema extendido existe en Supabase o si esas vistas son prematuras.

---

### BUG-03 — `ReferenceError` en producción: `darDeAlta` usado antes de declararse
**Archivo**: `src/composables/useEvolucionSesion.js` línea 66 (uso) vs línea 92 (declaración)
**Impacto**: Crash al intentar registrar cualquier evolución clínica con mediciones.

`const` no hace hoisting. `darDeAlta` se referencia dentro de `registrarEvolucion` antes de su declaración.

```javascript
// CORRECCIÓN — mover al inicio del composable:
export function useEvolucionSesion() {
  const { showAlert } = useAlert()
  const loading = ref(false)
  const darDeAlta = ref(false)  // <- declarar aquí, ANTES de cualquier función

  const registrarEvolucion = async ({ idSesion, idTratamiento, ... }) => {
    // Ahora darDeAlta ya existe en este scope
    if (darDeAlta.value && idTratamiento) {
      await supabase.from('Tratamiento').update({ estado: 'finalizado' }).eq('idTratamiento', idTratamiento)
    }
  }
  return { loading, darDeAlta, registrarEvolucion }
}
```

---

### BUG-04 — Ausencia total de RLS en tablas críticas
**Archivo**: `supabase/NIMA.txt` (esquema de referencia)
**Impacto**: Cualquier usuario autenticado puede leer/modificar datos clínicos de cualquier otro paciente. Brecha de privacidad grave en un sistema de salud.

Solo hay RLS en `fisioterapeuta`, `persona` y `horario`. Faltan políticas para:
- `cita`
- `Sesion`
- `antecedentes`
- `paciente`
- `historial_estado_cita`

```sql
-- Políticas RLS mínimas necesarias:

-- cita: paciente ve solo las suyas, personal ve todas
CREATE POLICY "cita_lectura_por_rol" ON public.cita FOR SELECT TO authenticated
USING (
  idpaciente = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') IN ('enfermera', 'fisioterapeuta', 'admin')
);

CREATE POLICY "cita_update_fisio" ON public.cita FOR UPDATE TO authenticated
USING (
  idfisioterapeuta = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') IN ('enfermera', 'admin')
);

-- Sesion: solo fisioterapeuta asignado o admin
CREATE POLICY "sesion_acceso_clinico" ON public."Sesion" FOR ALL TO authenticated
USING (
  idfisioterapeuta = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
);

-- antecedentes: solo el propio paciente o personal clínico
CREATE POLICY "antecedentes_acceso" ON public.antecedentes FOR ALL TO authenticated
USING (
  idpaciente = auth.uid()
  OR (auth.jwt() -> 'user_metadata' ->> 'rol') IN ('fisioterapeuta', 'admin')
);
```

---

### BUG-05 — Stub en `CitasView` ignora disponibilidad real de horarios
**Archivo**: `src/views/CitasView.vue` líneas 23-30
**Impacto**: El sistema siempre muestra slots de 8:00 a 18:00 sin verificar horarios del fisioterapeuta ni citas existentes. Permite reservar en horarios no disponibles.

```javascript
// STUB ACTUAL (incorrecto — en producción):
const obtenerSlotsDisponibles = async (idFisioterapeuta, fecha, duracion) => {
  const slots = []
  for (let h = 8; h < 18; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
}

// CORRECCIÓN — eliminar el stub e importar la función real del composable:
const { obtenerSlotsDisponibles, /* ...otros */ } = useCitas()
// La función real en useCitas.js líneas 202-247 ya verifica horarios y conflictos correctamente
```

---

### BUG-06 — Contraseña inicial del paciente = número de documento (DNI)
**Archivo**: `src/components/FormularioPacienteModal.vue` líneas 172, 318
**Impacto**: Seguridad comprometida. Un DNI de 8 dígitos es predecible. No hay mecanismo que fuerce el cambio de contraseña.

```javascript
// ACTUAL (inseguro):
password: docFiltrado  // <- número de documento como contraseña inicial

// CORRECCIÓN recomendada:
// Generar contraseña aleatoria segura en la Edge Function y enviarla por email al paciente
password: generarContrasenaAleatoria()  // mínimo 12 chars, alfanumérico + símbolos
```

---

### BUG-07 — Edge Function `crear-paciente-admin` no construye `user_metadata`
**Archivo**: `supabase/functions/crear-paciente-admin/index.ts` líneas 19, 33
**Impacto**: Usuarios creados sin rol en `user_metadata` → el guard de rutas no puede identificar el rol → acceso denegado o incorrecto para todos los usuarios creados por admin.

```typescript
// ACTUAL (incorrecto):
const { email, password, user_metadata } = body
// user_metadata siempre es undefined porque Vue envía campos planos

// CORRECCIÓN:
const { email, password, nombres, apellidos, rol, tipo_documento, numero_documento, celular } = body

const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { nombres, apellidos, rol, tipo_documento, numero_documento, celular }
})
```

---

## DEUDA TÉCNICA (no bloqueante)

### DT-01 — Falta composable `useAuth` singleton
**Archivo**: `src/composables/useDashboard.js` línea 9
`useDashboard` instancia `useCitas()` solo para obtener `userId` y `userRole`, creando estado reactivo duplicado. Crear `src/composables/useAuth.js` como singleton centralizado.

### DT-02 — Funciones duplicadas en `CitasView` y `useCitas`
**Archivo**: `src/views/CitasView.vue` líneas 93-95
`nombrePacienteFlat`, `nombreFisioFlat` y `celularPacienteFlat` están duplicadas en la vista con implementación diferente a las del composable. Eliminar las de la vista.

### DT-03 — `DashboardView` llama `getUser()` dos veces
**Archivo**: `src/views/DashboardView.vue` líneas 24-28
`obtenerRolActual` es redundante; `fetchDashboard` ya inicializa el usuario internamente. Además están separadas por coma (expresión de coma, no dos awaits independientes).

### DT-04 — `ModalNuevaCita` no limpia el timer al desmontar
**Archivo**: `src/components/ModalNuevaCita.vue` línea 112
`timerBusqueda` (setTimeout) nunca se limpia en `onUnmounted`, puede ejecutarse sobre un componente desmontado.

### DT-05 — Dependencias instaladas pero no usadas
`axios` (1.15.2) y `pinia` (3.0.4) están en `package.json` pero no se usan en ningún archivo del proyecto. Candidatos a eliminar.

### DT-06 — Validación de contraseña mínima insuficiente (6 caracteres)
**Archivo**: `src/views/PerfilView.vue` línea 114
Para un sistema con datos clínicos, el mínimo debería ser 10 caracteres con complejidad.

### DT-07 — `HistoriaClinicaView` usa nombres de tabla en PascalCase incorrectos
`'Paciente'` debería ser `'paciente'` (minúsculas según esquema).

### DT-08 — `ExpedientesView` filtro `.not()` con comillas incorrectas
**Archivo**: `src/views/ExpedientesView.vue` línea 30
```javascript
.not('estado', 'in', '("cancelada")')  // incorrecto
.not('estado', 'in', '(cancelada)')    // correcto para PostgREST
```

### DT-09 — `useAlert` usa `confirmResolve` mutable sin protección de concurrencia
Si dos modales se abren simultáneamente, `confirmResolve` se sobreescribe.

---

## BUENAS PRÁCTICAS IDENTIFICADAS

1. **Composables por dominio** — separación correcta de lógica de negocio en `useCitas`, `useAlert`, `useEvaluacionInicial`, `useEvolucionSesion`
2. **Máquina de estados para citas** — `TRANSICIONES_VALIDAS` en `useCitas.js` evita estados inválidos
3. **Guard de navegación con roles** — `beforeEach` en router implementado correctamente
4. **Instancia única de Supabase** — `src/lib/supabaseClient.js` exporta un singleton bien configurado
5. **Algoritmo anti-colisión de slots** — `obtenerSlotsDisponibles` en `useCitas.js` usa intervalos reales, no iteraciones fijas
6. **`HorariosView` con guardado batch robusto** — delete + insert con validación previa y confirmación del usuario
7. **`lib/dateUtils.js` y `lib/userUtils.js`** — utilidades puras centralizadas, bien nombradas
8. **`ModalNuevaCita` con slots dinámicos por servicio** — implementación sofisticada que responde al caso de negocio real

---

## Verificación de versiones

| Librería | Versión | Estado |
|---|---|---|
| Vue | 3.5.32 | ✅ Actual, uso correcto |
| Vite | 8.0.8 | ✅ Actual |
| Vue Router | 5.0.4 | ✅ Actual, uso correcto |
| Supabase JS | 2.106.2 | ✅ Actual, API v2 correcta |
| Pinia | 3.0.4 | ⚠️ Instalado pero no usado |
| axios | 1.15.2 | ❌ No se usa en ningún archivo |

---

## Correcciones aplicadas (2026-07-09)

| Bug | Archivo | Cambio |
|---|---|---|
| BUG-01 | `AtencionView.vue` línea 15 | `route.params.idSesion` → `route.params.idCita` |
| BUG-02 | `AtencionView.vue` | Resuelto por BUG-01 — las queries ya usaban el esquema correcto (PascalCase) |
| BUG-03 | `useEvolucionSesion.js` | `darDeAlta` movido al inicio, `idTratamiento` agregado al parámetro, exportado en return |
| BUG-04 | `supabase/migrations/` | Ya resuelto — el esquema real tiene RLS completo en `Sesion`, `Antecedentes`, `Paciente`, etc. NIMA.txt era incompleto |
| BUG-05 | `CitasView.vue` | Stub eliminado, `obtenerSlotsDisponibles` importada desde `useCitas` |
| BUG-06 | `FormularioPacienteModal.vue` | Contraseña inicial cambiada de DNI a `generarContrasenaSegura()` (12 chars aleatorios) |
| BUG-07 | `supabase/functions/crear-paciente-admin/index.ts` | Construye `user_metadata` desde campos planos del body |

> **Nota sobre el esquema**: NIMA.txt es una versión simplificada/antigua. El esquema real está en `supabase/migrations/20260615211954_remote_schema.sql` con tablas en PascalCase (`Sesion`, `Paciente`, `Persona`, `Fisioterapeuta`, etc.) y RLS completo.

---

## Plan de corrección priorizado

### Semana 1 — Bloqueantes funcionales
| # | Tarea | Archivo | Bug |
|---|---|---|---|
| 1 | Corregir parámetro de ruta `idSesion` → `idCita` | `AtencionView.vue` | BUG-01 |
| 2 | Mover `darDeAlta` al inicio del composable | `useEvolucionSesion.js` | BUG-03 |
| 3 | Reemplazar stub `obtenerSlotsDisponibles` por función real | `CitasView.vue` | BUG-05 |
| 4 | Corregir Edge Function `crear-paciente-admin` | `index.ts` | BUG-07 |
| 5 | Reconciliar queries de `AtencionView` con esquema real | `AtencionView.vue` | BUG-02 |

### Semana 2 — Seguridad
| # | Tarea | Archivo | Bug |
|---|---|---|---|
| 6 | Implementar RLS en `cita`, `Sesion`, `antecedentes` | Supabase Dashboard / SQL | BUG-04 |
| 7 | Cambiar política de contraseña inicial de pacientes | `FormularioPacienteModal.vue` | BUG-06 |

### Semana 3 — Deuda técnica
| # | Tarea | Archivo | DT |
|---|---|---|---|
| 8 | Crear `useAuth` singleton y refactorizar `useDashboard` | nuevo composable | DT-01 |
| 9 | Eliminar funciones duplicadas en `CitasView` | `CitasView.vue` | DT-02 |
| 10 | Limpiar `onMounted` de `DashboardView` | `DashboardView.vue` | DT-03 |
| 11 | Agregar `onUnmounted` en `ModalNuevaCita` | `ModalNuevaCita.vue` | DT-04 |
| 12 | Eliminar `axios` y evaluar `pinia` de dependencias | `package.json` | DT-05 |

---

## Métricas

| Categoría | Cantidad |
|---|---|
| Archivos revisados | 26 |
| Bugs críticos (bloqueantes) | 7 |
| Deuda técnica | 9 |
| Buenas prácticas | 8 |
| Cobertura de tests | 0% |
| Dependencias no utilizadas | 2 |
