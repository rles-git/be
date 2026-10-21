import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
}
function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

    const sql = getSql();
    const rows = await sql`
      SELECT id, full_name, email, password_hash, account_type, status
      FROM public.accounts WHERE lower(email) = ${email} LIMIT 1
    `;
    const account = rows[0] as { id: string | number; full_name: string; email: string; password_hash: string | null; account_type: string; status: string } | undefined;
    if (!account?.password_hash || !(await bcrypt.compare(password, account.password_hash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    if (["disabled", "suspended", "inactive", "blocked"].includes(String(account.status ?? "").toLowerCase())) {
      return NextResponse.json({ error: "This account is currently unavailable. Please contact support." }, { status: 403 });
    }

    const token = await new SignJWT({ email: account.email, accountType: account.account_type })
      .setProtectedHeader({ alg: "HS256" }).setSubject(String(account.id)).setIssuedAt().setExpirationTime("7d").sign(getSecret());
    const cookieStore = await cookies();
    cookieStore.set("be_electric_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return NextResponse.json({ user: { id: account.id, fullName: account.full_name, email: account.email, accountType: account.account_type } });
  } catch (error) {
    console.error("Login error:", error);
    const message = error instanceof Error && error.message.includes("DATABASE_URL") ? "Database is not configured on the server." : "Could not sign you in. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
