import LineItemDoc from "@/components/erp/LineItemDoc";
export default function Quotations() {
  return (
    <LineItemDoc
      testid="quotations-page"
      overline="Sales"
      title="Quotations"
      subtitle="Send GST-ready quotations and convert to orders."
      endpoint="/quotations"
      partyEndpoint="/customers"
      partyField="Customer"
      partyNameField="customer_name"
      partyKey="customer"
      statusOptions={["draft","sent","accepted","rejected"]}
    />
  );
}
