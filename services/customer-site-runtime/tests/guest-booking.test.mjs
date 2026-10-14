import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createBooking } from '../lib/booking.mjs'

function fixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close())
  let now = new Date('2026-10-15T00:00:00Z')
  const booking = createBooking(db, { now: () => now, booking: { cancellationHours: 24, holdMinutes: 30 } })
  booking.saveService({ id: 'service', name: 'Synthetic session', durationMinutes: 60, creditCost: 1 })
  for (const [id, startsAt] of [['one', '2026-10-18T00:00:00Z'], ['two', '2026-10-19T00:00:00Z']]) booking.saveSlot({ id, serviceId: 'service', startsAt, resourceId: 'room' })
  const input = { name: 'Synthetic guest', email: 'fixture@example.invalid', phone: '0900000000', slotId: 'one', serviceId: 'service', idempotencyKey: 'random-guest-request' }
  return { db, booking, input, setNow: value => now = new Date(value) }
}
test('guest capability is hashed, isolated, absent from lists; retries preserve emailed links', t => {
  const f = fixture(t), result = f.booking.requestGuest(f.input)
  assert.match(result.accessToken, /^[a-f0-9]{64}$/)
  assert.equal(f.booking.getGuest(result.id, result.accessToken).id, result.id)
  assert.throws(() => f.booking.getGuest(result.id, 'f'.repeat(64)), e => e.status === 404)
  assert.throws(() => f.booking.getGuest('another', result.accessToken), e => e.status === 404)
  assert.equal(f.booking.listBookings()[0].accessToken, undefined)
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM booking_guest_access').all()).includes(result.accessToken), false)
  const retried = f.booking.requestGuest(f.input)
  assert.equal(retried.id, result.id); assert.notEqual(retried.accessToken, result.accessToken)
  assert.equal(f.booking.getGuest(result.id, result.accessToken).id, result.id)
})
test('guest can reschedule atomically, must reconfirm, can cancel without creating refund or credits', t => {
  const f = fixture(t), receipt = f.booking.requestGuest(f.input)
  const confirmed = f.booking.confirmGuest(receipt.id, { action: 'confirm' })
  const moved = f.booking.changeGuest(receipt.id, receipt.accessToken, { action: 'reschedule', slotId: 'two', version: confirmed.version })
  assert.equal(moved.status, 'pending_hold'); assert.equal(moved.slotId, 'two')
  assert.equal(f.booking.listSlots().find(s => s.id === 'one').available, true)
  assert.throws(() => f.booking.changeGuest(receipt.id, receipt.accessToken, { action: 'cancel', version: confirmed.version }), e => e.code === 'VERSION_CONFLICT')
  const cancelled = f.booking.changeGuest(receipt.id, receipt.accessToken, { action: 'cancel', version: moved.version })
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.paymentStatus, 'manual_required')
  assert.equal(f.booking.changeGuest(receipt.id, receipt.accessToken, { action: 'cancel', version: moved.version }).replayed, true)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM booking_credit_ledger').get().n, 0)
})
test('guest cannot extend holds, use stale/cancelled slots, forge payment or bypass cutoff', t => {
  const f = fixture(t), receipt = f.booking.requestGuest(f.input)
  f.setNow('2026-10-15T00:10:00Z')
  const moved = f.booking.changeGuest(receipt.id, receipt.accessToken, { action: 'reschedule', slotId: 'two', version: receipt.version })
  assert.equal(moved.holdExpiresAt, receipt.holdExpiresAt)
  assert.throws(() => f.booking.changeGuest(receipt.id, receipt.accessToken, { action: 'cancel', version: moved.version, paid: true }), e => e.code === 'PAYMENT_STATE_NOT_ACCEPTED')
  const confirmed = f.booking.confirmGuest(receipt.id, { action: 'confirm' })
  f.setNow('2026-10-18T23:00:00Z')
  assert.throws(() => f.booking.changeGuest(receipt.id, receipt.accessToken, { action: 'reschedule', slotId: 'one', version: confirmed.version }), e => e.code === 'RESCHEDULE_CUTOFF_PASSED')
  f.setNow('2026-10-21T00:00:00Z')
  assert.throws(() => f.booking.getGuest(receipt.id, receipt.accessToken), e => e.status === 404)
})
