<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const router = useRouter()
const { showAlert } = useAlert()

const loading = ref(false)
const nuevaPassword = ref('')
const confirmarPassword = ref('')

const handleChangePassword = async () => {
  if (nuevaPassword.value.length < 6) {
    showAlert('La contraseña debe tener al menos 6 caracteres.', 'warning')
    return
  }
  
  if (nuevaPassword.value !== confirmarPassword.value) {
    showAlert('Las contraseñas no coinciden.', 'error')
    return
  }

  loading.value = true
  try {
    // 1. Actualizar el password y remover la restricción de los metadatos
    const { error } = await supabase.auth.updateUser({
      password: nuevaPassword.value,
      data: { requiere_cambio_password: false }
    })

    if (error) throw error

    showAlert('¡Contraseña actualizada con éxito! Bienvenido.', 'success')
    
    // 2. Redirigir al dashboard/inicio
    router.replace('/')
  } catch (err) {
    showAlert('Error al actualizar la contraseña: ' + err.message, 'error')
  } finally {
    loading.value = false
  }
}

const cerrarSesion = async () => {
  await supabase.auth.signOut()
  router.replace('/login')
}
</script>

<template>
  <div class="forzar-password-container">
    <div class="auth-card">
      <div class="logo-container">
        <div class="shield-logo">
          <!-- Logo UNP simple svg -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shield-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
      </div>

      <h1 class="title">Configura tu nueva contraseña</h1>
      <p class="subtitle">
        Por seguridad, al ser tu primer ingreso, debes crear una contraseña personalizada para tu cuenta universitaria.
      </p>

      <form @submit.prevent="handleChangePassword" class="form-wrapper">
        <div class="input-group">
          <label>Nueva contraseña</label>
          <input 
            type="password" 
            v-model="nuevaPassword" 
            required 
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        <div class="input-group">
          <label>Confirmar contraseña</label>
          <input 
            type="password" 
            v-model="confirmarPassword" 
            required 
            placeholder="Repite tu contraseña"
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="loading">
          <span v-if="loading" class="btn-spinner"></span>
          <span v-else>Guardar y Entrar</span>
        </button>
        
        <button type="button" class="btn-text" @click="cerrarSesion" :disabled="loading">
          Cancelar y cerrar sesión
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.forzar-password-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  padding: 20px;
}

.auth-card {
  background: white;
  padding: 40px;
  border-radius: 16px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.logo-container {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.shield-logo {
  width: 60px;
  height: 60px;
  background: #f0f4f8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1e3c72;
}

.shield-icon {
  width: 32px;
  height: 32px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 12px;
}

.subtitle {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 32px;
}

.form-wrapper {
  text-align: left;
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.input-group input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 15px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.input-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.btn-primary {
  width: 100%;
  padding: 14px;
  background: #1e3c72;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-primary:hover:not(:disabled) {
  background: #152b52;
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-text {
  width: 100%;
  padding: 12px;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 12px;
  transition: color 0.2s;
}

.btn-text:hover:not(:disabled) {
  color: #1f2937;
}

.btn-spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
