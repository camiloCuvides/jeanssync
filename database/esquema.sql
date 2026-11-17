-- =========================================================
-- JeansSync · Base de datos (MySQL / MariaDB de XAMPP)
-- La crea automáticamente api/instalar.php
-- =========================================================

CREATE DATABASE IF NOT EXISTS jeanssync CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;
USE jeanssync;

-- Clientes y el único administrador.
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  correo        VARCHAR(120) NOT NULL UNIQUE,
  usuario       VARCHAR(40)  NULL UNIQUE,          -- solo lo usa el administrador ("admin")
  clave_hash    VARCHAR(255) NOT NULL,             -- password_hash() de PHP, nunca la clave real
  telefono      VARCHAR(30)  NULL,
  ciudad        VARCHAR(60)  NULL,
  direccion     VARCHAR(160) NULL,
  rol           ENUM('cliente', 'admin') NOT NULL DEFAULT 'cliente',
  creado        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Catálogo de jeans.
CREATE TABLE IF NOT EXISTS productos (
  id            VARCHAR(40)  PRIMARY KEY,           -- ej: caballero-01
  referencia    VARCHAR(20)  NOT NULL UNIQUE,       -- ej: JS-CAB-001
  nombre        VARCHAR(60)  NOT NULL,
  categoria     ENUM('caballero', 'dama', 'ninos') NOT NULL,
  descripcion   VARCHAR(200) NOT NULL DEFAULT '',
  precio        INT UNSIGNED NOT NULL,              -- en pesos colombianos (COP)
  imagen        VARCHAR(500) NOT NULL,              -- enlace o ruta en assets/img/productos/
  es_base       TINYINT(1)   NOT NULL DEFAULT 0,    -- 1 = viene con la tienda, 0 = lo agregó el administrador
  activo        TINYINT(1)   NOT NULL DEFAULT 1,    -- 0 = eliminado de la tienda (se conserva para los pedidos)
  orden         INT          NOT NULL DEFAULT 0,
  creado        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_categoria (categoria, activo, orden)
) ENGINE=InnoDB;

-- Unidades disponibles por talla.
CREATE TABLE IF NOT EXISTS inventario (
  producto_id   VARCHAR(40) NOT NULL,
  talla         VARCHAR(6)  NOT NULL,
  unidades      INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (producto_id, talla),
  CONSTRAINT fk_inventario_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Pedidos (solo los puede hacer un cliente registrado).
CREATE TABLE IF NOT EXISTS pedidos (
  id            VARCHAR(20)  PRIMARY KEY,           -- ej: JS-8F3K2Q
  usuario_id    INT UNSIGNED NOT NULL,
  nombre        VARCHAR(80)  NOT NULL,
  correo        VARCHAR(120) NOT NULL,
  telefono      VARCHAR(30)  NOT NULL,
  ciudad        VARCHAR(60)  NOT NULL,
  direccion     VARCHAR(160) NOT NULL,
  metodo_pago   VARCHAR(40)  NOT NULL,
  subtotal      INT UNSIGNED NOT NULL,
  envio         INT UNSIGNED NOT NULL DEFAULT 0,
  total         INT UNSIGNED NOT NULL,
  estado        ENUM('recibido', 'enviado', 'entregado', 'cancelado') NOT NULL DEFAULT 'recibido',
  creado        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usuario (usuario_id, creado),
  CONSTRAINT fk_pedido_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- Prendas de cada pedido (guarda nombre y precio del momento de la compra).
CREATE TABLE IF NOT EXISTS pedido_detalle (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id       VARCHAR(20)  NOT NULL,
  producto_id     VARCHAR(40)  NOT NULL,
  nombre_producto VARCHAR(60)  NOT NULL,
  talla           VARCHAR(6)   NOT NULL,
  cantidad        INT UNSIGNED NOT NULL,
  precio_unitario INT UNSIGNED NOT NULL,
  CONSTRAINT fk_detalle_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB;

-- Enlaces para recuperar la clave ("¿Olvidaste tu clave?").
-- Cada fila es un enlace enviado al correo del cliente. Se guarda solo el hash (sha256) del
-- token, nunca el token real. La fila se BORRA cuando el cliente cambia la clave, cuando pide
-- un enlace nuevo o cuando vence (ENLACE_MINUTOS en api/config.php).
CREATE TABLE IF NOT EXISTS recuperaciones (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL,
  token_hash    CHAR(64)     NOT NULL UNIQUE,      -- sha256 del token que va en el enlace
  expira        DATETIME     NOT NULL,
  creado        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usuario (usuario_id),
  CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
