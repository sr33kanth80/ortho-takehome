import { requireManagerRequest, routeError, settingsInput, updateSettings } from "@/lib/governance/management";

export async function PATCH(request: Request) {
  try {
    const manager = await requireManagerRequest(request);
    const input = settingsInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
    return Response.json({ settings: await updateSettings(manager, input.data) });
  } catch (error) {
    return routeError(error);
  }
}
