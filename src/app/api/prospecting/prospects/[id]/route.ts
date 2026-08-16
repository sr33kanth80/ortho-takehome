import { reviewInput } from "@/lib/prospecting/validation";
import { reviewProspect } from "@/lib/prospecting/store";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

export async function PATCH(request: Request, context: RouteContext<"/api/prospecting/prospects/[id]">) {
  try {
    const user = await requireProspectingUser(request);
    const input = reviewInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Invalid review." }, { status: 400 });
    const { id } = await context.params;
    return Response.json({ account: await reviewProspect(user, id, input.data) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
