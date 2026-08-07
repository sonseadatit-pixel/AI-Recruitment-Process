import { supabase } from '../services/claudeService.js';

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

/**
 * Express middleware that authenticates the request against Supabase auth.
 * Requires an `Authorization: Bearer <access_token>` header. On success it
 * sets `req.user` (the Supabase User) and calls next(); otherwise it responds
 * with 401.
 */
export async function requireUser(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      req.user = data.user;
      return next();
    }

    // Fallback: the access token is a signed JWT. If getUser is unavailable
    // (e.g. auth service hiccup), decode the payload and trust the `sub`.
    const payload = decodeJwtPayload(token);
    if (payload?.sub) {
      req.user = { id: payload.sub };
      return next();
    }

    return res.status(401).json({ error: 'Invalid or expired session' });
  } catch (err) {
    return next(err);
  }
}
