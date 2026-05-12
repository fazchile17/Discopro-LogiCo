/**
 * Pruebas unitarias de asignación de motoristas.
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
const rutas = require('../src/rutas');

const usuario = { id_usuario: 5, rol: 'operadora' };

beforeEach(() => {
    db.__fake.reset();
});

describe('asignarMotorista', () => {
    test('asigna correctamente cuando todo está OK', async () => {
        db.__fake
            .next([{ id_pedido: 10, activo: true }])         // SELECT pedido FOR UPDATE
            .next([])                                         // SELECT ruta activa pedido (vacío)
            .next([{                                          // SELECT motorista
                id_usuario: 7, rol: 'motorista', activo: true, disponible: true,
            }])
            .next([])                                         // SELECT ruta activa motorista (vacío)
            .next([{ id_ruta: 99, codigo_ruta: 'RUT-1' }])    // INSERT ruta
            .next([{ id_estado: 6 }])                         // SELECT estado retiro_pedido
            .next([]);                                        // INSERT historial

        const r = await rutas.asignarMotorista({
            pedidoId: 10, motoristaId: 7, usuario,
        });

        expect(r.id_ruta).toBe(99);
        expect(db.__fake.commitCount).toBe(1);
    });

    test('rechaza si motorista ya tiene ruta activa (Regla 1)', async () => {
        db.__fake
            .next([{ id_pedido: 10, activo: true }])
            .next([])
            .next([{ id_usuario: 7, rol: 'motorista', activo: true, disponible: true }])
            .next([{ exists: 1 }]); // ruta activa existe

        await expect(
            rutas.asignarMotorista({ pedidoId: 10, motoristaId: 7, usuario })
        ).rejects.toThrow(/ruta activa/);

        expect(db.__fake.rollbackCount).toBe(1);
    });

    test('rechaza si pedido ya tiene ruta activa (Regla 2)', async () => {
        db.__fake
            .next([{ id_pedido: 10, activo: true }])
            .next([{ exists: 1 }]); // pedido ya tiene ruta

        await expect(
            rutas.asignarMotorista({ pedidoId: 10, motoristaId: 7, usuario })
        ).rejects.toThrow(/ruta activa/);
    });

    test('rechaza si pedidoId o motoristaId faltan', async () => {
        await expect(rutas.asignarMotorista({ usuario })).rejects.toThrow(/obligatorios/);
        await expect(rutas.asignarMotorista({ pedidoId: 1, usuario })).rejects.toThrow(/obligatorios/);
    });

    test('rechaza si usuario no es motorista', async () => {
        db.__fake
            .next([{ id_pedido: 10, activo: true }])
            .next([])
            .next([{ id_usuario: 7, rol: 'operadora', activo: true, disponible: true }]);

        await expect(
            rutas.asignarMotorista({ pedidoId: 10, motoristaId: 7, usuario })
        ).rejects.toThrow(/no es motorista/);
    });
});

describe('validarDisponibilidadMotorista', () => {
    test('lanza si no existe', async () => {
        db.__fake.next([]);
        await expect(rutas.validarDisponibilidadMotorista(99)).rejects.toThrow(/no encontrado/);
    });

    test('lanza si no es motorista', async () => {
        db.__fake.next([{ rol: 'admin', activo: true, disponible: true, tiene_ruta_activa: false }]);
        await expect(rutas.validarDisponibilidadMotorista(2)).rejects.toThrow(/rol motorista/);
    });

    test('lanza si tiene ruta activa', async () => {
        db.__fake.next([{ rol: 'motorista', activo: true, disponible: true, tiene_ruta_activa: true }]);
        await expect(rutas.validarDisponibilidadMotorista(2)).rejects.toThrow(/ruta activa/);
    });
});
