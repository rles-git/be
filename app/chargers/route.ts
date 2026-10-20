import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const chargers = await sql`
      SELECT
        id,
        station_id,
        name,
        manufacturer,
        model,
        serial_number,
        max_power_kw,
        status,
        protocol,
        protocol_identity,
        created_at,
        updated_at
      FROM public.chargers
      ORDER BY id ASC
    `;
    return NextResponse.json(chargers);
  } catch (error) {
    console.error("Failed to load chargers", error);
    return NextResponse.json({ error: "Failed to load chargers" }, { status: 500 });
  }
}
