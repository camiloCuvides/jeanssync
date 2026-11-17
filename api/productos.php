<?php
// =========================================================
// JeansSync · Catálogo público
//   GET productos.php → productos activos con sus unidades por talla
// =========================================================
declare(strict_types=1);
require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fallar('Método no permitido.', 405);
}

responder(['ok' => true, 'productos' => productos_con_inventario(true), 'envioGratisDesde' => ENVIO_GRATIS_DESDE]);
