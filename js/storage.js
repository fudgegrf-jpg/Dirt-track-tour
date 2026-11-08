// Restricted/private or full browser storage must not prevent the game booting.
// Native storage remains authoritative unless a write failed; only then retain
// that key in memory until reload, with an explicit autosave warning in App.
const fallback=new Map(),pending=new Set();let failed=false;
export const storage={
 get failed(){return failed;},
 getItem(key){if(pending.has(key))return fallback.get(key)??null;try{const value=globalThis.localStorage.getItem(key);fallback.set(key,value);return value;}catch{failed=true;return fallback.get(key)??null;}},
 setItem(key,value){value=String(value);try{globalThis.localStorage.setItem(key,value);fallback.set(key,value);pending.delete(key);return true;}catch{failed=true;fallback.set(key,value);pending.add(key);return false;}},
 removeItem(key){try{globalThis.localStorage.removeItem(key);fallback.delete(key);pending.delete(key);return true;}catch{failed=true;fallback.delete(key);pending.add(key);return false;}}
};
