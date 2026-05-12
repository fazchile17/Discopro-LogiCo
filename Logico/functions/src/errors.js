/**
 * Errores tipados para devolver respuestas HTTP coherentes.
 */
class HttpError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

class ValidationError extends HttpError {
    constructor(message, details) { super(400, message, details); }
}
class NotFoundError extends HttpError {
    constructor(message = 'Recurso no encontrado') { super(404, message); }
}
class ConflictError extends HttpError {
    constructor(message, details) { super(409, message, details); }
}
class BusinessRuleError extends HttpError {
    constructor(message, details) { super(422, message, details); }
}

/**
 * Manejador global de errores Express.
 */
function errorHandler(err, _req, res, _next) {
    if (err instanceof HttpError) {
        return res.status(err.status).json({
            error: err.message,
            details: err.details,
        });
    }
    // Errores de PostgreSQL → mapear a 409/422 más descriptivos
    if (err.code) {
        if (err.code === '23505') {
            return res.status(409).json({
                error: 'Violación de unicidad (registro duplicado).',
                details: err.detail,
            });
        }
        if (err.code === '23503') {
            return res.status(409).json({
                error: 'Violación de integridad referencial.',
                details: err.detail,
            });
        }
        if (err.code === '23514') {
            return res.status(422).json({
                error: 'Violación de restricción CHECK.',
                details: err.detail,
            });
        }
        if (err.code === 'P0001') {
            // RAISE EXCEPTION desde plpgsql → regla de negocio
            return res.status(422).json({ error: err.message });
        }
    }
    console.error('[unhandled]', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
}

module.exports = {
    HttpError,
    ValidationError,
    NotFoundError,
    ConflictError,
    BusinessRuleError,
    errorHandler,
};
