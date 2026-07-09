import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// ─── Constantes ───────────────────────────────────────────────────────────────

export const TIPOS_USUARIO = [
  { id: 'estudiante',     label: 'Estudiante',     campoBusqueda: 'codigo_universitario' },
  { id: 'docente',        label: 'Docente',         campoBusqueda: 'numero_documento' },
  { id: 'administrativo', label: 'Administrativo',  campoBusqueda: 'numero_documento' },
]

export const ESTADOS_CITA = {
  pendiente:   { label: 'Pendiente',   color: '#f59e0b', bg: '#fef3c7' },
  confirmada:  { label: 'Confirmada',  color: '#10b981', bg: '#d1fae5' },
  en_triaje:   { label: 'En triaje',   color: '#6366f1', bg: '#ede9fe' },
  en_consulta: { label: 'En Consulta', color: '#4f46e5', bg: '#e0e7ff' },
  completada:  { label: 'Atendida',    color: '#16a34a', bg: '#dcfce7' },
  cancelada:   { label: 'Cancelada',   color: '#dc2626', bg: '#fee2e2' },
  ausente:     { label: 'Ausente',     color: '#6b7280', bg: '#f3f4f6' },
}

// Transiciones válidas de estado (para accionesDe y avanzarEstado)
const TRANSICIONES_VALIDAS = {
  pendiente:   ['confirmada', 'cancelada', 'ausente'],
  confirmada:  ['en_triaje',  'cancelada', 'ausente'],
  en_triaje:   ['en_consulta'],
  en_consulta: ['completada'],
  completada:  [],
  cancelada:   [],
  ausente:     [],
}

