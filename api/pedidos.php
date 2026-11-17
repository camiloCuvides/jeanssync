<?php
// =========================================================
// JeansSync · Pedidos del cliente
//   GET  pedidos.php → pedidos del cliente con sesión iniciada
//   POST pedidos.php → crea un pedido (requiere cuenta de cliente)
//        { lineas: [{id, talla, cantidad}], entrega: {nombre, telefono, ciudad, direccion}, pago }
// Los precios y el stock se toman SIEMPRE de la base de datos, nunca del navegador.
// =========================================================
declare(strict_types=1);
require __DIR__ . '/config.php';

$usuario = exigir_cliente();
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $consulta = $pdo->prepare('SELECT id, nombre, ciudad, metodo_pago, total, estado, creado FROM pedidos WHERE usuario_id = ? ORDER BY creado DESC');
    $consulta->execute([$usuario['id']]);
    $pedidos = $consulta->fetchAll();
    $detalle = $pdo->prepare('SELECT nombre_producto, talla, cantidad, precio_unitario FROM pedido_detalle WHERE pedido_id = ?');
    foreach ($pedidos as &$pedido) {
        $detalle->execute([$pedido['id']]);
        $pedido['lineas'] = $detalle->fetchAll();
        $pedido['total'] = (int) $pedido['total'];
    }
    responder(['ok' => true, 'pedidos' => $pedidos]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fallar('Método no permitido.', 405);
}

$datos = leer_json();
$entrega = is_array($datos['entrega'] ?? null) ? $datos['entrega'] : [];
$nombre = texto($entrega['nombre'] ?? '', 80);
$telefono = texto($entrega['telefono'] ?? '', 30);
$ciudad = texto($entrega['ciudad'] ?? '', 60);
$direccion = texto($entrega['direccion'] ?? '', 160);
$pago = texto($datos['pago'] ?? '', 40);

if (mb_strlen($nombre) < 3) fallar('Escribe el nombre de quien recibe.');
if (!preg_match('/^[0-9 +()-]{7,30}$/', $telefono)) fallar('Escribe un teléfono válido.');
if (mb_strlen($ciudad) < 3) fallar('Escribe la ciudad de entrega.');
if (mb_strlen($direccion) < 5) fallar('Escribe la dirección completa.');
if (!in_array($pago, ['Contraentrega', 'Transferencia simulada'], true)) fallar('Elige un método de pago.');

// Agrupa líneas repetidas (mismo producto y talla).
$lineas = [];
foreach (($datos['lineas'] ?? []) as $linea) {
    $id = texto($linea['id'] ?? '', 40);
    $talla = texto($linea['talla'] ?? '', 6);
    $cantidad = (int) ($linea['cantidad'] ?? 0);
    if ($id === '' || $talla === '' || $cantidad < 1 || $cantidad > 50) fallar('Hay un producto no válido en el carrito.');
    $clave = "$id|$talla";
    $lineas[$clave] = ['id' => $id, 'talla' => $talla, 'cantidad' => ($lineas[$clave]['cantidad'] ?? 0) + $cantidad];
}
if (!$lineas) fallar('Tu carrito está vacío.');
if (count($lineas) > 40) fallar('El pedido tiene demasiados productos.');

$pdo->beginTransaction();
try {
    $buscar = $pdo->prepare('SELECT p.nombre, p.precio, p.activo, i.unidades FROM productos p JOIN inventario i ON i.producto_id = p.id WHERE p.id = ? AND i.talla = ? FOR UPDATE');
    $descontar = $pdo->prepare('UPDATE inventario SET unidades = unidades - ? WHERE producto_id = ? AND talla = ? AND unidades >= ?');
    $subtotal = 0;
    $problemas = [];
    foreach ($lineas as &$linea) {
        $buscar->execute([$linea['id'], $linea['talla']]);
        $producto = $buscar->fetch();
        if (!$producto || !$producto['activo']) {
            $problemas[] = 'Un producto de tu carrito ya no está disponible en la tienda.';
            continue;
        }
        $quedan = (int) $producto['unidades'];
        if ($quedan === 0) {
            $problemas[] = "Lo sentimos, \"{$producto['nombre']}\" en talla {$linea['talla']} se agotó.";
            continue;
        }
        if ($quedan < $linea['cantidad']) {
            $problemas[] = "\"{$producto['nombre']}\" en talla {$linea['talla']}: solo quedan $quedan " . ($quedan === 1 ? 'unidad' : 'unidades') . " y pediste {$linea['cantidad']}.";
            continue;
        }
        $linea['nombre'] = $producto['nombre'];
        $linea['precio'] = (int) $producto['precio'];
        $subtotal += $linea['precio'] * $linea['cantidad'];
    }
    unset($linea);
    if ($problemas) {
        $pdo->rollBack();
        fallar(implode(' ', $problemas) . ' Revisa tu carrito y vuelve a intentarlo.', 409);
    }

    foreach ($lineas as $linea) {
        $descontar->execute([$linea['cantidad'], $linea['id'], $linea['talla'], $linea['cantidad']]);
    }

    $envio = 0; // envío gratis desde ENVIO_GRATIS_DESDE; por debajo se paga al recibir
    $total = $subtotal + $envio;
    do {
        $pedidoId = 'JS-' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 8));
        $existe = $pdo->prepare('SELECT 1 FROM pedidos WHERE id = ?');
        $existe->execute([$pedidoId]);
    } while ($existe->fetchColumn());

    $pdo->prepare('INSERT INTO pedidos (id, usuario_id, nombre, correo, telefono, ciudad, direccion, metodo_pago, subtotal, envio, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$pedidoId, $usuario['id'], $nombre, $usuario['correo'], $telefono, $ciudad, $direccion, $pago, $subtotal, $envio, $total]);
    $guardarLinea = $pdo->prepare('INSERT INTO pedido_detalle (pedido_id, producto_id, nombre_producto, talla, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($lineas as $linea) {
        $guardarLinea->execute([$pedidoId, $linea['id'], $linea['nombre'], $linea['talla'], $linea['cantidad'], $linea['precio']]);
    }

    // Guarda los datos de entrega en la cuenta para autocompletar la próxima compra.
    $pdo->prepare('UPDATE usuarios SET telefono = ?, ciudad = ?, direccion = ? WHERE id = ?')
        ->execute([$telefono, $ciudad, $direccion, $usuario['id']]);

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

responder([
    'ok' => true,
    'pedido' => [
        'id' => $pedidoId,
        'subtotal' => $subtotal,
        'envio' => $envio,
        'total' => $total,
        'envioGratis' => $subtotal >= ENVIO_GRATIS_DESDE,
        'pago' => $pago,
        'nombre' => $nombre,
    ],
    'usuario' => usuario_publico(usuario_actual()),
]);
