
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

export const runtime = "nodejs";

// Database connection
function getSql() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(url);
}

// JWT secret
function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a random string of at least 32 characters."
    );
  }

  return new TextEncoder().encode(secret);
}

export async function GET() {
  try {
    // --------------------------------
    // 1. GET AUTHENTICATED USER
    // --------------------------------

    const cookieStore = await cookies();

    const token = cookieStore.get("be_electric_session")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "You must log in to access your wallet." },
        { status: 401 }
      );
    }

    // --------------------------------
    // 2. VERIFY JWT
    // --------------------------------

    let accountId: string;

    try {
      const { payload } = await jwtVerify(token, getSecret());

      if (!payload.sub) {
        return NextResponse.json(
          { error: "Invalid authentication session." },
          { status: 401 }
        );
      }

      accountId = payload.sub;
    } catch {
      return NextResponse.json(
        { error: "Your session has expired. Please log in again." },
        { status: 401 }
      );
    }

    // --------------------------------
    // 3. GET USER WALLET FROM NEON
    // --------------------------------

    const sql = getSql();

    const rows = await sql`
      SELECT
        id,
        account_id,
        balance,
        currency,
        status,
        created_at,
        updated_at
      FROM public.wallets
      WHERE account_id = ${accountId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Wallet not found for this account." },
        { status: 404 }
      );
    }

    const wallet = rows[0];

    // --------------------------------
    // 4. CHECK WALLET STATUS
    // --------------------------------

    if (wallet.status !== "active") {
      return NextResponse.json(
        {
          error: "Your wallet is not active.",
          walletStatus: wallet.status,
        },
        { status: 403 }
      );
    }

    // --------------------------------
    // 5. RETURN WALLET INFORMATION
    // --------------------------------

    return NextResponse.json(
      {
        wallet: {
          id: wallet.id,
          accountId: wallet.account_id,
          balance: String(wallet.balance),
          currency: wallet.currency,
          status: wallet.status,
          createdAt: wallet.created_at,
          updatedAt: wallet.updated_at,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );

  } catch (error) {
    console.error("Get wallet error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve your wallet." },
      { status: 500 }
    );
  }
}
