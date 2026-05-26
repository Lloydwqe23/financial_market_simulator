(async () => {
  const port = process.env.API_PORT || '8787';
  const host = process.env.API_HOST || '127.0.0.1';
  const base = `http://${host}:${port}`;
  try {
    console.log('REGISTER');
    let r = await fetch(base + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'secret' }),
    });
    console.log('register', r.status, await r.text());

    console.log('LOGIN');
    r = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'secret' }),
    });
    const data = await r.json();
    console.log('login', r.status, data);
    const token = data.token;

    console.log('WHOAMI');
    r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
    console.log('me', r.status, await r.text());

    console.log('GET PORTFOLIO');
    r = await fetch(base + '/api/portfolio', { headers: { Authorization: 'Bearer ' + token } });
    console.log('portfolio', r.status, await r.text());

    console.log('SAVE PORTFOLIO');
    r = await fetch(base + '/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ balance: 9000, holdings: [], transactions: [], lastMessage: 'test' }),
    });
    console.log('save', r.status, await r.text());

    console.log('GET PORTFOLIO 2');
    r = await fetch(base + '/api/portfolio', { headers: { Authorization: 'Bearer ' + token } });
    console.log('portfolio2', r.status, await r.text());
  } catch (e) {
    console.error('error', e);
  }
})();
