import type { AuthContext } from '../../auth/authorization';
import type {
  BusinessId,
  CommercialAccess,
  CommercialPaymentAttempt,
  CommercialRepository,
  CommercialService,
  CommercialSubscription,
  CommercialTrial,
  ActivateCommercialTrialInput,
  PrepareCommercialPaymentInput,
  ScheduleCommercialCancellationInput,
} from './contracts';

export class DefaultCommercialService implements CommercialService {
  constructor(private readonly repository: CommercialRepository) {}

  getCommercialAccess(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialAccess> {
    return this.repository.getCommercialAccess(context, businessId);
  }

  getCommercialSubscription(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialSubscription | null> {
    return this.repository.getCommercialSubscription(context, businessId);
  }

  activateCommercialTrial(
    context: AuthContext,
    input: ActivateCommercialTrialInput,
  ): Promise<CommercialTrial> {
    return this.repository.activateCommercialTrial(context, input);
  }

  prepareCommercialPayment(
    context: AuthContext,
    input: PrepareCommercialPaymentInput,
  ): Promise<CommercialPaymentAttempt> {
    return this.repository.prepareCommercialPayment(context, input);
  }

  scheduleCommercialCancellation(
    context: AuthContext,
    input: ScheduleCommercialCancellationInput,
  ): Promise<CommercialSubscription> {
    return this.repository.scheduleCommercialCancellation(context, input);
  }
}
