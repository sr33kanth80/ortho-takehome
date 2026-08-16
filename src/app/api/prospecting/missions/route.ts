import { missionInput } from "@/lib/prospecting/validation";
import { createMission, listMissions } from "@/lib/prospecting/store";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

export async function GET(request: Request) {
  try {
    const user = await requireProspectingUser(request);
    return Response.json({ missions: await listMissions(user) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireProspectingUser(request);
    const input = missionInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Invalid mission." }, { status: 400 });
    return Response.json({ mission: await createMission(user, input.data) }, { status: 201 });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
