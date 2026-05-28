import { NextRequest, NextResponse } from "next/server"
import { getAccountById, getAccounts } from "@/lib/accounts"

const MIMO_BASE = "https://platform.xiaomimimo.com/api/v1"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  let accountId = request.nextUrl.searchParams.get("accountId")
  let cookie: string | undefined

  if (accountId) {
    const account = await getAccountById(accountId)
    if (!account) {
      return NextResponse.json(
        { code: -1, message: "Account not found" },
        { status: 404 }
      )
    }
    cookie = account.cookie
  } else {
    // Fallback: use first account or env var
    const accounts = await getAccounts()
    if (accounts.length > 0) {
      accountId = accounts[0].id
      cookie = accounts[0].cookie
    } else {
      cookie = process.env.MIMO_COOKIE
    }
  }

  if (!cookie) {
    return NextResponse.json(
      { code: -1, message: "No account configured. Add an account first." },
      { status: 500 }
    )
  }

  const targetPath = path.join("/")
  const url = `${MIMO_BASE}/${targetPath}`

  try {
    let response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "Accept-Language": "en",
        "Content-Type": "application/json",
        Cookie: cookie,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "x-timezone": "Asia/Bangkok",
      },
    })

    let data = await response.json()

    // Handle Mimo 401 Unauthorized (token expired)
    if (data.code === 401 && accountId) {
      console.log(
        `[Proxy] 401 Unauthorized detected for account ${accountId}. Attempting silent refresh...`
      )

      try {
        const refreshUrl = new URL("/api/xiaomi/refresh", request.url).toString()
        const refreshRes = await fetch(refreshUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookie }),
        })

        const refreshData = await refreshRes.json()

        if (refreshData.status === "success" && refreshData.cookie) {
          console.log(`[Proxy] Silent refresh successful! Retrying request...`)

          // 1. Save new cookie to database
          const { updateAccountCookie } = await import("@/lib/accounts")
          await updateAccountCookie(accountId, refreshData.cookie)

          // 2. Retry the original request
          response = await fetch(url, {
            method: "GET",
            headers: {
              Accept: "*/*",
              "Accept-Language": "en",
              "Content-Type": "application/json",
              Cookie: refreshData.cookie,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
              "x-timezone": "Asia/Bangkok",
            },
          })

          data = await response.json()
        } else {
          console.error("[Proxy] Silent refresh failed:", refreshData.message)
        }
      } catch (err) {
        console.error("[Proxy] Silent refresh threw an error:", err)
      }
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { code: -1, message: "Failed to fetch from MiMo API" },
      { status: 502 }
    )
  }
}
