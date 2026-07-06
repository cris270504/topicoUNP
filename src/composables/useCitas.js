import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// ─── Constantes de negocio (Adaptadas al Tópico) ──────────────
export const MODALIDADES = [
    {
        id: 'evaluacion_inicial',
        label: 'Evaluación Inicial',
        descripcion: 'Primera consulta y diagnóstico fisioterapéutico',
        icono: '🩺',
        color: '#0f766e'
    },
    {
        id: 'tratamiento',
        label: 'Tratamiento',
        descripcion: 'Ciclo de sesiones terapéuticas',
        icono: '🔗',
        color: '#2563eb'
    },
    {
        id: 'masaje',
        label: 'Masaje',
        descripcion: 'Sesión de masaje terapéutico',
        icono: '💆',
        color: '#7c3aed'
    }
]

export const ESTADOS_CITA = {
    pendiente: { label: 'Pendiente', color: '#f59e0b', bg: '#fef3c7' },
    confirmada: { label: 'Confirmada', color: '#10b981', bg: '#d1fae5' },
    en_triaje: { label: 'En Triaje', color: '#8b5cf6', bg: '#ede9fe' },
    en_consulta: { label: 'En Consulta', color: '#3b82f6', bg: '#dbeafe' },
    completada: { label: 'Completada', color: '#14b8a6', bg: '#ccfbf1' },
    cancelada: { label: 'Cancelada', color: '#ef4444', bg: '#fee2e2' },
    ausente: { label: 'Ausente', color: '#6b7280', bg: '#f3f4f6' },
}

const userRole = ref(null)
const userId = ref(null)

