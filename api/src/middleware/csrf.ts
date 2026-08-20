/**
 * CSRF 防护（03-接口文档 §1.2）：
 *   Cookie 会话下所有非 GET 请求必须携带自定义头 `X-Requested-With: XMLHttpRequest`，
 *   服务端校验该头以拦截跨站表单提交。
 *
 * 豁免（文档明确）：
 *   - 登录回调  POST /api/auth/google/callback（OAuth 跳转，state 已做 CSRF）
 *   - Creem webhook（POST /api/webhooks/*，走 HMAC 签名校验）
 *
 * 注意：挂载在 express.json 之后、业务路由之前；webhooks router 挂载更早，
 * 原始 body 验签已处理，天然不经过本守卫。
 */

import type { RequestHandler } from 'express';
import { apiError } from '@avs/shared';

const EXEMPT_SUFFIX = '/auth/google/callback';
const EXEMPT_PREFIXES = ['/api/webhooks', '/webhooks'];

export const csrfGuard: RequestHandler = (req, _res, next) => {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const path = req.originalUrl.split('?')[0];
  if (path.endsWith(EXEMPT_SUFFIX)) return next();
  if (EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();
  if (req.get('x-requested-with') === 'XMLHttpRequest') return next();
  throw apiError(403, 'CSRF_REJECTED', 'X-Requested-With: XMLHttpRequest header required for non-GET requests');
};
