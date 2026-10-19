
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

    // Check the Q009 record directly
    const diagnostic = await sql`
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name,
        id,
        name,
        lat,
        lng,
        available,
        power
      FROM stations
      WHERE id = 'Q009'
    `;

    console.log(
      "Q009 DIAGNOSTIC:",
      JSON.stringify(diagnostic)
    );

    // Fetch all stations for the app
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

    console.log(
      "STATIONS API CHECK:",
      JSON.stringify({
        count: stations.length,
        Q009: stations.find(
          (station) => station.id === "Q009"
        ) ?? null,
      })
    );

    return NextResponse.json(stations);
  } catch (error) {
    console.error("Failed to fetch stations:", error);

    return NextResponse.json(
      { error: "Failed to fetch charging stations." },
      { status: 500 }
    );
  }
}
