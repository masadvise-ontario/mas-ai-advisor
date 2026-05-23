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
  // Terms & Conditions version accepted at consent time. Set by the web
  // chatbot surface (where the WP-side form gates the chat). Left null for
  // install-elsewhere adapters whose consent script predates the column.
  tc_version: z.string().nullish(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

// Body posted to /api/chat/session/start by the WordPress consent form.
export const chatSessionStartSchema = z.object({
  email: z.string().email().nullish(),
  share_history: z.boolean(),
  tc_accepted: z.boolean(),
  recaptcha_token: z.string().min(1),
});
export type ChatSessionStartBody = z.infer<typeof chatSessionStartSchema>;

// Body posted to /api/chat/turn by the chat UI.
export const chatTurnSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(60),
});
export type ChatTurnBody = z.infer<typeof chatTurnSchema>;

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

// Body posted to /api/chat/feedback by the chat UI when a visitor clicks
// a thumbs button or submits a comment. rating may be null when the user
// only typed a comment (matching the mas-vc-chatbot UX with three icons:
// thumbs-up / thumbs-down / comment-only). The CHECK constraint at the
// DB level requires rating OR comment to be non-null.
export const chatFeedbackSchema = z
  .object({
    assistant_message_index: z.number().int().nonnegative(),
    rating: z.enum(['up', 'down']).nullable().optional(),
    comment: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (data) => (data.rating ?? null) !== null || (data.comment ?? '').trim().length > 0,
    { message: 'rating or comment is required' },
  );
export type ChatFeedbackBody = z.infer<typeof chatFeedbackSchema>;
