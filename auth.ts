import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { authConfig } from '@/auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // `common` allows any Microsoft Entra tenant + personal Microsoft
      // accounts. The Azure app registration's "Supported account types"
      // must match. Override at deploy time if a stricter tenant scope
      // (e.g. MAS-only) becomes warranted.
      issuer: `https://login.microsoftonline.com/${
        process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? 'common'
      }/v2.0`,
    }),
  ],
});
