/* ==================================================================
   ARCHIVO: assets/js/nucleo/auth.js   (3.º script de cada página)
   - StoreAuth → sesión: getSession(), loginClient(), loginAdmin(), register(), logout(),
                 requestReset(), checkResetLink() y resetPassword() para "¿Olvidaste tu clave?"
   - StoreReady → promesa que se cumple cuando ya cargaron productos y sesión;
                  las demás páginas esperan "await window.StoreReady" antes de pintar.
   - Cambia el botón de cuenta del menú: Ingresar / Hola, nombre / Panel admin
   Habla con api/auth.php.
   ================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Sesión de JeansSync (clientes y administrador) contra api/auth.php.
  // La sesión vive en el servidor (cookie de PHP) y las claves se guardan
  // en MySQL con password_hash(). Aquí solo se guarda una copia en memoria.
  // ------------------------------------------------------------------

  const ROOT = document.body?.dataset.root || '';
  const page = (file) => `${ROOT}paginas/${file}`;
  const api = window.StoreApi;
  let user = null;

  // Convierte el usuario del servidor al formato que usan las páginas.
  function toSession(data) {
    if (!data) return null;
    return {
      id: data.id,
      role: data.rol === 'admin' ? 'admin' : 'client',
      name: data.nombre,
      email: data.correo,
      phone: data.telefono || '',
      city: data.ciudad || '',
      address: data.direccion || ''
    };
  }

  // Guarda el usuario en memoria, actualiza el menú y avisa a la página (evento "store:session-changed")
  function setUser(data) {
    user = toSession(data);
    updateAccountLinks();
    window.dispatchEvent(new CustomEvent('store:session-changed'));
    return user;
  }

  // Usuario actual o null: { id, role: 'client'|'admin', name, email, phone, city, address }
  const getSession = () => user;

  // Pregunta al servidor quién tiene la sesión abierta
  async function refresh() {
    const data = await api('auth.php');
    return setUser(data.usuario);
  }

  // Envía una acción a api/auth.php (login, registro, salir...) y devuelve { ok, message }
  async function call(body) {
    try {
      const data = await api('auth.php', { method: 'POST', body });
      setUser(data.usuario);
      return { ok: true, user };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  // Atajos para cada acción de api/auth.php
  const loginClient = (email, password) => call({ accion: 'login', correo: email, clave: password });
  const loginAdmin = (username, password) => call({ accion: 'admin', usuario: username, clave: password });
  const register = ({ name, email, password, phone, city, address }) => call({ accion: 'registro', nombre: name, correo: email, clave: password, telefono: phone, ciudad: city, direccion: address });
  const logout = () => call({ accion: 'salir' });

  // Envía una acción que no cambia la sesión y devuelve { ok, data, message }
  async function send(body) {
    try {
      const data = await api('auth.php', { method: 'POST', body });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }
  // ¿Olvidaste tu clave?
  // 1. requestReset   → envía al correo del cliente el enlace (data: { correo, minutos })
  // 2. checkResetLink → la página restablecer.html revisa si el enlace sirve (data: { nombre, correo })
  // 3. resetPassword  → guarda la clave nueva e inicia sesión
  const requestReset = (email) => send({ accion: 'recuperar', correo: email });
  const checkResetLink = (token) => send({ accion: 'validar_enlace', token });
  const resetPassword = (token, password) => call({ accion: 'restablecer', token, clave: password });

  // Protege páginas que solo puede ver el administrador.
  function requireAdmin() {
    if (user?.role === 'admin') return true;
    window.location.replace(`${page('login.html')}?rol=admin`);
    return false;
  }

  // ---------- Enlace de cuenta en el menú ----------
  function updateAccountLinks() {
    document.querySelectorAll('[data-account-link]').forEach((link) => {
      if (user?.role === 'admin') {
        link.href = page('admin.html');
        link.innerHTML = '<span class="account-icon" aria-hidden="true">★</span><span class="account-text">Panel admin</span>';
      } else if (user) {
        const first = user.name.trim().split(' ')[0].replace(/[<>&"']/g, '');
        link.href = page('login.html');
        link.innerHTML = `<span class="account-icon" aria-hidden="true">${first.charAt(0).toUpperCase()}</span><span class="account-text">Hola, ${first}</span>`;
      } else {
        link.href = page('login.html');
        link.innerHTML = '<span class="account-icon" aria-hidden="true">●</span><span class="account-text">Ingresar</span>';
      }
    });
  }

  // Aviso visible cuando no hay conexión con XAMPP o la base de datos.
  function showServerError(message) {
    const banner = document.createElement('div');
    banner.className = 'server-error';
    banner.setAttribute('role', 'alert');
    const isFile = window.location.protocol === 'file:';
    banner.innerHTML = `<strong>No se pudo cargar la tienda.</strong> <span>${isFile
      ? 'Ábrela desde XAMPP: <a href="http://localhost/jeanssync/">http://localhost/jeanssync/</a>'
      : String(message).replace(/[<>&]/g, '')}</span>`;
    document.body.prepend(banner);
  }

  // Todas las páginas esperan esta promesa antes de pintar productos o datos del usuario.
  window.StoreReady = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', async () => {
      try {
        await Promise.all([window.StoreProducts.load(), refresh()]);
      } catch (error) {
        showServerError(error.message);
      }
      resolve();
    });
  });

  window.StoreAuth = { getSession, refresh, setUser, loginAdmin, loginClient, register, logout, requestReset, checkResetLink, resetPassword, requireAdmin, page };
})();
