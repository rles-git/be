
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    throw new Error(
      "AUTH_SECRET must be at least 32 characters long."
    );
  }

  return new TextEncoder().encode(secret);
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("be_electric_session")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "You are not signed in." },
        { status: 401 }
      );
    }

    let subject: string;

    try {
      const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ["HS256"],
      });

      if (!payload.sub) {
        return NextResponse.json(
          { error: "Invalid session. Please sign in again." },
          { status: 401 }
        );
      }

      subject = payload.sub;
    } catch {
      const response = NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );

      response.cookies.set("be_electric_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    const sql = getSql();

    const rows = await sql`
      SELECT
        id,
        full_name,
        email,
        account_type,
        status
      FROM public.accounts
      WHERE id::text = ${subject}
      LIMIT 1
    `;

    const account = rows[0] as
      | {
          id: string | number;
          full_name: string | null;
          email: string;
          account_type: string | null;
          status: string | null;
        }
      | undefined;

    if (!account) {
      const response = NextResponse.json(
        { error: "Account not found. Please sign in again." },
        { status: 404 }
      );

      response.cookies.set("be_electric_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    if (
      ["disabled", "suspended", "inactive", "blocked"].includes(
        String(account.status ?? "").toLowerCase()
      )
    ) {
      const response = NextResponse.json(
        { error: "This account is currently unavailable." },
        { status: 403 }
      );

      response.cookies.set("be_electric_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    return NextResponse.json(
      {
        user: {
          id: account.id,
          fullName: account.full_name ?? "",
          email: account.email,
          accountType: account.account_type ?? "",
          status: account.status ?? "",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Get profile error:", error);

    const message =
      error instanceof Error &&
      error.message.includes("DATABASE_URL")
        ? "Database is not configured on the server."
        : error instanceof Error &&
            error.message.includes("AUTH_SECRET")
          ? "Authentication is not configured correctly."
          : "Could not load your profile. Please try again.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
