/**
 * Minimal Mailgun sending helper using Node's built-in fetch (no dependency).
 * Requires MAILGUN_API_KEY, MAILGUN_DOMAIN and MAILGUN_FROM in the environment.
 */

export function isMailgunConfigured() {
  return Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && process.env.MAILGUN_FROM);
}

/**
 * Compose the `from` header. MAILGUN_FROM may be a bare address or a full
 * "Display Name <address>" string; in the former case the display name is
 * taken from `senderName` (falling back to "HR Team").
 */
export function mailgunFrom(senderName) {
  const from = process.env.MAILGUN_FROM || '';
  if (from.includes('<')) return from;
  const name = (senderName || '').trim() || 'HR Team';
  return `${name} <${from}>`;
}

/**
 * Send a plain-text email through the Mailgun Messages API.
 * Returns the Mailgun message id on success; throws on any failure.
 */
export async function sendMail({ to, subject, text, senderName }) {
  if (!isMailgunConfigured()) {
    throw new Error('Mailgun is not configured (MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_FROM missing).');
  }

  const form = new FormData();
  form.append('from', mailgunFrom(senderName));
  form.append('to', to);
  form.append('subject', subject);
  form.append('text', text);

  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const auth = 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64');

  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: { Authorization: auth },
    body: form,
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error('[mailgun] Send failed:', res.status, bodyText);
    throw new Error(`Mailgun rejected the email (HTTP ${res.status}). ${bodyText}`);
  }

  let body = {};
  try {
    body = JSON.parse(bodyText);
  } catch {
    // non-JSON response — ignore
  }
  return body?.id || 'sent';
}
