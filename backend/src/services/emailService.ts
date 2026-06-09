import { Resend } from 'resend';
import { z } from 'zod';
import logger from '../utils/logger';

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  logger.warn('RESEND_API_KEY is not set — email service will be disabled');
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
});

const resetEmailSchema = z.object({
  to: z.string().email(),
  resetToken: z.string().min(1),
});

const FROM = 'AFRIXORA <noreply@afrixora.cd>';

export const emailService = {
  async sendAlertEmail(to: string, subject: string, html: string) {
    const { to: validatedTo, subject: validatedSubject, html: validatedHtml } = emailSchema.parse({ to, subject, html });

    if (!resend) {
      logger.warn('Email skipped (RESEND_API_KEY not configured)', { to: validatedTo, subject: validatedSubject });
      return { success: false, reason: 'RESEND_API_KEY_NOT_CONFIGURED' };
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [validatedTo],
      subject: validatedSubject,
      html: validatedHtml,
    });

    if (error) {
      logger.error('Failed to send alert email', { to: validatedTo, subject: validatedSubject, error: error.message });
      throw new Error(`Failed to send alert email: ${error.message}`);
    }

    logger.info('Alert email sent', { to: validatedTo, subject: validatedSubject, id: data?.id });
    return { success: true, id: data?.id };
  },

  async sendPasswordResetEmail(to: string, resetToken: string) {
    const { to: validatedTo, resetToken: validatedToken } = resetEmailSchema.parse({ to, resetToken });

    const subject = 'Réinitialisation de votre mot de passe AFRIXORA';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a56db;">AFRIXORA — Réinitialisation du mot de passe</h2>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p>Utilisez le token ci-dessous pour définir un nouveau mot de passe :</p>
        <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 18px; text-align: center; letter-spacing: 2px;">
          ${validatedToken}
        </div>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
          Ce token expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
        </p>
      </div>
    `;

    return this.sendAlertEmail(validatedTo, subject, html);
  },
};

export default emailService;
