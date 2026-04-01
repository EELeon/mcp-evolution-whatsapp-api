import * as z from "zod";

export const getMessagesYesterdaySchema = z.object({
  excludeGroups: z.boolean().optional().describe("Exclude group chats from results (default: false)"),
  excludeFromMe: z.boolean().optional().describe("Exclude messages sent by the owner (default: false)"),
});

export type GetMessagesYesterdaySchema = z.infer<typeof getMessagesYesterdaySchema>;
