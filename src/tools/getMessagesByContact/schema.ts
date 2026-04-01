import * as z from "zod";

export const getMessagesByContactSchema = z.object({
  jid: z.string().optional().describe("WhatsApp JID (e.g., 50212345678@s.whatsapp.net). If provided, filters by exact JID match."),
  contactName: z.string().optional().describe("Contact name to search for (case-insensitive partial match). Used when JID is not known."),
  period: z.enum(["today", "yesterday"]).optional().describe("Time period to search (default: today)"),
  limit: z.number().optional().describe("Max number of messages to return per chat (default: all)"),
});

export type GetMessagesByContactSchema = z.infer<typeof getMessagesByContactSchema>;
