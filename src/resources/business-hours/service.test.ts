import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessHoursServiceImpl } from './service';
import type { BusinessHoursRepository } from './contracts';

const context = { userId: 10, role: 'business' as const };

const repository: BusinessHoursRepository = {
  async getBusinessHours() { return []; },
  async getPublicBusinessHours() { return []; },
  async replaceBusinessHours(_context, input) {
    return input.hours.map((entry, index) => ({
      id: index + 1,
      businessId: input.businessId,
      dayOfWeek: entry.dayOfWeek,
      isClosed: entry.isClosed,
      openTime: entry.openTime ?? null,
      closeTime: entry.closeTime ?? null,
      createdBy: context.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  },
};

test('Business Hours accepts an empty schedule', async () => {
  const service = new BusinessHoursServiceImpl(repository);
  assert.deepEqual(await service.replaceBusinessHours(context, { businessId: 1, hours: [] }), []);
});

test('Business Hours accepts bounded open and closed rows', async () => {
  const service = new BusinessHoursServiceImpl(repository);
  const rows = await service.replaceBusinessHours(context, {
    businessId: 1,
    hours: [
      { dayOfWeek: 1, isClosed: false, openTime: '08:00', closeTime: '17:00' },
      { dayOfWeek: 6, isClosed: true },
    ],
  });
  assert.equal(rows.length, 2);
});

test('Business Hours rejects duplicate days', async () => {
  const service = new BusinessHoursServiceImpl(repository);
  await assert.rejects(
    service.replaceBusinessHours(context, {
      businessId: 1,
      hours: [
        { dayOfWeek: 1, isClosed: true },
        { dayOfWeek: 1, isClosed: false, openTime: '08:00', closeTime: '17:00' },
      ],
    }),
    /Duplicate Business Hours days are not allowed/,
  );
});

test('Business Hours rejects invalid time state', async () => {
  const service = new BusinessHoursServiceImpl(repository);
  await assert.rejects(
    service.replaceBusinessHours(context, {
      businessId: 1,
      hours: [{ dayOfWeek: 1, isClosed: false, openTime: '17:00', closeTime: '08:00' }],
    }),
    /must close after opening/,
  );
});

test('Business Hours rejects more than seven rows', async () => {
  const service = new BusinessHoursServiceImpl(repository);
  await assert.rejects(
    service.replaceBusinessHours(context, {
      businessId: 1,
      hours: Array.from({ length: 8 }, (_, dayOfWeek) => ({ dayOfWeek, isClosed: true })),
    }),
    /maximum of seven/,
  );
});
