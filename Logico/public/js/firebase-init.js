/**
 * Inicialización de Firebase (Auth + Storage + Analytics + helpers).
 * Importa los módulos via CDN para no requerir bundler.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';
import { getAnalytics, isSupported as analyticsSupported }
    from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js';
import { observeTables, enhanceTables } from './tables.js';

const app = initializeApp(window.LOGICO_CONFIG.firebase);
const auth = getAuth(app);
const storage = getStorage(app);

// Analytics solo en producción y si el navegador lo soporta
analyticsSupported().then((ok) => {
    if (ok && location.hostname !== 'localhost') {
        try { getAnalytics(app); } catch (_) { /* noop */ }
    }
});

observeTables();

export {
    app,
    auth,
    storage,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    enhanceTables,
};

/**
 * Devuelve un fetch autenticado contra la API LogiCo.
 * Inyecta el ID Token del usuario actual en el header Authorization.
 */
export async function apiFetch(path, options = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error('No autenticado');
    const token = await user.getIdToken();

    // Cache-buster: agregamos un timestamp único a CADA GET para forzar
    // que el navegador, el CDN y cualquier proxy intermedio traten la
    // URL como nueva. Combinado con cache: 'no-store' y Cache-Control
    // del backend, garantiza datos siempre frescos tras mutaciones.
    const method = (options.method || 'GET').toUpperCase();
    let finalPath = path;
    if (method === 'GET') {
        const sep = path.includes('?') ? '&' : '?';
        finalPath = `${path}${sep}_=${Date.now()}`;
    }

    const res = await fetch(window.LOGICO_CONFIG.apiBase + finalPath, {
        ...options,
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        let body;
        try { body = await res.json(); } catch (_) { body = { error: res.statusText }; }
        const err = new Error(body.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.details = body.details;
        throw err;
    }
    if (res.status === 204) return null;
    return res.json();
}

/**
 * Sube una foto de evidencia (entrega o incidencia) a Firebase Storage
 * y devuelve la URL pública firmada para guardarla en PostgreSQL.
 */
export async function uploadEvidencia(file, { pedidoId, kind = 'evidencia' }) {
    if (!auth.currentUser) throw new Error('No autenticado');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `evidencias/${pedidoId}/${kind}/${Date.now()}_${auth.currentUser.uid}.${ext}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file, {
        contentType: file.type || 'image/jpeg',
        customMetadata: {
            uploadedBy: auth.currentUser.uid,
            pedidoId: String(pedidoId),
            kind,
        },
    });
    return { path, url: await getDownloadURL(r) };
}

/**
 * Redirige a login si no hay sesión iniciada.
 * Si hay sesión, devuelve el perfil del backend (rol, nombre, etc.).
 *
 * Si /me falla, NO desloguea silenciosamente: muestra el motivo en pantalla
 * y solo redirige al login si el problema es realmente de autenticación.
 */
export function requireSession() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = '/index.html';
                return;
            }
            try {
                // Refrescar token tras cambios de rol hechos por un admin.
                await user.getIdToken(true);
                const me = await apiFetch('/me');
                resolve(me);
            } catch (e) {
                console.error('[requireSession] /me falló:', e);

                const detailsStr = typeof e.details === 'string'
                    ? e.details
                    : JSON.stringify(e.details || {}, null, 2);
                const motivo = `HTTP ${e.status || '???'}\nerror: ${e.message}` +
                               (detailsStr && detailsStr !== '{}'
                                   ? `\ndetails: ${detailsStr}` : '');

                document.body.innerHTML = `
                    <div style="font-family:system-ui;padding:32px;max-width:720px;margin:auto">
                      <h2 style="color:#dc2626">No se pudo cargar tu sesión</h2>
                      <p>El login en Firebase Auth funcionó, pero el backend rechazó <code>/api/me</code>.</p>
                      <pre style="background:#f1f5f9;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:13px">${motivo}</pre>
                      <p><strong>Causas según el status:</strong></p>
                      <ul>
                        <li><strong>401</strong>: token rechazado por <code>verifyIdToken</code>. Mira el campo <code>code</code> arriba.
                            Si dice <code>auth/argument-error</code> o algo de <code>aud</code>/<code>project_id</code>,
                            el token vino de otro proyecto: prueba en <em>incógnito</em>.</li>
                        <li><strong>403</strong>: tu correo NO está en la tabla <code>usuarios</code>. Corre los seeds o haz INSERT manual.</li>
                        <li><strong>500</strong>: Functions no logra conectar a Cloud SQL — revisa el <code>.env</code>.</li>
                        <li><strong>404</strong> / sin conexión: Functions aún no desplegado.</li>
                      </ul>
                      <button id="btn-retry" style="padding:10px 16px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;cursor:pointer">Reintentar</button>
                      <button id="btn-logout" style="margin-left:8px;padding:10px 16px;background:transparent;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer">Cerrar sesión</button>
                    </div>`;
                document.getElementById('btn-retry').onclick = () => location.reload();
                document.getElementById('btn-logout').onclick = async () => {
                    await signOut(auth);
                    location.href = '/index.html';
                };
            }
        });
    });
}

/* ---------- UI helpers ---------- */
export function toast(msg, kind = '') {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show ' + kind;
    setTimeout(() => { el.className = kind; }, 3500);
}

export function fmtDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    return d.toLocaleString('es-SV', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

export function badgeEstado(estado) {
    return `<span class="badge ${estado}">${(estado || '').replace('_', ' ')}</span>`;
}

/**
 * Sanitizador básico de HTML (defensa XSS al inyectar texto del usuario).
 * Las APIs ya devuelven datos escapados a nivel BD, pero al renderizar
 * en innerHTML usamos esto como defensa adicional.
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
