/* ==================================================================
   ARCHIVO: assets/js/nucleo/inventario.js   (2.º script de cada página)
   - Unidades por talla: getStock(), totalStock()  (datos de la base de datos)
   - Carrito: getCart(), setCart()  (guardado en el navegador, clave "indigo-cart-v1")
   - validateLines(): revisa el carrito contra el stock antes de pagar
   ================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Inventario y carrito.
  // - Las unidades por talla vienen de la base de datos (tabla inventario).
  // - El carrito se guarda en este navegador hasta que el cliente paga;
  //   al confirmar el pedido, el servidor vuelve a validar precios y stock.
  // ------------------------------------------------------------------

  const CART_KEY = 'indigo-cart-v1';

  // Lee un dato del almacenamiento del navegador sin romperse si está dañado
  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  // Unidades disponibles de una talla, por ejemplo getStock('dama-01', '8') → 19
  function getStock(id, size) {
    return Number(window.StoreProducts.find(id)?.inventory?.[size] || 0);
  }

  // Unidades disponibles sumando todas las tallas del producto
  function totalStock(id) {
    return Object.values(window.StoreProducts.find(id)?.inventory || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  // Devuelve el carrito: [{ id, size, quantity }] (ignora productos que ya no existen)
  function getCart() {
    const cart = readJson(CART_KEY, []);
    return Array.isArray(cart) ? cart.filter((line) => window.StoreProducts.find(line.id) && Number.isInteger(line.quantity) && line.quantity > 0) : [];
  }

  // Guarda el carrito y avisa al resto de la página (evento "store:cart-updated")
  function setCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* sin almacenamiento: el carrito vive solo en esta página */ }
    window.dispatchEvent(new CustomEvent('store:cart-updated'));
  }

  // Devuelve una lista de mensajes si algo del carrito está agotado o pide más de lo que hay
  function validateLines(lines) {
    return lines.map((line) => {
      const product = window.StoreProducts.find(line.id);
      if (!product) return 'Un producto del carrito ya no está disponible.';
      if (!product.sizes.includes(line.size)) return `${product.name}: la talla ${line.size} ya no está disponible.`;
      const available = getStock(line.id, line.size);
      if (available === 0) return `Lo sentimos, "${product.name}" en talla ${line.size} se agotó. Retíralo del carrito para continuar.`;
      if (line.quantity > available) return `"${product.name}" en talla ${line.size}: solo quedan ${available} ${available === 1 ? 'unidad' : 'unidades'} y en tu carrito tienes ${line.quantity}.`;
      return null;
    }).filter(Boolean);
  }

  window.StoreInventory = { getStock, totalStock, validateLines, getCart, setCart };
})();
