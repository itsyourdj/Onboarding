import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Insights from "./pages/Insights";
import { fetchRoleAccess } from "./lib/authorization";
import { Card, Spinner } from "./components/ui";

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["role-access"],
    queryFn: fetchRoleAccess,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Spinner label="Checking access..." />;

  if (isError) {
    return (
      <Layout fullAccess={false}>
        <Card>
          <h1 className="text-lg font-semibold text-fg-primary">Access check failed</h1>
          <p className="mt-2 text-sm text-fg-secondary">
            We could not validate your DataOS roles right now. Please refresh the page, or sign in again.
          </p>
        </Card>
      </Layout>
    );
  }

  const fullAccess = Boolean(data?.fullAccess);

  return (
    <Layout fullAccess={fullAccess}>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/customers" element={<Customers fullAccess={fullAccess} />} />
        <Route path="/customers/:id" element={<CustomerDetail fullAccess={fullAccess} />} />
        <Route path="/insights" element={<Insights fullAccess={fullAccess} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
