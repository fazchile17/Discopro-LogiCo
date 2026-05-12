/**
 * Pruebas unitarias del módulo `pedidos`.
 * No requieren PostgreSQL real (usan un mock de la capa db).
 */
const { createFakeDb } = require('./helpers/fakeDb');

jest.mock('../src/db', () => {
    const fake = require('./helpers/fakeDb').createFakeDb();
    return {
        __fake: fake,
        query: (...a) => fake.query(...a),
        withTransaction: (work) => fake.withTransaction(work),
        pool: fake.pool,
    };
});

const db = require('../src/db');
const pedidos = require('../src/pedidos');

const usuarioOperadora = {
    id_usuario: 1, rol: 'operadora', nombre: 'Maria', apellido: 'O',
};

beforeEach(() => {
    db.__fake.reset();
});

describe('crearPedido', () => {
    test('crea pedido + historial dentro de una transacción', async () => {
        db.__fake
            .next([{ id_estado: 1 }])                              // SELECT estado
            .next([{ id_pedido: 100, codigo_pedido: 'PED-X' }])    // INSERT pedido
            .next([]);                                             // INSERT historial

        const result = await pedidos.crearPedido({
            payload: {
                nombre_cliente: 'Juan',
                direccion_entrega: 'Calle 1',
                telefono_cliente: '555-1234',
                detalle_pedido: 'Receta 50ml',
                fecha_programada: '2026-05-01T10:00:00Z',
            },
            usuario: usuarioOperadora,
        });

        expect(result.id_pedido).toBe(100);
        expect(db.__fake.beginCount).toBe(1);
        expect(db.__fake.commitCount).toBe(1);
        expect(db.__fake.rollbackCount).toBe(0);

        const sqls = db.__fake.queries.map((q) => q.sql);
        expect(sqls.some((s) => s.includes('INSERT INTO pedidos'))).toBe(true);
        expect(sqls.some((s) => s.includes('INSERT INTO historial_estados'))).toBe(true);
    });

    test('rechaza payload sin campos obligatorios', async () => {
        await expect(
            pedidos.crearPedido({
                payload: { nombre_cliente: 'Juan' },
                usuario: usuarioOperadora,
            })
        ).rejects.toThrow(/Campos obligatorios/);
    });

    test('rechaza fecha_programada inválida', async () => {
        await expect(
            pedidos.crearPedido({
                payload: {
                    nombre_cliente: 'Juan',
                    direccion_entrega: 'Calle 1',
                    telefono_cliente: '555',
                    detalle_pedido: 'X',
                    fecha_programada: 'not-a-date',
                },
                usuario: usuarioOperadora,
            })
        ).rejects.toThrow(/fecha_programada inválida/);
    });

    test('hace rollback si una query falla', async () => {
        db.__fake.next([{ id_estado: 1 }]).next(new Error('insert failure'));

        await expect(
            pedidos.crearPedido({
                payload: {
                    nombre_cliente: 'Juan',
                    direccion_entrega: 'Calle 1',
                    telefono_cliente: '555',
                    detalle_pedido: 'X',
                    fecha_programada: '2026-05-01T10:00:00Z',
                },
                usuario: usuarioOperadora,
            })
        ).rejects.toThrow(/insert failure/);

        expect(db.__fake.rollbackCount).toBe(1);
        expect(db.__fake.commitCount).toBe(0);
    });
});
