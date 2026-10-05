/** Offset (ms) to add to Date.now() to get server time. Falls back to 0 if the call fails. */
export async function getServerOffset(): Promise<number> {
  try {
    const t0 = Date.now();
    const res = await fetch("/api/time", { cache: "no-store" });
    const { now } = (await res.json()) as { now: number };
    const t1 = Date.now();
    return now - (t0 + t1) / 2; // assume symmetric latency
  } catch {
    return 0;
  }
}
