import { randomUUID } from "crypto"

interface StoredAccount {
  id: string
  name: string
  cookie: string
}

const KV_KEY = "mimo:accounts"

// In-memory fallback for development or when KV is not configured
let memoryStore: StoredAccount[] | null = null

function isKVConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

async function getKVClient() {
  if (!isKVConfigured()) return null
  const { kv } = await import("@vercel/kv")
  return kv
}

async function readAccounts(): Promise<StoredAccount[]> {
  const kv = await getKVClient()
  
  if (kv) {
    // Use Vercel KV in production
    const data = await kv.get<StoredAccount[]>(KV_KEY)
    return data ?? []
  }
  
  // Fallback: file-based storage in development
  if (process.env.NODE_ENV === "development") {
    try {
      const { readFile, existsSync } = await import("fs")
      const { join } = await import("path")
      const DATA_DIR = join(process.cwd(), "data")
      const ACCOUNTS_FILE = join(DATA_DIR, "accounts.json")
      
      if (existsSync(ACCOUNTS_FILE)) {
        const data = await readFile(ACCOUNTS_FILE, "utf-8")
        return JSON.parse(data) as StoredAccount[]
      }
    } catch {
      // Ignore file errors
    }
  }
  
  // Final fallback: in-memory store
  return memoryStore ?? []
}

async function writeAccounts(accounts: StoredAccount[]): Promise<void> {
  const kv = await getKVClient()
  
  if (kv) {
    // Use Vercel KV in production
    await kv.set(KV_KEY, accounts)
    return
  }
  
  // Fallback: file-based storage in development
  if (process.env.NODE_ENV === "development") {
    try {
      const { writeFile, mkdirSync, existsSync } = await import("fs")
      const { join } = await import("path")
      const DATA_DIR = join(process.cwd(), "data")
      
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true })
      }
      
      const ACCOUNTS_FILE = join(DATA_DIR, "accounts.json")
      await writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2))
      return
    } catch {
      // Ignore file errors
    }
  }
  
  // Final fallback: in-memory store
  memoryStore = accounts
}

export async function getAccounts(): Promise<StoredAccount[]> {
  return readAccounts()
}

export async function getAccountById(
  id: string
): Promise<StoredAccount | undefined> {
  const accounts = await readAccounts()
  return accounts.find((a) => a.id === id)
}

export async function addAccount(
  name: string,
  cookie: string
): Promise<StoredAccount> {
  const accounts = await readAccounts()
  const account: StoredAccount = { id: randomUUID(), name, cookie }
  accounts.push(account)
  await writeAccounts(accounts)
  return account
}

export async function updateAccountCookie(
  id: string,
  newCookie: string
): Promise<boolean> {
  const accounts = await readAccounts()
  const account = accounts.find((a) => a.id === id)
  if (!account) return false
  account.cookie = newCookie
  await writeAccounts(accounts)
  return true
}

export async function deleteAccount(id: string): Promise<boolean> {
  const accounts = await readAccounts()
  const index = accounts.findIndex((a) => a.id === id)
  if (index === -1) return false
  accounts.splice(index, 1)
  await writeAccounts(accounts)
  return true
}

export async function deleteAllAccounts(): Promise<void> {
  await writeAccounts([])
}

/**
 * Extract a specific cookie value from the stored cookie string.
 * Cookie format: "key1=value1; key2=value2; ..."
 */
export function extractCookieValue(
  cookie: string,
  name: string
): string | undefined {
  const pairs = cookie.split(";")
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=")
    if (key.trim() === name) {
      let value = rest.join("=").trim()
      // Strip surrounding double quotes (common in cookie values)
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      }
      return value
    }
  }
  return undefined
}
