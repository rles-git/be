
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

const getSql = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
};

export async function getAuthenticatedAccount() {
  const cookieStore = await cookies();
  const token = cookieStore.get("be_electric_session")?.value;

  if (!token) {
    return {
      accountId: null,
      response: NextResponse.json(
        { error: "Please sign in before charging." },
        { status: 401 }
      ),
    };
  }

  let subject: string;

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("AUTH_SECRET is not configured correctly.");
    }

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] }
    );

    if (!payload.sub || !/^\d+$/.test(payload.sub)) {
      throw new Error("Invalid account subject.");
    }

    subject = payload.sub;
  } catch {
    const response = NextResponse.json(
      { error: "Your session is invalid or expired. Please sign in again." },
      { status: 401 }
    );

    response.cookies.set("be_electric_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return { accountId: null, response };
  }

  const sql = getSql();

  const rows = await sql`
    SELECT id, status
    FROM public.accounts
    WHERE id::text = ${subject}
    LIMIT 1
  `;

  const account = rows[0] as
    | { id: string | number; status: string | null }
    | undefined;

  if (!account) {
    return {
      accountId: null,
      response: NextResponse.json(
        { error: "Account not found. Please sign in again." },
        { status: 401 }
      ),
    };
  }

  if (
    ["disabled", "suspended", "inactive", "blocked"].includes(
      String(account.status ?? "").toLowerCase()
    )
  ) {
    return {
      accountId: null,
      response: NextResponse.json(
        { error: "This account is unavailable." },
        { status: 403 }
      ),
    };
  }

  return { accountId: String(account.id), response: null };
}
