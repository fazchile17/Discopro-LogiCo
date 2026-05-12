/**
 * LogiCo - Configuración del frontend.
 *
 * NOTA SEGURIDAD: estos valores son públicos por diseño (cliente web).
 * La seguridad real se aplica en:
 *   - Firebase Auth (verifyIdToken en Functions)
 *   - Storage Rules + Firestore Rules
 *   - PostgreSQL (constraints, FK, triggers)
 */
window.LOGICO_CONFIG = {
    firebase: {
        apiKey: 'AIzaSyDoahWc13pyo240AS4mimJeNgm5T13CHIc',
        authDomain: 'logico-20f73.firebaseapp.com',
        projectId: 'logico-20f73',
        storageBucket: 'logico-20f73.firebasestorage.app',
        messagingSenderId: '138470559938',
        appId: '1:138470559938:web:63dd55abe44346277aab5b',
        measurementId: 'G-JTFDW5DZ4P',
    },
    apiBase: '/api',
};
