
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

    // Temporarily fetch only Q009
    const comparison = await sql`
      SELECT
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
      "SINGLE QUERY CHECK:",
      JSON.stringify(comparison)
    );

    return NextResponse.json(comparison);
  } catch (error) {
    console.error("Failed to fetch Q009:", error);

    return NextResponse.json(
      { error: "Failed to fetch Q009." },
      { status: 500 }
    );
  }
}
