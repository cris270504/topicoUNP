<script setup>
/**
 * ModalNuevaCita.vue — Sistema Tópico Universitario
 *
 * CAMBIOS RESPECTO AL MODAL ANTERIOR:
 * - Sin modalidades de atención (se elimina esa sección completa)
 * - Sin lógica de paquetes, saldo, tratamientos ni sesiones múltiples
 * - Búsqueda de paciente bifurcada por tipo:
 *     estudiante         → escribe código universitario, BD busca en paciente.codigo_universitario
 *     docente/admin      → escribe DNI, BD busca en persona.numero_documento via JOIN
 * - Selector de tipo de usuario antes del campo de búsqueda
 * - idservicio es obligatorio (mapeado desde servicio_topico)
 * - Duración del slot viene del servicio seleccionado, no hardcodeada
 * - motivo_consulta como campo opcional pero expuesto
 * - dia_semana 1-6 (sin domingo)
 */
import { ref, computed, watch } from 'vue'
import { TIPOS_USUARIO } from '@/composables/useCitas'
import { getTodayISO } from '@/lib/dateUtils'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  fisios: { type: Array, default: () => [] },
  pacientes: { type: Array, default: () => [] },
  paquetes: { type: Array, default: () => [] },
  servicios: { type: Array, default: () => [] }, // catálogo de servicio_topico
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
const tipoBusqueda = ref(null)     // 'estudiante' | 'docente' | 'administrativo'
const terminoBusqueda = ref('')       // lo que escribe el usuario en el campo de búsqueda
const resultadosBusqueda = ref([])
const buscando = ref(false)
const pacienteSeleccionado = ref(null) // objeto completo del paciente elegido

const idFisioterapeuta = ref(null)
const idServicio = ref(null)
const fecha = ref('')
const hora = ref('')
const motivoConsulta = ref('')

// ── Computed ─────────────────────────────────────────────────────────────────
const fechaMin = computed(() => getTodayISO())

const labelBusqueda = computed(() => {
  if (!tipoBusqueda.value) return ''
  return tipoBusqueda.value === 'estudiante'
    ? 'Código universitario'
    : 'Número de DNI'
})

const placeholderBusqueda = computed(() => {
  if (!tipoBusqueda.value) return ''
  return tipoBusqueda.value === 'estudiante'
    ? 'Ej: 20201234A'
    : 'Ej: 12345678'
})

// Duración del servicio seleccionado (para calcular los slots correctamente)
const duracionServicio = computed(() => {
  if (!idServicio.value) return 20
  return props.servicios.find(s => s.idservicio === idServicio.value)?.duracion_estimada_minutos ?? 20
})

// ── Slots disponibles ────────────────────────────────────────────────────────
const slotsDisponibles = ref([])
const loadingSlots = ref(false)

// Filtra slots pasados si la fecha es hoy
const slotsFiltrados = computed(() => {
  if (loadingSlots.value || !slotsDisponibles.value.length) return slotsDisponibles.value

  const hoy = getTodayISO()
  if (fecha.value !== hoy) return slotsDisponibles.value

  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const hh = ahora.getHours()
  const mm = ahora.getMinutes()

  return slotsDisponibles.value.filter(slot => {
    const [h, m] = slot.split(':').map(Number)
    return h > hh || (h === hh && m > mm)
  })
})

// Recarga slots cuando cambia el fisio, la fecha o el servicio
watch([idFisioterapeuta, fecha, idServicio], async ([fisio, f, serv]) => {
  slotsDisponibles.value = []
  hora.value = ''
  if (!fisio || !f || !serv) return

  // Verificar que no sea domingo (JS: 0=Dom)
  const [y, m, d] = f.split('-')
  const diaSemana = new Date(Number(y), Number(m) - 1, Number(d)).getDay()
  if (diaSemana === 0) {
    slotsDisponibles.value = []
    return
  }

  loadingSlots.value = true
  try {
    slotsDisponibles.value = await props.obtenerSlots(fisio, f, duracionServicio.value)
  } finally {
    loadingSlots.value = false
  }
})

// ── Búsqueda dinámica ────────────────────────────────────────────────────────
// Timer de debounce para no disparar una query por cada tecla
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
  }, 350) // 350ms de debounce: balance entre responsividad y carga al servidor
}

// Al cambiar el tipo, resetea el campo de búsqueda para no mezclar datos
watch(tipoBusqueda, () => {
  terminoBusqueda.value = ''
  resultadosBusqueda.value = []
  pacienteSeleccionado.value = null
})

const seleccionarPaciente = (p) => {
  pacienteSeleccionado.value = p
  resultadosBusqueda.value = []
  // Muestra en el input el nombre del paciente una vez seleccionado
  const nombre = `${p.persona?.nombres ?? ''} ${p.persona?.apellidos ?? ''}`.trim()
  terminoBusqueda.value = nombre
}

