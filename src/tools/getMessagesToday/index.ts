import type { ToolRegistration } from "../../types";
import { makeJsonSchema } from "../../utils/makeJsonSchema";
import { webhookApi } from "../../utils/webhookApi";
import { type GetMessagesTodaySchema, getMessagesTodaySchema } from "./schema";

export const getMessagesToday = async (args: GetMessagesTodaySchema) => {
  const data = await webhookApi.getMessages("today");
  return filterMessages(data, args);
};

function filterMessages(data: any, args: GetMessagesTodaySchema) {
  if (!data?.chats) return data;

  const filtered: Record<string, any> = {};
  for (const [jid, chat] of Object.entries(data.chats as Record<string, any>)) {
    if (args.excludeGroups && jid.includes("@g.us")) continue;

    if (args.excludeFromMe && chat.messages) {
      chat.messages = chat.messages.filter((m: any) => !m.from_me);
    }

    // Skip chats with no messages after filtering
    if (chat.messages && chat.messages.length === 0) continue;

    filtered[jid] = chat;
  }

  return { ...data, chats: filtered };
}

export const getMessagesTodayTool: ToolRegistration<GetMessagesTodaySchema> = {
  name: "get_messages_today",
  description:
    "Get all WhatsApp messages received today, grouped by chat. Returns contact name, messages with timestamps, content, and type (text, audio with transcription, image, etc). Use this instead of find_chats for reading recent messages.",
  inputSchema: makeJsonSchema(getMessagesTodaySchema),
  handler: async (args: GetMessagesTodaySchema) => {
    try {
      const parsedArgs = getMessagesTodaySchema.parse(args);
      const result = await getMessagesToday(parsedArgs);

      const chatCount = result?.chats ? Object.keys(result.chats).length : 0;
      const resultJson = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Messages today (${chatCount} chats):\n\n${resultJson}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error in getMessagesTodayTool handler:", error);
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
