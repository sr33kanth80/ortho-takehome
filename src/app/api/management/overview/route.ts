import { getManagementOverview, requireManagerRequest, routeError } from "@/lib/governance/management";

export async function GET(request: Request) {
  try {
    const manager = await requireManagerRequest(request);
    return Response.json(await getManagementOverview(manager));
  } catch (error) {
    return routeError(error);
  }
}
