async function sendEmail(email, subject, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'ResumeFit <onboarding@resend.dev>',
      to: [email],
      subject,
      text
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

async function sendVerificationCode(email, code) {
  await sendEmail(
    email,
    `Your ResumeFit verification code: ${code}`,
    `Your ResumeFit verification code is: ${code}\n\nThis code expires in 15 minutes.`
  );
}

async function sendPasswordResetCode(email, code) {
  await sendEmail(
    email,
    `Your ResumeFit password reset code: ${code}`,
    `Someone (hopefully you) requested a password reset for your ResumeFit account.\n\nYour reset code is: ${code}\n\nThis code expires in 15 minutes. If you didn't request this, you can safely ignore this email.`
  );
}

module.exports = { sendVerificationCode, sendPasswordResetCode };
