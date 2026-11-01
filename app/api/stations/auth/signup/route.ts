
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Get signup information
    const fullName =
      typeof body.fullName === "string"
        ? body.fullName.trim()
        : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    // --------------------------------
    // VALIDATION
    // --------------------------------

    if (fullName.length < 2 || fullName.length > 150) {
      return NextResponse.json(
        { error: "Enter your full name (2–150 characters)." },
        { status: 400 }
      );
    }

    if (
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (phone.length > 30) {
      return NextResponse.json(
        { error: "Phone number must be 30 characters or fewer." },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        {
          error:
            "Password must be between 8 and 128 characters.",
        },
        { status: 400 }
      );
    }

    const sql = getSql();

    // --------------------------------
    // CHECK EXISTING ACCOUNT
    // --------------------------------

    const existing = await sql`
      SELECT id
      FROM public.accounts
      WHERE lower(email) = ${email}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Please log in.",
        },
        { status: 409 }
      );
    }

    // --------------------------------
    // HASH PASSWORD
    // --------------------------------

    const passwordHash = await bcrypt.hash(password, 12);

    // --------------------------------
    // CREATE ACCOUNT AND WALLET
    // --------------------------------

    // Both records are created in one atomic SQL statement.
    // If wallet creation fails, account creation is rolled back.

    const rows = await sql`
      WITH new_account AS (
        INSERT INTO public.accounts (
          full_name,
          email,
          password_hash,
          phone,
          account_type
        )
        VALUES (
          ${fullName},
          ${email},
          ${passwordHash},
          ${phone || null},
          'driver'
        )
        RETURNING
          id,
          full_name,
          email,
          account_type,
          status
      ),

      new_wallet AS (
        INSERT INTO public.wallets (
          account_id
        )
        SELECT id
        FROM new_account
        RETURNING
          id,
          account_id,
          balance,
          currency,
          status
      )

      SELECT
        new_account.id,
        new_account.full_name,
        new_account.email,
        new_account.account_type,
        new_account.status,

        new_wallet.id AS wallet_id,
        new_wallet.balance AS wallet_balance,
        new_wallet.currency AS wallet_currency,
        new_wallet.status AS wallet_status

      FROM new_account

      INNER JOIN new_wallet
        ON new_wallet.account_id = new_account.id
    `;

    if (rows.length === 0) {
      throw new Error(
        "Account and wallet creation failed."
      );
    }

    const account = rows[0] as {
      id: string | number;
      full_name: string;
      email: string;
      account_type: string;
      status: string;
      wallet_id: string | number;
      wallet_balance: string | number;
      wallet_currency: string;
      wallet_status: string;
    };

    // --------------------------------
    // CREATE LOGIN SESSION
    // --------------------------------

    const token = await new SignJWT({
      email: account.email,
      accountType: account.account_type,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(account.id))
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getSecret());

    const cookieStore = await cookies();

    cookieStore.set("be_electric_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    // --------------------------------
    // SUCCESS RESPONSE
    // --------------------------------

    return NextResponse.json(
      {
        message:
          "Account and wallet created successfully.",

        user: {
          id: account.id,
          fullName: account.full_name,
          email: account.email,
          accountType: account.account_type,
        },

        wallet: {
          id: account.wallet_id,
          balance: Number(account.wallet_balance),
          currency: account.wallet_currency,
          status: account.wallet_status,
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("Signup error:", error);

    // Handle duplicate email constraint violations
    const dbError = error as {
      code?: string;
      message?: string;
    };

    if (dbError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Please log in.",
        },
        { status: 409 }
      );
    }

    const message =
      error instanceof Error &&
      error.message.includes("DATABASE_URL")
        ? "Database is not configured on the server."
        : "Could not create the account. Check your database tables and try again.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
