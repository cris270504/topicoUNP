import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
let env = {};
lines.forEach(l => {
  const parts = l.split('=');
  if(parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const sb = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_PUBLISHABLE_KEY']);
async function check() {
    const { data: fisios } = await sb.from('fisioterapeuta').select('idfisioterapeuta, persona(nombres, apellidos), horario(dia_semana, hora_inicio, hora_fin)');
    console.log("FISIOS:", JSON.stringify(fisios, null, 2));

    const { data: servicios } = await sb.from('servicio_topico').select('*');
    console.log("SERVICIOS:", JSON.stringify(servicios, null, 2));
}
check();
