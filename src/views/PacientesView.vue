<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'
import { useRouter } from 'vue-router'
import FormularioPacienteModal from '@/components/FormularioPacienteModal.vue'

const { showAlert, showConfirm } = useAlert()
const router = useRouter()

const irAHistoriaClinica = (id) => {
    router.push({ name: 'HistoriaClinica', params: { idPaciente: id } })
}

// Estados operativos
const pacientesList = ref([])
const searchQuery = ref('')
const isModalOpen = ref(false)
const selectedPaciente = ref(null)

const fetchPacientes = async () => {
    try {
        const { data, error } = await supabase
            .from('paciente')
            .select(`
                idpaciente,
                codigo_universitario,
                tipo_usuario,
                facultad_escuela,
                direccion,
                created_at,
                persona (
                  idpersona,
                  nombres,
                  apellidos,
                  tipo_documento,
                  numero_documento,
                  celular,
                  fecha_nacimiento
                )
            `)

        if (error) throw error
        pacientesList.value = data || []
    } catch (error) {
        showAlert('Error al cargar la nómina de pacientes: ' + error.message, 'error')
    }
}

const filteredPacientes = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return pacientesList.value

    return pacientesList.value.filter(p => {
        // Acceso a los objetos anidados también en minúsculas
        const nombreCompleto = `${p.persona?.nombres} ${p.persona?.apellidos}`.toLowerCase()
        const doc = p.persona?.numero_documento || ''
        const codigo = p.codigo_universitario?.toLowerCase() || ''
        
        // Ahora el buscador también detecta por código universitario
        return nombreCompleto.includes(query) || doc.includes(query) || codigo.includes(query)
    })
})


const openEditForm = (paciente) => {
    selectedPaciente.value = paciente
    isModalOpen.value = true
}

const handleDeletePaciente = async (idPersonaReal) => {
    const confirmado = await showConfirm('¿Estás seguro de eliminar este paciente? Esto borrará permanentemente sus accesos al sistema, sus citas y su historial médico.')

    if (!confirmado) return

    try {
        // Llamamos a la función RPC que acabamos de crear en la base de datos
        const { error } = await supabase.rpc('eliminar_usuario_completo', {
            p_id_usuario: idPersonaReal
        })

        if (error) throw error

        showAlert('Se eliminó al paciente y todo su acceso del sistema.', 'success')
        await fetchPacientes()
    } catch (error) {
        showAlert('No se pudo eliminar el registro: ' + error.message, 'error')
    }
}

onMounted(() => {
    fetchPacientes()
})
</script>

<template>
    <div class="view-container">

        <div class="action-header">
            <div class="header-text">
                <h2>Gestión de Pacientes</h2>
                <p>Control de admisiones de la comunidad universitaria (Tópico UNP).</p>
            </div>
        </div>

        <div class="data-card"
            style="padding: 16px; border-bottom: none; border-bottom-left-radius: 0; border-bottom-right-radius: 0;">
            <div class="input-group" style="max-width: 450px;">
                <input v-model="searchQuery" type="text" placeholder="Buscar por nombre, documento o código UNP..."
                    style="background: #ffffff;" />
            </div>
        </div>

        <div class="data-card" style="border-top-left-radius: 0; border-top-right-radius: 0;">
            <div class="table-responsive">
                <table class="content-table">
                    <thead>
                        <tr>
                            <th>Paciente</th>
                            <th>Código UNP</th>
                            <th>Facultad / Escuela</th>
                            <th>Documento</th>
                            <th>Celular</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="paciente in filteredPacientes" :key="paciente.idpaciente">
                            <td>
                                <span class="patient-name">
                                    {{ paciente.persona?.nombres }} {{ paciente.persona?.apellidos }}
                                </span>
                                <span class="patient-detail" style="text-transform: capitalize;">
                                    {{ paciente.tipo_usuario }} 
                                </span>
                            </td>
                            <td><strong>{{ paciente.codigo_universitario }}</strong></td>
                            <td>{{ paciente.facultad_escuela }}</td>
                            <td>{{ paciente.persona?.tipo_documento }}: {{ paciente.persona?.numero_documento }}</td>
                            <td>{{ paciente.persona?.celular || '-' }}</td>
                            <td>
                                <button @click="irAHistoriaClinica(paciente.idpaciente)" class="btn-secondary"
                                style="padding: 6px 14px; font-size: 12px; border-radius: 6px; margin-right: 8px; background: #ccfbf1; color: #0f766e">
                                    <i class="icono-historia"></i> Historia Clínica
                                </button>
                                <button @click="openEditForm(paciente)" class="btn-secondary"
                                    style="padding: 6px 14px; font-size: 12px; border-radius: 6px; margin-right: 8px;">
                                    Editar
                                </button>
                                <button @click="handleDeletePaciente(paciente.persona?.idpersona)" class="btn-secondary"
                                    style="padding: 6px 14px; font-size: 12px; border-radius: 6px; background: #fee2e2; color: #ef4444;">
                                    Eliminar
                                </button>
                            </td>
                        </tr>
                        <tr v-if="filteredPacientes.length === 0">
                            <td colspan="6" class="empty-row">No se encontraron pacientes registrados.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <FormularioPacienteModal :is-open="isModalOpen" :paciente-data="selectedPaciente" @close="isModalOpen = false"
            @refresh="fetchPacientes" />
    </div>
</template>

<style scoped></style>