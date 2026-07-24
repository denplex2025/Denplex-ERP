import ComingSoon from "@/components/erp/ComingSoon";

export default function PurchaseRequisitions() {
  return (
    <ComingSoon
      title="Purchase Requisition"
      subtitle="Employee-submitted requests for goods or services, routed through automated approval workflows."
      blurb="This module isn't built yet. When it ships, employees will raise a digital requisition here, it'll route through approval, and approved ones will convert straight into a Purchase Order."
      capabilities={[
        "Employees submit requisitions for goods/services",
        "Configurable, multi-step approval workflows",
        "Approved requisitions convert directly into Purchase Orders",
        "Full audit trail of who requested/approved what, and when",
      ]}
    />
  );
}
