import type { AIConfig, Message } from "./ai";

export interface KeySlot {
  label: string;
  provider: AIConfig["provider"];
  apiKey: string;
  model: string;
}

const SLOTS_KEY = "juridico_key_slots";
const ACTIVE_SLOT_KEY = "juridico_active_slot";
const PANEL_KEY = (id: number) => `juridico_ai_panel_${id}`;
const SYSTEM_KEY = "juridico_system_prompt";
const PLAYGROUND_KEY = "juridico_playground_saves";

const DEFAULT_SLOTS: KeySlot[] = [
  { label: "Chave 1", provider: "openai", apiKey: "", model: "gpt-4o" },
  { label: "Chave 2", provider: "groq", apiKey: "", model: "llama-3.3-70b-versatile" },
  { label: "Chave 3", provider: "anthropic", apiKey: "", model: "claude-3-5-sonnet-20241022" },
  { label: "Chave 4", provider: "openrouter", apiKey: "", model: "openai/gpt-4o" },
];

export function loadKeySlots(): KeySlot[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SLOTS;
  } catch { return DEFAULT_SLOTS; }
}

export function saveKeySlots(slots: KeySlot[]) {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
}

export function loadActiveSlot(): number {
  return parseInt(localStorage.getItem(ACTIVE_SLOT_KEY) ?? "0", 10);
}

export function saveActiveSlot(idx: number) {
  localStorage.setItem(ACTIVE_SLOT_KEY, String(idx));
}

export function loadMessages(panelId: number): Message[] {
  try {
    const raw = localStorage.getItem(PANEL_KEY(panelId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveMessages(panelId: number, messages: Message[]) {
  localStorage.setItem(PANEL_KEY(panelId), JSON.stringify(messages.slice(-300)));
}

export function clearMessages(panelId: number) {
  localStorage.removeItem(PANEL_KEY(panelId));
}

export function loadSystemPrompt(): string {
  return localStorage.getItem(SYSTEM_KEY) ?? "";
}

export function saveSystemPrompt(prompt: string) {
  localStorage.setItem(SYSTEM_KEY, prompt);
}

// ─── Playground Saves (IndexedDB — sem limite de tamanho) ─────────────────────

export interface PlaygroundSave {
  id: string;
  name: string;
  files: Record<string, string>;
  savedAt: number;
  // compat legado
  code?: string;
}

const IDB_NAME = "ia-juridico-idb";
const IDB_VERSION = 1;
const IDB_STORE = "playground_saves";

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPlaygroundSavesIDB(): Promise<PlaygroundSave[]> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).index("savedAt").getAll();
      req.onsuccess = () => {
        const all = (req.result as PlaygroundSave[]).reverse();
        // migra saves legados do localStorage se IndexedDB estiver vazio
        if (all.length === 0) {
          try {
            const raw = localStorage.getItem(PLAYGROUND_KEY);
            if (raw) {
              const legacy = JSON.parse(raw) as Array<{ id: string; name: string; code: string; savedAt: number }>;
              const migrated: PlaygroundSave[] = legacy.map((s) => ({
                id: s.id, name: s.name, savedAt: s.savedAt,
                files: (() => { try { return JSON.parse(s.code ?? "{}") as Record<string,string>; } catch { return { "index.html": s.code ?? "" }; } })(),
              }));
              savePlaygroundIDB(migrated).catch(() => {});
              resolve(migrated);
              return;
            }
          } catch { /* ignore */ }
        }
        resolve(all);
      };
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function savePlaygroundIDB(saves: PlaygroundSave[]): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      // Clear all and re-insert (simpler than diffing)
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        for (const save of saves) store.put(save);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      clearReq.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function deleteSaveIDB(id: string): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Legacy shims (mantém compatibilidade) ─────────────────────────────────────
export function loadPlaygroundSaves(): PlaygroundSave[] {
  try {
    const raw = localStorage.getItem(PLAYGROUND_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as Array<{ id: string; name: string; code: string; savedAt: number }>;
    return items.map((s) => ({
      id: s.id, name: s.name, savedAt: s.savedAt,
      files: (() => { try { return JSON.parse(s.code ?? "{}") as Record<string,string>; } catch { return { "index.html": s.code ?? "" }; } })(),
    }));
  } catch { return []; }
}

export function savePlayground(_saves: PlaygroundSave[]) {
  // no-op: agora usa IndexedDB — mantido para compatibilidade de import
}

// ── Config legacy ─────────────────────────────────────────────────────────────
export function loadConfig(): Partial<AIConfig> {
  const slots = loadKeySlots();
  const idx = loadActiveSlot();
  const slot = slots[idx];
  if (!slot?.apiKey) return {};
  return { provider: slot.provider, apiKey: slot.apiKey, model: slot.model };
}

export function saveConfig(cfg: Partial<AIConfig>) {
  const slots = loadKeySlots();
  const idx = loadActiveSlot();
  if (cfg.provider) slots[idx].provider = cfg.provider;
  if (cfg.apiKey !== undefined) slots[idx].apiKey = cfg.apiKey ?? "";
  if (cfg.model) slots[idx].model = cfg.model;
  saveKeySlots(slots);
}
