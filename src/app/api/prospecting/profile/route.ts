import { businessProfileInput } from "@/lib/prospecting/validation";
import { getBusinessProfile, saveBusinessProfile } from "@/lib/prospecting/store";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";

export async function GET(request: Request) {
  try {
    const user = await requireProspectingUser(request);
    return Response.json({ profile: await getBusinessProfile(user) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const user = await requireProspectingUser(request);
    const input = businessProfileInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Invalid business brief." }, { status: 400 });
    return Response.json({ profile: await saveBusinessProfile(user, input.data) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
