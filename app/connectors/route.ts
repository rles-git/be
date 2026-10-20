import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const connectors = await sql`
      SELECT
        id,
        charger_id,
        connector_number,
        connector_type,
        max_power_kw,
        status,
        created_at,
        updated_at
      FROM public.connectors
      ORDER BY id ASC
    `;
    return NextResponse.json(connectors);
  } catch (error) {
    console.error("Failed to load connectors", error);
    return NextResponse.json({ error: "Failed to load connectors" }, { status: 500 });
  }
}
