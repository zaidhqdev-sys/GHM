export interface RuntimeDatabaseIdentity {
  session_user: string;
  current_user: string;
}

export const assertRuntimeDatabaseIdentity = (identity: RuntimeDatabaseIdentity): void => {
  if (identity.session_user !== 'ghm_runtime' || identity.current_user !== 'ghm_runtime') {
    throw new Error(
      `Runtime database identity mismatch: expected session_user=current_user=ghm_runtime; received session_user=${identity.session_user}, current_user=${identity.current_user}`,
    );
  }
};