// ─── Composable ───────────────────────────────────────────────
export function useCitas() {
    const { showAlert } = useAlert()

    // ── Estado ──────────────────────────────────────────────────
    const citas = ref([])
    const personalSalud = ref([]) // Reemplaza a fisios
    const pacientes = ref([])
    const horarios = ref([])
    const servicios = ref([]) // Reemplaza a tarifario

    const loading = ref(false)
    const loadingAccion = ref(false)

    // ── Computed de rol ─────────────────────────────────────────
    const esPersonalSalud = computed(() => userRole.value === 'fisioterapeuta')
    const esSecretaria = computed(() => userRole.value === 'secretaria')
    const esPaciente = computed(() => userRole.value === 'paciente')
    const esAdmin = computed(() => userRole.value === 'admin')
    const puedeGestionar = computed(() => esSecretaria.value || esAdmin.value)

    // ── initUser ────────────────────────────────────────────────
    const initUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const rawRol = user.user_metadata?.rol || 'paciente'
            userRole.value = rawRol === 'personal_salud' ? 'fisioterapeuta' : rawRol
            userId.value = user.id
        } else {
            clearUser() // Limpia la memoria si no hay sesión
            throw new Error('No hay sesión de usuario activa')
        }
    }

    const clearUser = () => {
        userRole.value = null
        userId.value = null
    }

    // ── fetchCitas ──────────────────────────────────────────────
    const fetchCitas = async (filtros = {}) => {
        if (!userId.value) await initUser()

        if (!userId.value && (esPaciente.value || esPersonalSalud.value)) {
            showAlert('Error: Usuario no autenticado.', 'error')
            return
        }

        loading.value = true
        try {
            let query = supabase.from('cita')
                .select(`
                    idcita, fecha_hora, motivo_consulta, estado, paciente_en_sala, created_at,
                    servicio_topico ( idservicio, nombre_servicio, duracion_estimada_minutos ),
                    paciente ( idpaciente, codigo_universitario, tipo_usuario, persona ( nombres, apellidos, celular ) ),
                    personal_salud ( idpersonalsalud, especialidad, persona ( nombres, apellidos ) )
                `)

            // Filtros de seguridad por rol
            if (esPaciente.value && userId.value) {
                query = query.eq('idpaciente', userId.value)
            } else if (esPersonalSalud.value && userId.value) {
                query = query.eq('idpersonalsalud', userId.value)
            }

            // Filtros de búsqueda
            if (filtros.rangoInicio && filtros.rangoFin) {
                query = query.gte('fecha_hora', filtros.rangoInicio).lte('fecha_hora', filtros.rangoFin)
            } else if (filtros.fecha) {
                const inicio = `${filtros.fecha}T00:00:00-05:00`
                const fin = `${filtros.fecha}T23:59:59-05:00`
                query = query.gte('fecha_hora', inicio).lte('fecha_hora', fin)
            }

            if (filtros.estado) query = query.eq('estado', filtros.estado)
            if (filtros.idPersonalSalud) query = query.eq('idpersonalsalud', filtros.idPersonalSalud)

            const { data, error } = await query.order('fecha_hora', { ascending: true })
            if (error) throw error

            // Normalizar a campos planos para compatibilidad con CitasView
            citas.value = (data ?? []).map(c => ({
                ...c,
                idCita: c.idcita,
                idSesion: c.idcita,
                idFisioterapeuta: c.idpersonalsalud,
                idPaciente: c.paciente?.idpaciente,
                paciente_nombres: c.paciente?.persona?.nombres ?? '',
                paciente_apellidos: c.paciente?.persona?.apellidos ?? '',
                paciente_celular: c.paciente?.persona?.celular ?? '',
                fisio_nombres: c.personal_salud?.persona?.nombres ?? '',
                fisio_apellidos: c.personal_salud?.persona?.apellidos ?? '',
                fisio_especialidad: c.personal_salud?.especialidad ?? '',
            }))
        } catch (err) {
            showAlert('Error al cargar citas: ' + err.message, 'error')
        } finally {
            loading.value = false
        }
    }

    // ── fetchPersonalSalud ──────────────────────────────────────
    const fetchPersonalSalud = async () => {
        const { data, error } = await supabase
            .from('personal_salud')
            .select(`
                idpersonalsalud, tipo_personal, especialidad, activo,
                persona ( nombres, apellidos )
            `)
            .eq('activo', true)

        if (error) { showAlert('Error al cargar personal: ' + error.message, 'error'); return }
        personalSalud.value = (data ?? []).map(p => ({
            ...p,
            idPersonalSalud: p.idpersonalsalud,
            Persona: p.persona,
        }))
    }

    // ── fetchPacientes ──────────────────────────────────────────
    const fetchPacientes = async () => {
        const { data, error } = await supabase
            .from('paciente')
            .select(`
                idpaciente, codigo_universitario, facultad_escuela, tipo_usuario,
                persona ( nombres, apellidos, celular, numero_documento )
            `)

        if (error) { showAlert('Error al cargar pacientes: ' + error.message, 'error'); return }
        pacientes.value = (data ?? []).map(p => ({
            ...p,
            idPaciente: p.idpaciente,
            Persona: p.persona,
        }))
    }

    // ── fetchServicios ──────────────────────────────────────────
    const fetchServicios = async () => {
        const { data, error } = await supabase
            .from('servicio_topico')
            .select('idservicio, nombre_servicio, descripcion, duracion_estimada_minutos')
            .eq('activo', true)

        if (!error) servicios.value = data ?? []
    }

    // ── crearCita (Flujo Simplificado) ──────────────────────────
    const crearCita = async (payload) => {
        const { idPaciente, idPersonalSalud, idServicio, fecha_hora, motivo_consulta } = payload

        if (!idPaciente || !idServicio || !fecha_hora) {
            showAlert('Faltan datos obligatorios para agendar.', 'error')
            return false
        }

        if (idPersonalSalud) {
            const ocupado = await verificarDisponibilidad(idPersonalSalud, fecha_hora)
            if (ocupado) {
                showAlert('El especialista ya tiene una cita en ese horario.', 'error')
                return false
            }
        }

        loadingAccion.value = true
        try {
            const { data, error } = await supabase
                .from('cita')
                .insert({
                    idpaciente: idPaciente,
                    idpersonalsalud: idPersonalSalud || null,
                    idservicio: idServicio,
                    fecha_hora,
                    motivo_consulta,
                    estado: 'pendiente'
                })
                .select()
                .single()

            if (error) throw error
            showAlert('✅ Cita agendada correctamente.', 'success')
            return data
        } catch (err) {
            showAlert('Error al registrar: ' + err.message, 'error')
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    // ── reprogramarCita ─────────────────────────────────────────
    const reprogramarCita = async ({ idCita, idPersonalSaludNuevo, nuevaFechaHora, motivo }) => {
        if (!motivo?.trim() || !nuevaFechaHora) {
            showAlert('Faltan datos para reprogramar.', 'error'); return false
        }

        const fechaCita = new Date(nuevaFechaHora)
        if (fechaCita < new Date()) {
            showAlert('La fecha no puede ser en el pasado.', 'error'); return false
        }

        loadingAccion.value = true
        try {
            // Actualización directa, el trigger Historial_Estado_Cita registrará el cambio
            const { error } = await supabase
                .from('cita')
                .update({
                    fecha_hora: nuevaFechaHora,
                    idpersonalsalud: idPersonalSaludNuevo || null,
                    motivo_consulta: motivo
                })
                .eq('idcita', idCita)

            if (error) throw error
            showAlert('✅ Cita reprogramada.', 'success')
            return true
        } catch (err) {
            showAlert('Error al reprogramar: ' + err.message, 'error')
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    // ── Controles de Estado de Cita ─────────────────────────────
    const cancelarCita = async (idCita, motivo) => {
        if (!motivo?.trim()) { showAlert('Ingrese el motivo.', 'error'); return false }
        return actualizarEstadoCita(idCita, 'cancelada')
    }

    const registrarCheckIn = async (idCita) => {
        return actualizarEstadoCita(idCita, 'en_triaje', { paciente_en_sala: true })
    }

    const confirmarAsistencia = async (idCita) => {
        return actualizarEstadoCita(idCita, 'confirmada')
    }

    const marcarInasistencia = async (idCita) => {
        return actualizarEstadoCita(idCita, 'ausente')
    }

    // Helper interno para DRY (Don't Repeat Yourself)
    const actualizarEstadoCita = async (idCita, nuevoEstado, extraCampos = {}) => {
        loadingAccion.value = true
        try {
            const { error } = await supabase
                .from('cita')
                .update({ estado: nuevoEstado, ...extraCampos })
                .eq('idcita', idCita)

            if (error) throw error
            showAlert(`✅ Estado actualizado a: ${ESTADOS_CITA[nuevoEstado].label}`, 'success')
            return true
        } catch (err) {
            showAlert('Error al actualizar estado: ' + err.message, 'error')
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    // ── verificarDisponibilidad ─────────────────────────────────
    const verificarDisponibilidad = async (idPersonalSalud, fecha_hora) => {
        const fecha = new Date(fecha_hora)
        const year = fecha.getFullYear()
        const month = String(fecha.getMonth() + 1).padStart(2, '0')
        const day = String(fecha.getDate()).padStart(2, '0')
        const hours = String(fecha.getHours()).padStart(2, '0')
        const minutes = String(fecha.getMinutes()).padStart(2, '0')

        const inicioBusqueda = `${year}-${month}-${day} ${hours}:${minutes}:00`

        const fechaFin = new Date(fecha.getTime() + (29 * 60 * 1000)) // Asumimos bloques de 30 min aprox
        const finBusqueda = `${fechaFin.getFullYear()}-${String(fechaFin.getMonth() + 1).padStart(2, '0')}-${String(fechaFin.getDate()).padStart(2, '0')} ${String(fechaFin.getHours()).padStart(2, '0')}:${String(fechaFin.getMinutes()).padStart(2, '0')}:59`

        const { data, error } = await supabase
            .from('cita')
            .select('idcita')
            .eq('idpersonalsalud', idPersonalSalud)
            .not('estado', 'in', '("cancelada","ausente","completada")')
            .gte('fecha_hora', inicioBusqueda)
            .lt('fecha_hora', finBusqueda)
            .limit(1)

        if (error) return true
        return (data?.length ?? 0) > 0
    }

    // ── Helpers de UI ───────────────────────────────────────────
    const formatFechaHora = (iso) => {
        if (!iso) return '—'
        return new Intl.DateTimeFormat('es-PE', {
            weekday: 'short', day: '2-digit', month: 'short',
            year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'America/Lima'
        }).format(new Date(iso))
    }

    const getEstadoInfo = (estado) => ESTADOS_CITA[estado] ?? { label: estado, color: '#64748b', bg: '#f1f5f9' }

    const nombreCompleto = (persona) => {
        if (!persona) return '—'
        return `${persona.nombres ?? ''} ${persona.apellidos ?? ''}`.trim()
    }

    return {
        citas, personalSalud, fisios: personalSalud, pacientes, horarios, servicios,
        loading, loadingAccion, userRole, userId,

        esPersonalSalud, esFisioterapeuta: esPersonalSalud,
        esSecretaria, esPaciente, esAdmin, puedeGestionar,

        initUser, fetchCitas, fetchPersonalSalud, fetchFisios: fetchPersonalSalud,
        fetchPacientes, fetchServicios,
        crearCita, reprogramarCita,
        registrarCheckIn, confirmarAsistencia, marcarInasistencia, cancelarCita,

        formatFechaHora, getEstadoInfo, nombreCompleto, verificarDisponibilidad, clearUser
    }
}