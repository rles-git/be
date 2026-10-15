
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }

    const sql = neon(process.env.DATABASE_URL);

    const stations = await sql`
      SELECT
        id,
        name,
        address,
        area,
        latitude,
        longitude,
        status,
        power_kw,
        connector_type,
        operator
      FROM stations
      ORDER BY name ASC
    `;

    return NextResponse.json(stations);
  } catch (error) {
    console.error("Failed to fetch stations:", error);

    return NextResponse.json(
      { error: "Unable to load charging stations" },
      { status: 500 }
    );
  }
}
