
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

    // Check which database and schema the API is connected to.
    const diagnostic = await sql`
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name,
        current_setting('search_path') AS search_path
    `;

    // Explicitly read from the public stations table.
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
      FROM public.stations
      ORDER BY id ASC
    `;

    // Find all Q009 matches, allowing for accidental spaces.
    const q009 = stations.filter(
      (station) =>
        String(station.id).trim() === "Q009"
    );

    // Log diagnostics in Vercel's function logs.
    console.log(
      "DATABASE DIAGNOSTIC:",
      JSON.stringify(diagnostic)
    );

    console.log(
      "Q009 MATCHES:",
      JSON.stringify(q009)
    );

    console.log(
      "TOTAL STATIONS:",
      stations.length
    );

    // Temporary diagnostic response.
    return NextResponse.json(
      {
        diagnostic,
        totalStations: stations.length,
        q009,
        stations,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "Failed to fetch stations:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch charging stations.",
      },
      { status: 500 }
    );
  }
}
