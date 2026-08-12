const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = 3000;

// =========================================================
// 🔌 CONFIGURACIÓN DE LA CONEXIÓN A POSTGRESQL
// =========================================================
const pool = new Pool({
    user: 'postgres',          // Usuario por defecto de Postgres
    host: 'localhost',         // Como está en tu PC, es localhost
    database: 'empresa_db',    // La base de datos que creamos en pgAdmin
    password: 'Chapos22',      // Tu contraseña de Postgres
    port: 5432,                // Puerto por defecto de Postgres
});

// Probar la conexión apenas arranque el servidor
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error al conectarse a PostgreSQL:', err.stack);
    }
    console.log('🔌 CONECTADO CON ÉXITO A POSTGRESQL (empresa_db)');
    release();
});

// Configuraciones del servidor
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));


// =========================================================
// 🔐 MÓDULO 1: LOGICA DEL LOGIN INTELIGENTE (Por Palabras Clave)
// =========================================================
app.post('/api/login', async (req, res) => {
    const { usuario, contrasena } = req.body;

    // 1. Validamos la contraseña única general para todo el local
    if (contrasena !== '123') {
        return res.json({ success: false, mensaje: 'Contraseña incorrecta.' });
    }

    if (!usuario) {
        return res.json({ success: false, mensaje: 'Por favor, ingresa un nombre de usuario.' });
    }

    // Convertimos a minúsculas para evitar errores de tipeo al analizar
    const usuarioMinuscula = usuario.toLowerCase();
    let rol = '';
    let nombreLimpio = usuario; 

    // 2. Analizamos únicamente con qué palabra clave termina el texto
    if (usuarioMinuscula.endsWith('_admin')) {
        rol = 'admin';
        nombreLimpio = usuario.substring(0, usuario.toLowerCase().lastIndexOf('_admin'));
    } 
    else if (usuarioMinuscula.endsWith('_stock')) {
        rol = 'deposito';
        nombreLimpio = usuario.substring(0, usuario.toLowerCase().lastIndexOf('_stock'));
    } 
    else if (usuarioMinuscula.endsWith('_ventas')) {
        rol = 'vendedor';
        nombreLimpio = usuario.substring(0, usuario.toLowerCase().lastIndexOf('_ventas'));
    } 
    else {
        return res.json({ 
            success: false, 
            mensaje: 'Usuario inválido. Tu nombre debe terminar en _admin, _stock o _ventas.' 
        });
    }

    if (!nombreLimpio.trim()) {
        nombreLimpio = "Usuario";
    }

    res.json({ 
        success: true, 
        mensaje: nombreLimpio, 
        rol: rol 
    });
});


// =========================================================
// 📦 MÓDULO 2: INVENTARIO / DEPÓSITO
// =========================================================

// 📥 1. GUARDAR UN PRODUCTO NUEVO EN POSTGRESQL
app.post('/api/productos', async (req, res) => {
    const { codigo_barra, nombre, precio_costo, precio_venta, stock_actual } = req.body;
    try {
        await pool.query(
            'INSERT INTO productos (codigo_barra, nombre, precio_costo, precio_venta, stock_actual) VALUES ($1, $2, $3, $4, $5)',
            [codigo_barra, nombre, parseFloat(precio_costo), parseFloat(precio_venta), stock_actual ? parseInt(stock_actual) : 0]
        );
        res.json({ success: true, mensaje: 'Producto guardado con éxito en el inventario.' });
    } catch (error) {
        console.error("Error al insertar producto:", error);
        res.status(500).json({ success: false, mensaje: 'Error interno en el servidor al guardar.' });
    }
});

// 🔍 2. TRAER TODOS LOS PRODUCTOS
app.get('/api/productos', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM productos ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener los productos desde PostgreSQL' });
    }
});

// 🔄 3. MODIFICAR UN PRODUCTO EXISTENTE
app.put('/api/productos/:id', async (req, res) => {
    const { id } = req.params;
    const { codigo_barra, nombre, precio_costo, precio_venta, stock_actual } = req.body;
    try {
        await pool.query(
            'UPDATE productos SET codigo_barra=$1, nombre=$2, precio_costo=$3, precio_venta=$4, stock_actual=$5 WHERE id=$6',
            [codigo_barra, nombre, parseFloat(precio_costo), parseFloat(precio_venta), parseInt(stock_actual), id]
        );
        res.json({ success: true, mensaje: 'Artículo actualizado correctamente.' });
    } catch (error) {
        console.error("Error al actualizar producto:", error);
        res.status(500).json({ success: false, mensaje: 'Error al actualizar el producto.' });
    }
});

// ❌ 4. ELIMINAR UN PRODUCTO
app.delete('/api/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM productos WHERE id = $1', [id]);
        res.json({ success: true, mensaje: 'Artículo eliminado del inventario.' });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ success: false, mensaje: 'Error al eliminar el producto.' });
    }
});


