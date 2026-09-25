import { Link } from "react-router-dom";

// Public privacy policy. Deliberately NOT behind <Protected> — Meta requires the URL to be
// reachable by an anonymous crawler before it will let an app publish, and a login redirect
// reads as a broken link to their reviewer.
//
// Written 2026-09-25 to unblock publishing the "Denplex ERP" Meta app (1779469933313102), which
// receives WhatsApp webhooks for WABA 3147719758764391 (+91 70410 65333).

const UPDATED = "25 September 2026";

const Section = ({ title, children }) => (
  <section className="mt-10">
    <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">{title}</h2>
    <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
  </section>
);

const Privacy = () => (
  <div className="min-h-screen bg-white text-slate-900" data-testid="privacy-page">
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
      <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/denplex-logo.png" alt="Denplex ERP" className="h-9 w-9 object-contain" />
          <span className="font-display font-bold tracking-tight text-lg">DENPLEX ERP</span>
        </Link>
        <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">Back to site</Link>
      </div>
    </header>

    <main className="max-w-3xl mx-auto px-6 pb-24">
      <div className="pt-12">
        <p className="text-xs uppercase tracking-wider text-red-600 font-medium">Legal</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated {UPDATED}</p>
      </div>

      <Section title="Who we are">
        <p>
          Denplex ERP is operated by <strong>Denplex Engineering Company</strong>, a precision
          engineering and job-work business registered in Gujarat, India. The software is used to
          run our own manufacturing operations and, where we have agreed to it in writing, those of
          other businesses.
        </p>
        <p>
          Questions about this policy or about data we hold:{" "}
          <a href="mailto:contact@denplex.co" className="text-red-600 hover:underline">contact@denplex.co</a>.
        </p>
      </Section>

      <Section title="What this policy covers">
        <p>
          It covers the Denplex ERP web application at erp.denplex.co, the Koshix mobile app, the
          public customer portal, and our WhatsApp Business integration. It does not cover
          third-party sites we link to.
        </p>
      </Section>

      <Section title="Information we hold">
        <p>We hold only what is needed to run the business:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Account data</strong> for our staff and authorised users — name, email address, phone number, role and permissions.</li>
          <li><strong>Business records</strong> — quotations, purchase orders, invoices, delivery challans, goods receipts, inventory movements, production and quality records.</li>
          <li><strong>Contact details of customers and suppliers</strong> — business name, address, GSTIN, contact person, phone and email.</li>
          <li><strong>WhatsApp message data</strong> — see the next section.</li>
          <li><strong>Technical logs</strong> — request timestamps and error records, kept for troubleshooting.</li>
        </ul>
        <p>
          We do not collect data about members of the public who have no dealing with us, we do not
          buy contact lists, and we do not run advertising or behavioural tracking on this software.
        </p>
      </Section>

      <Section title="WhatsApp integration">
        <p>
          Denplex ERP connects to the WhatsApp Business Platform for the number{" "}
          <strong>+91 70410 65333</strong>, through an application registered with Meta.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>What we receive.</strong> Messages sent to and from that number: the message
            text, the sender or recipient phone number, the WhatsApp message ID and its timestamp.
          </li>
          <li>
            <strong>Why.</strong> Solely to turn a purchase instruction sent from our own number
            into a draft purchase order inside the ERP, and to keep a record of what was ordered
            from a supplier. A draft is always reviewed by a person before it becomes a real order.
          </li>
          <li>
            <strong>What we do not do.</strong> We do not use WhatsApp data for marketing or
            profiling, we do not sell or share it, and we do not use it to train any machine
            learning model.
          </li>
          <li>
            <strong>Automated processing.</strong> Message text may be passed to an AI provider
            purely to extract item names, quantities and units. That provider processes the text to
            return a result and is contractually barred from using it for its own purposes.
          </li>
        </ul>
      </Section>

      <Section title="Why we are allowed to hold it">
        <p>
          We process this information to perform contracts with our customers and suppliers, to meet
          legal obligations under Indian tax and company law, and for the legitimate interest of
          running and securing the business.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          We do not sell personal data. We share it only with service providers who help us run the
          system, and only as far as their job requires: our cloud hosting and database providers,
          Meta Platforms for WhatsApp message delivery, our email provider, the GST Suvidha Provider
          who files e-invoices and e-way bills on our behalf, and the AI provider described above.
        </p>
        <p>
          We also disclose information where the law requires it — for example to tax authorities or
          in response to a valid legal order.
        </p>
      </Section>

      <Section title="Where it is stored">
        <p>
          Data is held on managed cloud infrastructure. Some providers operate outside India, so
          information may be processed abroad under that provider's contractual safeguards.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Accounting and tax records are kept for at least eight years, as Indian law requires.
          WhatsApp webhook payloads are kept as long as the purchase order they produced, so the
          order has an audit trail. Technical logs are kept for a short period and then discarded.
          Anything no longer needed for these purposes is deleted.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Access is restricted by individual accounts with role-based permissions. Traffic is
          encrypted in transit. Passwords are stored hashed, never in readable form. Access to
          production data is limited to the people who need it.
        </p>
        <p>
          No system is perfectly secure. If a breach affects your data we will tell you and the
          relevant authority as the law requires.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You may ask what we hold about you, ask for it to be corrected, or ask for it to be
          deleted where we are not required to keep it. Write to{" "}
          <a href="mailto:contact@denplex.co" className="text-red-600 hover:underline">contact@denplex.co</a>{" "}
          and we will respond within 30 days.
        </p>
        <p>
          To stop us receiving your WhatsApp messages, stop messaging the business number — we have
          no other way to reach your WhatsApp account.
        </p>
      </Section>

      <Section title="Children">
        <p>
          This software is for business use. It is not directed at children and we do not knowingly
          collect their information.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes materially we will update the date at the top of this page. Please
          check it from time to time.
        </p>
      </Section>

      <div className="mt-14 border-t border-slate-200 pt-6 text-sm text-slate-500">
        Denplex Engineering Company · contact@denplex.co
      </div>
    </main>
  </div>
);

export default Privacy;
