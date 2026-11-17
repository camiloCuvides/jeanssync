/* ==================================================================
   ARCHIVO: assets/js/nucleo/carrito.js
   Se carga en TODAS las páginas. Contiene:
     1. Utilidades ........ formato de pesos (money), escapeHtml, aviso emergente (toast)
     2. Envío gratis ...... cálculo y barra de progreso hacia $250.000
     3. Agregar al carrito  addToCart (valida talla y unidades disponibles)
     4. Tarjeta de producto productCard / refreshCard / handleCardClick
                           (foto, precio, tallas, cantidad, agotados)
     5. Página del carrito  renderCart (lista, avisos de agotado, resumen)
     6. Resumen del pago .. renderCheckoutSummary (lo usa checkout.html)
     7. Arranque .......... menú del celular, anuncios que rotan, menú fijo,
                           listado de cada colección y actualizaciones
   Lo que otras páginas pueden usar queda en window.StoreCart (al final).
   ================================================================== */
(function () {
  'use strict';

  // ========== 1. UTILIDADES ==========
  // Formato de pesos colombianos: money(149900) → "$ 149.900"
  const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const money = (value) => currency.format(value);
  // Evita que un texto con < > " rompa el HTML (se usa con nombres, correos, etc.)
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const inventory = window.StoreInventory;
  // Envío gratis desde este valor (mismo valor que ENVIO_GRATIS_DESDE en api/config.php)
  const FREE_SHIPPING_FROM = 250000;
  // Ruta a la raíz del sitio: '' en index.html y '../' en las páginas dentro de /paginas.
  const ROOT = document.body.dataset.root || '';
  const page = (file) => `${ROOT}paginas/${file}`;

  let toastTimer;
  // Muestra un aviso abajo de la pantalla por 3,2 s. type: 'info' | 'success' | 'error'; action: enlace opcional {href, label}
  function toast(message, { type = 'info', action } = {}) {
    let node = document.querySelector('[data-toast]');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      node.dataset.toast = '';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.className = `toast toast-${type}`;
    node.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<a href="${action.href}">${escapeHtml(action.label)}</a>` : ''}`;
    requestAnimationFrame(() => node.classList.add('toast-visible'));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.classList.remove('toast-visible'), 3200);
  }

  // ========== 2. ENVÍO GRATIS ==========
  // Calcula si el pedido ya tiene envío gratis y cuánto falta (para la barra de progreso)
  function shippingInfo(subtotal) {
    const free = subtotal >= FREE_SHIPPING_FROM;
    return { free, missing: Math.max(0, FREE_SHIPPING_FROM - subtotal), progress: Math.min(100, Math.round((subtotal / FREE_SHIPPING_FROM) * 100)) };
  }

  // HTML de la fila "Envío" + barra de progreso + texto "Te faltan $X para envío gratis"
  function shippingRows(subtotal) {
    const info = shippingInfo(subtotal);
    const row = `<div class="summary-row"><span>Envío</span><span>${info.free ? '<strong class="shipping-free">Gratis</strong>' : 'Se calcula al entregar'}</span></div>`;
    const meter = info.free
      ? '<p class="shipping-meter-text">¡Tu pedido tiene envío gratis!</p>'
      : `<p class="shipping-meter-text">Te faltan <strong>${money(info.missing)}</strong> para envío gratis.</p>`;
    return `${row}<div class="shipping-meter" aria-hidden="true"><span style="width:${info.progress}%"></span></div>${meter}`;
  }

  // Total de prendas en el carrito (suma de cantidades)
  function lineCount() {
    return inventory.getCart().reduce((sum, line) => sum + line.quantity, 0);
  }

  // Actualiza todos los contadores del carrito (menú y título de carrito.html)
  function updateCounts() {
    document.querySelectorAll('[data-cart-count]').forEach((node) => { node.textContent = lineCount(); });
  }

  // ========== 3. AGREGAR AL CARRITO ==========
  // Agrega una prenda validando talla y unidades. Devuelve { ok, message }
  function addToCart(productId, size, quantity = 1) {
    const product = window.StoreProducts.find(productId);
    if (!product || !size) return { ok: false, message: 'Selecciona una talla antes de agregar.' };
    const cart = inventory.getCart();
    const existing = cart.find((line) => line.id === productId && line.size === size);
    const requested = (existing?.quantity || 0) + quantity;
    const stock = inventory.getStock(productId, size);
    if (stock === 0) return { ok: false, message: `Lo sentimos, "${product.name}" en talla ${size} está agotado. Prueba con otra talla.` };
    if (requested > stock) {
      return {
        ok: false,
        message: existing
          ? `Ya tienes ${existing.quantity} en tu carrito y solo hay ${unitsText(stock)} en talla ${size}.`
          : `Solo hay ${unitsText(stock)} disponible${stock === 1 ? '' : 's'} en talla ${size}.`
      };
    }
    if (existing) existing.quantity = requested;
    else cart.push({ id: productId, size, quantity });
    inventory.setCart(cart);
    return { ok: true, message: `${product.name} se agregó al carrito.` };
  }

  // ========== 4. TARJETA DE PRODUCTO: foto, precio, tallas y cantidad ==========

  // Desde cuántas unidades se considera "pocas" (mismo valor que STOCK_BAJO en api/config.php).
  const LOW_STOCK = 3;
  const unitsText = (n) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

  // Cuántas unidades de esa talla ya están en el carrito
  function inCart(id, size) {
    return inventory.getCart().find((line) => line.id === id && line.size === size)?.quantity || 0;
  }

  // Unidades que todavía se pueden agregar de una talla (stock menos lo que ya está en el carrito).
  function available(id, size) {
    return Math.max(0, inventory.getStock(id, size) - inCart(id, size));
  }

  // Arma el HTML de una tarjeta de producto (foto en arco, precio, tallas, cantidad y botón Agregar)
  function productCard(product, index) {
    const name = escapeHtml(product.name);
    // Las tallas agotadas siguen siendo "clicables" para poder explicarle al cliente por qué no se pueden elegir.
    const sizes = product.sizes.map((size) => {
      const soldOut = inventory.getStock(product.id, size) === 0;
      return `<button type="button" class="size-chip${soldOut ? ' is-soldout' : ''}" data-size="${escapeHtml(size)}" aria-pressed="false"${soldOut ? ' aria-disabled="true" title="Talla agotada"' : ''}>${escapeHtml(size)}</button>`;
    }).join('');
    const total = inventory.totalStock(product.id);
    const fewLeft = product.sizes.some((size) => { const units = inventory.getStock(product.id, size); return units > 0 && units <= LOW_STOCK; });
    const badge = total === 0 ? '' : fewLeft ? '<span class="stock-badge stock-low">¡Últimas unidades!</span>' : '';
    const soldOutOverlay = total === 0 ? '<span class="soldout-overlay"><strong>Agotado</strong><small>Muy pronto vuelve</small></span>' : '';
    return `<article class="product-card reveal${total === 0 ? ' is-soldout' : ''}" style="--delay:${(index % 4) * 70}ms" data-product-id="${product.id}">
      <div class="product-photo">
        <img src="${escapeHtml(product.image)}" alt="${name}, jean de ${escapeHtml(product.categoryLabel.toLowerCase())}" loading="lazy">
        <span class="product-ref">${product.reference}</span>${badge}${soldOutOverlay}
      </div>
      <div class="product-info">
        <div class="product-head"><h3>${name}</h3><strong class="product-price">${money(product.price)}</strong></div>
        <p>${escapeHtml(product.description)}</p>
        <div class="size-picker" role="group" aria-label="Talla de ${name}">
          <span class="picker-label">Talla</span>
          <div class="size-chips">${sizes}</div>
        </div>
        <span class="stock-note" data-stock-note aria-live="polite">Elige tu talla</span>
        <div class="product-actions">
          <div class="qty-stepper" role="group" aria-label="Cantidad de ${name}">
            <button type="button" data-qty="-1" aria-label="Quitar una unidad">−</button>
            <output data-qty-value aria-live="polite">1</output>
            <button type="button" data-qty="1" aria-label="Agregar una unidad">+</button>
          </div>
          <button class="add-button" data-add type="button">Agregar <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </article>`;
  }

  // Lee el estado de una tarjeta: producto, talla elegida y cantidad
  function cardState(card) {
    return { id: card.dataset.productId, size: card.dataset.size || '', qty: Number(card.querySelector('[data-qty-value]').textContent) || 1 };
  }

  // Cambia la cantidad de la tarjeta sin pasar de las unidades disponibles
  function setQty(card, qty) {
    const { id, size } = cardState(card);
    const max = size ? available(id, size) : 10;
    const value = Math.min(Math.max(1, qty), Math.max(1, max));
    card.querySelector('[data-qty-value]').textContent = value;
    card.querySelector('[data-qty="-1"]').disabled = value <= 1;
    card.querySelector('[data-qty="1"]').disabled = value >= max;
  }

  // Actualiza una tarjeta según el stock: tallas tachadas, "Agotado", "¡Solo quedan N!", botón Agregar
  function refreshCard(card) {
    const { id, size, qty } = cardState(card);
    const note = card.querySelector('[data-stock-note]');
    const addButton = card.querySelector('[data-add]');
    card.querySelectorAll('.size-chip').forEach((chip) => {
      const soldOut = inventory.getStock(id, chip.dataset.size) === 0;
      chip.classList.toggle('is-soldout', soldOut);
      if (soldOut) { chip.setAttribute('aria-disabled', 'true'); chip.title = 'Talla agotada'; } else { chip.removeAttribute('aria-disabled'); chip.removeAttribute('title'); }
    });

    // Producto completamente agotado.
    if (inventory.totalStock(id) === 0) {
      card.classList.add('is-soldout');
      note.textContent = 'Este jean se agotó en todas las tallas. Muy pronto volverá a estar disponible.';
      note.className = 'stock-note stock-out';
      addButton.disabled = true;
      if (!addButton.classList.contains('is-added')) addButton.textContent = 'Agotado';
      setQty(card, 1);
      return;
    }
    card.classList.remove('is-soldout');
    addButton.disabled = false;
    if (!addButton.classList.contains('is-added')) addButton.innerHTML = 'Agregar <span aria-hidden="true">→</span>';

    if (!size) {
      note.textContent = 'Elige tu talla';
      note.className = 'stock-note';
    } else {
      const left = available(id, size);
      const stock = inventory.getStock(id, size);
      if (stock === 0) {
        note.textContent = `La talla ${size} está agotada. Elige otra talla.`;
        note.className = 'stock-note stock-out';
      } else if (left === 0) {
        note.textContent = 'Ya tienes en tu carrito todas las unidades disponibles de esta talla.';
        note.className = 'stock-note stock-low';
      } else if (left <= LOW_STOCK) {
        note.textContent = left === 1 ? `¡Última unidad en talla ${size}!` : `¡Solo quedan ${left} en talla ${size}!`;
        note.className = 'stock-note stock-low';
      } else {
        note.textContent = `${unitsText(left)} disponibles`;
        note.className = 'stock-note stock-ok';
      }
      addButton.disabled = left === 0;
    }
    setQty(card, qty);
  }

  // Animación de "salto" del contador del carrito en el menú
  function bumpCartCount() {
    document.querySelectorAll('.cart-link').forEach((link) => {
      link.classList.remove('cart-bump');
      void link.offsetWidth; // reinicia la animación
      link.classList.add('cart-bump');
    });
  }

  // Maneja los clics dentro de las tarjetas: elegir talla, + / − cantidad y Agregar
  function handleCardClick(event) {
    const card = event.target.closest('[data-product-id]');
    if (!card) return;
    const chip = event.target.closest('.size-chip');
    const qtyButton = event.target.closest('[data-qty]');
    const addButton = event.target.closest('[data-add]');

    if (chip && chip.classList.contains('is-soldout')) {
      const product = window.StoreProducts.find(card.dataset.productId);
      chip.classList.remove('shake'); void chip.offsetWidth; chip.classList.add('shake');
      toast(`La talla ${chip.dataset.size} de "${product.name}" está agotada. Prueba con otra talla o vuelve pronto.`, { type: 'error' });
      return;
    }
    if (chip) {
      card.dataset.size = chip.dataset.size;
      card.querySelectorAll('.size-chip').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
      card.classList.remove('needs-size');
      refreshCard(card);
    }
    if (qtyButton) {
      if (!card.dataset.size) { askForSize(card); return; }
      setQty(card, cardState(card).qty + Number(qtyButton.dataset.qty));
    }
    if (addButton) {
      const { id, size, qty } = cardState(card);
      if (!size) { askForSize(card); return; }
      const result = addToCart(id, size, qty);
      if (!result.ok) { toast(result.message, { type: 'error' }); return; }
      toast(`${qty} × ${window.StoreProducts.find(id).name} (talla ${size}) en tu carrito.`, { type: 'success', action: { href: page('carrito.html'), label: 'Ver carrito' } });
      addButton.classList.add('is-added');
      addButton.innerHTML = '✓ Agregado';
      bumpCartCount();
      window.setTimeout(() => { addButton.classList.remove('is-added'); addButton.innerHTML = 'Agregar <span aria-hidden="true">→</span>'; }, 1400);
      card.querySelector('[data-qty-value]').textContent = 1;
      refreshCard(card);
    }
  }

  // Si no eligieron talla: sacude los botones de talla y muestra "Primero elige una talla"
  function askForSize(card) {
    card.classList.remove('needs-size');
    void card.offsetWidth;
    card.classList.add('needs-size');
    card.querySelector('[data-stock-note]').textContent = 'Primero elige una talla';
    card.querySelector('[data-stock-note]').className = 'stock-note stock-low';
    card.querySelector('.size-chip:not(.is-soldout)')?.focus();
  }

  // Aparición suave de las tarjetas al hacer scroll.
  const revealObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;

  // Activa la animación de aparición en los elementos con la clase .reveal
  function observeReveal(root = document) {
    root.querySelectorAll('.reveal:not(.is-visible)').forEach((node) => {
      if (revealObserver) revealObserver.observe(node); else node.classList.add('is-visible');
    });
  }

  // Dibuja una lista de productos dentro de un contenedor (colecciones e inicio)
  function renderCards(container, products) {
    if (!container) return;
    container.innerHTML = products.map(productCard).join('');
    if (!container.dataset.bound) {
      container.addEventListener('click', handleCardClick);
      container.dataset.bound = 'true';
    }
    container.querySelectorAll('[data-product-id]').forEach(refreshCard);
    observeReveal(container);
  }

  // Suma el subtotal del carrito con los precios actuales
  function totals(lines) {
    const subtotal = lines.reduce((sum, line) => {
      const product = window.StoreProducts.find(line.id);
      return sum + product.finalPrice * line.quantity;
    }, 0);
    return { subtotal, total: subtotal };
  }

  // ========== 5. PÁGINA DEL CARRITO ==========
  // Dibuja carrito.html: prendas, avisos de agotado/menos unidades y el resumen con el botón para pagar
  function renderCart() {
    const host = document.querySelector('[data-cart-items]');
    const summary = document.querySelector('[data-cart-summary]');
    if (!host || !summary) return;
    const cart = inventory.getCart();
    if (!cart.length) {
      host.innerHTML = '<div class="empty-cart"><span class="empty-mark">I</span><h2>Tu próximo jean te espera.</h2><p>El carrito está vacío por ahora.</p><div class="empty-actions"><a class="button button-dark" href="' + page('caballero.html') + '">Caballero <span>↗</span></a><a class="button button-dark" href="' + page('dama.html') + '">Dama <span>↗</span></a><a class="button button-dark" href="' + page('ninos.html') + '">Niños <span>↗</span></a></div></div>';
      summary.innerHTML = '';
      return;
    }
    let blocked = false;
    host.innerHTML = cart.map((line) => {
      const product = window.StoreProducts.find(line.id);
      const stock = inventory.getStock(line.id, line.size);
      let warning = '';
      if (stock === 0) {
        blocked = true;
        warning = `<div class="cart-warning is-out" role="alert"><strong>Agotado.</strong> Esta talla se acabó mientras comprabas. Retírala del carrito para continuar.</div>`;
      } else if (line.quantity > stock) {
        blocked = true;
        warning = `<div class="cart-warning" role="alert"><strong>Solo quedan ${unitsText(stock)}.</strong> Ajusta la cantidad para continuar. <button type="button" data-fit="${stock}">Dejar ${stock}</button></div>`;
      }
      return `<article class="cart-item${warning ? ' has-warning' : ''}" data-line="${product.id}|${escapeHtml(line.size)}"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"><div class="cart-item-info"><span class="eyebrow">${product.reference}</span><h2>${escapeHtml(product.name)}</h2><p>${product.categoryLabel} · Talla ${escapeHtml(line.size)}</p><strong>${money(product.finalPrice)}</strong></div><div class="cart-item-controls"><div class="quantity-control"><button type="button" data-quantity="-1" aria-label="Disminuir cantidad">−</button><span>${line.quantity}</span><button type="button" data-quantity="1" aria-label="Aumentar cantidad">+</button></div><span class="line-total">${money(product.finalPrice * line.quantity)}</span><button class="remove-line" type="button" data-remove>Eliminar</button></div>${warning}</article>`;
    }).join('');
    const { subtotal, total } = totals(cart);
    summary.innerHTML = `<span class="eyebrow">RESUMEN</span><h2>Tu pedido</h2><div class="summary-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>${shippingRows(subtotal)}<div class="summary-total"><span>Total</span><strong>${money(total)}</strong></div>${blocked ? '<p class="summary-alert is-error">Hay prendas agotadas o con menos unidades en tu carrito. Corrígelas para finalizar la compra.</p>' : checkoutButton()}<a class="continue-link" href="${ROOT}index.html#colecciones">← Seguir comprando</a><button class="clear-cart" type="button" data-clear-cart>Vaciar carrito</button><p class="summary-note">Pago de demostración. No se realizará ningún cobro.</p>`;
    host.querySelectorAll('[data-quantity]').forEach((button) => button.addEventListener('click', () => changeQuantity(button.closest('[data-line]').dataset.line, Number(button.dataset.quantity))));
    host.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => removeLine(button.closest('[data-line]').dataset.line)));
    host.querySelectorAll('[data-fit]').forEach((button) => button.addEventListener('click', () => {
      const { id, size } = parseLineKey(button.closest('[data-line]').dataset.line);
      inventory.setCart(inventory.getCart().map((line) => (line.id === id && line.size === size ? { ...line, quantity: Number(button.dataset.fit) } : line)));
    }));
    summary.querySelector('[data-clear-cart]').addEventListener('click', () => {
      if (window.confirm('¿Quieres vaciar tu carrito?')) inventory.setCart([]);
    });
  }

  // Para comprar hay que tener cuenta de cliente.
  // Botón del resumen: "Finalizar compra" (cliente), "Ingresa para comprar" (sin sesión) o aviso (administrador)
  function checkoutButton() {
    const session = window.StoreAuth?.getSession();
    if (session?.role === 'client') return `<a class="button button-lime button-wide" href="${page('checkout.html')}">Finalizar compra <span>↗</span></a>`;
    if (session?.role === 'admin') return '<p class="summary-alert">Estás como administrador. Para comprar, cierra sesión e ingresa con una cuenta de cliente.</p>';
    return `<a class="button button-lime button-wide" href="${page('login.html')}?volver=checkout">Ingresa para comprar <span>↗</span></a><p class="summary-alert">Para hacer tu compra necesitas una cuenta. <a href="${page('login.html')}?volver=checkout&modo=registro">Regístrate gratis</a>.</p>`;
  }

  // Convierte "caballero-01|32" en { id: 'caballero-01', size: '32' }
  function parseLineKey(key) {
    const separator = key.indexOf('|');
    return { id: key.slice(0, separator), size: key.slice(separator + 1) };
  }

  // Botones + / − del carrito (no deja pasar del stock)
  function changeQuantity(key, delta) {
    const { id, size } = parseLineKey(key);
    const cart = inventory.getCart();
    const line = cart.find((item) => item.id === id && item.size === size);
    if (!line) return;
    if (delta > 0 && line.quantity + 1 > inventory.getStock(id, size)) {
      const stock = inventory.getStock(id, size);
      toast(stock === 0 ? `Esta talla se agotó. Retírala del carrito para continuar.` : `No hay más unidades: solo quedan ${unitsText(stock)} en talla ${size}.`, { type: 'error' });
      return;
    }
    line.quantity += delta;
    inventory.setCart(cart);
  }

  // Botón "Eliminar" de una línea del carrito
  function removeLine(key) {
    const { id, size } = parseLineKey(key);
    inventory.setCart(inventory.getCart().filter((line) => !(line.id === id && line.size === size)));
  }

  // ========== 6. RESUMEN DEL PAGO ==========
  // Dibuja el resumen del pedido en checkout.html
  function renderCheckoutSummary() {
    const summary = document.querySelector('[data-checkout-summary]');
    if (!summary) return;
    const cart = inventory.getCart();
    const { subtotal, total } = totals(cart);
    summary.innerHTML = `<span class="eyebrow">TU SELECCIÓN</span><h2>Resumen del pedido</h2>${cart.map((line) => {
      const product = window.StoreProducts.find(line.id);
      return `<div class="checkout-line"><span>${escapeHtml(product.name)} · ${line.quantity} × talla ${escapeHtml(line.size)}</span><strong>${money(product.finalPrice * line.quantity)}</strong></div>`;
    }).join('')}${cart.length ? shippingRows(subtotal) : ''}<div class="summary-total"><span>Total</span><strong>${money(total)}</strong></div><p class="summary-note">${cart.length ? `${cart.reduce((sum, line) => sum + line.quantity, 0)} prendas · Valores en COP` : 'Tu carrito está vacío.'}</p>`;
    summary.dataset.subtotal = String(subtotal);
  }

  // Vuelve a pintar todo lo que depende del carrito (contadores, carrito, resumen y tarjetas)
  function updateAll() {
    updateCounts();
    renderCart();
    renderCheckoutSummary();
    document.querySelectorAll('article[data-product-id]').forEach(refreshCard);
  }

  // ========== 7. ARRANQUE: se ejecuta en cada página cuando el HTML terminó de cargar ==========
  document.addEventListener('DOMContentLoaded', async () => {
    // Menú del celular: abrir/cerrar con el botón, con Escape o tocando fuera
    const menuButton = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.main-nav');
    const setMenu = (open) => {
      menuButton?.setAttribute('aria-expanded', String(open));
      menuButton?.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      nav?.classList.toggle('nav-open', open);
    };
    // Barra de anuncios: rota mensajes cortos de la tienda.
    const announcement = document.querySelector('[data-announcement-text]');
    if (announcement && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const messages = [
        'Envío gratis en compras desde $250.000',
        'Nueva colección 2026 para caballero, dama y niños',
        'Paga contra entrega al recibir tu pedido',
        'Crea tu cuenta y compra más rápido'
      ];
      let messageIndex = 0;
      window.setInterval(() => {
        announcement.classList.add('is-leaving');
        window.setTimeout(() => {
          messageIndex = (messageIndex + 1) % messages.length;
          announcement.textContent = messages[messageIndex];
          announcement.classList.remove('is-leaving');
        }, 350);
      }, 4500);
    }

    // Menú fijo: agrega sombra cuando la página se desplaza.
    const header = document.querySelector('.site-header');
    const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    menuButton?.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav?.classList.contains('nav-open')) { setMenu(false); menuButton.focus(); }
    });
    document.addEventListener('click', (event) => {
      if (nav?.classList.contains('nav-open') && !nav.contains(event.target) && !menuButton.contains(event.target)) setMenu(false);
    });
    observeReveal();

    // Espera los productos y la sesión desde la base de datos.
    await window.StoreReady;
    // Páginas de colección (caballero, dama, niños): listado con orden por precio
    if (document.body.dataset.page === 'catalog') {
      const category = document.body.dataset.category;
      const grid = document.querySelector('[data-product-grid]');
      const sort = document.querySelector('[data-sort]');
      const render = () => {
        const items = window.StoreProducts.byCategory(category);
        if (sort.value === 'price-asc') items.sort((a, b) => a.finalPrice - b.finalPrice);
        if (sort.value === 'price-desc') items.sort((a, b) => b.finalPrice - a.finalPrice);
        document.querySelector('[data-product-count]').textContent = String(items.length).padStart(2, '0');
        const side = document.querySelector('.collection-side');
        if (side) side.textContent = side.textContent.replace(/^\d+ MODELOS?/,`${items.length} ${items.length === 1 ? 'MODELO' : 'MODELOS'}`);
        renderCards(grid, items);
      };
      sort.addEventListener('change', render);
      render();
    }
    // Pinta todo y lo vuelve a pintar cuando cambia el carrito o la sesión
    updateAll();
    window.addEventListener('store:cart-updated', updateAll);
    window.addEventListener('store:session-changed', renderCart);
    window.addEventListener('storage', updateAll);
  });

  // Funciones disponibles para inicio.js, checkout.js, login.js y admin.js
  window.StoreCart = { ROOT, page, addToCart, totals, money, escapeHtml, toast, renderCards, renderCheckoutSummary, updateCounts, observeReveal };
})();