const { HttpError, fail } = require('./common.js');
const {
  googleCallbackHandler,
  googleStartHandler,
  loginHandler,
  recoveryCallbackHandler,
  recoveryVerifierHandler,
  sessionHandler,
  signupHandler,
} = require('./auth-session.js');

const routes = new Map([
  ['login', loginHandler],
  ['session', sessionHandler],
  ['signup', signupHandler],
  ['google/callback', googleCallbackHandler],
  ['google/start', googleStartHandler],
  ['recovery/callback', recoveryCallbackHandler],
  ['recovery/verifier', recoveryVerifierHandler],
]);

function routeQuery(req) {
  const query = { ...(req.query || {}) };
  const route = query.route;
  delete query.route;
  req.query = query;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== undefined && item !== null) search.append(key, String(item));
    }
  }

  return { route, search };
}

async function authRouter(req, res) {
  const { route, search } = routeQuery(req);
  const handler = typeof route === 'string' ? routes.get(route) : null;
  if (!handler) {
    fail(res, new HttpError(404, 'Rute autentikasi tidak ditemukan.', 'auth_route_not_found'));
    return;
  }

  req.url = `/api/auth/${route}${search.size ? `?${search}` : ''}`;
  await handler(req, res);
}

module.exports = { authRouter };
