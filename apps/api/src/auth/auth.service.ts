import { createClient, type Client } from "@openauthjs/openauth/client";
import { Injectable } from "@nestjs/common";
import { subjects, type AuthUser } from "@voltedge/auth-contract";
import { IS_PRODUCTION, optional, orDefault, required } from "../env.ts";
import type { AuthenticatedRequest } from "./auth.types.ts";
import { issuerFor } from "./issuer.ts";

@Injectable()
export class AuthService {
  private readonly clients = new Map<string, Client>();
  // Required in production; locally the issuer is derived from the request host and AUTH_PORT.
  private readonly override = IS_PRODUCTION ? required("AUTH_ISSUER") : optional("AUTH_ISSUER");
  private readonly authPort = orDefault("AUTH_PORT", "3001");

  private clientFor(issuer: string): Client {
    const cached = this.clients.get(issuer);
    if (cached) return cached;

    if (this.clients.size >= 8) this.clients.clear();
    const client = createClient({ clientID: "api", issuer });
    this.clients.set(issuer, client);
    return client;
  }

  async verify(request: AuthenticatedRequest, token: string): Promise<AuthUser | null> {
    const issuer = issuerFor(request, { authPort: this.authPort, override: this.override });
    const verified = await this.clientFor(issuer).verify(subjects, token);
    if (verified.err) return null;
    return verified.subject.properties;
  }
}
