<?php
// =========================================================
// JeansSync · Sesión: registro, ingreso, salida y perfil
//   GET  auth.php                      → usuario de la sesión actual (o null)
//   POST auth.php {accion: "registro"} → crea una cuenta de cliente e inicia sesión
//   POST auth.php {accion: "login"}    → ingreso de cliente (correo + clave)
//   POST auth.php {accion: "admin"}    → ingreso del administrador (usuario + clave)
//   POST auth.php {accion: "salir"}    → cierra la sesión
//   POST auth.php {accion: "perfil"}   → actualiza teléfono, ciudad y dirección del cliente
//   POST auth.php {accion: "recuperar"}      → envía al correo del cliente un enlace para cambiar la clave
//   POST auth.php {accion: "validar_enlace"} → revisa si el enlace del correo todavía sirve
//   POST auth.php {accion: "restablecer"}    → con el enlace, guarda la clave nueva e inicia sesión
// =========================================================
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/correo.php';

iniciar_sesion();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    responder(['ok' => true, 'usuario' => usuario_publico(usuario_actual())]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fallar('Método no permitido.', 405);
}

$datos = leer_json();
$accion = $datos['accion'] ?? '';

// Inicia la sesión del usuario (cambia el id de sesión por seguridad) y responde con sus datos
function entrar(array $usuario): void
{
    session_regenerate_id(true);
    $_SESSION['usuario_id'] = (int) $usuario['id'];
    responder(['ok' => true, 'usuario' => usuario_publico($usuario)]);
}

// Responde "clave incorrecta" con una pequeña espera para frenar a quien intente adivinar
function rechazar_ingreso(string $mensaje): void
{
    usleep(400000); // frena intentos repetidos de adivinar claves
    fallar($mensaje, 401);
}

// ---------- Ayudas para "¿Olvidaste tu clave?" ----------

// Dirección de la tienda para armar el enlace del correo. Ej: http://localhost/jeanssync/
function url_tienda(): string
{
    $protocolo = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $carpeta = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'], 2)), '/'); // en Windows dirname puede devolver "\"
    return $protocolo . '://' . $_SERVER['HTTP_HOST'] . $carpeta . '/';
}

// Borra de la base de datos los enlaces que ya vencieron (no sirven para nada)
function borrar_enlaces_vencidos(): void
{
    db()->exec('DELETE FROM recuperaciones WHERE expira <= NOW()');
}

// Devuelve el cliente dueño del enlace, o corta con error si el enlace no existe o venció
function buscar_enlace(string $token): array
{
    borrar_enlaces_vencidos();
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) fallar('El enlace no es válido. Pide uno nuevo.', 410);
    $consulta = db()->prepare("SELECT u.* FROM recuperaciones r JOIN usuarios u ON u.id = r.usuario_id WHERE r.token_hash = ? AND u.rol = 'cliente'");
    $consulta->execute([hash('sha256', $token)]);
    $usuario = $consulta->fetch();
    if (!$usuario) fallar('Este enlace ya se usó o venció. Pide uno nuevo desde "¿Olvidaste tu clave?".', 410);
    return $usuario;
}

switch ($accion) {
// REGISTRO de cliente: valida datos, revisa que el correo no exista, guarda la clave cifrada e inicia sesión
    case 'registro':
        $nombre = texto($datos['nombre'] ?? '', 80);
        $correo = mb_strtolower(texto($datos['correo'] ?? '', 120));
        $clave = (string) ($datos['clave'] ?? '');
        $telefono = texto($datos['telefono'] ?? '', 30);
        $ciudad = texto($datos['ciudad'] ?? '', 60);
        $direccion = texto($datos['direccion'] ?? '', 160);

        if (mb_strlen($nombre) < 3) fallar('Escribe tu nombre completo.');
        if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) fallar('Escribe un correo válido.');
        if (mb_strlen($clave) < 6) fallar('La clave debe tener al menos 6 caracteres.');
        if ($telefono !== '' && !preg_match('/^[0-9 +()-]{7,30}$/', $telefono)) fallar('El teléfono solo puede tener números.');

        $existe = db()->prepare('SELECT id FROM usuarios WHERE correo = ?');
        $existe->execute([$correo]);
        if ($existe->fetch()) fallar('Ya existe una cuenta con ese correo. Ingresa con tu clave.', 409);

        db()->prepare('INSERT INTO usuarios (nombre, correo, clave_hash, telefono, ciudad, direccion, rol) VALUES (?, ?, ?, ?, ?, ?, \'cliente\')')
            ->execute([$nombre, $correo, password_hash($clave, PASSWORD_DEFAULT), $telefono ?: null, $ciudad ?: null, $direccion ?: null]);
        $id = (int) db()->lastInsertId();
        entrar(['id' => $id, 'nombre' => $nombre, 'correo' => $correo, 'telefono' => $telefono, 'ciudad' => $ciudad, 'direccion' => $direccion, 'rol' => 'cliente']);
        break;

// INGRESO de cliente con correo y clave
    case 'login':
        $correo = mb_strtolower(texto($datos['correo'] ?? '', 120));
        $clave = (string) ($datos['clave'] ?? '');
        $consulta = db()->prepare("SELECT * FROM usuarios WHERE correo = ? AND rol = 'cliente'");
        $consulta->execute([$correo]);
        $usuario = $consulta->fetch();
        if (!$usuario || !password_verify($clave, $usuario['clave_hash'])) rechazar_ingreso('Correo o clave incorrectos.');
        entrar($usuario);
        break;

