<?php
// servicio.php
// Simula el SERVIDOR del catálogo de JeansSync (Opción A: archivo fijo).
// Cuando un cliente lo solicita por HTTP, responde con el documento XML.

// Encabezado HTTP: avisa al cliente que la respuesta es XML en UTF-8
header('Content-Type: application/xml; charset=UTF-8');

// Envía el contenido de productos.xml como cuerpo de la respuesta
readfile('productos.xml');
