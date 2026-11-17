/* ==================================================================
   ARCHIVO: assets/js/paginas/admin.js   (solo en paginas/admin.html)
   Secciones de este archivo (busca el título con Ctrl+F):
     - Datos desde el servidor ........ reload(), send()
     - Alertas de inventario ......... renderAlerts() y revisión cada 20 s
     - Resumen ....................... renderStats()
     - Agregar producto .............. formulario, foto y unidades por talla
     - Lista de precios por sección .. renderTabs(), renderList(), guardar cambios
     - Pedidos ....................... renderOrders()
     - Otras acciones ................ restaurar catálogo y cerrar sesión
   ================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Panel de administración: todo se guarda en MySQL a través de api/admin.php.
  // ------------------------------------------------------------------

  const SECTIONS = { caballero: 'Caballero', dama: 'Dama', ninos: 'Niños' };
  const MIN_PRICE = 1000;
  const MAX_PRICE = 10000000;

  document.addEventListener('DOMContentLoaded', async () => {
    await window.StoreReady;
    const auth = window.StoreAuth;
    if (!auth.requireAdmin()) return;
    document.querySelector('[data-admin-main]').hidden = false;

    const api = window.StoreApi;
    const catalog = window.StoreProducts;
    const inventory = window.StoreInventory;
    const { money, escapeHtml, toast, page } = window.StoreCart;
    const $ = (selector) => document.querySelector(selector);
    let section = 'caballero';
    let uploadedImage = '';
    let summary = null;
    let orders = [];
    let alerts = [];
    let lowLimit = 3;
    let lastAlertKey = '';

    // ---------- Datos desde el servidor ----------
    async function reload() {
      const data = await api('admin.php');
      summary = data.resumen;
      orders = data.pedidos;
      alerts = data.alertas || [];
      lowLimit = data.stockBajo ?? 3;
      catalog.setAll(data.productos);
      renderAll();
    }

    // ---------- Alertas de inventario (3 unidades o menos) ----------
    const alertCount = (category) => new Set(alerts.filter((a) => !category || a.categoria === category).map((a) => a.id)).size;

    // Dibuja el recuadro rojo con los productos que tienen tallas con 3 unidades o menos
    function renderAlerts() {
      const box = $('[data-stock-alerts]');
      if (!alerts.length) { box.hidden = true; box.innerHTML = ''; lastAlertKey = ''; return; }
      const soldOut = alerts.filter((a) => a.unidades === 0);
      const low = alerts.filter((a) => a.unidades > 0);
      // Una tarjeta por producto, con el detalle de cada talla afectada.
      const groups = [];
      alerts.forEach((a) => {
        let group = groups.find((g) => g.id === a.id);
        if (!group) { group = { ...a, sizes: [] }; groups.push(group); }
        group.sizes.push(a);
      });
      const item = (g) => {
        const totalSizes = catalog.find(g.id)?.sizes.length || 0;
        const out = g.sizes.filter((s) => s.unidades === 0);
        const allOut = out.length === totalSizes;
        const label = allOut ? 'AGOTADO' : out.length ? `${out.length} ${out.length === 1 ? 'TALLA' : 'TALLAS'} AGOTADA${out.length === 1 ? '' : 'S'}` : `${Math.min(...g.sizes.map((s) => s.unidades))} ${Math.min(...g.sizes.map((s) => s.unidades)) === 1 ? 'UNIDAD' : 'UNIDADES'}`;
        const detail = allOut ? 'Todas las tallas' : g.sizes.map((s) => `T${escapeHtml(s.talla)}: ${s.unidades === 0 ? 'agotada' : s.unidades}`).join(' · ');
        return `<li class="${out.length ? 'is-out' : 'is-low'}">
          <button type="button" data-go="${escapeHtml(g.id)}" data-go-section="${g.categoria}">
            <span class="alert-units">${label}</span>
            <span class="alert-name"><strong>${escapeHtml(g.nombre)}</strong></span>
            <span class="alert-meta">${detail} · ${escapeHtml(g.referencia)}</span>
          </button>
        </li>`;
      };
      box.hidden = false;
      box.innerHTML = `<div class="stock-alerts-head">
          <span class="alert-icon" aria-hidden="true">!</span>
          <div>
            <h2>Alerta de inventario</h2>
            <p>${soldOut.length ? `<strong>${soldOut.length} ${soldOut.length === 1 ? 'talla agotada' : 'tallas agotadas'}</strong>` : ''}${soldOut.length && low.length ? ' y ' : ''}${low.length ? `<strong>${low.length} con ${lowLimit} unidades o menos</strong>` : ''}. Repón las unidades en "Precios e inventario".</p>
          </div>
        </div>
        <ul class="stock-alerts-list">${groups.map(item).join('')}</ul>`;
      // Aviso emergente solo cuando aparece algo nuevo (por ejemplo, después de una venta).
      const key = alerts.map((a) => `${a.id}|${a.talla}|${a.unidades}`).join(',');
      if (lastAlertKey && key !== lastAlertKey && alerts.length) toast('Hay nuevas alertas de inventario.', { type: 'error' });
      lastAlertKey = key;
    }

    // Ir al producto desde la alerta: abre su sección, lo resalta y despliega sus tallas.
    $('[data-stock-alerts]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-go]');
      if (!button) return;
      section = button.dataset.goSection;
      $('[data-admin-search]').value = '';
      renderTabs();
      renderList();
      const row = document.querySelector(`.admin-row[data-id="${CSS.escape(button.dataset.go)}"]`);
      if (!row) return;
      row.querySelector('details').open = true;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.remove('is-focus'); void row.offsetWidth; row.classList.add('is-focus');
      row.querySelector('.stock-inputs .is-low input, .stock-inputs .is-out input')?.focus({ preventScroll: true });
    });

    // Revisa el inventario cada 20 segundos para que las ventas nuevas generen alertas sin recargar.
    window.setInterval(() => {
      if (document.hidden || document.activeElement?.closest('.admin-row, .admin-form')) return;
      reload().catch(() => {});
    }, 20000);

    // Envía un cambio a api/admin.php, muestra el aviso y vuelve a cargar los datos
    async function send(body, successMessage) {
      try {
        const result = await api('admin.php', { method: 'POST', body });
        if (successMessage) toast(successMessage, { type: 'success' });
        await reload();
        return result;
      } catch (error) {
        toast(error.message, { type: 'error' });
        if (error.status === 403) window.location.replace(`${page('login.html')}?rol=admin`);
        return null;
      }
    }

    // ---------- Resumen ----------
    function renderStats() {
      const stat = (label, value, note) => `<div class="stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
      $('[data-admin-stats]').innerHTML = [
        ...Object.entries(SECTIONS).map(([key, label]) => stat(label, summary.secciones[key], 'productos publicados')),
        stat('Inventario', summary.unidades.toLocaleString('es-CO'), `unidades · ${summary.clientes} ${summary.clientes === 1 ? 'cliente' : 'clientes'}`),
        stat('Ventas', money(summary.ventas), `${summary.pedidos} ${summary.pedidos === 1 ? 'pedido' : 'pedidos'}`)
      ].join('');
    }

    // ---------- Agregar producto ----------
    const form = $('[data-new-product]');
    const categorySelect = $('[data-new-category]');
    const preview = $('[data-image-preview]');
    const urlInput = $('[data-image-url]');
    const fileInput = $('[data-image-file]');

    // Crea un campo de unidades por cada talla de la sección elegida
    function renderStockInputs() {
      const sizes = catalog.configs[categorySelect.value].sizes;
      $('[data-new-stock]').innerHTML = sizes.map((size) => `<label>Talla ${size}<input type="number" min="0" max="999" step="1" value="20" data-new-size="${size}"></label>`).join('');
    }

    // Muestra la foto elegida en el recuadro de vista previa
    function showPreview(src) {
      preview.style.backgroundImage = src ? `url("${src.replace(/"/g, '%22')}")` : '';
      preview.classList.toggle('has-image', Boolean(src));
    }

    // Reduce la foto (máx. 900 px) antes de enviarla al servidor.
    function resizeImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const scale = Math.min(1, 900 / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('El archivo debe ser una imagen.', { type: 'error' }); return; }
      try {
        uploadedImage = await resizeImage(file);
        urlInput.value = '';
        showPreview(uploadedImage);
      } catch {
        toast('No se pudo leer la imagen. Prueba con otra.', { type: 'error' });
      }
    });

    urlInput.addEventListener('input', () => {
      uploadedImage = '';
      fileInput.value = '';
      showPreview(/^https?:\/\//i.test(urlInput.value.trim()) ? urlInput.value.trim() : '');
    });

    categorySelect.addEventListener('change', renderStockInputs);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('[data-new-error]');
      error.textContent = '';
      const data = new FormData(form);
      const category = data.get('category');
      const name = String(data.get('name') || '').trim();
      const price = Number(data.get('price'));
      const imageUrl = String(data.get('imageUrl') || '').trim();
      const image = uploadedImage || imageUrl;

      if (name.length < 3) { error.textContent = 'El nombre debe tener al menos 3 letras.'; form.elements.name.focus(); return; }
      if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) { error.textContent = `El precio debe estar entre ${money(MIN_PRICE)} y ${money(MAX_PRICE)}.`; form.elements.price.focus(); return; }
      if (!image) { error.textContent = 'Agrega una foto: súbela o pega un enlace.'; return; }

      const stock = {};
      form.querySelectorAll('[data-new-size]').forEach((input) => { stock[input.dataset.newSize] = Math.max(0, Math.floor(Number(input.value) || 0)); });

      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await api('admin.php', { method: 'POST', body: { accion: 'crear', categoria: category, nombre: name, precio: price, descripcion: data.get('description'), imagen: image, stock } });
        form.reset();
        uploadedImage = '';
        showPreview('');
        renderStockInputs();
        section = category;
        await reload();
        toast(`"${name}" ya está publicado en ${SECTIONS[category]}.`, { type: 'success', action: { href: page(`${category}.html`), label: 'Ver en la tienda' } });
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
      }
    });

    // ---------- Lista de precios por sección ----------
    function renderTabs() {
      $('[data-section-tabs]').innerHTML = Object.entries(SECTIONS).map(([key, label]) =>
        `<button type="button" role="tab" aria-selected="${key === section}" data-section="${key}">${label} <span>${catalog.byCategory(key).length}</span>${alertCount(key) ? `<b class="tab-alert" title="${alertCount(key)} con stock bajo">${alertCount(key)}</b>` : ''}</button>`).join('');
    }

    // Dibuja la lista de productos de la sección abierta (con el buscador aplicado)
    function renderList() {
      const query = $('[data-admin-search]').value.trim().toLowerCase();
      const items = catalog.byCategory(section).filter((product) => !query || product.name.toLowerCase().includes(query) || product.reference.toLowerCase().includes(query));
      const list = $('[data-admin-list]');
      const openRows = new Set([...list.querySelectorAll('details[open]')].map((details) => details.closest('[data-id]').dataset.id));
      const scroll = list.scrollTop;
      requestAnimationFrame(() => { list.scrollTop = scroll; });
      if (!items.length) { list.innerHTML = '<p class="admin-empty">No hay productos que coincidan.</p>'; return; }
      list.innerHTML = items.map((product) => {
        const name = escapeHtml(product.name);
        const stockInputs = product.sizes.map((size) => {
          const units = inventory.getStock(product.id, size);
          const state = units === 0 ? 'is-out' : units <= lowLimit ? 'is-low' : '';
          return `<label class="${state}">Talla ${escapeHtml(size)}${units === 0 ? ' · agotada' : ''}<input type="number" min="0" max="999" step="1" value="${units}" data-stock-size="${escapeHtml(size)}"></label>`;
        }).join('');
        const lowSizes = product.sizes.filter((size) => inventory.getStock(product.id, size) <= lowLimit);
        const outSizes = product.sizes.filter((size) => inventory.getStock(product.id, size) === 0);
        const stockFlag = lowSizes.length
          ? `<span class="stock-flag${outSizes.length ? ' is-out' : ''}">${outSizes.length === product.sizes.length ? 'Agotado' : outSizes.length ? `Agotado en talla ${outSizes.join(', ')}` : `Stock bajo en talla ${lowSizes.join(', ')}`}</span>`
          : '';
        return `<article class="admin-row${lowSizes.length ? ' has-alert' : ''}" data-id="${product.id}">
          <img src="${escapeHtml(product.image)}" alt="" loading="lazy">
          <div class="admin-row-main">
            <input class="admin-name" value="${name}" data-field="name" maxlength="60" aria-label="Nombre de ${name}">
            <span class="admin-meta">${product.reference} · <b data-units>${inventory.totalStock(product.id)}</b> unidades${product.isBase ? '' : ' · <em class="tag-new">Nuevo</em>'}</span>
            ${stockFlag}
          </div>
          <label class="admin-price"><span>$</span><input type="number" min="${MIN_PRICE}" max="${MAX_PRICE}" step="100" value="${product.price}" data-field="price" aria-label="Precio de ${name}"></label>
          <details class="admin-stock"${openRows.has(product.id) ? ' open' : ''}><summary>Unidades por talla</summary><div class="stock-inputs">${stockInputs}</div></details>
          <button class="icon-button" type="button" data-delete aria-label="Eliminar ${name}" title="Eliminar">✕</button>
        </article>`;
      }).join('');
    }

    $('[data-section-tabs]').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-section]');
      if (!tab) return;
      section = tab.dataset.section;
      renderTabs();
      renderList();
    });
    $('[data-admin-search]').addEventListener('input', renderList);

    // Guarda nombre, precio o unidades cuando el campo cambia.
    $('[data-admin-list]').addEventListener('change', async (event) => {
      const row = event.target.closest('[data-id]');
      if (!row) return;
      const product = catalog.find(row.dataset.id);
      const input = event.target;

      if (input.dataset.field === 'name') {
        const name = input.value.trim();
        if (name.length < 3) { toast('El nombre debe tener al menos 3 letras.', { type: 'error' }); input.value = product.name; return; }
        await send({ accion: 'actualizar', id: product.id, nombre: name }, `Nombre actualizado: ${name}.`);
      }

      if (input.dataset.field === 'price') {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < MIN_PRICE || value > MAX_PRICE) {
          toast(`El precio debe estar entre ${money(MIN_PRICE)} y ${money(MAX_PRICE)}.`, { type: 'error' });
          input.value = product.price;
          return;
        }
        const result = await send({ accion: 'actualizar', id: product.id, precio: value });
        if (result) {
          toast(`${product.name}: nuevo precio ${money(catalog.find(product.id).price)}.`, { type: 'success' });
          const updated = document.querySelector(`[data-id="${product.id}"]`);
          updated?.classList.add('is-saved');
        }
      }

      if (input.dataset.stockSize) {
        const value = Math.max(0, Math.floor(Number(input.value) || 0));
        await send({ accion: 'stock', id: product.id, talla: input.dataset.stockSize, unidades: value }, `${product.name}, talla ${input.dataset.stockSize}: ${value} unidades.`);
      }
    });

    $('[data-admin-list]').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-delete]');
      if (!button) return;
      const product = catalog.find(button.closest('[data-id]').dataset.id);
      if (!window.confirm(`¿Eliminar "${product.name}" de la tienda?`)) return;
      await send({ accion: 'eliminar', id: product.id }, `"${product.name}" se eliminó de la tienda.`);
    });

    // Ajuste de precios en bloque para la sección activa.
    document.querySelectorAll('[data-bulk]').forEach((button) => button.addEventListener('click', async () => {
      const percent = Math.abs(Number($('[data-bulk-percent]').value));
      if (!percent || percent > 90) { toast('Escribe un porcentaje entre 1 y 90.', { type: 'error' }); return; }
      const sign = button.dataset.bulk === 'up' ? 1 : -1;
      const count = catalog.byCategory(section).length;
      if (!window.confirm(`¿${sign > 0 ? 'Subir' : 'Bajar'} ${percent}% el precio de los ${count} productos de ${SECTIONS[section]}?`)) return;
      await send({ accion: 'ajuste', categoria: section, porcentaje: sign * percent }, `Precios de ${SECTIONS[section]} actualizados (${sign > 0 ? '+' : '−'}${percent}%).`);
    }));

    // ---------- Pedidos ----------
    function renderOrders() {
      $('[data-admin-orders]').innerHTML = orders.length
        ? `<div class="orders-table" role="table" aria-label="Pedidos recientes"><div class="orders-row orders-head" role="row"><span role="columnheader">Pedido</span><span role="columnheader">Fecha</span><span role="columnheader">Cliente</span><span role="columnheader">Prendas</span><span role="columnheader">Total</span></div>${orders.map((order) => `<div class="orders-row" role="row"><strong role="cell">${escapeHtml(order.id)}</strong><span role="cell">${new Date(order.creado.replace(' ', 'T')).toLocaleDateString('es-CO')}</span><span role="cell">${escapeHtml(order.nombre)}<small>${escapeHtml(order.correo)} · ${escapeHtml(order.ciudad)}</small></span><span role="cell">${order.prendas}</span><strong role="cell">${money(order.total)}</strong></div>`).join('')}</div>`
        : '<p class="admin-empty">Aún no hay pedidos.</p>';
    }

    // ---------- Otras acciones ----------
    $('[data-reset-catalog]').addEventListener('click', async () => {
      if (!window.confirm('¿Restaurar el catálogo original? Se retiran los productos agregados y vuelven los nombres y precios de fábrica.')) return;
      await send({ accion: 'restaurar' }, 'Catálogo restaurado.');
    });

    $('[data-logout]').addEventListener('click', async () => {
      await auth.logout();
      window.location.href = page('login.html');
    });

    // Vuelve a dibujar todo el panel
    function renderAll() {
      renderStats();
      renderAlerts();
      renderTabs();
      renderList();
      renderOrders();
    }

    renderStockInputs();
    try {
      await reload();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  });
})();
