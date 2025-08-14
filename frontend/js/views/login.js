import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://cdmesdcgkcvogbgzqobt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbWVzZGNna2N2b2diZ3pxb2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjM3ODIsImV4cCI6MjA2NzEzOTc4Mn0.QODh_sgbLeqNzYkXp8Ng3HflGaqBw5rf_sZHxanpZH8' // solo clave pública
);

// Referencias
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnLogout = document.getElementById('btn-logout');
const authForms = document.getElementById('auth-forms');
const authInfo = document.getElementById('auth-info');
const userEmail = document.getElementById('user-email');
const userRol = document.getElementById('user-rol');

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert('Error al iniciar sesión: ' + error.message);
  await loadUserData(data.user);
}

async function register(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return alert('Error al registrar: ' + error.message);
  alert('Registrado correctamente. Revisa tu correo para confirmar.');
  await supabase
    .from('profiles')
    .insert({ id: data.user.id, full_name: email, rol: 'user' });
}

async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('session');
  location.reload();
}

async function loadUserData(user) {
  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('full_name, rol')
    .eq('id', user.id)
    .single();

  if (error) return alert('Error cargando perfil: ' + error.message);

  // Guarda sesión
  localStorage.setItem('session', JSON.stringify({
    id: user.id,
    email: user.email,
    rol: perfil.rol
  }));

  // Mostrar UI
  userEmail.textContent = user.email;
  userRol.textContent = perfil.rol;
  authForms.classList.add('d-none');
  authInfo.classList.remove('d-none');

  // Redirigir si quieres:
  // window.location.href = './main.html';
}

// Eventos
btnLogin.addEventListener('click', () => login(emailEl.value, passwordEl.value));
btnRegister.addEventListener('click', () => register(emailEl.value, passwordEl.value));
btnLogout.addEventListener('click', logout);

// Si ya hay sesión guardada
const session = JSON.parse(localStorage.getItem('session'));
if (session) {
  userEmail.textContent = session.email;
  userRol.textContent = session.rol;
  authForms.classList.add('d-none');
  authInfo.classList.remove('d-none');
}
