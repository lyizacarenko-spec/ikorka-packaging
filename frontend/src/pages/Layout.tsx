import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../AuthContext";

const ROLE_LABEL: Record<string, string> = {
  owner: "Власник",
  editor: "Редактор",
  viewer: "Перегляд",
};

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <div className="sidebar">
        <h1>ikorka-packaging</h1>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Ввід даних
        </NavLink>
        <NavLink to="/reports" className={({ isActive }) => (isActive ? "active" : "")}>
          Звіти
        </NavLink>
        <NavLink to="/stock" className={({ isActive }) => (isActive ? "active" : "")}>
          Склад
        </NavLink>
        <NavLink to="/prices" className={({ isActive }) => (isActive ? "active" : "")}>
          Ціни
        </NavLink>
        <NavLink to="/reference" className={({ isActive }) => (isActive ? "active" : "")}>
          Довідники
        </NavLink>
        <div className="user">
          <div>{user?.name}</div>
          <div className="badge">{user ? ROLE_LABEL[user.role] : ""}</div>
          <div style={{ marginTop: 10 }}>
            <button className="btn secondary" onClick={logout} style={{ width: "100%" }}>
              Вийти
            </button>
          </div>
        </div>
      </div>
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
