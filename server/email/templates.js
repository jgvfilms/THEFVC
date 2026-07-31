"use strict";
/**
 * Email templates for THEFVC.IS.
 * Each template returns { subject, html, text } given a context object.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetTemplate = passwordResetTemplate;
exports.emailVerificationTemplate = emailVerificationTemplate;
exports.welcomeTemplate = welcomeTemplate;
exports.betaInviteTemplate = betaInviteTemplate;
/**
 * Password reset email template.
 * Context: { resetUrl, userHandle, userEmail }
 */
function passwordResetTemplate(ctx) {
    var resetUrl = ctx.resetUrl, userHandle = ctx.userHandle;
    return {
        subject: "Reset Your THEFVC.IS Password",
        html: "\n<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>Password Reset</title></head>\n<body style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;\">\n    <h1 style=\"color: #d4af37; margin-top: 0;\">Reset Your Password</h1>\n    <p>Hello ".concat(userHandle || "there", ",</p>\n    <p>You requested a password reset for your THEFVC.IS account. Click the button below to reset your password:</p>\n    <p style=\"text-align: center; margin: 30px 0;\">\n      <a href=\"").concat(resetUrl, "\" style=\"display: inline-block; background: #d4af37; color: #0a0a0a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;\">Reset Password</a>\n    </p>\n    <p>This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>\n    <p style=\"margin-top: 40px; color: #888; font-size: 14px;\">\u2014 The FVC Team</p>\n  </div>\n</body>\n</html>"),
        text: "Reset Your Password\n\nHello ".concat(userHandle || "there", ",\n\nYou requested a password reset for your THEFVC.IS account. Click the link below to reset your password:\n\n").concat(resetUrl, "\n\nThis link will expire in 1 hour. If you didn't request this, you can safely ignore this email.\n\n\u2014 The FVC Team"),
    };
}
/**
 * Email verification template.
 * Context: { verificationUrl, userHandle, userEmail }
 */
function emailVerificationTemplate(ctx) {
    var verificationUrl = ctx.verificationUrl, userHandle = ctx.userHandle;
    return {
        subject: "Verify Your Email for THEFVC.IS",
        html: "\n<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>Email Verification</title></head>\n<body style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;\">\n    <h1 style=\"color: #d4af37; margin-top: 0;\">Verify Your Email</h1>\n    <p>Hello ".concat(userHandle || "there", ",</p>\n    <p>Welcome to THEFVC.IS! Please verify your email address by clicking the button below:</p>\n    <p style=\"text-align: center; margin: 30px 0;\">\n      <a href=\"").concat(verificationUrl, "\" style=\"display: inline-block; background: #d4af37; color: #0a0a0a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;\">Verify Email</a>\n    </p>\n    <p>If you didn't create an account, you can safely ignore this email.</p>\n    <p style=\"margin-top: 40px; color: #888; font-size: 14px;\">\u2014 The FVC Team</p>\n  </div>\n</body>\n</html>"),
        text: "Verify Your Email\n\nHello ".concat(userHandle || "there", ",\n\nWelcome to THEFVC.IS! Please verify your email address by clicking the link below:\n\n").concat(verificationUrl, "\n\nIf you didn't create an account, you can safely ignore this email.\n\n\u2014 The FVC Team"),
    };
}
/**
 * Welcome email template (sent after signup/verification).
 * Context: { userHandle }
 */
function welcomeTemplate(ctx) {
    var userHandle = ctx.userHandle;
    return {
        subject: "Welcome to THEFVC.IS!",
        html: "\n<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>Welcome</title></head>\n<body style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;\">\n    <h1 style=\"color: #d4af37; margin-top: 0;\">Welcome to THEFVC.IS!</h1>\n    <p>Hello ".concat(userHandle || "there", ",</p>\n    <p>Welcome to the Film Video Collective. You're now part of a community of filmmakers, crew, and creators.</p>\n    <p>Here are a few things you can do to get started:</p>\n    <ul style=\"color: #ccc; line-height: 1.8;\">\n      <li>Complete your profile with your reel, skills, and availability</li>\n      <li>Browse the crew directory to find collaborators</li>\n      <li>Join productions and add credits to your profile</li>\n      <li>Share updates on the feed</li>\n    </ul>\n    <p style=\"margin-top: 40px; color: #888; font-size: 14px;\">\u2014 The FVC Team</p>\n  </div>\n</body>\n</html>"),
        text: "Welcome to THEFVC.IS!\n\nHello ".concat(userHandle || "there", ",\n\nWelcome to the Film Video Collective. You're now part of a community of filmmakers, crew, and creators.\n\nHere are a few things you can do to get started:\n- Complete your profile with your reel, skills, and availability\n- Browse the crew directory to find collaborators\n- Join productions and add credits to your profile\n- Share updates on the feed\n\n\u2014 The FVC Team"),
    };
}
/**
 * Beta invite email template.
 * Context: { inviteUrl, displayName, role }
 */
function betaInviteTemplate(ctx) {
    var inviteUrl = ctx.inviteUrl, displayName = ctx.displayName, role = ctx.role;
    return {
        subject: "You're Invited to THEFVC.IS",
        html: "\n<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>Beta Invite</title></head>\n<body style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 40px;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px; border: 1px solid #333;\">\n    <h1 style=\"color: #d4af37; margin-top: 0;\">You're Invited!</h1>\n    <p>Hello ".concat(displayName || "there", ",</p>\n    <p>You've been invited to join THEFVC.IS, the Film Video Collective.</p>\n    ").concat(role ? "<p>Your role: <strong>".concat(role, "</strong></p>") : "", "\n    <p style=\"text-align: center; margin: 30px 0;\">\n      <a href=\"").concat(inviteUrl, "\" style=\"display: inline-block; background: #d4af37; color: #0a0a0a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;\">Accept Invite</a>\n    </p>\n    <p>This invite is valid for 7 days. If you don't accept, it will expire automatically.</p>\n    <p style=\"margin-top: 40px; color: #888; font-size: 14px;\">\u2014 The FVC Team</p>\n  </div>\n</body>\n</html>"),
        text: "You're Invited to THEFVC.IS!\n\nHello ".concat(displayName || "there", ",\n\nYou've been invited to join THEFVC.IS, the Film Video Collective.\n").concat(role ? "Your role: ".concat(role, "\n") : "", "Click the link below to accept your invite:\n\n").concat(inviteUrl, "\n\nThis invite is valid for 7 days. If you don't accept, it will expire automatically.\n\n\u2014 The FVC Team"),
    };
}
