import ComingSoon from "@/components/erp/ComingSoon";

export default function GoodsReceipt() {
  return (
    <ComingSoon
      title="Goods Receipt"
      subtitle="Track deliveries against Purchase Orders to verify correct quantities and quality received."
      blurb="This module isn't built yet. When it ships, you'll log each delivery against its Purchase Order here, flag quantity/quality mismatches, and feed verified receipts into invoice matching."
      capabilities={[
        "Log deliveries against the originating Purchase Order",
        "Flag quantity or quality mismatches on receipt",
        "Partial / over-under delivery tracking",
        "Feeds Invoice Automation & Payment for 3-way matching (PO ↔ Receipt ↔ Bill)",
      ]}
    />
  );
}
