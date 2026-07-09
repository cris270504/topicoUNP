<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useCitas } from '@/composables/useCitas'
import { useAlert } from '@/composables/useAlert'
import ModalReservarCitaPaciente from '@/components/ModalReservarCitaPaciente.vue'
import ModalCancelacionPaciente from '@/components/ModalCancelacionPaciente.vue'
import ModalConsultarResultados from '@/components/ModalConsultarResultados.vue'

const {
  citas, loading, userId,
  initUser, fetchCitas, fetchFisios, fetchServicios,
  obtenerSlotsDisponibles, formatFechaHora, nombreCompleto,
  fisios, servicios,
} = useCitas()

const { showAlert } = useAlert()

const showModalNueva = ref(false)
const showModalCancelar = ref(false)
const showModalResultados = ref(false)
const citaSeleccionada = ref(null)
const citaParaResultados = ref(null)
const expandedIds = ref([])
const loadingCancelacion = ref(false)

const toggleExpand = (idcita) => {
  const index = expandedIds.value.indexOf(idcita)
  if (index > -1) {
    expandedIds.value.splice(index, 1)
  } else {
    expandedIds.value.push(idcita)
  }
}

// Timer reactivo para recalcular la ventana de 15 minutos en tiempo real
const now = ref(Date.now())
let intervalId = null

