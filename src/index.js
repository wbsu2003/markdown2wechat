import { pageHtml } from './page.js';
import pkg from '../package.json';
import markedSrc from './vendor/marked.umd.js.txt';
import hljsSrc from './vendor/highlight.min.js.txt';

const JS_HEADERS = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Cache-Control': 'public, max-age=86400',
};

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === '/' || pathname === '') {
      return new Response(pageHtml(pkg.version, pkg.releaseDate), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (pathname === '/vendor/marked.js') {
      return new Response(markedSrc, { headers: JS_HEADERS });
    }
    if (pathname === '/vendor/highlight.js') {
      return new Response(hljsSrc, { headers: JS_HEADERS });
    }

    return new Response('Not Found', { status: 404 });
  },
};
