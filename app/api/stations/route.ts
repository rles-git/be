```ts
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
        s.id,
        s.name,
        s.short_name AS "shortName",
        s.address,
        s.lat,
        s.lng,
        s.plugs,
        s.available,
        s.power,
        s.price,
        s.kind,
        s.distance,
        s.minutes,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', c.id,
                'stall_number', c.stall_number,
                'connector_type', c.connector_type,
                'power_kw', c.power_kw,
                'status', c.status
              )
              ORDER BY c.stall_number
            )
            FROM chargers c
            WHERE c.station_id = s.id
          ),
          '[]'::json
        ) AS chargers,
        (
          SELECT COUNT(*)
          FROM chargers c
          WHERE c.station_id = s.id
            AND LOWER(TRIM(c.status)) = 'available'
        ) AS "availableStalls",
        (
          SELECT COUNT(*)
          FROM chargers c
          WHERE c.station_id = s.id
        ) AS "totalStalls"
      FROM stations s
      ORDER BY s.id ASC
    `;

    return NextResponse.json(stations);
  } catch (error) {
    console.error("Failed to fetch stations and chargers:", error);

    return NextResponse.json(
      { error: "Failed to fetch charging stations and stalls." },
      { status: 500 }
    );
  }
}
```
