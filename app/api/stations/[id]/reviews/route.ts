
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedAccountId,
  getSql,
} from "../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

// GET /api/stations/[id]/reviews
export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const sql = getSql();
    const stationId = params.id;

    const result = await sql`
      SELECT
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average_rating,
        COUNT(*)::int AS total_reviews
      FROM public.reviews
      WHERE station_id = ${stationId}
    `;

    const reviews = await sql`
      SELECT
        id,
        rating,
        comment,
        created_at,
        updated_at
      FROM public.reviews
      WHERE station_id = ${stationId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({
      averageRating: Number(result[0]?.average_rating ?? 0),
      totalReviews: Number(result[0]?.total_reviews ?? 0),
      reviews,
    });
  } catch (error) {
    console.error("Failed to fetch station reviews:", error);

    return NextResponse.json(
      { error: "Failed to load reviews." },
      { status: 500 }
    );
  }
}

// POST /api/stations/[id]/reviews
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const accountId = await getAuthenticatedAccountId();

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to write a review." },
        { status: 401 }
      );
    }

    const stationId = params.id;
    const body = await request.json();

    const rating = Number(body.rating);
    const comment =
      typeof body.comment === "string"
        ? body.comment.trim()
        : "";

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5." },
        { status: 400 }
      );
    }

    if (comment.length > 2000) {
      return NextResponse.json(
        { error: "Comment cannot exceed 2000 characters." },
        { status: 400 }
      );
    }

    const sql = getSql();

    const station = await sql`
      SELECT id
      FROM public.stations
      WHERE id = ${stationId}
      LIMIT 1
    `;

    if (station.length === 0) {
      return NextResponse.json(
        { error: "Station not found." },
        { status: 404 }
      );
    }

    const existing = await sql`
      SELECT id
      FROM public.reviews
      WHERE station_id = ${stationId}
        AND user_id = ${String(accountId)}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error:
            "You have already reviewed this station. Edit your existing review instead.",
        },
        { status: 409 }
      );
    }

    const inserted = await sql`
      INSERT INTO public.reviews (
        station_id,
        user_id,
        rating,
        comment
      )
      VALUES (
        ${stationId},
        ${String(accountId)},
        ${rating},
        ${comment || null}
      )
      RETURNING
        id,
        rating,
        comment,
        created_at,
        updated_at
    `;

    return NextResponse.json(
      {
        message: "Review submitted successfully.",
        review: inserted[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to submit station review:", error);

    return NextResponse.json(
      { error: "Failed to submit review." },
      { status: 500 }
    );
  }
}
