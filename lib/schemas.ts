import { z } from 'zod';

export const platformEnum = z.enum(['chatgpt', 'copilot', 'gemini', 'claude']);
export type Platform = z.infer<typeof platformEnum>;

export const registerBodySchema = z.object({
  install_id: z.string().uuid(),
  platform: platformEnum,
  email: z.string().email().nullish(),
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

export const privateBodySchema = z.object({
  install_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
});
export type PrivateBody = z.infer<typeof privateBodySchema>;