onMounted(async () => {
  await initUser()
  await Promise.all([
    fetchServicios(),
    fetchFisios(),
    fetchCitas()
  ])
  
  intervalId = setInterval(() => {
    now.value = Date.now()
  }, 10000) // update every 10s
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// Calcula si la cita aún está en la ventana de 15 minutos (900,000 ms)
const puedeModificar = (cita) => {
  if (cita.estado !== 'reservada' && cita.estado !== 'pendiente') return false
  const createdAtMs = new Date(cita.created_at).getTime()
  return (now.value - createdAtMs) <= 900000 
}

// Obtener el tiempo restante en formato MM:SS
const tiempoRestanteStr = (cita) => {
  const createdAtMs = new Date(cita.created_at).getTime()
  const diff = 900000 - (now.value - createdAtMs)
  if (diff <= 0) return 'Expirado'
  
  const minutos = Math.floor(diff / 60000)
  const segundos = Math.floor((diff % 60000) / 1000)
  return `${minutos}:${segundos.toString().padStart(2, '0')}`
}

const abrirModalCancelar = (cita) => {
  citaSeleccionada.value = cita
  showModalCancelar.value = true
}

const abrirModalResultados = (cita) => {
  citaParaResultados.value = cita
  showModalResultados.value = true
}

const handleReservaGuardada = async () => {
  showModalNueva.value = false
  await fetchCitas()
}

const handleCancelacion = async (motivo) => {
  loadingCancelacion.value = true
  try {
    const { error } = await supabase.rpc('cancelar_cita_paciente', {
      p_id_cita: citaSeleccionada.value.idcita,
      p_motivo: motivo
    })
    
    if (error) throw error
    
    showAlert('Tu cita ha sido cancelada.', 'success')
    showModalCancelar.value = false
    await fetchCitas()
  } catch (err) {
    showAlert('Error al cancelar: ' + err.message, 'error')
  } finally {
    loadingCancelacion.value = false
  }
}
</script>

<template>
  <div class="view-container">
    <div class="action-header">
      <div class="header-text">
        <h2>Mis Reservas</h2>
        <p>Gestiona tus citas de fisioterapia en el tópico.</p>
      </div>
      <button class="primary-btn" @click="showModalNueva = true">
        + Agendar Cita
      </button>
    </div>

    <div v-if="loading" class="loading-state">Cargando tus reservas...</div>
    
    <div v-else-if="!citas || citas.length === 0" class="empty-state">
      No tienes citas agendadas actualmente.
    </div>

    <div v-else class="citas-grid">
      <div 
        v-for="cita in citas" 
        :key="cita.idcita" 
        class="data-card cita-card" 
        :class="[cita.estado, { 'is-expanded': expandedIds.includes(cita.idcita) }]"
        @click="toggleExpand(cita.idcita)"
      >
        
        <div class="card-header">
          <div class="badge-estado">{{ cita.estado.toUpperCase() }}</div>
          <div class="fecha-badge">{{ formatFechaHora(cita.fecha_hora) }}</div>
        </div>

        <div class="card-body">
          <p><strong>Servicio:</strong> {{ cita.servicio_topico?.nombre_servicio }}</p>
          <p><strong>Especialista:</strong> {{ nombreCompleto(cita.fisioterapeuta?.persona) }}</p>
          
          <Transition name="expand-content">
            <div v-show="expandedIds.includes(cita.idcita)" class="expanded-details">
              <p v-if="cita.motivo_reserva" class="motivo-text">
                "{{ cita.motivo_reserva }}"
              </p>
              
              <div class="card-footer" v-if="cita.estado === 'reservada' || cita.estado === 'pendiente'">
                <div v-if="puedeModificar(cita)" class="timer-box">
                  ⏱️ Tienes <strong>{{ tiempoRestanteStr(cita) }}</strong> para modificar o eliminar.
                </div>
                
                <div class="acciones-paciente">
                  <button class="btn-cancelar" @click.stop="abrirModalCancelar(cita)">
                    Cancelar Cita
                  </button>
                </div>
              </div>
              
              <div class="card-footer" v-if="cita.estado === 'completada'">
                <div class="acciones-paciente">
                  <button class="btn-primary" style="background: var(--teal-600); width: 100%; border-radius: 8px;" @click.stop="abrirModalResultados(cita)">
                    📄 Consultar Resultados
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        
        <div class="expand-indicator">
          <svg v-if="!expandedIds.includes(cita.idcita)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
        </div>
      </div>
    </div>

    <!-- Modales -->
    <ModalReservarCitaPaciente 
      :isOpen="showModalNueva"
      :fisios="fisios"
      :servicios="servicios"
      :idpaciente="userId"
      @close="showModalNueva = false"
      @submit="handleReservaGuardada"
    />
    
    <ModalCancelacionPaciente 
      :isOpen="showModalCancelar"
      :cita="citaSeleccionada"
      :isSubmitting="loadingCancelacion"
      @close="showModalCancelar = false"
      @confirm="handleCancelacion"
    />

    <ModalConsultarResultados
      :isOpen="showModalResultados"
      :cita="citaParaResultados"
      @close="showModalResultados = false"
    />

  </div>
</template>

<style scoped>
.citas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.cita-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  background: white;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.cita-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  border-color: #d1d5db;
}

.cita-card.is-expanded {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.3);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.badge-estado {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
}

.cita-card.reservada .badge-estado, .cita-card.pendiente .badge-estado {
  background: #fef3c7; color: #b45309;
}
.cita-card.cancelada .badge-estado {
  background: #fee2e2; color: #b91c1c;
}
.cita-card.atendida .badge-estado, .cita-card.completada .badge-estado {
  background: #d1fae5; color: #047857;
}

.fecha-badge {
  font-size: 13px;
  font-weight: 600;
  color: #1e3c72;
}

.card-body p {
  margin: 5px 0;
  font-size: 14px;
  color: #374151;
}

.motivo-text {
  margin-top: 10px !important;
  font-style: italic;
  color: #6b7280;
  border-left: 2px solid #e5e7eb;
  padding-left: 10px;
}

.card-footer {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #f3f4f6;
}

.timer-box {
  background: #eff6ff;
  color: #1d4ed8;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 12px;
  text-align: center;
}

.acciones-paciente {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancelar {
  background: white;
  border: 1px solid #ef4444;
  color: #ef4444;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancelar:hover {
  background: #fef2f2;
}

.expand-indicator {
  display: flex;
  justify-content: center;
  margin-top: 10px;
  color: #9ca3af;
}

.expand-indicator svg {
  width: 20px;
  height: 20px;
  transition: color 0.2s;
}

.cita-card:hover .expand-indicator svg {
  color: #4b5563;
}

/* Transiciones para la expansión */
.expand-content-enter-active,
.expand-content-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 500px;
  opacity: 1;
  overflow: hidden;
}

.expand-content-enter-from,
.expand-content-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  padding-top: 0;
}
</style>
