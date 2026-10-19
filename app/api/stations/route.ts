
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
    const fingerprint = await sql`
  SELECT
    current_database() AS database_name,
    current_schema() AS schema_name,
    current_setting('server_version') AS server_version
`;

const target = await sql`
  SELECT id, name, lat, lng
  FROM stations
  WHERE name = 'Bahay ni Jampol'
`;

console.log("DATABASE FINGERPRINT:", fingerprint);
console.log("TARGET STATION:", target);
    const diagnostic = await sql`
        SELECT
          current_database() AS database_name,
          current_schema() AS schema_name,
          COUNT(*)::int AS station_count
        FROM stations
      `;
      
      console.log("Database diagnostic:", diagnostic);
    
      const result = await sql`
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
          minutes,
          COUNT(*) OVER()::int AS total_count
        FROM stations
        ORDER BY id ASC
      `;

    
      console.log("Rows returned:", result.length);
      console.log("Total stations:", result[0]?.total_count);
      console.log(
        "Station IDs:",
        result.map((station) => station.id)
      );
      
      const stations = result.map(({ total_count, ...station }) => station);
      console.log(
  "Q010 FROM FULL QUERY:",
  JSON.stringify(
    stations.filter((station) => station.id === "Q010")
  )
);
      return NextResponse.json(stations);
    
console.log("Stations returned:", stations.length);
    return NextResponse.json(stations);
  } catch (error) {
    console.error("Failed to fetch stations:", error);

    return NextResponse.json(
      { error: "Failed to fetch charging stations." },
      { status: 500 }
    );
  }
}
