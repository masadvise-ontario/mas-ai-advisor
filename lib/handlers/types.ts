export type RegisterInstallResult = { ok: true };

export type RecordTurnResult =
  | { ok: true; ignored?: false }
  | { ok: true; ignored: true; reason: 'no_share_history' };

export type SetConversationPrivacyResult =
  | { ok: true; action: 'forget'; deleted_count: number }
  | { ok: true; action: 'pause' | 'resume' };

export class UnknownInstallError extends Error {
  constructor(public install_id: string) {
    super(`unknown install_id: ${install_id}`);
    this.name = 'UnknownInstallError';
  }
}
