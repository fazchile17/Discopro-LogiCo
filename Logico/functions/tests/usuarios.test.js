/**
 * Pruebas unitarias del módulo `usuarios`: jerarquía de administradores
 * y reglas críticas de seguridad. No requieren PostgreSQL real ni Firebase.
 */
const { createFakeDb } = require('./helpers/fakeDb');

jest.mock('../src/usuarios-table', () => ({
    ensureUsuariosTableResolved: jest.fn(async () => {}),
    getTblUsuarios: () => 'public.usuarios',
    diagnosticarUsuarios: jest.fn(async () => ({})),
}));

jest.mock('../src/db', () => {
    const fake = require('./helpers/fakeDb').createFakeDb();
    return {
        __fake: fake,
        query: (...a) => fake.query(...a),
        withTransaction: (work) => fake.withTransaction(work),
        withClient: (work) => fake.withClient(work),
        pool: fake.pool,
    };
});

// Mock Firebase Admin: no llamar a la red, solo simular createUser/deleteUser/updateUser.
jest.mock('../src/auth', () => ({
    admin: {
        auth: () => ({
            createUser: jest.fn(async ({ email }) => ({ uid: `mock-uid-${email}` })),
            deleteUser: jest.fn(async () => undefined),
            updateUser: jest.fn(async () => undefined),
            setCustomUserClaims: jest.fn(async () => undefined),
        }),
    },
}));

const db = require('../src/db');
const usuarios = require('../src/usuarios');

const adminPrincipal = {
    id_usuario: 1, rol: 'admin', es_admin_principal: true,
    nombre: 'Root', apellido: 'Admin', correo: 'root@logico.app',
};
const adminSecundario = {
    id_usuario: 2, rol: 'admin', es_admin_principal: false,
    nombre: 'Sec', apellido: 'Admin', correo: 'sec@logico.app',
};
const operadora = {
    id_usuario: 3, rol: 'operadora', es_admin_principal: false,
    nombre: 'O', apellido: 'P',
};

beforeEach(() => {
    db.__fake.reset();
});

describe('crearUsuario', () => {
    test('rechaza si el actor no es admin', async () => {
        await expect(
            usuarios.crearUsuario({
                payload: { nombre: 'X', apellido: 'Y', correo: 'a@b.com', contrasena: 'Aa12345!', rol: 'operadora' },
                actor: operadora,
            })
        ).rejects.toThrow(/administrador/i);
    });

    test('cualquier admin puede crear otro admin', async () => {
        db.__fake
            .next([{
                id_usuario: 99, firebase_uid: 'mock-uid-nuevo@logico.app',
                nombre: 'X', apellido: 'Y', correo: 'nuevo@logico.app',
                rol: 'admin', activo: true, es_admin_principal: false,
                fecha_creacion: new Date().toISOString(),
            }])
            .next([{ id_auditoria: 1 }]);

        const u = await usuarios.crearUsuario({
            payload: {
                nombre: 'X', apellido: 'Y',
                correo: 'nuevo@logico.app', contrasena: 'Aa12345!', rol: 'admin',
            },
            actor: adminSecundario,
        });
        expect(u.rol).toBe('admin');
    });

    test('admin principal puede crear admin secundario', async () => {
        db.__fake
            .next([{
                id_usuario: 99, firebase_uid: 'mock-uid-nuevo@logico.app',
                nombre: 'X', apellido: 'Y', correo: 'nuevo@logico.app',
                rol: 'admin', activo: true, es_admin_principal: false,
                fecha_creacion: new Date().toISOString(),
            }])
            .next([{ id_auditoria: 1 }]);

        const u = await usuarios.crearUsuario({
            payload: {
                nombre: 'X', apellido: 'Y',
                correo: 'nuevo@logico.app', contrasena: 'Aa12345!', rol: 'admin',
            },
            actor: adminPrincipal,
        });
        expect(u.id_usuario).toBe(99);
        expect(db.__fake.commitCount).toBe(1);
    });

    test('rechaza correos inválidos y contraseñas cortas', async () => {
        await expect(
            usuarios.crearUsuario({
                payload: {
                    nombre: 'X', apellido: 'Y',
                    correo: 'no-email', contrasena: '123', rol: 'operadora',
                },
                actor: adminPrincipal,
            })
        ).rejects.toThrow(/correo inválido|contrasena/i);
    });
});

