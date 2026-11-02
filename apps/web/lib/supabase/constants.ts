/**
 * Fixed auth cookie name. By default Supabase derives it from the URL's
 * hostname, but the server (Docker: host.docker.internal) and the browser
 * (127.0.0.1) reach Supabase through different hostnames, so the names would
 * differ and sessions would break.
 */
export const AUTH_COOKIE_NAME = 'sb-viraler-auth-token';
