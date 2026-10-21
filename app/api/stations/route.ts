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
                        'status', co.status
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

    return NextResponse.json(stations, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Failed to fetch stations, chargers, and connectors:", error);

    return NextResponse.json(
      { error: "Failed to fetch charging stations, chargers, and connectors." },
      { status: 500 }
    );
  }
}
