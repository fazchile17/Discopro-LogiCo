/**
 * Pruebas unitarias de transiciones de estado.
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
const estados = require('../src/estados');

beforeEach(() => {
    db.__fake.reset();
});

describe('cambiarEstadoPedido', () => {
    const motorista = { id_usuario: 9, rol: 'motorista' };

    test('motorista puede pasar pedido de en_ruta → entregado', async () => {
        db.__fake
            .next([{ id_pedido: 1, activo: true, estado_actual: 'en_ruta' }])
            .next([{ motorista_id: 9 }])             // ruta del motorista
            .next([{ id_estado: 3 }])                // estado entregado
            .next([{ id_historial: 50 }])            // INSERT historial
            .next([]);                                // UPDATE rutas (cierre)

        const r = await estados.cambiarEstadoPedido({
            pedidoId: 1, nuevoEstado: 'entregado',
            comentario: 'OK', usuario: motorista,
        });
        expect(r.id_historial).toBe(50);
    });

    test('rechaza transición inválida (entregado → cualquier cosa)', async () => {
        db.__fake.next([{ id_pedido: 1, activo: true, estado_actual: 'entregado' }]);

        await expect(
            estados.cambiarEstadoPedido({
                pedidoId: 1, nuevoEstado: 'en_ruta', usuario: motorista,
            })
        ).rejects.toThrow(/Transición inválida/);
    });

    test('rechaza estado desconocido', async () => {
        await expect(
            estados.cambiarEstadoPedido({
                pedidoId: 1, nuevoEstado: 'volando', usuario: motorista,
            })
        ).rejects.toThrow(/no es válido/);
    });

    test('motorista NO asignado no puede actualizar', async () => {
        db.__fake
            .next([{ id_pedido: 1, activo: true, estado_actual: 'en_ruta' }])
            .next([{ motorista_id: 999 }]);

        await expect(
            estados.cambiarEstadoPedido({
                pedidoId: 1, nuevoEstado: 'entregado', usuario: motorista,
            })
        ).rejects.toThrow(/motorista asignado/);
    });
});
