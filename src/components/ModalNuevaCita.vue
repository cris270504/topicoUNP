<script setup>
import { ref, computed, watch } from 'vue'
import { TIPOS_USUARIO } from '@/composables/useCitas'
import { getTodayISO } from '@/lib/dateUtils'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  fisios: { type: Array, default: () => [] },
  pacientes: { type: Array, default: () => [] },
  servicios: { type: Array, default: () => [] },
  loadingAccion: { type: Boolean, default: false },
  obtenerSlots: { type: Function, required: true },
  onBuscarPorCodigo: { type: Function, required: true },
  onBuscarPorDNI: { type: Function, required: true },
})

const emit = defineEmits(['close', 'submit', 'fisio-changed'])

// ── Campos del formulario ────────────────────────────────────────────────────
const tipoBusqueda = ref(null)
const terminoBusqueda = ref('')
const resultadosBusqueda = ref([])
const buscando = ref(false)
const pacienteSeleccionado = ref(null)

const idfisioterapeuta = ref(null)
const idservicio = ref(null)
const motivoConsulta = ref('')

// ── Lógica Dinámica de Múltiples Sesiones ────────────────────────────────────
const cantidadSesiones = ref(1)
const sesiones = ref([{ fecha: '', hora: '', slots: [], loading: false }])
const fechaMin = computed(() => getTodayISO())

const esSesionFisioterapia = computed(() => {
  if (!idservicio.value) return false
  const serv = props.servicios.find(s => s.idservicio === idservicio.value)
  if (!serv) return false

  const nombreNormalizado = (serv.nombre_servicio || '').toLowerCase()
  return nombreNormalizado.includes('fisioterapia') || nombreNormalizado.includes('sesion')
})

watch(cantidadSesiones, (nuevaCantidad) => {
  const cant = Math.max(1, Math.min(20, nuevaCantidad || 1))
  const diff = cant - sesiones.value.length

  if (diff > 0) {
    for (let i = 0; i < diff; i++) sesiones.value.push({ fecha: '', hora: '', slots: [], loading: false })
  } else if (diff < 0) {
    sesiones.value.splice(cant)
  }
})

watch(esSesionFisioterapia, (esFisio) => {
  if (!esFisio) cantidadSesiones.value = 1
})

const duracionServicio = computed(() => {
  if (!idservicio.value) return 20
  return props.servicios.find(s => s.idservicio === idservicio.value)?.duracion_estimada_minutos ?? 20
})

// ── Búsqueda de Horarios (Slots) por Fila ────────────────────────────────────
const isDomingo = (fechaString) => {
  if (!fechaString) return false
  const [y, m, d] = fechaString.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).getDay() === 0
}

const fetchSlotsForRow = async (index) => {
  const row = sesiones.value[index]

  if (!idfisioterapeuta.value || !row.fecha || isDomingo(row.fecha)) {
    row.slots = []
    row.hora = ''
    return
  }

  row.loading = true
  try {
    row.slots = await props.obtenerSlots(idfisioterapeuta.value, row.fecha, duracionServicio.value)
  } finally {
    row.loading = false
  }
}

const getSlotsFiltrados = (index) => {
  const row = sesiones.value[index]
  if (row.loading || !row.slots.length) return row.slots

  const limaTimeStr = new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima' })
  const [hoyPeru, horaPeru] = limaTimeStr.split(' ')

  if (row.fecha !== hoyPeru) return row.slots

  const [hh, mm] = horaPeru.split(':').map(Number)
  return row.slots.filter(slot => {
    const [h, m] = slot.split(':').map(Number)
    return h > hh || (h === hh && m > mm)
  })
}

watch(idfisioterapeuta, (val) => {
  if (val) {
    emit('fisio-changed', val)
    sesiones.value.forEach((_, i) => fetchSlotsForRow(i))
  }
})

// ── Búsqueda dinámica de Pacientes ───────────────────────────────────────────
let timerBusqueda = null
const onInputBusqueda = (valor) => {
  terminoBusqueda.value = valor
  pacienteSeleccionado.value = null
  resultadosBusqueda.value = []

  clearTimeout(timerBusqueda)
  if (!valor || valor.length < 3) return

  timerBusqueda = setTimeout(async () => {
    buscando.value = true
    try {
      if (tipoBusqueda.value === 'estudiante') {
        resultadosBusqueda.value = await props.onBuscarPorCodigo(valor)
      } else {
        resultadosBusqueda.value = await props.onBuscarPorDNI(valor, tipoBusqueda.value)
      }
    } finally {
      buscando.value = false
    }
  }, 350)
}

const seleccionarPaciente = (p) => {
  pacienteSeleccionado.value = p
  resultadosBusqueda.value = []
  terminoBusqueda.value = `${p.persona?.nombres ?? ''} ${p.persona?.apellidos ?? ''}`.trim()
}

