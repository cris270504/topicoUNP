<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../lib/supabaseClient'
import { getUserRole, getUserDisplayName, getUserInitials } from '@/lib/userUtils'

const router = useRouter()
const route = useRoute()

const showUserMenu = ref(false)
const user = ref(null)

const fetchUserData = async () => {
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  user.value = currentUser
}

const userRole = computed(() => getUserRole(user.value))
const displayName = computed(() => getUserDisplayName(user.value))
const userInitials = computed(() => getUserInitials(user.value))

const pageTitle = computed(() => {
  const map = {
    dashboard: 'Dashboard',
    pacientes: 'Control de Pacientes',
    citas: userRole.value === 'paciente' ? 'Mis Citas' : 'Agenda General de Clínica',
    expedientes: 'Expedientes Clínicos',
    configuracion: 'Configuración del Sistema'
  }
  return map[route.name] ?? 'Tópico UNP'
})

const logout = async () => {
  await supabase.auth.signOut()
  router.push({ name: 'login' })
}

const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
}

const closeMenu = () => {
  showUserMenu.value = false
}

onMounted(() => {
  fetchUserData()
})
</script>

<template>
  <header class="navbar" @click.self="closeMenu">

    <div class="navbar-left">
      <h1 class="page-title">{{ pageTitle }}</h1>
    </div>

    <div class="navbar-right">
      <div class="user-menu-wrapper">
        <button class="avatar-btn" @click="toggleUserMenu" title="Mi cuenta">
          <div class="avatar">
            <span class="avatar-text">{{ userInitials }}</span>
          </div>
          <span class="user-name">{{ displayName }}</span>
          <svg class="chevron" :class="{ open: showUserMenu }" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clip-rule="evenodd" />
          </svg>
        </button>

        <Transition name="dropdown">
          <div v-if="showUserMenu" class="user-dropdown">
            <div class="dropdown-header">
              <span class="dropdown-role">{{ userRole }}</span>
            </div>
            <button class="dropdown-item" @click="router.push({ name: 'miperfil' }); closeMenu()">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
                <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
              </svg>
              Mi perfil
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item danger" @click="logout">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd"
                  d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                  clip-rule="evenodd" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        </Transition>
      </div>
      <Transition name="fade-modal">
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
          <div class="modal-window">

            <div class="modal-header">
              <h3>Alta de Nuevo Trabajador</h3>
              <button class="close-x" @click="showModal = false">&times;</button>
            </div>

            <form @submit.prevent="handleCreateUser" class="modal-form">
              <div class="form-grid">

                <div class="input-group">
                  <label for="modal-nombres">Nombres *</label>
                  <input id="modal-nombres" type="text" v-model="nombres" placeholder="Ej: Carlos Alberto" required />
                </div>

                <div class="input-group">
                  <label for="modal-apellidos">Apellidos *</label>
                  <input id="modal-apellidos" type="text" v-model="apellidos" placeholder="Ej: Mendoza Flores"
                    required />
                </div>

                <div class="input-group">
                  <label for="modal-tipo-doc">Tipo de Documento</label>
                  <select id="modal-tipo-doc" v-model="tipoDocumento">
                    <option value="DNI">DNI</option>
                    <option value="CE">Carné de Extranjería</option>
                    <option value="PAS">Pasaporte</option>
                  </select>
                </div>

                <div class="input-group">
                  <label for="modal-num-doc">Número de Documento *</label>
                  <input v-model="numeroDocumento" type="text" :maxlength="tipoDocumento === 'DNI' ? 8 : 15"
                    @input="numeroDocumento = numeroDocumento.replace(/\D/g, '')"
                    placeholder="Ingrese el número de documento" class="form-input" />
                </div>

                <div class="input-group">
                  <label for="modal-celular">Celular</label>
                  <input id="modal-celular" type="text" v-model="celular" placeholder="9 dígitos" maxlength="9" />
                </div>

                <div class="input-group">
                  <label for="modal-rol">Rol del Sistema</label>
                  <select id="modal-rol" v-model="rolSeleccionado">
                    <option value="fisioterapeuta">Personal de Salud</option>
                    <option value="enfermera">enfermera</option>
                  </select>
                </div>

                <div class="input-group span-2">
                  <label for="modal-email">Correo Electrónico Institucional *</label>
                  <input id="modal-email" type="email" v-model="email" placeholder="usuario@unp.edu.pe" required />
                </div>

                <div class="input-group span-2">
                  <label for="modal-password">Contraseña Temporal de Acceso *</label>
                  <input id="modal-password" type="password" v-model="password" placeholder="Mínimo 6 caracteres"
                    required />
                </div>

                <Transition name="slide-input">
                  <div v-if="rolSeleccionado === 'fisioterapeuta'" class="form-grid span-2"
                    style="margin-top: 0; gap: 1rem;">
                    <div class="input-group">
                      <label for="modal-tipo-personal">Área Médica *</label>
                      <select id="modal-tipo-personal" v-model="tipoPersonal">
                        <option value="medico">Médico General</option>
                        <option value="enfermero">Enfermería</option>
                        <option value="odontologo">Odontología</option>
                        <option value="psicologo">Psicología</option>
                        <option value="triaje">Triaje</option>
                      </select>
                    </div>

                    <div class="input-group">
                      <label for="modal-especialidad">Especialidad Terapéutica *</label>
                      <input id="modal-especialidad" type="text" v-model="especialidad"
                        placeholder="Ej: Medicina Familiar / Psicoterapia" required />
                    </div>
                  </div>
                </Transition>

              </div>

              <div class="modal-actions">
                <button type="button" class="btn-secondary" @click="showModal = false">Cancelar</button>
                <button type="submit" class="btn-primary-submit" :disabled="loading">
                  <span v-if="loading" class="btn-spinner"></span>
                  <span v-else>Confirmar Registro</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      </Transition>
    </div>
  </header>
