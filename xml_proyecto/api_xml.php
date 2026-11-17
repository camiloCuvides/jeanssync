<?php
// api_xml.php
// SERVIDOR de JeansSync (Opción B): genera la respuesta XML del catálogo
// a partir de la base de datos MySQL "jeanssync" del proyecto, en vez de
// leer un archivo fijo. Es la versión XML de api/productos.php (que responde JSON).
// Requisito: MySQL encendido en XAMPP y la base instalada con api/instalar.php.

// 1. Datos: consulta a la base de datos del proyecto --------------------
//    Mismos datos de conexión que jeanEcommerce/api/config.php
try {
    $pdo = new PDO(
        'mysql:host=127.0.0.1;dbname=jeanssync;charset=utf8mb4',
        'root',
        '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    // Un registro por producto activo; las unidades son la suma de todas sus tallas
    $registros = $pdo->query(
        'SELECT p.id, p.referencia, p.nombre, p.categoria, p.precio, p.descripcion, p.es_base,
                COALESCE(SUM(i.unidades), 0) AS unidades
           FROM productos p
           LEFT JOIN inventario i ON i.producto_id = p.id
          WHERE p.activo = 1
          GROUP BY p.id, p.referencia, p.nombre, p.categoria, p.precio, p.descripcion, p.es_base
          ORDER BY FIELD(p.categoria, "caballero", "dama", "ninos"), p.orden, p.id'
    )->fetchAll();
} catch (PDOException $error) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'No se pudo leer la base de datos jeanssync: ' . $error->getMessage();
    exit;
}

header('Content-Type: application/xml; charset=UTF-8');

// 2. Documento con su DOCTYPE (el contrato que el cliente usará para validar)
$implementacion = new DOMImplementation();
$doctype   = $implementacion->createDocumentType('productos', '', 'productos.dtd');
$documento = $implementacion->createDocument('', '', $doctype);
$documento->encoding     = 'UTF-8';
$documento->formatOutput = true;            // sangría para que sea legible

// 3. Elemento raíz con sus atributos
$raiz = $documento->createElement('productos');
$raiz->setAttribute('tienda', 'JeansSync');
$raiz->setAttribute('fecha', date('Y-m-d'));
$documento->appendChild($raiz);

// 4. Un elemento <producto> por cada fila, respetando el ORDEN que exige el DTD:
//    (referencia, nombre, precio, unidades, descripcion?)
foreach ($registros as $fila) {
    $producto = $documento->createElement('producto');
    $producto->setAttribute('id', $fila['id']);
    $producto->setAttribute('categoria', $fila['categoria']);
    $producto->setAttribute('origen', $fila['es_base'] ? 'fabrica' : 'admin');

    // createElement + textContent escapa automáticamente los caracteres especiales (& < >)
    foreach (['referencia', 'nombre', 'precio', 'unidades'] as $campo) {
        $hijo = $documento->createElement($campo);
        $hijo->textContent = (string) $fila[$campo];
        if ($campo === 'precio') {
            $hijo->setAttribute('moneda', 'COP');
        }
        $producto->appendChild($hijo);
    }
    if (trim((string) $fila['descripcion']) !== '') {   // elemento opcional (descripcion?)
        $hijo = $documento->createElement('descripcion');
        $hijo->textContent = $fila['descripcion'];
        $producto->appendChild($hijo);
    }
    $raiz->appendChild($producto);
}

// 5. Enviar el XML como respuesta
echo $documento->saveXML();
