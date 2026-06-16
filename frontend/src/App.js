import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Portal from "@/pages/Portal";
import AppLayout from "@/pages/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import BOMPage from "@/pages/BOM";
import WorkOrders from "@/pages/WorkOrders";
import JobCards from "@/pages/JobCards";
import Quotations from "@/pages/Quotations";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Invoices from "@/pages/Invoices";
import Leads from "@/pages/Leads";
import Customers from "@/pages/Customers";
import Suppliers from "@/pages/Suppliers";
import QC from "@/pages/QC";
import Documents from "@/pages/Documents";
import Users from "@/pages/Users";
import Accounting from "@/pages/Accounting";
import HR from "@/pages/HR";
import Marketing from "@/pages/Marketing";
import Settings from "@/pages/Settings";
import AuditLog from "@/pages/AuditLog";
import Trial from "@/pages/Trial";
import TrialRequests from "@/pages/TrialRequests";
import DocList from "@/pages/DocList";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}


import PaymentIn from "./pages/PaymentIn";
import PaymentOut from "./pages/PaymentOut";
import Expenses from "./pages/Expenses";
import PartyStatement from "./pages/PartyStatement";
import ProformaInvoices from "./pages/ProformaInvoices";
import SaleReturns from "./pages/SaleReturns";
import PurchaseReturns from "./pages/PurchaseReturns";
import Parts from "./pages/Parts";
import Machines from "./pages/Machines";
import Scan from "./pages/Scan";
import Planning from "./pages/Planning";
import Costing from "./pages/Costing";
import ISO from "./pages/ISO";
import RecycleBin from "./pages/RecycleBin";
import BulkItems from "./pages/BulkItems";
import Reminders from "./pages/Reminders";
import InvoiceCreate from "./pages/InvoiceCreate";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/trial" element={<Trial />} />
            <Route path="/app" element={<Protected><AppLayout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="bom" element={<BOMPage />} />
              <Route path="work-orders" element={<WorkOrders />} />
              <Route path="job-cards" element={<JobCards />} />
              <Route path="quotations" element={<Quotations />} />
              <Route path="purchase-orders" element={<PurchaseOrders />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/new" element={<InvoiceCreate />} />
              <Route path="docs/:kind" element={<DocList />} />
              <Route path="leads" element={<Leads />} />
              <Route path="customers" element={<Customers />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="qc" element={<QC />} />
              <Route path="documents" element={<Documents />} />
              <Route path="accounting" element={<Accounting />} />
              <Route path="hr" element={<HR />} />
              <Route path="marketing" element={<Marketing />} />
              <Route path="settings" element={<Settings />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="trial-requests" element={<TrialRequests />} />
              <Route path="users" element={<Users />} />
              <Route path="payments-in" element={<PaymentIn />} />
              <Route path="payments-out" element={<PaymentOut />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="statements" element={<PartyStatement />} />
              <Route path="proforma" element={<ProformaInvoices />} />
              <Route path="sale-returns" element={<SaleReturns />} />
              <Route path="purchase-returns" element={<PurchaseReturns />} />
              <Route path="parts" element={<Parts />} />
              <Route path="machines" element={<Machines />} />
              <Route path="planning" element={<Planning />} />
              <Route path="costing" element={<Costing />} />
              <Route path="iso" element={<ISO />} />
              <Route path="recycle-bin" element={<RecycleBin />} />
              <Route path="bulk-items" element={<BulkItems />} />
              <Route path="reminders" element={<Reminders />} />
              <Route path="scan/:entity/:id" element={<Scan />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
