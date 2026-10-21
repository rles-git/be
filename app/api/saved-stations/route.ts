import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSql() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(url);
}

// Replace this with your verified server-side session lookup.
// Do not get the account ID from request JSON or query parameters.
async function getAuthenticatedAccountId(
  _request: NextRequest
): Promise<string | null> {
  // Connect your existing authentication/session logic here.
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const accountId = await getAuthenticatedAccountId(request);

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to view saved stations." },
        { status: 401 }
      );
    }

    const sql = getSql();

    const savedStations = await sql`
      SELECT station_id
      FROM saved_stations
      WHERE account_id = ${accountId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(
      { savedStations },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("GET saved stations error:", error);

    return NextResponse.json(
      { error: "Unable to load saved stations." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await getAuthenticatedAccountId(request);

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to save stations." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const stationId = String(body.station_id ?? "").trim();

    if (!/^\d+$/.test(stationId)) {
      return NextResponse.json(
        { error: "A valid station ID is required." },
        { status: 400 }
      );
    }

    const sql = getSql();

    const result = await sql`
      INSERT INTO saved_stations (account_id, station_id)
      SELECT ${accountId}, s.id
      FROM stations s
      WHERE s.id = ${stationId}
      ON CONFLICT (account_id, station_id) DO NOTHING
      RETURNING station_id
    `;

    if (result.length === 0) {
      const existing = await sql`
        SELECT id
        FROM stations
        WHERE id = ${stationId}
        LIMIT 1
      `;

      if (existing.length === 0) {
        return NextResponse.json(
          { error: "Station not found." },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { success: true, station_id: stationId },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST saved station error:", error);

    return NextResponse.json(
      { error: "Unable to save station." },
      { status: 500 }
    );
  }
}
