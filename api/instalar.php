<?php
// =========================================================
// JeansSync · Instalador de la base de datos
// Uso: abrir http://localhost/jeanssync/api/instalar.php
//      (o desde consola: C:\xampp\php\php.exe api\instalar.php)
// Se puede ejecutar varias veces: no borra datos existentes.
// =========================================================
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/datos_base.php';

header('Content-Type: text/plain; charset=utf-8');

// Solo desde el mismo computador.
if (PHP_SAPI !== 'cli' && !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(403);
    exit("El instalador solo se puede ejecutar desde el mismo computador.\n");
}

$salida = [];
try {
    // 1. Crear la base de datos.
    $servidor = new PDO('mysql:host=' . DB_HOST . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $servidor->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci');
    $salida[] = '✓ Base de datos "' . DB_NAME . '" lista.';

    // 2. Crear las tablas desde database/esquema.sql.
    $sql = file_get_contents(__DIR__ . '/../database/esquema.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $sentencias = array_filter(array_map('trim', explode(';', $sql)));
    $pdo = db();
    foreach ($sentencias as $sentencia) {
        if (preg_match('/^(CREATE DATABASE|USE)\b/i', $sentencia)) {
            continue;
        }
        $pdo->exec($sentencia);
    }
    $salida[] = '✓ Tablas creadas: usuarios, productos, inventario, pedidos, pedido_detalle, recuperaciones.';

    // 3. Cargar el catálogo de fábrica (solo los que no existan).
    $insertar = $pdo->prepare('INSERT IGNORE INTO productos (id, referencia, nombre, categoria, descripcion, precio, imagen, es_base, orden) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)');
    $stock = $pdo->prepare('INSERT IGNORE INTO inventario (producto_id, talla, unidades) VALUES (?, ?, 20)');
    $nuevos = 0;
    foreach (catalogo_base() as $p) {
        $insertar->execute([$p['id'], $p['referencia'], $p['nombre'], $p['categoria'], $p['descripcion'], $p['precio'], $p['imagen'], $p['orden']]);
        $nuevos += $insertar->rowCount();
        foreach (CATEGORIAS[$p['categoria']]['tallas'] as $talla) {
            $stock->execute([$p['id'], $talla]);
        }
    }
    $total = (int) $pdo->query('SELECT COUNT(*) FROM productos')->fetchColumn();
    $salida[] = "✓ Catálogo: $nuevos productos nuevos ($total en total), 20 unidades por talla.";

    // 4. Crear el único administrador.
    $hayAdmin = (int) $pdo->query("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin'")->fetchColumn();
    if ($hayAdmin === 0) {
        $pdo->prepare("INSERT INTO usuarios (nombre, correo, usuario, clave_hash, rol) VALUES ('Administrador', 'admin@jeanssync.co', 'admin', ?, 'admin')")
            ->execute([password_hash('JeansSync#2026', PASSWORD_DEFAULT)]);
        $salida[] = '✓ Administrador creado (usuario: admin).';
    } else {
        $salida[] = '✓ El administrador ya existía.';
    }

    // 5. Carpeta para las fotos que sube el administrador.
    $carpeta = __DIR__ . '/../assets/img/productos';
    if (!is_dir($carpeta)) {
        mkdir($carpeta, 0775, true);
    }
    $salida[] = '✓ Carpeta de fotos lista: assets/img/productos';
    $salida[] = '';
    $salida[] = 'Instalación terminada. Abre la tienda en http://localhost/jeanssync/';
} catch (Throwable $error) {
    http_response_code(500);
    $salida[] = '✗ Error: ' . $error->getMessage();
    $salida[] = 'Verifica que MySQL esté encendido en el panel de XAMPP.';
}

echo implode("\n", $salida) . "\n";
