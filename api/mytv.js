 
const { createServer } = require('http');
const { parse } = require('url');
const { join } = require('path');
const fetch = require('node-fetch');
const { createReadStream } = require('fs');

const allowedDomains = [
  'aktv.top',
  'php.jdshipin.com',
  'cdn12.jdshipin.com',
  'v2h.jdshipin.com',
  'v2hcdn.jdshipin.com',
  'cdn.163189.xyz',
  'cdn2.163189.xyz',
  'cdn3.163189.xyz',
  'cdn5.163189.xyz',
  'cdn9.163189.xyz'
];

module.exports = async (req, res) => {
  const { query } = parse(req.url, true);
  const requestUrl = query.url ? decodeURIComponent(query.url) : '';
  
  // 验证 URL 参数
  if (!requestUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  // 解析并验证域名
  const parsedUrl = new URL(requestUrl);
  if (!allowedDomains.includes(parsedUrl.hostname)) {
    res.status(403).send('Invalid domain');
    return;
  }

  try {
    // 构建请求头
    const headers = {
      'Host': parsedUrl.hostname,
      'User-Agent': 'AppleCoreMedia/1.0.0.7B367 (iPad; U; CPU OS 4_3_3 like Mac OS X)',
      'Referer': `https://${parsedUrl.hostname}/`,
      'Accept-Encoding': 'gzip, deflate'
    };

    // 复制原始请求头（排除 Host）
    for (const key in req.headers) {
      if (key.toLowerCase() !== 'host') {
        headers[key] = req.headers[key];
      }
    }

    // 发起代理请求
    const response = await fetch(requestUrl, {
      method: req.method,
      headers: headers,
      body: req.method === 'POST' ? req : undefined,
      redirect: 'manual',
      compress: false
    });

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, parsedUrl.origin).href;
        res.writeHead(response.status, {
          'Location': `/api/mytv?url=${encodeURIComponent(redirectUrl)}`
        });
        res.end();
        return;
      }
    }

    // 设置响应头
    const responseHeaders = {
      'Content-Type': response.headers.get('Content-Type')
    };
    
    // 处理 M3U8 文件
    if (requestUrl.includes('.m3u8') || responseHeaders['Content-Type']?.includes('application/vnd.apple.mpegurl')) {
      responseHeaders['Content-Disposition'] = 'inline; filename=index.m3u8';
      const baseUrl = new URL(requestUrl).origin;
      const allowedRegex = new RegExp(`https?:\\/\\/(?:${allowedDomains.join('|')})\\/[^\\s"']+\\.ts`);

      let body = await response.text();
      body = body.replace(/(https?:\/\/[^\s"']+\.ts)|([^\s"']+\.ts)/g, (match, absolute, relative) => {
        const tsUrl = absolute ? match : new URL(join(baseUrl, match), baseUrl).href;
        return `/api/mytv?url=${encodeURIComponent(tsUrl)}`;
      });

      res.writeHead(response.status, responseHeaders);
      res.end(body);
      return;
    }

    // 流式传输其他类型内容
    res.writeHead(response.status, responseHeaders);
    response.body.pipe(res);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Internal Server Error');
  }
};
 
