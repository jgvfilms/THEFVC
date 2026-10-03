/**
 * Email templates for THEFVC.IS.
 * Each template returns { subject, html, text } given a context object.
 */

export interface TemplateContext {
  [key: string]: any;
}

/**
 * Password reset email template.
 * Context: { resetUrl, userHandle, userEmail }
 */
export function passwordResetTemplate(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const { resetUrl, userHandle } = ctx;
  return {
    subject: "Reset Your THEFVC.IS Password",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Password Reset</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
    <h1 style="color: #d4af37; margin-top: 0;">Reset Your Password</h1>
    <p>Hello ${userHandle || "there"},</p>
    <p>You requested a password reset for your THEFVC.IS account. Click the button below to reset your password:</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #d4af37; color: #0a0a0a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Reset Password</a>
    </p>
    <p>This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    <p style="margin-top: 40px; color: #888; font-size: 14px;">— The FVC Team</p>
  </div>
</body>
</html>`,
    text: `Reset Your Password\n\nHello ${userHandle || "there"},\n\nYou requested a password reset for your THEFVC.IS account. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour. If you didn't request this, you can safely ignore this email.\n\n— The FVC Team`,
  };
}

/**
 * Email verification template.
 * Context: { verificationUrl, userHandle, userEmail }
 */
export function emailVerificationTemplate(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const { verificationUrl, userHandle } = ctx;
  return {
    subject: "Verify Your Email for THEFVC.IS",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Email Verification</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
    <h1 style="color: #d4af37; margin-top: 0;">Verify Your Email</h1>
    <p>Hello ${userHandle || "there"},</p>
    <p>Welcome to THEFVC.IS! Please verify your email address by clicking the button below:</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="display: inline-block; background: #d4af37; color: #0a0a0a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Verify Email</a>
    </p>
    <p>If you didn't create an account, you can safely ignore this email.</p>
    <p style="margin-top: 40px; color: #888; font-size: 14px;">— The FVC Team</p>
  </div>
</body>
</html>`,
    text: `Verify Your Email\n\nHello ${userHandle || "there"},\n\nWelcome to THEFVC.IS! Please verify your email address by clicking the link below:\n\n${verificationUrl}\n\nIf you didn't create an account, you can safely ignore this email.\n\n— The FVC Team`,
  };
}

/**
 * Welcome email template (sent after signup/verification).
 * Context: { userHandle }
 */
export function welcomeTemplate(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const { userHandle } = ctx;
  return {
    subject: "Welcome to THEFVC.IS!",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Welcome</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
    <h1 style="color: #d4af37; margin-top: 0;">Welcome to THEFVC.IS!</h1>
    <p>Hello ${userHandle || "there"},</p>
    <p>Welcome to the Film Video Collective. You're now part of a community of filmmakers, crew, and creators.</p>
    <p>Here are a few things you can do to get started:</p>
    <ul style="color: #ccc; line-height: 1.8;">
      <li>Complete your profile with your reel, skills, and availability</li>
      <li>Browse the crew directory to find collaborators</li>
      <li>Join productions and add credits to your profile</li>
      <li>Share updates on the feed</li>
    </ul>
    <p style="margin-top: 40px; color: #888; font-size: 14px;">— The FVC Team</p>
  </div>
</body>
</html>`,
    text: `Welcome to THEFVC.IS!\n\nHello ${userHandle || "there"},\n\nWelcome to the Film Video Collective. You're now part of a community of filmmakers, crew, and creators.\n\nHere are a few things you can do to get started:\n- Complete your profile with your reel, skills, and availability\n- Browse the crew directory to find collaborators\n- Join productions and add credits to your profile\n- Share updates on the feed\n\n— The FVC Team`,
  };
}

/**
 * Beta invite email template.
 * Context: { inviteUrl, displayName, role }
 */
