<?php
// =========================================================
// JeansSync · Envío de correos por SMTP (sin librerías externas)
//   correo_configurado()                       → true si hay usuario y clave SMTP en config.php
//   enviar_correo($para, $asunto, $html, $txt) → envía el mensaje o lanza una excepción
//   correo_enlace_recuperacion($nombre, $url) → arma el correo con el botón para cambiar la clave
// =========================================================
declare(strict_types=1);

function correo_configurado(): bool
{
    return SMTP_USUARIO !== '' && SMTP_CLAVE !== '';
}

// Lee la respuesta del servidor SMTP (puede venir en varias líneas: "250-..." y la última "250 ...")
function smtp_leer($socket): string
{
    $respuesta = '';
    while (($linea = fgets($socket, 515)) !== false) {
        $respuesta .= $linea;
        if (!isset($linea[3]) || $linea[3] === ' ') {
            break;
        }
    }
    return $respuesta;
}

// Envía un comando y verifica que el servidor conteste con el código esperado (ej: 250)
function smtp_comando($socket, ?string $comando, int $esperado): string
{
    if ($comando !== null) {
        fwrite($socket, $comando . "\r\n");
    }
    $respuesta = smtp_leer($socket);
    if ((int) substr($respuesta, 0, 3) !== $esperado) {
        throw new RuntimeException('SMTP respondió: ' . trim($respuesta));
    }
    return $respuesta;
}

// Codifica textos con tildes para las cabeceras del correo (asunto y nombre del remitente)
function cabecera_utf8(string $texto): string
{
    return '=?UTF-8?B?' . base64_encode($texto) . '?=';
}

function enviar_correo(string $para, string $asunto, string $html, string $texto): void
{
    $ssl = SMTP_PUERTO === 465;
    $contexto = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $socket = @stream_socket_client(($ssl ? 'ssl://' : 'tcp://') . SMTP_HOST . ':' . SMTP_PUERTO, $errno, $error, 15, STREAM_CLIENT_CONNECT, $contexto);
    if (!$socket) {
        throw new RuntimeException("No se pudo conectar a " . SMTP_HOST . ": $error");
    }
    stream_set_timeout($socket, 15);

    try {
        smtp_comando($socket, null, 220);
        smtp_comando($socket, 'EHLO localhost', 250);
        if (!$ssl) {
            smtp_comando($socket, 'STARTTLS', 220);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('No se pudo activar TLS.');
            }
            smtp_comando($socket, 'EHLO localhost', 250);
        }
        smtp_comando($socket, 'AUTH LOGIN', 334);
        smtp_comando($socket, base64_encode(SMTP_USUARIO), 334);
        smtp_comando($socket, base64_encode(SMTP_CLAVE), 235);
        smtp_comando($socket, 'MAIL FROM:<' . SMTP_USUARIO . '>', 250);
        smtp_comando($socket, 'RCPT TO:<' . $para . '>', 250);
        smtp_comando($socket, 'DATA', 354);

        $limite = 'js-' . bin2hex(random_bytes(8));
        $mensaje = implode("\r\n", [
            'From: ' . cabecera_utf8(CORREO_REMITENTE) . ' <' . SMTP_USUARIO . '>',
            'To: <' . $para . '>',
            'Subject: ' . cabecera_utf8($asunto),
            'Date: ' . date('r'),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@jeanssync.local>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $limite . '"',
            '',
            '--' . $limite,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            rtrim(chunk_split(base64_encode($texto))),
            '--' . $limite,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            rtrim(chunk_split(base64_encode($html))),
            '--' . $limite . '--',
        ]);
        smtp_comando($socket, $mensaje . "\r\n.", 250);
        fwrite($socket, "QUIT\r\n");
    } finally {
        fclose($socket);
    }
}

// Correo con el enlace para cambiar la clave. Devuelve [asunto, html, texto].
// $enlace es la dirección completa de paginas/restablecer.html con el token.
function correo_enlace_recuperacion(string $nombre, string $enlace): array
{
    $primerNombre = htmlspecialchars(explode(' ', trim($nombre))[0], ENT_QUOTES, 'UTF-8');
    $enlaceHtml = htmlspecialchars($enlace, ENT_QUOTES, 'UTF-8');
    $minutos = ENLACE_MINUTOS;
    $asunto = 'Cambia tu clave de JeansSync';
    $html = <<<HTML
<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f9fd;font-family:Arial,Helvetica,sans-serif;color:#101d3b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f9fd;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:22px;overflow:hidden">
        <tr><td style="background:#122957;padding:24px 32px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-.01em">Jeans<span style="color:#20a8e5">Sync</span></td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 12px;font-size:18px;font-weight:700">Hola, $primerNombre.</p>
          <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#566883">Recibimos una solicitud para cambiar la clave de tu cuenta en JeansSync. Haz clic en el botón para crear una clave nueva:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 26px"><tr><td style="border-radius:999px;background:#122957">
            <a href="$enlaceHtml" style="display:inline-block;padding:15px 34px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">Cambiar mi clave →</a>
          </td></tr></table>
          <p style="margin:0 0 8px;font-size:14px;color:#566883">El enlace vence en <strong>$minutos minutos</strong> y solo se puede usar una vez.</p>
          <p style="margin:0 0 20px;font-size:14px;color:#566883">Si no fuiste tú, ignora este correo: tu clave actual sigue funcionando.</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9fb0c8">¿El botón no funciona? Copia y pega esta dirección en tu navegador:<br><a href="$enlaceHtml" style="color:#24519e;word-break:break-all">$enlaceHtml</a></p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #d4e2f0;font-size:12px;color:#9fb0c8">© 2026 JeansSync · Cúcuta, Colombia</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
HTML;
    $texto = "Hola, $primerNombre.\n\nRecibimos una solicitud para cambiar la clave de tu cuenta en JeansSync.\n"
        . "Abre este enlace para crear una clave nueva:\n$enlace\n\n"
        . "El enlace vence en $minutos minutos y solo se puede usar una vez.\n"
        . "Si no fuiste tú, ignora este correo: tu clave actual sigue funcionando.\n\nJeansSync · Cúcuta, Colombia";
    return [$asunto, $html, $texto];
}
