<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const { showAlert, showConfirm } = useAlert() // 👈 Importamos showConfirm

const loading = ref(false)
const showModal = ref(false)
const personalList = ref([])
const filtroEstado = ref('activos')

const email = ref('')
const password = ref('')
const nombres = ref('')
const apellidos = ref('')
const celular = ref('')
const tipoDocumento = ref('DNI')
const numeroDocumento = ref('')
const rolSeleccionado = ref('fisioterapeuta')
const especialidad = ref('')
const tipoPersonal = ref('medico')

const fetchPersonal = async () => {
  try {
    const { data, error } = await supabase
      .from('persona')
      .select(`
        idpersona,
        nombres,
        apellidos,
        celular,
        tipo_documento,
        numero_documento, activo,
        fisioterapeuta(especialidad, tipo_personal), 
        enfermera(idenfermera),
        paciente(idpaciente, tipo_usuario) 
      `)

    if (error) throw error

    personalList.value = data.map(persona => {
      let rolCalculado = 'Administrador'

      const esPersonalSalud = persona.fisioterapeuta && (Array.isArray(persona.fisioterapeuta) ? persona.fisioterapeuta.length > 0 : Object.keys(persona.fisioterapeuta).length > 0)
      const esenfermera = persona.enfermera && (Array.isArray(persona.enfermera) ? persona.enfermera.length > 0 : Object.keys(persona.enfermera).length > 0)

      const esEstudiante = persona.paciente && (
        Array.isArray(persona.paciente)
          ? persona.paciente.some(p => p.tipo_usuario === 'estudiante')
          : persona.paciente.tipo_usuario === 'estudiante'
      )

      if (esPersonalSalud) {
        rolCalculado = 'Fisioterapeuta'
      } else if (esenfermera) {
        rolCalculado = 'Enfermera'
      } else if (esEstudiante) {
        rolCalculado = 'Estudiante'
      }

      const especialidadCalculada = Array.isArray(persona.fisioterapeuta)
        ? persona.fisioterapeuta[0]?.especialidad
        : persona.fisioterapeuta?.especialidad

      return {
        id: persona.idpersona,
        nombres: persona.nombres,
        apellidos: persona.apellidos,
        celular: persona.celular || '-',
        documento: `${persona.tipo_documento}: ${persona.numero_documento || '-'}`,
        rol: rolCalculado,
        rolClaseCss: rolCalculado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, '-').replace(/\//g, ''),
        especialidad: especialidadCalculada || '-',
        activo: persona.activo
      }
    })

  } catch (error) {
    showAlert('Error al cargar la nómina: ' + error.message, 'error')
  }
}

const personalFiltrado = computed(() => {
  if (filtroEstado.value === 'activos') return personalList.value.filter(p => p.activo)
  if (filtroEstado.value === 'suspendidos') return personalList.value.filter(p => !p.activo)
  return personalList.value // 'todos'
})

