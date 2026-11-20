import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Browser, seed } from './harness.ts';

test('0005: tap buffer is delivered to everyone with /api/me; only the superadmin changes it, within limits, audited', async () => {
  const { env, clock, admin, A, studentA } = await seed();
  const guest = new Browser(env, clock, '10.7.7.7');
  assert.deepEqual((await guest.call('GET', '/api/me')).data, { user: null, app: { tapBufferTouch: 22, tapBufferMouse: 10 } });
  const put = (b: Browser, body: Record<string, unknown>) => b.call('PUT', '/api/app-settings', body);
  assert.equal((await put(A, { tapBufferTouch: 30, tapBufferMouse: 12 })).status, 403);
  assert.equal((await put(studentA, { tapBufferTouch: 30, tapBufferMouse: 12 })).status, 403);
  assert.equal((await put(guest, { tapBufferTouch: 30, tapBufferMouse: 12 })).status, 401);
  for (const bad of [{ tapBufferTouch: 7, tapBufferMouse: 10 }, { tapBufferTouch: 49, tapBufferMouse: 10 }, { tapBufferTouch: 22, tapBufferMouse: 31 }, { tapBufferTouch: 22.5, tapBufferMouse: 10 }, { tapBufferTouch: '30', tapBufferMouse: 10 }]) {
    assert.equal((await put(admin, bad)).data['error'], 'invalid_setting', JSON.stringify(bad));
  }
  assert.equal((await put(admin, { tapBufferTouch: 30, tapBufferMouse: 12 })).status, 200);
  assert.deepEqual((await guest.call('GET', '/api/me')).data['app'], { tapBufferTouch: 30, tapBufferMouse: 12 });
  assert.deepEqual((await studentA.call('GET', '/api/me')).data['app'], { tapBufferTouch: 30, tapBufferMouse: 12 });
  assert.equal((await put(admin, { tapBufferTouch: 48, tapBufferMouse: 4 })).status, 200, 'limits are inclusive');
  const audit = JSON.stringify((await admin.call('GET', '/api/audit')).data);
  assert.match(audit, /app_settings\.save/);
});
