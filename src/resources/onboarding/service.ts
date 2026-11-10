import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type { OnboardingProgress, OnboardingProgressRepository, OnboardingProgressService } from './contracts';

const JOURNEY_PATTERN = /^[a-z][a-z0-9_]{2,79}_v[1-9][0-9]*$/;
const STEP_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

const validateIdentity = (journeyId: unknown, stepId?: unknown): { journeyId: string; stepId?: string } => {
  if (typeof journeyId !== 'string' || !JOURNEY_PATTERN.test(journeyId.trim())) {
    throw new Error('Invalid onboarding journey identifier');
  }
  if (stepId !== undefined && (typeof stepId !== 'string' || !STEP_PATTERN.test(stepId.trim()))) {
    throw new Error('Invalid onboarding step identifier');
  }
  return { journeyId: journeyId.trim(), ...(stepId === undefined ? {} : { stepId: (stepId as string).trim() }) };
};

export class DefaultOnboardingProgressService implements OnboardingProgressService {
  constructor(private readonly repository: OnboardingProgressRepository) {}

  async getProgress(context: AuthContext, journeyId?: string | null): Promise<OnboardingProgress[]> {
    requireAuthenticatedContext(context);
    if (journeyId !== undefined && journeyId !== null) validateIdentity(journeyId);
    return this.repository.getProgress(context, journeyId);
  }

  async start(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> {
    requireAuthenticatedContext(context);
    const identity = validateIdentity(journeyId, stepId);
    return this.repository.start(context, identity.journeyId, identity.stepId!);
  }

  async complete(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> {
    requireAuthenticatedContext(context);
    const identity = validateIdentity(journeyId, stepId);
    return this.repository.complete(context, identity.journeyId, identity.stepId!);
  }

  async dismiss(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> {
    requireAuthenticatedContext(context);
    const identity = validateIdentity(journeyId, stepId);
    return this.repository.dismiss(context, identity.journeyId, identity.stepId!);
  }
}
