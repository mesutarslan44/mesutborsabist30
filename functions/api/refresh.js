export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-refresh-key',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER || 'mesutarslan44';
  const repo = env.GITHUB_REPO || 'mesutborsabist30';
  const workflow = env.GITHUB_WORKFLOW || 'update-data.yml';
  const ref = env.GITHUB_REF || 'main';
  const requiredKey = env.REFRESH_API_KEY || '';

  if (!token) {
    return json(
      { ok: false, message: 'Sunucu ayari eksik: GITHUB_TOKEN tanimli degil.' },
      500
    );
  }

  if (requiredKey) {
    const supplied = request.headers.get('x-refresh-key') || '';
    if (!supplied || supplied !== requiredKey) {
      return json(
        { ok: false, message: 'Yenileme anahtari gerekli veya hatali.' },
        401
      );
    }
  }

  const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mesutborsabist30-refresh-endpoint',
    'Content-Type': 'application/json',
  };

  const dispatchRes = await fetch(dispatchUrl, {
    method: 'POST',
    headers: ghHeaders,
    body: JSON.stringify({ ref }),
  });

  if (!dispatchRes.ok) {
    const bodyText = await dispatchRes.text();
    return json(
      {
        ok: false,
        message: 'GitHub Actions tetiklenemedi.',
        detail: bodyText.slice(0, 500),
      },
      502
    );
  }

  await sleep(1500);

  const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=1`;
  const runsRes = await fetch(runsUrl, { headers: ghHeaders });

  if (!runsRes.ok) {
    return json({ ok: true, message: 'Analiz tetiklendi.', run_url: '' }, 200);
  }

  const runs = await runsRes.json();
  const run = Array.isArray(runs.workflow_runs) ? runs.workflow_runs[0] : null;

  return json(
    {
      ok: true,
      message: 'Analiz tetiklendi.',
      run_url: run ? run.html_url : '',
      run_id: run ? run.id : null,
      run_status: run ? run.status : null,
    },
    200
  );
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
