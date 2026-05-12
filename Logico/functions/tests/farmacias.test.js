/**
 * Pruebas unitarias del módulo `farmacias` (modelo geográfico Chile).
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

// Mock geografia.existeComuna para no requerir la BD real
jest.mock('../src/geografia', () => ({
    existeComuna: jest.fn(async (id) => Number(id) > 0),
}));

const db = require('../src/db');
const farmacias = require('../src/farmacias');
const { existeComuna } = require('../src/geografia');

const admin = { id_usuario: 1, rol: 'admin', es_admin_principal: true };

beforeEach(() => {
    db.__fake.reset();
    existeComuna.mockReset();
    existeComuna.mockResolvedValue(true);
});

describe('crearFarmacia', () => {
    test('valida campos obligatorios', async () => {
        await expect(
            farmacias.crearFarmacia({
                payload: { nombre: 'X' }, usuario: admin,
            })
        ).rejects.toThrow(/obligator/i);
    });

    test('rechaza comuna_id que no existe en el catálogo', async () => {
        existeComuna.mockResolvedValue(false);

        await expect(
            farmacias.crearFarmacia({
                payload: {
                    nombre: 'F1', direccion: 'Av X 123',
                    comuna_id: 99999,
                },
                usuario: admin,
            })
        ).rejects.toThrow(/comuna_id no existe/i);
    });

    test('crea farmacia, hace JOIN para devolver comuna+región y registra auditoría', async () => {
        db.__fake
            .next([{ id_farmacia: 10 }])                      // INSERT farmacias RETURNING id
            .next([{                                          // SELECT con JOINs
                id_farmacia: 10, nombre: 'F1', direccion: 'Av X 123',
                telefono: null, activa: true,
                fecha_creacion: new Date().toISOString(),
                comuna_id: 308, comuna: 'Santiago',
                id_provincia: 41, provincia: 'Santiago',
                id_region: 7, region: 'Metropolitana de Santiago',
                region_codigo: 'RM',
            }])
            .next([{ id_auditoria: 1 }]);                     // INSERT auditoria

        const f = await farmacias.crearFarmacia({
            payload: { nombre: 'F1', direccion: 'Av X 123', comuna_id: 308 },
            usuario: admin,
        });

        expect(f.id_farmacia).toBe(10);
        expect(f.comuna).toBe('Santiago');
        expect(f.region_codigo).toBe('RM');
        expect(db.__fake.beginCount).toBe(1);
        expect(db.__fake.commitCount).toBe(1);

        const sqls = db.__fake.queries.map((q) => q.sql);
        expect(sqls.some((s) => s.includes('INSERT INTO farmacias'))).toBe(true);
        expect(sqls.some((s) => s.includes('INSERT INTO auditoria'))).toBe(true);
    });
});

describe('actualizarFarmacia', () => {
    test('rechaza si no existe la farmacia', async () => {
        db.__fake.next([]);   // SELECT FOR UPDATE devuelve vacío

        await expect(
            farmacias.actualizarFarmacia({
                idFarmacia: 999,
                payload: { nombre: 'Nueva' },
                usuario: admin,
            })
        ).rejects.toThrow(/no encontrada/i);
        expect(db.__fake.rollbackCount).toBe(1);
    });

    test('actualiza campos parciales y registra auditoría', async () => {
        const previa = {
            id_farmacia: 5, nombre: 'Vieja', direccion: 'Av X 1',
            telefono: null, comuna_id: 308, activa: true,
        };
        const nueva = {
            id_farmacia: 5, nombre: 'Nueva', direccion: 'Av X 1',
            telefono: null, comuna_id: 308, activa: true,
            fecha_creacion: new Date().toISOString(),
            comuna: 'Santiago', id_provincia: 41, provincia: 'Santiago',
            id_region: 7, region: 'Metropolitana de Santiago', region_codigo: 'RM',
        };
        db.__fake
            .next([previa])     // SELECT FOR UPDATE
            .next([])           // UPDATE
            .next([nueva])      // SELECT JOIN
            .next([{ id_auditoria: 1 }]); // INSERT auditoria

        const r = await farmacias.actualizarFarmacia({
            idFarmacia: 5, payload: { nombre: 'Nueva' }, usuario: admin,
        });
        expect(r.nombre).toBe('Nueva');
        expect(r.comuna).toBe('Santiago');
    });
});

describe('desactivarFarmacia', () => {
    test('marca activa=false, devuelve modelo enriquecido y audita', async () => {
        db.__fake
            .next([{ id_farmacia: 1, nombre: 'F' }])    // UPDATE RETURNING
            .next([{ id_auditoria: 1 }])                // INSERT auditoria
            .next([{                                    // SELECT JOIN
                id_farmacia: 1, nombre: 'F', activa: false,
                direccion: 'X', telefono: null, comuna_id: 308,
                comuna: 'Santiago', provincia: 'Santiago',
                region: 'Metropolitana de Santiago', region_codigo: 'RM',
                fecha_creacion: new Date().toISOString(),
            }]);

        const r = await farmacias.desactivarFarmacia({
            idFarmacia: 1, usuario: admin,
        });
        expect(r.activa).toBe(false);
        expect(r.region_codigo).toBe('RM');
    });
});
