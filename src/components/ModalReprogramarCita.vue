<script setup>
/**
 * ModalReprogramarCita.vue — Reescrito para esquema actual
 *
 * Correcciones:
 * - Usa f.idfisioterapeuta (minúscula) en lugar de f.idFisioterapeuta
 * - Usa f.persona (minúscula) en lugar de f.Persona
 * - Usa cita.idcita (minúscula) en lugar de cita.idSesion
 * - Reemplaza useSearch (que no filtraba bien) por filtro reactivo local
 * - Duración de slot tomada del servicio de la cita original
 * - Slot calculado con obtenerSlotsDisponibles del composable
 */
import { ref, computed, watch } from 'vue'
import { useCitas } from '@/composables/useCitas'
import { getTodayISO } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

const props = defineProps({
  isOpen:        { type: Boolean, required: true },
  cita:          { type: Object,  default: null },   // objeto cita del nuevo esquema
  fisios:        { type: Array,   default: () => [] },
  loadingAccion: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])

const { obtenerSlotsDisponibles } = useCitas()

// ── Campos del formulario ────────────────────────────────────────────────────
const idFisioterapeuta = ref(null)
const fecha            = ref('')
const hora             = ref('')
const motivo           = ref('')

// ── Búsqueda de fisioterapeuta (filtro local) ────────────────────────────────
const searchFisio   = ref('')
const showFisioList = ref(false)

const fisiosFiltrados = computed(() => {
  const q = searchFisio.value.toLowerCase().trim()
  return props.fisios.filter(f => {
    const nombre = `${f.persona?.nombres ?? ''} ${f.persona?.apellidos ?? ''}`.toLowerCase()
    return !q || nombre.includes(q)
  })
})

const fisioSeleccionado = computed(() =>
  props.fisios.find(f => f.idfisioterapeuta === idFisioterapeuta.value) ?? null
)

const seleccionarFisio = (f) => {
  idFisioterapeuta.value = f.idfisioterapeuta
  searchFisio.value = `${f.persona?.nombres ?? ''} ${f.persona?.apellidos ?? ''}`.trim()
  showFisioList.value = false
  fecha.value = ''
  hora.value = ''
  slotsDisponibles.value = []
}

const hideFisioDelay = () => setTimeout(() => { showFisioList.value = false }, 200)

const limpiarFisio = () => {
  idFisioterapeuta.value = null
  searchFisio.value = ''
  fecha.value = ''
  hora.value = ''
  slotsDisponibles.value = []
}

// ── Slots disponibles ────────────────────────────────────────────────────────
const slotsDisponibles = ref([])
const loadingSlots     = ref(false)

const fechaMin = computed(() => getTodayISO())

// Duración tomada del servicio de la cita (fallback 30 min)
const duracionCita = computed(() =>
  Number(props.cita?.servicio_topico?.duracion_estimada_minutos) || 30
)

// Filtra slots pasados si la fecha es hoy
const slotsFiltrados = computed(() => {
  if (!slotsDisponibles.value.length) return []
  if (fecha.value !== getTodayISO()) return slotsDisponibles.value

  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const hh = ahora.getHours()
  const mm = ahora.getMinutes()

  return slotsDisponibles.value.filter(slot => {
    const [h, m] = slot.split(':').map(Number)
    return h > hh || (h === hh && m > mm)
  })
})

// El día es domingo → bloqueado
const esDomingo = computed(() => {
  if (!fecha.value) return false
  const [y, m, d] = fecha.value.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).getDay() === 0
})

// Recalcular slots al cambiar fisio o fecha
watch([idFisioterapeuta, fecha], async ([idFisio, f]) => {
  slotsDisponibles.value = []
  hora.value = ''
  if (!idFisio || !f || esDomingo.value) return

  loadingSlots.value = true
  try {
    slotsDisponibles.value = await obtenerSlotsDisponibles(idFisio, f, duracionCita.value)
  } finally {
    loadingSlots.value = false
  }
})

// ── Pre-cargar datos al abrir ────────────────────────────────────────────────
watch(() => props.isOpen, (abierto) => {
  if (!abierto) return
  // Pre-seleccionar el fisioterapeuta actual de la cita
  const idActual = props.cita?.idfisioterapeuta ?? null
  idFisioterapeuta.value = idActual

  if (idActual) {
    const fisioActual = props.fisios.find(f => f.idfisioterapeuta === idActual)
    searchFisio.value = fisioActual
      ? `${fisioActual.persona?.nombres ?? ''} ${fisioActual.persona?.apellidos ?? ''}`.trim()
      : ''
  } else {
    searchFisio.value = ''
  }

  fecha.value = ''
  hora.value = ''
  motivo.value = ''
  slotsDisponibles.value = []
})

// ── Envío ────────────────────────────────────────────────────────────────────
const handleSubmit = () => {
  if (!idFisioterapeuta.value || !fecha.value || !hora.value || !motivo.value.trim()) return

  emit('submit', {
    idcita:              props.cita.idcita,
    idfisioterapeuta:    idFisioterapeuta.value,
    nueva_fecha_hora:    `${fecha.value}T${hora.value}:00-05:00`,
    motivo_reprogramacion: motivo.value.trim()
  })
}

