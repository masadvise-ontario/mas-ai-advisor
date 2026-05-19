import { z } from 'zod';

export const platformEnum = z.enum(['chatgpt', 'copilot', 'gemini', 'claude', 'web']);
export type Platform = z.infer<typeof platformEnum>;

export const registerBodySchema = z.object({
  install_id: z.string().uuid(),
  platform: platformEnum,
  email: z.string().email().nullish(),
  // Only meaningful for OAuth-protected adapters (MCP): set true to suppress
  // the OAuth email fallback when the user declined email use. For non-OAuth
  // adapters, omit this and just pass email=null.
  email_decline: z.boolean().optional(),
  share_history: z.boolean(),
  source: z.string().nullish(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const turnBodySchema = z.object({
  install_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  event_subtype: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type TurnBody = z.infer<typeof turnBodySchema>;

export const privacyActionEnum = z.enum(['pause', 'resume', 'forget']);
export type PrivacyAction = z.infer<typeof privacyActionEnum>;

export const privateBodySchema = z.object({
  install_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  action: privacyActionEnum,
});
export type PrivateBody = z.infer<typeof privateBodySchema>;
