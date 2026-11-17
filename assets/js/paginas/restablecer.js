/* ==================================================================
   ARCHIVO: assets/js/paginas/restablecer.js   (solo en paginas/restablecer.html)
   Cambiar la clave desde el enlace que llega al correo ("¿Olvidaste tu clave?").
     1. Lee el token de la dirección (?token=...)
     2. Pregunta al servidor si el enlace sirve  → auth.checkResetLink
     3. Si sirve, muestra el formulario; si no, el aviso de enlace vencido
     4. Guarda la clave nueva e inicia sesión     → auth.resetPassword
   ================================================================== */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async () => {
    const auth = window.StoreAuth;
    const { toast } = window.StoreCart;
    const form = document.querySelector('[data-form="reset"]');
    const errorBox = form.querySelector('[data-error]');
    const submit = form.querySelector('[type="submit"]');
    const submitLabel = submit.querySelector('[data-label]');

    // El token va en la dirección: restablecer.html?token=abc123...
    const token = new URLSearchParams(window.location.search).get('token') || '';
    // Se quita de la barra de direcciones para que no quede a la vista ni en el historial
    window.history.replaceState(null, '', window.location.pathname);

    // Muestra solo una vista: 'checking' | 'form' | 'invalid' | 'done'
    function showView(name) {
      document.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== name; });
    }

    function showError(message) {
      errorBox.textContent = message;
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    }

    // Mostrar u ocultar la clave
    document.querySelectorAll('.toggle-password').forEach((button) => button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Ocultar' : 'Ver';
      button.setAttribute('aria-label', show ? 'Ocultar clave' : 'Mostrar clave');
    }));

    // ---------- 1-3. Revisar el enlace ----------
    await window.StoreReady;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      document.querySelector('[data-invalid-message]').textContent = 'El enlace está incompleto. Ábrelo de nuevo desde el correo o pide uno nuevo.';
      showView('invalid');
      return;
    }
    const check = await auth.checkResetLink(token);
    if (!check.ok) {
      document.querySelector('[data-invalid-message]').textContent = check.message;
      showView('invalid');
      return;
    }
    form.querySelector('[data-reset-name]').textContent = check.data.nombre.split(' ')[0];
    form.querySelector('[data-reset-email]').textContent = check.data.correo;
    showView('form');
    form.elements.password.focus();

    // ---------- 4. Guardar la clave nueva ----------
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.textContent = '';
      const { password, confirm } = form.elements;
      if (password.value.length < 6) { showError('La clave nueva debe tener al menos 6 caracteres.'); password.focus(); return; }
      if (password.value !== confirm.value) { showError('Las dos claves no coinciden.'); confirm.focus(); return; }

      submit.disabled = true;
      submitLabel.textContent = 'Guardando…';
      const result = await auth.resetPassword(token, password.value);
      submit.disabled = false;
      submitLabel.textContent = 'Guardar clave nueva';
      if (!result.ok) { showError(result.message); return; }

      form.reset();
      showView('done');
      toast('Listo, cambiaste tu clave.', { type: 'success' });
    });
  });
})();
