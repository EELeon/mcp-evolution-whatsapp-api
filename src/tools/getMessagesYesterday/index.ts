import type { ToolRegistration } from "../../types";
import { makeJsonSchema } from "../../utils/makeJsonSchema";
import { webhookApi } from "../../utils/webhookApi";
import { type GetMessagesYesterdaySchema, getMessagesYesterdaySchema } from "./schema";

export const getMessagesYesterday = async (args: GetMessagesYesterdaySchema) => {
  const data = await webhookApi.getMessages("yesterday");
  return filterMessages(data, args);
};

function filterMessages(data: any, args: GetMessagesYesterdaySchema) {
  if (!data?.chats) return data;

  const filtered: Record<string, any> = {};
  for (const [jid, chat] of Object.entries(data.chats as Record<string, any>)) {
    if (args.excludeGroups && jid.includes("@g.us")) continue;

    if (args.excludeFromMe && chat.messages) {
      chat.messages = chat.messages.filter((m: any) => !m.from_me);
    }

    if (chat.messages && chat.messages.length === 0) continue;

    filtered[jid] = chat;
  }

  return { ...data, chats: filtered };
}

export const getMessagesYesterdayTool: ToolRegistration<GetMessagesYesterdaySchema> = {
  name: "get_messages_yesterday",
  description:
    "Get all WhatsApp messages from yesterday, grouped by chat. Returns contact name, messages with timestamps, content, and type. Use for checking messages from the previous day.",
  inputSchema: makeJsonSchema(getMessagesYesterdaySchema),
  handler: async (args: GetMessagesYesterdaySchema) => {
    try {
      const parsedArgs = getMessagesYesterdaySchema.parse(args);
      const result = await getMessagesYesterday(parsedArgs);

      const chatCount = result?.chats ? Object.keys(result.chats).length : 0;
      const resultJson = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Messages yesterday (${chatCount} chats):\n\n${resultJson}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error in getMessagesYesterdayTool handler:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