// =========================================================
// 🛒 MÓDULO 3: PUNTO DE VENTA (Procesar una venta)
// =========================================================
app.post('/api/ventas/procesar', async (req, res) => {
    const { carrito } = req.body;

    if (!carrito || carrito.length === 0) {
        return res.json({ success: false, mensaje: 'El carrito está vacío.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        let totalFacturado = 0;
        let totalCosto = 0;

        for (const item of carrito) {
            const resProducto = await client.query('SELECT stock_actual, nombre, precio_venta, precio_costo FROM productos WHERE id = $1', [item.id]);
            
            if (resProducto.rows.length > 0) {
                const prod = resProducto.rows[0];
                if (prod.stock_actual < item.cantidad) {
                    await client.query('ROLLBACK');
                    return res.json({ 
                        success: false, 
                        mensaje: `Stock insuficiente para: ${prod.nombre}. Disponible: ${prod.stock_actual}` 
                    });
                }

                // Cálculo para registros
                totalFacturado += (parseFloat(prod.precio_venta) * item.cantidad);
                totalCosto += (parseFloat(prod.precio_costo) * item.cantidad);

                await client.query(
                    'UPDATE productos SET stock_actual = stock_actual - $1 WHERE id = $2',
                    [item.cantidad, item.id]
                );
            }
        }

        // Registrar la venta en la tabla de ganancias
        await client.query('INSERT INTO registro_ganancias (total_facturado, costo_total) VALUES ($1, $2)', [totalFacturado, totalCosto]);

        await client.query('COMMIT');
        res.json({ success: true, mensaje: '¡Venta procesada con éxito y stock actualizado!' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error interno al procesar la venta.' });
    } finally {
        client.release();
    }
});


// =========================================================
// 👥 MÓDULO 4: GESTIÓN DE EMPLEADOS
// =========================================================
app.post('/api/empleados', async (req, res) => {
    const { nombre, apellido, edad, puesto, horario, telefono, email, numero_emergencia } = req.body;
    try {
        await pool.query(
            'INSERT INTO fichas_empleados (nombre, apellido, edad, puesto, horario, telefono, email, numero_emergencia) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [nombre, apellido, edad ? parseInt(edad) : null, puesto, horario, telefono, email, numero_emergencia]
        );
        res.json({ success: true, mensaje: 'Ficha de empleado guardada con éxito.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error al guardar la ficha.' });
    }
});

app.get('/api/empleados', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM fichas_empleados ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener las fichas.' });
    }
});

app.put('/api/empleados/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, edad, puesto, horario, telefono, email, numero_emergencia } = req.body;
    try {
        await pool.query(
            'UPDATE fichas_empleados SET nombre=$1, apellido=$2, edad=$3, puesto=$4, horario=$5, telefono=$6, email=$7, numero_emergencia=$8 WHERE id=$9',
            [nombre, apellido, edad ? parseInt(edad) : null, puesto, horario, telefono, email, numero_emergencia, id]
        );
        res.json({ success: true, mensaje: 'Ficha de empleado actualizada correctamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error al actualizar la ficha.' });
    }
});

app.delete('/api/empleados/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM fichas_empleados WHERE id = $1', [id]);
        res.json({ success: true, mensaje: 'Ficha de empleado actualizada correctamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error al eliminar la ficha.' });
    }
});


// =========================================================
// 🚚 MÓDULO 5: GESTIÓN DE PROVEEDORES
// =========================================================
app.post('/api/proveedores', async (req, res) => {
    const { empresa, telefono, email, mercaderia, dias_entrega } = req.body;
    try {
        await pool.query(
            'INSERT INTO proveedores (empresa, telefono, email, mercaderia, dias_entrega) VALUES ($1, $2, $3, $4, $5)',
            [empresa, telefono, email, mercaderia, dias_entrega]
        );
        res.json({ success: true, mensaje: 'Proveedor guardado con éxito.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error al guardar el proveedor.' });
    }
});

app.get('/api/proveedores', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM proveedores ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener los proveedores.' });
    }
});

app.put('/api/proveedores/:id', async (req, res) => {
    const { id } = req.params;
    const { empresa, telefono, email, mercaderia, dias_entrega } = req.body;
    try {
        await pool.query(
            'UPDATE proveedores SET empresa=$1, telefono=$2, email=$3, mercaderia=$4, dias_entrega=$5 WHERE id=$6',
            [empresa, telefono, email, mercaderia, dias_entrega, id]
        );
        res.json({ success: true, mensaje: 'Proveedor actualizado correctamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error al actualizar el proveedor.' });
    }
});

app.delete('/api/proveedores/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM proveedores WHERE id = $1', [id]);
        res.json({ success: true, mensaje: 'Proveedor eliminado del sistema.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error al eliminar el proveedor.' });
    }
});

app.post('/api/deposito/sumar-stock', async (req, res) => {
    const { id, cantidad } = req.body;
    try {
        await pool.query(
            'UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2',
            [cantidad, id]
        );
        res.json({ success: true, mensaje: 'Stock actualizado correctamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, mensaje: 'Error en el servidor al actualizar stock.' });
    }
});

// =========================================================
// 📈 MÓDULO 6: DATOS PARA EL DASHBOARD (Ganancias)
// =========================================================
app.get('/api/ganancias/dia', async (req, res) => {
    try {
        const query = `
            SELECT 
                COALESCE(SUM(total_facturado), 0) as total_venta, 
                COALESCE(SUM(costo_total), 0) as total_costo 
            FROM registro_ganancias 
            WHERE DATE(fecha_venta) = CURRENT_DATE`;
        
        const result = await pool.query(query);
        const data = result.rows[0];
        
        res.json([{
            total_venta: data.total_venta,
            total_costo: data.total_costo,
            ganancia: parseFloat(data.total_venta) - parseFloat(data.total_costo)
        }]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener ganancias del día" });
    }
});


// =========================================================
// 🚀 INICIAR EL SERVIDOR
// =========================================================
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 SERVIDOR CENTRAL CORRIENDO exitosamente.`);
    console.log(`💻 Localmente puedes verlo en: http://localhost:${PORT}`);
    console.log(`====================================================`);
});