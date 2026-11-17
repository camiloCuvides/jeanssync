/* ==================================================================
   ARCHIVO: assets/js/paginas/login.js   (solo en paginas/login.html)
   ================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Página de ingreso: clientes (ingresar / crear cuenta) y administrador.
  // Todo se valida en el servidor (api/auth.php) contra la base de datos.
  // ------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    const auth = window.StoreAuth;
    const { escapeHtml, money, page, toast } = window.StoreCart;
    const guest = document.querySelector('[data-auth-guest]');
    const sessionCard = document.querySelector('[data-auth-session]');
    const params = new URLSearchParams(window.location.search);
    const goingToCheckout = params.get('volver') === 'checkout';

    // ---------- Cliente / administrador ----------
    function selectRole(role) {
      document.querySelectorAll('[data-role]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.role === role)));
      document.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== role; });
    }
    document.querySelectorAll('[data-role]').forEach((tab) => tab.addEventListener('click', () => selectRole(tab.dataset.role)));

    // ---------- Ingresar / crear cuenta ----------
    function selectMode(mode) {
      document.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
      document.querySelector('[data-form="client-login"]').hidden = mode !== 'login';
      document.querySelector('[data-form="register"]').hidden = mode !== 'register';
    }
    document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => selectMode(button.dataset.mode)));

    // Mostrar u ocultar la clave.
    document.querySelectorAll('.toggle-password').forEach((button) => button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Ocultar' : 'Ver';
      button.setAttribute('aria-label', show ? 'Ocultar clave' : 'Mostrar clave');
    }));

    // ---------- Envío de formularios ----------
    async function handle(form, action) {
      const error = form.querySelector('[data-error]');
      const submit = form.querySelector('[type="submit"]');
      error.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      const empty = [...form.querySelectorAll('[required]')].find((input) => !input.value.trim());
      if (empty) { error.textContent = 'Completa todos los campos obligatorios.'; empty.focus(); return; }
      submit.disabled = true;
      const result = await action(data);
      submit.disabled = false;
      if (!result.ok) {
        error.textContent = result.message;
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        return;
      }
      form.reset();
      afterLogin();
    }

    document.querySelector('[data-form="client-login"]').addEventListener('submit', (event) => {
      event.preventDefault();
      handle(event.currentTarget, (data) => auth.loginClient(data.email, data.password));
    });
    document.querySelector('[data-form="register"]').addEventListener('submit', (event) => {
      event.preventDefault();
      handle(event.currentTarget, (data) => auth.register(data));
    });
    document.querySelector('[data-form="admin"]').addEventListener('submit', (event) => {
      event.preventDefault();
      handle(event.currentTarget, (data) => auth.loginAdmin(data.user, data.password));
    });

    // ---------- ¿Olvidaste tu clave? (ventana centrada <dialog>) ----------
    // El cliente escribe su correo, el servidor le envía un enlace y la ventana confirma el envío.
    // El cambio de clave se hace en paginas/restablecer.html (lo abre el enlace del correo).
    const modal = document.querySelector('[data-forgot-modal]');
    const forgotForm = modal.querySelector('[data-form="forgot-request"]');
    const forgotSent = modal.querySelector('[data-forgot-sent]');
    const forgotButton = forgotForm.querySelector('[type="submit"]');
    const forgotLabel = forgotButton.querySelector('[data-label]');

    // Muestra el formulario del correo (sent = false) o el aviso de "Revisa tu correo" (sent = true)
    function showForgot(sent) {
      forgotForm.hidden = sent;
      forgotSent.hidden = !sent;
      if (!sent) forgotForm.elements.email.focus();
    }

    function forgotError(message) {
      forgotForm.querySelector('[data-error]').textContent = message;
      forgotForm.classList.remove('shake'); void forgotForm.offsetWidth; forgotForm.classList.add('shake');
    }

    // Abrir: copia el correo que el cliente ya había escrito en "Ingresar"
    document.querySelector('[data-forgot-open]').addEventListener('click', () => {
      forgotForm.reset();
      forgotForm.querySelector('[data-error]').textContent = '';
      forgotForm.elements.email.value = document.querySelector('[data-form="client-login"] [name="email"]').value.trim();
      modal.showModal();
      document.body.classList.add('modal-open');
      showForgot(false);
    });

    // Cerrar: botón ×, "Cancelar", "Entendido", tecla Esc o clic en el fondo oscuro
    const closeModal = () => modal.close();
    modal.addEventListener('close', () => document.body.classList.remove('modal-open'));
    modal.querySelectorAll('[data-forgot-close]').forEach((button) => button.addEventListener('click', closeModal));
    modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
    modal.querySelector('[data-forgot-retry]').addEventListener('click', () => showForgot(false));

    // Enviar el enlace al correo
    forgotForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = forgotForm.elements.email.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) { forgotError('Escribe un correo válido.'); forgotForm.elements.email.focus(); return; }
      forgotForm.querySelector('[data-error]').textContent = '';
      forgotButton.disabled = true;
      forgotLabel.textContent = 'Enviando…';
      const result = await auth.requestReset(email);
      forgotButton.disabled = false;
      forgotLabel.textContent = 'Enviar enlace';
      if (!result.ok) { forgotError(result.message); return; }
      modal.querySelector('[data-forgot-email]').textContent = result.data.correo;
      modal.querySelector('[data-forgot-minutes]').textContent = result.data.minutos;
      showForgot(true);
    });

    // Después de ingresar: el administrador va al panel; el cliente vuelve al pago (si venía de ahí) o ve "Mi cuenta"
    function afterLogin() {
      const session = auth.getSession();
      if (session?.role === 'admin') { window.location.href = page('admin.html'); return; }
      if (goingToCheckout) { window.location.href = page('checkout.html'); return; }
      toast(`¡Hola, ${session.name.split(' ')[0]}!`, { type: 'success' });
      render();
    }

    // ---------- Vista con sesión iniciada ----------
    async function renderOrders(host) {
      try {
        const { pedidos } = await window.StoreApi('pedidos.php');
        host.innerHTML = pedidos.length
          ? `<ul class="order-list">${pedidos.map((order) => `<li><div><strong>${escapeHtml(order.id)}</strong><span>${new Date(order.creado.replace(' ', 'T')).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} · ${order.lineas.reduce((sum, line) => sum + Number(line.cantidad), 0)} prendas · ${escapeHtml(order.ciudad)}</span></div><strong>${money(order.total)}</strong></li>`).join('')}</ul>`
          : '<p class="auth-note">Todavía no tienes pedidos. ¡Tu primer jean te espera!</p>';
      } catch (error) {
        host.innerHTML = `<p class="auth-note">${escapeHtml(error.message)}</p>`;
      }
    }

    // Muestra los formularios (sin sesión) o la tarjeta "Mi cuenta" / "Administrador" (con sesión)
    function render() {
      const session = auth.getSession();
      guest.hidden = Boolean(session);
      sessionCard.hidden = !session;
      if (!session) return;
      const firstName = escapeHtml(session.name.split(' ')[0]);
      if (session.role === 'admin') {
        sessionCard.innerHTML = `<span class="eyebrow">ADMINISTRADOR</span><h1>Hola, ${firstName}.</h1><p class="auth-lead">Tienes la sesión de administrador abierta.</p><a class="button button-dark button-wide" href="${page('admin.html')}">Ir al panel <span aria-hidden="true">→</span></a><button class="link-button" type="button" data-logout>Cerrar sesión</button>`;
      } else {
        const delivery = [session.phone, session.city, session.address].filter(Boolean).map(escapeHtml).join(' · ');
        sessionCard.innerHTML = `<span class="eyebrow">MI CUENTA</span><h1>Hola, ${firstName}.</h1><p class="auth-lead">${escapeHtml(session.email)}${delivery ? `<br><small>${delivery}</small>` : ''}</p><h2 class="auth-subtitle">Mis pedidos</h2><div data-orders><p class="auth-note">Cargando pedidos…</p></div><a class="button button-dark button-wide" href="${page('carrito.html')}">Ir al carrito <span aria-hidden="true">→</span></a><button class="link-button" type="button" data-logout>Cerrar sesión</button>`;
        renderOrders(sessionCard.querySelector('[data-orders]'));
      }
      sessionCard.querySelector('[data-logout]').addEventListener('click', async () => {
        await auth.logout();
        toast('Cerraste sesión.');
        render();
      });
    }

    if (params.get('rol') === 'admin') selectRole('admin');
    if (params.get('modo') === 'registro') selectMode('register');
    if (goingToCheckout) document.querySelector('.auth-lead').textContent = 'Ingresa o crea tu cuenta para finalizar tu compra.';

    await window.StoreReady;
    if (goingToCheckout && auth.getSession()?.role === 'client') { window.location.replace(page('checkout.html')); return; }
    render();
    // ?recuperar=1 (botón "Pedir un enlace nuevo" de restablecer.html): abre de una la ventana
    if (params.get('recuperar') === '1' && !auth.getSession()) document.querySelector('[data-forgot-open]').click();
  });
})();
