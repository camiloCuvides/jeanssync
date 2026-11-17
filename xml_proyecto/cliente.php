<?php
// cliente.php
// CLIENTE del catálogo de JeansSync.
// Uso (con el servidor encendido):
//   php cliente.php                -> pide api_xml.php   (Opción B, datos de MySQL)
//   php cliente.php servicio.php   -> pide servicio.php  (Opción A, archivo productos.xml)
// 1) pide el XML al servidor por HTTP, 2) lo valida con el DTD local,
// 3) lo consulta con XPath.

$url = 'http://localhost:8000/' . ($argv[1] ?? 'api_xml.php');

// --- 1. Solicitud HTTP al servidor ---------------------------
$respuesta = @file_get_contents($url);
if ($respuesta === false) {
    echo "[ERROR] No se pudo conectar con $url. ¿Está encendido el servidor?\n";
    exit(1);
}
echo "[OK] Respuesta recibida: " . strlen($respuesta) . " bytes.\n";

// --- 2. Analizar y validar la respuesta ----------------------
libxml_use_internal_errors(true);
$documento = new DOMDocument();
if (!$documento->loadXML($respuesta, LIBXML_DTDLOAD)) {
    echo "[ERROR] La respuesta NO está bien formada.\n";
    exit(1);
}
if (!$documento->validate()) {
    echo "[ERROR] La respuesta NO cumple el contrato (DTD). No se procesa.\n";
    foreach (libxml_get_errors() as $error) {
        echo "    línea {$error->line}: " . trim($error->message) . "\n";
    }
    exit(1);
}
echo "[OK] La respuesta es válida según productos.dtd.\n";

// --- 3. Consultar con XPath -----------------------------------
$xpath = new DOMXPath($documento);
echo "Productos en el catálogo: " . $xpath->evaluate('count(//producto)') . "\n";
echo "Productos con menos de 10 unidades (hay que reabastecer):\n";
foreach ($xpath->query('//producto[unidades < 10]') as $producto) {
    $referencia = $xpath->evaluate('string(referencia)', $producto);
    $nombre     = $xpath->evaluate('string(nombre)', $producto);
    $unidades   = $xpath->evaluate('string(unidades)', $producto);
    echo "   - $referencia $nombre (unidades: $unidades)\n";
}
