import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Interceptar Preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { user_id, accion } = body

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let resultMsg = '';

    if (accion === 'eliminar') {
      // Eliminar sí funciona correctamente en Auth
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (error) throw new Error(error.message || 'Error desconocido al eliminar')
      resultMsg = 'Usuario eliminado permanentemente del sistema.'
      
    } else if (accion === 'suspender') {
      // Baneo Lógico: Cambiamos a inactivo en tu tabla
      const { error } = await supabaseAdmin.from('persona').update({ activo: false }).eq('idpersona', user_id)
      if (error) throw new Error(error.message || 'Error al suspender en BD')
      resultMsg = 'Cuenta suspendida. El usuario ha perdido los accesos.'
      
    } else if (accion === 'restaurar') {
      // Restauración Lógica
      const { error } = await supabaseAdmin.from('persona').update({ activo: true }).eq('idpersona', user_id)
      if (error) throw new Error(error.message || 'Error al restaurar en BD')
      resultMsg = 'Acceso restaurado con éxito.'
      
    } else {
      throw new Error('Acción no válida solicitada al servidor.')
    }

    return new Response(JSON.stringify({ message: resultMsg }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error: any) {
    // Extractor de errores a prueba de fallos
    const errorMsg = error?.message || error?.msg || String(error)
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})