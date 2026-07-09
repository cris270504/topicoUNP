<script setup>
import { ref, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'
import { useCitas } from '@/composables/useCitas'

const { showAlert, showConfirm } = useAlert()
const { esAdmin, fisios, fetchFisios, initUser, userId } = useCitas()

const loading = ref(false)
const horarios = ref([]) // Estado local de todos los turnos en pantalla
const fisioSeleccionado = ref(null) // ID del fisio cuyo horario estamos viendo/editando

// Diccionario de días para iterar la interfaz (BD solo admite 1=Lunes … 6=Sábado)
const DIAS_SEMANA = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
]

// Cargar los horarios actuales del fisioterapeuta seleccionado
const fetchHorarios = async () => {
  const targetId = esAdmin.value ? fisioSeleccionado.value : userId.value

  if (!targetId) {
    horarios.value = []
    return
  }

  loading.value = true
  try {
    const { data, error } = await supabase
      .from('horario')
      .select('*')
      .eq('idfisioterapeuta', targetId)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true })

    if (error) throw error

    // Formateamos las horas para los inputs tipo "time" (de HH:mm:ss a HH:mm)
    horarios.value = data.map(h => ({
      dia_semana: h.dia_semana,
      hora_inicio: h.hora_inicio.substring(0, 5),
      hora_fin: h.hora_fin.substring(0, 5)
    }))
  } catch (error) {
    showAlert('Error al cargar horario: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

// Helpers para la interfaz
const getTurnosPorDia = (idDia) => horarios.value.filter(h => h.dia_semana === idDia)

const agregarTurno = (idDia) => {
  horarios.value.push({ dia_semana: idDia, hora_inicio: '08:00', hora_fin: '13:00' })
}

const removerTurno = (turno) => {
  horarios.value = horarios.value.filter(h => h !== turno)
}

// Verifica que exista el registro en fisioterapeuta; si falta, lo crea automáticamente
const asegurarPerfilFisioterapeuta = async (idAchequear) => {
  const { data, error } = await supabase
    .from('fisioterapeuta')
    .select('idfisioterapeuta')
    .eq('idfisioterapeuta', idAchequear)
    .maybeSingle()

  if (error) throw new Error('Error al verificar el perfil del especialista: ' + error.message)

  if (!data) {
    // Si no existe, lo creamos. (Asumimos valores por defecto si no es el usuario actual).
    const { error: errInsert } = await supabase
      .from('fisioterapeuta')
      .insert({
        idfisioterapeuta: idAchequear,
        especialidad: 'General',
        tipo_personal: 'medico',
        activo: true
      })
    if (errInsert) throw new Error('No se pudo inicializar el perfil del especialista. (' + errInsert.message + ')')
  }
}

// Lógica de Guardado (Batch Save)
const guardarHorarios = async () => {
  const targetId = esAdmin.value ? fisioSeleccionado.value : userId.value

  if (!targetId) {
    showAlert('Debes seleccionar un especialista antes de guardar.', 'error')
    return
  }

  // 1. Validaciones lógicas
  for (let turno of horarios.value) {
    if (!turno.hora_inicio || !turno.hora_fin) {
      showAlert('Todos los turnos deben tener una hora de inicio y fin válidas.', 'error')
      return
    }
    if (turno.hora_inicio >= turno.hora_fin) {
      showAlert(`Hay un error lógico: La hora de inicio (${turno.hora_inicio}) no puede ser mayor o igual a la de fin.`, 'error')
      return
    }
  }

  const confirmado = await showConfirm('¿Deseas guardar estos horarios? Esto actualizará la disponibilidad en el sistema de citas.')
  if (!confirmado) return

  loading.value = true
  try {
    // 2. Verificar / crear el registro en fisioterapeuta antes de insertar horarios
    await asegurarPerfilFisioterapeuta(targetId)

    // 3. Eliminamos los registros anteriores del fisioterapeuta
    const { error: errDel } = await supabase
      .from('horario')
      .delete()
      .eq('idfisioterapeuta', targetId)

    if (errDel) throw errDel

    // 4. Insertamos el nuevo bloque de horarios completo
    if (horarios.value.length > 0) {
      const inserts = horarios.value.map(h => ({
        idfisioterapeuta: targetId,
        dia_semana: h.dia_semana,
        hora_inicio: h.hora_inicio,
        hora_fin: h.hora_fin
      }))

      const { error: errIns } = await supabase
        .from('horario')
        .insert(inserts)

      if (errIns) throw errIns
    }

    showAlert('¡El horario ha sido actualizado con éxito!', 'success')
    await fetchHorarios() // Recargar para sincronizar
  } catch (error) {
    showAlert('Error al guardar: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await initUser()

  if (esAdmin.value) {
    await fetchFisios()
    // Si hay fisios, seleccionamos el primero y cargamos su horario
    if (fisios.value.length > 0) {
      fisioSeleccionado.value = fisios.value[0].idfisioterapeuta
    }
  } else {
    // Si es fisioterapeuta, carga sus propios horarios
    await fetchHorarios()
  }
})

// Si el admin cambia de especialista, recargamos la grilla
watch(fisioSeleccionado, (nuevoFisio) => {
  if (nuevoFisio) {
    fetchHorarios()
  }
})
</script>

<template>
  <div class="view-container">

    <div class="action-header">
      <div class="header-text">
        <h2>{{ esAdmin ? 'Gestión de Horarios' : 'Mi Disponibilidad' }}</h2>
        <p>{{ esAdmin ? 'Configura los bloques de atención del personal del tópico.' : 'Configura tus bloques de atención para que recepción pueda agendarte citas.' }}</p>
      </div>

      <button class="primary-btn" @click="guardarHorarios" :disabled="loading || (esAdmin && !fisioSeleccionado)">
        <span v-if="loading" class="btn-spinner"></span>
        <span v-else>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Guardar Horarios
        </span>
      </button>
    </div>

    <!-- Filtro de Especialista (Solo Admin) -->
<!-- Filtro de Especialista (Solo Admin) -->
    <div v-if="esAdmin" class="data-card admin-filter-card">
      <div class="input-group admin-filter-group">
        <label class="admin-filter-label">
          Fisioterapeuta a gestionar:
        </label>
        <select v-model="fisioSeleccionado" :disabled="loading" class="admin-filter-select">
          <option :value="null" disabled>— Seleccionar especialista —</option>
          <option v-for="f in fisios" :key="f.idfisioterapeuta" :value="f.idfisioterapeuta">
            {{ f.persona?.nombres }} {{ f.persona?.apellidos }}
          </option>
        </select>
      </div>
    </div>

    <!-- Grilla de Calendario Semanal -->
    <div class="horarios-grid" :style="loading ? 'opacity: 0.6; pointer-events: none;' : ''">

      <div v-if="!fisioSeleccionado && esAdmin" class="empty-row"
        style="grid-column: 1 / -1; padding: 40px; background: white; border-radius: 12px; text-align: center;">
        Por favor, selecciona un especialista para visualizar y editar su horario.
      </div>

      <template v-else>
        <div v-for="dia in DIAS_SEMANA" :key="dia.id" class="data-card dia-card">

          <div class="dia-header">
            <h3>{{ dia.label }}</h3>
            <button class="btn-add-turno" @click="agregarTurno(dia.id)" title="Agregar bloque de hora">
              + Añadir Turno
            </button>
          </div>

          <div class="dia-body">
            <div v-if="getTurnosPorDia(dia.id).length === 0" class="dia-libre">
              Día Libre (Sin atención)
            </div>

            <div v-for="(turno, index) in getTurnosPorDia(dia.id)" :key="index" class="turno-row">
              <input type="time" v-model="turno.hora_inicio" required />
              <span>a</span>
              <input type="time" v-model="turno.hora_fin" required />
              <button type="button" class="btn-remove" @click="removerTurno(turno)" title="Eliminar turno">
                &times;
              </button>
            </div>
          </div>

        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
.horarios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-items: start;
}

.dia-card {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.dia-header {
  background: var(--gray-50);
  padding: 12px 16px;
  border-bottom: 1px solid var(--gray-100);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dia-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.btn-add-turno {
  background: none;
  border: none;
  color: var(--blue);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px;
}
/* ── Selector de Administrador ── */
.admin-filter-card {
  margin-bottom: 24px;
  display: inline-block; /* 👈 EL TRUCO: Evita que se estire al 100% de la pantalla */
  min-width: 350px;
  padding: 16px 20px;
}

.admin-filter-group {
  margin-bottom: 0; /* Para no dejar espacio extra debajo del select */
}

.admin-filter-label {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 8px;
  display: block;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.admin-filter-select {
  background: #ffffff;
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  color: #334155;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  outline: none;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.admin-filter-select:hover:not(:disabled) {
  border-color: #cbd5e1;
}

.admin-filter-select:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}

.admin-filter-select:disabled {
  background: #f8fafc;
  color: #94a3b8;
  cursor: not-allowed;
}

.btn-add-turno:hover {
  text-decoration: underline;
}

.dia-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dia-libre {
  text-align: center;
  color: var(--gray-500);
  font-size: 12.5px;
  font-style: italic;
  padding: 10px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed var(--gray-300);
}

.turno-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.turno-row input[type="time"] {
  flex: 1;
  padding: 6px;
  border: 1.5px solid var(--gray-200);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  color: var(--navy);
  outline: none;
}

.turno-row input[type="time"]:focus {
  border-color: var(--blue);
}

.turno-row span {
  font-size: 12px;
  color: var(--gray-500);
  font-weight: 500;
}

.btn-remove {
  background: #fee2e2;
  color: #ef4444;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-remove:hover {
  opacity: 0.8;
}
</style>