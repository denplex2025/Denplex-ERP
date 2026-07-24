import ComingSoon from "@/components/erp/ComingSoon";

export default function SourcingTendering() {
  return (
    <ComingSoon
      title="Sourcing & Tendering"
      subtitle="Manage Requests for Quotes (RFQs) and Requests for Proposals (RFPs) to find the best pricing and terms."
      blurb="This module isn't built yet. When it ships, you'll send RFQs/RFPs to multiple suppliers here and compare responses side by side before committing to a Purchase Order."
      capabilities={[
        "Create and send RFQs / RFPs to multiple suppliers at once",
        "Side-by-side comparison of supplier quotes",
        "Award a quote directly into a Purchase Order",
        "Track sourcing history per item / category",
      ]}
    />
  );
}
