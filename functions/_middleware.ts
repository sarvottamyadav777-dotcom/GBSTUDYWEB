const BAD_BOT_UA_RE =
  /(^$|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|scrapy|go-http-client|java\/|okhttp|ruby|perl|php\/|nikto|sqlmap|nmap|masscan|headlesschrome|phantomjs|puppeteer|playwright|selenium|zgrab|censys|shodan)/i;

const SCANNER_PATH_RE =
  /^\/(\.env|\.git|wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|pma|cgi-bin|\.htaccess|\.aws)/i;

interface CloudflareRequest extends Request {
  cf?: {
    botManagement?: {
      score?: number;
      verifiedBot?: boolean;
    };
  };
}

function renderBotChallengeHtml(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Security Check — GB STUDY</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#04060d;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif}
    .box{width:min(92vw,400px);padding:28px;border-radius:20px;background:rgba(10,16,34,.95);border:1px solid rgba(0,229,255,.4);box-shadow:0 24px 60px rgba(0,0,0,.7),0 0 32px rgba(0,229,255,.15);text-align:center}
    .ring{width:46px;height:46px;margin:0 auto 16px;border-radius:50%;border:3px solid rgba(0,229,255,.2);border-top-color:#00e5ff;animation:spin .9s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{margin:0 0 8px;font-size:18px}
    p{margin:0 0 18px;font-size:13px;color:#94a3b8}
    button{cursor:pointer;border:0;border-radius:999px;padding:10px 22px;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,#0ea5e9,#7c3aed)}
  </style>
</head>
<body>
  <div class="box">
    <div class="ring"></div>
    <h1>Checking browser security</h1>
    <p>GB STUDY Cloudflare Bot Shield aapke browser ko verify kar raha hai...</p>
    <button type="button" onclick="verifyHuman()">Verify you are human</button>
  </div>
  <script>
    function verifyHuman(){
      document.cookie="__gb_cf_human=1; path=/; max-age=43200; SameSite=Lax";
      location.reload();
    }
    setTimeout(verifyHuman, 700);
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 403,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequest(context: {
  request: CloudflareRequest;
  next: () => Promise<Response>;
}): Promise<Response> {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';

  if (SCANNER_PATH_RE.test(url.pathname)) {
    return new Response('Blocked by Cloudflare Security Shield.', { status: 403 });
  }

  if ((url.pathname.startsWith('/api/') || url.pathname.startsWith('/download/')) && BAD_BOT_UA_RE.test(ua)) {
    return new Response(
      JSON.stringify({ error: 'Automated bot traffic blocked by GB STUDY Bot Shield.' }),
      {
        status: 403,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      },
    );
  }

  // Native Cloudflare Bot Management enforcement when running on Cloudflare Edge
  const botScore = request.cf?.botManagement?.score;
  const verifiedBot = request.cf?.botManagement?.verifiedBot;
  const cookies = request.headers.get('cookie') || '';
  if (
    typeof botScore === 'number' &&
    botScore > 0 &&
    botScore < 30 &&
    !verifiedBot &&
    !cookies.includes('__gb_cf_human=1') &&
    !url.pathname.startsWith('/api/')
  ) {
    return renderBotChallengeHtml();
  }

  const response = await next();
  const res = new Response(response.body, response);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return res;
}
