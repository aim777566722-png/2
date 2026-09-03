const API_URL = 'https://document-ai-api.aim777566722.workers.dev';

function doGet(e) {
  return proxyRequest_('GET', e);
}

function doPost(e) {
  return proxyRequest_('POST', e);
}

function proxyRequest_(method, e) {
  try {
    const route = getRoute_(e);
    const query = getQuery_(e);
    const url = API_URL + route + query;

    const options = {
      method: method,
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (method === 'POST') {
      options.payload = e && e.postData ? e.postData.contents : '{}';
    }

    const response = UrlFetchApp.fetch(url, options);
    const status = response.getResponseCode();
    const body = response.getContentText();

    return ContentService
      .createTextOutput(body || JSON.stringify({ success: false, error: 'الخادم أعاد استجابة فارغة', upstreamStatus: status }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: String(error && error.message ? error.message : error)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getRoute_(e) {
  const params = e && e.parameter ? e.parameter : {};
  let route = params.route || (e && e.pathInfo ? e.pathInfo : '/api/health');
  if (!route) route = '/api/health';
  if (route.charAt(0) !== '/') route = '/' + route;
  return route;
}

function getQuery_(e) {
  const params = e && e.parameter ? e.parameter : {};
  const route = params.route;
  if (!route) return e && e.queryString ? '?' + e.queryString : '';

  const parts = [];
  Object.keys(params).forEach(function(key) {
    if (key === 'route') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
  });
  return parts.length ? '?' + parts.join('&') : '';
}
