<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'
import { useRouter } from 'vue-router'

const { showAlert } = useAlert()
const router = useRouter()

const loading = ref(false)
const searchQuery = ref('')
const expedientes = ref([])

const fetchExpedientes = async () => {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sin sesión activa')

    const { data, error } = await supabase
      .from('cita')
      .select(`
        idcita, fecha_hora, estado,
        paciente (
          idpaciente, codigo_universitario, tipo_usuario,
          persona ( nombres, apellidos, numero_documento, tipo_documento, celular )
        )
      `)
      .eq('idfisioterapeuta', user.id)
      .not('estado', 'in', '("cancelada")')
      .order('fecha_hora', { ascending: false })

    if (error) throw error

    const mapa = {}
    for (const cita of data ?? []) {
      const p = cita.paciente
      if (!p) continue
      const id = p.idpaciente
      if (!mapa[id]) {
        mapa[id] = {
          idPaciente: p.idpaciente,
          codigo_universitario: p.codigo_universitario,
          tipo_usuario: p.tipo_usuario,
          Persona: p.persona,
          totalCitas: 0,
          citasCompletadas: 0,
          ultimaFecha: null,
          ultimoEstado: null
        }
      }
      mapa[id].totalCitas++
      if (cita.estado === 'completada') mapa[id].citasCompletadas++
      if (!mapa[id].ultimaFecha || cita.fecha_hora > mapa[id].ultimaFecha) {
        mapa[id].ultimaFecha = cita.fecha_hora
        mapa[id].ultimoEstado = cita.estado
      }
    }

    expedientes.value = Object.values(mapa).sort((a, b) =>
      (b.ultimaFecha || '') > (a.ultimaFecha || '') ? 1 : -1
    )
  } catch (err) {
    showAlert('Error al cargar expedientes: ' + err.message, 'error')
  } finally {
    loading.value = false
  }
}

const filtrados = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return expedientes.value
  return expedientes.value.filter(e => {
    const nombre = `${e.Persona?.nombres ?? ''} ${e.Persona?.apellidos ?? ''}`.toLowerCase()
    const doc = e.Persona?.numero_documento ?? ''
    const codigo = e.codigo_universitario?.toLowerCase() ?? ''
    return nombre.includes(q) || doc.includes(q) || codigo.includes(q)
  })
})

const formatFecha = (iso) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'America/Lima'
  }).format(new Date(iso))
}

const estadoInfo = (estado) => {
  const map = {
    completada: { label: 'Completada', bg: '#d1fae5', color: '#065f46' },
    en_consulta: { label: 'En consulta', bg: '#dbeafe', color: '#1e40af' },
    en_triaje: { label: 'En triaje', bg: '#ede9fe', color: '#5b21b6' },
    confirmada: { label: 'Confirmada', bg: '#d1fae5', color: '#065f46' },
    pendiente: { label: 'Pendiente', bg: '#fef3c7', color: '#92400e' },
    ausente: { label: 'Ausente', bg: '#f3f4f6', color: '#374151' },
  }
  return map[estado] ?? { label: estado, bg: '#f1f5f9', color: '#334155' }
}

const irAHistoria = (id) => {
  router.push({ name: 'HistoriaClinica', params: { idPaciente: id } })
}

onMounted(fetchExpedientes)
</script>

<template>
  <div class="view-container">

    <div class="action-header">
      <div class="header-text">
        <h2>Mis Expedientes</h2>
        <p>Pacientes que has atendido — accede a su historia clínica completa.</p>
      </div>
      <div class="header-stats">
        <div class="stat-pill">
          <span class="stat-number">{{ expedientes.length }}</span>
          <span class="stat-label">pacientes</span>
        </div>
        <div class="stat-pill">
          <span class="stat-number">{{expedientes.reduce((s, e) => s + e.citasCompletadas, 0)}}</span>
          <span class="stat-label">sesiones completadas</span>
        </div>
      </div>
    </div>

    <div class="data-card search-bar-card">
      <div class="input-group" style="max-width: 460px;">
        <input v-model="searchQuery" type="text" placeholder="Buscar por nombre, documento o código UNP..."
          style="background: #ffffff;" />
      </div>
    </div>

    <div class="data-card table-card">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>Cargando expedientes...</span>
      </div>

      <div v-else class="table-responsive">
        <table class="content-table">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Código UNP</th>
              <th>Documento</th>
              <th>Sesiones</th>
              <th>Última visita</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="exp in filtrados" :key="exp.idPaciente">
              <td>
                <span class="patient-name">
                  {{ exp.Persona?.nombres }} {{ exp.Persona?.apellidos }}
                </span>
                <span class="patient-detail" style="text-transform: capitalize;">
                  {{ exp.tipo_usuario }}
                </span>
              </td>
              <td><strong>{{ exp.codigo_universitario || '—' }}</strong></td>
              <td>{{ exp.Persona?.tipo_documento }}: {{ exp.Persona?.numero_documento }}</td>
              <td>
                <span class="sessions-badge">
                  {{ exp.citasCompletadas }} / {{ exp.totalCitas }}
                </span>
              </td>
              <td>{{ formatFecha(exp.ultimaFecha) }}</td>
              <td>
                <span class="estado-badge"
                  :style="{ background: estadoInfo(exp.ultimoEstado).bg, color: estadoInfo(exp.ultimoEstado).color }">
                  {{ estadoInfo(exp.ultimoEstado).label }}
                </span>
              </td>
              <td>
                <button class="btn-secondary"
                  style="padding: 6px 14px; font-size: 12px; border-radius: 6px; background: #ccfbf1; color: #0f766e;"
                  @click="irAHistoria(exp.idPaciente)">
                  Historia Clínica
                </button>
              </td>
            </tr>
            <tr v-if="filtrados.length === 0 && !loading">
              <td colspan="7" class="empty-row">
                {{ searchQuery ? 'No se encontraron resultados para la búsqueda.' : 'Aún no tienes pacientes atendidos.'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<style scoped>
.search-bar-card {
  padding: 16px;
  border-bottom: none;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.table-card {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.header-stats {
  display: flex;
  gap: 12px;
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f0f6ff;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  padding: 8px 18px;
  min-width: 90px;
}

.stat-number {
  font-family: 'Playfair Display', serif;
  font-size: 22px;
  font-weight: 700;
  color: var(--navy);
  line-height: 1;
}

.stat-label {
  font-size: 11px;
  color: var(--gray-500);
  margin-top: 2px;
  white-space: nowrap;
}

.sessions-badge {
  display: inline-block;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
}

.estado-badge {
  display: inline-block;
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 40px;
  justify-content: center;
  color: var(--gray-500);
}
</style>
