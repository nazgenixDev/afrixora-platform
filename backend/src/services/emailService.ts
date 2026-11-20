import { Resend } from 'resend';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

export async function sendUpgradeRequestEmail({
  tenantId, tenantName, requestedPlan, adminEmail,
}: { tenantId: string; tenantName: string; requestedPlan: string; adminEmail: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    logger.warn('subscription_email_unconfigured', { tenantId });
    throw new AppError('Le service de demande de changement de plan est indisponible.', 503, 'UPGRADE_REQUEST_UNAVAILABLE');
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: adminEmail,
    subject: 'Demande de changement de plan AFRIXORA',
    text: `Le client « ${tenantName} » souhaite passer au plan ${requestedPlan}. Connectez-vous à AFRIXORA pour examiner la demande.`,
  }).catch(() => null);
  if (!result?.data?.id || result.error) {
    logger.warn('subscription_email_failed', { tenantId });
    throw new AppError('La demande n’a pas pu être transmise.', 502, 'UPGRADE_REQUEST_FAILED');
  }
}
