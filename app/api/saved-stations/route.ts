import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccountId, getSql } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const accountId = await getAuthenticatedAccountId();

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
    const accountId = await getAuthenticatedAccountId();

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to save stations." },
        { status: 401 }
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
