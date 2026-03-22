// Netlify Function: מופעלת אוטומטית כשנשלח טופס
// שולחת הודעת WhatsApp לבעל העסק דרך CallMeBot API (חינמי)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data    = JSON.parse(event.body);
    const fields  = data.payload?.data || {};

    const name    = fields.fullname || '';
    const company = fields.company  || '';
    const phone   = fields.phone    || '';
    const email   = fields.email    || '';
    const service = fields.service  || '';
    const message = fields.message  || '';

    let text = `📬 פנייה חדשה מהאתר!\n\n`;
    text += `👤 שם: ${name}\n`;
    if (company) text += `🏢 חברה: ${company}\n`;
    text += `📞 טלפון: ${phone}\n`;
    if (email)   text += `✉️ מייל: ${email}\n`;
    if (service) text += `🔧 תחום: ${service}\n`;
    if (message) text += `\n💬 פרטים: ${message}`;

    const ownerPhone = process.env.OWNER_PHONE;   // e.g. 972548138800
    const apiKey     = process.env.CALLMEBOT_KEY; // המפתח מ-CallMeBot

    if (!ownerPhone || !apiKey) {
      console.log('Missing OWNER_PHONE or CALLMEBOT_KEY env vars');
      return { statusCode: 200, body: 'OK (no WA configured)' };
    }

    const url = `https://api.callmebot.com/whatsapp.php?phone=${ownerPhone}&text=${encodeURIComponent(text)}&apikey=${apiKey}`;
    await fetch(url);

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('form-submission error:', err);
    return { statusCode: 200, body: 'OK' }; // לא נכשיל את הטופס
  }
};