// ── Helpers de display ───────────────────────────────────────────────────────
const nombreFisio = (f) => {
  if (!f) return ''
  return `${f.persona?.nombres ?? ''} ${f.persona?.apellidos ?? ''}`.trim()
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window" style="max-width: 520px;">

        <div class="modal-header">
          <h3>Reprogramar Cita</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form" novalidate>

          <!-- Aviso -->
          <div class="aviso-info">
            <strong>Atención:</strong> Las citas solo pueden ser reprogramadas 1 vez.
          </div>

          <!-- 1. Fisioterapeuta -->
          <div class="input-group" style="position: relative;">
            <label>Nuevo Fisioterapeuta <span class="req">*</span></label>

            <!-- Chip cuando ya hay uno seleccionado -->
            <div v-if="fisioSeleccionado" class="fisio-chip">
              <div class="chip-info">
                <span class="chip-nombre">{{ nombreFisio(fisioSeleccionado) }}</span>
                <span class="chip-detalle">{{ fisioSeleccionado.especialidad }}</span>
              </div>
              <button type="button" class="chip-clear" @click="limpiarFisio" title="Cambiar especialista">
                &times;
              </button>
            </div>

            <!-- Campo de búsqueda cuando no hay selección -->
            <template v-else>
              <input
                type="text"
                v-model="searchFisio"
                @focus="showFisioList = true"
                @blur="hideFisioDelay"
                placeholder="🔍 Buscar especialista..."
                class="search-input"
                autocomplete="off"
              />

              <ul v-if="showFisioList && fisiosFiltrados.length > 0" class="options-list">
                <li v-for="f in fisiosFiltrados" :key="f.idfisioterapeuta" @click="seleccionarFisio(f)">
                  <div class="li-name">{{ nombreFisio(f) }}</div>
                  <div class="li-sub">{{ f.especialidad }}</div>
                </li>
              </ul>

              <p v-if="showFisioList && fisiosFiltrados.length === 0 && searchFisio.length > 0"
                class="field-hint warn">
                No se encontró ningún especialista con ese nombre.
              </p>
            </template>
          </div>

          <!-- 2. Fecha y Horario -->
          <div class="form-grid">
            <div class="input-group">
              <label>Nueva Fecha <span class="req">*</span></label>
              <input
                type="date"
                v-model="fecha"
                :min="fechaMin"
                :disabled="!idFisioterapeuta"
                required
              />
              <p v-if="esDomingo" class="field-hint warn">⚠️ El tópico no atiende los domingos.</p>
              <p v-if="!idFisioterapeuta" class="field-hint">Selecciona un especialista primero.</p>
            </div>

            <div class="input-group">
              <label>Nuevo Horario <span class="req">*</span></label>
              <select
                v-model="hora"
                required
                :disabled="!fecha || !idFisioterapeuta || loadingSlots || esDomingo"
              >
                <option value="" disabled>
                  {{
                    loadingSlots       ? 'Buscando turnos libres...' :
                    esDomingo          ? '❌ Día no disponible' :
                    !idFisioterapeuta  ? '⚠️ Selecciona especialista' :
                    !fecha             ? '⚠️ Selecciona una fecha' :
                    slotsFiltrados.length === 0 ? '❌ Sin turnos ese día' :
                    '— Seleccionar hora —'
                  }}
                </option>
                <option v-for="slot in slotsFiltrados" :key="slot" :value="slot">
                  {{ slot }}
                </option>
              </select>
              <p v-if="fecha && idFisioterapeuta && !loadingSlots && !esDomingo && slotsFiltrados.length === 0"
                class="field-hint warn">
                ⚠️ No hay turnos disponibles para ese día.
              </p>
            </div>
          </div>

          <!-- 3. Motivo -->
          <div class="input-group">
            <label>Motivo de la reprogramación <span class="req">*</span></label>
            <textarea
              v-model="motivo"
              rows="3"
              placeholder="Ej: El paciente solicitó cambio de turno..."
              required
              maxlength="300"
            ></textarea>
            <span class="char-count">{{ motivo.length }}/300</span>
          </div>

          <!-- Acciones -->
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="loadingAccion">
              Cancelar
            </button>
            <button
              type="submit"
              class="btn-primary-submit"
              :disabled="loadingAccion || !idFisioterapeuta || !hora || !fecha || !motivo.trim()"
            >
              <span v-if="loadingAccion" class="btn-spinner"></span>
              <span v-else>Confirmar Reprogramación</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.aviso-info {
  font-size: 12.5px;
  border: 1px solid #bae6fd;
  border-radius: var(--radius-sm);
  padding: 12px;
  background: #e0f2fe;
  color: #0369a1;
  margin-bottom: 4px;
}

/* Chip de fisio seleccionado */
.fisio-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1.5px solid #10b981;
  background: #f0fdf4;
}

.chip-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chip-nombre {
  font-size: 13.5px;
  font-weight: 700;
  color: #065f46;
}

.chip-detalle {
  font-size: 11.5px;
  color: var(--gray-500);
}

.chip-clear {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--gray-400);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.15s;
}

.chip-clear:hover {
  color: #ef4444;
}

/* Campo de búsqueda */
.search-input {
  width: 100%;
  box-sizing: border-box;
}

/* Dropdown */
.options-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.options-list li {
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.options-list li:hover {
  background: var(--gray-50);
}

.li-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--navy);
}

.li-sub {
  font-size: 11.5px;
  color: var(--gray-500);
  margin-top: 1px;
}

/* Hints */
.field-hint {
  font-size: 11.5px;
  color: var(--gray-500);
  margin: 3px 0 0;
}

.field-hint.warn {
  color: #b45309;
}

.req {
  color: #ef4444;
}

/* Contador de caracteres */
.char-count {
  font-size: 11px;
  color: var(--gray-500);
  text-align: right;
  margin-top: 2px;
  display: block;
}
</style>