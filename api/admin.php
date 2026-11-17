<?php
// =========================================================
// JeansSync · Panel de administración (solo el administrador)
//   GET  admin.php                         → resumen, todos los productos y pedidos recientes
//   POST admin.php {accion: "crear"}       → agrega un producto
//   POST admin.php {accion: "actualizar"}  → cambia nombre o precio
//   POST admin.php {accion: "stock"}       → fija las unidades de una talla
//   POST admin.php {accion: "eliminar"}    → retira un producto de la tienda
//   POST admin.php {accion: "ajuste"}      → sube o baja en % los precios de una sección
//   POST admin.php {accion: "restaurar"}   → vuelve al catálogo de fábrica
// =========================================================
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/datos_base.php';

exigir_admin();
$pdo = db();

// Redondea a centenas y mantiene el precio entre el mínimo y el máximo permitidos
function redondear_precio(float $valor): int
{
    return (int) min(PRECIO_MAXIMO, max(PRECIO_MINIMO, round($valor / 100) * 100));
}

// Busca un producto activo por id o responde "El producto no existe"
function producto_existente(string $id): array
{
    $consulta = db()->prepare('SELECT * FROM productos WHERE id = ? AND activo = 1');
    $consulta->execute([$id]);
    $producto = $consulta->fetch();
    if (!$producto) fallar('El producto no existe.', 404);
    return $producto;
}

