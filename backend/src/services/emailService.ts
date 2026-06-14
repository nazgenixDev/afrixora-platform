import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendUpgradeRequestEmail = async (adminEmail: string, tenantName: string, requestedPlan: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return;
  }
  await resend.emails.send({
    from: 'AFRIXORA <noreply@afrixora.cd>',
    to: adminEmail,
    subject: `Demande de changement de plan - ${tenantName}`,
    html: `<h2>Demande de changement de plan</h2>
           <p>Le client <strong>${tenantName}</strong> souhaite passer au plan <strong>${requestedPlan}</strong>.</p>
           <p>Connectez-vous à la plateforme pour approuver ce changement.</p>`,
  });
};