export function betaInviteTemplate(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const { inviteUrl, displayName, role } = ctx;
  return {
    subject: `You're Invited to THEFVC.IS`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Beta Invite</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
    <h1 style="color: #d4af37; margin-top: 0;">You're Invited!</h1>
    <p>Hello ${displayName || "there"},</p>
    <p>You've been invited to join THEFVC.IS, the Film Video Collective.</p>
    ${role ? `<p>Your role: <strong>${role}</strong></p>` : ""}
    <p style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" style="display: inline-block; background: #d4af37; color: #0a0a0a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Accept Invite</a>
    </p>
    <p>This invite is valid for 7 days. If you don't accept, it will expire automatically.</p>
    <p style="margin-top: 40px; color: #888; font-size: 14px;">— The FVC Team</p>
  </div>
</body>
</html>`,
    text: `You're Invited to THEFVC.IS!\n\nHello ${displayName || "there"},\n\nYou've been invited to join THEFVC.IS, the Film Video Collective.\n${role ? `Your role: ${role}\n` : ""}Click the link below to accept your invite:\n\n${inviteUrl}\n\nThis invite is valid for 7 days. If you don't accept, it will expire automatically.\n\n— The FVC Team`,
  };
}

/**
 * Invoice follow-up reminder.
 * Context: { tone, publicId, recipientName, amountDue, dueDate, daysOverdue,
 *            hostedInvoiceUrl, productionTitle, replyTo }
 *
 * Deliberately plain and short. Every reminder states the invoice number and
 * the amount, and every reminder offers a human to reply to — a collections
 * email with no escape hatch is how you lose a member over a billing mistake.
 *
 * Note: this template must NEVER receive internalNote. That field is
 * admin-only and there is a test asserting it stays out of email bodies.
 */
export function invoiceReminderTemplate(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const {
    tone = "neutral",
    publicId,
    recipientName,
    amountDue,
    dueDate,
    daysOverdue = 0,
    hostedInvoiceUrl,
    productionTitle,
    replyTo,
  } = ctx;

  const firstName = String(recipientName || "there").split(" ")[0];

  const subjects: Record<string, string> = {
    friendly: `Invoice ${publicId} from The FVC — due ${dueDate}`,
    neutral: `Invoice ${publicId} is past due`,
    firm: `Second notice: invoice ${publicId}, ${daysOverdue} days past due`,
    final: `Final notice — invoice ${publicId}`,
  };

  const leads: Record<string, string> = {
    friendly: "Quick heads-up that this invoice is due in a few days.",
    neutral: "This invoice is now past due. Here's the link to settle it.",
    firm: `This invoice is ${daysOverdue} days past due. Please arrange payment, or let us know if something's blocking it.`,
    final: `This invoice is ${daysOverdue} days past due and this is the last automated reminder we'll send. Please pay, or contact us directly so we can work something out.`,
  };

  const subject = subjects[tone] || subjects.neutral;
  const lead = leads[tone] || leads.neutral;
  const contact = replyTo || "the FVC team";

  return {
    subject,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;">
    <h1 style="color: #d4af37; margin-top: 0; font-size: 22px;">Invoice ${publicId}</h1>
    <p>Hi ${firstName},</p>
    <p>${lead}</p>
    <table style="width: 100%; margin: 24px 0; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #888;">Invoice</td><td style="padding: 6px 0; text-align: right;"><strong>${publicId}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #888;">Amount due</td><td style="padding: 6px 0; text-align: right;"><strong style="color: #d4af37; font-size: 18px;">${amountDue}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #888;">Due date</td><td style="padding: 6px 0; text-align: right;">${dueDate}</td></tr>
      ${productionTitle ? `<tr><td style="padding: 6px 0; color: #888;">Production</td><td style="padding: 6px 0; text-align: right;">${productionTitle}</td></tr>` : ""}
    </table>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${hostedInvoiceUrl}" style="display: inline-block; background: #d4af37; color: #0a0a0a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Pay Invoice</a>
    </p>
    <p style="color: #aaa; font-size: 14px;">If you've already paid, or this doesn't look right, just reply to this email and ${contact} will sort it out.</p>
    <p style="margin-top: 40px; color: #888; font-size: 14px;">— The Film Video Collective</p>
  </div>
</body>
</html>`,
    text: `${subject}

Hi ${firstName},

${lead}

  Invoice:     ${publicId}
  Amount due:  ${amountDue}
  Due date:    ${dueDate}
${productionTitle ? `  Production:  ${productionTitle}\n` : ""}
Pay online: ${hostedInvoiceUrl}

If you've already paid, or this doesn't look right, just reply to this email
and ${contact} will sort it out.

— The Film Video Collective`,
  };
}
