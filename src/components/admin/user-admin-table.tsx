"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { formatDistanceToNow } from "date-fns";

type UserRole = "ADMIN" | "MEMBER";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  githubId: string;
  lastLoginAt: string | null;
  createdAt: string;
};

type Message = { type: "success" | "error"; text: string } | null;

type UserAdminTableProps = {
  currentUserId: string;
  users: ManagedUser[];
};

function sortUsers(users: ManagedUser[]) {
  return [...users].sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === "ADMIN" ? -1 : 1;
    }
    return a.email.localeCompare(b.email);
  });
}

export function UserAdminTable({ currentUserId, users }: UserAdminTableProps) {
  const [state, setState] = useState(() => sortUsers(users));
  const [message, setMessage] = useState<Message>(null);

  const createUserMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      email: string;
      githubId?: string;
      role: UserRole;
    }) => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to create user");
      }

      return response.json() as Promise<{ user: ManagedUser }>;
    },
    onSuccess: (data) => {
      setState((prev) => sortUsers([...prev, data.user]));
      setMessage({ type: "success", text: "User created and allowlisted." });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "User creation failed." });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Update failed");
      }

      return response.json() as Promise<{ user: ManagedUser }>;
    },
    onSuccess: (data) => {
      setState((prev) => sortUsers(prev.map((user) => (user.id === data.user.id ? data.user : user))));
      setMessage({ type: "success", text: "User updated." });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not update user." });
    },
  });

  const pending = createUserMutation.isPending || updateUserMutation.isPending;

  const adminCount = useMemo(() => state.filter((user) => user.role === "ADMIN" && user.isActive).length, [state]);

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">People</h1>
        <p className="mt-2 text-sm text-slate-600">
          Invite lab members, link GitHub accounts, and manage roles or account status.
        </p>
      </header>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add lab member</h2>
        <p className="mt-1 text-sm text-slate-600">
          The email is automatically added to the allowlist so they can sign in with GitHub.
        </p>
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const name = formData.get("name")?.toString().trim() ?? "";
            const email = formData.get("email")?.toString().trim() ?? "";
            const githubIdRaw = formData.get("githubId")?.toString().trim() ?? "";
            const startAsAdmin = formData.get("makeAdmin") === "on";

            setMessage(null);
            createUserMutation.mutate(
              {
                name,
                email,
                githubId: githubIdRaw || undefined,
                role: startAsAdmin ? "ADMIN" : "MEMBER",
              },
              {
                onSuccess: () => form.reset(),
              },
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Name
            <input
              name="name"
              type="text"
              required
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Email
            <input
              name="email"
              type="email"
              required
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            GitHub ID (numeric, optional)
            <input
              name="githubId"
              type="text"
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-600">
            <input name="makeAdmin" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
            Start as admin
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={createUserMutation.isPending}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {createUserMutation.isPending ? "Creating..." : "Create member"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last activity</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {state.map((user) => {
              const isSelf = user.id === currentUserId;
              const isLastActiveAdmin = user.role === "ADMIN" && user.isActive && adminCount <= 1;
              return (
                <tr key={user.id}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-900">{user.name || "—"}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">{user.role}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div>{user.email}</div>
                    {user.githubId && <div className="text-xs text-slate-500">GitHub ID: {user.githubId}</div>}
                  </td>
                  <td className="px-4 py-3 align-top text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                        user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {user.isActive ? "Active" : "Frozen"}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-slate-500">
                    {user.lastLoginAt
                      ? `${formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })}`
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={pending || (user.role === "ADMIN" && isLastActiveAdmin)}
                        onClick={() => {
                          setMessage(null);
                          updateUserMutation.mutate({
                            id: user.id,
                            body: {
                              role: user.role === "ADMIN" ? "MEMBER" : "ADMIN",
                            },
                          });
                        }}
                        className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        {user.role === "ADMIN" ? "Set as member" : "Promote to admin"}
                      </button>
                      <button
                        type="button"
                        disabled={pending || (isSelf && isLastActiveAdmin && user.isActive)}
                        onClick={() => {
                          setMessage(null);
                          updateUserMutation.mutate({
                            id: user.id,
                            body: {
                              isActive: !user.isActive,
                            },
                          });
                        }}
                        className={`rounded px-3 py-2 text-xs font-semibold transition ${
                          user.isActive
                            ? "border border-red-200 text-red-600 hover:bg-red-50"
                            : "border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        } disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400`}
                      >
                        {user.isActive ? "Freeze account" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!state.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  No members yet. Add someone above to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
