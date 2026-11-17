<?php
// =========================================================
// JeansSync · Configuración común de la API
// =========================================================
declare(strict_types=1);

// Datos de conexión de XAMPP (por defecto root sin clave).
const DB_HOST = '127.0.0.1';
const DB_NAME = 'jeanssync';
const DB_USER = 'root';
const DB_PASS = '';

// ---------- Correo (para "¿Olvidaste tu clave?") ----------
// La tienda envía desde esta cuenta el enlace para cambiar la clave. El enlace llega al correo
// con el que el cliente creó su cuenta.
// Con Gmail: activa la verificación en 2 pasos y crea una "contraseña de aplicación" en
// https://myaccount.google.com/apppasswords. Pon el Gmail en SMTP_USUARIO y esa clave de
// 16 letras en SMTP_CLAVE. Mientras estén vacíos, "¿Olvidaste tu clave?" avisa que el envío
// de correos no está configurado.
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PUERTO = 465;              // 465 = SSL · 587 = STARTTLS
const SMTP_USUARIO = '';              // ej: 'tiendajeanssync@gmail.com'
const SMTP_CLAVE = '';                // contraseña de aplicación (no la clave normal del correo)
const CORREO_REMITENTE = 'JeansSync'; // nombre que verá el cliente
const ENLACE_MINUTOS = 30;            // minutos que sirve el enlace para cambiar la clave

const ENVIO_GRATIS_DESDE = 250000;
const PRECIO_MINIMO = 1000;
const PRECIO_MAXIMO = 10000000;
// Alerta de inventario: el panel avisa en rojo cuando una talla tiene estas unidades o menos.
const STOCK_BAJO = 3;

// Tallas y nombres de cada sección (deben coincidir con assets/js/datos/productos.js).
const CATEGORIAS = [
    'caballero' => ['nombre' => 'Caballero', 'prefijo' => 'CAB', 'tallas' => ['28', '30', '32', '34', '36']],
    'dama'      => ['nombre' => 'Dama',      'prefijo' => 'DAM', 'tallas' => ['6', '8', '10', '12', '14', '16']],
    'ninos'     => ['nombre' => 'Niños',     'prefijo' => 'NIN', 'tallas' => ['2', '4', '6', '8', '10', '12']],
];

// Conexión única a MySQL (se crea la primera vez que se usa y se reutiliza)
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }
    return $pdo;
}

// ---------- Respuestas JSON ----------
function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

// Responde con un error en JSON y detiene el script. Ej: fallar('Escribe tu nombre.')
function fallar(string $mensaje, int $codigo = 400): void
{
    responder(['ok' => false, 'error' => $mensaje], $codigo);
}

// Lee el cuerpo JSON que envía el navegador (fetch) y lo devuelve como arreglo
function leer_json(): array
{
    $cuerpo = file_get_contents('php://input') ?: '';
    if ($cuerpo === '') {
        return [];
    }
    $datos = json_decode($cuerpo, true);
    if (!is_array($datos)) {
        fallar('Los datos enviados no son válidos.');
    }
    return $datos;
}

// Limpia un texto: quita espacios de más y lo corta a un máximo de caracteres
function texto($valor, int $maximo): string
{
    $limpio = trim(preg_replace('/\s+/u', ' ', (string) $valor) ?? '');
    return mb_substr($limpio, 0, $maximo);
}

// ---------- Sesión ----------
function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_name('JEANSSYNC');
        session_set_cookie_params(['path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
        session_start();
    }
}

// Devuelve el usuario con sesión abierta (o null). La sesión guarda solo su id.
function usuario_actual(): ?array
{
    iniciar_sesion();
    if (empty($_SESSION['usuario_id'])) {
        return null;
    }
    $consulta = db()->prepare('SELECT id, nombre, correo, usuario, telefono, ciudad, direccion, rol FROM usuarios WHERE id = ?');
    $consulta->execute([$_SESSION['usuario_id']]);
    $usuario = $consulta->fetch();
    return $usuario ?: null;
}

// Corta la petición si no hay un cliente con sesión (por ejemplo, para comprar)
function exigir_cliente(): array
{
    $usuario = usuario_actual();
    if (!$usuario) {
        fallar('Debes iniciar sesión para continuar.', 401);
    }
    if ($usuario['rol'] !== 'cliente') {
        fallar('Ingresa con una cuenta de cliente para comprar.', 403);
    }
    return $usuario;
}

// Corta la petición si quien llama no es el administrador
function exigir_admin(): array
{
    $usuario = usuario_actual();
    if (!$usuario || $usuario['rol'] !== 'admin') {
        fallar('Acceso solo para el administrador.', 403);
    }
    return $usuario;
}

// Datos del usuario que se envían al navegador (nunca la clave).
function usuario_publico(?array $usuario): ?array
{
    if (!$usuario) {
        return null;
    }
    return [
        'id' => (int) $usuario['id'],
        'nombre' => $usuario['nombre'],
        'correo' => $usuario['correo'],
        'telefono' => $usuario['telefono'] ?? '',
        'ciudad' => $usuario['ciudad'] ?? '',
        'direccion' => $usuario['direccion'] ?? '',
        'rol' => $usuario['rol'],
    ];
}

// ---------- Productos ----------
function productos_con_inventario(bool $soloActivos = true): array
{
    $sql = 'SELECT id, referencia, nombre, categoria, descripcion, precio, imagen, es_base, activo FROM productos'
        . ($soloActivos ? ' WHERE activo = 1' : '')
        . ' ORDER BY FIELD(categoria, "caballero", "dama", "ninos"), orden, creado, id';
    $productos = db()->query($sql)->fetchAll();
    $inventario = [];
    foreach (db()->query('SELECT producto_id, talla, unidades FROM inventario') as $fila) {
        $inventario[$fila['producto_id']][$fila['talla']] = (int) $fila['unidades'];
    }
    return array_map(function (array $p) use ($inventario): array {
        $tallas = CATEGORIAS[$p['categoria']]['tallas'];
        $stock = [];
        foreach ($tallas as $talla) {
            $stock[$talla] = $inventario[$p['id']][$talla] ?? 0;
        }
        return [
            'id' => $p['id'],
            'reference' => $p['referencia'],
            'name' => $p['nombre'],
            'category' => $p['categoria'],
            'description' => $p['descripcion'],
            'price' => (int) $p['precio'],
            'image' => $p['imagen'],
            'isBase' => (bool) $p['es_base'],
            'sizes' => $tallas,
            'inventory' => $stock,
        ];
    }, $productos);
}

// ---------- Errores ----------
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

set_exception_handler(function (Throwable $error): void {
    error_log('[JeansSync] ' . $error->getMessage());
    if ($error instanceof PDOException && str_contains($error->getMessage(), 'Unknown database')) {
        fallar('La base de datos no está instalada. Abre http://localhost/jeanssync/api/instalar.php', 500);
    }
    if ($error instanceof PDOException && str_contains($error->getMessage(), 'Connection refused')) {
        fallar('No se pudo conectar a MySQL. Verifica que esté encendido en XAMPP.', 500);
    }
    fallar('Ocurrió un error en el servidor. Intenta de nuevo.', 500);
});
