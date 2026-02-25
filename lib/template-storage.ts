export type StoredTemplate = {
  name: string
  content: ArrayBuffer
  updatedAt: number
}

const DB_NAME = "repgen-template-db"
const STORE_NAME = "templates"
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "name" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getAllStoredTemplates(): Promise<StoredTemplate[]> {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const items = (request.result as StoredTemplate[]) ?? []
      items.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(items)
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

export async function getStoredTemplate(name: string): Promise<StoredTemplate | null> {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(name)

    request.onsuccess = () => resolve((request.result as StoredTemplate | undefined) ?? null)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

export async function saveTemplates(files: File[]): Promise<number> {
  if (files.length === 0) return 0

  const items = await Promise.all(
    files.map(async (file) => {
      const content = await file.arrayBuffer()
      return {
        name: file.name,
        content,
        updatedAt: Date.now(),
      } satisfies StoredTemplate
    }),
  )

  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)

    try {
      items.forEach((item) => {
        store.put(item)
      })
    } catch (error) {
      reject(error)
      db.close()
      return
    }

    tx.oncomplete = () => {
      db.close()
      resolve(files.length)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function deleteStoredTemplate(name: string): Promise<void> {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(name)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}