// INGRESO del administrador con usuario ("admin") y clave
    case 'admin':
        $nombreUsuario = mb_strtolower(texto($datos['usuario'] ?? '', 40));
        $clave = (string) ($datos['clave'] ?? '');
        $consulta = db()->prepare("SELECT * FROM usuarios WHERE usuario = ? AND rol = 'admin'");
        $consulta->execute([$nombreUsuario]);
        $usuario = $consulta->fetch();
        if (!$usuario || !password_verify($clave, $usuario['clave_hash'])) rechazar_ingreso('Usuario o clave de administrador incorrectos.');
        entrar($usuario);
        break;

// CERRAR SESIÓN
    case 'salir':
        $_SESSION = [];
        session_destroy();
        responder(['ok' => true, 'usuario' => null]);
        break;

// ACTUALIZAR teléfono, ciudad y dirección del cliente
    case 'perfil':
        $usuario = exigir_cliente();
        $telefono = texto($datos['telefono'] ?? $usuario['telefono'] ?? '', 30);
        $ciudad = texto($datos['ciudad'] ?? $usuario['ciudad'] ?? '', 60);
        $direccion = texto($datos['direccion'] ?? $usuario['direccion'] ?? '', 160);
        db()->prepare('UPDATE usuarios SET telefono = ?, ciudad = ?, direccion = ? WHERE id = ?')
            ->execute([$telefono ?: null, $ciudad ?: null, $direccion ?: null, $usuario['id']]);
        responder(['ok' => true, 'usuario' => usuario_publico(usuario_actual())]);
        break;

// ¿OLVIDASTE TU CLAVE? Paso 1: envía al correo del cliente un enlace para cambiar la clave
    case 'recuperar':
        $correo = mb_strtolower(texto($datos['correo'] ?? '', 120));
        if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) fallar('Escribe un correo válido.');
        if (!correo_configurado()) {
            error_log('[JeansSync] Falta configurar SMTP_USUARIO y SMTP_CLAVE en api/config.php');
            fallar('El envío de correos aún no está configurado en la tienda. Escríbenos por WhatsApp para ayudarte.', 503);
        }
        $consulta = db()->prepare("SELECT id, nombre, correo FROM usuarios WHERE correo = ? AND rol = 'cliente'");
        $consulta->execute([$correo]);
        $usuario = $consulta->fetch();
        if (!$usuario) {
            usleep(400000);
            fallar('No encontramos una cuenta con ese correo. Revisa que esté bien escrito o crea una cuenta.', 404);
        }

        borrar_enlaces_vencidos();
        // Un enlace por minuto como máximo, para que nadie llene de correos al cliente
        $reciente = db()->prepare('SELECT COUNT(*) FROM recuperaciones WHERE usuario_id = ? AND creado > DATE_SUB(NOW(), INTERVAL 1 MINUTE)');
        $reciente->execute([$usuario['id']]);
        if ((int) $reciente->fetchColumn() > 0) fallar('Ya te enviamos un enlace hace un momento. Espera un minuto para pedir otro.', 429);

        // Solo sirve el último enlace: se borran los anteriores del cliente y se crea uno nuevo
        db()->prepare('DELETE FROM recuperaciones WHERE usuario_id = ?')->execute([$usuario['id']]);
        $token = bin2hex(random_bytes(32)); // 64 caracteres imposibles de adivinar
        db()->prepare('INSERT INTO recuperaciones (usuario_id, token_hash, expira) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ' . ENLACE_MINUTOS . ' MINUTE))')
            ->execute([$usuario['id'], hash('sha256', $token)]);

        try {
            [$asunto, $html, $textoPlano] = correo_enlace_recuperacion($usuario['nombre'], url_tienda() . 'paginas/restablecer.html?token=' . $token);
            enviar_correo($usuario['correo'], $asunto, $html, $textoPlano);
        } catch (Throwable $error) {
            error_log('[JeansSync] Correo de recuperación: ' . $error->getMessage());
            db()->prepare('DELETE FROM recuperaciones WHERE usuario_id = ?')->execute([$usuario['id']]);
            fallar('No pudimos enviar el correo en este momento. Intenta de nuevo en unos minutos.', 502);
        }
        responder(['ok' => true, 'correo' => $usuario['correo'], 'minutos' => ENLACE_MINUTOS]);
        break;

// ¿OLVIDASTE TU CLAVE? Paso 2: la página restablecer.html revisa si el enlace sirve antes de mostrar el formulario
    case 'validar_enlace':
        $usuario = buscar_enlace((string) ($datos['token'] ?? ''));
        responder(['ok' => true, 'nombre' => $usuario['nombre'], 'correo' => $usuario['correo']]);
        break;

// ¿OLVIDASTE TU CLAVE? Paso 3: guarda la clave nueva, borra el enlace e inicia sesión
    case 'restablecer':
        $usuario = buscar_enlace((string) ($datos['token'] ?? ''));
        $clave = (string) ($datos['clave'] ?? '');
        if (mb_strlen($clave) < 6) fallar('La clave nueva debe tener al menos 6 caracteres.');
        db()->prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?')->execute([password_hash($clave, PASSWORD_DEFAULT), $usuario['id']]);
        db()->prepare('DELETE FROM recuperaciones WHERE usuario_id = ?')->execute([$usuario['id']]);
        entrar($usuario);
        break;

    default:
        fallar('Acción no válida.');
}