describe('eliminarUsuario - jerarquía', () => {
    test('NO se puede eliminar al admin principal', async () => {
        // SELECT FOR UPDATE → admin principal
        db.__fake.next([{ ...adminPrincipal }]);
        // INSERT auditoria intento_bloqueado
        db.__fake.next([{ id_auditoria: 7 }]);

        await expect(
            usuarios.eliminarUsuario({
                idUsuario: adminPrincipal.id_usuario,
                actor: adminSecundario,
            })
        ).rejects.toThrow(/administrador principal/i);
    });

    test('NO se puede eliminar la propia cuenta', async () => {
        db.__fake.next([{ ...adminSecundario }]);
        db.__fake.next([{ id_auditoria: 8 }]);

        await expect(
            usuarios.eliminarUsuario({
                idUsuario: adminSecundario.id_usuario,
                actor: adminSecundario,
            })
        ).rejects.toThrow(/propia cuenta/i);
    });

    test('admin secundario NO puede eliminar a otro admin secundario', async () => {
        const otroAdmin = { id_usuario: 5, rol: 'admin', es_admin_principal: false };
        db.__fake.next([otroAdmin]);
        db.__fake.next([{ id_auditoria: 9 }]);

        await expect(
            usuarios.eliminarUsuario({
                idUsuario: otroAdmin.id_usuario,
                actor: adminSecundario,
            })
        ).rejects.toThrow(/admin principal/i);
    });

    test('admin principal puede eliminar (soft) a una operadora', async () => {
        const op = { id_usuario: 50, rol: 'operadora', es_admin_principal: false, correo: 'op@x.com', firebase_uid: null };
        db.__fake
            .next([op])              // SELECT FOR UPDATE
            .next([])                // UPDATE activo=FALSE
            .next([{ id_auditoria: 11 }]);  // INSERT auditoria

        const r = await usuarios.eliminarUsuario({
            idUsuario: 50, actor: adminPrincipal,
        });
        expect(r.eliminado).toBe(true);
        expect(r.hard).toBe(false);
        expect(db.__fake.commitCount).toBe(1);
    });
});

describe('cambiarRolUsuario - jerarquía', () => {
    afterEach(() => {
        db.__fake.clearPendingResponses();
    });

    test('NO se puede cambiar rol del admin principal (otro admin lo intenta)', async () => {
        db.__fake
            .next([{ ...adminPrincipal }])
            .next([{ id_auditoria: 1 }]);

        await expect(
            usuarios.cambiarRolUsuario({
                idUsuario: adminPrincipal.id_usuario,
                nuevoRol: 'operadora',
                actor: adminSecundario,
            })
        ).rejects.toThrow(/administrador principal/i);
    });

    test('admin secundario puede promover operadora a admin', async () => {
        const op = { id_usuario: 7, rol: 'operadora', es_admin_principal: false, correo: 'o@x' };
        db.__fake
            .next([op])
            .next([{ id_usuario: 7, rol: 'admin', correo: 'o@x', firebase_uid: null }])
            .next([{ rol: 'admin' }])
            .next([{ id_auditoria: 2 }]);

        const r = await usuarios.cambiarRolUsuario({
            idUsuario: 7, nuevoRol: 'admin', actor: adminSecundario,
        });
        expect(r.rol).toBe('admin');
    });

    test('admin principal SÍ puede promover a admin', async () => {
        const op = { id_usuario: 7, rol: 'operadora', es_admin_principal: false, correo: 'o@x' };
        db.__fake
            .next([op])
            .next([{ id_usuario: 7, rol: 'admin', correo: 'o@x', firebase_uid: null }])
            .next([{ rol: 'admin' }])
            .next([{ id_auditoria: 3 }]);

        const r = await usuarios.cambiarRolUsuario({
            idUsuario: 7, nuevoRol: 'admin', actor: adminPrincipal,
        });
        expect(r.rol).toBe('admin');
    });
});

describe('setActivoUsuario - jerarquía', () => {
    test('NO se puede desactivar al admin principal', async () => {
        db.__fake.next([{ ...adminPrincipal }]);
        db.__fake.next([{ id_auditoria: 1 }]);

        await expect(
            usuarios.setActivoUsuario({
                idUsuario: 1, activo: false, actor: adminSecundario,
            })
        ).rejects.toThrow(/administrador principal/i);
    });

    test('NO se puede desactivar la propia cuenta', async () => {
        db.__fake.next([{ ...adminSecundario }]);
        db.__fake.next([{ id_auditoria: 1 }]);

        await expect(
            usuarios.setActivoUsuario({
                idUsuario: 2, activo: false, actor: adminSecundario,
            })
        ).rejects.toThrow(/propia cuenta/i);
    });
});
