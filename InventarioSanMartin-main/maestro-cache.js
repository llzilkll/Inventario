/**
 * maestro-cache.js
 * Caching system using IndexedDB for maestro.json and maestro2k.json.
 * Resolves local relative URLs if running under HTTP/HTTPS web servers,
 * and falls back to GitHub raw files only if running locally via file:// protocol.
 */
(function() {
    const DB_NAME = 'MaestroCacheDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'json_cache';
    // 4 hours expiration time (4 * 60 * 60 * 1000)
    const DEFAULT_EXPIRE_MS = 4 * 60 * 60 * 1000;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
        });
    }

    function getCache(key) {
        return openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
        });
    }

    function setCache(key, data) {
        return openDB().then(db => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const record = {
                    key: key,
                    data: data,
                    timestamp: Date.now()
                };
                const request = store.put(record);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
        }).catch(err => console.error("Error setting IndexedDB cache:", err));
    }

    // Resolves file URL dynamically
    window.resolveMaestroUrl = function(fileName) {
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            return `./${fileName}`;
        }
        // Fallback for file:// protocol (local double-click)
        return `https://raw.githubusercontent.com/llzilkll/InventarioSanMartin/main/${fileName}`;
    };

    // Fetches URL using IndexedDB cache
    window.fetchWithCache = async function(url, cacheKey, expireMs = DEFAULT_EXPIRE_MS) {
        // Bypass cache for estados_data to ensure immediate changes are reflected
        if (cacheKey === 'estados_data') {
            expireMs = 0;
        }
        try {
            const cachedRecord = await getCache(cacheKey);
            const now = Date.now();
            if (cachedRecord && (now - cachedRecord.timestamp < expireMs)) {
                console.log(`[Cache] Loaded ${cacheKey} from IndexedDB (Fresh)`);
                return cachedRecord.data;
            }

            console.log(`[Cache] Fetching ${cacheKey} from network: ${url}`);
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Fetch failed: status ${res.status}`);
            }
            const data = await res.json();
            
            // Store cache asynchronously
            setCache(cacheKey, data);
            return data;
        } catch (error) {
            console.warn(`[Cache] Fetch/Cache failed for ${cacheKey}. Attempting fallback to expired cache:`, error);
            try {
                const cachedRecord = await getCache(cacheKey);
                if (cachedRecord) {
                    console.log(`[Cache] Fallback successful. Loaded expired ${cacheKey} from IndexedDB`);
                    return cachedRecord.data;
                }
            } catch (fallbackError) {
                console.error("[Cache] Fallback cache load failed:", fallbackError);
            }
            throw error;
        }
    };
})();
