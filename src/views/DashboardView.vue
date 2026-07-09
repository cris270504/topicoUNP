<script setup>
import { ref, onMounted } from 'vue'
import { useDashboard } from '@/composables/useDashboard'
import { ESTADOS_CITA } from '@/composables/useCitas'
import { supabase } from '@/lib/supabaseClient'
// 1. Declaramos la variable para que Vue ya no lance el error "not defined"
const rolUsuario = ref('')

// 2. Creamos una función para leer el "carnet" de Supabase al cargar la página
const obtenerRolActual = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (user && user.user_metadata) {
    // Extraemos el rol oculto (ej: 'admin', 'enfermera', 'fisioterapeuta')
    rolUsuario.value = user.user_metadata.rol || 'estudiante'
  }
}
const {
  citasHoy, citasProximas, pacientesEnSala, ocupacionPersonal,
  resumenEstados, totalCitasHoy, loading, fetchDashboard,
  esPaciente, esPersonalSalud, esAdmin, esEnfermera
} = useDashboard()

onMounted(() => {
  obtenerRolActual(),
  fetchDashboard()
  // ... aquí pueden ir tus otras funciones como fetchCitas(), etc.
})

const formatHora = (iso) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
}

const formatFechaCompleta = (iso) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  }).format(new Date(iso))
}
</script>

