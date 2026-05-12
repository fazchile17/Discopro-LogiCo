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
const incidencias = require('../src/incidencias');

beforeEach(() => {
    db.__fake.reset();
});

describe('registrarIncidencia', () => {
    const motorista = { id_usuario: 7, rol: 'motorista' };

    test('crea incidencia y cancela ruta', async () => {
        db.__fake
            .next([{ id_pedido: 5, activo: true }])
            .next([{ id_ruta: 12, motorista_id: 7, estado_ruta: 'en_curso' }])
            .next([{ id_incidencia: 33 }])
            .next([{ id_estado: 4 }])               // no_entregado
            .next([])                                // historial
            .next([]);                               // UPDATE ruta

        const i = await incidencias.registrarIncidencia({
            pedidoId: 5,
            tipoIncidencia: 'cliente_ausente',
            descripcion: 'Tocó pero no abrieron',
            usuario: motorista,
        });
        expect(i.id_incidencia).toBe(33);
    });

    test('rechaza tipo inválido', async () => {
        await expect(
            incidencias.registrarIncidencia({
                pedidoId: 5, tipoIncidencia: 'inexistente',
                descripcion: 'x', usuario: motorista,
            })
        ).rejects.toThrow(/inválido/);
    });

    test('rechaza descripción vacía', async () => {
        await expect(
            incidencias.registrarIncidencia({
                pedidoId: 5, tipoIncidencia: 'otro',
                descripcion: '   ', usuario: motorista,
            })
        ).rejects.toThrow(/obligatoria/);
    });
});
