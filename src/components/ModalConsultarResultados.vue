<script setup>
import { computed } from 'vue'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  cita: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close'])

const parseFrecuencia = (frecuencia, cantidad) => {
  if (!cantidad || cantidad <= 0) return 'Ninguna'
  if (!frecuencia) return 'A demanda'
  return `${cantidad} sesión(es) - ${frecuencia.charAt(0).toUpperCase() + frecuencia.slice(1)}`
}

const formatDate = (iso) => {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(iso))
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window modern-modal">
        
        <!-- Header -->
        <div class="modal-header">
          <div class="header-titles">
            <span class="badge">Resultados Clínicos</span>
            <h3>Atención de Fisioterapia</h3>
            <p class="fecha-atencion">{{ formatDate(cita.fecha_hora) }}</p>
          </div>
          <button class="close-x" @click="emit('close')">&times;</button>
        </div>

        <div class="modal-content-scroll">
          
          <!-- Bloque de Diagnóstico -->
          <div class="info-section">
            <div class="section-icon diagnostic-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
            </div>
            <div class="section-content">
              <h4>Diagnóstico y Hallazgos</h4>
              <div class="data-box diagnostic-box">
                {{ cita.diagnostico_descripcion || 'No se registraron hallazgos específicos en esta sesión.' }}
              </div>
            </div>
          </div>

          <!-- Bloque de Indicaciones / Receta -->
          <div class="info-section">
            <div class="section-icon prescription-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div class="section-content">
              <h4>Indicaciones Médicas y Cuidados</h4>
              <div class="data-box prescription-box">
                {{ cita.tratamiento_recetado || 'No hay indicaciones registradas para el domicilio.' }}
              </div>
            </div>
          </div>

          <!-- Bloque de Plan de Tratamiento -->
          <div class="info-section">
            <div class="section-icon plan-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
            <div class="section-content">
              <h4>Plan de Tratamiento Sugerido</h4>
              
              <div class="plan-card" v-if="cita.cantidad_sesiones_recomendadas > 0">
                <div class="plan-details">
                  <div class="plan-item">
                    <span class="label">Cantidad:</span>
                    <span class="value">{{ cita.cantidad_sesiones_recomendadas }} sesiones</span>
                  </div>
                  <div class="plan-item">
                    <span class="label">Frecuencia:</span>
                    <span class="value">{{ cita.frecuencia_sesiones_recomendadas || 'A demanda' }}</span>
                  </div>
                </div>
                <div class="plan-footer-msg">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                  <span>Por favor comuníquese con recepción para agendar la continuidad de su tratamiento según lo indicado.</span>
                </div>
              </div>

              <div class="plan-card alta-card" v-else>
                <div class="alta-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  <p>Atención completada satisfactoriamente. No se ha requerido programar más sesiones obligatorias.</p>
                </div>
              </div>

            </div>
          </div>

        </div>

        <div class="modal-footer">
          <button class="btn-primary" @click="emit('close')">Cerrar Resultados</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modern-modal {
  max-width: 600px;
  width: 95%;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
}

/* Header Estilizado */
.modal-header {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  padding: 30px 30px 24px;
  position: relative;
  border-bottom: none;
}

.header-titles {
  color: white;
}

.badge {
  background: rgba(255, 255, 255, 0.2);
  color: #e2e8f0;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 12px;
  display: inline-block;
}

.header-titles h3 {
  margin: 0 0 4px 0;
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
}

.fecha-atencion {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
}

.close-x {
  position: absolute;
  top: 20px;
  right: 20px;
  color: rgba(255,255,255,0.5);
  font-size: 28px;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}
.close-x:hover { color: white; }

/* Contenido Principal */
.modal-content-scroll {
  padding: 30px;
  max-height: 65vh;
  overflow-y: auto;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Secciones de Información */
.info-section {
  display: flex;
  gap: 20px;
}

.section-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.section-icon svg { width: 24px; height: 24px; }

.diagnostic-icon { background: #fee2e2; color: #ef4444; }
.prescription-icon { background: #e0e7ff; color: #6366f1; }
.plan-icon { background: #dcfce7; color: #22c55e; }

.section-content {
  flex-grow: 1;
}

.section-content h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  height: 48px; /* Para alinear con el icono */
}

/* Cajas de Datos */
.data-box {
  background: white;
  padding: 16px 20px;
  border-radius: 12px;
  font-size: 14.5px;
  color: #475569;
  line-height: 1.6;
  white-space: pre-wrap;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.diagnostic-box { border-left: 4px solid #ef4444; }
.prescription-box { border-left: 4px solid #6366f1; }

/* Tarjetas de Plan */
.plan-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.plan-details {
  display: flex;
  background: white;
}

.plan-item {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.plan-item:first-child { border-right: 1px solid #f1f5f9; }

.plan-item .label {
  font-size: 12px;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.plan-item .value {
  font-size: 16px;
  color: #0f172a;
  font-weight: 600;
}

.plan-footer-msg {
  background: #f8fafc;
  padding: 12px 20px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: #64748b;
  border-top: 1px solid #f1f5f9;
}
.plan-footer-msg svg { flex-shrink: 0; color: #94a3b8; margin-top: 2px; }

/* Alta Médica */
.alta-card {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.alta-content {
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  color: #166534;
}
.alta-content svg { width: 32px; height: 32px; flex-shrink: 0; }
.alta-content p { margin: 0; font-size: 14px; line-height: 1.5; font-weight: 500; }

/* Footer */
.modal-footer {
  padding: 20px 30px;
  background: white;
  border-top: 1px solid #e2e8f0;
  text-align: right;
}

.btn-primary {
  background: #1e293b;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover { background: #0f172a; }

@media (max-width: 600px) {
  .modal-header { padding: 24px 20px; }
  .modal-content-scroll { padding: 20px; gap: 24px; }
  .info-section { flex-direction: column; gap: 12px; }
  .section-icon { width: 40px; height: 40px; }
  .section-content h4 { height: auto; margin-bottom: 8px; }
  .plan-details { flex-direction: column; }
  .plan-item:first-child { border-right: none; border-bottom: 1px solid #f1f5f9; }
}
</style>
