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

function normalizeEmail(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length ? normalized : null;
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
          githubId: profile.id?.toString(),
          name: profile.name ?? profile.login,
          email: profile.email,
          role: Role.MEMBER,
          isActive: true,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const oauthEmail = normalizeEmail(user.email ?? profile?.email);
      const provider = account?.provider ?? null;
      const providerAccountId = account?.providerAccountId?.toString() ?? null;

      const profileLogin =
        profile && "login" in profile && typeof profile.login === "string" ? profile.login.trim() : null;

      const selectUser = { id: true, email: true, isActive: true, githubId: true } as const;
      let linkedUser: { id: string; email: string; isActive: boolean; githubId: string | null } | null = null;

      if (provider === "github" && providerAccountId) {
        linkedUser = await prisma.user.findUnique({
          where: { githubId: providerAccountId },
          select: selectUser,
        });

        if (!linkedUser && profileLogin) {
          linkedUser = await prisma.user.findUnique({
            where: { githubId: profileLogin },
            select: selectUser,
          });
        }

        if (!linkedUser && oauthEmail) {
          linkedUser = await prisma.user.findUnique({
            where: { email: oauthEmail },
            select: selectUser,
          });
        }
      } else if (oauthEmail) {
        linkedUser = await prisma.user.findUnique({
          where: { email: oauthEmail },
          select: selectUser,
        });
      }

      const emailToCheck = linkedUser?.email ?? oauthEmail;
      if (!emailToCheck) {
        return false;
      }

      const allowed = await isAllowlisted(emailToCheck);
      if (!allowed) {
        console.warn(`Sign-in blocked for ${emailToCheck} — not allowlisted.`);
        return false;
      }

      if (linkedUser && !linkedUser.isActive) {
        console.warn(`Sign-in blocked for ${linkedUser.email} — user archived.`);
        return false;
      }

      if (provider === "github" && providerAccountId && linkedUser && account?.type === "oauth") {
        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider,
              providerAccountId,
            },
          },
          select: { id: true, userId: true },
        });

        if (!existingAccount) {
          try {
            await prisma.account.create({
              data: {
                userId: linkedUser.id,
                type: account.type,
                provider,
                providerAccountId,
                refresh_token: account.refresh_token,
                access_token: account.access_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
                session_state: account.session_state,
              },
            });
          } catch (error) {
            const retry = await prisma.account.findUnique({
              where: {
                provider_providerAccountId: {
                  provider,
                  providerAccountId,
                },
              },
              select: { id: true, userId: true },
            });

            if (!retry) {
              console.error("Unable to link GitHub account to existing user", error);
              return false;
            }
          }
        }

        if (linkedUser.githubId !== providerAccountId) {
          await prisma.user.update({
            where: { id: linkedUser.id },
            data: { githubId: providerAccountId },
          });
        }
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
