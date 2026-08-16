import { runProspectingIntake } from "@/lib/prospecting/agent";
import { prospectingRouteError, requireProspectingUser } from "@/lib/prospecting/http";
import { intakeInput } from "@/lib/prospecting/validation";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const user = await requireProspectingUser(request);
    const input = intakeInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Invalid intake message." }, { status: 400 });
    return Response.json({ result: await runProspectingIntake(user, input.data) });
  } catch (error) {
    return prospectingRouteError(error);
  }
}
