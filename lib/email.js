async function sendVerificationCode(email, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'ResumeFit <onboarding@resend.dev>',
      to: [email],
      subject: `Your ResumeFit verification code: ${code}`,
      text: `Your ResumeFit verification code is: ${code}\n\nThis code expires in 15 minutes.`
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

module.exports = { sendVerificationCode };
