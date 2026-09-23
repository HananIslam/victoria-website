const TO = [
  'Victoria@victoriaverlezzaphd.com',
  'ihanan218@gmail.com',
];

const INTEREST_LABELS = {
  keynote: 'Keynote',
  workshop: 'Workshop',
  consulting: 'Consulting',
  other: 'Something else',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service is not configured.' });
  }

  const body = readBody(req);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const organization = String(body.organization || '').trim();
  const message = String(body.message || '').trim();
  const interest = String(body.interest || '').trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!name || !email || !emailOk.test(email) || !message) {
    return res.status(400).json({ error: 'Please fill in name, email, and message.' });
  }

  if (String(body.company || '').trim()) {
    // Honeypot — treat as success without sending.
    return res.status(200).json({ ok: true });
  }

  const interestLabel = INTEREST_LABELS[interest] || interest || 'Not specified';
  const from =
    process.env.RESEND_FROM ||
    'Victoria Verlezza Website <noreply@assessment.victoriaverlezza.com>';

  const text = [
    'New enquiry from victoriaverlezza.com',
    '',
    `Interest: ${interestLabel}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Organization: ${organization || '—'}`,
    '',
    'Message:',
    message,
  ].join('\n');

  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#1E1B18">
      <p style="margin:0 0 1rem;font-size:1.05rem"><strong>New enquiry</strong> from victoriaverlezza.com</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px">
        <tr><td style="padding:.35rem 0;color:#5A5249;width:8rem">Interest</td><td style="padding:.35rem 0">${escapeHtml(interestLabel)}</td></tr>
        <tr><td style="padding:.35rem 0;color:#5A5249">Name</td><td style="padding:.35rem 0">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:.35rem 0;color:#5A5249">Email</td><td style="padding:.35rem 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:.35rem 0;color:#5A5249">Organization</td><td style="padding:.35rem 0">${escapeHtml(organization || '—')}</td></tr>
      </table>
      <p style="margin:1.25rem 0 .35rem;color:#5A5249">Message</p>
      <p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: TO,
        reply_to: email,
        subject: `Website enquiry: ${interestLabel} — ${name}`,
        text,
        html,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Resend error', response.status, data);
      return res.status(502).json({
        error: data.message || 'Could not send the enquiry. Please try again.',
      });
    }

    return res.status(200).json({ ok: true, id: data.id });
  } catch (err) {
    console.error('Contact form send failed', err);
    return res.status(500).json({ error: 'Could not send the enquiry. Please try again.' });
  }
};
