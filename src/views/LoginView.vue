<script setup>
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'vue-router'
import { useAlert } from '@/composables/useAlert'
import AuthVue from '@/components/Auth.vue'

const router = useRouter()
const { showAlert } = useAlert()

const email = ref('')
const password = ref('')
const loading = ref(false)

// 👇 TODO EL CÓDIGO DEBE IR DENTRO DE LA FUNCIÓN DE LOGIN
const handleLogin = async () => {
  loading.value = true
  
  try {
    // 1. Intentamos iniciar sesión con Supabase
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (error) throw error

    // 2. Extraemos al usuario que acaba de loguearse
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // 3. Consultamos la base de datos para ver si está activo
      const { data: perfil } = await supabase
        .from('persona')
        .select('activo')
        .eq('idpersona', user.id)
        .single()

      // 4. Validamos la suspensión
      if (perfil && perfil.activo === false) {
        // 🛑 Destruimos la sesión inmediatamente
        await supabase.auth.signOut()
        showAlert('Tu cuenta ha sido suspendida. Contacta a un administrador.', 'error')
        
        return // 👈 AHORA ES VÁLIDO porque está deteniendo la función handleLogin
      }
      
      // 5. Si no está suspendido, lo dejamos pasar al sistema
      router.push('/dashboard') // Cambia '/dashboard' por la ruta principal de tu app
    }
    
  } catch (error) {
    showAlert('Error al iniciar sesión: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <div class="login-view">
    <AuthVue />
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f4f6f9;
}
</style>