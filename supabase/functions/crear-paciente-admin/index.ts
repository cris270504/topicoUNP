import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. Definimos los encabezados CORS permitidos
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // En producción puedes cambiar '*' por tu dominio real
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 2. ATENCIÓN AQUÍ: Interceptar la petición OPTIONS (Preflight del navegador)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extraemos el payload que envías desde Vue
    const body = await req.json()
    const { email, password, nombres, apellidos, rol, tipo_documento, numero_documento, celular, fecha_nacimiento } = body

    // Inicializamos el cliente de Supabase con el SERVICE_ROLE_KEY para tener permisos de Admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Creamos el usuario en auth.users
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { nombres, apellidos, rol, tipo_documento, numero_documento, celular, fecha_nacimiento }
    })

    if (error) throw error

    // 3. Devolvemos el éxito adjuntando los encabezados CORS
    return new Response(
      JSON.stringify({ user_id: data.user.id, message: 'Usuario creado exitosamente' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    // 4. Si hay error, TAMBIÉN debemos devolver los encabezados CORS, o Vue no podrá leer el mensaje
    // Devolvemos 200 para que el cliente (supabase.functions.invoke) no arroje un error genérico y podamos leer el JSON con el mensaje real.
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})