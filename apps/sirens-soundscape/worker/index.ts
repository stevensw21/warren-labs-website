/** Cloudflare Worker entry point for Siren's Soundscape. */
import handler from "vinext/server/app-router-entry";
import { authenticateAccessRequest, type AccessEnvironment } from "./access-auth";

interface Env extends AccessEnvironment {
  ASSETS: Fetcher;
  DB: D1Database;
  AUDIO: R2Bucket;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const authenticated = await authenticateAccessRequest(request, env);
    if (authenticated instanceof Response) return authenticated;

    return handler.fetch(authenticated, env, ctx);
  },
};

export default worker;
