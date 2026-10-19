
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

    // 1. Query Q009 directly
    const directQ009 = await sql`
      SELECT id, name, lat, lng, available, power
      FROM stations
      WHERE id = 'Q009'
    `;

    // 2. Fetch all stations
    
    const stations = await sql`
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

console.log("Q009 DIAGNOSTIC:", JSON.stringify(stations));

return NextResponse.json(stations);


    // 3. Find Q009 in the full results
    const fullQ009 = stations.find(
      (station) => station.id === "Q009"
    );

    // 4. Log both results for comparison
    console.log(
      "Q009 DIRECT QUERY:",
      JSON.stringify(directQ009)
    );

    console.log(
      "Q009 FULL QUERY:",
      JSON.stringify(fullQ009 ?? null)
    );

    console.log(
      "API RESPONSE CHECK:",
      JSON.stringify({
        count: stations.length,
        Q009: fullQ009
          ? {
              id: fullQ009.id,
              lat: fullQ009.lat,
              lng: fullQ009.lng,
              available: fullQ009.available,
              power: fullQ009.power,
            }
          : null,
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
