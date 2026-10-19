
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return NextResponse.json(
        { error: "DATABASE_URL is not configured." },
        { status: 500 }
      );
    }

    const sql = neon(databaseUrl);

    const stations = await sql`
      SELECT
        id,
        name,
        short_name AS "shortName",
        address,
        lat,
        lng,
        plugs,
        available,
        power,
        price,
        kind,
        distance,
        minutes
      FROM stations
      ORDER BY id ASC
    `;

    const q009 = stations.find(
      (station) => station.id === "Q009"
    );

    console.log(
      "STATIONS API VERSION 2:",
      JSON.stringify({
        count: stations.length,
        Q009: q009 ?? null,
      })
    );

    return NextResponse.json(stations, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Failed to fetch stations:", error);

    return NextResponse.json(
      { error: "Failed to fetch charging stations." },
      { status: 500 }
    );
  }
}
