import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Insights from "./pages/Insights";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/insights" element={<Insights />} />
      </Routes>
    </Layout>
  );
}