<template>
  <div class="view-container">

    <div class="action-header">
      <div class="header-text">
        <h2>Dashboard</h2>
        <p v-if="esPaciente">Bienvenido a tu portal de salud.</p>
        <p v-else>Resumen operativo del día en el tópico.</p>
      </div>
    </div>

    <div v-if="loading" class="data-card">
      <p class="empty-row">
        <span class="spinner" style="display:inline-block; margin-right:8px"></span>
        Cargando información...
      </p>
    </div>

    <template v-else>

      <div v-if="esPaciente">
        <div class="data-card">
          <h3>Mis próximas citas</h3>
          <div class="table-responsive">
            <table class="content-table">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Servicio</th>
                  <th>Especialista</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="citasProximas.length === 0">
                  <td colspan="4" class="empty-row">No tienes citas programadas.</td>
                </tr>
                <tr v-else v-for="c in citasProximas" :key="c.idcita">
                  <td><strong>{{ formatFechaCompleta(c.fecha_hora) }}</strong></td>
                  <td>{{ c.servicio_topico?.nombre_servicio }}</td>
                  <td>
                    <span class="staff-name">
                      {{ c.fisioterapeuta?.persona ? `${c.fisioterapeuta.persona.nombres} ${c.fisioterapeuta.persona.apellidos}` : 'Por asignar' }}
                    </span>
                  </td>
                  <td>
                    <span class="estado-badge"
                      :style="`color:${ESTADOS_CITA[c.estado]?.color}; background:${ESTADOS_CITA[c.estado]?.bg}`">
                      {{ ESTADOS_CITA[c.estado]?.label ?? c.estado }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="esAdmin || esEnfermera || esPersonalSalud">

        <div class="stats-grid">
          <div class="data-card stat-card">
            <span class="stat-value">{{ totalCitasHoy }}</span>
            <span class="stat-label">Citas hoy</span>
          </div>
          <div class="data-card stat-card">
            <span class="stat-value">{{ resumenEstados.en_triaje + resumenEstados.en_consulta }}</span>
            <span class="stat-label">En Atención</span>
          </div>
          <div class="data-card stat-card">
            <span class="stat-value">{{ resumenEstados.pendiente + resumenEstados.confirmada }}</span>
            <span class="stat-label">Por Atender</span>
          </div>
          <div class="data-card stat-card alerta">
            <span class="stat-value">{{ resumenEstados.ausente }}</span>
            <span class="stat-label">Ausencias</span>
          </div>
        </div>

        <div class="data-card">
          <h3>Sala de Espera / Triaje</h3>
          <p class="subtitulo-card">Pacientes que ya llegaron y esperan atención.</p>

          <div v-if="pacientesEnSala.length === 0" class="empty-row">
            No hay pacientes en sala de espera en este momento.
          </div>
          <div class="table-responsive" v-else>
            <table class="content-table">
              <thead>
                <tr>
                  <th>Hora Cita</th>
                  <th>Paciente</th>
                  <th>Servicio</th>
                  <th>Especialista Destino</th>
                  <th>Estado Actual</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in pacientesEnSala" :key="'sala-' + p.idcita">
                  <td>{{ formatHora(p.fecha_hora) }}</td>
                  <td>
                    <span class="patient-name">{{ p.paciente?.persona?.nombres }} {{ p.paciente?.persona?.apellidos
                    }}</span>
                    <span class="patient-detail">Cod: {{ p.paciente?.codigo_universitario }}</span>
                  </td>
                  <td>{{ p.servicio_topico?.nombre_servicio }}</td>
                  <td>{{ p.fisioterapeuta?.persona?.apellidos ?? 'General' }}</td>

                  <td>
                    <span class="estado-badge"
                      :style="`color:${ESTADOS_CITA[p.estado]?.color}; background:${ESTADOS_CITA[p.estado]?.bg}`">
                      {{ ESTADOS_CITA[p.estado]?.label }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="data-card" v-if="esAdmin || esEnfermera || esPersonalSalud">
          <h3>Ocupación del Personal de Salud — Hoy</h3>
          <div v-if="ocupacionPersonal.length === 0" class="empty-row">
            Ningún especialista tiene citas asignadas hoy.
          </div>
          <div class="ocupacion-grid" v-else>
            <div v-for="f in ocupacionPersonal" :key="f.idfisioterapeuta" class="ocupacion-item">
              <div class="ocupacion-header">
                <span class="staff-name">{{ f.nombre }}</span>
                <span class="staff-detail">{{ f.especialidad }}</span>
              </div>
              <div class="ocupacion-cifras">
                <span><strong>{{ f.totalCitas }}</strong> citas</span>
                <span><strong>{{ f.atendidas }}</strong> finalizadas</span>
                <span><strong>{{ f.pendientes }}</strong> en cola</span>
              </div>
            </div>
          </div>
        </div>

        <div class="data-card">
          <h3>{{ esPersonalSalud && !esEnfermera ? 'Mi Agenda de Hoy' : 'Agenda General de Hoy' }}</h3>
          <div class="table-responsive">
            <table class="content-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Paciente</th>
                  <th v-if="esAdmin || esEnfermera">Especialista</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="citasHoy.length === 0">
                  <td colspan="5" class="empty-row">Agenda libre para hoy.</td>
                </tr>
                <tr v-else v-for="c in citasHoy" :key="c.idcita">
                  <td>{{ formatHora(c.fecha_hora) }}</td>
                  <td>
                    <span class="patient-name">{{ c.paciente?.persona?.nombres }} {{ c.paciente?.persona?.apellidos
                    }}</span>
                  </td>
                  <td v-if="esAdmin || esEnfermera">
                    <span class="staff-name">{{ c.fisioterapeuta ? c.fisioterapeuta.persona.nombres : '—' }}</span>
                  </td>
                  <td>{{ c.servicio_topico?.nombre_servicio }}</td>
                  <td>
                    <span class="estado-badge"
                      :style="`color:${ESTADOS_CITA[c.estado]?.color}; background:${ESTADOS_CITA[c.estado]?.bg}`">
                      {{ ESTADOS_CITA[c.estado]?.label ?? c.estado }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </template>

  </div>
</template>

<style scoped>
/* Grid de tarjetas resumen */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  gap: 4px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--navy);
}

.stat-label {
  font-size: 12.5px;
  color: var(--gray-500);
  font-weight: 500;
}

.stat-card.alerta .stat-value {
  color: #ef4444;
}

/* Resumen de estados */
.estado-resumen-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.estado-resumen-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--gray-50);
  border-radius: var(--radius-sm);
  border: 1px solid var(--gray-100);
}

.estado-resumen-cantidad {
  font-size: 18px;
  font-weight: 700;
  color: var(--navy);
}

.subtitulo-card {
  font-size: 12.5px;
  color: var(--gray-500);
  margin: 4px 0 12px;
}

/* Ocupación de fisioterapeutas */
.ocupacion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 12px;
}

.ocupacion-item {
  padding: 14px 16px;
  background: var(--gray-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-100);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ocupacion-header {
  display: flex;
  flex-direction: column;
}

.ocupacion-cifras {
  display: flex;
  gap: 14px;
  font-size: 12.5px;
  color: var(--gray-500);
}

.ocupacion-cifras strong {
  color: var(--navy);
  font-size: 14px;
}

@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}


/* Mejora el padding interno de las tarjetas (data-card) */
.data-card {
  background: #ffffff;
  border-radius: var(--radius-md);
  padding: 24px;
  /* Asegura que lo que está adentro no toque el borde */
  border: 1px solid var(--gray-200);
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
</style>