// ─── Composable ───────────────────────────────────────────────────────────────
export function useCitas() {
  const { showAlert } = useAlert()

  const citas         = ref([])
  const fisios        = ref([])
  const servicios     = ref([])
  const horarios      = ref([])
  const loading       = ref(false)
  const loadingAccion = ref(false)

  const userRole = ref(null)
  const userId   = ref(null)

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
          motivo_reserva,
          motivo_cancelacion,
          paciente_en_sala,
          idpaciente,
          idfisioterapeuta,
          idservicio,
          presion_arterial,
          peso_kg,
          talla_cm,
          temperatura_c,
          frecuencia_cardiaca,
          saturacion_oxigeno,
          sintomas,
          diagnostico_descripcion,
          tratamiento_recetado,
          cantidad_sesiones_recomendadas,
          frecuencia_sesiones_recomendadas,
          servicio_topico ( idservicio, nombre_servicio, duracion_estimada_minutos ),
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

      if (esPaciente.value)       query = query.eq('idpaciente', userId.value)
      if (esFisioterapeuta.value) query = query.eq('idfisioterapeuta', userId.value)

      if (filtros.fecha) {
        query = query
          .gte('fecha_hora', `${filtros.fecha}T00:00:00-05:00`)
          .lte('fecha_hora', `${filtros.fecha}T23:59:59-05:00`)
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

  // ── Búsqueda de pacientes ───────────────────────────────────────────────────
  const buscarPacientePorCodigo = async (codigoParcial) => {
    if (!codigoParcial || codigoParcial.length < 3) return []
    try {
      const { data, error } = await supabase
        .from('paciente')
        .select(`
          idpaciente, codigo_universitario, tipo_usuario, facultad_escuela,
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

  const buscarPacientePorDNI = async (dniParcial, tipoUsuario) => {
    if (!dniParcial || dniParcial.length < 4) return []
    try {
      const { data, error } = await supabase
        .from('paciente')
        .select(`
          idpaciente, codigo_universitario, tipo_usuario, facultad_escuela,
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
      .select(`idfisioterapeuta, especialidad, persona ( nombres, apellidos )`)
      .eq('activo', true)
      .order('idfisioterapeuta')
    if (error) { showAlert('Error al cargar fisioterapeutas: ' + error.message, 'error'); return }
    fisios.value = data ?? []
  }

  // ── fetchServicios ──────────────────────────────────────────────────────────
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
  const obtenerSlotsDisponibles = async (idfisioterapeuta, fechaStr, duracionMinutos) => {
    if (!idfisioterapeuta || !fechaStr) return []

    const [yyyy, mm, dd] = fechaStr.split('-')
    const diaSemana = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getDay()
    if (diaSemana === 0) return [] // Sin domingo

    const { data: bloques, error: errBloques } = await supabase
      .from('horario')
      .select('hora_inicio, hora_fin')
      .eq('idfisioterapeuta', idfisioterapeuta)
      .eq('dia_semana', diaSemana)

    console.log(`[DEBUG] Buscando horario para fisio ${idfisioterapeuta}, dia ${diaSemana}`);
    console.log(`[DEBUG] Respuesta DB (bloques):`, bloques, errBloques);

    if (!bloques?.length) return []

    const { data: citasDia } = await supabase
      .from('cita')
      .select('fecha_hora, servicio_topico ( duracion_estimada_minutos )')
      .eq('idfisioterapeuta', idfisioterapeuta)
      .gte('fecha_hora', `${yyyy}-${mm}-${dd}T00:00:00-05:00`)
      .lte('fecha_hora', `${yyyy}-${mm}-${dd}T23:59:59-05:00`)
      .not('estado', 'in', '(cancelada,ausente)')

    const ocupados = (citasDia ?? []).map(c => {
      const fc  = new Date(c.fecha_hora)
      const ini = fc.getHours() * 60 + fc.getMinutes()
      const dur = c.servicio_topico?.duracion_estimada_minutos ?? 20
      return { inicio: ini, fin: ini + dur }
    })

    const parseTime  = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const formatTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

    const slots = []
    const duracion = Number(duracionMinutos) || 20

    for (const bloque of bloques) {
      let actual = parseTime(bloque.hora_inicio)
      const finBloque = parseTime(bloque.hora_fin)
      while (actual + duracion <= finBloque) {
        const finActual = actual + duracion
        const choque = ocupados.find(o => actual < o.fin && finActual > o.inicio)
        if (!choque) { slots.push(formatTime(actual)); actual += duracion }
        else actual = choque.fin
      }
    }
    console.log(`[DEBUG] Slots generados:`, slots);
    return slots
  }

  // ── crearCita ───────────────────────────────────────────────────────────────
  // [E1] CORREGIDO: idservicio ahora se incluye en el INSERT
  const crearCita = async (payload) => {
    const { idpaciente, idfisioterapeuta, idservicio, fecha_hora, motivo_reserva = null } = payload

    if (!idpaciente)       { showAlert('Debe seleccionar un paciente.', 'error');       return false }
    if (!idfisioterapeuta) { showAlert('Debe seleccionar un fisioterapeuta.', 'error'); return false }
    if (!idservicio)       { showAlert('Debe seleccionar un servicio.', 'error');       return false }
    if (!fecha_hora)       { showAlert('Debe seleccionar fecha y hora.', 'error');      return false }

    const duracion = servicios.value.find(s => s.idservicio === idservicio)?.duracion_estimada_minutos ?? 20
    if (await verificarDisponibilidad(idfisioterapeuta, fecha_hora, duracion)) {
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
          idservicio,
          fecha_hora,
          motivo_reserva: motivo_reserva?.trim() || null,
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

  // ── confirmarCita ───────────────────────────────────────────────────────────
  const confirmarCita = async (idcita) => {
    loadingAccion.value = true
    try {
      const { error } = await supabase
        .from('cita').update({ estado: 'confirmada' })
        .eq('idcita', idcita).eq('estado', 'pendiente')
      if (error) throw error
      showAlert('✅ Cita confirmada.', 'success')
      return true
    } catch (err) {
      showAlert('Error al confirmar: ' + err.message, 'error')
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
        .from('cita').update({ paciente_en_sala: true, estado: 'en_triaje' })
        .eq('idcita', cita.idcita).eq('estado', 'confirmada')
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

  // ── avanzarEstado ───────────────────────────────────────────────────────────
  // [UX5] NUEVO: en_triaje → en_consulta → completada
  const avanzarEstado = async (cita) => {
    const siguientes = TRANSICIONES_VALIDAS[cita?.estado] ?? []
    const siguiente  = siguientes[0] // primera transición válida
    if (!siguiente) { showAlert('No hay transición disponible desde este estado.', 'error'); return false }

    loadingAccion.value = true
    try {
      const { error } = await supabase
        .from('cita').update({ estado: siguiente })
        .eq('idcita', cita.idcita)
      if (error) throw error
      Object.assign(cita, { estado: siguiente })
      showAlert(`✅ Estado actualizado a: ${ESTADOS_CITA[siguiente]?.label}.`, 'success')
      return true
    } catch (err) {
      showAlert('Error al avanzar estado: ' + err.message, 'error')
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

  // ── reprogramarCita ──────────────────────────────────────────────────────────
  const reprogramarCita = async ({ idcita, idfisioterapeuta, nueva_fecha_hora, motivo_reprogramacion }) => {
    if (!idcita || !nueva_fecha_hora) {
      showAlert('Faltan datos para reprogramar la cita.', 'error')
      return false
    }

    loadingAccion.value = true
    try {
      const { error } = await supabase
        .from('cita')
        .update({
          idfisioterapeuta,
          fecha_hora: nueva_fecha_hora,
          estado: 'pendiente',
          motivo_consulta: motivo_reprogramacion ?? null
        })
        .eq('idcita', idcita)
        .in('estado', ['pendiente', 'confirmada'])

      if (error) throw error
      showAlert('✅ Cita reprogramada exitosamente.', 'success')
      return true
    } catch (err) {
      showAlert('Error al reprogramar: ' + err.message, 'error')
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
        .from('cita').update({ estado: 'ausente' })
        .eq('idcita', idcita).in('estado', ['confirmada', 'pendiente'])
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
    const inicio = new Date(fecha_hora)
    const fin    = new Date(inicio.getTime() + duracionMinutos * 60 * 1000)
    const { data } = await supabase
      .from('cita').select('idcita')
      .eq('idfisioterapeuta', idfisioterapeuta)
      .not('estado', 'in', '(cancelada,ausente)')
      .gte('fecha_hora', inicio.toISOString())
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

  // [E3] CORREGIDO: usa la estructura real del JOIN (cita.paciente.persona.*)
  const nombrePacienteFlat = (cita) =>
    nombreCompleto(cita?.paciente?.persona) || '—'

  const nombreFisioFlat = (cita) =>
    nombreCompleto(cita?.fisioterapeuta?.persona) || '—'

  // Acaba de leer el celular del paciente desde la estructura anidada correcta
  const celularPacienteFlat = (cita) =>
    cita?.paciente?.persona?.celular ?? '—'

  return {
    citas, fisios, servicios, horarios,
    loading, loadingAccion, userRole, userId,
    esEnfermera, esFisioterapeuta, esPaciente, esAdmin, esPersonalSalud, puedeGestionar,
    initUser,
    fetchCitas, fetchFisios, fetchServicios, fetchHorarioFisio,
    buscarPacientePorCodigo, buscarPacientePorDNI,
    obtenerSlotsDisponibles,
    crearCita, confirmarCita, registrarCheckIn, avanzarEstado,
    cancelarCita, marcarAusente, reprogramarCita,
    formatFechaHora, getEstadoInfo, nombreCompleto,
    nombrePacienteFlat, nombreFisioFlat, celularPacienteFlat,
    TRANSICIONES_VALIDAS,
  }
}