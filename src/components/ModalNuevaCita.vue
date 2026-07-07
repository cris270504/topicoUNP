<script setup>
import { ref, computed, watch } from 'vue'
import { TIPOS_USUARIO } from '@/composables/useCitas'
import { getTodayISO } from '@/lib/dateUtils'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  fisios: { type: Array, default: () => [] },
  pacientes: { type: Array, default: () => [] },
  paquetes: { type: Array, default: () => [] },
  servicios: { type: Array, default: () => [] },
  loadingAccion: { type: Boolean, default: false },
  saldoPaciente: { type: Object, default: null },
  obtenerSlots: { type: Function, required: true },
  onBuscarPorCodigo: { type: Function, required: true },
  onBuscarPorDNI: { type: Function, required: true },
  onFetchSaldoPaciente: { type: Function, required: false },
  onFetchEvaluaciones: { type: Function, required: false },
  tratamientoARecargar: { type: Object, default: null },
})

const emit = defineEmits(['close', 'submit', 'fisio-changed', 'reset-saldo'])

// ── Campos del formulario ────────────────────────────────────────────────────
const tipoBusqueda = ref(null)
const terminoBusqueda = ref('')
const resultadosBusqueda = ref([])
const buscando = ref(false)
const pacienteSeleccionado = ref(null)

const idFisioterapeuta = ref(null)
const idservicio = ref(null)
const motivoConsulta = ref('')

// ── Lógica Dinámica de Múltiples Sesiones ────────────────────────────────────
const cantidadSesiones = ref(1)

// Estructura dinámica para N sesiones: [{ fecha: '', hora: '', slots: [], loading: false }]
const sesiones = ref([
  { fecha: '', hora: '', slots: [], loading: false }
])

const fechaMin = computed(() => getTodayISO())

// Detectamos si el servicio seleccionado es fisioterapia (ignorando mayúsculas)
const esSesionFisioterapia = computed(() => {
  if (!idservicio.value) return false
  const serv = props.servicios.find(s => (s.idservicio || s.idservicio) === idservicio.value)
  if (!serv) return false
  
  const nombreNormalizado = (serv.nombre_servicio || serv.nombre || '').toLowerCase()
  return nombreNormalizado.includes('fisioterapia') || nombreNormalizado.includes('sesion')
})

// Ajusta el array de sesiones según la cantidad ingresada
watch(cantidadSesiones, (nuevaCantidad) => {
  const cant = Math.max(1, Math.min(20, nuevaCantidad || 1)) // Límite de seguridad
  const diff = cant - sesiones.value.length

  if (diff > 0) {
    // Agregar nuevas filas
    for (let i = 0; i < diff; i++) {
      sesiones.value.push({ fecha: '', hora: '', slots: [], loading: false })
    }
  } else if (diff < 0) {
    // Eliminar filas excedentes
    sesiones.value.splice(cant)
  }
})

// Si cambia el servicio y ya NO es fisioterapia, reseteamos a 1 sola sesión
watch(esSesionFisioterapia, (esFisio) => {
  if (!esFisio) cantidadSesiones.value = 1
})

// Duración del servicio seleccionado
const duracionServicio = computed(() => {
  if (!idservicio.value) return 20
  return props.servicios.find(s => (s.idservicio || s.idservicio) === idservicio.value)?.duracion_estimada_minutos ?? 20
})

// ── Búsqueda de Horarios (Slots) por Fila ────────────────────────────────────

// Función auxiliar para saber si una fecha es domingo
const isDomingo = (fechaString) => {
  if (!fechaString) return false
  const [y, m, d] = fechaString.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).getDay() === 0
}

// Obtener slots independientes para una fila específica
const fetchSlotsForRow = async (index) => {
  const row = sesiones.value[index]
  
  if (!idFisioterapeuta.value || !row.fecha || isDomingo(row.fecha)) {
    row.slots = []
    row.hora = ''
    return
  }

  row.loading = true
  try {
    row.slots = await props.obtenerSlots(idFisioterapeuta.value, row.fecha, duracionServicio.value)
  } finally {
    row.loading = false
  }
}

