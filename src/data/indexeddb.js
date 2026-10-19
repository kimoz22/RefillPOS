import { defaultState, normalizeState } from "./default-state.js";

const STORE_KEY = "clearspring-pos-v1";
const DATABASE_NAME = "clearspring-pos";
const DATABASE_VERSION = 3;
const DATABASE_STORES = ["workspace", "products", "customers", "sales", "deliveries", "supplierDeliveries", "expenses", "movements", "auditLogs", "bottleLedger", "bottleInventory"];

export let state = defaultState();
let database;
let saveQueue = Promise.resolve();
let notifyError = () => {};

export function setErrorNotifier(notifier) { notifyError = notifier; }
export function replaceState(nextState) { state = nextState; }

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("This browser does not support IndexedDB.")); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result;
      DATABASE_STORES.forEach(store => {
        if (db.objectStoreNames.contains(store)) return;
        if (store === "products" || store === "customers" || store === "sales" || store === "deliveries" || store === "supplierDeliveries" || store === "expenses") db.createObjectStore(store, { keyPath: "id" });
        else if (store === "workspace" || store === "bottleInventory") db.createObjectStore(store, { keyPath: "key" });
        else db.createObjectStore(store, { autoIncrement: true });
      });
      if (event.oldVersion < 3 && db.objectStoreNames.contains("deliveries")) {
        const upgradeTransaction = request.transaction;
        const deliveries = upgradeTransaction.objectStore("deliveries");
        const cursorRequest = deliveries.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (cursor.value.supplier && !cursor.value.customerId) {
            upgradeTransaction.objectStore("supplierDeliveries").put(cursor.value);
            cursor.delete();
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the POS database."));
    request.onblocked = () => reject(new Error("The POS database is blocked by another open app tab. Close other tabs and reload."));
  });
}
function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("The database transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("The database transaction was aborted."));
  });
}
function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not read POS database data."));
  });
}
async function readDatabase(db) {
  const transaction = db.transaction(DATABASE_STORES, "readonly");
  const done = transactionComplete(transaction);
  const requests = DATABASE_STORES.map(store => requestValue(transaction.objectStore(store).getAll()));
  const [workspaceRows, products, customers, sales, deliveries, supplierDeliveries, expenses, movements, auditLogs, bottleLedger, bottleInventoryRows] = await Promise.all(requests);
  await done;
  const workspace = workspaceRows.find(row => row.key === "current");
  if (!workspace) return null;
  return normalizeState({
    ...workspace.data,
    products, customers, sales, deliveries, supplierDeliveries, expenses, movements, auditLogs, bottleLedger,
    bottleInventory: bottleInventoryRows.find(row => row.key === "current")?.data
  });
}
function writeDatabase(db, data) {
  ["products", "customers", "sales", "deliveries", "supplierDeliveries", "expenses"].forEach(store => {
    const ids = new Set();
    data[store].forEach(record => {
      if (!record || (typeof record.id !== "string" && typeof record.id !== "number") || !String(record.id).trim() || ids.has(record.id)) {
        throw new Error(`Workspace ${store} must contain records with unique IDs.`);
      }
      ids.add(record.id);
    });
  });
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DATABASE_STORES, "readwrite");
    transaction.onerror = () => reject(transaction.error || new Error("Could not save workspace data."));
    transaction.onabort = () => reject(transaction.error || new Error("Saving workspace data was aborted."));
    transaction.oncomplete = resolve;
    DATABASE_STORES.forEach(store => transaction.objectStore(store).clear());
    transaction.objectStore("workspace").put({
      key: "current",
      data: {
        business: data.business, settings: data.settings,
        nextSale: data.nextSale, nextDelivery: data.nextDelivery, nextExpense: data.nextExpense
      }
    });
    transaction.objectStore("bottleInventory").put({ key: "current", data: data.bottleInventory });
    ["products", "customers", "sales", "deliveries", "supplierDeliveries", "expenses", "movements", "auditLogs", "bottleLedger"].forEach(store => {
      const objectStore = transaction.objectStore(store);
      data[store].forEach(record => objectStore.add(record));
    });
  });
}
export async function initializeDatabase() {
  database = await openDatabase();
  let loaded = await readDatabase(database);
  let migrated = false;
  if (!loaded) {
    const legacy = localStorage.getItem(STORE_KEY);
    loaded = legacy ? normalizeState(JSON.parse(legacy)) : defaultState();
    migrated = Boolean(legacy);
    await writeDatabase(database, loaded);
  }
  state = loaded;
  if (migrated) localStorage.removeItem(STORE_KEY);
}
export function persist() {
  const snapshot = JSON.parse(JSON.stringify(state));
  const write = saveQueue.catch(() => {}).then(() => writeDatabase(database, snapshot));
  saveQueue = write;
  return write.catch(error => {
    console.error("Could not save workspace data.", error);
    notifyError("Unable to save changes to the local database. Check browser storage and try again.");
    return false;
  });
}
