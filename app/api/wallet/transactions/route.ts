
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function getSql() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(url);
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }

  return new TextEncoder().encode(secret);
}

export async function GET(request: NextRequest) {
  try {
    // Verify the logged-in user
    const cookieStore = await cookies();
    const token = cookieStore.get("be_electric_session")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(token, getSecret());
    const accountId = payload.sub;

    if (!accountId) {
      return NextResponse.json(
        { error: "Invalid user session." },
        { status: 401 }
      );
    }

    // Pagination
    const { searchParams } = new URL(request.url);

    const requestedLimit = Number(searchParams.get("limit") || 20);
    const requestedOffset = Number(searchParams.get("offset") || 0);

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50)
      : 20;

    const offset = Number.isFinite(requestedOffset)
      ? Math.max(Math.floor(requestedOffset), 0)
      : 0;

    const sql = getSql();

    // Retrieve transactions belonging to this user's wallet
    const rows = await sql`
      SELECT
        wt.id,
        wt.transaction_type,
        wt.amount,
        wt.currency,
        wt.status,
        wt.description,
        wt.reference,
        wt.payment_method_id,
        wt.created_at
      FROM public.wallet_transactions wt
      INNER JOIN public.wallets w
        ON wt.wallet_id = w.id
      WHERE w.account_id = ${accountId}
      ORDER BY wt.created_at DESC, wt.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return NextResponse.json(
      {
        transactions: rows.map((transaction) => ({
          id: String(transaction.id),
          type: transaction.transaction_type,
          amount: String(transaction.amount),
          currency: transaction.currency,
          status: transaction.status,
          description: transaction.description,
          reference: transaction.reference,
          paymentMethodId: transaction.payment_method_id,
          createdAt: transaction.created_at,
        })),
        pagination: {
          limit,
          offset,
          returned: rows.length,
          hasMore: rows.length === limit,
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
    console.error("Wallet transaction history error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve wallet transactions." },
      { status: 500 }
    );
  }
}
