import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./pages/Login";
import Layout from "./pages/Layout";
import DataEntry from "./pages/DataEntry";
import Reports from "./pages/Reports";
import Stock from "./pages/Stock";
import Prices from "./pages/Prices";
import Reference from "./pages/Reference";

function Gate() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DataEntry />} />
        <Route path="reports" element={<Reports />} />
        <Route path="stock" element={<Stock />} />
        <Route path="prices" element={<Prices />} />
        <Route path="reference" element={<Reference />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  );
}
