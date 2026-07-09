<script setup>
import GlobalAlert from '@/components/GlobalAlert.vue'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'

const router = useRouter()
let realtimeChannel = null // Variable para guardar el canal de escucha

onMounted(() => {
  // Escuchamos los cambios de estado de la sesión (Login / Logout)
  supabase.auth.onAuthStateChange((event, session) => {

    // 1. CUANDO EL USUARIO INICIA SESIÓN (O RECARGA LA PÁGINA ESTANDO DENTRO)
    if (session) {

      // Creamos un canal para escuchar EXCLUSIVAMENTE a su fila en la tabla persona
      realtimeChannel = supabase
        .channel('suspension-listener')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'persona',
            filter: `idpersona=eq.${session.user.id}`
          },
          async (payload) => {
            // 🚨 ¡ALERTA EN VIVO! El admin acaba de actualizar su estado a false
            if (payload.new.activo === false) {
              await supabase.auth.signOut()
              alert('🚨 Tu cuenta ha sido suspendida. Conexión terminada.')
            }
          }
        )
        .subscribe()
    }

    // 2. CUANDO LA SESIÓN SE DESTRUYE (Por suspensión o porque cerró sesión manual)
    if (event === 'SIGNED_OUT') {
      // Apagamos el micrófono de escucha para no consumir memoria
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
      }
      // Lo expulsamos visualmente a la pantalla de Login
      router.push('/') // 👈 Cambia '/' por el path real de tu Login si es distinto
    }
  })
})
</script>

<template>
  <RouterView />
  <GlobalAlert />
</template>