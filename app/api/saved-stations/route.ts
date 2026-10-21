
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedAccountId,
  getSql,
} from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
      FROM public.saved_stations
      WHERE account_id = ${accountId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(
      { savedStations },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
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
    // Authenticate the signed-in user.
    const accountId = await getAuthenticatedAccountId();

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to save stations." },
        { status: 401 }
      );
    }

    // Read the station ID sent by the frontend.
    let body: { station_id?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const rawStationId = body?.station_id;

    if (
      typeof rawStationId !== "string" ||
      !/^Q\d{3}$/i.test(rawStationId.trim())
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid station ID. Expected a format like Q001.",
        },
        { status: 400 }
      );
    }

    const stationId = rawStationId.trim().toUpperCase();
    const sql = getSql();

    // Find the station using its actual ID.
    const stations = await sql`
      SELECT id
      FROM public.stations
      WHERE id::text = ${stationId}
      LIMIT 1
    `;

    if (stations.length === 0) {
      return NextResponse.json(
        {
          error: `Station ${stationId} was not found in the database.`,
        },
        { status: 404 }
      );
    }

    // Insert the actual database ID, preserving its underlying type.
    await sql`
      INSERT INTO public.saved_stations (
        account_id,
        station_id
      )
      SELECT
        ${accountId},
        s.id
      FROM public.stations AS s
      WHERE s.id::text = ${stationId}
      ON CONFLICT (account_id, station_id) DO NOTHING
    `;

    return NextResponse.json(
      {
        success: true,
        station_id: stationId,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("POST saved station error:", error);

    return NextResponse.json(
      { error: "Unable to save station." },
      { status: 500 }
    );
  }
}
