export const dynamic = "force-dynamic";

// Server clock for the countdown (clients must not trust their own clock).
export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
