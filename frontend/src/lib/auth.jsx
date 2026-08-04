import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("erp_user")); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("erp_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me").then((r) => {
      setUser(r.data);
      localStorage.setItem("erp_user", JSON.stringify(r.data));
    }).catch(() => {
      localStorage.removeItem("erp_token");
      localStorage.removeItem("erp_user");
      setUser(null);
    }).finally(() => setLoading(false));
  }, []);

  const login = async (email, password, totpCode) => {
    const body = { email, password };
    if (totpCode) body.totp_code = totpCode;
    const r = await api.post("/auth/login", body);
    localStorage.setItem("erp_token", r.data.token);
    localStorage.setItem("erp_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    localStorage.removeItem("erp_token");
    localStorage.removeItem("erp_user");
    setUser(null);
  };

  // Re-fetch /auth/me and refresh the cached user (e.g. after a profile edit on /app/profile
  // so the sidebar name and everywhere else reading `user` picks up the change immediately).
  const refreshUser = async () => {
    const r = await api.get("/auth/me");
    setUser(r.data);
    localStorage.setItem("erp_user", JSON.stringify(r.data));
    return r.data;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