const limpiarPaciente = () => {
  pacienteSeleccionado.value = null
  terminoBusqueda.value = ''
  resultadosBusqueda.value = []
}

watch(() => props.servicios, (lista) => {
  if (lista?.length && !idservicio.value) {
    idservicio.value = lista[0].idservicio
  }
}, { immediate: true })

// ── Reseteo y Envío ───────────────────────────────────────────────────────────
watch(() => props.isOpen, (abierto) => {
  if (abierto) resetForm()
})

const resetForm = () => {
  tipoBusqueda.value = null
  terminoBusqueda.value = ''
  resultadosBusqueda.value = []
  pacienteSeleccionado.value = null
  idfisioterapeuta.value = null
  idservicio.value = props.servicios?.[0]?.idservicio || null
  motivoConsulta.value = ''
  cantidadSesiones.value = 1
  sesiones.value = [{ fecha: '', hora: '', slots: [], loading: false }]
}

const handleSubmit = () => {
  if (!pacienteSeleccionado.value || !formularioValido.value) return

  const payloadCitas = sesiones.value.map(sesion => ({
    idpaciente: pacienteSeleccionado.value.idpaciente,
    idfisioterapeuta: idfisioterapeuta.value,
    idservicio: idservicio.value,
    fecha_hora: `${sesion.fecha}T${sesion.hora}:00-05:00`,
    motivo_consulta: motivoConsulta.value || null,
  }))

  emit('submit', payloadCitas)
}

// ── Helpers y Validaciones ────────────────────────────────────────────────────
const labelBusqueda = computed(() => tipoBusqueda.value === 'estudiante' ? 'Código universitario' : 'Número de DNI')
const placeholderBusqueda = computed(() => tipoBusqueda.value === 'estudiante' ? 'Ej: 20201234A' : 'Ej: 12345678')

const nombreFisio = (f) => {
  if (!f) return ''
  const persona = f.persona ?? {}
  return `${persona?.nombres ?? ''} ${persona?.apellidos ?? ''}`.trim() + (f.especialidad ? ` — ${f.especialidad}` : '')
}

const labelTipoBusqueda = (id) => TIPOS_USUARIO.find(t => t.id === id)?.label ?? id

const labelResultado = (p) => {
  const nombre = `${p.persona?.nombres ?? ''} ${p.persona?.apellidos ?? ''}`.trim()
  return tipoBusqueda.value === 'estudiante'
    ? { principal: nombre, secundario: `Cód: ${p.codigo_universitario} · ${p.facultad_escuela}` }
    : { principal: nombre, secundario: `DNI: ${p.persona?.numero_documento} · ${p.facultad_escuela}` }
}

