import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js config — provider instances (which carry Node-only
 * secrets) live in `auth.ts`. This file is imported by middleware and other
 * Edge contexts and must stay dependency-light.
 *
 * Why both files: the Auth.js v5 split-config pattern. See
 * https://authjs.dev/guides/edge-compatibility
 */
export const authConfig = {
  // No custom sign-in page in v1 — Auth.js's default page at /api/auth/signin
  // lists configured providers. We may swap this for a MAS-branded page later.
  pages: {},
  session: {
    // JWT-only session — no DB tables for sessions. Keeps the schema small
    // and avoids extending mas_ai_advisor's grants further.
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, profile }) {
      // Persist a stable sub + verified email on the token so we can read
      // them from /oauth/authorize without re-hitting the IdP.
      if (profile?.email) token.email = profile.email;
      if (profile?.email_verified !== undefined) {
        (token as Record<string, unknown>).email_verified = Boolean(
          profile.email_verified,
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (token.email && session.user) session.user.email = token.email;
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
  providers: [], // populated in auth.ts (Node-side)
} satisfies NextAuthConfig;
