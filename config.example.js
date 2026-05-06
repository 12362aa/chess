// Configuration template - copy to config.js and add your actual keys
// This file should be committed to git (no real keys)

const CONFIG = {
    // Groq API Key - add your real key here in config.js
    get GROQ_KEY() {
        return (
            (typeof process !== 'undefined' && process.env?.GROQ_KEY) ||
            (typeof window !== 'undefined' && window.INJECTED_GROQ_KEY) ||
            'YOUR_GROQ_API_KEY_HERE' // Replace this in config.js
        );
    },
    
    // Firebase configuration
    get FIREBASE_CONFIG() {
        return {
            apiKey: "AIzaSyCVFjWtbHdXv7HG8IGyTH0Ogv_rZ4jWIVI",
            authDomain: "chess-85a75.firebaseapp.com",
            projectId: "chess-85a75",
            storageBucket: "chess-85a75.firebasestorage.app",
            messagingSenderId: "123456789",
            appId: "1:123456789:web:abcdef"
        };
    },
    
    // FCM VAPID Key
    get FCM_VAPID_KEY() {
        return (
            (typeof process !== 'undefined' && process.env?.FCM_VAPID_KEY) ||
            (typeof window !== 'undefined' && window.INJECTED_FCM_VAPID_KEY) ||
            'YOUR_FCM_VAPID_KEY_HERE' // Replace this in config.js
        );
    },
    
    // Groq model
    GROQ_MODEL: 'meta-llama/llama-4-scout-17b-16e-instruct'
};

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
