
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
}

// Start a simulated charging session.
export async function POST(request: Request) {
  try {
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

    // Only insert if the connector exists and has no active session.
    const rows = await sql`
      INSERT INTO public.charging_sessions (
        connector_id,
        external_session_id,
        status,
        started_at,
        energy_kwh
      )
      SELECT
        c.id,
        ${externalSessionId},
        'active',
        NOW(),
        0
      FROM public.connectors c
      WHERE c.id = ${connectorId}
        AND NOT EXISTS (
          SELECT 1
          FROM public.charging_sessions s
          WHERE s.connector_id = c.id
            AND s.status IN ('pending', 'active')
        )
      RETURNING
        id,
        connector_id,
        external_session_id,
        status,
        started_at,
        energy_kwh
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Connector not found or already has an active charging session.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { session: rows[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error("Start charging session error:", error);
    return NextResponse.json(
      { error: "Could not start the charging session." },
      { status: 500 }
    );
  }
}
