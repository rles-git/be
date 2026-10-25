
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getAuthenticatedAccount } from "./auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
}



export async function GET() {
  try {
    const auth = await getAuthenticatedAccount();
    if (auth.response) return auth.response;

    const sql = getSql();

    const sessions = await sql`
      SELECT
        s.id,
        s.connector_id,
        s.external_session_id,
        s.status,
        s.started_at,
        s.ended_at,
        s.energy_kwh,
        s.created_at,
        c.charger_id,
        c.connector_number,
        c.connector_type,
        c.max_power_kw,
        c.status AS connector_status
      FROM public.charging_sessions s
      LEFT JOIN public.connectors c
        ON c.id = s.connector_id
      WHERE s.account_id = ${auth.accountId}
      ORDER BY
        CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
        s.created_at DESC
      LIMIT 25
    `;

    const activeSession =
      sessions.find(
        (session) =>
          String(session.status).toLowerCase() === "active"
      ) ?? null;

    return NextResponse.json(
      {
        sessions,
        activeSession,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Load charging sessions error:", error);

    return NextResponse.json(
      { error: "Could not load charging sessions." },
      { status: 500 }
    );
  }
}



export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedAccount();
    if (auth.response) return auth.response;

    const body = await request.json();
    const connectorId = String(body.connector_id ?? "").trim();
    const externalSessionId = String(
      body.external_session_id ?? ""
    ).trim();

    if (!connectorId || !externalSessionId) {
      return NextResponse.json(
        { error: "connector_id and external_session_id are required." },
        { status: 400 }
      );
    }

    if (connectorId.length > 40 || externalSessionId.length > 100) {
      return NextResponse.json(
        { error: "The supplied IDs are too long." },
        { status: 400 }
      );
    }

    const sql = getSql();

    const rows = await sql`
      INSERT INTO public.charging_sessions (
        connector_id,
        external_session_id,
        account_id,
        status,
        started_at,
        energy_kwh
      )
      SELECT
        c.id,
        ${externalSessionId},
        a.id,
        'active',
        NOW(),
        0
      FROM public.connectors c
      JOIN public.accounts a
        ON a.id::text = ${auth.accountId}
      WHERE c.id = ${connectorId}
        AND NOT EXISTS (
          SELECT 1
          FROM public.charging_sessions s
          WHERE s.connector_id = c.id
            AND s.status IN ('pending', 'active')
        ) 
        ON CONFLICT (connector_id)
        WHERE status IN ('pending', 'active')
        DO NOTHING
        RETURNING
          id,
          connector_id,
          external_session_id,
          account_id,
          status,
          started_at,
          energy_kwh
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Connector not found or already has an active session.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ session: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Start charging session error:", error);
    return NextResponse.json(
      { error: "Could not start the charging session." },
      { status: 500 }
    );
  }
}
