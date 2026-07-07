/**
 * useCitas.js — Sistema Tópico Universitario
 *
 * Reescrito desde cero para la nueva BD:
 * - Tabla central: "cita" (no "Sesion")
 * - Sin Tratamiento, Paquete, estado_pago ni lógica de saldo
 * - Sin domingo en horarios (dia_semana 1-6)
 * - Búsqueda de paciente bifurcada:
 *     estudiante  → codigo_universitario (tabla paciente)
 *     docente / administrativo → numero_documento (tabla persona via JOIN)
 * - Rol operativo: enfermera (reemplaza a secretaria)
 * - idservicio es NOT NULL en cita → siempre obligatorio
 *
 * ESTADOS: pendiente | confirmada | en_triaje | en_consulta | completada | cancelada | ausente
 */

import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// ─── Constantes de negocio ────────────────────────────────────────────────────

export const TIPOS_USUARIO = [
  { id: 'estudiante',      label: 'Estudiante',      campoBusqueda: 'codigo_universitario' },
  { id: 'docente',         label: 'Docente',          campoBusqueda: 'numero_documento' },
  { id: 'administrativo',  label: 'Administrativo',   campoBusqueda: 'numero_documento' },
]

export const ESTADOS_CITA = {
  pendiente:    { label: 'Pendiente',    color: '#f59e0b', bg: '#fef3c7' },
  confirmada:   { label: 'Confirmada',   color: '#10b981', bg: '#d1fae5' },
  en_triaje:    { label: 'En triaje',    color: '#6366f1', bg: '#ede9fe' },
  en_consulta:  { label: 'En consulta',  color: '#0ea5e9', bg: '#e0f2fe' },
  completada:   { label: 'Completada',   color: '#3b82f6', bg: '#dbeafe' },
  cancelada:    { label: 'Cancelada',    color: '#ef4444', bg: '#fee2e2' },
  ausente:      { label: 'Ausente',      color: '#6b7280', bg: '#f3f4f6' },
}

