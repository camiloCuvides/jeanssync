<?php
// =========================================================
// Catálogo de fábrica de JeansSync (60 jeans).
// Lo usan instalar.php (primera carga) y el botón "Restaurar catálogo" del panel.
// Fotos de Unsplash verificadas: cada sección solo usa imágenes de su público.
// =========================================================
declare(strict_types=1);

// Devuelve los 60 productos de fábrica: 20 por sección, precios escalonados y fotos verificadas
function catalogo_base(): array
{
    $fotos = [
        'caballero' => [
            '1617114919297-3c8ddb01f599', '1555689502-c4b22d76c56f', '1627999421551-6edd493626aa',
            '1674075872359-a174bc7ed420', '1764069415220-909767290088', '1776843370483-4f793bc14739',
            '1629244032690-1c243449f90a', '1767899390509-892ad3978dfa', '1473966968600-fa801b869a1a',
            '1603183282361-8222ed090deb', '1595781572981-d63151b232ed', '1594762360467-09de972840ca',
            '1764069415137-756fbca30a17',
        ],
        'dama' => [
            '1598554747436-c9293d6a588f', '1475178626620-a4d074967452', '1603217192634-61068e4d4bf9',
            '1578693082747-50c396cacd81', '1605192554106-d549b1b975cd', '1605192554260-6a38e95f9bd1',
            '1628504016664-b10ce6362708', '1602580849762-4f18739d66e8', '1608370946545-7d93571b5593',
            '1681638413089-0d2232195ad1', '1577210897949-1f56f943bf82',
        ],
        'ninos' => [
            '1681551210432-228395e59420', '1606841466616-795c2c8dec72', '1631044237696-6b38064fbbf4',
            '1541043081679-e877f6b15b51', '1681551210430-6fa83eb95a8e', '1666379685315-e51efcf30544',
            '1681551210466-a03ef45baed5', '1666379685317-f37a716bc4ec',
        ],
    ];

    $secciones = [
        'caballero' => [
            'base' => 149900,
            'nombres' => ['Ajustado Índigo', 'Recto Clásico', 'Entubado Urbano', 'Regular Piedra', 'Negro Esencial', 'Azul Oscuro', 'Holgado Retro', 'Recto Crudo', 'Ajustado Desgastado', 'Clásico Noventero', 'Cónico Azul', 'Jean de Trabajo', 'Azul Medio', 'Negro Lavado', 'Elástico Cómodo', 'Corte Moderno', 'Azul Noche', 'Lavado Retro', 'Recto Diario', 'Índigo Original'],
            'descripciones' => ['Un corte limpio y con carácter para todos los días.', 'El corte clásico que nunca pasa de moda.', 'Tela flexible para moverte a tu manera.'],
        ],
        'dama' => [
            'base' => 139900,
            'nombres' => ['Tiro Alto Aurora', 'Bota Ancha Horizonte', 'Entubado Nube', 'Bota Campana Brisa', 'Recto Esencial', 'Tiro Alto Sol', 'Negro Noche', 'Azul Claro Marea', 'Retro Alma', 'Recto Libre', 'Bota Ancha Cielo', 'Holgado Índigo', 'Campana Estelar', 'Entubado Clásico', 'Azul Crudo', 'Relajado Luna', 'Cintura Alta Mar', 'Azul Profundo', 'Corte Sereno', 'Diario Cómodo'],
            'descripciones' => ['Un corte pensado para que te sientas tú, en cualquier plan.', 'Cintura alta y tela suave para llevar a tu ritmo.', 'Silueta versátil, desde la mañana hasta la noche.'],
        ],
        'ninos' => [
            'base' => 89900,
            'nombres' => ['Mini Explorador', 'Pequeño Clásico', 'Aventura Ajustado', 'Azul Recreo', 'Mini Holgado', 'Estrella Azul', 'Día de Juego', 'Índigo Pequeño', 'Nube Suave', 'Mini Trabajador', 'Clásico Peque', 'Mini Piedra', 'Rayo Azul', 'Jean Feliz', 'Mini Retro', 'Cómodo Siempre', 'Pequeña Marea', 'Explorador Cómodo', 'Azul de Paseo', 'Mini Original'],
            'descripciones' => ['Cómodo y listo para cada nueva aventura.', 'Tela suave para jugar, correr y descubrir.', 'Un corte práctico para días llenos de planes.'],
        ],
    ];

    $productos = [];
    foreach ($secciones as $categoria => $datos) {
        foreach ($datos['nombres'] as $i => $nombre) {
            $numero = str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT);
            $productos[] = [
                'id' => "$categoria-$numero",
                'referencia' => 'JS-' . CATEGORIAS[$categoria]['prefijo'] . '-' . str_pad((string) ($i + 1), 3, '0', STR_PAD_LEFT),
                'nombre' => $nombre,
                'categoria' => $categoria,
                'descripcion' => $datos['descripciones'][$i % 3],
                'precio' => $datos['base'] + ($i % 5) * 10000,
                'imagen' => 'https://images.unsplash.com/photo-' . $fotos[$categoria][$i % count($fotos[$categoria])] . '?auto=format&fit=crop&w=900&q=85',
                'orden' => $i + 1,
            ];
        }
    }
    return $productos;
}
