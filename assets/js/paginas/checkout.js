/* ==================================================================
   ARCHIVO: assets/js/paginas/checkout.js   (solo en paginas/checkout.html)
   ================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Finalizar compra:
  // 1. Solo clientes registrados pueden comprar (si no, se pide ingresar).
  // 2. Se autocompletan nombre, correo, teléfono, ciudad y dirección de la cuenta.
  // 3. El pedido se guarda en MySQL (api/pedidos.php), que valida precios y stock.
  // ------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    const form = document.querySelector('[data-checkout-form]');
    if (!form) return;
    await window.StoreReady;

    const { escapeHtml, money, page, toast } = window.StoreCart;
    const auth = window.StoreAuth;
    const gate = document.querySelector('[data-checkout-gate]');
    const layout = document.querySelector('[data-checkout-layout]');
    const error = document.querySelector('[data-checkout-error]');
    const session = auth.getSession();

    // ---------- 1. Exigir cuenta de cliente ----------
    if (!session || session.role !== 'client') {
      gate.hidden = false;
      layout.hidden = true;
      if (session?.role === 'admin') {
        gate.querySelector('[data-gate-title]').textContent = 'Estás como administrador.';
        gate.querySelector('[data-gate-text]').textContent = 'Las compras se hacen con una cuenta de cliente. Cierra sesión del panel e ingresa como cliente.';
        gate.querySelector('[data-gate-actions]').innerHTML = `<a class="button button-dark" href="${page('admin.html')}">Ir al panel <span aria-hidden="true">→</span></a>`;
      }
      return;
    }
    gate.hidden = true;
    layout.hidden = false;

    // ---------- 2. Autocompletar con los datos de la cuenta ----------
    const fields = { name: session.name, email: session.email, phone: session.phone, city: session.city, address: session.address };
    let filled = 0;
    Object.entries(fields).forEach(([name, value]) => {
      if (value && !form.elements[name].value) { form.elements[name].value = value; filled++; }
    });
    document.querySelector('[data-autofill-note]').hidden = filled === 0;

    // Aviso de prenda agotada o con menos unidades, con acceso directo al carrito.
    function showStockError(message) {
      error.innerHTML = `<span class="stock-alert"><strong>Prenda agotada o sin unidades suficientes.</strong> ${escapeHtml(message)} <a href="${page('carrito.html')}">Revisar mi carrito</a></span>`;
      toast('Una prenda de tu pedido se agotó.', { type: 'error', action: { href: page('carrito.html'), label: 'Ir al carrito' } });
    }

    // ---------- 3. Enviar el pedido ----------
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.textContent = '';
      if (!form.reportValidity()) return;
      const cart = window.StoreInventory.getCart();
      if (!cart.length) { error.textContent = 'Agrega al menos un producto antes de confirmar el pedido.'; return; }
      const issues = window.StoreInventory.validateLines(cart);
      if (issues.length) { showStockError(issues.join(' ')); return; }

      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.innerHTML = 'Guardando pedido…';
      const data = new FormData(form);
      try {
        const result = await window.StoreApi('pedidos.php', {
          method: 'POST',
          body: {
            lineas: cart.map((line) => ({ id: line.id, talla: line.size, cantidad: line.quantity })),
            entrega: { nombre: data.get('name'), telefono: data.get('phone'), ciudad: data.get('city'), direccion: data.get('address') },
            pago: data.get('payment')
          }
        });
        const order = result.pedido;
        auth.setUser(result.usuario);              // datos de entrega guardados para la próxima compra
        window.StoreInventory.setCart([]);
        await window.StoreProducts.load().catch(() => {}); // stock actualizado

        layout.hidden = true;
        const panel = document.querySelector('[data-success-panel]');
        panel.hidden = false;
        panel.innerHTML = `<span class="success-mark">✓</span><span class="eyebrow">PEDIDO CONFIRMADO</span><h2>Gracias, ${escapeHtml(order.nombre.split(' ')[0])}.</h2><p>Tu pedido quedó guardado. Puedes verlo en tu cuenta cuando quieras.</p><div class="order-number"><span>NÚMERO DE PEDIDO</span><strong>${escapeHtml(order.id)}</strong></div><div class="summary-total"><span>Total del pedido</span><strong>${money(order.total)}</strong></div><p>${order.envioGratis ? 'Envío gratis. ' : ''}Pago simulado: ${escapeHtml(order.pago)}. No se realizó ningún cobro.</p><a class="button button-dark" href="${page('login.html')}">Ver mis pedidos <span aria-hidden="true">↗</span></a>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        error.textContent = err.message;
        if (err.status === 401) toast('Tu sesión terminó. Ingresa de nuevo.', { type: 'error', action: { href: `${page('login.html')}?volver=checkout`, label: 'Ingresar' } });
        if (err.status === 409) {
          // Otro cliente compró antes: se actualiza el stock y se muestra el aviso de agotado.
          showStockError(err.message);
          await window.StoreProducts.load().then(() => window.dispatchEvent(new CustomEvent('store:cart-updated'))).catch(() => {});
        }
      } finally {
        submit.disabled = false;
        submit.innerHTML = 'Confirmar pedido <span aria-hidden="true">↗</span>';
      }
    });
  });
})();