const formularioValido = computed(() => {
  if (!pacienteSeleccionado.value || !idfisioterapeuta.value) return false
  return sesiones.value.every(s => s.fecha && s.hora && !isDomingo(s.fecha))
})
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window modal-cita">
        <div class="modal-header">
          <h3>Registrar Nueva Cita</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form" novalidate>

          <div class="form-section">
            <p class="section-label">1. Paciente</p>
            <div class="input-group">
              <label>Tipo de usuario <span class="req">*</span></label>
              <div class="tipo-usuario-grid">
                <button v-for="tipo in TIPOS_USUARIO" :key="tipo.id" type="button" class="tipo-btn"
                  :class="{ active: tipoBusqueda === tipo.id }" @click="tipoBusqueda = tipo.id">
                  {{ tipo.label }}
                </button>
              </div>
            </div>

            <Transition name="slide-input">
              <div v-if="tipoBusqueda" class="input-group" style="position: relative;">
                <label>{{ labelBusqueda }} <span class="req">*</span></label>
                <div v-if="pacienteSeleccionado" class="paciente-chip">
                  <div class="chip-info">
                    <span class="chip-nombre">
                      {{ pacienteSeleccionado.persona?.nombres }} {{ pacienteSeleccionado.persona?.apellidos }}
                    </span>
                    <span class="chip-detalle">
                      {{ labelTipoBusqueda(tipoBusqueda) }} ·
                      {{ tipoBusqueda === 'estudiante' ? pacienteSeleccionado.codigo_universitario : pacienteSeleccionado.persona?.numero_documento }}
                      · {{ pacienteSeleccionado.facultad_escuela }}
                    </span>
                  </div>
                  <button type="button" class="chip-clear" @click="limpiarPaciente" title="Cambiar paciente">&times;</button>
                </div>

                <template v-else>
                  <input type="text" class="search-input" :placeholder="placeholderBusqueda" :value="terminoBusqueda"
                    @input="onInputBusqueda($event.target.value)" autocomplete="off" />
                  <span v-if="buscando" class="search-spinner">⏳</span>
                  <ul v-if="resultadosBusqueda.length > 0" class="options-list">
                    <li v-for="p in resultadosBusqueda" :key="p.idpaciente" @click="seleccionarPaciente(p)">
                      <div class="li-name">{{ labelResultado(p).principal }}</div>
                      <div class="li-sub">{{ labelResultado(p).secundario }}</div>
                    </li>
                  </ul>
                </template>
              </div>
            </Transition>
          </div>

          <div class="form-section">
            <p class="section-label">2. Servicio y especialista</p>
            <div class="form-grid">
              <div class="input-group">
                <label>Servicio <span class="req">*</span></label>
                <select v-model="idservicio" required>
                  <option :value="null" disabled>— Seleccionar servicio —</option>
                  <option v-for="s in servicios" :key="s.idservicio" :value="s.idservicio">
                    {{ s.nombre_servicio }}
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

              <div v-if="esSesionFisioterapia" class="input-group" style="grid-column: 1 / -1;">
                <label>Cantidad de sesiones <span class="req">*</span></label>
                <input type="number" v-model.number="cantidadSesiones" min="1" max="20" required />
                <p class="field-hint">Se configurarán los horarios individualmente por sesión.</p>
              </div>
            </div>
          </div>

          <div class="form-section">
            <p class="section-label">3. Agenda de citas</p>
            <div v-for="(sesion, index) in sesiones" :key="index" class="sesion-row"
              style="margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px dashed #eee;">
              <h4 v-if="sesiones.length > 1" style="margin-bottom: 0.8rem; color: #555;">📍 Sesión {{ index + 1 }}</h4>
              <div class="form-grid">
                <div class="input-group">
                  <label>Fecha <span class="req">*</span></label>
                  <input type="date" v-model="sesion.fecha" :min="fechaMin" @change="fetchSlotsForRow(index)" required />
                  <p v-if="isDomingo(sesion.fecha)" class="field-hint warn">⚠️ El tópico no atiende los domingos.</p>
                </div>
                <div class="input-group">
                  <label>Horario disponible <span class="req">*</span></label>
                  <select v-model="sesion.hora" required
                    :disabled="!sesion.fecha || !idfisioterapeuta || sesion.loading || isDomingo(sesion.fecha)">
                    <option value="" disabled>
                      {{
                        sesion.loading ? 'Buscando turnos libres...' :
                          isDomingo(sesion.fecha) ? '❌ Día no disponible' :
                            !idfisioterapeuta ? '⚠️ Selecciona especialista' :
                              !sesion.fecha ? '⚠️ Selecciona una fecha' :
                                getSlotsFiltrados(index).length === 0 ? '❌ Sin turnos' : '— Seleccionar hora —'
                      }}
                    </option>
                    <option v-for="slot in getSlotsFiltrados(index)" :key="slot" :value="slot">
                      {{ slot }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="form-section">
            <p class="section-label">4. Motivo de consulta (opcional)</p>
            <div class="input-group">
              <textarea v-model="motivoConsulta" rows="2" placeholder="Aplica para todas las sesiones..."
                maxlength="300"></textarea>
              <span class="char-count">{{ motivoConsulta.length }}/300</span>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="loadingAccion">Cancelar</button>
            <button type="submit" class="btn-primary-submit" :disabled="loadingAccion || !formularioValido">
              <span v-if="loadingAccion" class="btn-spinner"></span>
              <span v-else>{{ sesiones.length > 1 ? `Registrar ${sesiones.length} Citas` : 'Registrar Cita' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-cita {
  max-width: 580px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--gray-100);
}

.form-section:last-of-type {
  border-bottom: none;
}

.section-label {
  margin: 0;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--navy);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.req {
  color: #ef4444;
}

/* Selector de tipo de usuario */
.tipo-usuario-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tipo-btn {
  flex: 1;
  min-width: 120px;
  padding: 9px 14px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--gray-200);
  background: var(--gray-50);
  color: var(--gray-500);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
  text-align: center;
}

.tipo-btn:hover {
  border-color: var(--blue);
  color: var(--navy);
}

.tipo-btn.active {
  border-color: var(--navy);
  background: color-mix(in srgb, var(--navy) 8%, white);
  color: var(--navy);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--navy) 12%, transparent);
}

/* Campo de búsqueda con spinner */
.search-input {
  width: 100%;
  box-sizing: border-box;
}

.search-spinner {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
}

/* Chip de paciente seleccionado */
.paciente-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--blue);
  background: color-mix(in srgb, var(--blue) 8%, white);
}

.chip-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chip-nombre {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--navy);
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

/* Dropdown de resultados */
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
  max-height: 220px;
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
  margin: 2px 0 0;
}

.field-hint.warn {
  color: #b45309;
}

/* Contador de caracteres */
.char-count {
  font-size: 11px;
  color: var(--gray-500);
  text-align: right;
  margin-top: 2px;
}

/* Transición */
.slide-input-enter-active,
.slide-input-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}

.slide-input-enter-from,
.slide-input-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 480px) {
  .tipo-usuario-grid {
    flex-direction: column;
  }
}
</style>