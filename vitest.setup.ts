import "@testing-library/jest-dom/vitest";

// Provide a fetch mock fallback for components using React Query.
if (!global.fetch) {
  global.fetch = async () => {
    throw new Error("fetch is not implemented in tests – mock it before calling components that use it.");
  };
}
