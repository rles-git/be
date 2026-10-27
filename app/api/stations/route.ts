import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return NextResponse.json(
        { error: "DATABASE_URL is not configured." },
        { status: 500 }
      );
    }

    const sql = neon(databaseUrl);

    // Diagnostic: read Q001 directly from the stations table.
const diagnostic = await sql`
  SELECT
    current_database() AS database_name,
    current_schema() AS schema_name,
    id,
    name,
    short_name,
    address
  FROM public.stations
  WHERE id = 'Q001'
  LIMIT 1
`;

    // Fetch stations and their related chargers and connectors.
    const stations = await sql`
      SELECT
        s.id,
        s.name,
        s.short_name AS "shortName",
        s.address,
        s.lat,
        s.lng,
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
                'id', ch.id,
                'station_id', ch.station_id,
                'name', ch.name,
                'manufacturer', ch.manufacturer,
                'model', ch.model,
                'serial_number', ch.serial_number,
                'max_power_kw', ch.max_power_kw,
                'status', ch.status,
                'protocol', ch.protocol,
                'protocol_identity', ch.protocol_identity,
                'connectors', COALESCE(
                  (
                    SELECT json_agg(
                      json_build_object(
                        'id', co.id,
                        'charger_id', co.charger_id,
                        'connector_number', co.connector_number,
                        'connector_type', co.connector_type,
                        'max_power_kw', co.max_power_kw,
                        'status',
                        CASE
                          WHEN EXISTS (
                            SELECT 1
                            FROM public.charging_sessions cs
                            WHERE cs.connector_id = co.id::text
                              AND cs.status IN ('pending', 'active')
                          )
                          THEN 'In use'
                          ELSE co.status
                        END
                      )
                      ORDER BY co.connector_number ASC
                    )
                    FROM public.connectors co
                    WHERE co.charger_id = ch.id
                  ),
                  '[]'::json
                )
              )
              ORDER BY ch.id ASC
            )
            FROM public.chargers ch
            WHERE ch.station_id = s.id
          ),
          '[]'::json
        ) AS chargers
      FROM public.stations s
      ORDER BY s.id ASC
    `;

    console.log("Stations returned:", stations.length);

    // Diagnostic mode: compare the direct database value with
    // the Q001 record returned by the normal stations query.
    if (new URL(request.url).searchParams.get("debug") === "1") {
      const q001 = stations.find(
        (station) => String(station.id) === "Q001"
      );

      return NextResponse.json(
        {
          diagnostic: diagnostic[0],
          normalQueryQ001: q001 ?? null,
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    return NextResponse.json(stations, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(
      "Failed to fetch stations, chargers, and connectors:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch charging stations, chargers, and connectors.",
      },
      { status: 500 }
    );
  }
}
