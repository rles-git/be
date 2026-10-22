
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getAuthenticatedAccount } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const auth = await getAuthenticatedAccount();
    if (auth.response) return auth.response;

    const { id } = await context.params;
    const sessionId = Number(id);

    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json(
        { error: "Invalid session ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const action = String(body.action ?? "update");
    const energy = Number(body.energy_kwh);

    if (
      !Number.isFinite(energy) ||
      energy < 0 ||
      energy > 1_000_000
    ) {
      return NextResponse.json(
        { error: "Invalid energy_kwh value." },
        { status: 400 }
      );
    }

    if (!["update", "stop"].includes(action)) {
      return NextResponse.json(
        { error: "action must be update or stop." },
        { status: 400 }
      );
    }

    const sql = getSql();

    const rows =
      action === "stop"
        ? await sql`
            UPDATE public.charging_sessions
            SET
              energy_kwh = ${energy},
              status = 'completed',
              ended_at = NOW()
            WHERE id = ${sessionId}
              AND account_id = ${auth.accountId}
              AND status = 'active'
            RETURNING
              id, connector_id, account_id,
              status, started_at, ended_at, energy_kwh
          `
        : await sql`
            UPDATE public.charging_sessions
            SET energy_kwh = ${energy}
            WHERE id = ${sessionId}
              AND account_id = ${auth.accountId}
              AND status = 'active'
            RETURNING
              id, connector_id, account_id,
              status, started_at, ended_at, energy_kwh
          `;

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Active session not found, or you do not own this session.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ session: rows[0] });
  } catch (error) {
    console.error("Update charging session error:", error);
    return NextResponse.json(
      { error: "Could not update the charging session." },
      { status: 500 }
    );
  }
}
