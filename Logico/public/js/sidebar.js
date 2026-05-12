/**
 * Renderiza la barra lateral con navegación según rol.
 */
import { auth, signOut } from './firebase-init.js';

export function renderSidebar(activePath, me) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const links = [];
    if (me.rol === 'operadora' || me.rol === 'admin') {
        links.push({ href: 'dashboard.html', label: 'Dashboard' });
        links.push({ href: 'pedidos.html', label: 'Pedidos' });
        links.push({ href: 'crear-pedido.html', label: 'Crear pedido' });
    }
    if (me.rol === 'motorista') {
        links.push({ href: 'motorista.html', label: 'Mis rutas' });
    }
    if (me.rol === 'admin') {
        links.push({ href: 'admin-usuarios.html', label: 'Usuarios' });
        links.push({ href: 'admin-farmacias.html', label: 'Farmacias' });
        links.push({ href: 'admin-auditoria.html', label: 'Auditoría' });
    }

    const adminBadge = me.es_admin_principal
        ? `<div style="font-size:11px;color:#fde68a;margin-top:4px">★ Admin principal</div>`
        : '';

    sidebar.innerHTML = `
        <h1>LogiCo</h1>
        <div class="user-pill">
            <div><strong>${me.nombre} ${me.apellido}</strong></div>
            <div class="muted" style="color:rgba(255,255,255,0.6); font-size:12px">${me.correo}</div>
            <div><span class="role">${me.rol}</span></div>
            ${adminBadge}
        </div>
        <nav>
            ${links.map((l) => `
                <a href="/${l.href}" class="${activePath === l.href ? 'active' : ''}">${l.label}</a>
            `).join('')}
        </nav>
        <button class="logout" id="btn-logout">Cerrar sesión</button>
    `;

    document.getElementById('btn-logout').addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = '/index.html';
    });
}