const limpiarPaciente = () => {
  pacienteSeleccionado.value = null
  terminoBusqueda.value = ''
  resultadosBusqueda.value = []
}

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
  idServicio.value = null
  fecha.value = ''
  hora.value = ''
  motivoConsulta.value = ''
  slotsDisponibles.value = []
}

// ── Envío ────────────────────────────────────────────────────────────────────
const handleSubmit = () => {
  if (!pacienteSeleccionado.value) {
    return // el botón ya está disabled, pero como seguro extra
  }

  emit('submit', {
    idpaciente: pacienteSeleccionado.value.idpaciente,
    idfisioterapeuta: idFisioterapeuta.value,
    idservicio: idServicio.value,
    fecha_hora: `${fecha.value}T${hora.value}:00-05:00`,
    motivo_consulta: motivoConsulta.value || null,
  })
}

// ── Helpers de display ───────────────────────────────────────────────────────
const nombreFisio = (f) => {
  if (!f) return ''
  const persona = f.persona ?? f.Persona ?? {}
  const nombres = persona?.nombres ?? ''
  const apellidos = persona?.apellidos ?? ''
  const especialidad = f.especialidad ?? f.fisio_especialidad ?? ''
  return `${nombres} ${apellidos}`.trim() + (especialidad ? ` — ${especialidad}` : '')
}

const labelTipoBusqueda = (id) =>
  TIPOS_USUARIO.find(t => t.id === id)?.label ?? id

// Texto del label de resultado en la lista desplegable
const labelResultado = (p) => {
  const nombre = `${p.persona?.nombres ?? ''} ${p.persona?.apellidos ?? ''}`.trim()
  if (tipoBusqueda.value === 'estudiante') {
    return { principal: nombre, secundario: `Cód: ${p.codigo_universitario} · ${p.facultad_escuela}` }
  }
  return { principal: nombre, secundario: `DNI: ${p.persona?.numero_documento} · ${p.facultad_escuela}` }
}

// Determina si el día seleccionado es domingo (bloqueado)
const esDomingo = computed(() => {
  if (!fecha.value) return false
  const [y, m, d] = fecha.value.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).getDay() === 0
})

// ── Validación del botón de envío ────────────────────────────────────────────
const formularioValido = computed(() =>
  !!pacienteSeleccionado.value &&
  !!idFisioterapeuta.value &&
  !!idServicio.value &&
  !!fecha.value &&
  !!hora.value &&
  !esDomingo.value
)

// Cuando cambia el fisioterapeuta seleccionado, avisamos al padre
watch(idFisioterapeuta, (val) => {
  if (val) emit('fisio-changed', val)
})

// Cuando cambia el paciente seleccionado, pedimos saldo y avisamos para resetear saldo si quedó nulo
watch(pacienteSeleccionado, (p) => {
  if (!p) {
    emit('reset-saldo')
    return
  }

  const id = p.idpaciente ?? p.idPaciente ?? p.id
  if (props.onFetchSaldoPaciente && id) {
    try { props.onFetchSaldoPaciente(id) } catch (e) { /* noop */ }
  }
  if (props.onFetchEvaluaciones && id) {
    try { props.onFetchEvaluaciones(id) } catch (e) { /* noop */ }
  }
})

