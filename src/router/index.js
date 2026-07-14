import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'

import AppLayout from '@/layouts/AppLayout.vue'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false }
    },
    {
      path: '/forzar-cambio-password',
      name: 'forzar-cambio-password',
      component: () => import('@/views/ForzarCambioPasswordView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: DashboardView
        },
        {
          path: 'pacientes',
          name: 'pacientes',
          component: () => import('@/views/PacientesView.vue'),
          meta: { roles: ['enfermera', 'admin', 'fisioterapeuta'] }
        },
        {
          path: 'citas',
          name: 'citas',
          component: () => import('@/views/CitasView.vue'),
          meta: { roles: ['enfermera', 'fisioterapeuta', 'admin'] }
        },
        {
          path: 'mis-reservas',
          name: 'misreservas',
          component: () => import('@/views/MisReservasView.vue'),
          meta: { roles: ['paciente'] }
        },
        {
          path: 'configuracion',
          name: 'configuracion',
          component: () => import('@/views/ConfiguracionView.vue'),
          meta: { roles: ['admin', 'enfermera'] }
        },
        {
          path: 'mi-perfil',
          name: 'miperfil',
          component: () => import('@/views/PerfilView.vue'),
          meta: { roles: ['enfermera', 'fisioterapeuta', 'admin', 'paciente'] }
        },
        {
          path: 'expedientes',
          name: 'expedientes',
          component: () => import('@/views/ExpedientesView.vue'),
          meta: { roles: ['fisioterapeuta'] }
        },
        {
          path: 'horarios',
          name: 'horarios',
          component: () => import('@/views/HorariosView.vue'),
          meta: { roles: ['fisioterapeuta', 'admin'] }
        },
        {
          path: 'atencion/:idCita',
          name: 'atencion',
          component: () => import('@/views/AtencionView.vue'),
          meta: { roles: ['fisioterapeuta', 'admin'] }
        },
        {
          path: '/paciente/:idPaciente/historia-clinica',
          name: 'HistoriaClinica',
          component: () => import('@/views/HistoriaClinicaView.vue'),
          props: true,
          meta: { roles: ['fisioterapeuta', 'admin'] }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// --- GUARD DE NAVEGACIÓN GLOBAL CON CONTROL DE ROLES ---
router.beforeEach(async (to) => {
  const { data: { user } } = await supabase.auth.getUser()
  const requiereAutenticacion = to.matched.some(record => record.meta.requiresAuth)

  // 1. Si la ruta requiere autenticación y no hay sesión activa -> Expulsar al Login
  if (requiereAutenticacion && !user) {
    return { name: 'login' }
  }

  // 1.5 Si el usuario debe cambiar su contraseña
  if (user) {
    const requiereCambio = user.user_metadata?.requiere_cambio_password === true
    
    // Si requiere cambio y no está yendo a la vista de cambio de password, forzarlo
    if (requiereCambio && to.name !== 'forzar-cambio-password') {
      return { name: 'forzar-cambio-password' }
    }
    
    // Si NO requiere cambio y está intentando ir a la vista de cambio de password, enviarlo al dashboard
    if (!requiereCambio && to.name === 'forzar-cambio-password') {
      return { name: 'dashboard' }
    }
  }

  // 2. Si el usuario ya está logueado e intenta ir al login -> Mandarlo al Dashboard
  if (to.name === 'login' && user) {
    return { name: 'dashboard' }
  }

  const rolesPermitidos = to.matched.find(record => record.meta.roles)?.meta.roles

  if (user && rolesPermitidos) {
    const rawRol = user.user_metadata?.rol || 'paciente'
    const userRol = rawRol === 'fisioterapeuta' ? 'fisioterapeuta' : rawRol

    if (userRol === 'admin') {
      return // Admin pasa libre
    }

    if (!rolesPermitidos.includes(userRol)) {
      return { name: 'dashboard' } // Expulsar si no tiene permisos
    }
  }
})

export default router