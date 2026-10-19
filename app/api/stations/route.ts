
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

    const result = await sql`
      SELECT
        (SELECT name FROM stations WHERE id = 'Q009' LIMIT 1)
          AS direct_name,
        (SELECT lat FROM stations WHERE id = 'Q009' LIMIT 1)
          AS direct_lat,
        (SELECT lng FROM stations WHERE id = 'Q009' LIMIT 1)
          AS direct_lng,
        (
          SELECT name
          FROM stations
          ORDER BY id ASC
          LIMIT 1 OFFSET (
            SELECT COUNT(*)
            FROM stations
            WHERE id < 'Q009'
          )
        ) AS ordered_name
    `;

    console.log("Q009 SUBQUERY TEST:", JSON.stringify(result));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to test station queries:", error);

    return NextResponse.json(
      { error: "Failed to test station queries." },
      { status: 500 }
    );
  }
}
