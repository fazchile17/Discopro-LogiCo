/**
 * Mock de la capa de DB para pruebas unitarias.
 * Permite simular respuestas de query() y rastrear las transacciones.
 *
 * IMPORTANTE: el mock es una sola instancia compartida entre tests
 * (jest cachea el módulo). Llama a `reset()` en `beforeEach` para
 * limpiar contadores, queries y respuestas pendientes.
 */
function createFakeDb() {
    let queries = [];
    let responses = [];
    let beginCount = 0;
    let commitCount = 0;
    let rollbackCount = 0;

    function next(rowsOrError) {
        responses.push(rowsOrError);
        return api;
    }

    function reset() {
        queries.length = 0;
        responses.length = 0;
        beginCount = 0;
        commitCount = 0;
        rollbackCount = 0;
    }

    const fakeClient = {
        async query(sql, params) {
            queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
            if (/^BEGIN/i.test(sql.trim())) { beginCount++; return { rows: [] }; }
            if (/^COMMIT/i.test(sql.trim())) { commitCount++; return { rows: [] }; }
            if (/^ROLLBACK/i.test(sql.trim())) { rollbackCount++; return { rows: [] }; }
            const r = responses.shift();
            if (r instanceof Error) throw r;
            return { rows: r ?? [] };
        },
        release() { /* noop */ },
    };

    const api = {
        next,
        reset,
        async query(sql, params) {
            return fakeClient.query(sql, params);
        },
        async withTransaction(work) {
            beginCount++;
            try {
                const r = await work(fakeClient);
                commitCount++;
                return r;
            } catch (e) {
                rollbackCount++;
                throw e;
            }
        },
        pool: { query: (sql, params) => fakeClient.query(sql, params) },
        get queries() { return queries; },
        get beginCount() { return beginCount; },
        get commitCount() { return commitCount; },
        get rollbackCount() { return rollbackCount; },
    };
    return api;
}

module.exports = { createFakeDb };
