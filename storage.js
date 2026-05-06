// IndexedDB Storage Manager - Better offline persistence
const Storage = {
    dbName: 'chess_offline_db',
    version: 1,
    db: null,
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores for different data types
                if (!db.objectStoreNames.contains('userConfig')) {
                    db.createObjectStore('userConfig', { keyPath: 'key' });
                }
                
                if (!db.objectStoreNames.contains('gameProgress')) {
                    db.createObjectStore('gameProgress', { keyPath: 'levelId' });
                }
                
                if (!db.objectStoreNames.contains('userProfile')) {
                    db.createObjectStore('userProfile', { keyPath: 'key' });
                }
                
                if (!db.objectStoreNames.contains('gameHistory')) {
                    db.createObjectStore('gameHistory', { keyPath: 'gameId', autoIncrement: true });
                }
            };
        });
    },
    
    async set(storeName, key, data) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ key, data, timestamp: Date.now() });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async get(storeName, key) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.data : null);
            };
            request.onerror = () => reject(request.error);
        });
    },
    
    async getAll(storeName) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const results = request.result;
                const data = {};
                results.forEach(item => {
                    if (item.key !== undefined) {
                        data[item.key] = item.data;
                    } else {
                        data[item.levelId] = item.data;
                    }
                });
                resolve(data);
            };
            request.onerror = () => reject(request.error);
        });
    },
    
    async remove(storeName, key) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async clear(storeName) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    // Migration helpers from localStorage
    async migrateFromLocalStorage() {
        try {
            // Migrate user config
            const oldConfig = localStorage.getItem('chess-cfg-v6');
            if (oldConfig) {
                const configData = JSON.parse(oldConfig);
                await this.set('userConfig', 'main', configData);
                console.log('Migrated user config to IndexedDB');
            }
            
            // Migrate username
            const oldUsername = localStorage.getItem('chess_username');
            if (oldUsername) {
                await this.set('userProfile', 'username', oldUsername);
                console.log('Migrated username to IndexedDB');
            }
            
            // Migrate profile image
            const oldImage = localStorage.getItem('chess_profile_image');
            if (oldImage) {
                await this.set('userProfile', 'profileImage', oldImage);
                console.log('Migrated profile image to IndexedDB');
            }
            
            // Keep localStorage as backup for now
            return true;
        } catch (error) {
            console.error('Migration failed:', error);
            return false;
        }
    },
    
    // Dual storage - save to both IndexedDB and localStorage for compatibility
    async saveDual(storeName, key, data, localStorageKey = null) {
        try {
            // Save to IndexedDB
            await this.set(storeName, key, data);
            
            // Also save to localStorage as backup
            if (localStorageKey) {
                if (typeof data === 'object') {
                    localStorage.setItem(localStorageKey, JSON.stringify(data));
                } else {
                    localStorage.setItem(localStorageKey, data);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Dual save failed:', error);
            return false;
        }
    },
    
    // Dual load - try IndexedDB first, fallback to localStorage
    async loadDual(storeName, key, localStorageKey = null) {
        try {
            // Try IndexedDB first
            let data = await this.get(storeName, key);
            
            // Fallback to localStorage if IndexedDB fails or is empty
            if (!data && localStorageKey) {
                const localStorageData = localStorage.getItem(localStorageKey);
                if (localStorageData) {
                    try {
                        data = JSON.parse(localStorageData);
                        // Migrate to IndexedDB for next time
                        await this.set(storeName, key, data);
                    } catch (e) {
                        data = localStorageData;
                    }
                }
            }
            
            return data;
        } catch (error) {
            console.error('Dual load failed:', error);
            return null;
        }
    }
};

// Auto-initialize
if (typeof window !== 'undefined') {
    window.Storage = Storage;
    
    // Initialize on page load
    window.addEventListener('DOMContentLoaded', async () => {
        try {
            await Storage.init();
            await Storage.migrateFromLocalStorage();
            console.log('IndexedDB storage initialized successfully');
        } catch (error) {
            console.error('IndexedDB initialization failed:', error);
        }
    });
} else if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
