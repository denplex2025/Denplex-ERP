import LineItemDoc from "@/components/erp/LineItemDoc";
export default function PurchaseOrders() {
  return (
    <LineItemDoc
      testid="purchase-orders-page"
      overline="Procurement"
      title="Purchase Orders"
      subtitle="Raise POs to suppliers and labour outsourcing partners."
      endpoint="/purchase-orders"
      partyEndpoint="/suppliers"
      partyField="Supplier"
      partyNameField="supplier_name"
      partyKey="supplier"
      statusOptions={["draft","sent","received","cancelled"]}
    />
  );
}
