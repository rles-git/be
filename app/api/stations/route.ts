
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

    // Read Q001 directly for diagnostics.
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

    // Fetch stations, chargers, and connectors.
    // Select short_name without aliasing it here.
    const stations = await sql`
      SELECT
        s.id,
        s.name,
        s.short_name,
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

    // Normalize the database result for the frontend.
const normalizedStations: Array<Record<string, any>> = stations.map(
  (station: Record<string, any>) => ({
    ...station,
    shortName: station.short_name,
  })
);

    // Run a second direct query to compare the database value.
    const shortNameCheck = await sql`
      SELECT
        id,
        short_name
      FROM public.stations
      WHERE id = 'Q001'
      LIMIT 1
    `;

    const q001 = normalizedStations.find(
      (station) => String(station.id) === "Q001"
    );

    console.log("Diagnostic short_name:", diagnostic[0]?.short_name);
    console.log(
      "Second query short_name:",
      shortNameCheck[0]?.short_name
    );
    console.log("Normalized Q001:", q001?.shortName);
    console.log("Stations returned:", normalizedStations.length);

    // Diagnostic mode.
    if (new URL(request.url).searchParams.get("debug") === "1") {
      return NextResponse.json(
        {
          diagnostic: diagnostic[0] ?? null,
          secondQuery: shortNameCheck[0] ?? null,
          normalQueryQ001: q001 ?? null,
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    // Normal API response.
    return NextResponse.json(normalizedStations, {
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