// ─── Composable ───────────────────────────────────────────────────────────────
export function useCitas() {
  const { showAlert } = useAlert()

  // ── Estado ──────────────────────────────────────────────────────────────────
  const citas         = ref([])
  const fisios        = ref([])
  const servicios     = ref([])   // catálogo de servicio_topico
  const horarios      = ref([])
  const loading       = ref(false)
  const loadingAccion = ref(false)

  const userRole = ref(null)
  const userId   = ref(null)

  // ── Computed de rol ─────────────────────────────────────────────────────────
  const esEnfermera      = computed(() => userRole.value === 'enfermera')
  const esFisioterapeuta = computed(() => userRole.value === 'fisioterapeuta')
  const esPaciente       = computed(() => userRole.value === 'paciente')
  const esAdmin          = computed(() => userRole.value === 'admin')
  const esPersonalSalud  = computed(() => esEnfermera.value || esFisioterapeuta.value)
  const puedeGestionar   = computed(() => esEnfermera.value || esAdmin.value)

  // ── initUser ────────────────────────────────────────────────────────────────
  const initUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No hay sesión de usuario activa')
    userRole.value = user.user_metadata?.rol || 'paciente'
    userId.value   = user.id
  }

  // ── fetchCitas ──────────────────────────────────────────────────────────────
  const fetchCitas = async (filtros = {}) => {
    if (!userId.value) await initUser()

    loading.value = true
    try {
      let query = supabase
        .from('cita')
        .select(`
          idcita,
          fecha_hora,
          estado,
          motivo_consulta,
          paciente_en_sala,
          idpaciente,
          idfisioterapeuta,
          idservicio,
          servicio_topico ( nombre_servicio, duracion_estimada_minutos ),
          paciente (
            idpaciente,
            codigo_universitario,
            tipo_usuario,
            facultad_escuela,
            persona ( nombres, apellidos, celular, numero_documento )
          ),
          fisioterapeuta (
            idfisioterapeuta,
            especialidad,
            persona ( nombres, apellidos )
          )
        `)

      // Filtro por rol
      if (esPaciente.value)       query = query.eq('idpaciente', userId.value)
      if (esFisioterapeuta.value) query = query.eq('idfisioterapeuta', userId.value)

      // Filtros opcionales
      if (filtros.fecha) {
        const inicio = `${filtros.fecha}T00:00:00-05:00`
        const fin    = `${filtros.fecha}T23:59:59-05:00`
        query = query.gte('fecha_hora', inicio).lte('fecha_hora', fin)
      }
      if (filtros.rangoInicio && filtros.rangoFin) {
        query = query.gte('fecha_hora', filtros.rangoInicio).lte('fecha_hora', filtros.rangoFin)
      }
      if (filtros.estado)           query = query.eq('estado', filtros.estado)
      if (filtros.idfisioterapeuta) query = query.eq('idfisioterapeuta', filtros.idfisioterapeuta)

      const { data, error } = await query.order('fecha_hora', { ascending: true })
      if (error) throw error
      citas.value = data ?? []
    } catch (err) {
      showAlert('Error al cargar citas: ' + err.message, 'error')
    } finally {
      loading.value = false
    }
  }

  // ── Búsqueda dinámica de paciente por código universitario ──────────────────
  // Retorna array de coincidencias mientras el usuario escribe
  const buscarPacientePorCodigo = async (codigoParcial) => {
    if (!codigoParcial || codigoParcial.length < 3) return []
    try {
      const { data, error } = await supabase
        .from('paciente')
        .select(`
          idpaciente,
          codigo_universitario,
          tipo_usuario,
          facultad_escuela,
          persona ( nombres, apellidos, celular )
        `)
        .eq('tipo_usuario', 'estudiante')
        .ilike('codigo_universitario', `%${codigoParcial}%`)
        .limit(10)

      if (error) throw error
      return data ?? []
    } catch (err) {
      showAlert('Error en búsqueda: ' + err.message, 'error')
      return []
    }
  }

  // ── Búsqueda dinámica de paciente por DNI (docente / administrativo) ────────
  const buscarPacientePorDNI = async (dniParcial, tipoUsuario) => {
    if (!dniParcial || dniParcial.length < 4) return []
    try {
      // Join inverso: persona → paciente, filtrando por numero_documento
      const { data, error } = await supabase
        .from('paciente')
        .select(`
          idpaciente,
          codigo_universitario,
          tipo_usuario,
          facultad_escuela,
          persona!inner ( idpersona, nombres, apellidos, celular, numero_documento )
        `)
        .eq('tipo_usuario', tipoUsuario)
        .ilike('persona.numero_documento', `%${dniParcial}%`)
        .limit(10)

      if (error) throw error
      return data ?? []
    } catch (err) {
      showAlert('Error en búsqueda: ' + err.message, 'error')
      return []
    }
  }

  // ── fetchFisios ─────────────────────────────────────────────────────────────
  const fetchFisios = async () => {
    const { data, error } = await supabase
      .from('fisioterapeuta')
      .select(`
        idfisioterapeuta,
        especialidad,
        persona ( nombres, apellidos )
      `)
      .eq('activo', true)
      .order('idfisioterapeuta')

    if (error) { showAlert('Error al cargar fisioterapeutas: ' + error.message, 'error'); return }
    fisios.value = data ?? []
  }

  // ── fetchServicios ──────────────────────────────────────────────────────────
  // Carga el catálogo de servicio_topico (reemplaza al tarifario anterior)
  const fetchServicios = async () => {
    const { data, error } = await supabase
      .from('servicio_topico')
      .select('idservicio, nombre_servicio, descripcion, duracion_estimada_minutos')
      .eq('activo', true)
      .order('nombre_servicio')

    if (error) { showAlert('Error al cargar servicios: ' + error.message, 'error'); return }
    servicios.value = data ?? []
  }

  // ── fetchHorarioFisio ───────────────────────────────────────────────────────
  const fetchHorarioFisio = async (idfisioterapeuta) => {
    if (!idfisioterapeuta) { horarios.value = []; return }
    const { data, error } = await supabase
      .from('horario')
      .select('dia_semana, hora_inicio, hora_fin')
      .eq('idfisioterapeuta', idfisioterapeuta)

    if (error) { showAlert('Error al cargar horario: ' + error.message, 'error'); return }
    horarios.value = data ?? []
  }

  // ── obtenerSlotsDisponibles ─────────────────────────────────────────────────
  // dia_semana 1=Lunes … 6=Sábado (NO hay domingo en esta BD)
  const obtenerSlotsDisponibles = async (idfisioterapeuta, fechaStr, duracionMinutos) => {
    if (!idfisioterapeuta || !fechaStr) return []

    const [yyyy, mm, dd] = fechaStr.split('-')
    const fechaLocal = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
    let diaSemana = fechaLocal.getDay() // 0=Dom, 1=Lun … 6=Sáb

    // El horario solo cubre lunes-sábado (1-6). Si es domingo retornamos vacío.
    if (diaSemana === 0) return []

    const { data: bloques } = await supabase
      .from('horario')
      .select('hora_inicio, hora_fin')
      .eq('idfisioterapeuta', idfisioterapeuta)
      .eq('dia_semana', diaSemana)

    if (!bloques?.length) return []

    // Citas que ya ocupan ese día (excluimos canceladas y ausentes)
    const inicioDia = `${yyyy}-${mm}-${dd}T00:00:00-05:00`
    const finDia    = `${yyyy}-${mm}-${dd}T23:59:59-05:00`

    const { data: citasDia } = await supabase
      .from('cita')
      .select('fecha_hora, idservicio, servicio_topico ( duracion_estimada_minutos )')
      .eq('idfisioterapeuta', idfisioterapeuta)
      .gte('fecha_hora', inicioDia)
      .lte('fecha_hora', finDia)
      .not('estado', 'in', '(cancelada,ausente)')

    const ocupados = (citasDia ?? []).map(c => {
      const fc = new Date(c.fecha_hora)
      const ini = fc.getHours() * 60 + fc.getMinutes()
      const dur = c.servicio_topico?.duracion_estimada_minutos ?? 20
      return { inicio: ini, fin: ini + dur }
    })

    const parseTime  = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const formatTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

    const slots = []
    for (const bloque of bloques) {
      let actual = parseTime(bloque.hora_inicio)
      const fin  = parseTime(bloque.hora_fin)

      while (actual + duracionMinutos <= fin) {
        const finActual = actual + duracionMinutos
        const choque = ocupados.find(o => actual < o.fin && finActual > o.inicio)
        if (!choque) {
          slots.push(formatTime(actual))
          actual += duracionMinutos
        } else {
          actual = choque.fin
        }
      }
    }
    return slots
  }

  // ── crearCita ───────────────────────────────────────────────────────────────
  const crearCita = async (payload) => {
    const {
      idpaciente,
      idfisioterapeuta,
      idservicio,
      fecha_hora,
      motivo_consulta = null,
    } = payload

    if (!idpaciente)       { showAlert('Debe seleccionar un paciente.', 'error');       return false }
    if (!idfisioterapeuta) { showAlert('Debe seleccionar un fisioterapeuta.', 'error'); return false }
    if (!fecha_hora)       { showAlert('Debe seleccionar fecha y hora.', 'error');       return false }

    // Verificar disponibilidad antes de insertar
    const duracion = 30
    const ocupado = await verificarDisponibilidad(idfisioterapeuta, fecha_hora, duracion)
    if (ocupado) {
      showAlert('Ese horario ya está ocupado para el fisioterapeuta seleccionado.', 'error')
      return false
    }

    loadingAccion.value = true
    try {
      const { data, error } = await supabase
        .from('cita')
        .insert({
          idpaciente,
          idfisioterapeuta,
          fecha_hora,
          motivo_consulta: motivo_consulta?.trim() || null,
          estado: 'pendiente',
        })
        .select()
        .single()

      if (error) throw error
      showAlert('✅ Cita registrada exitosamente.', 'success')
      return data

    } catch (err) {
      showAlert('Error al registrar la cita: ' + err.message, 'error')
      return false
    } finally {
      loadingAccion.value = false
    }
  }

  // ── registrarCheckIn ────────────────────────────────────────────────────────
  const registrarCheckIn = async (cita) => {
    if (!cita?.idcita) { showAlert('Cita inválida.', 'error'); return false }
    loadingAccion.value = true
    try {
      const { error } = await supabase
        .from('cita')
        .update({ paciente_en_sala: true, estado: 'en_triaje' })
        .eq('idcita', cita.idcita)
        .eq('estado', 'confirmada')  // solo se puede hacer check-in si está confirmada

      if (error) throw error
      Object.assign(cita, { paciente_en_sala: true, estado: 'en_triaje' })
      showAlert('✅ Paciente registrado en tópico.', 'success')
      return true
    } catch (err) {
      showAlert('Error al registrar check-in: ' + err.message, 'error')
      return false
    } finally {
      loadingAccion.value = false
    }
  }

  // ── confirmarCita ───────────────────────────────────────────────────────────
  // Cambia de 'pendiente' → 'confirmada' (confirmación telefónica / presencial)
  const confirmarCita = async (idcita) => {
    loadingAccion.value = true
    try {
      const { error } = await supabase
        .from('cita')
        .update({ estado: 'confirmada' })
        .eq('idcita', idcita)
        .eq('estado', 'pendiente')

      if (error) throw error
      showAlert('✅ Cita confirmada.', 'success')
      return true
    } catch (err) {
      showAlert('Error al confirmar la cita: ' + err.message, 'error')
      return false
    } finally {
      loadingAccion.value = false
    }
  }

  // ── cancelarCita ────────────────────────────────────────────────────────────
  const cancelarCita = async ({ idcita, motivo }) => {
    if (!motivo?.trim()) { showAlert('Ingrese el motivo de cancelación.', 'error'); return false }
    loadingAccion.value = true
    try {
      const { error } = await supabase
        .from('cita')
        .update({ estado: 'cancelada', motivo_consulta: motivo.trim() })
        .eq('idcita', idcita)
        .in('estado', ['pendiente', 'confirmada'])

      if (error) throw error
      showAlert('Cita cancelada.', 'info')
      return true
    } catch (err) {
      showAlert('Error al cancelar: ' + err.message, 'error')
      return false
    } finally {
      loadingAccion.value = false
    }
  }

  // ── marcarAusente ───────────────────────────────────────────────────────────
  const marcarAusente = async (idcita) => {
    loadingAccion.value = true
    try {
      const { error } = await supabase
        .from('cita')
        .update({ estado: 'ausente' })
        .eq('idcita', idcita)
        .in('estado', ['confirmada', 'pendiente'])

      if (error) throw error
      showAlert('Inasistencia registrada.', 'info')
      return true
    } catch (err) {
      showAlert('Error: ' + err.message, 'error')
      return false
    } finally {
      loadingAccion.value = false
    }
  }

  // ── verificarDisponibilidad ─────────────────────────────────────────────────
  const verificarDisponibilidad = async (idfisioterapeuta, fecha_hora, duracionMinutos = 20) => {
    const fecha = new Date(fecha_hora)
    const fin   = new Date(fecha.getTime() + duracionMinutos * 60 * 1000)

    const { data } = await supabase
      .from('cita')
      .select('idcita')
      .eq('idfisioterapeuta', idfisioterapeuta)
      .not('estado', 'in', '(cancelada,ausente)')
      .gte('fecha_hora', fecha.toISOString())
      .lt('fecha_hora', fin.toISOString())
      .limit(1)

    return (data?.length ?? 0) > 0
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatFechaHora = (iso) => {
    if (!iso) return '—'
    return new Intl.DateTimeFormat('es-PE', {
      weekday: 'short', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: true, timeZone: 'America/Lima',
    }).format(new Date(iso))
  }

  const getEstadoInfo = (estado) =>
    ESTADOS_CITA[estado] ?? { label: estado, color: '#64748b', bg: '#f1f5f9' }

  const nombreCompleto = (persona) => {
    if (!persona) return '—'
    return `${persona.nombres ?? ''} ${persona.apellidos ?? ''}`.trim()
  }

  // Nombre plano desde la estructura de JOIN de fetchCitas
  const nombrePacienteFlat = (cita) =>
    `${cita?.paciente?.persona?.nombres ?? ''} ${cita?.paciente?.persona?.apellidos ?? ''}`.trim() || '—'

  const nombreFisioFlat = (cita) =>
    `${cita?.fisioterapeuta?.persona?.nombres ?? ''} ${cita?.fisioterapeuta?.persona?.apellidos ?? ''}`.trim() || '—'

  return {
    // Estado
    citas, fisios, servicios, horarios,
    loading, loadingAccion, userRole, userId,
    // Computed de rol
    esEnfermera, esFisioterapeuta, esPaciente, esAdmin, esPersonalSalud, puedeGestionar,
    // Acciones
    initUser,
    fetchCitas, fetchFisios, fetchServicios, fetchHorarioFisio,
    buscarPacientePorCodigo, buscarPacientePorDNI,
    obtenerSlotsDisponibles,
    crearCita, confirmarCita, registrarCheckIn,
    cancelarCita, marcarAusente,
    // Helpers
    formatFechaHora, getEstadoInfo, nombreCompleto,
    nombrePacienteFlat, nombreFisioFlat,
  }
}