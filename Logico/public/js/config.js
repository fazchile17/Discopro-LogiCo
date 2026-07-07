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
        apiKey: 'AIzaSyATLiBvaQVf_Tab4nU41YPljzHmAwCBMb8',
        authDomain: 'logico-app.firebaseapp.com',
        projectId: 'logico-app',
        storageBucket: 'logico-app.firebasestorage.app',
        messagingSenderId: '25952999861',
        appId: '1:25952999861:web:d18b6fa515be0a7b86e1fc',
        measurementId: 'G-FJJELTK4M6',
    },
    apiBase: '/api',
};
