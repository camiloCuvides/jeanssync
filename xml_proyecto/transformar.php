<?php
// transformar.php
// Uso:  php transformar.php
// Aplica productos.xsl a productos.xml y guarda reporte_productos.html

$datos = new DOMDocument();
$datos->load('productos.xml');             // el documento XML (datos)

$hoja = new DOMDocument();
$hoja->load('productos.xsl');              // la hoja XSLT (receta)

$procesador = new XSLTProcessor();          // el procesador XSLT
$procesador->importStylesheet($hoja);

$html = $procesador->transformToXML($datos);   // ejecuta la transformación
file_put_contents('reporte_productos.html', $html);

echo "[OK] Transformación terminada. Abra reporte_productos.html en el navegador.\n";
