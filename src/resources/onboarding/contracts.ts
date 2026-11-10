import type { AuthContext } from '../../auth/authorization';

export type OnboardingStatus = 'pending' | 'completed' | 'dismissed';

export interface OnboardingProgress {
  readonly id: number;
  readonly accountId: number;
  readonly journeyId: string;
  readonly stepId: string;
  readonly status: OnboardingStatus;
  readonly firstStartedAt: Date;
  readonly completedAt: Date | null;
  readonly dismissedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OnboardingProgressRepository {
  getProgress(context: AuthContext, journeyId?: string | null): Promise<OnboardingProgress[]>;
  start(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress>;
  complete(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress>;
  dismiss(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress>;
}

export interface OnboardingProgressService extends OnboardingProgressRepository {}
