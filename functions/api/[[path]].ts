// Cloudflare Pages Function: every /api/* request (see public/_routes.json) goes to the shared router.
import { handle } from '../../server/router.ts';
import type { Env } from '../../server/types.ts';

export const onRequest = (context: { request: Request; env: Env }): Promise<Response> => handle(context.request, context.env);
