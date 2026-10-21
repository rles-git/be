
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export function getSql() {
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

export async function getAuthenticatedAccountId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("be_electric_session")?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (!payload.sub) {
      return null;
    }

    const sql = getSql();

    const rows = await sql`
      SELECT id, status
      FROM public.accounts
      WHERE id::text = ${payload.sub}
      LIMIT 1
    `;

    const account = rows[0] as
      | { id: string | number; status: string | null }
      | undefined;

    if (!account) {
      return null;
    }

    if (
      ["disabled", "suspended", "inactive", "blocked"].includes(
        String(account.status ?? "").toLowerCase()
      )
    ) {
      return null;
    }

    return String(account.id);
  } catch (error) {
    console.error("Authentication check failed:", error);
    return null;
  }
}
