// Site-wide passcode gate. Runs on Netlify's edge, in front of every request
// (the HTML, the JS/CSS bundle, everything) — nothing is served until the
// visitor enters the code stored in the SITE_PASSWORD environment variable
// (Netlify → Site configuration → Environment variables). The password itself
// is never committed to the repo and never reaches the browser: only a
// SHA-256 hash of it is kept, in a cookie, after a correct entry.
//
// If SITE_PASSWORD is not set, the gate does nothing (site behaves as before) —
// so forgetting to configure it never locks everyone out by accident.

const COOKIE_NAME = "nk_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function loginPage(wrongCode: boolean): Response {
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NORTHKAIRN – Zugang</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060b16;color:#e2e8f0;font-family:-apple-system,"SF Pro Text",Inter,sans-serif}
  form{background:#0b1220;border:1px solid rgba(148,163,184,.15);border-radius:16px;padding:32px;width:280px;box-shadow:0 30px 60px -30px rgba(0,0,0,.9)}
  h1{font-size:15px;font-weight:600;margin:0 0 4px}
  p{font-size:12.5px;color:#94a3b8;margin:0 0 18px}
  input{width:100%;box-sizing:border-box;height:40px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:rgba(255,255,255,.03);color:#e2e8f0;padding:0 12px;font-size:14px;letter-spacing:2px;text-align:center}
  input:focus{outline:none;border-color:rgba(34,211,238,.55)}
  button{margin-top:12px;width:100%;height:38px;border:0;border-radius:10px;background:#22d3ee;color:#04141a;font-weight:600;font-size:13px;cursor:pointer}
  .err{color:#fb7185;font-size:12px;margin-top:10px}
</style></head>
<body>
  <form method="POST" action="/__auth">
    <h1>NORTHKAIRN</h1>
    <p>Bitte Zugangscode eingeben</p>
    <input name="code" type="password" autofocus autocomplete="off" />
    <button type="submit">Weiter</button>
    ${wrongCode ? `<div class="err">Falscher Code, bitte erneut versuchen.</div>` : ""}
  </form>
</body></html>`;
  return new Response(html, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}

export default async (req: Request, context: { next: () => Promise<Response> }) => {
  const url = new URL(req.url);
  const password = Netlify.env.get("SITE_PASSWORD");

  if (!password) return context.next(); // not configured yet → don't lock everyone out

  const expected = await sha256(password);

  if (url.pathname === "/__auth" && req.method === "POST") {
    const form = await req.formData();
    const code = String(form.get("code") ?? "");
    if (code && (await sha256(code)) === expected) {
      const res = new Response(null, { status: 303, headers: { location: "/" } });
      res.headers.append("set-cookie", `${COOKIE_NAME}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
      return res;
    }
    return loginPage(true);
  }

  if (getCookie(req, COOKIE_NAME) === expected) return context.next();

  return loginPage(false);
};

export const config = { path: "/*" };
