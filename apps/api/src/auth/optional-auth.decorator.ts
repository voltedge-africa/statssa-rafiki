import { SetMetadata } from "@nestjs/common";

export const IS_OPTIONAL_AUTH_KEY = "auth:optional";

/**
 * Opts a route into optional authentication: a request without a token is treated as anonymous,
 * but a token that is present must still verify. Useful for public endpoints that enrich their
 * response when the caller happens to be signed in.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
