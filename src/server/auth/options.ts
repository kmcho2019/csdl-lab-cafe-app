import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GitHubProvider from "next-auth/providers/github";
import { Role } from "@prisma/client";

import { allowlistedDomains, env } from "@/lib/env";
import { prisma } from "@/server/db/client";

function isAllowlisted(email: string) {
  const normalized = email.toLowerCase();
  const [, domain] = normalized.split("@");

  if (allowlistedDomains.includes(normalized) || allowlistedDomains.includes(domain ?? "")) {
    return true;
  }

  return prisma.allowlistEntry
    .findFirst({
      where: {
        OR: [{ value: normalized }, { value: domain }],
      },
    })
    .then((entry) => Boolean(entry));
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  secret: env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    GitHubProvider({
      clientId: env.GITHUB_ID ?? "",
      clientSecret: env.GITHUB_SECRET ?? "",
      authorization: { params: { scope: "read:user user:email" } },
      profile(profile) {
        return {
          id: profile.id?.toString() ?? profile.node_id ?? "",
          name: profile.name ?? profile.login,
          email: profile.email,
          role: Role.MEMBER,
          isActive: true,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const email = user.email ?? profile?.email;
      if (!email) {
        return false;
      }

      const allowed = await isAllowlisted(email);
      if (!allowed) {
        console.warn(`Sign-in blocked for ${email} — not allowlisted.`);
        return false;
      }

      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing && !existing.isActive) {
        console.warn(`Sign-in blocked for ${email} — user archived.`);
        return false;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: Role }).role ?? Role.MEMBER;
        token.isActive = (user as { isActive?: boolean }).isActive ?? true;
      }

      if (!token.role || token.isActive === undefined) {
        const dbUser = token.sub ? await prisma.user.findUnique({ where: { id: token.sub } }) : null;
        if (dbUser) {
          token.role = dbUser.role;
          token.isActive = dbUser.isActive;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as Role) ?? Role.MEMBER;
        session.user.isActive = Boolean(token.isActive ?? true);
      }

      return session;
    },
  },
  events: {
    async signIn({ user }) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), isActive: true },
      });
    },
  },
};
