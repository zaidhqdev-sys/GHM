import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  Review,
  ReviewRepository,
} from './contracts';
import { ReviewServiceImpl } from './service';

const customerContext: AuthContext = {
  userId: 1,
  role: 'customer',
};

const businessContext: AuthContext = {
  userId: 2,
  role: 'business',
};

const adminContext: AuthContext = {
  userId: 3,
  role: 'admin',
};

const review = (): Review => ({
  id: 1,
  businessId: 10,
  reviewerId: 1,
  reviewerName: 'Customer',
  rating: 5,
  title: 'Excellent service',
  body: 'Excellent service from this business.',
  moderationStatus: 'pending',
  moderationReason: null,
  moderatedBy: null,
  moderatedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements ReviewRepository {
  lastCreate: any = null;
  lastModeration: any = null;

  async createReview(_context: AuthContext, input: any) {
    this.lastCreate = input;
    return review();
  }

  async getOwnReview() {
    return review();
  }

  async getPublicReviews() {
    return [review()];
  }

  async getPendingReviews() {
    return [review()];
  }

  async moderateReview(
    _context: AuthContext,
    _reviewId: number,
    input: any,
  ) {
    this.lastModeration = input;

    return {
      ...review(),
      moderationStatus: input.decision,
      moderationReason:
        input.decision === 'rejected'
          ? input.rejectionReason
          : null,
      moderatedBy: adminContext.userId,
      moderatedAt: new Date(0),
    };
  }
}

test('Review creation normalizes input before repository call', async () => {
  const repository = new FakeRepository();
  const service = new ReviewServiceImpl(repository);

  await service.createReview(customerContext, {
    businessId: 10,
    rating: 5,
    title: '  Excellent service  ',
    body: '  Excellent service from this business.  ',
  });

  assert.deepEqual(repository.lastCreate, {
    businessId: 10,
    rating: 5,
    title: 'Excellent service',
    body: 'Excellent service from this business.',
  });
});

test('Review creation rejects invalid rating', async () => {
  const service = new ReviewServiceImpl(new FakeRepository());

  await assert.rejects(
    () =>
      service.createReview(customerContext, {
        businessId: 10,
        rating: 6,
        title: 'Valid title',
        body: 'Valid review body.',
      }),
    /rating must be an integer between 1 and 5/,
  );
});

test('Review creation rejects invalid text lengths', async () => {
  const service = new ReviewServiceImpl(new FakeRepository());

  await assert.rejects(
    () =>
      service.createReview(customerContext, {
        businessId: 10,
        rating: 5,
        title: 'ab',
        body: 'Valid review body.',
      }),
    /title must be between 3 and 120 characters/,
  );

  await assert.rejects(
    () =>
      service.createReview(customerContext, {
        businessId: 10,
        rating: 5,
        title: 'Valid title',
        body: 'too short',
      }),
    /body must be between 10 and 2000 characters/,
  );
});

test('Customer Review operations reject business and admin roles', async () => {
  const service = new ReviewServiceImpl(new FakeRepository());

  await assert.rejects(
    () =>
      service.createReview(businessContext, {
        businessId: 10,
        rating: 5,
        title: 'Valid title',
        body: 'Valid review body.',
      }),
    /Insufficient role/,
  );

  await assert.rejects(
    () => service.getOwnReview(businessContext, 1),
    /Insufficient role/,
  );

  await assert.rejects(
    () =>
      service.createReview(adminContext, {
        businessId: 10,
        rating: 5,
        title: 'Valid title',
        body: 'Valid review body.',
      }),
    /Insufficient role/,
  );

  await assert.rejects(
    () => service.getOwnReview(adminContext, 1),
    /Insufficient role/,
  );
});

test('Review moderation operations require admin role', async () => {
  const service = new ReviewServiceImpl(new FakeRepository());

  await assert.rejects(
    () => service.getPendingReviews(customerContext),
    /Insufficient role/,
  );

  await assert.rejects(
    () =>
      service.moderateReview(customerContext, 1, {
        decision: 'approved',
      }),
    /Insufficient role/,
  );

  await assert.rejects(
    () => service.getPendingReviews(businessContext),
    /Insufficient role/,
  );

  await assert.rejects(
    () =>
      service.moderateReview(businessContext, 1, {
        decision: 'approved',
      }),
    /Insufficient role/,
  );
});

test('Review moderation accepts approval without rejection reason', async () => {
  const repository = new FakeRepository();
  const service = new ReviewServiceImpl(repository);

  const result = await service.moderateReview(
    adminContext,
    1,
    {
      decision: 'approved',
    },
  );

  assert.equal(repository.lastModeration.decision, 'approved');
  assert.equal(repository.lastModeration.rejectionReason, null);
  assert.equal(result.moderationStatus, 'approved');
});

test('Review rejection requires a nonblank reason', async () => {
  const service = new ReviewServiceImpl(new FakeRepository());

  await assert.rejects(
    () =>
      service.moderateReview(adminContext, 1, {
        decision: 'rejected',
        rejectionReason: '   ',
      }),
    /rejectionReason must be between 1 and 2000 characters/,
  );
});

test('Review rejection normalizes the reason', async () => {
  const repository = new FakeRepository();
  const service = new ReviewServiceImpl(repository);

  const result = await service.moderateReview(
    adminContext,
    1,
    {
      decision: 'rejected',
      rejectionReason: '  Insufficient evidence  ',
    },
  );

  assert.equal(
    repository.lastModeration.rejectionReason,
    'Insufficient evidence',
  );
  assert.equal(result.moderationStatus, 'rejected');
  assert.equal(
    result.moderationReason,
    'Insufficient evidence',
  );
});

test('Review moderation rejects invalid decisions', async () => {
  const service = new ReviewServiceImpl(new FakeRepository());

  await assert.rejects(
    () =>
      service.moderateReview(adminContext, 1, {
        decision: 'pending' as never,
      }),
    /Invalid Review moderation decision/,
  );
});

test('Review IDs and public business IDs must be positive safe integers', async () => {
  const service = new ReviewServiceImpl(new FakeRepository());

  await assert.rejects(
    () => service.getOwnReview(customerContext, 0),
    /Invalid reviewId/,
  );

  await assert.rejects(
    () => service.getOwnReview(customerContext, -1),
    /Invalid reviewId/,
  );

  await assert.rejects(
    () => service.getPublicReviews(0),
    /Invalid businessId/,
  );
});

test('Review limits are bounded to the governed maximum', async () => {
  const repository = new FakeRepository();
  const service = new ReviewServiceImpl(repository);

  const publicReviews = await service.getPublicReviews(10, 1000);
  const pendingReviews = await service.getPendingReviews(
    adminContext,
    1000,
  );

  assert.equal(publicReviews.length, 1);
  assert.equal(pendingReviews.length, 1);
});

test('Public Review reads do not require an authenticated role', async () => {
  const repository = new FakeRepository();
  const service = new ReviewServiceImpl(repository);

  const result = await service.getPublicReviews(10);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
});