// Si el padre pre-configura `tratamientoARecargar`, aplicamos selección inicial
watch(() => props.tratamientoARecargar, (t) => {
  if (!t) return
  // puede venir con idPaciente / idpaciente y nombres
  if (t.idPaciente || t.idpaciente) {
    pacienteSeleccionado.value = { idpaciente: t.idPaciente ?? t.idpaciente, persona: { nombres: t.nombrePaciente ?? '', apellidos: '' } }
  }
  if (t.idFisioterapeuta || t.idFisioterapeuta === 0 || t.idfisioterapeuta) {
    idFisioterapeuta.value = t.idFisioterapeuta ?? t.idfisioterapeuta
  }
  // solicitar saldo si corresponde
  const id = t.idPaciente ?? t.idpaciente
  if (id && props.onFetchSaldoPaciente) props.onFetchSaldoPaciente(id)
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

            <!-- Paso 1-A: Tipo de usuario -->
            <div class="input-group">
              <label>Tipo de usuario <span class="req">*</span></label>
              <div class="tipo-usuario-grid">
                <button v-for="tipo in TIPOS_USUARIO" :key="tipo.id" type="button" class="tipo-btn"
                  :class="{ active: tipoBusqueda === tipo.id }" @click="tipoBusqueda = tipo.id">
                  {{ tipo.label }}
                </button>
              </div>
            </div>

            <!-- Paso 1-B: Campo de búsqueda (aparece cuando hay tipo seleccionado) -->
            <Transition name="slide-input">
              <div v-if="tipoBusqueda" class="input-group" style="position: relative;">
                <label>{{ labelBusqueda }} <span class="req">*</span></label>

                <!-- Si ya hay paciente seleccionado, mostramos chip y botón de limpiar -->
                <div v-if="pacienteSeleccionado" class="paciente-chip">
                  <div class="chip-info">
                    <span class="chip-nombre">
                      {{ pacienteSeleccionado.persona?.nombres }} {{ pacienteSeleccionado.persona?.apellidos }}
                    </span>
                    <span class="chip-detalle">
                      {{ labelTipoBusqueda(tipoBusqueda) }}
                      ·
                      {{ tipoBusqueda === 'estudiante'
                        ? pacienteSeleccionado.codigo_universitario
                        : pacienteSeleccionado.persona?.numero_documento }}
                      · {{ pacienteSeleccionado.facultad_escuela }}
                    </span>
                  </div>
                  <button type="button" class="chip-clear" @click="limpiarPaciente" title="Cambiar paciente">
                    &times;
                  </button>
                </div>

                <!-- Campo de búsqueda activo cuando no hay paciente seleccionado -->
                <template v-else>
                  <input type="text" class="search-input" :placeholder="placeholderBusqueda" :value="terminoBusqueda"
                    @input="onInputBusqueda($event.target.value)" autocomplete="off" />
                  <span v-if="buscando" class="search-spinner">⏳</span>
                  <p v-if="terminoBusqueda.length > 0 && terminoBusqueda.length < 3" class="field-hint">
                    Escribe al menos 3 caracteres para buscar.
                  </p>

                  <!-- Dropdown de resultados -->
                  <ul v-if="resultadosBusqueda.length > 0" class="options-list">
                    <li v-for="p in resultadosBusqueda" :key="p.idpaciente" @click="seleccionarPaciente(p)">
                      <div class="li-name">{{ labelResultado(p).principal }}</div>
                      <div class="li-sub">{{ labelResultado(p).secundario }}</div>
                    </li>
                  </ul>

                  <p v-else-if="!buscando && terminoBusqueda.length >= 3 && resultadosBusqueda.length === 0"
                    class="field-hint warn">
                    No se encontró ningún paciente con ese {{ labelBusqueda.toLowerCase() }}.
                  </p>
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
                <select v-model="idServicio" required>
                  <option :value="null" disabled>— Seleccionar servicio —</option>
                  <option v-for="s in servicios" :key="s.idservicio" :value="s.idservicio">
                    {{ s.nombre_servicio }}
                    ({{ s.duracion_estimada_minutos }} min)
                  </option>
                </select>
              </div>

              <div class="input-group">
                <label>Fisioterapeuta <span class="req">*</span></label>
                <select v-model="idFisioterapeuta" required>
                  <option :value="null" disabled>— Seleccionar especialista —</option>
                  <option v-for="f in fisios" :key="f.idFisioterapeuta ?? f.idfisioterapeuta"
                    :value="f.idFisioterapeuta ?? f.idfisioterapeuta">
                    {{ nombreFisio(f) }}
                  </option>
                </select>
              </div>

            </div>
          </div>

          <!-- ── Sección 3: Fecha y horario ─────────────────────────────── -->
          <div class="form-section">
            <p class="section-label">3. Fecha y horario</p>
            <div class="form-grid">

              <div class="input-group">
                <label>Fecha <span class="req">*</span></label>
                <input type="date" v-model="fecha" :min="fechaMin" required />
                <p v-if="esDomingo" class="field-hint warn">
                  ⚠️ El tópico no atiende los domingos. Selecciona otro día.
                </p>
              </div>

              <div class="input-group">
                <label>Horario disponible <span class="req">*</span></label>
                <select v-model="hora" required
                  :disabled="!fecha || !idFisioterapeuta || !idServicio || loadingSlots || esDomingo">
                  <option value="" disabled>
                    {{
                      loadingSlots ? 'Buscando turnos libres...' :
                        esDomingo ? '❌ Día no disponible' :
                          !idFisioterapeuta ? '⚠️ Selecciona un especialista primero' :
                            !idServicio ? '⚠️ Selecciona un servicio primero' :
                              !fecha ? '⚠️ Selecciona una fecha primero' :
                                slotsFiltrados.length === 0 ? '❌ Sin turnos disponibles ese día' :
                                  '— Seleccionar hora —'
                    }}
                  </option>
                  <option v-for="slot in slotsFiltrados" :key="slot" :value="slot">
                    {{ slot }}
                  </option>
                </select>
              </div>

            </div>
          </div>

          <!-- ── Sección 4: Motivo (opcional) ───────────────────────────── -->
          <div class="form-section">
            <p class="section-label">4. Motivo de consulta (opcional)</p>
            <div class="input-group">
              <textarea v-model="motivoConsulta" rows="2" placeholder="Describe brevemente el motivo de la visita..."
                maxlength="300"></textarea>
              <span class="char-count">{{ motivoConsulta.length }}/300</span>
            </div>
          </div>

          <!-- ── Acciones ───────────────────────────────────────────────── -->
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="loadingAccion">
              Cancelar
            </button>
            <button type="submit" class="btn-primary-submit" :disabled="loadingAccion || !formularioValido">
              <span v-if="loadingAccion" class="btn-spinner"></span>
              <span v-else>Registrar Cita</span>
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