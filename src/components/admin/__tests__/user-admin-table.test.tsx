import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserAdminTable } from "@/components/admin/user-admin-table";

describe("UserAdminTable", () => {
  let queryClient: QueryClient;
  const fetchMock = vi.fn();

  const baseUser = {
    id: "user-1",
    name: "Casey",
    email: "casey@example.com",
    role: "MEMBER" as const,
    isActive: true,
    githubId: "",
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  } as const;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    fetchMock.mockReset();
    vi.spyOn(global, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  function renderWithClient(users = [baseUser]) {
    return render(
      <QueryClientProvider client={queryClient}>
        <UserAdminTable currentUserId="user-2" users={users} />
      </QueryClientProvider>,
    );
  }

  it("promotes a member to admin", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          user: {
            ...baseUser,
            role: "ADMIN",
          },
        }),
    });

    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /promote to admin/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /set as member/i })).toBeInTheDocument());
  });

  it("freezes and reactivates an account", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          user: {
            ...baseUser,
            isActive: false,
          },
        }),
    });

    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /freeze account/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument());
  });

  it("creates a new user via the form", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          user: {
            id: "user-99",
            name: "Alex",
            email: "alex@example.com",
            role: "ADMIN",
            isActive: true,
            githubId: "123",
            lastLoginAt: null,
            createdAt: new Date().toISOString(),
          },
        }),
    });

    renderWithClient([]);

    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText(/GitHub ID/i), { target: { value: "123" } });
    fireEvent.click(screen.getByLabelText(/Start as admin/i));
    fireEvent.click(screen.getByRole("button", { name: /create member/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("alex@example.com")).toBeInTheDocument());
  });
});
