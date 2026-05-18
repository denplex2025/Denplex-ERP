import LineItemDoc from "@/components/erp/LineItemDoc";
export default function Invoices() {
  return (
    <LineItemDoc
      testid="invoices-page"
      overline="Accounting"
      title="GST Invoices"
      subtitle="CGST/SGST for intra-state, IGST for inter-state — auto computed."
      endpoint="/invoices"
      partyEndpoint="/customers"
      partyField="Customer"
      partyNameField="customer_name"
      partyKey="customer"
      statusOptions={["draft","sent","paid","overdue"]}
      isInvoice
    />
  );
}
