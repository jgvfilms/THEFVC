import type { ReactNode } from "react";
import { LandingShell } from "./landing";

// Single place to change where each kind of request goes. All of these are
// cPanel forwarders on thefvc.is, so they can be re-pointed without a deploy.
const EMAILS = {
  support: "support@thefvc.is",
  privacy: "privacy@thefvc.is",
  legal: "legal@thefvc.is",
  dmca: "dmca@thefvc.is",
  abuse: "abuse@thefvc.is",
  security: "security@thefvc.is",
};
function Mail({ to }: { to: string }) {
  return <a href={`mailto:${to}`}>{to}</a>;
}
const UPDATED = "November 4, 2026";

function LegalPage({ id, title, contact, children }: { id: string; title: string; contact: string; children: ReactNode }) {
  return (
    <LandingShell>
      <section className="wrap page-body legal" aria-labelledby={`${id}-title`}>
        <div className="sec-head">
          <p className="label">Legal</p>
          <h1 id={`${id}-title`} className="display" data-testid={`${id}-title`} style={{ fontSize: "clamp(2.8rem, 6.4vw, 6rem)" }}>
            {title}<span className="dot">.</span>
          </h1>
        </div>
        <p className="note">Last updated {UPDATED}. Questions? Email <Mail to={contact} />.</p>
        {children}
      </section>
    </LandingShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage id="privacy" title="Privacy policy" contact={EMAILS.privacy}>
      <p className="note">
        THEFVC.IS is run by the Film Video Collective ("FVC", "we"). This page explains what we collect, why, and what you can do about it.
        We built the site to help independent filmmakers find crew and manage productions, and we only collect what that takes.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details.</b> Your email, a handle, and a password (stored only as a one-way hash) if you sign up with a password.</li>
        <li><b>Google sign-in.</b> If you choose "Continue with Google" we receive your name, email address and Google account ID. We use them to sign you in or create your account. We do not receive your Google password, and we do not keep Google's access token or read anything else in your Google account.</li>
        <li><b>Profile and production information</b> you choose to add: name, role, city, bio, links, credits, day rate, productions and posts.</li>
        <li><b>Messages</b> you send to other members. Email notifications about a message say who wrote to you but never include the text.</li>
        <li><b>Payments.</b> Subscriptions, payouts and invoices are processed by Stripe. We store Stripe's reference IDs, amounts and status. We never see or store your card number.</li>
        <li><b>Tax information.</b> If you submit a W-9 we store your legal name, address and tax ID. The tax ID is encrypted at rest and used only for tax reporting.</li>
        <li><b>Technical data.</b> Your IP address and browser type appear in security and abuse logs and in rate limiting. We keep a sign-in token in your browser for up to 30 days.</li>
      </ul>

      <h2>AI connections</h2>
      <p>If you connect an AI assistant (for example Claude) from the Connections page, it can read and update only your own profile, credits and page, within the permissions you approve. Connection tokens are stored hashed. You can revoke any connection at any time on the same page.</p>

      <h2>Who we share data with</h2>
      <p>We do not sell your data. We use a few services to run the site, and they only receive what they need:</p>
      <ul>
        <li><b>Railway</b> hosts the site and database.</li>
        <li><b>Stripe</b> processes payments and invoices.</li>
        <li><b>Resend</b> delivers our emails (account, reset and notification messages).</li>
        <li><b>Google</b> provides sign-in if you use it, and serves the fonts the site loads.</li>
      </ul>
      <p>Your profile is visible to others according to your profile settings. Anything you post or add to a public profile can be seen by anyone with the link.</p>

      <h2>How long we keep it</h2>
      <p>We keep your data while your account is open. When you delete your account we remove your sign-in identity. We may keep payment and tax records as long as the law requires, which can be up to seven years, and security logs for as long as we need them to protect the service.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Edit or remove profile information at any time from your profile page.</li>
        <li>Ask us for a copy of your data, or to delete your account, by emailing <Mail to={EMAILS.privacy} />. We cannot delete an account with an active subscription or pending payments until those are settled.</li>
        <li>Revoke connected AI apps on the Connections page.</li>
      </ul>

      <h2>Security</h2>
      <p>Sensitive values such as tax IDs and payment references are encrypted at rest, and passwords and connection tokens are stored hashed. No system is perfectly secure, so please use a strong, unique password.</p>

      <h2>Children</h2>
      <p>THEFVC.IS is not intended for children under 13, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above. If a change is significant we will tell members by email or on the site.</p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage id="terms" title="Terms of service" contact={EMAILS.legal}>
      <p className="note">By creating an account or using THEFVC.IS you agree to these terms. If you do not agree, please do not use the site.</p>

      <h2>The service</h2>
      <p>THEFVC.IS is a platform for independent filmmakers to build profiles, find crew, manage productions, message each other and handle payments. It is currently in beta and available by invitation. Features may change, break or be removed, and we may limit access while we grow.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must give accurate information and keep your login secure. You are responsible for activity on your account.</li>
        <li>One person per account. Do not share your login or impersonate anyone.</li>
        <li>We may suspend or revoke access if these terms are broken or the service or its members are at risk. You can stop using the service or ask us to delete your account at any time.</li>
      </ul>

      <h2>Your content</h2>
      <p>You keep ownership of what you post: your profile, credits, posts, messages and media. You give us permission to store it and show it as the service requires, for example displaying your profile to other members. Only post things you have the right to share.</p>

      <h2>Acceptable use</h2>
      <ul>
        <li>No harassment, spam, scams, or content that is unlawful or infringes someone else's rights.</li>
        <li>No scraping, probing for security holes, or interfering with the service or other members.</li>
        <li>Work agreements are between you and the other member. FVC is not a party to them and does not guarantee anyone's work or payment.</li>
      </ul>

      <h2>Payments, invoices and taxes</h2>
      <p>Payments and invoices are processed by Stripe and are subject to Stripe's own terms. Subscriptions renew until cancelled. You are responsible for any taxes that apply to what you earn or pay, and for providing accurate tax information.</p>

      <h2>No warranty</h2>
      <p>Because this is a beta, the service is provided "as is" and "as available" without warranties of any kind. We do not promise it will be uninterrupted or error free.</p>

      <h2>Limit of liability</h2>
      <p>To the fullest extent the law allows, FVC is not liable for indirect or consequential losses, lost profits or lost data arising from your use of the service. Our total liability for any claim is limited to the amount you paid us in the 12 months before it.</p>

      <h2>Copyright and reports</h2>
      <ul>
        <li>If you believe something on the site infringes your copyright, email <Mail to={EMAILS.dmca} /> with what it is, where it is, and that you own or represent the rights.</li>
        <li>To report harassment, spam or other misuse, email <Mail to={EMAILS.abuse} />.</li>
        <li>To report a security problem, email <Mail to={EMAILS.security} />. Please give us a reasonable chance to fix it before sharing it publicly.</li>
        <li>For help with your account or a payment, email <Mail to={EMAILS.support} />.</li>
      </ul>

      <h2>Changes and contact</h2>
      <p>We may update these terms and will change the date above when we do. Continuing to use the service after a change means you accept it. Questions? Email <Mail to={EMAILS.legal} />.</p>
    </LegalPage>
  );
}
