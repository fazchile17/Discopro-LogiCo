/**
 * Renderiza la barra lateral con navegación según rol.
 * En móvil el menú queda oculto; se abre con el botón ☰.
 */
import { auth, signOut } from './firebase-init.js';

let mobileNav = null;

function initMobileSidebar() {
    const shell = document.querySelector('.shell');
    if (!shell || shell.dataset.mobileNavInit) return mobileNav;
    shell.dataset.mobileNavInit = '1';

    let toggle = shell.querySelector('.sidebar-toggle');
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sidebar-toggle';
        toggle.setAttribute('aria-label', 'Abrir menú');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '☰';
        shell.insertBefore(toggle, shell.firstChild);
    }

    let backdrop = shell.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        const main = shell.querySelector('main');
        shell.insertBefore(backdrop, main);
    }

    const open = () => {
        shell.classList.add('sidebar-open');
        toggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('sidebar-open-body');
    };
    const close = () => {
        shell.classList.remove('sidebar-open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('sidebar-open-body');
    };

    toggle.addEventListener('click', open);
    backdrop.addEventListener('click', close);

    mobileNav = { open, close };
    return mobileNav;
}

function bindMobileNavClose() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || sidebar.dataset.closeBound) return;
    sidebar.dataset.closeBound = '1';

    document.getElementById('btn-sidebar-close')?.addEventListener('click', () => {
        mobileNav?.close();
    });

    sidebar.querySelector('nav')?.addEventListener('click', (e) => {
        if (e.target.closest('a') && window.matchMedia('(max-width: 900px)').matches) {
            mobileNav?.close();
        }
    });
}

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
        links.push({ href: 'admin-motoristas.html', label: 'Motoristas' });
        links.push({ href: 'admin-motos.html', label: 'Motos' });
        links.push({ href: 'admin-farmacias.html', label: 'Farmacias' });
        links.push({ href: 'admin-usuarios.html', label: 'Usuarios' });
        links.push({ href: 'admin-auditoria.html', label: 'Auditoría' });
    }

    const adminBadge = me.es_admin_principal
        ? `<div style="font-size:11px;color:#fde68a;margin-top:4px">★ Admin principal</div>`
        : '';

    sidebar.innerHTML = `
        <button type="button" class="sidebar-close" id="btn-sidebar-close" aria-label="Ocultar menú">×</button>
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

    mobileNav = initMobileSidebar();
    bindMobileNavClose();
}
