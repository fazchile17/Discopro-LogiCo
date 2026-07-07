/**
 * Convierte tablas en layout móvil (filas tipo tarjeta) y envuelve scroll horizontal en desktop estrecho.
 */
export function enhanceTables(root = document) {
    root.querySelectorAll('table:not([data-enhanced])').forEach((table) => {
        table.dataset.enhanced = '1';

        if (!table.parentElement?.classList.contains('table-wrap')) {
            const wrap = document.createElement('div');
            wrap.className = 'table-wrap';
            table.parentNode.insertBefore(wrap, table);
            wrap.appendChild(table);
        }

        table.classList.add('table-responsive');
        applyRowLabels(table);
    });
}

function applyRowLabels(table) {
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!headers.length) return;

    table.querySelectorAll('tbody tr').forEach((row) => {
        [...row.children].forEach((cell, i) => {
            if (cell.tagName !== 'TD') return;
            const label = headers[i];
            if (label) cell.setAttribute('data-label', label);
            else cell.removeAttribute('data-label');
        });
    });
}

export function observeTables() {
    enhanceTables(document);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.tagName === 'TABLE') {
                    enhanceTables(node.parentElement || document);
                } else {
                    enhanceTables(node);
                }
            });
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
