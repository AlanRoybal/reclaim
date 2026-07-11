import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
});

/**
 * POC MODE: login is disabled — every request runs as a shared demo user.
 * A valid Cognito token still wins if present, so re-enabling auth later is
 * just removing the fallback.
 */
const DEMO_USER = { sub: "demo-user", email: "demo@reclaim.local" };

export async function verifyRequest(req: Request): Promise<{ sub: string; email?: string } | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = await verifier.verify(auth.slice(7));
      return { sub: payload.sub, email: payload.email as string | undefined };
    } catch {
      return DEMO_USER;
    }
  }
  return DEMO_USER;
}