</template>

<style scoped>
.navbar {
  --navy: #1a3a6e;
  --blue: #4a90c4;
  --white: #ffffff;
  --gray-50: #f8fafc;
  --gray-100: #f1f5f9;
  --gray-300: #cbd5e1;
  --gray-500: #64748b;
  --gray-700: #334155;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  height: 60px;
  background: var(--white);
  border-bottom: 1px solid var(--gray-100);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 1px 6px rgba(26, 58, 110, 0.07);
  position: sticky;
  top: 0;
  z-index: 50;
  font-family: 'DM Sans', sans-serif;
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--navy);
  margin: 0;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: none;
  background: var(--gray-50);
  color: var(--gray-500);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.icon-btn:hover {
  background: var(--gray-100);
  color: var(--navy);
}

.icon-btn svg {
  width: 18px;
  height: 18px;
}

.notif-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid var(--white);
  font-size: 0;
}

.user-menu-wrapper {
  position: relative;
}

.avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 5px;
  border-radius: 10px;
  border: 1.5px solid var(--gray-100);
  background: var(--gray-50);
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition);
}

.avatar-btn:hover {
  background: var(--gray-100);
  border-color: var(--gray-300);
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--navy), var(--blue));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-text {
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  width: 14px;
  height: 14px;
  color: var(--gray-500);
  transition: transform var(--transition);
}

.chevron.open {
  transform: rotate(180deg);
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 200px;
  background: var(--white);
  border: 1px solid var(--gray-100);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 28px rgba(26, 58, 110, 0.14);
  z-index: 200;
}

.dropdown-header {
  padding: 6px 12px 4px;
  display: flex;
  flex-direction: column;
}

.dropdown-role {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--blue);
  letter-spacing: 0.5px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: none;
  border-radius: 8px;
  font-family: 'DM Sans', sans-serif;
  font-size: 13.5px;
  color: var(--gray-700);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition), color var(--transition);
}

.dropdown-item svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--gray-500);
}

.dropdown-item:hover {
  background: var(--gray-50);
  color: var(--navy);
}

.dropdown-item.danger {
  color: #ef4444;
}

.dropdown-item.danger:hover {
  background: #fef2f2;
}

.dropdown-divider {
  height: 1px;
  background: var(--gray-100);
  margin: 4px 0;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 480px) {
  .user-name {
    display: none;
  }

  .navbar {
    padding: 0 14px;
  }
}
</style>