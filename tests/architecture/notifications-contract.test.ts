import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchRoutePolicy } from '../../server/authorization/routes.js';

test('notification management routes have explicit authorization policies', () => {
  assert.equal(matchRoutePolicy('GET', '/notifications/preferences')?.policy.permission, 'OPERATIONS_VIEW');
  assert.equal(matchRoutePolicy('PATCH', '/notifications/preferences')?.policy.permission, 'OPERATIONS_VIEW');
  assert.equal(matchRoutePolicy('POST', '/notifications/notice_1/acknowledge')?.policy.resource, 'notification');
  assert.equal(matchRoutePolicy('POST', '/notifications/broadcast')?.policy.permission, 'NOTIFICATION_MANAGE');
  assert.equal(matchRoutePolicy('POST', '/notifications/broadcast')?.policy.audit, true);
  assert.equal(matchRoutePolicy('POST', '/notifications/provider-send'), undefined);
});
