import { createPolicy, policyInput, requireManagerRequest, routeError } from "@/lib/governance/management";

export async function POST(request: Request) {
  try {
    const manager = await requireManagerRequest(request);
    const input = policyInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Invalid endpoint policy" }, { status: 400 });
    return Response.json({ policy: await createPolicy(manager, input.data) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
