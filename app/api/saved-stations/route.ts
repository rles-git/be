
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
    const accountId = await getAuthenticatedAccountId();

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to save stations." },
        { status: 401 }
      );
    }

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
      (typeof rawStationId !== "string" &&
        typeof rawStationId !== "number") ||
      String(rawStationId).trim() === ""
    ) {
      return NextResponse.json(
        { error: "A valid station_id is required." },
        { status: 400 }
      );
    }

    const stationId = String(rawStationId).trim();

    if (!/^\d+$/.test(stationId)) {
      return NextResponse.json(
        { error: "station_id must be a valid numeric ID." },
        { status: 400 }
      );
    }

    const sql = getSql();

    const station = await sql`
      SELECT id
      FROM public.stations
      WHERE id = ${stationId}
      LIMIT 1
    `;

    if (station.length === 0) {
      return NextResponse.json(
        { error: "Station not found." },
        { status: 404 }
      );
    }

    await sql`
      INSERT INTO public.saved_stations (
        account_id,
        station_id
      )
      VALUES (
        ${accountId},
        ${stationId}
      )
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
