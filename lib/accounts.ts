import { randomUUID } from "crypto"
import { Redis } from "@upstash/redis"

export interface StoredAccount {
  id: string
  name: string
  cookie: string
}

const REDIS_KEY = "mimo_accounts"

// Initialize Redis from environment variables
const redis = Redis.fromEnv()

let accountsPromise: Promise<StoredAccount[]> | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5_000 // 5 seconds

async function readAccounts(): Promise<StoredAccount[]> {
  const now = Date.now()
  if (accountsPromise && now - cacheTimestamp < CACHE_TTL) {
    return accountsPromise
  }

  accountsPromise = redis
    .get<StoredAccount[]>(REDIS_KEY)
    .then((data) => data || [])
    .catch((err) => {
      console.error("Failed to read accounts from Redis", err)
      return []
    })

  cacheTimestamp = now
  return accountsPromise
}

export async function writeAccounts(accounts: StoredAccount[]) {
  try {
    await redis.set(REDIS_KEY, accounts)
    // Instantly update local cache to ensure consistency
    accountsPromise = Promise.resolve(accounts)
    cacheTimestamp = Date.now()
  } catch (err) {
    console.error("Failed to write accounts to Redis", err)
  }
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
