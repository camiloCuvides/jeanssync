/* ==================================================================
   ARCHIVO: assets/js/datos/productos.js   (1.º script de cada página)
   - StoreApi(ruta, {method, body}) → hace las peticiones a la API en PHP (carpeta api/)
   - StoreProducts → el catálogo en memoria: all, byCategory(), find(), load()
   Los productos vienen de api/productos.php (tabla "productos" de MySQL).
   ================================================================== */
(function () {
    'use strict';

    // ------------------------------------------------------------------
    // Catálogo de JeansSync: se carga desde la base de datos (api/productos.php).
    // La tienda debe abrirse desde XAMPP: http://localhost/jeanssync/
    // El catálogo de fábrica (nombres, precios y fotos) está en api/datos_base.php.
    // ------------------------------------------------------------------

    const ROOT = document.body.dataset.root || '';
    const API = `${ROOT}api/`;

    // Nombres y tallas de cada sección (deben coincidir con api/config.php).
    const configs = {
        caballero: { label: 'Caballero', sizes: ['28', '30', '32', '34', '36'] },
        dama: { label: 'Dama', sizes: ['6', '8', '10', '12', '14', '16'] },
        ninos: { label: 'Niños', sizes: ['2', '4', '6', '8', '10', '12'] }
    };

    // Llamada a la API en PHP. Devuelve el JSON o lanza un error con el mensaje del servidor.
    async function api(path, { method = 'GET', body } = {}) {
        let response;
        try {
            response = await fetch(API + path, {
                method,
                credentials: 'same-origin',
                headers: body ? { 'Content-Type': 'application/json; charset=utf-8' } : {},
                body: body ? JSON.stringify(body) : undefined
            });
        } catch {
            throw new Error('No hay conexión con el servidor. Verifica que XAMPP (Apache y MySQL) esté encendido.');
        }
        let data;
        try { data = await response.json(); } catch { data = null; }
        if (!response.ok || !data || data.ok === false) {
            const error = new Error(data?.error || 'Ocurrió un error en el servidor.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    const products = [];

    // Completa cada producto con lo que necesita la tienda: ruta de la foto, nombre de la sección y precio final
    function normalize(product) {
        const config = configs[product.category];
        const image = /^(https?:|data:)/i.test(product.image) ? product.image : ROOT + product.image;
        const price = Number(product.price) || 0;
        return {
            ...product,
            image,
            categoryLabel: config.label,
            sizes: product.sizes || config.sizes,
            price,
            discount: 0,
            finalPrice: price,
            inventory: product.inventory || {}
        };
    }

    // Reemplaza el catálogo en memoria (lo usan la carga inicial y el panel de administración).
    function setAll(list) {
        products.splice(0, products.length, ...list.filter((product) => configs[product.category]).map(normalize));
        return products;
    }

    // Pide el catálogo al servidor (api/productos.php) y lo guarda en StoreProducts.all
    async function load() {
        const data = await api('productos.php');
        return setAll(data.productos);
    }

    window.StoreApi = api;
    window.StoreProducts = {
        all: products,
        configs,
        load,
        setAll,
        byCategory: (category) => products.filter((product) => product.category === category),
        find: (id) => products.find((product) => product.id === id)
    };
})();
