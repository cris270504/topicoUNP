<script setup>
import { ref, watch } from 'vue'
import { useCitas } from '@/composables/useCitas'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  cita: { type: Object, default: null },
  isSubmitting: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'confirm'])
const { formatFechaHora } = useCitas()

const motivoCancelacion = ref('')

watch(() => props.isOpen, (abierto) => {
  if (abierto) {
    motivoCancelacion.value = ''
  }
})

const handleSubmit = () => {
  if (!motivoCancelacion.value.trim()) return
  emit('confirm', motivoCancelacion.value.trim())
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window modal-cancelacion">
        <div class="modal-header">
          <h3>Cancelar Reserva</h3>
          <button class="close-x" @click="emit('close')" :disabled="isSubmitting">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form">
          <div class="warning-box">
            <strong>⚠️ Atención:</strong> Estás a punto de cancelar tu cita del 
            <span v-if="cita">{{ formatFechaHora(cita.fecha_hora) }}</span>.
            Esta acción no se puede deshacer y el turno será liberado para otros pacientes.
          </div>

          <div class="input-group">
            <label>Por favor, indica el motivo de la cancelación para liberar el turno <span class="req">*</span></label>
            <textarea 
              v-model="motivoCancelacion" 
              rows="3" 
              placeholder="Ej. Problemas de salud imprevistos, cruce de horarios, etc."
              required
              minlength="10"
              maxlength="200"
            ></textarea>
            <span class="char-count">{{ motivoCancelacion.length }}/200</span>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="isSubmitting">No, mantener cita</button>
            <button type="submit" class="btn-danger" :disabled="isSubmitting || motivoCancelacion.length < 10">
              <span v-if="isSubmitting" class="btn-spinner"></span>
              <span v-else>Sí, cancelar cita</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-cancelacion {
  width: 90%;
  max-width: 450px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--gray-100);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  color: #b91c1c;
  margin: 0;
  font-size: 18px;
}

.modal-form {
  padding: 24px;
}

.warning-box {
  background: #fef2f2;
  color: #991b1b;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 20px;
  border: 1px solid #fecaca;
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-700);
  margin-bottom: 8px;
}

.input-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--gray-300);
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 11px;
  color: var(--gray-500);
  margin-top: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-secondary {
  padding: 10px 16px;
  background: white;
  border: 1px solid var(--gray-300);
  color: var(--gray-700);
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.btn-danger {
  padding: 10px 16px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
