import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'
import { useCitas } from '@/composables/useCitas'

export function useDashboard() {
  const { showAlert } = useAlert()
  const { userId, userRole, esPaciente, esPersonalSalud, initUser } = useCitas()

  const loading = ref(false)
  const citasHoy = ref([])
  const citasProximas = ref([]) // Para la vista del paciente
  const pacientesEnSala = ref([])
  const ocupacionPersonal = ref([])
  
  const totalCitasHoy = ref(0)
  const resumenEstados = ref({
    pendiente: 0, confirmada: 0, en_triaje: 0, 
    en_consulta: 0, completada: 0, cancelada: 0, ausente: 0
  })

  const fetchDashboard = async () => {
    await initUser()
    loading.value = true

    try {
      const hoy = new Date()
      // Rango del día actual en hora local (Perú)
      const inicioDia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}T00:00:00-05:00`
      const finDia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}T23:59:59-05:00`

      // ── 1. Vista de Paciente (Estudiante/Docente) ──
      if (esPaciente.value) {
        const { data, error } = await supabase.from('cita')
          .select(`
            idcita, fecha_hora, estado, motivo_consulta,
            servicio_topico ( nombre_servicio ),
            personal_salud ( persona ( nombres, apellidos ) )
          `)
          .eq('idpaciente', userId.value)
          .gte('fecha_hora', inicioDia) // Traer citas desde hoy en adelante
          .order('fecha_hora', { ascending: true })

        if (error) throw error
        citasProximas.value = data ?? []
        return // Fin de la ejecución para el paciente
      }

      // ── 2. Vista Clínica (Administrador, Secretaria o Personal de Salud) ──
      let query = supabase.from('cita')
        .select(`
          idcita, fecha_hora, estado, paciente_en_sala,
          paciente ( idpaciente, codigo_universitario, persona ( nombres, apellidos, celular ) ),
          personal_salud ( idpersonalsalud, especialidad, persona ( nombres, apellidos ) ),
          servicio_topico ( nombre_servicio )
        `)
        .gte('fecha_hora', inicioDia)
        .lte('fecha_hora', finDia)

      // Si es médico/enfermera, solo ve SUS citas del día
      if (esPersonalSalud.value) {
        query = query.eq('idpersonalsalud', userId.value)
      }

      const { data, error } = await query.order('fecha_hora', { ascending: true })
      if (error) throw error

      citasHoy.value = data ?? []
      totalCitasHoy.value = citasHoy.value.length

      // Reiniciar contadores
      Object.keys(resumenEstados.value).forEach(k => resumenEstados.value[k] = 0)
      const ocupacionMap = {}
      pacientesEnSala.value = []

      citasHoy.value.forEach(cita => {
        // Conteo de estados
        if (resumenEstados.value[cita.estado] !== undefined) {
          resumenEstados.value[cita.estado]++
        }

        // Pacientes en sala de espera (recepcionados)
        if (cita.paciente_en_sala && ['confirmada', 'en_triaje'].includes(cita.estado)) {
          pacientesEnSala.value.push(cita)
        }

        // Ocupación del personal (Agrupación)
        if (cita.Personal_Salud) {
          const idPersonal = cita.Personal_Salud.idPersonalSalud
          if (!ocupacionMap[idPersonal]) {
            ocupacionMap[idPersonal] = {
              idPersonalSalud: idPersonal,
              nombre: `${cita.Personal_Salud.Persona.nombres} ${cita.Personal_Salud.Persona.apellidos}`,
              especialidad: cita.Personal_Salud.especialidad,
              totalCitas: 0,
              atendidas: 0,
              pendientes: 0
            }
          }
          ocupacionMap[idPersonal].totalCitas++
          if (['completada'].includes(cita.estado)) ocupacionMap[idPersonal].atendidas++
          if (['pendiente', 'confirmada', 'en_triaje', 'en_consulta'].includes(cita.estado)) ocupacionMap[idPersonal].pendientes++
        }
      })

      ocupacionPersonal.value = Object.values(ocupacionMap)

    } catch (err) {
      showAlert('Error al cargar el panel: ' + err.message, 'error')
    } finally {
      loading.value = false
    }
  }

  return {
    loading, citasHoy, citasProximas, pacientesEnSala, ocupacionPersonal,
    resumenEstados, totalCitasHoy, fetchDashboard
  }
}