const handleCreateUser = async () => {
  const docFiltrado = numeroDocumento.value.trim()
  const celularFiltrado = celular.value.trim()

  if (tipoDocumento.value === 'DNI') {
    const regexDni = /^\d{8}$/
    if (!regexDni.test(docFiltrado)) {
      showAlert('El DNI debe tener estrictamente 8 dígitos numéricos.', 'error')
      return
    }
  } else if (tipoDocumento.value === 'RUC') {
    const regexRuc = /^\d{11}$/
    if (!regexRuc.test(docFiltrado)) {
      showAlert('El RUC debe tener estrictamente 11 dígitos numéricos.', 'error')
      return
    }
  }

  if (celularFiltrado) {
    const regexCelular = /^9\d{8}$/
    if (!regexCelular.test(celularFiltrado)) {
      showAlert('El número de celular debe tener 9 dígitos y empezar con 9.', 'error')
      return
    }
  }

  loading.value = true
  try {
    const { data, error } = await supabase.functions.invoke('crear-paciente-admin', {
      body: {
        email: email.value,
        password: password.value,
        rol: rolSeleccionado.value,
        nombres: nombres.value,
        apellidos: apellidos.value,
        tipo_documento: tipoDocumento.value,
        numero_documento: numeroDocumento.value,
        celular: celular.value || null,
        fecha_nacimiento: null
      }
    })

    if (error) throw error
    if (data && data.error) throw new Error(data.error)

    const newUid = data.user_id

    if (celular.value) {
      await supabase.from('persona').update({ celular: celular.value }).eq('idpersona', newUid)
    }

    if (rolSeleccionado.value === 'fisioterapeuta') {
      const { error: errSalud } = await supabase.from('fisioterapeuta').insert({
        idfisioterapeuta: newUid,
        tipo_personal: tipoPersonal.value,
        especialidad: especialidad.value,
        activo: true
      })
      if (errSalud) throw errSalud

    } else if (rolSeleccionado.value === 'enfermera') {
      const { error: errenfermera } = await supabase.from('enfermera').insert({ idenfermera: newUid })
      if (errenfermera) throw errenfermera
    }

    showAlert('¡Trabajador dado de alta exitosamente en Tópico UNP!', 'success')
    showModal.value = false
    resetForm()
    await fetchPersonal()

  } catch (error) {
    showAlert('Error en el alta: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

// ── NUEVO: GESTIÓN DE SUSPENSIÓN Y ELIMINACIÓN ──
const handleGestionarAcceso = async (id, nombre, accion) => {
  const accionTexto = accion === 'suspender' ? 'suspender el acceso de' : 'restaurar el acceso de';

  const confirmado = await showConfirm(`¿Estás seguro de que deseas ${accionTexto} a ${nombre}?`);
  if (!confirmado) return;

  loading.value = true;
  try {
    const { data, error } = await supabase.functions.invoke('gestionar-usuario-admin', {
      body: { user_id: id, accion: accion }
    });

    if (error) throw error;
    if (data && data.error) throw new Error(data.error);

    showAlert(data.message || `Usuario procesado correctamente.`, 'success');
    await fetchPersonal(); // Refrescar la tabla
  } catch (error) {
    showAlert('Error al procesar la solicitud: ' + error.message, 'error');
  } finally {
    loading.value = false;
  }
}

const resetForm = () => {
  email.value = ''
  password.value = ''
  nombres.value = ''
  apellidos.value = ''
  celular.value = ''
  numeroDocumento.value = ''
  especialidad.value = ''
  tipoPersonal.value = 'medico'
  rolSeleccionado.value = 'fisioterapeuta'
}

onMounted(() => {
  fetchPersonal()
})
</script>

<template>
  <div class="config-view" :style="loading ? 'opacity: 0.7; pointer-events: none;' : ''">

    <div class="action-header">
      <div class="header-text">
        <h2>Gestión de Accesos</h2>
        <p>Da de alta especialistas y administra los accesos al sistema.</p>
      </div>
      <button class="primary-btn" @click="showModal = true" :disabled="loading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round" class="btn-icon">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Registrar Personal
      </button>
    </div>

    <div class="data-card">

      <div
        style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; gap: 12px; align-items: center; background: #f8fafc; border-radius: 12px 12px 0 0;">
        <label style="font-size: 0.9rem; font-weight: 600; color: #475569;">Ver usuarios:</label>
        <select v-model="filtroEstado"
          style="padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; outline: none; cursor: pointer;">
          <option value="activos">Activos</option>
          <option value="suspendidos">Suspendidos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div class="table-responsive">
        <table class="content-table">
          <thead>
            <tr>
              <th>Nombre Completo</th>
              <th>Rol en el Sistema</th>
              <th>N° Documento</th>
              <th>Celular</th>
              <th>Especialidad Médica</th>
              <th>Acciones</th> <!-- 👈 Nueva Columna -->
            </tr>
          </thead>
          <tbody>
            <tr v-for="staff in personalFiltrado" :key="staff.id" :class="{ 'row-suspended': !staff.activo }">
              <td class="staff-name">
                {{ staff.nombres }} {{ staff.apellidos }}
                <span v-if="!staff.activo"
                  style="display: block; font-size: 0.75rem; color: #dc2626; font-weight: 600; margin-top: 4px;">(Suspendido)</span>
              </td>
              <td><span class="badge" :class="staff.rolClaseCss">{{ staff.rol }}</span></td>
              <td>{{ staff.documento }}</td>
              <td>{{ staff.celular }}</td>
              <td class="staff-detail">{{ staff.especialidad }}</td>

              <td class="acciones-cell">
                <!-- 👈 Botón Dinámico: Suspender o Activar -->
                <button v-if="staff.activo" class="accion-btn btn-suspend"
                  @click="handleGestionarAcceso(staff.id, staff.nombres, 'suspender')" title="Bloquear acceso">
                  Suspender
                </button>
                <button v-else class="accion-btn btn-restore"
                  @click="handleGestionarAcceso(staff.id, staff.nombres, 'restaurar')" title="Restaurar acceso">
                  Activar
                </button>
              </td>
            </tr>

            <tr v-if="personalList.length === 0">
              <td colspan="6" class="empty-row">
                No se registran usuarios en la base de datos.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Estilos para los nuevos botones de acción ── */
.acciones-cell {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Botón Verde para Restaurar */
.btn-restore {
  background: #dcfce7;
  color: #166534;
}

/* Atenuar visualmente a los usuarios suspendidos */
.row-suspended td {
  opacity: 0.6;
  background-color: #f8fafc;
}

.accion-btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.82rem;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
  font-weight: 500;
}

.accion-btn:hover {
  opacity: 0.8;
}

/* Naranja para Suspender (Alerta) */
.btn-suspend {
  background: #ffedd5;
  color: #c2410c;
}

/* Rojo para Eliminar (Peligro) */
.btn-delete {
  background: #fee2e2;
  color: #b91c1c;
}
</style>
