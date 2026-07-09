<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  loadingAccion: { type: Boolean, default: false },
  sesion: { type: Object, default: () => null }
})

const emit = defineEmits(['close', 'submit'])

const form = ref({
  diagnostico: '',
  indicaciones: '',
  cantidadSesiones: 0,
  frecuencia: ''
})

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    if (props.sesion) {
      form.value = {
        diagnostico: props.sesion.diagnostico_descripcion || '',
        indicaciones: props.sesion.tratamiento_recetado || '',
        cantidadSesiones: props.sesion.cantidad_sesiones_recomendadas || 0,
        frecuencia: props.sesion.frecuencia_sesiones_recomendadas || ''
      }
    } else {
      form.value = {
        diagnostico: '',
        indicaciones: '',
        cantidadSesiones: 0,
        frecuencia: ''
      }
    }
  }
})

const handleSubmit = () => {
  if (form.value.cantidadSesiones > 0 && !form.value.frecuencia.trim()) {
    alert("Debe especificar la frecuencia de las sesiones recomendadas.")
    return
  }
  emit('submit', { ...form.value })
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Resultados e Indicaciones Médicas</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form" style="padding: 20px;">
          <p style="margin-top: 0; margin-bottom: 16px; font-size: 14px; color: var(--gray-500);">
            Registre las conclusiones de esta atención. El paciente podrá ver estas indicaciones desde su perfil, y el área de recepción agendará las sesiones recomendadas automáticamente.
          </p>

          <div class="input-group">
            <label>Diagnóstico / Resultados <span class="req">*</span></label>
            <textarea v-model="form.diagnostico" rows="3" required placeholder="Ej: Esguince de tobillo grado II. Limitación funcional moderada."></textarea>
          </div>

          <div class="input-group">
            <label>Indicaciones Médicas a seguir <span class="req">*</span></label>
            <textarea v-model="form.indicaciones" rows="4" required placeholder="Ej: Reposo relativo, aplicación de hielo 15 min cada 4h, realizar ejercicios isométricos..."></textarea>
          </div>

          <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
            <div class="input-group">
              <label>Recomendar Sesiones</label>
              <input type="number" v-model.number="form.cantidadSesiones" min="0" max="20" placeholder="0" />
              <small style="color: var(--gray-500);">0 si no requiere más</small>
            </div>
            
            <div class="input-group" v-if="form.cantidadSesiones > 0">
              <label>Frecuencia Sugerida <span class="req">*</span></label>
              <select v-model="form.frecuencia" required>
                <option value="">Seleccione...</option>
                <option value="Diario">Diario</option>
                <option value="Interdiario">Interdiario</option>
                <option value="1 vez por semana">1 vez por semana</option>
                <option value="2 veces por semana">2 veces por semana</option>
                <option value="3 veces por semana">3 veces por semana</option>
                <option value="Cada 15 días">Cada 15 días</option>
                <option value="Al mes">Al mes</option>
              </select>
            </div>
          </div>

          <div class="modal-actions" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--gray-100);">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="loadingAccion">Cancelar</button>
            <button type="submit" class="btn-primary-submit" :disabled="loadingAccion">
              <span v-if="loadingAccion" class="btn-spinner"></span>
              <span v-else>💾 Guardar y Finalizar Cita</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>
