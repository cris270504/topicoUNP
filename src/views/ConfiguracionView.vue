<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const { showAlert } = useAlert()

const loading = ref(false)
const showModal = ref(false)
const personalList = ref([])

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
        numero_documento,
        fisioterapeuta(especialidad), 
        enfermera(idenfermera),
        paciente(idpaciente, tipo_usuario) 
      `) // 👈 Agregamos tipo_personal a la consulta

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

      const tipoSaludExacto = Array.isArray(persona.fisioterapeuta)
        ? persona.fisioterapeuta[0]?.tipo_personal
        : persona.fisioterapeuta?.tipo_personal

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
        // Limpiamos los acentos y espacios para las clases CSS dinámicas
        rolClaseCss: rolCalculado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, '-').replace(/\//g, ''),
        especialidad: especialidadCalculada || '-'
      }
    })

  } catch (error) {
    showAlert('Error al cargar la nómina: ' + error.message, 'error')
  }
}

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
        fecha_nacimiento: null // ConfiguracionView no pide fecha, así que se envía null explícito
      }
    })

    if (error) throw error
    if (data && data.error) {
      throw new Error(data.error)
    }

    const newUid = data.user_id

    // Actualización de seguridad: Aseguramos que el celular se guarde explícitamente,
    // ya que la Edge Function remota o el trigger podrían estar omitiéndolo.
    if (celular.value) {
      await supabase.from('persona').update({
        celular: celular.value
      }).eq('idpersona', newUid)
    }

    if (rolSeleccionado.value === 'fisioterapeuta') {
      const { error: errSalud } = await supabase
        .from('fisioterapeuta')
        .insert({
          idfisioterapeuta: newUid,
          tipo_personal: tipoPersonal.value,
          especialidad: especialidad.value,
          activo: true
        })

      if (errSalud) throw errSalud

    } else if (rolSeleccionado.value === 'enfermera') {
      const { error: errenfermera } = await supabase
        .from('enfermera')
        .insert({
          idenfermera: newUid
        })

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
  <div class="config-view">

    <div class="action-header">
      <div class="header-text">
        <h2>Gestión de Accesos</h2>
        <p>Da de alta especialistas y administra los accesos al sistema.</p>
      </div>
      <button class="primary-btn" @click="showModal = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round" class="btn-icon">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Registrar Personal
      </button>
    </div>

    <div class="data-card">
      <div class="table-responsive">
        <table class="content-table">
          <thead>
            <tr>
              <th>Nombre Completo</th>
              <th>Rol en el Sistema</th>
              <th>N° Documento</th>
              <th>Celular</th>
              <th>Especialidad Médica</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="staff in personalList" :key="staff.id">
              <td class="staff-name">{{ staff.nombres }} {{ staff.apellidos }}</td>
              <td>
                <span class="badge" :class="staff.rolClaseCss">
                  {{ staff.rol }}
                </span>
              </td>
              <td>{{ staff.documento }}</td>
              <td>{{ staff.celular }}</td>
              <td class="staff-detail">{{ staff.especialidad }}</td>
            </tr>

            <tr v-if="personalList.length === 0">
              <td colspan="5" class="empty-row">
                No se registran usuarios en la base de datos.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Transition name="fade-modal">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-window">

          <div class="modal-header">
            <h3>Alta de Nuevo Trabajador</h3>
            <button class="close-x" @click="showModal = false">&times;</button>
          </div>

          <form @submit.prevent="handleCreateUser" class="modal-form">
            <div class="form-grid">

              <div class="input-group">
                <label for="modal-nombres">Nombres *</label>
                <input id="modal-nombres" type="text" v-model="nombres" placeholder="Ej: Carlos Alberto" required />
              </div>

              <div class="input-group">
                <label for="modal-apellidos">Apellidos *</label>
                <input id="modal-apellidos" type="text" v-model="apellidos" placeholder="Ej: Mendoza Flores" required />
              </div>

              <div class="input-group">
                <label for="modal-tipo-doc">Tipo de Documento</label>
                <select id="modal-tipo-doc" v-model="tipoDocumento">
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de Extranjería</option>
                  <option value="PAS">Pasaporte</option>
                </select>
              </div>

              <div class="input-group">
                <label for="modal-num-doc">Número de Documento *</label>
                <input v-model="numeroDocumento" type="text" :maxlength="tipoDocumento === 'DNI' ? 8 : 15"
                  @input="numeroDocumento = numeroDocumento.replace(/\D/g, '')"
                  placeholder="Ingrese el número de documento" class="form-input" />
              </div>

              <div class="input-group">
                <label for="modal-celular">Celular</label>
                <input id="modal-celular" type="text" v-model="celular" placeholder="9 dígitos" maxlength="9" />
              </div>

              <div class="input-group">
                <label for="modal-rol">Rol del Sistema</label>
                <select id="modal-rol" v-model="rolSeleccionado">
                  <option value="fisioterapeuta">Personal de Salud</option>
                  <option value="enfermera">enfermera</option>
                </select>
              </div>

              <div class="input-group span-2">
                <label for="modal-email">Correo Electrónico Institucional *</label>
                <input id="modal-email" type="email" v-model="email" placeholder="usuario@unp.edu.pe" required />
              </div>

              <div class="input-group span-2">
                <label for="modal-password">Contraseña Temporal de Acceso *</label>
                <input id="modal-password" type="password" v-model="password" placeholder="Mínimo 6 caracteres"
                  required />
              </div>

              <Transition name="slide-input">
                <div v-if="rolSeleccionado === 'fisioterapeuta'" class="form-grid span-2"
                  style="margin-top: 0; gap: 1rem;">
                  <div class="input-group">
                    <label for="modal-tipo-personal">Área Médica *</label>
                    <select id="modal-tipo-personal" v-model="tipoPersonal">
                      <option value="medico">Médico General</option>
                      <option value="enfermero">Enfermería</option>
                      <option value="odontologo">Odontología</option>
                      <option value="psicologo">Psicología</option>
                      <option value="triaje">Triaje</option>
                    </select>
                  </div>

                  <div class="input-group">
                    <label for="modal-especialidad">Especialidad Terapéutica *</label>
                    <input id="modal-especialidad" type="text" v-model="especialidad"
                      placeholder="Ej: Medicina Familiar / Psicoterapia" required />
                  </div>
                </div>
              </Transition>

            </div>

            <div class="modal-actions">
              <button type="button" class="btn-secondary" @click="showModal = false">Cancelar</button>
              <button type="submit" class="btn-primary-submit" :disabled="loading">
                <span v-if="loading" class="btn-spinner"></span>
                <span v-else>Confirmar Registro</span>
              </button>
            </div>
          </form>

        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped></style>