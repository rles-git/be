
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
const directQ009 = await sql`
  SELECT id, name, lat, lng, available, power
  FROM stations
  WHERE id = 'Q009'
`;

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

const fullQ009 = stations.find(
  (station) => station.id === "Q009"
);

console.log(
  "Q009 DIRECT QUERY:",
  JSON.stringify(d
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

    const target = stations.find(
      (station) => station.id === "Q009"
    );

    console.log(
      "API RESPONSE CHECK:",
      JSON.stringify({
        count: stations.length,
        Q010: target
          ? {
              id: target.id,
              lat: target.lat,
              lng: target.lng,
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
