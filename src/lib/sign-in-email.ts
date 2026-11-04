// The sign-in email: sender, subject, HTML and plain text for one sign-in link.
// The look follows the mockup «Письмо 2. Как приложение, текст из письма 1»
// (https://claude.ai/artifact/ToG5gdWDXejyzR6etkFsKR, project/MailDark.dc.html).
//
// Mail programs understand neither CSS variables, Tailwind nor oklch(), so the HTML is tables with
// inline styles, and the colors are copies of the values in src/app/tokens.css. Backgrounds are set
// both as an attribute and as a style: mail programs repaint them less often that way.

// The same sender everywhere: in Mailpit the address decides nothing.
export const SIGN_IN_EMAIL_FROM = '"Личная CRM" <noreply@mail.crm.whobook.ru>';

// Copies of src/app/tokens.css.
const colors = {
  forest: "#24392f", // --color-forest
  lineDark: "#4d6b5b", // --color-line-dark
  cream: "#f3ead6", // --color-cream
  gold: "#e6c46a", // --color-gold
  mutedDark: "#d9d1bd", // --color-muted-dark
  mutedDark2: "#b9c7b8", // --color-muted-dark-2
  rust: "#b84a27", // --color-rust, oklch(0.55 0.15 38) in hex
  rustInk: "#fbf3e2", // --color-rust-ink
};

// Oswald and PT Serif load only where the mail program allows web fonts; Gmail shows Arial and Georgia.
const displayFont = "Oswald, 'Arial Narrow', Arial, Helvetica, sans-serif";
const textFont = "'PT Serif', Georgia, 'Times New Roman', serif";

const texts = {
  subject: "Вход в Личную CRM",
  preview: "Ссылка для входа работает 15 минут",
  title: "Вход в Личную CRM",
  intro: "Нажмите кнопку, чтобы войти. Ссылка работает 15 минут и только один раз.",
  button: "Войти",
  fallback: "Кнопка не открывается? Скопируйте ссылку в браузер:",
  ignore: "Если вы не запрашивали вход - просто проигнорируйте письмо",
  footer: "Личная CRM · app.whobook.ru",
};

export type SignInEmail = { from: string; subject: string; html: string; text: string };

export function signInEmail(url: string): SignInEmail {
  return { from: SIGN_IN_EMAIL_FROM, subject: texts.subject, html: renderHtml(url), text: renderText(url) };
}

function renderHtml(url: string) {
  const href = escapeHtml(url);
  // Fillers after the preview line keep the inbox from showing the email's other words next to it.
  const previewFiller = "&#847;&zwnj;&nbsp;".repeat(40);

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${texts.subject}</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&amp;family=PT+Serif:wght@400;700&amp;display=swap" rel="stylesheet">
<style>
  @media (max-width: 480px) {
    .card { padding: 28px 22px !important; }
    .title { font-size: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${colors.forest};" bgcolor="${colors.forest}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${texts.preview}${previewFiller}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.forest}" style="background-color:${colors.forest};">
<tr>
<td align="center" style="padding:36px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.forest}" style="max-width:600px;background-color:${colors.forest};border:2px solid ${colors.gold};border-radius:8px;">
<tr>
<td style="padding:5px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${colors.gold};border-radius:4px;">
<tr>
<td class="card" style="padding:40px 44px;color:${colors.cream};font-family:${textFont};font-size:17px;line-height:1.55;text-align:left;">
<p style="margin:0 0 18px;font-family:${displayFont};font-weight:500;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${colors.gold};">Личная CRM</p>
<h1 class="title" style="margin:0 0 18px;font-family:${displayFont};font-weight:700;font-size:34px;line-height:1.05;text-transform:uppercase;color:${colors.cream};">${texts.title}</h1>
<p style="margin:0 0 22px;color:${colors.mutedDark};">${texts.intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
<tr>
<td bgcolor="${colors.rust}" style="background-color:${colors.rust};border-radius:4px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:15px 36px;border-radius:4px;background-color:${colors.rust};color:${colors.rustInk};font-family:${displayFont};font-weight:500;font-size:16px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;">${texts.button}</a>
</td>
</tr>
</table>
<p style="margin:0 0 18px;font-size:14px;color:${colors.mutedDark2};">${texts.fallback} <a href="${href}" target="_blank" style="color:${colors.gold};word-break:break-all;">${href}</a></p>
<div style="margin:0 0 18px;border-top:1px solid ${colors.lineDark};font-size:0;line-height:0;">&nbsp;</div>
<p style="margin:0;font-size:14px;color:${colors.mutedDark2};">${texts.ignore}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
<p style="max-width:600px;margin:16px auto 0;text-align:center;font-family:${displayFont};font-weight:500;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${colors.gold};">${texts.footer}</p>
</td>
</tr>
</table>
</body>
</html>
`;
}

function renderText(url: string) {
  return [
    texts.title,
    "",
    texts.intro,
    "",
    `${texts.button}: ${url}`,
    "",
    texts.fallback,
    url,
    "",
    texts.ignore,
    "",
    "--",
    texts.footer,
    "",
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
