
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
        "shortName" AS "shortName",
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
      ORDER BY name
    `;

    return NextResponse.json(stations);
  } catch (error) {
    console.error("Failed to fetch stations:", error);

    return NextResponse.json(
      { error: "Failed to fetch charging stations." },
      { status: 500 }
    );
  }
}
