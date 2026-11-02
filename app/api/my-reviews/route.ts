import { NextResponse } from "next/server";
import {
  getAuthenticatedAccountId,
  getSql,
} from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/my-reviews
export async function GET() {
  try {
    const accountId = await getAuthenticatedAccountId();

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to view your reviews." },
        { status: 401 }
      );
    }

    const sql = getSql();

    const reviews = await sql`
      SELECT
        r.id,
        r.station_id,
        s.name AS station_name,
        s.address AS station_address,
        r.rating,
        r.comment,
        r.created_at,
        r.updated_at
      FROM public.reviews r
      INNER JOIN public.stations s
        ON s.id = r.station_id
      WHERE r.user_id = ${String(accountId)}
      ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
    `;

    return NextResponse.json({ reviews });
  } catch (error) {
    console.error("Failed to fetch user reviews:", error);

    return NextResponse.json(
      { error: "Failed to load your reviews." },
      { status: 500 }
    );
  }
}