// Guarda en assets/img/productos una foto enviada como data:image/...;base64
function guardar_foto(string $dataUrl, string $id): string
{
    if (!preg_match('#^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $partes)) {
        fallar('La foto debe ser JPG, PNG o WEBP.');
    }
    $binario = base64_decode($partes[2], true);
    if ($binario === false || strlen($binario) > 3 * 1024 * 1024) fallar('La foto no es válida o pesa más de 3 MB.');
    if (@getimagesizefromstring($binario) === false) fallar('El archivo no es una imagen válida.');
    $extension = $partes[1] === 'jpeg' ? 'jpg' : $partes[1];
    $carpeta = __DIR__ . '/../assets/img/productos';
    if (!is_dir($carpeta)) mkdir($carpeta, 0775, true);
    $archivo = $id . '.' . $extension;
    file_put_contents("$carpeta/$archivo", $binario);
    return "assets/img/productos/$archivo";
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $resumen = [];
    foreach (array_keys(CATEGORIAS) as $categoria) {
        $consulta = $pdo->prepare('SELECT COUNT(*) FROM productos WHERE categoria = ? AND activo = 1');
        $consulta->execute([$categoria]);
        $resumen[$categoria] = (int) $consulta->fetchColumn();
    }
    $unidades = (int) $pdo->query('SELECT COALESCE(SUM(i.unidades), 0) FROM inventario i JOIN productos p ON p.id = i.producto_id WHERE p.activo = 1')->fetchColumn();
    $ventas = $pdo->query("SELECT COUNT(*) AS pedidos, COALESCE(SUM(total), 0) AS total FROM pedidos WHERE estado <> 'cancelado'")->fetch();
    $clientes = (int) $pdo->query("SELECT COUNT(*) FROM usuarios WHERE rol = 'cliente'")->fetchColumn();
    $pedidos = $pdo->query('SELECT p.id, p.nombre, p.correo, p.ciudad, p.total, p.metodo_pago, p.estado, p.creado, COALESCE(SUM(d.cantidad), 0) AS prendas
        FROM pedidos p LEFT JOIN pedido_detalle d ON d.pedido_id = p.id GROUP BY p.id ORDER BY p.creado DESC LIMIT 20')->fetchAll();
    // Tallas con pocas unidades o agotadas (las más urgentes primero).
    $consulta = $pdo->prepare('SELECT p.id, p.referencia, p.nombre, p.categoria, i.talla, i.unidades
        FROM inventario i JOIN productos p ON p.id = i.producto_id
        WHERE p.activo = 1 AND i.unidades <= ?
        ORDER BY i.unidades ASC, p.categoria, p.nombre, CAST(i.talla AS UNSIGNED)');
    $consulta->execute([STOCK_BAJO]);
    $alertas = array_map(fn ($a) => array_merge($a, ['unidades' => (int) $a['unidades']]), $consulta->fetchAll());

    responder([
        'ok' => true,
        'stockBajo' => STOCK_BAJO,
        'alertas' => $alertas,
        'resumen' =>['secciones' => $resumen, 'unidades' => $unidades, 'pedidos' => (int) $ventas['pedidos'], 'ventas' => (int) $ventas['total'], 'clientes' => $clientes],
        'productos' => productos_con_inventario(true),
        'pedidos' => array_map(fn ($p) => array_merge($p, ['total' => (int) $p['total'], 'prendas' => (int) $p['prendas']]), $pedidos),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fallar('Método no permitido.', 405);
}

$datos = leer_json();
switch ($datos['accion'] ?? '') {
// AGREGAR PRODUCTO: valida datos, guarda la foto, calcula la referencia (JS-CAB-021...) y crea sus unidades por talla
    case 'crear':
        $categoria = (string) ($datos['categoria'] ?? '');
        if (!isset(CATEGORIAS[$categoria])) fallar('Elige una sección.');
        $nombre = texto($datos['nombre'] ?? '', 60);
        $descripcion = texto($datos['descripcion'] ?? '', 200) ?: 'Nuevo en la colección.';
        $precio = (float) ($datos['precio'] ?? 0);
        $imagen = trim((string) ($datos['imagen'] ?? ''));
        if (mb_strlen($nombre) < 3) fallar('El nombre debe tener al menos 3 letras.');
        if ($precio < PRECIO_MINIMO || $precio > PRECIO_MAXIMO) fallar('El precio debe estar entre $1.000 y $10.000.000.');
        if ($imagen === '') fallar('Agrega una foto: súbela o pega un enlace.');
        $repetido = $pdo->prepare('SELECT 1 FROM productos WHERE categoria = ? AND activo = 1 AND LOWER(nombre) = LOWER(?)');
        $repetido->execute([$categoria, $nombre]);
        if ($repetido->fetchColumn()) fallar("Ya existe \"$nombre\" en " . CATEGORIAS[$categoria]['nombre'] . '.');

        $id = $categoria . '-n' . base_convert((string) (int) (microtime(true) * 1000), 10, 36);
        if (str_starts_with($imagen, 'data:')) {
            $imagen = guardar_foto($imagen, $id);
        } elseif (!preg_match('#^https?://#i', $imagen) || mb_strlen($imagen) > 500) {
            fallar('El enlace de la imagen debe empezar por http:// o https://');
        }

        // Siguiente número de referencia de la sección (ej: JS-DAM-021).
        $consulta = $pdo->prepare("SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(referencia, '-', -1) AS UNSIGNED)), 0) FROM productos WHERE categoria = ?");
        $consulta->execute([$categoria]);
        $referencia = 'JS-' . CATEGORIAS[$categoria]['prefijo'] . '-' . str_pad((string) ((int) $consulta->fetchColumn() + 1), 3, '0', STR_PAD_LEFT);
        $orden = (int) $pdo->query('SELECT COALESCE(MAX(orden), 0) + 1 FROM productos')->fetchColumn();

        $pdo->beginTransaction();
        $pdo->prepare('INSERT INTO productos (id, referencia, nombre, categoria, descripcion, precio, imagen, es_base, orden) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)')
            ->execute([$id, $referencia, $nombre, $categoria, $descripcion, redondear_precio($precio), $imagen, $orden]);
        $stock = $pdo->prepare('INSERT INTO inventario (producto_id, talla, unidades) VALUES (?, ?, ?)');
        foreach (CATEGORIAS[$categoria]['tallas'] as $talla) {
            $stock->execute([$id, $talla, max(0, min(999, (int) ($datos['stock'][$talla] ?? 0)))]);
        }
        $pdo->commit();
        responder(['ok' => true, 'id' => $id, 'referencia' => $referencia]);
        break;

// CAMBIAR NOMBRE y/o PRECIO de un producto
    case 'actualizar':
        $producto = producto_existente((string) ($datos['id'] ?? ''));
        if (array_key_exists('nombre', $datos)) {
            $nombre = texto($datos['nombre'], 60);
            if (mb_strlen($nombre) < 3) fallar('El nombre debe tener al menos 3 letras.');
            $pdo->prepare('UPDATE productos SET nombre = ? WHERE id = ?')->execute([$nombre, $producto['id']]);
        }
        if (array_key_exists('precio', $datos)) {
            $precio = (float) $datos['precio'];
            if ($precio < PRECIO_MINIMO || $precio > PRECIO_MAXIMO) fallar('El precio debe estar entre $1.000 y $10.000.000.');
            $pdo->prepare('UPDATE productos SET precio = ? WHERE id = ?')->execute([redondear_precio($precio), $producto['id']]);
        }
        responder(['ok' => true]);
        break;

// FIJAR LAS UNIDADES de una talla
    case 'stock':
        $producto = producto_existente((string) ($datos['id'] ?? ''));
        $talla = (string) ($datos['talla'] ?? '');
        if (!in_array($talla, CATEGORIAS[$producto['categoria']]['tallas'], true)) fallar('Talla no válida.');
        $unidades = max(0, min(999, (int) ($datos['unidades'] ?? 0)));
        $pdo->prepare('INSERT INTO inventario (producto_id, talla, unidades) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE unidades = VALUES(unidades)')
            ->execute([$producto['id'], $talla, $unidades]);
        responder(['ok' => true, 'unidades' => $unidades]);
        break;

// ELIMINAR (se oculta con activo = 0 para no perder el historial de pedidos)
    case 'eliminar':
        $producto = producto_existente((string) ($datos['id'] ?? ''));
        // Se marca como inactivo para no perder el historial de pedidos.
        $pdo->prepare('UPDATE productos SET activo = 0 WHERE id = ?')->execute([$producto['id']]);
        responder(['ok' => true]);
        break;

// SUBIR o BAJAR en % todos los precios de una sección
    case 'ajuste':
        $categoria = (string) ($datos['categoria'] ?? '');
        $porcentaje = (float) ($datos['porcentaje'] ?? 0);
        if (!isset(CATEGORIAS[$categoria])) fallar('Elige una sección.');
        if ($porcentaje === 0.0 || $porcentaje < -90 || $porcentaje > 200) fallar('Escribe un porcentaje entre 1 y 90.');
        $productos = $pdo->prepare('SELECT id, precio FROM productos WHERE categoria = ? AND activo = 1');
        $productos->execute([$categoria]);
        $actualizar = $pdo->prepare('UPDATE productos SET precio = ? WHERE id = ?');
        $pdo->beginTransaction();
        $cambiados = 0;
        foreach ($productos as $p) {
            $actualizar->execute([redondear_precio($p['precio'] * (1 + $porcentaje / 100)), $p['id']]);
            $cambiados++;
        }
        $pdo->commit();
        responder(['ok' => true, 'cambiados' => $cambiados]);
        break;

// RESTAURAR el catálogo de fábrica (datos_base.php); los productos agregados se ocultan
    case 'restaurar':
        $pdo->beginTransaction();
        $pdo->exec('UPDATE productos SET activo = 0 WHERE es_base = 0');
        $restaurar = $pdo->prepare('INSERT INTO productos (id, referencia, nombre, categoria, descripcion, precio, imagen, es_base, activo, orden) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
            ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion), precio = VALUES(precio), imagen = VALUES(imagen), activo = 1, orden = VALUES(orden)');
        $stock = $pdo->prepare('INSERT IGNORE INTO inventario (producto_id, talla, unidades) VALUES (?, ?, 20)');
        foreach (catalogo_base() as $p) {
            $restaurar->execute([$p['id'], $p['referencia'], $p['nombre'], $p['categoria'], $p['descripcion'], $p['precio'], $p['imagen'], $p['orden']]);
            foreach (CATEGORIAS[$p['categoria']]['tallas'] as $talla) {
                $stock->execute([$p['id'], $talla]);
            }
        }
        $pdo->commit();
        responder(['ok' => true]);
        break;

    default:
        fallar('Acción no válida.');
}
