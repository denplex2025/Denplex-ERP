import { InvoiceDualPane } from "@/components/erp/InvoiceDualPane";
export default function Invoices() {
  return (
    <InvoiceDualPane
      testid="invoices-page"
      overline="Accounting"
      title="Sale Invoices"
      subtitle="CGST/SGST for intra-state, IGST for inter-state — auto computed."
      endpoint="/invoices"
      partyEndpoint="/customers"
      partyField="Customer"
      partyNameField="customer_name"
      partyKey="customer"
      createTo="/app/invoices/new"
      editTo={(row) => `/app/invoices/${row.id}/edit`}
    />
  );
}
