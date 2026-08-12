-- 1. TABLA DE EMPLEADOS (Para el control de usuarios y contraseña)
CREATE TABLE empleados (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    contrasena VARCHAR(100) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol VARCHAR(20) NOT NULL -- 'admin', 'vendedor', 'deposito'
);

-- 2. TABLA DE PRODUCTOS (El catálogo general)
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    codigo_barra VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio_costo NUMERIC(10, 2) NOT NULL,
    precio_venta NUMERIC(10, 2) NOT NULL,
    stock_actual INT DEFAULT 0
);

-- 3. TABLA DE MOVIMIENTOS DE STOCK (Ingresos y bajas por rotura/devolución)
CREATE TABLE movimientos_stock (
    id SERIAL PRIMARY KEY,
    id_producto INT REFERENCES productos(id),
    tipo_movimiento VARCHAR(20) NOT NULL, -- 'ingreso', 'baja', 'devolucion'
    cantidad INT NOT NULL,
    motivo VARCHAR(255),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABLA DE VENTAS (Cabecera general del ticket)
CREATE TABLE ventas (
    id SERIAL PRIMARY KEY,
    id_vendedor INT REFERENCES empleados(id),
    total NUMERIC(10, 2) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. DETALLE DE LAS VENTAS (Los productos específicos de cada ticket)
CREATE TABLE detalle_ventas (
    id SERIAL PRIMARY KEY,
    id_venta INT REFERENCES ventas(id),
    id_producto INT REFERENCES productos(id),
    cantidad INT NOT NULL,
    precio_unitario NUMERIC(10, 2) NOT NULL
);

-- =========================================================
-- REGISTRO DE PRUEBA: Vamos a crear un usuario administrador
-- El usuario será: admin  |  La contraseña será: 1234
-- =========================================================
INSERT INTO empleados (usuario, contrasena, nombre, rol) 
VALUES ('admin', '1234', 'Serrano Lucas', 'admin');