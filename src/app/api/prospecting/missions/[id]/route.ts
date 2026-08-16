import { missionUpdateInput } from "@/lib/prospecting/validation";
import { deleteMission, getMission, getMissionAccounts, updateMission } from "@/lib/prospecting/store";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

export async function GET(request: Request, context: RouteContext<"/api/prospecting/missions/[id]">) {
  try {
    const user = await requireProspectingUser(request);
    const { id } = await context.params;
    const [mission, accounts] = await Promise.all([getMission(user, id), getMissionAccounts(user, id)]);
    return Response.json({ mission, accounts });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
export async function PATCH(request: Request, context: RouteContext<"/api/prospecting/missions/[id]">) {
  try {
    const user = await requireProspectingUser(request);
    const input = missionUpdateInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Invalid mission update." }, { status: 400 });
    const { id } = await context.params;
    return Response.json({ mission: await updateMission(user, id, input.data) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/prospecting/missions/[id]">) {
  try {
    const user = await requireProspectingUser(request);
    const { id } = await context.params;
    await deleteMission(user, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
