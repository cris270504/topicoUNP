<script setup>
import { ref, computed, watch } from 'vue'
import { getTodayISO } from '@/lib/dateUtils'
import { useCitas } from '@/composables/useCitas'
import { useAlert } from '@/composables/useAlert'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  fisios: { type: Array, default: () => [] },
  servicios: { type: Array, default: () => [] },
  idpaciente: { type: String, default: null }
})

const emit = defineEmits(['close', 'submit'])

const { obtenerSlotsDisponibles, crearCita, loadingAccion } = useCitas()
const { showAlert } = useAlert()

const idservicio = ref(null)
const idfisioterapeuta = ref(null)
const fecha = ref('')
const hora = ref('')
const motivoReserva = ref('')
const slotsDisponibles = ref([])
const loadingSlots = ref(false)

const fechaMin = computed(() => getTodayISO())

const isDomingo = (fechaString) => {
  if (!fechaString) return false
  const [y, m, d] = fechaString.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).getDay() === 0
}

const duracionServicio = computed(() => {
  if (!idservicio.value) return 20
  return props.servicios.find(s => s.idservicio === idservicio.value)?.duracion_estimada_minutos ?? 20
})

const fetchSlots = async () => {
  if (!idfisioterapeuta.value || !fecha.value || isDomingo(fecha.value)) {
    slotsDisponibles.value = []
    hora.value = ''
    return
  }

  loadingSlots.value = true
  try {
    slotsDisponibles.value = await obtenerSlotsDisponibles(idfisioterapeuta.value, fecha.value, duracionServicio.value)
    
    // Filtrar si es el mismo día
    const limaTimeStr = new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima' })
    const [hoyPeru, horaPeru] = limaTimeStr.split(' ')

    if (fecha.value === hoyPeru) {
      const [hh, mm] = horaPeru.split(':').map(Number)
      slotsDisponibles.value = slotsDisponibles.value.filter(slot => {
        const [h, m] = slot.split(':').map(Number)
        return h > hh || (h === hh && m > mm)
      })
    }
  } finally {
    loadingSlots.value = false
  }
}

watch([idfisioterapeuta, idservicio, fecha], () => {
  hora.value = '' // reset hora if anything changes
  fetchSlots()
})

watch(() => props.servicios, (lista) => {
  if (lista?.length && !idservicio.value) {
    idservicio.value = lista[0].idservicio
  }
}, { immediate: true })

watch(() => props.isOpen, (abierto) => {
  if (abierto) resetForm()
})

const resetForm = () => {
  idfisioterapeuta.value = null
  idservicio.value = props.servicios?.[0]?.idservicio || null
  fecha.value = ''
  hora.value = ''
  motivoReserva.value = ''
  slotsDisponibles.value = []
}

const handleSubmit = async () => {
  if (!hora.value) {
    showAlert('Debe seleccionar una hora disponible.', 'warning')
    return
  }

  const payload = {
    idpaciente: props.idpaciente,
    idfisioterapeuta: idfisioterapeuta.value,
    idservicio: idservicio.value,
    fecha_hora: `${fecha.value}T${hora.value}:00-05:00`,
    motivo_reserva: motivoReserva.value || null,
  }

  const exito = await crearCita(payload)
  if (exito) {
    emit('submit')
  }
}

const nombreFisio = (f) => {
  if (!f) return ''
  const persona = f.persona ?? {}
  return `${persona?.nombres ?? ''} ${persona?.apellidos ?? ''}`.trim() + (f.especialidad ? ` — ${f.especialidad}` : '')
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window">
        <div class="modal-header">
          <h3>Agendar Nueva Cita</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form" novalidate>
          
          <div class="form-section">
            <p class="section-label">1. Servicio y Especialista</p>
            
            <div class="input-group">
              <label>Servicio Requerido <span class="req">*</span></label>
              <select v-model="idservicio" required>
                <option :value="null" disabled>— Seleccionar servicio —</option>
                <option v-for="s in servicios" :key="s.idservicio" :value="s.idservicio">
                  {{ s.nombre_servicio }} (aprox. {{ s.duracion_estimada_minutos }} min)
                </option>
              </select>
            </div>

            <div class="input-group">
              <label>Fisioterapeuta <span class="req">*</span></label>
              <select v-model="idfisioterapeuta" required>
                <option :value="null" disabled>— Seleccionar especialista —</option>
                <option v-for="f in fisios" :key="f.idfisioterapeuta" :value="f.idfisioterapeuta">
                  {{ nombreFisio(f) }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-section">
            <p class="section-label">2. Fecha y Horario</p>
            <div class="form-grid">
              <div class="input-group">
                <label>Fecha <span class="req">*</span></label>
                <input type="date" v-model="fecha" :min="fechaMin" required />
                <p v-if="isDomingo(fecha)" class="field-hint warn">El tópico no atiende domingos.</p>
              </div>
            </div>

            <!-- Botones de turnos clickeables -->
            <div class="input-group mt-3" v-if="fecha && idfisioterapeuta && !isDomingo(fecha)">
              <label>Horarios Disponibles <span class="req">*</span></label>
              <div v-if="loadingSlots" class="loading-slots">Buscando horarios...</div>
              <div v-else-if="slotsDisponibles.length === 0" class="no-slots">
                ❌ No hay turnos disponibles para este día.
              </div>
              <div v-else class="slots-grid">
                <button 
                  v-for="slot in slotsDisponibles" 
                  :key="slot" 
                  type="button" 
                  class="slot-btn" 
                  :class="{ active: hora === slot }"
                  @click="hora = slot"
                >
                  {{ slot }}
                </button>
              </div>
            </div>
          </div>

          <div class="form-section">
            <p class="section-label">3. Motivo de la Cita</p>
            <div class="input-group">
              <textarea 
                v-model="motivoReserva" 
                rows="3" 
                placeholder="Describe brevemente el motivo de tu consulta (ej. 'Fuerte dolor en la zona lumbar desde hace 2 días')"
                maxlength="300"
                required
              ></textarea>
              <span class="char-count">{{ motivoReserva.length }}/300</span>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="loadingAccion">Cancelar</button>
            <button type="submit" class="btn-primary-submit" :disabled="loadingAccion || !hora || !fecha || !idfisioterapeuta || !idservicio">
              <span v-if="loadingAccion" class="btn-spinner"></span>
              <span v-else>Confirmar Reserva</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-window {
  width: 90%;
  max-width: 500px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--gray-100);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-form {
  padding: 24px;
  overflow-y: auto;
}

.section-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--blue);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--gray-100);
  padding-bottom: 8px;
}

.form-section {
  margin-bottom: 24px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-600);
  margin-bottom: 8px;
}

.input-group input, .input-group select, .input-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--gray-200);
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.slot-btn {
  background: white;
  border: 1px solid var(--gray-200);
  padding: 10px;
  border-radius: 6px;
  font-weight: 600;
  color: var(--gray-700);
  cursor: pointer;
  transition: all 0.2s;
}

.slot-btn:hover {
  border-color: var(--blue);
  color: var(--blue);
}

.slot-btn.active {
  background: var(--blue);
  color: white;
  border-color: var(--blue);
}

.no-slots, .loading-slots {
  padding: 15px;
  background: var(--gray-50);
  border-radius: 6px;
  text-align: center;
  font-size: 14px;
  color: var(--gray-600);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--gray-100);
}

.btn-secondary {
  padding: 10px 16px;
  background: white;
  border: 1px solid var(--gray-200);
  color: var(--gray-600);
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary-submit {
  padding: 10px 20px;
  background: var(--blue);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