// Filtra slots pasados si la fecha de la fila es "hoy"
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

// Si cambia el fisioterapeuta, recargamos los slots de todas las fechas ingresadas
watch(idFisioterapeuta, (val) => {
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
  const nombre = `${p.persona?.nombres ?? ''} ${p.persona?.apellidos ?? ''}`.trim()
  terminoBusqueda.value = nombre
}

const limpiarPaciente = () => {
  pacienteSeleccionado.value = null
  terminoBusqueda.value = ''
  resultadosBusqueda.value = []
}

// Auto-selecciona el primer servicio
watch(() => props.servicios, (lista) => {
  if (lista?.length && !idservicio.value) {
    idservicio.value = lista[0].idservicio || lista[0].idservicio
  }
}, { immediate: true })


// ── Reseteo del formulario ───────────────────────────────────────────────────
watch(() => props.isOpen, (abierto) => {
  if (abierto) resetForm()
})

const resetForm = () => {
  tipoBusqueda.value = null
  terminoBusqueda.value = ''
  resultadosBusqueda.value = []
  pacienteSeleccionado.value = null
  idFisioterapeuta.value = null
  idservicio.value = props.servicios?.[0]?.idservicio || props.servicios?.[0]?.idservicio || null
  motivoConsulta.value = ''
  
  // Resetear la lógica de sesiones
  cantidadSesiones.value = 1
  sesiones.value = [{ fecha: '', hora: '', slots: [], loading: false }]
}

// ── Envío ────────────────────────────────────────────────────────────────────
const handleSubmit = () => {
  if (!pacienteSeleccionado.value || !formularioValido.value) return

  // Creamos un array con todas las citas configuradas en las filas
  const payloadCitas = sesiones.value.map(sesion => ({
    idpaciente: pacienteSeleccionado.value.idpaciente ?? pacienteSeleccionado.value.idPaciente,
    idfisioterapeuta: idFisioterapeuta.value,
    idservicio: idservicio.value,
    fecha_hora: `${sesion.fecha}T${sesion.hora}:00-05:00`,
    motivo_consulta: motivoConsulta.value || null,
  }))

  // Emitimos un ARRAY de citas. El componente padre deberá procesarlas iterativamente.
  emit('submit', payloadCitas)
}

// ── Helpers de display ───────────────────────────────────────────────────────
const labelBusqueda = computed(() => tipoBusqueda.value === 'estudiante' ? 'Código universitario' : 'Número de DNI')
const placeholderBusqueda = computed(() => tipoBusqueda.value === 'estudiante' ? 'Ej: 20201234A' : 'Ej: 12345678')

const nombreFisio = (f) => {
  if (!f) return ''
  const persona = f.persona ?? f.Persona ?? {}
  return `${persona?.nombres ?? ''} ${persona?.apellidos ?? ''}`.trim() + 
         (f.especialidad ? ` — ${f.especialidad}` : '')
}

const labelTipoBusqueda = (id) => TIPOS_USUARIO.find(t => t.id === id)?.label ?? id

const labelResultado = (p) => {
  const nombre = `${p.persona?.nombres ?? ''} ${p.persona?.apellidos ?? ''}`.trim()
  return tipoBusqueda.value === 'estudiante'
    ? { principal: nombre, secundario: `Cód: ${p.codigo_universitario} · ${p.facultad_escuela}` }
    : { principal: nombre, secundario: `DNI: ${p.persona?.numero_documento} · ${p.facultad_escuela}` }
}

// ── Validación del botón de envío ────────────────────────────────────────────
// El form es válido si el paciente y fisio están elegidos, y TODAS las filas tienen fecha, hora y no son domingo.
const formularioValido = computed(() => {
  if (!pacienteSeleccionado.value || !idFisioterapeuta.value) return false
  
  return sesiones.value.every(s => s.fecha && s.hora && !isDomingo(s.fecha))
})

watch(pacienteSeleccionado, (p) => {
  if (!p) return emit('reset-saldo')
  const id = p.idpaciente ?? p.idPaciente ?? p.id
  if (props.onFetchSaldoPaciente && id) props.onFetchSaldoPaciente(id)
  if (props.onFetchEvaluaciones && id) props.onFetchEvaluaciones(id)
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

          <!-- ── Sección 1: Paciente ─────────────────────────────────────── -->
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

          <!-- ── Sección 2: Servicio y Fisioterapeuta ───────────────────── -->
          <div class="form-section">
            <p class="section-label">2. Servicio y especialista</p>
            <div class="form-grid">

              <div class="input-group">
                <label>Servicio <span class="req">*</span></label>
                <select v-model="idservicio" required>
                  <option :value="null" disabled>— Seleccionar servicio —</option>
                  <option v-for="s in servicios" :key="s.idservicio || s.idservicio" :value="s.idservicio || s.idservicio">
                    {{ s.nombre_servicio || s.nombre }}
                  </option>
                </select>
              </div>
              
              <div class="input-group">
                <label>Fisioterapeuta <span class="req">*</span></label>
                <select v-model="idFisioterapeuta" required>
                  <option :value="null" disabled>— Seleccionar especialista —</option>
                  <option v-for="f in fisios" :key="f.idFisioterapeuta ?? f.idfisioterapeuta" :value="f.idFisioterapeuta ?? f.idfisioterapeuta">
                    {{ nombreFisio(f) }}
                  </option>
                </select>
              </div>

              <!-- Input dinámico de Cantidad (solo visible si es Fisioterapia) -->
              <div v-if="esSesionFisioterapia" class="input-group" style="grid-column: 1 / -1;">
                <label>Cantidad de sesiones <span class="req">*</span></label>
                <input type="number" v-model.number="cantidadSesiones" min="1" max="20" required />
                <p class="field-hint">Se configurarán los horarios individualmente por sesión.</p>
              </div>

            </div>
          </div>

          <!-- ── Sección 3: Fechas y Horarios (Dinámicos) ───────────────── -->
          <div class="form-section">
            <p class="section-label">3. Agenda de citas</p>
            
            <div v-for="(sesion, index) in sesiones" :key="index" class="sesion-row" style="margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px dashed #eee;">
              <h4 v-if="sesiones.length > 1" style="margin-bottom: 0.8rem; color: #555;">📍 Sesión {{ index + 1 }}</h4>
              
              <div class="form-grid">
                <div class="input-group">
                  <label>Fecha <span class="req">*</span></label>
                  <input type="date" v-model="sesion.fecha" :min="fechaMin" @change="fetchSlotsForRow(index)" required />
                  <p v-if="isDomingo(sesion.fecha)" class="field-hint warn">
                    ⚠️ El tópico no atiende los domingos.
                  </p>
                </div>

                <div class="input-group">
                  <label>Horario disponible <span class="req">*</span></label>
                  <select v-model="sesion.hora" required :disabled="!sesion.fecha || !idFisioterapeuta || sesion.loading || isDomingo(sesion.fecha)">
                    <option value="" disabled>
                      {{
                        sesion.loading ? 'Buscando turnos libres...' :
                        isDomingo(sesion.fecha) ? '❌ Día no disponible' :
                        !idFisioterapeuta ? '⚠️ Selecciona especialista' :
                        !sesion.fecha ? '⚠️ Selecciona una fecha' :
                        getSlotsFiltrados(index).length === 0 ? '❌ Sin turnos' :
                        '— Seleccionar hora —'
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

          <!-- ── Sección 4: Motivo ──────────────────────────────────────── -->
          <div class="form-section">
            <p class="section-label">4. Motivo de consulta (opcional)</p>
            <div class="input-group">
              <textarea v-model="motivoConsulta" rows="2" placeholder="Aplica para todas las sesiones..." maxlength="300"></textarea>
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