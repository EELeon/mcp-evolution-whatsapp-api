import * as z from "zod";

export const getMessagesTodaySchema = z.object({
  excludeGroups: z.boolean().optional().describe("Exclude group chats from results (default: false)"),
  excludeFromMe: z.boolean().optional().describe("Exclude messages sent by the owner (default: false)"),
});

export type GetMessagesTodaySchema = z.infer<typeof getMessagesTodaySchema>;
