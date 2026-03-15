// @TheTechMargin 2026
// Admin authentication state — manages secret, auth status, and header factory.

import { useState, useCallback } from "react";

export function useAdminAuth() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    }),
    [secret],
  );

  const logout = useCallback(() => {
    setAuthenticated(false);
  }, []);

  return {
    secret,
    setSecret,
    authenticated,
    setAuthenticated,
    headers,
    logout,
  };
}
