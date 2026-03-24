import { dispatchApi } from "@/server/api-dispatch";

type RouteCtx = { params: Promise<{ slug?: string[] }> };

export async function GET(request: Request, context: RouteCtx): Promise<Response> {
    const { slug } = await context.params;
    return dispatchApi("GET", slug ?? [], request);
}

export async function POST(request: Request, context: RouteCtx): Promise<Response> {
    const { slug } = await context.params;
    return dispatchApi("POST", slug ?? [], request);
}

export async function PUT(request: Request, context: RouteCtx): Promise<Response> {
    const { slug } = await context.params;
    return dispatchApi("PUT", slug ?? [], request);
}
