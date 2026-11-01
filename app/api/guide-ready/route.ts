import { revalidatePath } from "next/cache";
import { getGuide } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Says whether a guide exists in storage, and if it does, refreshes the cached guide page and
// library so a just-written guide (or one whose "not found" page was cached) shows up at once.
// Revalidation has to run here, inside an ordinary request, not inside the generate stream.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const guide = await getGuide(slug);
  if (!guide) return Response.json({ ready: false });
  revalidatePath(`/guides/${guide.slug}`);
  revalidatePath("/");
  return Response.json({ ready: true, slug: guide.slug });
}
